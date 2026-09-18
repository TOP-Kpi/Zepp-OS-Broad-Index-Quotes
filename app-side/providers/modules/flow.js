import { DIRECT_CONFIG } from '../../config'
import { finite, itemFor, nowText, parseFlowRow, url } from './common'

// 东方财富资金流日线。ut 是接口契约的一部分（缺失时接口常回 HTTP 200 +
// data:null，表现为"无数据"而不是报错），主/备主机都要试；空 klines 也走
// 下一档，避免一次档位抖动直接让"今日主力/区间主力"变成 '--'。
const FLOW_UT = 'b2884a393a59ad64002292a3e90d46a5'
const FLOW_HOSTS = [DIRECT_CONFIG.historyBase, DIRECT_CONFIG.quoteBase]
const FLOW_HEADERS = { Referer: 'https://quote.eastmoney.com/' }

async function loadFlowRows(transport, secid) {
  let lastError = null
  for (let index = 0; index < FLOW_HOSTS.length; index += 1) {
    const host = FLOW_HOSTS[index]
    try {
      const raw = await transport.requestJson(url(host, '/api/qt/stock/fflow/daykline/get', {
        secid, klt: 101, lmt: 60, ut: FLOW_UT,
        fields1: 'f1,f2,f3,f7', fields2: 'f51,f52,f53,f54,f55,f56,f57',
      }), { headers: FLOW_HEADERS }, 6200)
      const rows = raw && raw.data && Array.isArray(raw.data.klines) ? raw.data.klines : []
      if (rows.length) return rows
      lastError = new Error(`资金流接口无数据(${host})`)
    } catch (error) { lastError = error }
  }
  if (lastError) throw lastError
  return []
}

// 日线拿不到时，至少保住"今日主力"：先要分时（当日累计主力净流入），再退到
// 延迟行情主机的日线接口（同为东财口径，但只回当日一行，故只取今日值，
// 绝不拿它冒充 60 日区间）。
async function loadIntradayMain(transport, secid) {
  for (let index = 0; index < FLOW_HOSTS.length; index += 1) {
    try {
      const raw = await transport.requestJson(url(FLOW_HOSTS[index], '/api/qt/stock/fflow/kline/get', {
        secid, klt: 1, lmt: 0, ut: FLOW_UT,
        fields1: 'f1,f2,f3,f7', fields2: 'f51,f52,f53,f54,f55,f56,f57',
      }), { headers: FLOW_HEADERS }, 5200)
      const rows = raw && raw.data && Array.isArray(raw.data.klines) ? raw.data.klines : []
      const last = rows.length ? parseFlowRow(rows[rows.length - 1]) : null
      const main = finite(last && last.main)
      if (main !== null) return main
    } catch (_) {}
  }
  try {
    const raw = await transport.requestJson(url(DIRECT_CONFIG.delayBase, '/api/qt/stock/fflow/daykline/get', {
      secid, klt: 101, lmt: 1, ut: FLOW_UT,
      fields1: 'f1,f2,f3,f7', fields2: 'f51,f52,f53,f54,f55,f56,f57',
    }), { headers: FLOW_HEADERS }, 5200)
    const rows = raw && raw.data && Array.isArray(raw.data.klines) ? raw.data.klines : []
    const last = rows.length ? parseFlowRow(rows[rows.length - 1]) : null
    return finite(last && last.main)
  } catch (_) { return null }
}

export function createFlowProvider(transport, quote, shares) {
  async function flow(code, options = {}) {
    const item = itemFor(code)
    const includeShares = options.includeShares !== false
    const cacheKey = includeShares ? `flow:${code}:full` : `flow:${code}:light`
    return transport.cached(cacheKey, 20000, async () => {
      const pair = await Promise.all([
        quote(code).catch(() => null),
        loadFlowRows(transport, item.secid).catch(() => null),
        includeShares && shares ? shares(code).catch(() => null) : Promise.resolve(null),
      ])
      const q = pair[0]
      const rows = Array.isArray(pair[1]) ? pair[1] : []
      const shareData = pair[2]
      const intervals = rows.map(parseFlowRow).filter(Boolean)
      const lastFlow = intervals.length ? intervals[intervals.length - 1] : null
      const quoteTodayMain = q ? finite(q.todayMain) : null
      let todayMain = quoteTodayMain !== null ? quoteTodayMain : finite(lastFlow && lastFlow.main)
      // 日线与行情都没给出主力净流入时，再要一次当日分时（只补今日一格，
      // 不伪造区间数据）。
      if (todayMain === null) todayMain = await loadIntradayMain(transport, item.secid)
      const sharePoints = shareData && Array.isArray(shareData.points) ? shareData.points : []
      let shareSubscriptionBillion = null
      if (sharePoints.length > 1) {
        const latestShare = finite(sharePoints[sharePoints.length - 1].shareBillion)
        const previousShare = finite(sharePoints[sharePoints.length - 2].shareBillion)
        if (latestShare !== null && previousShare !== null) shareSubscriptionBillion = latestShare - previousShare
      }
      return {
        code,
        today: { main: todayMain, time: (q && q.updatedAt) || (lastFlow && lastFlow.time) || nowText() },
        intervalMain: intervals.length ? intervals.reduce((sum, row) => sum + (finite(row.main) || 0), 0) : null,
        intervals,
        shareSubscriptionBillion,
        offMarketNet: shareSubscriptionBillion,
        offMarket: [],
        source: includeShares ? '东方财富资金流 + ETF份额申赎' : '东方财富资金流',
        updatedAt: nowText(),
      }
    })
  }
  return { flow }
}
