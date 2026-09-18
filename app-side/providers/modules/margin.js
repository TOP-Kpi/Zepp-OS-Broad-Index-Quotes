import { DIRECT_CONFIG } from '../../config'
import { finite, itemFor, nowText, text, url } from './common'

export function createMarginProvider(transport) {
  async function margin(code, limit) {
    // 白名单校验与其余 provider 对齐：code 直接拼进数据中心 filter 查询串，
    // 未校验的任意字符串可越界查询非自选标的，甚至破坏查询条件结构。
    const item = itemFor(code)
    const size = Math.max(1, Math.min(60, Number(limit || 60)))
    return transport.cached(`margin:${item.code}:${size}`, DIRECT_CONFIG.marginCacheMs, async () => {
      const raw = await transport.requestJson(url(DIRECT_CONFIG.dataCenterBase, '/api/data/v1/get', {
        reportName: 'RPTA_WEB_RZRQ_GGMX', columns: 'ALL', source: 'WEB', client: 'WEB', pageNumber: 1, pageSize: size,
        sortColumns: 'DATE', sortTypes: '-1', filter: `(SCODE="${item.code}")`,
      }), {}, 5200)
      const rows = raw && raw.result && Array.isArray(raw.result.data) ? raw.result.data : []
      const points = rows.map((row) => ({
        time: text(row.DATE).slice(0, 10), balance: finite(row.RZYE), buy: finite(row.RZMRE), repay: finite(row.RZCHE), netBuy: finite(row.RZJME), close: finite(row.SPJ),
      })).reverse()
      return { code: item.code, points, source: '东方财富手机直连', updatedAt: nowText() }
    })
  }
  return { margin }
}
