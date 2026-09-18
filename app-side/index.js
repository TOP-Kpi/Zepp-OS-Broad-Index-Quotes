import { BaseSideService } from '@zeppos/zml/base-side'
import { createEastmoneyProvider } from './providers/eastmoney'
import { getHistoryDatabaseStatus, shouldSyncHistoryDatabase, syncHistoryDatabase } from './history-db'
import { compactResponse } from './domain/compact'
import { deriveSignal } from './domain/signal'
import { routeRequest } from './domain/request-router'
import { schedulePrefetch } from './domain/prefetch'

const IDLE_HISTORY_DELAY_MS = 18000
const FOREGROUND_QUIET_MS = 10000

AppSideService(
  BaseSideService({
    onInit() {
      this.provider = createEastmoneyProvider()
      this.historySyncPromise = null
      this.historyIdleTimer = null
      this.activeRequestCount = 0
      this.lastRequestAt = Date.now()
      this.serviceAlive = true
      this.prefetchTimer = null
      this.prefetchRunning = false
      this.lastPrefetchAt = 0
    },

    onSettingsChange() {},

    async loadSignal(code) {
      const overview = await this.provider.overview(code)
      return deriveSignal(overview, code)
    },

    ensureHistoryDatabase(force = false) {
      if (this.serviceAlive === false) return Promise.resolve(getHistoryDatabaseStatus())
      if (!force && !shouldSyncHistoryDatabase(false)) return Promise.resolve(getHistoryDatabaseStatus())
      if (this.historySyncPromise) return this.historySyncPromise
      this.historySyncPromise = syncHistoryDatabase(this.provider, (code) => this.loadSignal(code), {
        force,
        shouldPause: () => Number(this.activeRequestCount || 0) > 0 || Date.now() - Number(this.lastRequestAt || 0) < 1600,
        shouldStop: () => this.serviceAlive === false,
      }).then(
        (status) => { this.historySyncPromise = null; return status },
        (error) => { this.historySyncPromise = null; throw error },
      )
      return this.historySyncPromise
    },

    startHistoryDatabaseSync(force = false) {
      this.ensureHistoryDatabase(force).catch(() => null)
      return { ...getHistoryDatabaseStatus(), syncing: true }
    },

    scheduleHistoryIdleSync() {
      if (this.serviceAlive === false || !shouldSyncHistoryDatabase(false) || this.historySyncPromise) return
      if (this.historyIdleTimer) clearTimeout(this.historyIdleTimer)
      this.historyIdleTimer = setTimeout(() => {
        this.historyIdleTimer = null
        const quietFor = Date.now() - Number(this.lastRequestAt || 0)
        if (Number(this.activeRequestCount || 0) > 0 || quietFor < FOREGROUND_QUIET_MS) {
          if (this.serviceAlive !== false) this.scheduleHistoryIdleSync()
          return
        }
        this.ensureHistoryDatabase(false).catch(() => null)
      }, IDLE_HISTORY_DELAY_MS)
    },

    async onRequest(request, respond) {
      this.activeRequestCount = Number(this.activeRequestCount || 0) + 1
      this.lastRequestAt = Date.now()
      if (this.historyIdleTimer) { clearTimeout(this.historyIdleTimer); this.historyIdleTimer = null }
      let responded = false
      const safeRespond = (error, value) => {
        if (responded || this.serviceAlive === false) return
        responded = true
        try { respond(error, value) } catch (_) {}
      }
      try {
        if (!this.provider) this.provider = createEastmoneyProvider()
        const result = await routeRequest(this, request)
        safeRespond(null, compactResponse(request && request.method, result))
      } catch (error) {
        safeRespond({ message: error && error.message ? String(error.message).slice(0, 180) : '手机联网请求失败' })
      } finally {
        this.activeRequestCount = Math.max(0, Number(this.activeRequestCount || 1) - 1)
        this.lastRequestAt = Date.now()
        this.scheduleHistoryIdleSync()
        schedulePrefetch(this)
      }
    },

    onDestroy() {
      this.serviceAlive = false
      if (this.historyIdleTimer) clearTimeout(this.historyIdleTimer)
      this.historyIdleTimer = null
      if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
      this.prefetchTimer = null
      this.activeRequestCount = 0
    },
  }),
)
