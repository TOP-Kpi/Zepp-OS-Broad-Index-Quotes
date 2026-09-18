import { RETENTION_DAYS } from './config'
import { dateText, finite, mapByDate, movingAverage } from './value'

function buildQuote(point, previous, live, isLatest) {
  const close = finite(point && point.c)
  const previousClose = finite(previous && previous.c)
  const rawChangePct = finite(point && point.changePct)
  const rawChange = finite(point && point.change)
  return {
    open: finite(point && point.o),
    close,
    high: finite(point && point.h),
    low: finite(point && point.l),
    previousClose,
    average: isLatest ? finite(live.average) : null,
    volume: finite(point && point.volume),
    amount: finite(point && point.amount),
    amplitude: finite(point && point.amplitude),
    changePct: rawChangePct !== null ? rawChangePct : (close !== null && previousClose ? (close / previousClose - 1) * 100 : null),
    change: rawChange !== null ? rawChange : (close !== null && previousClose !== null ? close - previousClose : null),
    turnover: finite(point && point.turnover),
    pe: isLatest ? finite(live.pe) : null,
    pb: isLatest ? finite(live.pb) : null,
  }
}

function buildFlow(point) {
  if (!point) return null
  return {
    main: finite(point.main), small: finite(point.small), middle: finite(point.middle),
    large: finite(point.large), superLarge: finite(point.superLarge), mainPct: finite(point.mainPct),
  }
}

function buildShares(point) {
  return point ? { shareBillion: finite(point.shareBillion) } : null
}

function buildMargin(point) {
  if (!point) return null
  return {
    balance: finite(point.balance), buy: finite(point.buy), repay: finite(point.repay),
    netBuy: finite(point.netBuy), close: finite(point.close),
  }
}

function buildSignal(signal, isLatest) {
  if (!isLatest || !signal) return null
  return {
    action: signal.action || 'UNKNOWN',
    actionLabel: signal.actionLabel || '',
    score: finite(signal.score),
    suggestedPosition: finite(signal.suggestedPosition),
    valuationPercentile: finite(signal.valuationPercentile),
    risk: signal.risk || '',
    reasons: Array.isArray(signal.reasons) ? signal.reasons.slice(0, 4) : [],
  }
}


export function buildDailyRecords(code, daily, flow, shares, margin, liveQuote, latestSignal) {
  const dailyPoints = Array.isArray(daily && daily.points) ? daily.points : []
  const flowByDate = mapByDate(flow && flow.intervals)
  const sharesByDate = mapByDate(shares && shares.points)
  const marginByDate = mapByDate(margin && margin.points)
  const records = []
  const start = Math.max(0, dailyPoints.length - RETENTION_DAYS)

  for (let index = start; index < dailyPoints.length; index += 1) {
    const point = dailyPoints[index]
    const date = dateText(point && point.time)
    if (!date) continue
    const previous = index > 0 ? dailyPoints[index - 1] : null
    const isLatest = index === dailyPoints.length - 1
    const live = isLatest ? (liveQuote || {}) : {}
    records.push({
      date,
      quote: buildQuote(point, previous, live, isLatest),
      flow: buildFlow(flowByDate[date] || null),
      shares: buildShares(sharesByDate[date] || null),
      margin: buildMargin(marginByDate[date] || null),
      trend: {
        ma5: movingAverage(dailyPoints, index, 5),
        ma20: movingAverage(dailyPoints, index, 20),
        ma60: movingAverage(dailyPoints, index, 60),
      },
      signal: buildSignal(latestSignal, isLatest),
    })
  }
  return records.slice(Math.max(0, records.length - RETENTION_DAYS))
}
