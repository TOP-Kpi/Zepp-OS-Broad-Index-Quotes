import { COLORS } from '../../../utils/constants'
import { requestOptions, requestWithCache } from '../../../utils/data'
import { compactMoney, latest, signColor, signed } from '../../../utils/format'
import { isFiniteNumber } from '../../../utils/compat'
import { isStaleRuntimeError } from '../../../utils/runtime'
import { shouldRenderData } from '../../../utils/view-state'
import { updateSectionPage } from '../../../utils/navigation/index'

export function loadFlow(page, forceNetwork, options) {
  return requestWithCache(page, 'flow', { code: page.state.code }, requestOptions(forceNetwork, options))
    .then(function (result) {
      var data = result.data || {}
      var today = data.today || {}
      var intervals = Array.isArray(data.intervals) ? data.intervals : []
      var intervalMain = isFiniteNumber(Number(data.intervalMain)) ? Number(data.intervalMain) : (latest(intervals) ? latest(intervals).main : null)
      var shareSubscription = isFiniteNumber(Number(data.shareSubscriptionBillion)) ? Number(data.shareSubscriptionBillion) : null
      var v = page.state.flow
      v.today = compactMoney(today.main)
      v.todayColor = signColor(today.main, COLORS)
      v.interval = compactMoney(intervalMain)
      v.intervalColor = signColor(intervalMain, COLORS)
      v.offMarket = isFiniteNumber(shareSubscription) ? signed(shareSubscription, 2, '亿份') : '--'
      v.offMarketColor = signColor(shareSubscription, COLORS)
      v.bars = intervals.map(function (item) { return item.main }).slice(-60)
      if (shouldRenderData(page, 'detail-flow', [v.today, v.interval, v.offMarket, v.bars])) updateSectionPage(page, 2, 'renderPage')
      return result
    })
    .catch(function (error) {
      if (isStaleRuntimeError(error)) return null
      return null
    })
}
