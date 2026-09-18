// M1-M2 剪刀差的取值契约回归测试。
//
// 两件事分开钉：
//   1) utils/m1m2.js —— 两端共用的契约（剪刀差算法、快照校验、走势与纵轴范围）。
//      它被页面侧写、被快捷卡片读，任何一边放松校验都会让另一边的绘制层拿到
//      undefined，而绘制层的有限数兜底会把 undefined 画成 0 —— 那是"剪刀差为零"
//      这个有具体含义的读数，不是缺数据。
//   2) app-side/providers/modules/money-supply.js —— 数据源字段到指标的映射。
//      把 M1 与 M2 认错会得到一个符号相反、看上去仍然"合理"的剪刀差，所以这里
//      用真实抓取到的响应行把映射钉死。
//
// 运行：node --experimental-vm-modules tests/m1m2.test.cjs
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

function assert(condition, message) { if (!condition) throw new Error(message) }
function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
}
// 剪刀差是"一位小数的读数"，契约里就四舍五入到 1 位（显示的位数必须与存下来的值一致，
// 否则页面侧"内容没变就不写盘"的比较会因为浮点尾巴反复触发写入）。
// 4.1 - 7.5 在浮点下是 -3.4000000000000004，所以期望值也按同一规则取整。
function round1(value) { return Math.round(Number(value) * 10) / 10 }

// --- vm 加载器 -------------------------------------------------------------

function createLoader(externals) {
  const modules = new Map()
  async function loadModule(file) {
    file = path.resolve(file)
    if (modules.has(file)) return modules.get(file)
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file })
    modules.set(file, mod)
    await mod.link(async (specifier, referencingModule) => {
      if (externals.has(specifier)) return externals.get(specifier)
      // zosLoader 的 [pf] 由 zeus 在构建期替换；本测试的设备桩是方屏。
      if (specifier.startsWith('zosLoader:')) specifier = specifier.slice('zosLoader:'.length).replace('[pf]', 's')
      if (!specifier.startsWith('.')) throw new Error(`unexpected external import ${specifier}`)
      return loadModule(resolveSource(path.dirname(referencingModule.identifier), specifier))
    })
    await mod.evaluate()
    return mod
  }
  return loadModule
}

function synthetic(identifier, exports) {
  const names = Object.keys(exports)
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, exports[name]) }, { identifier })
}

// --- 1) utils/m1m2.js ------------------------------------------------------

function storageStub() {
  const values = new Map()
  return {
    localStorage: {
      getItem(key, fallback) { return values.has(key) ? values.get(key) : fallback },
      setItem(key, value) { values.set(key, value) },
      removeItem(key) { values.delete(key) },
    },
    // 测试用：绕过 setItem 直接塞进一段坏数据
    _raw(key, value) { values.set(key, value) },
  }
}

async function loadM1M2() {
  const storage = storageStub()
  const loadModule = createLoader(new Map([['@zos/storage', synthetic('@zos/storage', { localStorage: storage.localStorage })]]))
  const ns = (await loadModule(path.join(root, 'utils/m1m2.js'))).namespace
  return { m1m2: ns, storage }
}

;(async () => {
  const { m1m2, storage } = await loadM1M2()

  // 剪刀差 = M1 同比 - M2 同比
  assertEqual(m1m2.scissorsGap(4.1, 7.5), -3.4, 'gap must be M1 YoY minus M2 YoY')
  assertEqual(m1m2.scissorsGap(5.5, 3.2), 2.3, 'positive gap when M1 outruns M2')
  assertEqual(m1m2.scissorsGap('4.1', '7.5'), -3.4, 'string inputs must coerce')
  // 缺一侧必须是 null，不能退化成 0：0 是"剪刀差为零"这个具体读数。
  assertEqual(m1m2.scissorsGap(null, 7.5), null, 'missing M1 YoY must be null, not 0')
  assertEqual(m1m2.scissorsGap(4.1, undefined), null, 'missing M2 YoY must be null, not 0')
  assertEqual(m1m2.scissorsGap('--', 7.5), null, 'the source placeholder "--" must be treated as missing')

  assertEqual(m1m2.gapTone(1.2), 'up', 'positive gap tone')
  assertEqual(m1m2.gapTone(-0.1), 'down', 'negative gap tone')
  assertEqual(m1m2.gapTone(0), 'flat', 'zero gap tone')
  assertEqual(m1m2.gapTone(null), 'flat', 'missing gap tone')

  assertEqual(m1m2.formatGap(-3.4), '-3.4', 'negative gap keeps its sign')
  assertEqual(m1m2.formatGap(2), '+2.0', 'positive gap gets an explicit + sign')
  assertEqual(m1m2.formatGap(null), '--', 'missing gap renders as --')
  assertEqual(m1m2.formatPercent(4.1), '4.1%', 'percent formatting')
  assertEqual(m1m2.formatPercent(null), '--', 'missing percent renders as --')

  // 快照校验：缺损字段一律收敛成 null，不能让 undefined 漏到绘制层。
  assertEqual(m1m2.normalizeSnapshot(null), null, 'null snapshot')
  assertEqual(m1m2.normalizeSnapshot('nope'), null, 'non-object snapshot')
  const partial = m1m2.normalizeSnapshot({ m1Yoy: 4.1, m2Yoy: 7.5 })
  assertEqual(partial.gap, -3.4, 'gap is derived on normalize')
  assert(partial.m1 === null && partial.m0 === null, 'absent fields must normalize to null')
  assert(partial.m1Yoy === 4.1, 'present fields survive normalization')
  assert(!('undefined' === String(partial.m1)), 'never stringify to undefined')

  // 走势点：没有月份的丢弃；按月份排序（走势图从左到右连点，乱序会画成来回跳的折线）；
  // 点数截到上限；月份缺失时回落到最后一个点。
  const messy = m1m2.normalizeSnapshot({
    m1Yoy: 4.1, m2Yoy: 7.5,
    points: [
      { month: '2026-01', m1Yoy: 1, m2Yoy: 2 },
      { m1Yoy: 3, m2Yoy: 4 },                 // 无月份 → 丢弃
      { month: 'bad', m1Yoy: 3, m2Yoy: 4 },   // 月份不可解析 → 丢弃
      { month: '2026-03', m1Yoy: null, m2Yoy: 4 },
      { month: '2026-02', m1Yoy: 3, m2Yoy: 4 },
    ],
  })
  assertEqual(messy.points.length, 3, 'points without a parseable month are dropped')
  assertEqual(messy.points[0].month, '2026-01', 'points are sorted oldest first (1st)')
  assertEqual(messy.points[1].month, '2026-02', 'points are sorted oldest first (2nd)')
  assertEqual(messy.points[2].month, '2026-03', 'points are sorted oldest first (3rd)')
  assertEqual(messy.points[1].gap, -1, 'gap is derived per point')
  assertEqual(messy.points[2].gap, null, 'a point missing a side keeps a null gap')
  assertEqual(messy.month, '2026-03', 'month falls back to the newest point when absent')

  const many = m1m2.normalizeSnapshot({
    m1Yoy: 1, m2Yoy: 2,
    points: Array.from({ length: 30 }, (_, index) => ({ month: `2025-${String((index % 12) + 1).padStart(2, '0')}`, m1Yoy: 1, m2Yoy: 2 })),
  })
  assertEqual(many.points.length, m1m2.M1M2_TREND_MONTHS, 'points are capped at the trend window')

  // 读写在两端之间传递，必须能往返。
  assertEqual(m1m2.readSnapshot(), null, 'no snapshot yet')
  assert(m1m2.writeSnapshot({ month: '2026-08', m1Yoy: 4.1, m2Yoy: 7.5, points: [] }), 'write must succeed')
  const roundTrip = m1m2.readSnapshot()
  assert(roundTrip && roundTrip.month === '2026-08' && roundTrip.gap === -3.4, 'snapshot round-trips')
  storage._raw(m1m2.M1M2_STORAGE_KEY, '{not json')
  assertEqual(m1m2.readSnapshot(), null, 'corrupt snapshot must not throw, just read as absent')

  // 走势序列：只留有 gap 的点；缺失月份表现为断点而不是插值。
  const series = m1m2.trendSeries({ points: [
    { month: '2026-01', gap: -1 },
    { month: '2026-02', gap: null },
    { month: '2026-03', gap: -3 },
  ] }, 13)
  assertEqual(series.length, 2, 'points without a gap are excluded from the trend')
  assertEqual(series[1].gap, -3, 'remaining points keep their order')
  assertEqual(m1m2.trendSeries({ points: [] }, 13).length, 0, 'empty trend')

  // 纵轴范围必须包含 0（零轴是剪刀差的关键参考线），且全平序列也要有最小跨度。
  const bounds = m1m2.gapBounds([{ gap: -1 }, { gap: -3 }])
  assert(bounds.min < 0 && bounds.max > 0, `bounds must include zero (got ${bounds.min}..${bounds.max})`)
  const flat = m1m2.gapBounds([{ gap: -2 }, { gap: -2 }])
  assert(flat.max - flat.min >= 1, `a flat series still needs a minimum span (got ${flat.max - flat.min})`)
  assert(flat.min < 0 && flat.max > 0, 'flat bounds still include zero')
  const empty = m1m2.gapBounds([])
  assert(empty.min < 0 && empty.max > 0, 'empty series falls back to a zero-centred range')

  // --- 2) app-side 数据源映射 ---------------------------------------------

  // 真实抓取到的响应行（东方财富 RPT_ECONOMY_CURRENCY_SUPPLY，抓取于 2026-09-17）。
  // 字段含义由该页面自身的脚本确认：BASIC_CURRENCY=货币和准货币(M2)、CURRENCY=货币(M1)、
  // FREE_CASH=流通中的现金(M0)，_SAME=同比增长(%)、_SEQUENTIAL=环比增长。
  const FIXTURE = [
    { REPORT_DATE: '2026-08-01 00:00:00', TIME: '2026年08月份', BASIC_CURRENCY: 3568083.6, BASIC_CURRENCY_SAME: 7.5, BASIC_CURRENCY_SEQUENTIAL: 0.36585309, CURRENCY: 1157741.43, CURRENCY_SAME: 4.1, CURRENCY_SEQUENTIAL: 0.2700821, FREE_CASH: 148311.98, FREE_CASH_SAME: 11.2 },
    { REPORT_DATE: '2026-07-01 00:00:00', TIME: '2026年07月份', BASIC_CURRENCY: 3555077.24, BASIC_CURRENCY_SAME: 7.7, BASIC_CURRENCY_SEQUENTIAL: -0.3372906, CURRENCY: 1154623, CURRENCY_SAME: 4, CURRENCY_SEQUENTIAL: -2.5457943, FREE_CASH: 148202.86, FREE_CASH_SAME: 11.6 },
    { REPORT_DATE: '2026-06-01 00:00:00', TIME: '2026年06月份', BASIC_CURRENCY: 3567108.43, BASIC_CURRENCY_SAME: 8, BASIC_CURRENCY_SEQUENTIAL: 0.8600779, CURRENCY: 1184775.53, CURRENCY_SAME: 4, CURRENCY_SEQUENTIAL: 3.1227053, FREE_CASH: 147364.79, FREE_CASH_SAME: 11.8 },
  ]

  let requestedUrl = ''
  const transport = {
    async cached(_key, _ttl, loader) { return loader() },
    async requestJson(targetUrl) {
      requestedUrl = targetUrl
      return { success: true, result: { count: 224, data: FIXTURE } }
    },
  }
  const loadProvider = createLoader(new Map())
  const providerNs = (await loadProvider(path.join(root, 'app-side/providers/modules/money-supply.js'))).namespace
  const provider = providerNs.createMoneySupplyProvider(transport)
  const result = await provider.moneySupply(13)

  // 请求本身：报表名与列清单都要对，列名写错会让对应字段静默变成 undefined。
  assert(requestedUrl.includes('reportName=RPT_ECONOMY_CURRENCY_SUPPLY'),
    `unexpected report in request: ${requestedUrl}`)
  for (const column of ['BASIC_CURRENCY', 'BASIC_CURRENCY_SAME', 'CURRENCY', 'CURRENCY_SAME', 'FREE_CASH', 'FREE_CASH_SAME']) {
    assert(requestedUrl.includes(column), `request columns must include ${column}`)
  }

  // 指标映射：拿原始行现算，而不是抄实现里的常量——把 M1/M2 认错时这里会失败。
  const newest = FIXTURE[0]
  assertEqual(result.m2, newest.BASIC_CURRENCY, 'M2 is BASIC_CURRENCY (货币和准货币)')
  assertEqual(result.m1, newest.CURRENCY, 'M1 is CURRENCY (货币)')
  assertEqual(result.m0, newest.FREE_CASH, 'M0 is FREE_CASH (流通中的现金)')
  assertEqual(result.m2Yoy, newest.BASIC_CURRENCY_SAME, 'M2 YoY is BASIC_CURRENCY_SAME')
  assertEqual(result.m1Yoy, newest.CURRENCY_SAME, 'M1 YoY is CURRENCY_SAME')
  assertEqual(result.gap, round1(newest.CURRENCY_SAME - newest.BASIC_CURRENCY_SAME),
    'gap must be M1 YoY minus M2 YoY (a swapped mapping would flip the sign)')
  assertEqual(result.gap, -3.4, 'latest gap from the captured fixture')

  // 量级自洽：M0 < M1 < M2。映射错了这里也会响。
  assert(result.m0 < result.m1 && result.m1 < result.m2,
    'money aggregates must satisfy M0 < M1 < M2')

  assertEqual(result.month, '2026-08', 'latest month key')
  assertEqual(result.monthText, '2026年08月份', 'the source month label is kept for display')
  assertEqual(result.points.length, 3, 'all fixture months become trend points')
  assertEqual(result.points[0].month, '2026-06', 'trend points are oldest first')
  assertEqual(result.points[2].month, '2026-08', 'trend points end at the latest month')
  assertEqual(result.points[0].gap, 4 - 8, 'oldest point gap')
  assert(result.updatedAt && result.source, 'result carries source and timestamp')

  // 异常输入：空结果与缺同比都要报错，不能返回一个"全是 null"的快照让卡片显示 --。
  const emptyProvider = providerNs.createMoneySupplyProvider({
    async cached(_key, _ttl, loader) { return loader() },
    async requestJson() { return { success: true, result: { count: 0, data: [] } } },
  })
  await emptyProvider.moneySupply(13).then(
    () => { throw new Error('empty payload must reject') },
    (error) => assert(/空/.test(error.message), `empty payload error message (got ${error.message})`))

  const noYoyProvider = providerNs.createMoneySupplyProvider({
    async cached(_key, _ttl, loader) { return loader() },
    async requestJson() {
      return { success: true, result: { data: [{ REPORT_DATE: '2026-08-01 00:00:00', TIME: '2026年08月份', BASIC_CURRENCY: 1, CURRENCY: 2, FREE_CASH: 3 }] } }
    },
  })
  await noYoyProvider.moneySupply(13).then(
    () => { throw new Error('missing YoY fields must reject') },
    (error) => assert(/同比/.test(error.message), `missing YoY error message (got ${error.message})`))

  console.log('m1m2=PASS (contract + source mapping)')
})().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exit(1)
})
