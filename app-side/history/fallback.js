import { RETENTION_DAYS } from './config'
import { getHistoryRecords, getHistoryStore } from './store'
import { finite } from './value'

export function historyRecordsAsDayChart(code, limit = RETENTION_DAYS) {
  return getHistoryRecords(code, limit).map((record) => ({
    time: record.date,
    o: finite(record.quote && record.quote.open),
    c: finite(record.quote && record.quote.close),
    h: finite(record.quote && record.quote.high),
    l: finite(record.quote && record.quote.low),
    volume: finite(record.quote && record.quote.volume),
    amount: finite(record.quote && record.quote.amount),
    amplitude: finite(record.quote && record.quote.amplitude),
    changePct: finite(record.quote && record.quote.changePct),
    change: finite(record.quote && record.quote.change),
    turnover: finite(record.quote && record.quote.turnover),
  })).filter((item) => item.time && item.c !== null)
}

export function historyRecordsAsFlow(code, limit = 12) {
  const records = getHistoryRecords(code, RETENTION_DAYS)
  const usable = records.filter((record) => record.flow && finite(record.flow.main) !== null)
  const slice = usable.slice(Math.max(0, usable.length - Math.max(1, Number(limit || 12))))
  const intervals = slice.map((record) => ({ time: record.date, ...record.flow }))
  const latest = intervals.length ? intervals[intervals.length - 1] : null
  return {
    code: String(code),
    today: { main: latest ? finite(latest.main) : null, time: latest ? latest.time : '' },
    intervalMain: intervals.length ? intervals.reduce((sum, item) => sum + (finite(item.main) || 0), 0) : null,
    intervals,
    offMarketNet: null,
    offMarket: [],
    source: '60日历史数据库回退',
    updatedAt: getHistoryStore(code).updatedAt || '',
  }
}

export function historyRecordsAsShares(code, limit = RETENTION_DAYS) {
  const records = getHistoryRecords(code, limit)
  let latestBillion = null
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const value = records[index].shares && finite(records[index].shares.shareBillion)
    if (value !== null) { latestBillion = value; break }
  }

  let points = records
    .filter((record) => record.shares && finite(record.shares.shareBillion) !== null && record.quote && finite(record.quote.close) !== null)
    .map((record) => ({ time: record.date, close: finite(record.quote.close), shareBillion: finite(record.shares.shareBillion) }))
  const genuineHistory = points.length > 1
  if (points.length < 2 && latestBillion !== null) {
    points = records
      .filter((record) => record.quote && finite(record.quote.close) !== null)
      .map((record) => ({ time: record.date, close: finite(record.quote.close), shareBillion: latestBillion }))
  }
  return {
    code: String(code), latestBillion, points, historyAvailable: genuineHistory,
    note: genuineHistory ? '来自60日历史数据库' : '历史份额不可用，蓝线为最新份额基准',
    source: '60日历史数据库回退', updatedAt: getHistoryStore(code).updatedAt || '',
  }
}

export function historyRecordsAsMargin(code, limit = RETENTION_DAYS) {
  const records = getHistoryRecords(code, limit)
  const points = records.filter((record) => record.margin).map((record) => ({ time: record.date, ...record.margin }))
  return { code: String(code), points, source: '60日历史数据库回退', updatedAt: getHistoryStore(code).updatedAt || '' }
}

export function historyLatestOverview(code) {
  const store = getHistoryStore(code)
  const records = Array.isArray(store.records) ? store.records : []
  if (!records.length) return null
  const record = records[records.length - 1]
  const q = record.quote || {}
  const flow = record.flow || {}
  const shares = record.shares || {}
  const margin = record.margin || {}
  const trend = record.trend || {}
  const signal = record.signal || null
  return {
    code: String(code), name: store.name, shortName: store.shortName,
    quote: {
      code: String(code), name: store.name, shortName: store.shortName,
      price: finite(q.close), changePct: finite(q.changePct), change: finite(q.change),
      open: finite(q.open), high: finite(q.high), low: finite(q.low), previousClose: finite(q.previousClose),
      average: finite(q.average), volume: finite(q.volume), amount: finite(q.amount), todayMain: finite(flow.main),
      pe: finite(q.pe), pb: finite(q.pb), amplitude: finite(q.amplitude),
      latestShares: finite(shares.shareBillion) === null ? null : finite(shares.shareBillion) * 100000000,
      latestSharesBillion: finite(shares.shareBillion), updatedAt: record.date, source: '60日历史数据库回退',
    },
    valuation: { pe: finite(q.pe), pb: finite(q.pb), pePercentile: signal ? finite(signal.valuationPercentile) : null, pbPercentile: null },
    trend: { ma5: finite(trend.ma5), ma20: finite(trend.ma20), ma60: finite(trend.ma60) },
    flow: { todayMain: finite(flow.main), intervalMain: null },
    shares: { latestBillion: finite(shares.shareBillion), changeBillion: null, historyAvailable: true },
    margin: { netBuy: finite(margin.netBuy), balance: finite(margin.balance) },
    signal, updatedAt: record.date, source: '60日历史数据库回退',
  }
}
