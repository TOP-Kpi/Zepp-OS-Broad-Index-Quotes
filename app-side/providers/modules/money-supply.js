import { DIRECT_CONFIG } from '../../config'
import { finite, nowText, text, url } from './common'

// 东方财富宏观数据中心的"货币供应量"月报。
//
// 字段映射不是猜的：data.eastmoney.com/newstatic/js/cjsj/cn/hbgyl.js 里这个报表的
// columns 顺序与页面表头逐一对应——
//   BASIC_CURRENCY = 货币和准货币(M2)   CURRENCY = 货币(M1)   FREE_CASH = 流通中的现金(M0)
// 后缀 _SAME 是同比增长(%)、_SEQUENTIAL 是环比增长(%)。量级也自洽：M0 < M1 < M2
// （实测 14.8 万亿 < 115.8 万亿 < 356.8 万亿）。换报表前先重新核对这张对应表，
// 把 M1 和 M2 认错会得到一个符号相反、看上去仍然"合理"的剪刀差。
const REPORT_NAME = 'RPT_ECONOMY_CURRENCY_SUPPLY'
const REPORT_COLUMNS = [
  'REPORT_DATE', 'TIME',
  'BASIC_CURRENCY', 'BASIC_CURRENCY_SAME',
  'CURRENCY', 'CURRENCY_SAME',
  'FREE_CASH', 'FREE_CASH_SAME',
].join(',')

// 数据源给的是"2026年08月份"，REPORT_DATE 是"2026-08-01 00:00:00"。两者都留着：
// 前者用于展示（与数据源一致，不会因为本地时区/格式化方式不同而对不上），
// 后者裁剪成 YYYY-MM 用于排序与走势图的月份标签。
function monthKey(reportDate) {
  const matched = String(reportDate || '').match(/(\d{4})-(\d{2})/)
  return matched ? `${matched[1]}-${matched[2]}` : ''
}

function toPoint(row) {
  const month = monthKey(row && row.REPORT_DATE)
  if (!month) return null
  const m1Yoy = finite(row.CURRENCY_SAME)
  const m2Yoy = finite(row.BASIC_CURRENCY_SAME)
  if (m1Yoy === null || m2Yoy === null) return null
  return { month, m1Yoy, m2Yoy, gap: Math.round((m1Yoy - m2Yoy) * 10) / 10 }
}

export function createMoneySupplyProvider(transport) {
  return {
    async moneySupply(months) {
      const size = Math.max(2, Math.min(36, Number(months || 13)))
      return transport.cached(`moneysupply:${size}`, DIRECT_CONFIG.moneySupplyCacheMs, async () => {
        const raw = await transport.requestJson(url(DIRECT_CONFIG.dataCenterBase, '/api/data/v1/get', {
          reportName: REPORT_NAME, columns: REPORT_COLUMNS, source: 'WEB', client: 'WEB',
          pageNumber: 1, pageSize: size + 2, sortColumns: 'REPORT_DATE', sortTypes: '-1',
        }), {}, 6000)

        const rows = raw && raw.result && Array.isArray(raw.result.data) ? raw.result.data : []
        if (!rows.length) throw new Error('货币供应量数据为空')

        // 数据源按 REPORT_DATE 倒序返回；走势图与"最新月份"都按正序处理更省心。
        const points = rows.map(toPoint).filter(Boolean).reverse()
        if (!points.length) throw new Error('货币供应量缺少同比字段')

        const latestRow = rows[0]
        const latest = points[points.length - 1]
        return {
          month: latest.month,
          monthText: text(latestRow.TIME),
          m1: finite(latestRow.CURRENCY),
          m1Yoy: latest.m1Yoy,
          m2: finite(latestRow.BASIC_CURRENCY),
          m2Yoy: latest.m2Yoy,
          m0: finite(latestRow.FREE_CASH),
          m0Yoy: finite(latestRow.FREE_CASH_SAME),
          gap: latest.gap,
          points: points.slice(-size),
          source: '东方财富·货币供应量',
          updatedAt: nowText(),
        }
      })
    },
  }
}
