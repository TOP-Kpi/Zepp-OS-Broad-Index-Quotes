// 一次性核对脚本：用真实的 app-side PE provider 跑通 6 个 ETF。
// 需要联网（乐咕接口），仅用于人工验证，不进 check 套件。
//
// 用法：node tools/diagnostics/verify-pe-sources.cjs
// 离线回归见 tests/pe-source-coverage.test.cjs；本脚本只回答"上游接口现在还通不通"
// 这种只有联网才能回答的问题（PE 数据源换口径时用它复测）。
//
// vm.SyntheticModule 需要 --experimental-vm-modules;未启用时自动带标志重启自身
// （缺了这段，直接跑必栽在 "vm.SyntheticModule is not a constructor"）。
if (!require('vm').SourceTextModule) {
  const { spawnSync } = require('child_process')
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
const https = require('https'), zlib = require('zlib'), fs = require('fs'), path = require('path'), vm = require('vm')

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

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'

function get(urlStr, headers) {
  return new Promise((resolve) => {
    const u = new URL(urlStr)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, headers: headers || {}, timeout: 20000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let buf = Buffer.concat(chunks)
        const enc = String(res.headers['content-encoding'] || '')
        try {
          if (enc.includes('gzip')) buf = zlib.gunzipSync(buf)
          else if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf)
          else if (enc.includes('deflate')) buf = zlib.inflateSync(buf)
        } catch (_) { }
        resolve({ status: res.statusCode, text: buf.toString('utf8'), headers: res.headers })
      })
    })
    req.on('error', (e) => resolve({ error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }) })
    req.end()
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const jar = {}
const cookieHeader = () => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ')

const transport = {
  async requestText(url, opts) {
    const r = await get(url, { ...((opts && opts.headers) || {}), 'Accept-Encoding': 'gzip, deflate, br', Cookie: cookieHeader() })
    for (const c of (r.headers && r.headers['set-cookie']) || []) {
      const kv = c.split(';')[0]; const i = kv.indexOf('=')
      if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1)
    }
    return r.text
  },
  async requestJson(url, opts) {
    const r = await get(url, { ...((opts && opts.headers) || {}), 'Accept-Encoding': 'gzip, deflate, br', Cookie: cookieHeader() })
    try { return JSON.parse(r.text) } catch (e) { throw new Error('non-JSON ' + r.status + ' len=' + (r.text || '').length) }
  },
  async cached(key, ttl, fn) { return fn() },
}

function synthetic(id, exports) {
  const names = Object.keys(exports)
  return new vm.SyntheticModule(names, function () { for (const n of names) this.setExport(n, exports[n]) }, { identifier: id })
}
const external = new Map([
  ['@zos/utils', synthetic('@zos/utils', { px: (v) => Math.round(Number(v || 0)) })],
  ['@zos/device', synthetic('@zos/device', { getDeviceInfo: () => ({ width: 390, height: 450 }) })],
  ['@zos/i18n', synthetic('@zos/i18n', { getText: (k) => k })],
  ['@zos/settings', synthetic('@zos/settings', { getLanguage: () => 0 })],
  ['@zos/storage', synthetic('@zos/storage', { localStorage: { getItem: (k, f) => f, setItem() {}, removeItem() {} } })],
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
    await mod.link(async (spec, ref) => {
      if (external.has(spec)) return external.get(spec)
      if (!spec.startsWith('.')) throw new Error('unexpected import ' + spec)
      const t = resolveSource(path.dirname(ref.identifier), spec)
      return getModule(t)
    })
  }
  if (mod.status === 'linked') await mod.evaluate()
  return mod
}

// 与 provider 内 validateFiveYearIndexPe 相同的门槛
function validate(rows) {
  if (rows.length < 24) throw new Error('PE月度历史不足 (' + rows.length + ')')
  const values = rows.map((p) => Number(p.pe)).filter((v) => Number.isFinite(v) && v > 0)
  if (values.length < 24) throw new Error('PE有效点不足')
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const latest = values[values.length - 1]
  const ratio = latest / median
  if (ratio > 8 || ratio < 0.125) throw new Error('PE口径异常 ratio=' + ratio.toFixed(2))
  return { n: rows.length, latest, median, ratio }
}

const ETFS = [
  ['510300', '沪深300'], ['510500', '中证500'], ['512100', '中证1000'],
  ['515180', '中证红利'], ['159915', '创业板指'], ['588000', '科创50'],
]

;(async () => {
  const legu = (await loadModule(path.join(root, 'app-side/providers/modules/valuation-legulegu.js'))).namespace
  const common = (await loadModule(path.join(root, 'app-side/providers/modules/common.js'))).namespace

  let ok = 0
  for (const [code, name] of ETFS) {
    const index = common.valuationIndexFor(code)
    const qualified = legu.leguleguIndexCode(index.indexCode)
    process.stdout.write(`${code} ${name.padEnd(8)} ${String(index.indexCode).padEnd(7)} ${(qualified || '(无映射)').padEnd(11)} `)
    if (!qualified) { console.log('FAIL 无 legulegu 映射'); continue }
    try {
      const rows = await legu.loadLeguleguIndexPeMonthly(transport, index)
      const r = validate(rows.slice(-60))
      console.log(`OK  ${r.n} 月  最新PE ${r.latest}  中位 ${r.median}  ratio ${r.ratio.toFixed(2)}`)
      ok += 1
    } catch (error) {
      console.log('FAIL ' + error.message)
    }
    await sleep(7000)
  }
  console.log()
  console.log(`${ok}/${ETFS.length} 可用`)
  process.exit(ok === ETFS.length ? 0 : 1)
})()
