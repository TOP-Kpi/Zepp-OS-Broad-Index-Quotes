import { DIRECT_CONFIG } from '../../config'
import { finite, itemFor, marketSymbol, nowText, parseKlineRow, parseQtimgKline, parseTrendRow, url } from './common'

function parseTencentMinuteRow(row) {
  const parts = Array.isArray(row) ? row.map((value) => String(value)) : String(row || '').trim().split(/\s+/)
  if (parts.length < 2) return null
  const timeToken = String(parts[0] || '')
  const price = finite(parts[1])
  if (!/^\d{4}$/.test(timeToken) || price === null) return null
  return { time: timeToken, o: price, c: price, h: price, l: price, volume: finite(parts[2]), amount: finite(parts[3]), avg: null }
}

function minuteRowsFromTencentPayload(raw, symbol) {
  const roots = []
  const direct = raw && raw.data && raw.data[symbol]
  if (direct) roots.push(direct)
  roots.push(raw)
  const seen = new Set()
  function walk(node, depth) {
    if (!node || depth > 7 || seen.has(node)) return []
    if (typeof node === 'object') seen.add(node)
    if (Array.isArray(node)) {
      if (node.length && (typeof node[0] === 'string' || Array.isArray(node[0]))) {
        const parsed = node.map(parseTencentMinuteRow).filter(Boolean)
        if (parsed.length >= 2) return parsed
      }
      for (let i = 0; i < node.length; i += 1) { const found = walk(node[i], depth + 1); if (found.length >= 2) return found }
      return []
    }
    if (typeof node === 'object') {
      const keys = Object.keys(node)
      for (let i = 0; i < keys.length; i += 1) { const found = walk(node[keys[i]], depth + 1); if (found.length >= 2) return found }
    }
    return []
  }
  for (let i = 0; i < roots.length; i += 1) { const found = walk(roots[i], 0); if (found.length >= 2) return found }
  return []
}

export function createChartProvider(transport) {
  async function tencentIntradayChart(code) {
    const item = itemFor(code)
    const symbol = marketSymbol(item)
    const raw = await transport.requestJson(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}`, {}, 3800)
    const points = minuteRowsFromTencentPayload(raw, symbol)
    if (!points.length) throw new Error('腾讯分时接口暂无数据')
    return { code, period: 'intraday', points, source: '腾讯分时回退', updatedAt: nowText() }
  }

  async function eastmoneyIntradayOnBase(code, base, sourceLabel) {
    const item = itemFor(code)
    const raw = await transport.requestJson(url(base, '/api/qt/stock/trends2/get', {
      secid: item.secid, ndays: 1, iscr: 0, iscca: 0,
      fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13', fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    }), {}, sourceLabel.indexOf('主源') >= 0 ? 4200 : 3200)
    const rows = raw && raw.data && Array.isArray(raw.data.trends) ? raw.data.trends : []
    const points = rows.map(parseTrendRow).filter(Boolean)
    if (!points.length) throw new Error(`${sourceLabel}分时暂无数据`)
    return { code, period: 'intraday', points, source: sourceLabel, updatedAt: nowText() }
  }

  async function tencentDayChart(code) {
    const item = itemFor(code)
    const symbol = marketSymbol(item)
    const raw = await transport.requestJson(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,150,qfq`, {}, 4200)
    const points = parseQtimgKline(raw, symbol)
    if (!points.length) throw new Error('腾讯日线接口暂无数据')
    return { code, period: 'day', points, source: '腾讯日线回退', updatedAt: nowText() }
  }

  async function chart(code, period) {
    const item = itemFor(code)
    const normalized = period === 'day' ? 'day' : period === 'hour' ? 'hour' : 'intraday'
    const ttl = normalized === 'day' ? DIRECT_CONFIG.historyCacheMs : 10000
    return transport.cached(`chart:${code}:${normalized}`, ttl, async () => {
      if (normalized === 'intraday') {
        try { return await eastmoneyIntradayOnBase(code, DIRECT_CONFIG.historyBase, '东方财富分时主源') }
        catch (_) {
          try { return await eastmoneyIntradayOnBase(code, DIRECT_CONFIG.quoteBase, '东方财富分时备用') }
          catch (__) { return tencentIntradayChart(code) }
        }
      }
      try {
        const raw = await transport.requestJson(url(DIRECT_CONFIG.historyBase, '/api/qt/stock/kline/get', {
          secid: item.secid, fields1: 'f1,f2,f3,f4,f5,f6', fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
          klt: normalized === 'hour' ? 60 : 101, fqt: 0, beg: 0, end: 20500101, lmt: normalized === 'hour' ? 48 : 150,
        }), {}, normalized === 'day' ? 5600 : 4800)
        const rows = raw && raw.data && Array.isArray(raw.data.klines) ? raw.data.klines : []
        return { code, period: normalized, points: rows.map(parseKlineRow).filter(Boolean), source: '东方财富手机直连', updatedAt: nowText() }
      } catch (error) {
        if (normalized === 'day') return tencentDayChart(code)
        throw error
      }
    })
  }

  return { chart }
}
