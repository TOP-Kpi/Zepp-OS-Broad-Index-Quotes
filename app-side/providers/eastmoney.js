import { createTransport } from './modules/transport'
import { DIRECT_CONFIG } from '../config'
import { createQuoteProvider } from './modules/quote'
import { createChartProvider } from './modules/chart'
import { createFlowProvider } from './modules/flow'
import { createMarginProvider } from './modules/margin'
import { createSharesProvider } from './modules/shares'
import { createOverviewProvider } from './modules/overview'
import { createValuationProvider } from './modules/valuation'
import { createUniverseProvider } from './modules/universe'
import { createMoneySupplyProvider } from './modules/money-supply'

export function createEastmoneyProvider() {
  const transport = createTransport()
  const quoteProvider = createQuoteProvider(transport)
  const chartProvider = createChartProvider(transport)
  const marginProvider = createMarginProvider(transport)
  const sharesProvider = createSharesProvider(transport, chartProvider.chart)
  const flowProvider = createFlowProvider(transport, quoteProvider.quote, sharesProvider.shares)
  const valuationProvider = createValuationProvider(transport)
  const overviewProvider = createOverviewProvider(
    transport,
    quoteProvider.quote,
    chartProvider.chart,
    flowProvider.flow,
    marginProvider.margin,
    sharesProvider.shares,
    valuationProvider.valuation,
  )
  const universeProvider = createUniverseProvider(transport, quoteProvider.batchQuotes)
  const moneySupplyProvider = createMoneySupplyProvider(transport)

  return {
    quote: quoteProvider.quote,
    batchQuotes: quoteProvider.batchQuotes,
    chart: chartProvider.chart,
    flow: flowProvider.flow,
    margin: marginProvider.margin,
    shares: sharesProvider.shares,
    valuation: valuationProvider.valuation,
    overview: overviewProvider.overview,
    overviewLight: overviewProvider.overviewLight,
    // B2：只读窥探 overview 缓存，未过期时 dashboard 可顺带返回 signal。
    peekOverview: (code) => transport.peek(`overview:${code}:full`, DIRECT_CONFIG.overviewCacheMs),
    universe: universeProvider.universe,
    moneySupply: moneySupplyProvider.moneySupply,
  }
}
