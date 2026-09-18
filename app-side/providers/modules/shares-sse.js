import { finite, normalizeDate, url } from './common'

const SSE_ETF_SCALE_API = 'https://query.sse.com.cn/commonQuery.do'
const SSE_ETF_SCALE_SQL = 'COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L'
const SSE_SCALE_SAMPLE_COUNT = 12
const SSE_SCALE_CONCURRENCY = 4
const SSE_HEADERS = {
  Referer: 'https://www.sse.com.cn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
}

function sseTradingDates(points) {
  const unique = {}
  for (let index = 0; index < (Array.isArray(points) ? points.length : 0); index += 1) {
    const time = normalizeDate(points[index] && points[index].time)
    if (time) unique[time] = true
  }
  const dates = Object.keys(unique).sort()
  if (!dates.length) return []
  const latest = dates[dates.length - 1].match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!latest) return dates.slice(-132)
  let year = Number(latest[1])
  let month = Number(latest[2]) - 6
  const day = Number(latest[3])
  while (month <= 0) { month += 12; year -= 1 }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cutoff = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  return dates.filter((date) => date >= cutoff)
}

function selectSseScaleSnapshotDates(dayPoints) {
  const dates = sseTradingDates(dayPoints)
  if (dates.length <= SSE_SCALE_SAMPLE_COUNT) return dates

  // Reserve the last three actual trading days. SSE scale data is published
  // after trading; if the newest date is not ready yet, the previous day is
  // still queried instead of falling back to a snapshot two weeks old.
  const recent = dates.slice(-3)
  const older = dates.slice(0, -3)
  const historicalSlots = SSE_SCALE_SAMPLE_COUNT - recent.length
  const selected = []
  for (let index = 0; index < historicalSlots; index += 1) {
    const position = historicalSlots === 1 ? older.length - 1 : Math.round(index * (older.length - 1) / (historicalSlots - 1))
    const date = older[position]
    if (date && selected.indexOf(date) < 0) selected.push(date)
  }
  for (let index = 0; index < recent.length; index += 1) {
    if (selected.indexOf(recent[index]) < 0) selected.push(recent[index])
  }
  return selected.sort()
}

function parseSseScaleSnapshot(raw, code, requestedDate) {
  const rows = raw && Array.isArray(raw.result) ? raw.result : []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {}
    if (String(row.SEC_CODE || '').trim() !== String(code)) continue
    const rawTenThousandShares = finite(String(row.TOT_VOL === undefined || row.TOT_VOL === null ? '' : row.TOT_VOL).replace(/,/g, ''))
    if (rawTenThousandShares === null || rawTenThousandShares <= 0) return null
    const time = normalizeDate(row.STAT_DATE) || normalizeDate(requestedDate)
    if (!time) return null
    // The SSE endpoint's TOT_VOL is in 10,000 shares. AKShare multiplies this
    // field by 10,000 to expose absolute shares. For the watch UI we convert
    // directly to 100-million-share units: TOT_VOL / 10,000.
    return { time, shareBillion: rawTenThousandShares / 10000 }
  }
  return null
}

async function requestSseScaleSnapshot(transport, code, date) {
  const target = url(SSE_ETF_SCALE_API, '', {
    isPagination: 'true',
    'pageHelp.pageSize': '10000',
    'pageHelp.pageNo': '1',
    'pageHelp.beginPage': '1',
    'pageHelp.cacheSize': '1',
    'pageHelp.endPage': '1',
    sqlId: SSE_ETF_SCALE_SQL,
    STAT_DATE: date,
  })
  const raw = await transport.requestJson(target, { headers: SSE_HEADERS }, 2800)
  return parseSseScaleSnapshot(raw, code, date)
}

function dedupeSseSnapshots(points) {
  const byDate = {}
  for (let index = 0; index < (Array.isArray(points) ? points.length : 0); index += 1) {
    const point = points[index]
    if (!point || !point.time || !Number.isFinite(point.shareBillion) || point.shareBillion <= 0) continue
    byDate[point.time] = point
  }
  return Object.keys(byDate).sort().map((date) => byDate[date])
}

export async function loadSseEtfShareSnapshots(transport, code, dayPoints) {
  const dates = selectSseScaleSnapshotDates(dayPoints)
  if (!dates.length) throw new Error('上交所ETF份额缺少交易日锚点')

  const snapshots = []
  // Keep first-load latency bounded. Twelve representative six-month samples
  // are enough for the watch trend chart; four concurrent phone-side requests
  // avoid the former long serial tail while still limiting burst pressure.
  for (let index = 0; index < dates.length; index += SSE_SCALE_CONCURRENCY) {
    const batch = []
    for (let offset = 0; offset < SSE_SCALE_CONCURRENCY; offset += 1) {
      const date = dates[index + offset]
      if (date) batch.push(requestSseScaleSnapshot(transport, code, date).catch(() => null))
    }
    const results = await Promise.all(batch)
    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) if (results[resultIndex]) snapshots.push(results[resultIndex])
  }

  const points = dedupeSseSnapshots(snapshots)
  if (!points.length) throw new Error('上交所ETF份额快照暂无数据')
  return points
}
