// 分时图午间断线回归测试。
//
// 压缩时间轴把 09:30..11:30 映射到 slot 0..120、13:00..15:00 映射到 slot
// 121..241，因此 11:30 与 13:00 在轴上是相邻槽位，中间没有可表示的空隙。
// 但两个交易时段各自独立插值时，若下午首个真实样本不是 13:00 整，slot 121
// 既没有样本也不会被填充，保留为 null；而 drawSingleLineAt 遇到 null 会
// 断开折线 —— 表现就是价格线在 11:30 与 13:00 之间断开。
//
// 本测试用真实的 page/detail/model.js 覆盖各种缺口场景，断言：
//   只要下午有数据，slot 120 与 121 都必须有值，且 120 之后无 null 缺口。
const fs = require('fs')
const path = require('path')

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

const root = path.resolve(__dirname, '..')

function synthetic(identifier, exports) {
  const names = Object.keys(exports)
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, exports[name])
  }, { identifier })
}

const external = new Map([
  ['@zos/utils', synthetic('@zos/utils', { px: (value) => Math.round(Number(value || 0)) })],
  ['@zos/device', synthetic('@zos/device', { getDeviceInfo: () => ({ width: 390, height: 450 }) })],
  ['@zos/i18n', synthetic('@zos/i18n', { getText: (key) => key })],
  ['@zos/settings', synthetic('@zos/settings', { getLanguage: () => 0 })],
  ['@zos/storage', synthetic('@zos/storage', {
    localStorage: { getItem: (key, fallback) => fallback, setItem() {}, removeItem() {} },
  })],
])

const modules = new Map()
function getModule(file) {
  file = path.resolve(file)
  if (modules.has(file)) return modules.get(file)
  const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file })
  modules.set(file, mod)
  return mod
}

async function loadModule(file) {
  const mod = getModule(file)
  if (mod.status === 'unlinked') {
    await mod.link(async (specifier, referencingModule) => {
      if (external.has(specifier)) return external.get(specifier)
      // zosLoader 的 [pf] 由 zeus 在构建期替换；设备桩是方屏，故固定取 s 那份样式表。
      if (specifier.startsWith('zosLoader:')) specifier = specifier.slice('zosLoader:'.length).replace('[pf]', 's')
      if (!specifier.startsWith('.')) throw new Error(`unexpected import ${specifier}`)
      return getModule(resolveSource(path.dirname(referencingModule.identifier), specifier))
    })
  }
  if (mod.status === 'linked') await mod.evaluate()
  return mod
}

function assert(cond, msg) { if (!cond) throw new Error(msg) }

const pad = (n) => String(n).padStart(2, '0')
const minuteOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(2))

function fullSession() {
  const rows = []
  for (let m = 570; m <= 690; m += 1) rows.push({ time: pad(Math.floor(m / 60)) + pad(m % 60), c: 4 + m * 0.0001 })
  for (let m = 780; m <= 900; m += 1) rows.push({ time: pad(Math.floor(m / 60)) + pad(m % 60), c: 4 + m * 0.0001 })
  return rows
}

;(async () => {
  const ns = (await loadModule(path.join(root, 'page/detail/model.js'))).namespace
  assert(typeof ns.prepareIntradaySeries === 'function', 'prepareIntradaySeries must be exported')

  const all = fullSession()
  const cases = [
    ['full session', all],
    ['no 11:30 sample', all.filter((r) => r.time !== '1130')],
    ['no 13:00 sample', all.filter((r) => r.time !== '1300')],
    ['no 11:30 and no 13:00', all.filter((r) => r.time !== '1130' && r.time !== '1300')],
    ['afternoon starts 13:05', all.filter((r) => r.time <= '1130' || minuteOf(r.time) >= 785)],
    ['afternoon starts 13:30', all.filter((r) => r.time <= '1130' || minuteOf(r.time) >= 810)],
    ['sparse 5-min samples', all.filter((r) => minuteOf(r.time) % 5 === 0)],
  ]

  for (const [label, rows] of cases) {
    const prepared = ns.prepareIntradaySeries(rows)
    const prices = prepared.prices
    const hasAfternoon = rows.some((r) => minuteOf(r.time) >= 780)

    assert(prices.length === 242, `${label}: expected 242 slots, got ${prices.length}`)

    if (hasAfternoon) {
      assert(prices[120] !== null && prices[120] !== undefined,
        `${label}: slot 120 (11:30) must be filled so the line reaches the lunch boundary`)
      assert(prices[121] !== null && prices[121] !== undefined,
        `${label}: slot 121 (13:00) must be filled or the price line breaks at the lunch boundary`)
      for (let index = 120; index <= 241; index += 1) {
        assert(prices[index] !== null && prices[index] !== undefined,
          `${label}: gap at slot ${index} would break the line`)
      }
    }
  }

  // 盘中只有上午数据时，不应凭空造出下午的值。
  const morningOnly = ns.prepareIntradaySeries(all.filter((r) => r.time <= '1130'))
  assert(morningOnly.prices[121] === null,
    'morning-only session must not invent an afternoon value')

  // 桥接必须平滑：13:00 的值应落在上午收盘价与下午首个样本之间。
  // 13:30 在压缩轴上对应 slot 151（= 121 + (810 - 780)）。
  const gapped = ns.prepareIntradaySeries(all.filter((r) => r.time <= '1130' || minuteOf(r.time) >= 810))
  const morning = ns.prepareIntradaySeries(all.filter((r) => r.time <= '1130'))
  const lastMorning = morning.prices[120]
  const firstAfternoonSlot = 121 + (810 - 780)
  const firstAfternoon = gapped.prices[firstAfternoonSlot]
  const bridge = gapped.prices[121]
  assert(firstAfternoon !== null && firstAfternoon !== undefined,
    `slot ${firstAfternoonSlot} (first afternoon sample) must carry a value`)
  const lo = Math.min(lastMorning, firstAfternoon)
  const hi = Math.max(lastMorning, firstAfternoon)
  assert(bridge >= lo - 1e-6 && bridge <= hi + 1e-6,
    `bridge value ${bridge} must lie between the morning close ${lastMorning} and the first afternoon sample ${firstAfternoon}`)

  // 平均值序列同样不能有午间缺口。
  for (const [label, rows] of cases) {
    const prepared = ns.prepareIntradaySeries(rows)
    if (!rows.some((r) => minuteOf(r.time) >= 780)) continue
    assert(prepared.averages[120] !== null && prepared.averages[121] !== null,
      `${label}: average line also breaks at the lunch boundary`)
  }

  console.log('intraday_lunch_bridge=PASS')
})().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exit(1)
})
