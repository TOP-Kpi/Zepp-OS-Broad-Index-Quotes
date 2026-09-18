const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))
function assert(cond, msg) { if (!cond) throw new Error(msg) }

// 版本号断言只在 production-static.test.cjs 一处维护（app.json / package.json /
// 那条测试）。这里原本抄了一份，发版时要改两个测试，删掉。

const charts = read('utils/ui/charts.js')
const facade = read('utils/ui/index.js')
const valuationView = read('page/detail/views/valuation.js')
const sharesView = read('page/detail/views/shares.js')
const valuationProvider = read('app-side/providers/modules/valuation.js')
const sharesService = read('page/detail/services/shares.js')
const storage = read('utils/storage.js')
const detailPage = read('page/detail/index.page.js')
const detailCommon = read('page/detail/views/common.js')

assert(charts.includes('export function drawDualAxisAreaChartAt'), 'dual-axis area chart renderer missing')
assert(charts.includes('export function drawDottedHorizontalAt'), 'dotted gridline renderer missing')
assert(charts.includes('export function drawDashedHorizontalAt'), 'danger/opportunity dashed line renderer missing')
assert(facade.includes('drawDualAxisAreaChartAt'), 'dual-axis area chart not exported by canvas facade')
assert(facade.includes('drawDottedHorizontalAt'), 'dotted gridline not exported by canvas facade')

assert(valuationView.includes("t('当前PE')"), 'valuation current PE summary missing')
assert(valuationView.includes('drawHalfGauge'), 'valuation percentile gauge missing')
assert(valuationView.includes("t('危险')"), 'valuation danger threshold missing')
assert(valuationView.includes("t('机会')"), 'valuation opportunity threshold missing')
assert(valuationView.includes('drawAreaLineChartAt'), 'valuation view is not using mono-warm area chart')
assert(valuationView.includes('drawDashedHorizontalAt'), 'valuation view lost danger/opportunity lines')
assert(!valuationView.includes('drawValuationHistoryChartAt'), 'stale valuation chart renderer still referenced')

assert(sharesView.includes('份额变动'), 'share trend title missing')
assert(sharesView.includes('基金份额(亿份)'), 'share left-axis legend missing')
assert(sharesView.includes('收盘价(元)'), 'share right-axis legend missing')
assert(sharesView.includes('drawDualAxisAreaChartAt'), 'share view is not using area dual-axis chart')

assert(valuationProvider.includes('klt: 103'), 'index monthly kline request missing')
assert(valuationProvider.includes('.slice(-60)'), 'valuation 60-point bound missing')
assert(valuationProvider.includes('valuation5y:v4:'), 'valuation side cache version not bumped')
assert(sharesService.includes('values.length < 96'), 'share 96-point device bound missing')

// chart 点数上界是跨端契约：side 在过蓝牙前采样，设备端那份只是旧缓存的兜底。
// 两处数字必须同源——曾经是 side 90/96 对设备 90/120，设备端那个 120 永远不可能
// 触发（side 早就截到 96 了），但两个数字独立维护，改一个忘另一个就会静默丢点
// （点数会显示在图表底部的"N根"上）。
const chartLimits = /day: (\d+), intraday: (\d+)/.exec(read('page/detail/services/chart.js'))
assert(chartLimits, 'chart.js must declare CHART_POINT_LIMITS')
const compactLimits = /data\.period === 'day' \? (\d+) : (\d+)/.exec(read('app-side/domain/compact.js'))
assert(compactLimits, 'compact.js must declare the chart sampling bounds')
assert(chartLimits[1] === compactLimits[1] && chartLimits[2] === compactLimits[2],
  `chart point caps drifted: device ${chartLimits[1]}/${chartLimits[2]} vs side ${compactLimits[1]}/${compactLimits[2]}`)
assert(storage.includes("method === 'valuation' ? 'v5'"), 'valuation device cache version not bumped')
assert(detailPage.includes('var PAGE_COUNT = 6'), 'detail page count is not 6')
assert(detailCommon.includes("page + '/6'"), 'detail header count is not 6')
assert(!detailPage.includes('renderHoldingPage') && !detailPage.includes('renderDetailAlertsPage'), 'removed detail pages are still imported')
assert(!exists('page/detail/views/holding.js') && !exists('page/detail/views/alerts.js'), 'removed detail views still exist')
assert(!exists('page/detail/services/holding.js') && !exists('page/detail/services/alerts.js'), 'removed detail services still exist')
assert((charts.match(/drawLine: false/g) || []).length >= 1, 'dual-axis primary-line overdraw removal missing')

console.log('detail_visual_static=PASS')
