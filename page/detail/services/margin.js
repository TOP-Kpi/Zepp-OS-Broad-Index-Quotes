import { COLORS } from '../../../utils/constants'
import { requestOptions, requestWithCache } from '../../../utils/data'
import { compactMoney, latest, signColor } from '../../../utils/format'
import { isFiniteNumber } from '../../../utils/compat'
import { isStaleRuntimeError } from '../../../utils/runtime'
import { shouldRenderData } from '../../../utils/view-state'
import { updateSectionPage } from '../../../utils/navigation/index'

export function loadMargin(page, forceNetwork, options) {
  return requestWithCache(page, 'margin', { code: page.state.code, limit: 60 }, requestOptions(forceNetwork, options))
    .then(function (result) {
      var data = result.data || {}
      var points = Array.isArray(data.points) ? data.points : []
      var bars = []
      var index
      for (index = Math.max(0, points.length - 60); index < points.length; index += 1) {
        var value = Number(points[index] && points[index].netBuy)
        if (isFiniteNumber(value)) bars.push(value)
      }
      var v = page.state.margin
      v.bars = bars
      var last = latest(points)
      v.net = last ? compactMoney(last.netBuy) : v.net
      v.netColor = last ? signColor(last.netBuy, COLORS) : v.netColor
      v.balance = last ? compactMoney(last.balance) : v.balance
      if (shouldRenderData(page, 'detail-margin', [v.net, v.balance, bars])) updateSectionPage(page, 4, 'renderPage')
      return result
    })
    .catch(function (error) {
      if (isStaleRuntimeError(error)) return null
      return null
    })
}
