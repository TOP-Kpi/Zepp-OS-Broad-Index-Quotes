import { COLORS } from '../../../utils/constants'
import { t } from '../../../utils/i18n'
import { requestOptions, requestWithCache } from '../../../utils/data'
import { fixed, signColor, signed } from '../../../utils/format'
import { isFiniteNumber } from '../../../utils/compat'
import { isStaleRuntimeError } from '../../../utils/runtime'
import { shouldRenderData } from '../../../utils/view-state'
import { updateSectionPage } from '../../../utils/navigation/index'

export function loadShares(page, forceNetwork, options) {
  return requestWithCache(page, 'shares', { code: page.state.code, months: 6, limit: 96 }, requestOptions(forceNetwork, options))
    .then(function (result) {
      var data = result.data || {}
      var points = Array.isArray(data.points) ? data.points : []
      var values = []
      var closes = []
      var dates = []
      var index
      for (index = 0; index < points.length && values.length < 96; index += 1) {
        var share = Number(points[index] && points[index].shareBillion)
        var close = Number(points[index] && points[index].close)
        if (!isFiniteNumber(share) || !isFiniteNumber(close) || share <= 0 || close <= 0) continue
        values.push(share)
        closes.push(close)
        dates.push(String(points[index] && points[index].time || ''))
      }
      var v = page.state.shares
      var previousNote = v.note
      v.values = values
      v.closes = closes
      v.dates = dates
      var latestShare = Number(data.latestBillion)
      var current = values.length ? values[values.length - 1] : latestShare
      var first = values.length > 1 ? values[0] : null
      var change = isFiniteNumber(current) && isFiniteNumber(first) ? current - first : null
      var changePct = isFiniteNumber(change) && isFiniteNumber(first) && first !== 0 ? change * 100 / first : null
      v.latest = isFiniteNumber(current) ? fixed(current, 2) + '亿份' : '--'
      v.change = isFiniteNumber(changePct) ? signed(changePct, 1, '%') : '--'
      v.changeAmount = isFiniteNumber(change) ? signed(change, 2, '亿份') : '--'
      v.changeColor = isFiniteNumber(change) ? signColor(change, COLORS) : COLORS.muted
      // Preserve a previous note when a single point remains; the old code
      // compared against the just-overwritten array and could never keep it.
      v.note = values.length > 1
        ? (data.note || t('近6个月份额趋势'))
        : (previousNote || (values.length === 1 ? t('近6个月份额趋势') : t('份额历史暂不可用')))
      if (shouldRenderData(page, 'detail-shares', [v.latest, v.change, v.changeAmount, v.note, values, closes, dates])) {
        updateSectionPage(page, 3, 'renderPage')
      }
      return result
    })
    .catch(function (error) {
      if (isStaleRuntimeError(error)) return null
      var v = page.state.shares
      if (!Array.isArray(v.values) || v.values.length < 2) {
        v.note = t('份额数据暂不可用')
        if (shouldRenderData(page, 'detail-shares-error', [v.note])) updateSectionPage(page, 3, 'renderPage')
      }
      return null
    })
}
