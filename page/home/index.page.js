import { BasePage } from '@zeppos/zml/base-page'
import { CONTENT } from '../../utils/constants'
import { configureSectionSwiper, createSectionPageContainers, disposeSectionPageContainers, disposeSectionScenes, handleSectionPageChange, startSectionPerformance, clearSectionTimers } from '../../utils/navigation/index'
import { clearTimeoutList, deferCacheHydration, deferInitialLoad, startAutoRefresh, stopAutoRefresh } from '../../utils/refresh'
import { activateRuntime, canDeferAgain, deactivateRuntime, isInteractionIdle, isRuntimeAlive } from '../../utils/runtime'
import { createHomeState } from './model'
import { renderMarketPage, bindMarketPage } from './views/market'
import { renderUniversePage } from './views/universe'
import { renderSignalPage, bindSignalPage } from './views/signal'
import { renderPortfolioPage, bindPortfolioPage } from './views/portfolio'
import { renderAlertsPage, bindAlertsPage } from './views/alerts'
import { renderSettingsPage, bindSettingsPage } from './views/settings'
import { loadDashboard } from './services/dashboard'
import { loadPrimarySignal } from './services/signal'
import { loadPortfolio } from './services/portfolio'
import { loadMoneySupply } from './services/liquidity'
import { loadLocalAlerts } from './services/alerts'
import { syncHistoryDatabase } from './services/history'
import { SCREEN_HEIGHT } from 'zosLoader:./index.page.[pf].layout.js'

// 原生 swiper 页高用设备像素；场景画布用设计单位高度——
// 方屏两者同为 DEVICE.height（改动前行为不变），圆屏画布正好等于屏高，
// 避免画布按 px() 放大后比屏幕高出 20%（多占内存）。
var PAGE_HEIGHT = SCREEN_HEIGHT
var SECTION_HEIGHT = CONTENT.screenHeight
var PAGE_COUNT = 6
var RENDERERS = [renderMarketPage, renderUniversePage, renderSignalPage, renderPortfolioPage, renderAlertsPage, renderSettingsPage]
var BINDERS = [bindMarketPage, null, bindSignalPage, bindPortfolioPage, bindAlertsPage, bindSettingsPage]

Page(BasePage({
  state: createHomeState(),

  build: function () {
    var self = this
    activateRuntime(this)
    this.state.scenes = new Array(PAGE_COUNT)
    this.state.pageContainers = createSectionPageContainers(PAGE_COUNT, PAGE_HEIGHT)
    configureSectionSwiper(PAGE_COUNT, PAGE_HEIGHT, function (pageIndex) { self.ensurePageWindow(pageIndex) })
    startSectionPerformance(this, PAGE_COUNT, SECTION_HEIGHT, 'renderPage', 'bindPageTapRegions')
    startAutoRefresh(this, function () { return self.refreshAll(true) }, 60, 8000)
    deferCacheHydration(this, function () {
      loadLocalAlerts(self)
      return loadDashboard(self, false, { cacheOnly: true })
    }, 90)
    deferInitialLoad(this, function () { return self.refreshAll(false) }, 450)
  },

  ensurePageWindow: function (centerIndex) {
    handleSectionPageChange(this, PAGE_COUNT, SECTION_HEIGHT, centerIndex, 'renderPage', 'bindPageTapRegions', 240)
  },

  renderPage: function (index) {
    var renderer = RENDERERS[index]
    if (typeof renderer === 'function') renderer(this)
  },

  bindPageTapRegions: function (index) {
    var binder = BINDERS[index]
    if (typeof binder === 'function') binder(this)
  },

  refreshAll: function (forceNetwork) {
    var self = this
    loadLocalAlerts(this)
    // 辅助刷新（信号/持仓/M1-M2）与 dashboard 是彼此独立的请求：dashboard 失败
    // 不该连带取消它们。以前靠 loadDashboard 内部的 .catch(() => null) 保证
    // .then 总会执行——那是下游的实现细节，改成显式的两条路径。
    function scheduleAuxLoads() {
      loadLocalAlerts(self)
      // dashboard 已顺带返回 signal 时跳过独立请求；强制刷新仍走原路径保证完整新鲜度。
      if (forceNetwork === true || !self.state.signalFromDashboard) {
        self.scheduleAux(function () { loadPrimarySignal(self, forceNetwork === true) }, 700)
      }
      self.scheduleAux(function () { loadPortfolio(self, forceNetwork === true) }, 1350)
      // M1-M2 剪刀差是月频数据，排在最后：它只喂给快捷卡片的快照，不影响本页任何一屏。
      self.scheduleAux(function () { loadMoneySupply(self, forceNetwork === true) }, 2000)
    }
    return loadDashboard(this, forceNetwork === true).then(scheduleAuxLoads, scheduleAuxLoads)
  },

  scheduleAux: function (callback, delay, attempt) {
    var self = this
    var timer = setTimeout(function () {
      var index = self.state.auxTimers.indexOf(timer)
      if (index >= 0) self.state.auxTimers.splice(index, 1)
      if (self.state.autoRefreshAlive !== false && isRuntimeAlive(self)) {
        if (!isInteractionIdle(self, 900)) {
          if (canDeferAgain(self, 'homeAux', attempt)) self.scheduleAux(callback, 500, Number(attempt || 0) + 1)
          return
        }
        try {
          var result = callback()
          if (result && typeof result.catch === 'function') result.catch(function () { return null })
        } catch (_) { }
      }
    }, delay)
    this.state.auxTimers.push(timer)
  },

  syncHistoryDatabase: function () {
    return syncHistoryDatabase(this)
  },

  onDestroy: function () {
    deactivateRuntime(this)
    stopAutoRefresh(this)
    clearTimeoutList(this.state.auxTimers)
    clearSectionTimers(this)
    disposeSectionScenes(this.state.scenes)
    this.state.scenes = []
    disposeSectionPageContainers(this.state.pageContainers)
    this.state.pageContainers = []
  },
}))
