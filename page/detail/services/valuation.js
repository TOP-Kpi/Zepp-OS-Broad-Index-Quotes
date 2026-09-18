import { requestOptions, requestWithCache } from '../../../utils/data'
import { fixed } from '../../../utils/format'
import { isFiniteNumber } from '../../../utils/compat'
import { isStaleRuntimeError } from '../../../utils/runtime'
import { shouldRenderData } from '../../../utils/view-state'
import { updateSectionPage } from '../../../utils/navigation/index'

export function loadValuation(page, forceNetwork, options) {
  return requestWithCache(page, 'valuation', { code: page.state.code }, requestOptions(forceNetwork, options))
    .then(function (result) {
      var data = result.data || {}
      var points = Array.isArray(data.points) ? data.points : []
      var values = []
      var indexValues = []
      var dates = []
      var index
      for (index = 0; index < points.length && values.length < 60; index += 1) {
        var pe = Number(points[index] && points[index].pe)
        if (!isFiniteNumber(pe) || pe <= 0) continue
        var indexClose = Number(points[index] && points[index].indexClose)
        values.push(pe)
        indexValues.push(isFiniteNumber(indexClose) && indexClose > 0 ? indexClose : null)
        dates.push(String(points[index] && points[index].time || ''))
      }
      var v = page.state.valuation
      v.values = values
      v.indexValues = indexValues
      v.dates = dates
      v.currentPeValue = isFiniteNumber(Number(data.currentPe)) ? Number(data.currentPe) : null
      v.percentileValue = isFiniteNumber(Number(data.percentile)) ? Number(data.percentile) : null
      v.p20 = isFiniteNumber(Number(data.p20)) ? Number(data.p20) : null
      v.p80 = isFiniteNumber(Number(data.p80)) ? Number(data.p80) : null
      v.maxPe = isFiniteNumber(Number(data.maxPe)) ? Number(data.maxPe) : null
      v.minPe = isFiniteNumber(Number(data.minPe)) ? Number(data.minPe) : null
      v.avgPe = isFiniteNumber(Number(data.avgPe)) ? Number(data.avgPe) : null
      v.currentIndex = isFiniteNumber(Number(data.currentIndex)) ? Number(data.currentIndex) : null
      v.currentPe = v.currentPeValue === null ? '--' : fixed(v.currentPeValue, 2)
      v.percentile = v.percentileValue === null ? '--' : fixed(v.percentileValue, 2) + '%'
      v.indexCode = String(data.indexCode || '')
      v.indexName = String(data.name || '')
      v.note = values.length >= 24 ? '近5年PE-TTM · 月频' : 'PE历史数据不足'
      if (shouldRenderData(page, 'detail-valuation', [
        v.currentPe, v.percentile, v.p20, v.p80, v.maxPe, v.minPe, v.avgPe,
        v.currentIndex, v.indexCode, v.indexName, v.note, values, indexValues, dates,
      ])) {
        updateSectionPage(page, 5, 'renderPage')
      }
      return result
    })
    .catch(function (error) {
      if (isStaleRuntimeError(error)) return null
      var v = page.state.valuation
      if (!Array.isArray(v.values) || v.values.length < 24) {
        v.note = '指数PE历史暂不可用'
        if (shouldRenderData(page, 'detail-valuation-error', [v.note])) updateSectionPage(page, 5, 'renderPage')
      }
      return null
    })
}
