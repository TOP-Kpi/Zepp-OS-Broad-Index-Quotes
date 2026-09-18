import { DIRECT_CONFIG } from '../../config'
import { average, finite, itemFor, nowText } from './common'

function intradayAverage(points) {
  const rows = Array.isArray(points) ? points : []
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const avg = finite(rows[index] && rows[index].avg)
    if (avg !== null && avg > 0) return avg
  }
  let sum = 0
  let count = 0
  for (let index = 0; index < rows.length; index += 1) {
    const price = finite(rows[index] && (rows[index].c !== undefined ? rows[index].c : rows[index].close))
    if (price === null || price <= 0) continue
    sum += price
    count += 1
  }
  return count ? sum / count : null
}

function quoteWithFallback(code, item, q, daily, intraday, shareData) {
  const points = daily && Array.isArray(daily.points) ? daily.points : []
  const lastDaily = points.length ? points[points.length - 1] : null
  const previousDaily = points.length > 1 ? points[points.length - 2] : null
  const latestShare = shareData ? finite(shareData.latestBillion) : null
  if (!q && !lastDaily && latestShare === null) throw new Error('手机联网数据不可用')

  const price = q && finite(q.price) !== null ? finite(q.price) : finite(lastDaily && lastDaily.c)
  const previousClose = q && finite(q.previousClose) !== null ? finite(q.previousClose) : finite(previousDaily && previousDaily.c)
  const fallbackAverage = intradayAverage(intraday && intraday.points)
  const fallbackHigh = finite(lastDaily && lastDaily.h)
  const fallbackLow = finite(lastDaily && lastDaily.l)
  const quoteData = q ? { ...q } : {
    code, name: item.name, shortName: item.shortName, price,
    changePct: price !== null && previousClose ? (price / previousClose - 1) * 100 : null,
    change: price !== null && previousClose !== null ? price - previousClose : null,
    open: finite(lastDaily && lastDaily.o), high: fallbackHigh, low: fallbackLow, previousClose,
    average: fallbackAverage, volume: finite(lastDaily && lastDaily.volume), amount: finite(lastDaily && lastDaily.amount), todayMain: null,
    pe: null, pb: null, amplitude: null,
    latestShares: latestShare === null ? null : latestShare * 100000000,
    latestSharesBillion: latestShare,
    updatedAt: (daily && daily.updatedAt) || nowText(), source: (daily && daily.source) || '日线回退',
  }
  if (finite(quoteData.average) === null) quoteData.average = fallbackAverage
  const high = finite(quoteData.high) !== null ? finite(quoteData.high) : fallbackHigh
  const low = finite(quoteData.low) !== null ? finite(quoteData.low) : fallbackLow
  if (finite(quoteData.amplitude) === null && high !== null && low !== null && previousClose) quoteData.amplitude = (high - low) / previousClose * 100
  return { quoteData, lastDaily, previousDaily }
}

export function createOverviewProvider(transport, quote, chart, flow, margin, shares, valuation) {
  async function overviewLight(code) {
    return transport.cached(`overview:${code}:light`, Math.min(DIRECT_CONFIG.overviewCacheMs, 15000), async () => {
      const item = itemFor(code)
      // Entering ETF detail must feel immediate. Only load data required by the
      // first page; shares, valuation and margin are fetched lazily on their pages.
      const core = await Promise.all([
        quote(code).catch(() => null),
        chart(code, 'day').catch(() => ({ points: [] })),
        chart(code, 'intraday').catch(() => ({ points: [] })),
      ])
      const q = core[0]
      const daily = core[1]
      const intraday = core[2]
      const fallback = quoteWithFallback(code, item, q, daily, intraday, null)
      const quoteData = fallback.quoteData

      // Keep the first detail screen inside one bounded parallel request wave.
      // If the primary quote lacks todayMain, the dedicated flow page will load
      // it lazily instead of extending first-screen latency with a second wave.

      return {
        code,
        indexCode: item.indexCode,
        indexSymbol: item.indexSymbol,
        name: quoteData.name || item.name,
        shortName: quoteData.shortName || item.shortName,
        quote: quoteData,
        updatedAt: quoteData.updatedAt || (daily && daily.updatedAt) || nowText(),
        source: quoteData.source || '手机直连',
        light: true,
      }
    })
  }

  async function overview(code) {
    return transport.cached(`overview:${code}:full`, DIRECT_CONFIG.overviewCacheMs, async () => {
      const [q, daily, intraday, flowData, marginData, shareData, valuationData] = await Promise.all([
        quote(code).catch(() => null),
        chart(code, 'day').catch(() => ({ points: [] })),
        chart(code, 'intraday').catch(() => ({ points: [] })),
        flow(code).catch(() => ({ today: { main: null }, intervalMain: null, intervals: [] })),
        margin(code, 5).catch(() => ({ points: [] })),
        shares(code).catch(() => ({ latestBillion: null, points: [], historyAvailable: false })),
        valuation ? valuation(code).catch(() => null) : Promise.resolve(null),
      ])
      const item = itemFor(code)
      const fallback = quoteWithFallback(code, item, q, daily, intraday, shareData)
      const quoteData = fallback.quoteData
      const flowTodayMain = finite(flowData && flowData.today && flowData.today.main)
      if (finite(quoteData.todayMain) === null && flowTodayMain !== null) quoteData.todayMain = flowTodayMain

      const closes = (daily.points || []).map((point) => finite(point.c)).filter((value) => value !== null)
      const marginPoint = marginData.points && marginData.points.length ? marginData.points[marginData.points.length - 1] : null
      const sharePoints = Array.isArray(shareData.points) ? shareData.points : []
      let shareChange = null
      if (sharePoints.length > 1) {
        const lastShare = finite(sharePoints[sharePoints.length - 1].shareBillion)
        const firstShare = finite(sharePoints[0].shareBillion)
        if (lastShare !== null && firstShare !== null) shareChange = lastShare - firstShare
      }
      return {
        code, indexCode: item.indexCode, indexSymbol: item.indexSymbol, name: quoteData.name, shortName: quoteData.shortName, quote: quoteData,
        valuation: {
          pe: valuationData && finite(valuationData.currentPe) !== null ? finite(valuationData.currentPe) : finite(quoteData.pe),
          pb: quoteData.pb,
          pePercentile: valuationData ? finite(valuationData.percentile) : null,
          pbPercentile: null,
          p20: valuationData ? finite(valuationData.p20) : null,
          p80: valuationData ? finite(valuationData.p80) : null,
          indexCode: item.indexCode,
        },
        trend: { ma5: average(closes, 5), ma20: average(closes, 20), ma60: average(closes, 60) },
        flow: { todayMain: quoteData.todayMain, intervalMain: flowData.intervalMain, shareSubscriptionBillion: finite(flowData.shareSubscriptionBillion) },
        shares: { latestBillion: shareData.latestBillion, changeBillion: shareChange, historyAvailable: shareData.historyAvailable },
        margin: { netBuy: marginPoint ? marginPoint.netBuy : null, balance: marginPoint ? marginPoint.balance : null },
        updatedAt: quoteData.updatedAt || daily.updatedAt || nowText(), source: quoteData.source || '手机直连',
      }
    })
  }
  return { overview, overviewLight }
}
