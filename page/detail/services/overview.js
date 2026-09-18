import { COLORS } from '../../../utils/constants'
import { requestOptions, requestWithCache } from '../../../utils/data'
import { compactMoney, fixed, shortDateTime, signColor, signed } from '../../../utils/format'
import { isStaleRuntimeError } from '../../../utils/runtime'
import { shouldRenderData } from '../../../utils/view-state'
import { updateSectionPage } from '../../../utils/navigation/index'

export function loadOverview(page, forceNetwork, options) {
  return requestWithCache(page, 'overview', { code: page.state.code, light: true }, requestOptions(forceNetwork, options))
    .then(function (result) {
      var data = result.data || {}
      var quote = data.quote || {}
      var q = page.state.quote
      q.price = fixed(quote.price, 3)
      q.change = signed(quote.change, 3)
      q.changePct = signed(quote.changePct, 2, '%')
      q.color = signColor(quote.changePct, COLORS)
      q.open = fixed(quote.open, 3)
      q.high = fixed(quote.high, 3)
      q.low = fixed(quote.low, 3)
      q.previousClose = fixed(quote.previousClose, 3)
      q.average = fixed(quote.average, 3)
      q.volume = compactMoney(quote.volume)
      q.amount = compactMoney(quote.amount)
      q.amplitude = signed(quote.amplitude, 2, '%')
      q.todayMain = compactMoney(quote.todayMain)
      q.todayMainColor = signColor(quote.todayMain, COLORS)
      q.source = quote.source || data.source || q.source || ''
      q.updatedAt = shortDateTime(quote.updatedAt || data.updatedAt)
      if (shouldRenderData(page, 'detail-overview', [q.price, q.change, q.changePct, q.open, q.high, q.low, q.average, q.volume, q.amount, q.amplitude, q.todayMain, q.updatedAt])) {
        updateSectionPage(page, 0, 'renderPage')
      }
      return result
    })
    .catch(function (error) {
      // Keep the last good screen. A temporary network failure should never
      // turn an already useful page back into placeholders.
      if (isStaleRuntimeError(error)) return null
      return null
    })
}
