import {
  historyLatestOverview,
  historyRecordsAsDayChart,
  historyRecordsAsFlow,
  historyRecordsAsMargin,
  historyRecordsAsShares,
} from '../history-db'
import { loadShareChartCache, mergeShareResultWithCache, saveShareChartCache } from '../shares-cache'
import { summarizeMarket } from './market'
import { readAppSettings } from './settings'
import { deriveSignal } from './signal'
import { portfolioFromUniverse } from './portfolio'

async function dashboard(service) {
  const universe = await service.provider.universe()
  const settings = readAppSettings()
  const result = {
    universe,
    market: summarizeMarket(universe),
    settings,
    // portfolio 只依赖 universe（本地 settings + 算术），顺带返回可省掉
    // 设备端一次独立的 BLE 往返与渲染调度。
    portfolio: portfolioFromUniverse(universe),
  }
  // B2 signal 顺带：主标的完整 overview 仍在 side 缓存有效期内时，就地计算
  // 信号随 dashboard 返回，设备端跳过这次独立的 signal BLE 往返。
  const peek = service.provider.peekOverview ? service.provider.peekOverview(settings.primaryCode) : null
  if (peek) result.signal = deriveSignal(peek, settings.primaryCode)
  return result
}

async function overview(service, params) {
  try {
    const data = params.light && service.provider.overviewLight
      ? await service.provider.overviewLight(params.code)
      : await service.provider.overview(params.code)
    return { ...data, signal: deriveSignal(data, params.code) }
  } catch (error) {
    const historical = historyLatestOverview(params.code)
    if (!historical) throw error
    return historical.signal ? historical : { ...historical, signal: deriveSignal(historical, params.code) }
  }
}

// The overview card falls back to the last daily bar's volume/amount, and the
// chart only draws o/c/h/l/time (+avg for intraday). Everything else the
// upstream feeds return (amplitude, changePct, change, turnover, and the 10+
// raw fields a kline row carries) has no reader on the device, so drop it here
// rather than shipping it over Bluetooth and parking it in the watch heap.
// Measured: 64% smaller day-K frames, 67% smaller intraday frames.
function trimChartPoints(points) {
  if (!Array.isArray(points)) return []
  const kept = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (!point || typeof point !== 'object') continue
    const lean = {
      time: point.time,
      o: point.o,
      c: point.c,
      h: point.h,
      l: point.l,
      volume: point.volume,
      amount: point.amount,
    }
    if (point.avg !== undefined) lean.avg = point.avg
    kept.push(lean)
  }
  return kept
}

function leanChartPayload(result) {
  if (!result || typeof result !== 'object') return result
  if (!Array.isArray(result.points)) return result
  return { ...result, points: trimChartPoints(result.points) }
}

async function chart(service, params) {
  const period = params.period || 'intraday'
  try { return leanChartPayload(await service.provider.chart(params.code, period)) }
  catch (error) {
    if (period !== 'day') throw error
    const points = historyRecordsAsDayChart(params.code, params.limit || 60)
    if (!points.length) throw error
    return { code: params.code, period: 'day', points: trimChartPoints(points), source: '60日历史数据库回退', updatedAt: new Date().toISOString() }
  }
}

async function flow(service, params) {
  try { return await service.provider.flow(params.code) }
  catch (error) {
    const result = historyRecordsAsFlow(params.code, 12)
    if (!result.intervals.length) throw error
    return result
  }
}

async function shares(service, params) {
  try {
    const result = await service.provider.shares(params.code)
    if (result && Array.isArray(result.points) && result.points.length) {
      const existing = loadShareChartCache(params.code)
      const merged = mergeShareResultWithCache(result, existing)
      saveShareChartCache(params.code, merged)
      return merged
    }
    const cached = loadShareChartCache(params.code)
    if (cached && cached.points.length) return cached
    const historical = historyRecordsAsShares(params.code, 132)
    return historical.points.length ? historical : result
  } catch (error) {
    const cached = loadShareChartCache(params.code)
    if (cached && cached.points.length) return cached
    const historical = historyRecordsAsShares(params.code, 132)
    if (!historical.points.length) throw error
    return historical
  }
}

async function margin(service, params) {
  try { return await service.provider.margin(params.code, params.limit || 60) }
  catch (error) {
    const historical = historyRecordsAsMargin(params.code, params.limit || 60)
    if (!historical.points.length) throw error
    return historical
  }
}

// Only methods the device actually sends. Removing the speculative
// universe/market/alerts/settings handlers keeps the request contract explicit.
const handlers = {
  dashboard,
  overview,
  signal: async (service, params) => {
    try { return await service.loadSignal(params.code) }
    catch (error) {
      // overview 七路数据全挂时退回历史库最近快照重算信号，避免信号页整屏 '--'。
      const historical = historyLatestOverview(params.code)
      if (!historical) throw error
      return deriveSignal(historical, params.code)
    }
  },
  chart,
  flow,
  shares,
  valuation: async (service, params) => {
    try { return await service.provider.valuation(params.code) }
    catch (error) {
      // 乐咕+雪球双源同挂时退回历史库最近一次估值快照（仅当前值/分位），
      // 图表仍显示数据不足，但关键估值信息不再整屏丢失。
      const historical = historyLatestOverview(params.code)
      const valuation = historical && historical.valuation ? historical.valuation : null
      if (!valuation || valuation.pePercentile === null || valuation.pePercentile === undefined) throw error
      return {
        code: params.code,
        points: [],
        currentPe: valuation.pe,
        percentile: valuation.pePercentile,
        p20: null, p80: null, maxPe: null, minPe: null, avgPe: null, currentIndex: null,
        indexCode: '', name: historical.name || params.code,
        source: '历史数据库回退', updatedAt: historical.updatedAt || '',
      }
    }
  },
  margin,
  // M1-M2 剪刀差（月频宏观数据）。单独一个 method 而不是塞进 dashboard：
  // dashboard 每 60 秒会被自动刷新取一次，而货币供应量一个月才变一次，
  // 把 13 个月的走势序列挂在每次 dashboard 上纯属浪费蓝牙带宽。
  'money-supply': async (service, params) => service.provider.moneySupply(params.months),
  portfolio: async (service) => portfolioFromUniverse(await service.provider.universe()),
  'history-db-sync': async (service) => service.startHistoryDatabaseSync(true),
}

export async function routeRequest(service, request) {
  const method = request && request.method
  const handler = handlers[method]
  if (!handler) throw new Error(`未知请求: ${method}`)
  return handler(service, (request && request.params) || {})
}
