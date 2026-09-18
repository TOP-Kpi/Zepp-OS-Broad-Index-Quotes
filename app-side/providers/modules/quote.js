import { DIRECT_CONFIG } from '../../config'
import { FUND_MAP, itemFor, marketSymbol, url } from './common'
import { parseTencentQuotePayload, quoteFromEastmoneyRow } from './quote-parser'

export function createQuoteProvider(transport) {
  async function tencentQuotes(codes) {
    const list = (Array.isArray(codes) ? codes : [codes]).map(String).filter((code) => FUND_MAP[code])
    if (!list.length) return {}
    const symbols = list.map((code) => marketSymbol(itemFor(code)))
    const raw = await transport.requestText(`https://qt.gtimg.cn/q=${symbols.join(',')}`, {}, 4200)
    const parsed = parseTencentQuotePayload(raw)
    if (!Object.keys(parsed).length) throw new Error('腾讯实时行情暂无数据')
    return parsed
  }

  async function eastmoneyBatchQuotes(codes) {
    const list = (Array.isArray(codes) ? codes : [codes]).map(String).filter((code) => FUND_MAP[code])
    const secids = list.map((code) => itemFor(code).secid)
    const raw = await transport.requestJson(url(DIRECT_CONFIG.quoteBase, '/api/qt/ulist.np/get', {
      fltt: 2, invt: 2, fields: 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18',
      secids: secids.join(','), plat: 'Iphone', product: 'EFund', version: '6.3.8',
    }), {}, 5200)
    const rows = raw && raw.data && Array.isArray(raw.data.diff) ? raw.data.diff : []
    if (!rows.length) throw new Error('东方财富批量行情暂无数据')
    const result = {}
    rows.forEach((row) => {
      const code = String(row && row.f12 || '')
      if (!FUND_MAP[code]) return
      result[code] = quoteFromEastmoneyRow(itemFor(code), row)
      result[code].source = '东方财富批量行情'
    })
    return result
  }

  const QUOTE_NEGATIVE_TTL_MS = 20 * 1000

  async function batchQuotes(codes = Object.keys(FUND_MAP)) {
    const list = (Array.isArray(codes) ? codes : [codes]).map(String).filter((code) => FUND_MAP[code])
    const negativeKey = `quotes-empty:${list.join(',')}`
    return transport.cached(`quotes:${list.join(',')}`, DIRECT_CONFIG.quoteCacheMs, async () => {
      // A3 负缓存改为读取端生效（旧版把 {} 当成功返回，只写不读、防打源为零）：
      // 全源失败后 20s 内直接快速失败，不再每轮刷新都打满东财+腾讯两连击。
      if (transport.peek(negativeKey, QUOTE_NEGATIVE_TTL_MS)) {
        throw new Error('实时行情全源失败熔断中')
      }
      let primary = {}
      try { primary = await eastmoneyBatchQuotes(list) } catch (_) {}
      const missing = list.filter((code) => !primary[code] || primary[code].price === null)
      if (missing.length) {
        try {
          const fallback = await tencentQuotes(missing)
          missing.forEach((code) => { if (fallback[code]) primary[code] = fallback[code] })
        } catch (_) {}
      }
      if (!Object.keys(primary).length) {
        // 全源失败必须向上传播（而非伪装成空成功）：universe→dashboard 随之抛错，
        // 手表端按 BLE 失败语义回退过期缓存，保住“离线仍有上帧”，不再被全 '--'
        // 空行情覆盖本地最后一帧好数据。
        await transport.cached(negativeKey, QUOTE_NEGATIVE_TTL_MS, async () => true)
        throw new Error('实时行情主源与回退源均不可用')
      }
      return primary
    })
  }

  async function quote(code) {
    const item = itemFor(code)
    return transport.cached(`quote:${code}`, DIRECT_CONFIG.quoteCacheMs, async () => {
      try {
        const data = await transport.requestJson(url(DIRECT_CONFIG.quoteBase, '/api/qt/stock/get', {
          secid: item.secid, fltt: 2, invt: 2,
          fields: 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f62,f71,f162,f167,f169,f170,f171',
        }), {}, 5200)
        const d = data && data.data
        if (!d) throw new Error('东方财富实时行情暂不可用')
        return quoteFromEastmoneyRow(item, d)
      } catch (primaryError) {
        const fallback = await tencentQuotes([code])
        if (fallback[code]) return fallback[code]
        throw primaryError
      }
    })
  }

  return { quote, batchQuotes }
}
