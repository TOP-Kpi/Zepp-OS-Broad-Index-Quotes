import { BasePage } from '@zeppos/zml/base-page'
import { CONTENT } from '../../utils/constants'
import { clearSectionTimers, configureSectionSwiper, createSectionPageContainers, disposeSectionPageContainers, disposeSectionScenes, handleSectionPageChange, startSectionPerformance, updateSectionPage } from '../../utils/navigation/index'
import { clearTimeoutList, deferCacheHydration, deferInitialLoad, startAutoRefresh, stopAutoRefresh } from '../../utils/refresh'
import { parseParams } from '../../utils/format'
import { activateRuntime, canDeferAgain, deactivateRuntime, isInteractionIdle, isRuntimeAlive, markInteraction, recordRuntimeError } from '../../utils/runtime'
import { createDetailState, readKlineCount, releaseDetailStateData } from './model'
import { renderPreloadShell, renderErrorShell } from './views/common'
import { renderOverviewPage } from './views/overview'
import { renderChartPage, bindChartPage } from './views/chart'
import { renderFlowPage } from './views/flow'
import { renderSharesPage } from './views/shares'
import { renderMarginPage } from './views/margin'
import { renderValuationPage } from './views/valuation'
import { loadOverview } from './services/overview'
import { loadChart } from './services/chart'
import { loadFlow } from './services/flow'
import { loadShares } from './services/shares'
import { loadMargin } from './services/margin'
import { loadValuation } from './services/valuation'
import { SCREEN_HEIGHT } from 'zosLoader:./index.page.[pf].layout.js'

// 原生 swiper 页高用设备像素；场景画布用设计单位高度——
// 方屏两者同为 DEVICE.height（改动前行为不变），圆屏画布正好等于屏高，
// 避免画布按 px() 放大后比屏幕高出 20%（多占内存）。
var PAGE_HEIGHT = SCREEN_HEIGHT
var SECTION_HEIGHT = CONTENT.screenHeight
var PAGE_COUNT = 6
var RENDERERS = [renderOverviewPage, renderChartPage, renderFlowPage, renderSharesPage, renderMarginPage, renderValuationPage]
var LOADERS = [loadOverview, loadChart, loadFlow, loadShares, loadMargin, loadValuation]
// 只有行情图那屏有交互控件（分时 / 日K 切换），其余屏没有 binder。
var BINDERS = [null, bindChartPage, null, null, null, null]

Page(BasePage({
  state: createDetailState(),

  onInit: function (params) {
    var parsed = parseParams(params)
    var nextCode = parsed.code || this.state.code || '510300'
    // Zepp routing destroys/rebuilds pages. Keep the last good state when the
    // user returns to the same ETF (instant first frame), but never flash the
    // previous ETF's numbers when entering a different instrument.
    if (String(this.state.code || '') !== String(nextCode)) {
      var fresh = createDetailState()
      var key
      for (key in fresh) if (Object.prototype.hasOwnProperty.call(fresh, key)) this.state[key] = fresh[key]
    }
    this.state.code = nextCode
    this.state.name = parsed.name || this.state.name
    this.state.klineCount = readKlineCount()
  },

  build: function () {
    var self = this
    activateRuntime(this)
    this.state.scenes = new Array(PAGE_COUNT)
    this.state.pageContainers = createSectionPageContainers(PAGE_COUNT, PAGE_HEIGHT)
    configureSectionSwiper(PAGE_COUNT, PAGE_HEIGHT, function (pageIndex) { self.ensurePageWindow(pageIndex) })
    startSectionPerformance(this, PAGE_COUNT, SECTION_HEIGHT, 'renderPage', 'bindPageTapRegions')
    // Warm every page from cache only (no network). Previously just pages 0
    // and 1 were hydrated, so a swipe to 资金流/份额/融资/PE found nothing and
    // showed an empty chart until its own request came back — even though PE
    // and share caches are valid for six hours. All six loaders read through
    // requestWithCache, so a miss rejects with ETF_CACHE_MISS and leaves the
    // page's own empty state in place; none of them throw past their catch.
    deferCacheHydration(this, function () {
      var overview = loadOverview(self, false, { cacheOnly: true })
      loadChart(self, false, 'intraday', { cacheOnly: true })
      loadFlow(self, false, { cacheOnly: true })
      loadShares(self, false, { cacheOnly: true })
      loadMargin(self, false, { cacheOnly: true })
      loadValuation(self, false, { cacheOnly: true })
      return overview
    }, 90)
    deferInitialLoad(this, function () { return loadOverview(self, false) }, 180)
    this.deferChartPrefetch()
    startAutoRefresh(this, function () { self.refreshVisiblePage() }, 60, 7000)
  },

  ensurePageWindow: function (centerIndex) {
    handleSectionPageChange(this, PAGE_COUNT, SECTION_HEIGHT, centerIndex, 'renderPage', 'bindPageTapRegions', 240)
    this.scheduleVisibleData(centerIndex, 260)
  },

  // scenes.js 通过这个方法名回调绑定（见 startSectionPerformance 的第五个参数）。
  // 这个派发器一度不存在：页面把 'bindPageTapRegions' 传给了 scenes.js，却没定义它，
  // ensureBound 因 typeof 不是 function 直接返回，于是 bindChartPage 从未被调用——
  // 行情图那屏没有 分时/日K 按钮，changePeriod 与整条日K渲染路径都成了死代码。
  bindPageTapRegions: function (index) {
    var binder = BINDERS[index]
    if (typeof binder === 'function') binder(this)
  },

  renderPage: function (index, preload) {
  try {
    if (preload === true && index !== 0) {
      renderPreloadShell(this, index)
      if (Array.isArray(this.state.dirtyPages)) this.state.dirtyPages[index] = true
      return
    }
    var renderer = RENDERERS[index]
    if (typeof renderer === 'function') renderer(this)
  } catch (error) {
    // 详情页任一渲染器崩溃时，不要让 clearScene 后的黑屏成为最终状态。
    // 吞掉异常、显示占位，并把信息留在 runtimeErrors 里便于定位。
    try { recordRuntimeError(this, 'detailRender:' + index, error) } catch (_) {}
    try { renderErrorShell(this, index, error) } catch (_) {}
  }
  },

  scheduleVisibleData: function (index, delay, attempt) {
    var self = this
    // Crown spins can emit several page changes in a short burst. Only the
    // final settled page is allowed to start a data request.
    if (this.state.visibleDataTimer) clearTimeout(this.state.visibleDataTimer)
    this.state.visibleDataTimer = setTimeout(function () {
      self.state.visibleDataTimer = 0
      if (self.state.autoRefreshAlive !== false && isRuntimeAlive(self) && Number(self.state.currentPageIndex || 0) === Number(index)) {
        // Do not start cache/network work in the same window as a page gesture.
        // Re-schedule until the user's navigation has settled. 放弃重排是安全的：
        // 本页数据由 60 秒自动刷新与翻页后的再次调度兜底。
        if (!isInteractionIdle(self, 240)) {
          if (canDeferAgain(self, 'visibleData:' + index, attempt)) {
            self.scheduleVisibleData(index, 160, Number(attempt || 0) + 1)
          }
          return
        }
        self.ensureDataForPage(index, false)
      }
    }, Math.max(60, Number(delay || 95)))
  },

  ensureDataForPage: function (index, forceNetwork) {
    var loader = LOADERS[Number(index || 0)]
    if (typeof loader !== 'function') return null
    return loader(this, forceNetwork === true)
  },

  deferChartPrefetch: function () {
    var self = this
    // Runs after the first frame has settled, so the chart is ready before the
    // user can swipe one page right. Still gated on an idle runtime: the point
    // of the delay is to stay off the main thread during entry, not to stall
    // the prefetch. 2200ms meant the chart page could be reached before its
    // data had even been requested.
    var timer = setTimeout(function () {
      var position = self.state.slowLoadTimers.indexOf(timer)
      if (position >= 0) self.state.slowLoadTimers.splice(position, 1)
      if (self.state.autoRefreshAlive !== false && isRuntimeAlive(self) && Number(self.state.currentPageIndex || 0) === 0 && isInteractionIdle(self, 1200)) loadChart(self, false)
    }, 1200)
    this.state.slowLoadTimers.push(timer)
  },

  changePeriod: function (period) {
    markInteraction(this)
    var normalized = period === 'day' ? 'day' : 'intraday'
    if (normalized === this.state.period) return
    this.state.period = normalized
    var bucket = normalized === 'day' ? 'dayPoints' : 'intradayPoints'
    var cachedPoints = Array.isArray(this.state.chart[bucket]) ? this.state.chart[bucket] : []
    this.state.chart.points = cachedPoints
    this.state.chart.loading = cachedPoints.length === 0
    // Button press gives immediate native feedback. Coalesce the chart redraw
    // through the section scheduler instead of rendering re-entrantly inside
    // a click callback.
    updateSectionPage(this, 1, 'renderPage', 20)
    loadChart(this, false, normalized)
  },

  refreshVisiblePage: function () {
    this.ensureDataForPage(Number(this.state.currentPageIndex || 0), true)
  },

  onDestroy: function () {
    deactivateRuntime(this)
    if (this.state.visibleDataTimer) { clearTimeout(this.state.visibleDataTimer); this.state.visibleDataTimer = 0 }
    clearTimeoutList(this.state.slowLoadTimers)
    stopAutoRefresh(this)
    clearSectionTimers(this)
    disposeSectionScenes(this.state.scenes)
    this.state.scenes = []
    disposeSectionPageContainers(this.state.pageContainers)
    this.state.pageContainers = []
    // state is a module-level singleton that outlives this page instance. Drop
    // the heavy collections so a destroyed detail page stops holding chart,
    // share, margin and valuation arrays in background memory. The local cache
    // still restores an instant first frame on the next visit.
    releaseDetailStateData(this.state)
  },
}))
