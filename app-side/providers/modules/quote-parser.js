import { FUND_MAP, finite, itemFor, nowText, text } from './common'

export function quoteFromEastmoneyRow(item, d) {
  const price = finite(d && (d.f43 !== undefined ? d.f43 : d.f2))
  const previousClose = finite(d && (d.f60 !== undefined ? d.f60 : d.f18))
  const changePct = finite(d && (d.f170 !== undefined ? d.f170 : d.f3))
  return {
    code: item.code,
    name: text(d && d.f14 !== undefined ? d.f14 : d && d.f58, item.name),
    shortName: item.shortName,
    price,
    changePct: changePct !== null ? changePct : (price !== null && previousClose ? (price / previousClose - 1) * 100 : null),
    change: finite(d && (d.f169 !== undefined ? d.f169 : d.f4)),
    open: finite(d && (d.f46 !== undefined ? d.f46 : d.f17)),
    high: finite(d && (d.f44 !== undefined ? d.f44 : d.f15)),
    low: finite(d && (d.f45 !== undefined ? d.f45 : d.f16)),
    previousClose,
    average: finite(d && d.f71),
    volume: finite(d && (d.f47 !== undefined ? d.f47 : d.f5)),
    amount: finite(d && (d.f48 !== undefined ? d.f48 : d.f6)),
    todayMain: finite(d && d.f62), pe: finite(d && d.f162), pb: finite(d && d.f167), amplitude: finite(d && d.f171),
    // Real-time quote fields are not ETF fund-share disclosures. Keep fund
    // shares exclusively in the exchange-specific share providers.
    latestShares: null,
    latestSharesBillion: null,
    updatedAt: nowText(), source: '东方财富手机直连',
  }
}

export function parseTencentQuotePayload(raw) {
  const result = {}
  String(raw || '').split(/;\s*/).forEach((line) => {
    const matched = line.match(/v_([a-z]{2}\d+)="([\s\S]*?)"/i)
    if (!matched) return
    const symbol = matched[1].toLowerCase()
    const parts = matched[2].split('~')
    const code = String(parts[2] || symbol.slice(2))
    if (!FUND_MAP[code]) return
    const item = itemFor(code)
    const price = finite(parts[3])
    const previousClose = finite(parts[4])
    result[code] = {
      code, name: text(parts[1], item.name), shortName: item.shortName, price, previousClose,
      open: finite(parts[5]), high: finite(parts[33]), low: finite(parts[34]), change: finite(parts[31]),
      changePct: finite(parts[32]) !== null ? finite(parts[32]) : (price !== null && previousClose ? (price / previousClose - 1) * 100 : null),
      volume: finite(parts[36]), amount: finite(parts[37]), average: null, todayMain: null, pe: null, pb: null, amplitude: finite(parts[43]),
      latestShares: null, latestSharesBillion: null, updatedAt: parts[30] || nowText(), source: '腾讯实时行情回退',
    }
  })
  return result
}
