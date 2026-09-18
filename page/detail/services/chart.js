import { requestOptions, requestWithCache } from '../../../utils/data'
import { updateSectionPage } from '../../../utils/navigation/index'
import { isStaleRuntimeError } from '../../../utils/runtime'

function bucketForPeriod(period) { return period === 'day' ? 'dayPoints' : 'intradayPoints' }
function preparedKeyForPeriod(period) { return period === 'day' ? 'dayPrepared' : 'intradayPrepared' }
function stampKeyForPeriod(period) { return period === 'day' ? 'dayStamp' : 'intradayStamp' }

// 上界必须与 app-side/domain/compact.js 的 compactResponse 一致：side 在过蓝牙
// 前已把 chart points 采样到 day 90 / 分时 96，所以这里通常是空操作——它只兜底
// 旧版本缓存（可能仍有多于 96 个点）。改其中一处必须同时改另一处，否则要么白采样
// 一次，要么设备端悄悄丢点（点数会显示在图表底部"N根"上）。
var CHART_POINT_LIMITS = { day: 90, intraday: 96 }

function sanitizeChartPoints(points, period) {
  var source = Array.isArray(points) ? points : []
  var max = period === 'day' ? CHART_POINT_LIMITS.day : CHART_POINT_LIMITS.intraday
  if (source.length <= max) return source
  return source.slice(source.length - max)
}

function pointPart(point) {
  if (!point) return ''
  var price = point.c !== undefined ? point.c : point.close
  return String(point.time || '') + ':' + String(price === undefined || price === null ? '' : price) + ':' + String(point.avg === undefined || point.avg === null ? '' : point.avg)
}

function chartStamp(points) {
  var rows = Array.isArray(points) ? points : []
  if (!rows.length) return '0'
  var middle = Math.floor(rows.length / 2)
  return String(rows.length) + '|' + pointPart(rows[0]) + '|' + pointPart(rows[middle]) + '|' + pointPart(rows[rows.length - 1])
}

export function loadChart(page, forceNetwork, periodOverride, options) {
  var requestedPeriod = periodOverride === 'day' ? 'day' : (periodOverride === 'intraday' ? 'intraday' : page.state.period)
  var bucket = bucketForPeriod(requestedPeriod)
  var preparedKey = preparedKeyForPeriod(requestedPeriod)
  var stampKey = stampKeyForPeriod(requestedPeriod)
  var previousPoints = Array.isArray(page.state.chart[bucket]) ? page.state.chart[bucket] : []
  if (page.state.period === requestedPeriod && previousPoints.length === 0) page.state.chart.loading = true

  return requestWithCache(page, 'chart', { code: page.state.code, period: requestedPeriod }, requestOptions(forceNetwork, options))
    .then(function (result) {
      var data = result.data || {}
      var points = sanitizeChartPoints(data.points, requestedPeriod)
      var nextStamp = chartStamp(points)
      var unchanged = page.state.chart[stampKey] === nextStamp && previousPoints.length > 0
      if (!unchanged) {
        page.state.chart[bucket] = points
        page.state.chart[stampKey] = nextStamp
        page.state.chart[preparedKey] = null
      }
      if (page.state.period === requestedPeriod) {
        page.state.chart.loading = false
        if (!unchanged) {
          page.state.chart.updatedAt = data.updatedAt || page.state.chart.updatedAt || ''
          page.state.chart.points = points
          updateSectionPage(page, 1, 'renderPage', 36)
        } else if (page.state.chart.points !== page.state.chart[bucket]) {
          page.state.chart.points = page.state.chart[bucket]
        }
      }
      return result
    })
    .catch(function (error) {
      if (isStaleRuntimeError(error)) return null
      if (page.state.period === requestedPeriod) {
        page.state.chart.points = previousPoints
        page.state.chart.loading = false
        if (!previousPoints.length) updateSectionPage(page, 1, 'renderPage', 36)
      }
      return null
    })
}
