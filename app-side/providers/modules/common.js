import { ETF_CATALOG_BY_CODE } from '../../domain/etf-catalog'
import { finite } from '../../domain/finite'

export const FUND_MAP = ETF_CATALOG_BY_CODE

// 数值归一收敛到 domain/finite.js；此处保留同名再导出，各 provider 模块
// 继续从 './common' 取用。
export { finite }

export function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

export function encodeQuery(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

export function url(base, path, params) {
  const query = encodeQuery(params || {})
  return `${base}${path}${query ? `?${query}` : ''}`
}

export function parseBody(body) {
  if (typeof body !== 'string') return body
  try { return JSON.parse(body) } catch (_) {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(body.slice(start, end + 1)) } catch (__) {}
    }
    throw new Error('数据源返回无效JSON')
  }
}

export function nowText() { return new Date().toISOString() }

export function itemFor(code) {
  const item = FUND_MAP[String(code)]
  if (!item) throw new Error(`不支持的ETF代码: ${code}`)
  return { code: String(code), etfCode: String(code), ...item }
}

export function valuationIndexFor(code) {
  const item = itemFor(code)
  return { etfCode: item.etfCode, indexCode: item.indexCode, indexSymbol: item.indexSymbol, xqSymbol: item.xqSymbol || '', name: item.shortName }
}

export function marketSymbol(item) {
  return item.secid.startsWith('1.') ? `sh${item.code}` : `sz${item.code}`
}

export function average(values, count) {
  if (!Array.isArray(values) || values.length < count) return null
  let sum = 0
  for (let index = values.length - count; index < values.length; index += 1) sum += values[index]
  return sum / count
}

export function normalizeDate(value) {
  const raw = String(value || '').trim().replace(/[./]/g, '-')
  const matched = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!matched) return ''
  const [, year, month, day] = matched
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// 设备端蜡烛只用 o/c/h/l/time；但 volume/amount 必须保留——详情页概览卡在
// 实时行情缺失时会用最后一根日线回退成交量/成交额（见 overview.js）。其余字段
// (amplitude/changePct/change/turnover) 无任何读取点，勿加回。
export function parseKlineRow(row) {
  const parts = String(row || '').split(',')
  if (parts.length < 6) return null
  return { time: parts[0], o: finite(parts[1]), c: finite(parts[2]), h: finite(parts[3]), l: finite(parts[4]), volume: finite(parts[5]), amount: finite(parts[6]) }
}

export function parseTrendRow(row) {
  const parts = String(row || '').split(',')
  if (parts.length < 3) return null
  return { time: parts[0], c: finite(parts[2]), avg: finite(parts[7]) }
}

export function parseFlowRow(row) {
  const parts = String(row || '').split(',')
  if (parts.length < 2) return null
  return { time: parts[0], main: finite(parts[1]), small: finite(parts[2]), middle: finite(parts[3]), large: finite(parts[4]), superLarge: finite(parts[5]), mainPct: finite(parts[6]) }
}

export function parseQtimgKline(payload, symbol) {
  const data = payload && payload.data && payload.data[symbol]
  const rows = (data && (data.day || data.qfqday || data.hkday || data.usday)) || []
  return rows.map((row) => {
    if (!Array.isArray(row) || row.length < 6) return null
    return { time: normalizeDate(row[0]) || String(row[0]), o: finite(row[1]), c: finite(row[2]), h: finite(row[3]), l: finite(row[4]), volume: finite(row[5]) }
  }).filter(Boolean)
}
