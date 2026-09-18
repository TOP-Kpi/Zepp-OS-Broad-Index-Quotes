// 临时冒烟：market 瘦身体积对比 + request-router dashboard 契约。
//
// 这是**人工诊断工具**，不进 check 套件、不参与 CI；它加载的是真实设备端源码，
// 用来在改载荷结构时量一次"瘦身后差多少字节"并确认 dashboard 是否顺带返回
// signal/portfolio。留下它是为了当下次改动需要同样的探测时有模板可抄。
//
// 用法：node tools/diagnostics/smoke-dashboard.cjs
// vm.SourceTextModule 需要 --experimental-vm-modules;未启用时自动带标志重启自身
if (!require('vm').SourceTextModule) {
  const { spawnSync } = require('child_process')
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')

// 设备端源码是 .js（zeus/rollup 的解析器不认 TS 语法，也不能构建 .ts 入口）。
// 这里仍按 字面路径 -> .ts -> .js 的顺序探测：若日后有文件改用 .ts 且构建链
// 支持，测试无需再改。
function resolveSource(fromDir, specifier) {
  const base = path.resolve(fromDir, specifier)
  if (path.extname(base)) return base
  for (const ext of ['.ts', '.js']) {
    if (fs.existsSync(base + ext)) return base + ext
  }
  return base + '.ts'
}

const vm = require('vm')
// 缓存整个加载 Promise:菱形依赖下同一模块的 link 只会进行一次,
// 直接缓存 Module 会在链接进行中被复用并报 ERR_VM_MODULE_LINK_FAILURE
const cache = new Map()
const stubs = new Map()
function stubModule(specifier) {
  if (stubs.has(specifier)) return stubs.get(specifier)
  const body = specifier === '@zeppos/zml/base-side'
    ? 'export const settingsLib = { getItem(){return null}, setItem(){}, removeItem(){} }'
    : 'export default {}'
  const mod = new vm.SourceTextModule(body, { identifier: 'stub:' + specifier })
  stubs.set(specifier, mod)
  return mod
}
async function loadModule(file) {
  file = path.resolve(file)
  if (!cache.has(file)) {
    cache.set(file, (async () => {
      const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file })
      await mod.link(async (s, r) => {
        try {
          if (!s.startsWith('.')) return stubModule(s)
          const t = resolveSource(path.dirname(r.identifier), s)
          return await loadModule(t)
        } catch (e) { console.error('link fail:', s, 'from', r.identifier, e.message); throw e }
      })
      await mod.evaluate()
      return mod
    })())
  }
  return cache.get(file)
}
;(async () => {
  // 演示数据用真实清单的 6 只；不要带回已下线的标的（510180 / 159516 等），
  // 那会让人以为清单还是 8 只。
  const codes = ['510300', '510500', '512100', '515180', '159915', '588000']
  const universe = codes.map((code, i) => ({
    code, name: code + 'ETF', shortName: 'S' + code,
    quote: { price: 4, changePct: i % 2 ? 0.8 : -0.4, updatedAt: '2026-09-07 10:00' },
    signal: { action: 'HOLD', score: 55 + i, updatedAt: '2026-09-07 10:00' },
  }))
  const market = (await loadModule(path.join(root, 'app-side/domain/market.js'))).namespace
  const m = market.summarizeMarket(universe)
  const oldStyle = universe.map(u => ({ code: u.code, name: u.name, shortName: u.shortName, score: u.signal.score, action: u.signal.action, actionLabel: '观察', changePct: u.quote.changePct, signal: u.signal }))
  console.log('items[0] keys:', Object.keys(m.items[0]).join(','))
  console.log('slim items bytes:', JSON.stringify(m.items).length, '← 旧结构:', JSON.stringify(oldStyle).length)
  console.log('temperature:', m.temperature, 'breadth:', JSON.stringify(m.breadth), 'updatedAt:', m.updatedAt)

  const router = (await loadModule(path.join(root, 'app-side/domain/request-router.js'))).namespace
  const noPeek = { provider: { universe: async () => universe, peekOverview: () => null } }
  const r1 = await router.routeRequest(noPeek, { method: 'dashboard', params: {} })
  console.log('dashboard: signal included =', !!r1.signal, '| portfolio =', !!r1.portfolio)
  const withPeek = { provider: { universe: async () => universe, peekOverview: () => ({ quote: { price: 4.1, changePct: 0.8, previousClose: 4.06 }, valuation: { pe: 12.4, pePercentile: 30 }, trend: {}, flow: {}, shares: {}, margin: {} }) } }
  const r2 = await router.routeRequest(withPeek, { method: 'dashboard', params: {} })
  console.log('dashboard with peek: signal included =', !!r2.signal, '| action =', r2.signal && r2.signal.action)
  process.exit(0)
})().catch((e) => { console.error('SMOKE FAIL:', e); process.exit(1) })
