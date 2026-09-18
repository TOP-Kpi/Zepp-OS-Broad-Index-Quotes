// 详情页生命周期回归测试。
//
// 症状来源：用户在详情页 1 -> 2 -> 1 来回翻页后，返回的页面是空的；PE 历史
// 与资金流显示"不可用"；详情页进入需要等待。排查后是三个独立原因，本测试
// 分别钉住：
//
//  1) 常驻场景窗口只有 2 个时，1 -> 2 会把场景 1 销毁（窗口变成 [2,3]），
//     返回 1 只能从零重建。窗口必须包含中心两侧，单向反转才不需要重建。
//  2) 只有第 0/1 页做了 cacheOnly 预热，资金流/份额/融资/PE 四页从未预热，
//     所以缓存命中也要等网络。
//  3) onDestroy 把全部分时/K线/PE/资金流数组清空，再次进入同一标的时
//     onInit 虽保留 state，但保留的已是空数组，因此不"秒出"。
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
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
function assert(cond, msg) { if (!cond) throw new Error(msg) }

// --- 1) 场景窗口：单向反转不得销毁刚离开的页面 ---------------------------

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
  // service 模块经 utils/navigation 间接拉进场景与分页容器实现；这里只求
  // import 图能求值，不创建任何控件（本测试不渲染）。
  ['@zos/ui', synthetic('@zos/ui', {
    createWidget: () => ({ addEventListener() {}, setProperty() {}, setText() {} }),
    deleteWidget() {},
    setStatusBarVisible() {},
    prop: { MORE: 'more' },
    widget: { CANVAS: 'canvas', VIEW_CONTAINER: 'view-container' },
    event: { CLICK_DOWN: 'down', MOVE: 'move', CLICK_UP: 'up' },
  })],
  ['@zos/page', synthetic('@zos/page', { SCROLL_MODE_SWIPER: 1, setScrollMode() {} })],
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

;(async () => {
  const windowNs = (await loadModule(path.join(root, 'utils/navigation/window.js'))).namespace
  const sectionPageWindow = windowNs.sectionPageWindow
  assert(typeof sectionPageWindow === 'function', 'sectionPageWindow must be exported')
  assert(windowNs.RESIDENT_SCENE_LIMIT >= 3,
    'the resident window must cover both neighbours, otherwise a one-step reversal destroys the page just left')

  // 核心场景：详情页 6 屏，用户 1 -> 2 -> 1。
  const atOne = sectionPageWindow(6, 1, 1)
  assert(atOne.indexOf(1) >= 0, 'page 1 must be resident while it is the current page')
  assert(atOne.indexOf(2) >= 0, 'the next page should be warm before the user swipes to it')
  // 停在 2 时不能再销毁 1
  const atTwo = sectionPageWindow(6, 2, 1)
  assert(atTwo.indexOf(1) >= 0,
    'page 1 must stay resident while page 2 is current, or returning to 1 rebuilds an empty scene')
  // 返回 1
  const backToOne = sectionPageWindow(6, 1, -1)
  assert(backToOne.indexOf(1) >= 0, 'returning to page 1 must find it inside the window')

  // 全量不变量：任何页数/位置/方向上，窗口都必须含中心、在界内、不重复。
  for (let total = 1; total <= 8; total += 1) {
    for (let center = 0; center < total; center += 1) {
      for (const direction of [-1, 0, 1]) {
        const win = sectionPageWindow(total, center, direction)
        const label = `total=${total} center=${center} dir=${direction}`
        assert(win.indexOf(center) >= 0, `${label}: window must contain the current page`)
        for (const index of win) {
          assert(index >= 0 && index < total, `${label}: index ${index} out of range`)
        }
        assert(new Set(win).size === win.length, `${label}: duplicate indices`)
        assert(win.length <= Math.max(1, Math.min(total, windowNs.RESIDENT_SCENE_LIMIT)),
          `${label}: window must stay within the resident limit`)
      }
    }
  }

  // --- 2) 六个详情页都要有 cacheOnly 预热 -------------------------------

  const detailPage = read('page/detail/index.page.js')
  // 从调用点切片，而不是 import 行（import 里也有同名标识符，会让切片为空）。
  const hydrationStart = detailPage.indexOf('deferCacheHydration(this')
  const hydrationEnd = detailPage.indexOf('deferInitialLoad(this')
  assert(hydrationStart >= 0 && hydrationEnd > hydrationStart, 'cache hydration block not found')
  const hydration = detailPage.slice(hydrationStart, hydrationEnd)
  for (const loader of ['loadOverview', 'loadChart', 'loadFlow', 'loadShares', 'loadMargin', 'loadValuation']) {
    assert(hydration.indexOf(loader) >= 0,
      `${loader} must be warmed from cache at build time, otherwise its page shows an empty chart until the network answers`)
  }
  const cachedCalls = (hydration.match(/cacheOnly: true/g) || []).length
  assert(cachedCalls >= 6, `expected all six detail loaders to warm from cache, found ${cachedCalls}`)
  // 预热必须是纯缓存的（cacheOnly），不能在这里发网络请求拖慢首屏。
  assert(!/cacheOnly: false/.test(hydration), 'cache hydration must not issue network requests')

  // 四个非 chart 的 loader 必须接受并透传 requestOptions.cacheOnly。
  // 选项拼装已收敛到 utils/data.js 的 requestOptions()，所以钉两件事：
  // ①loader 走共享 helper（不再各自拼 { forceNetwork, cacheOnly }）；
  // ②helper 本身真的转发 cacheOnly——否则六个预热调用会静默变成网络请求。
  const dataSource = read('utils/data.js')
  const helperStart = dataSource.indexOf('export function requestOptions')
  assert(helperStart >= 0, 'utils/data.js must export requestOptions (the single options builder)')
  const helperBody = dataSource.slice(helperStart, dataSource.indexOf('\n}', helperStart))
  assert(/cacheOnly:\s*source\.cacheOnly === true/.test(helperBody),
    'utils/data.js requestOptions must forward cacheOnly to requestWithCache')
  for (const name of ['flow', 'shares', 'margin', 'valuation']) {
    const source = read(`page/detail/services/${name}.js`)
    assert(/import \{ requestOptions, requestWithCache \}/.test(source),
      `services/${name}.js must build request options through the shared requestOptions() helper`)
    assert(/requestOptions\(forceNetwork, options\)/.test(source),
      `services/${name}.js must accept requestOptions and forward them`)
  }

  // 行为面：cacheOnly 必须真的传到 requestWithCache。无本地缓存时应当一次
  // request() 都不发——否则"纯缓存预热"会退化成首屏发网络请求。
  const flowNs = (await loadModule(path.join(root, 'page/detail/services/flow.js'))).namespace
  let networkCalls = 0
  const hydrationPage = {
    state: { runtimeAlive: true, runtimeGeneration: 1, code: '510300', flow: {} },
    request() { networkCalls += 1; return Promise.resolve({ data: {} }) },
  }
  await flowNs.loadFlow(hydrationPage, false, { cacheOnly: true })
  assert(networkCalls === 0,
    'loadFlow(page, false, { cacheOnly: true }) opened a network request; cacheOnly is no longer forwarded')

  // --- 3) 释放策略：保留小序列，只放掉最重的图表 ------------------------

  const modelNs = (await loadModule(path.join(root, 'page/detail/model.js'))).namespace
  assert(typeof modelNs.releaseDetailStateData === 'function', 'releaseDetailStateData must be exported')

  const state = {
    chart: {
      points: [{ a: 1 }], intradayPoints: [{ a: 1 }], dayPoints: [{ a: 1 }],
      intradayPrepared: { big: true }, dayPrepared: { big: true },
      intradayStamp: 'x', dayStamp: 'y', loading: false,
    },
    flow: { bars: [{ a: 1 }] },
    shares: { values: [1], closes: [2], dates: ['d'] },
    margin: { bars: [{ a: 1 }] },
    valuation: { values: [1], indexValues: [2], dates: ['d'] },
  }
  modelNs.releaseDetailStateData(state)

  // 图表：最重，释放。
  assert(state.chart.points.length === 0, 'chart points must be released (largest series)')
  assert(state.chart.intradayPoints.length === 0, 'intraday points must be released')
  assert(state.chart.dayPoints.length === 0, 'daily points must be released')
  assert(state.chart.intradayPrepared === null && state.chart.dayPrepared === null,
    'prepared chart derivatives must be released')
  assert(state.chart.loading === true, 'a released chart must report loading, not "no data"')

  // 小序列：保留，这样再次进入时 PE/资金流/份额/融资直接有图。
  assert(state.valuation.values.length === 1,
    'valuation (PE) must be retained so the PE page renders instantly on re-entry')
  assert(state.flow.bars.length === 1, 'flow bars must be retained so the flow chart renders instantly')
  assert(state.shares.values.length === 1, 'share series must be retained')
  assert(state.margin.bars.length === 1, 'margin series must be retained')

  // 空输入不得抛错。
  modelNs.releaseDetailStateData(null)
  modelNs.releaseDetailStateData({})

  // --- 4) 首屏时序：图表预取要早于用户滑到第 2 页 ------------------------

  const prefetch = detailPage.slice(detailPage.indexOf('deferChartPrefetch'))
  const prefetchDelay = /}, (\d+)\)/.exec(prefetch)
  assert(prefetchDelay, 'deferChartPrefetch delay must be a literal number')
  assert(Number(prefetchDelay[1]) <= 1500,
    `chart prefetch delay ${prefetchDelay[1]}ms is too late; the chart page can be reached first`)
  // 空闲守卫必须保留——这是防卡顿的关键，不能为了变快而移除。
  assert(prefetch.indexOf('isInteractionIdle') >= 0,
    'chart prefetch must keep its interaction-idle guard')

  const initialLoadDelay = /deferInitialLoad\(this, function \(\) \{ return loadOverview\(self, false\) \}, (\d+)\)/.exec(detailPage)
  assert(initialLoadDelay, 'deferInitialLoad delay must be a literal number')
  assert(Number(initialLoadDelay[1]) <= 260,
    `initial load delay ${initialLoadDelay[1]}ms delays the first useful frame`)

  console.log('detail_lifecycle=PASS')
})().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exit(1)
})
