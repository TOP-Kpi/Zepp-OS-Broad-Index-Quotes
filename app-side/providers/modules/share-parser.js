import { finite, normalizeDate } from './common'

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim()
}

function parseEastmoneyArchiveShareToBillion(value, header) {
  const raw = String(value || '').replace(/,/g, '').trim()
  const unitHint = String(header || '')
  if (!raw || raw === '--' || raw === '-') return null
  const number = finite(raw.replace(/[^\d.+-]/g, ''))
  if (number === null || number < 0) return null
  if (raw.includes('亿') || unitHint.includes('亿')) return number
  if (raw.includes('万') || unitHint.includes('万')) return number / 10000
  if (/[（(]\s*份\s*[)）]/.test(unitHint) || /单位\s*[:：]?\s*份/.test(unitHint)) return number / 100000000
  // Eastmoney's scale-change archive commonly labels the column in the
  // header. If the unit is absent, reject the value rather than guessing.
  return null
}

function normalizeDaySeries(points, maximum = 120) {
  const rows = (Array.isArray(points) ? points : []).filter((item) => item && item.time).map((item) => ({ ...item, time: normalizeDate(item.time) || item.time })).filter((item) => item.time)
  return rows.length ? rows.slice(Math.max(0, rows.length - maximum)) : []
}

function recentThreeMonths(points) {
  if (!points.length) return []
  const latest = String(points[points.length - 1].time || '')
  const matched = latest.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return points.slice(-90)
  let year = Number(matched[1])
  let month = Number(matched[2]) - 3
  const day = Number(matched[3])
  while (month <= 0) { month += 12; year -= 1 }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const safeDay = Math.min(day, lastDay)
  const cutoff = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(safeDay).padStart(2, '0')
  return points.filter((item) => String(item.time || '') >= cutoff).slice(-90)
}

function recentMonths(points, months, maximum) {
  if (!points.length) return []
  const latest = String(points[points.length - 1].time || '')
  const matched = latest.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return points.slice(-Math.max(1, Number(maximum || 132)))
  let year = Number(matched[1])
  let month = Number(matched[2]) - Math.max(1, Number(months || 6))
  const day = Number(matched[3])
  while (month <= 0) { month += 12; year -= 1 }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const safeDay = Math.min(day, lastDay)
  const cutoff = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(safeDay).padStart(2, '0')
  return points.filter((item) => String(item.time || '') >= cutoff).slice(-Math.max(1, Number(maximum || 132)))
}

export function extractFundArchiveContent(raw) {
  const source = String(raw || '')
  if (source.includes('<table')) return source
  const match = source.match(/content\s*:\s*"([\s\S]*?)"\s*,\s*(?:records|pages|curpage|expander)/i)
  if (!match) return source
  return match[1].replace(/\\r\\n/g, '').replace(/\\n/g, '').replace(/\\t/g, '').replace(/\\\//g, '/').replace(/\\"/g, '"')
}

export function parseTableRows(htmlText) {
  const rows = []
  String(htmlText || '').replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, inner) => {
    const cells = []
    String(inner).replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (__unused, cellText) => { cells.push(stripHtml(cellText)); return '' })
    if (cells.length) rows.push(cells)
    return ''
  })
  return rows
}

function findHeaderIndex(headers, patterns) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = String(headers[index] || '')
    if (patterns.some((pattern) => pattern.test(header))) return index
  }
  return -1
}

export function parseShareHistoryRows(rows) {
  if (!rows.length) return []
  const headers = rows[0]
  const body = rows.slice(1)
  const dateIndex = findHeaderIndex(headers, [/日期/, /截止/, /净值日期/, /交易日/, /报告期/])
  const shareIndex = findHeaderIndex(headers, [/基金份额/, /期末总份额/, /总份额/, /份额\(/, /份额（/, /规模\(/])
  const shareHeader = shareIndex >= 0 ? String(headers[shareIndex] || '') : ''
  const result = body.map((cells) => {
    const normalizedDate = normalizeDate(dateIndex >= 0 ? cells[dateIndex] : cells[0])
    if (!normalizedDate) return null
    let shareCell = shareIndex >= 0 ? cells[shareIndex] : ''
    let selectedShareHeader = shareHeader
    if (!shareCell) {
      for (let index = cells.length - 1; index >= 1; index -= 1) {
        if (parseEastmoneyArchiveShareToBillion(cells[index], headers[index]) !== null) {
          shareCell = cells[index]
          selectedShareHeader = String(headers[index] || '')
          break
        }
      }
    }
    const shareBillion = parseEastmoneyArchiveShareToBillion(shareCell, selectedShareHeader)
    return shareBillion === null ? null : { time: normalizedDate, shareBillion }
  }).filter(Boolean)
  const seen = {}
  result.forEach((item) => { seen[item.time] = item.shareBillion })
  return Object.keys(seen).sort().map((time) => ({ time, shareBillion: seen[time] }))
}

function fillShareSeries(points) {
  const values = points.map((item) => finite(item.shareBillion))
  let lastKnown = null
  for (let index = 0; index < values.length; index += 1) { if (values[index] !== null) lastKnown = values[index]; else if (lastKnown !== null) values[index] = lastKnown }
  let nextKnown = null
  for (let index = values.length - 1; index >= 0; index -= 1) { if (values[index] !== null) nextKnown = values[index]; else if (nextKnown !== null) values[index] = nextKnown }
  return points.map((item, index) => ({ ...item, shareBillion: values[index] }))
}

export function mergeDailyShareClose(closePoints, sharePoints, latestShareBillion) {
  const closes = recentMonths(normalizeDaySeries(closePoints, 180), 6, 132)
  const shares = normalizeDaySeries(sharePoints, 240)
  let shareIndex = 0
  let currentShare = null

  const merged = closes.map((item) => {
    while (shareIndex < shares.length && String(shares[shareIndex].time) <= String(item.time)) {
      if (Number.isFinite(shares[shareIndex].shareBillion)) currentShare = shares[shareIndex].shareBillion
      shareIndex += 1
    }
    return {
      time: item.time,
      close: finite(item.c !== undefined ? item.c : item.close),
      shareBillion: currentShare,
    }
  })

  const historyAvailable = shares.length > 1
  if (Number.isFinite(latestShareBillion) && merged.length) merged[merged.length - 1].shareBillion = latestShareBillion

  const completed = fillShareSeries(merged).filter((item) => Number.isFinite(item.close) && Number.isFinite(item.shareBillion))
  return { points: completed, historyAvailable }
}

export function mergeSnapshotShareClose(
  closePoints,
  sharePoints,
  latestShareBillion
) {
  const closes = normalizeDaySeries(closePoints, 180)
  const shares = normalizeDaySeries(sharePoints, 80)

  const closeByDate = {}

  for (let index = 0; index < closes.length; index += 1) {
    const item = closes[index]

    const close = finite(
      item.c !== undefined
        ? item.c
        : item.close
    )

    if (
      item.time &&
      close !== null
    ) {
      closeByDate[item.time] = close
    }
  }

  const merged = []

  for (let index = 0; index < shares.length; index += 1) {
    const item = shares[index]

    const share = finite(item.shareBillion)
    const close = finite(closeByDate[item.time])

    if (
      share === null ||
      close === null
    ) {
      continue
    }

    merged.push({
      time: item.time,
      shareBillion: share,
      close: close,
    })
  }

  if (
    merged.length &&
    Number.isFinite(latestShareBillion)
  ) {
    merged[merged.length - 1].shareBillion =
      latestShareBillion
  }

  return {
    points: merged,
    historyAvailable: merged.length > 1,
  }
}