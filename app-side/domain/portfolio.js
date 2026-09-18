import { readBoolSetting, readNumberSetting } from './settings'
import { ETF_CATALOG } from './etf-catalog'
import { finite } from './finite'

// 显示用投影：持仓只消费 code/name/shortName/indexCode。
export const ETF_UNIVERSE = ETF_CATALOG.map((item) => ({
  code: item.code, name: item.name, shortName: item.shortName, indexCode: item.indexCode,
}))

export function portfolioFromUniverse(universe) {
  const byCode = {}
  ;(Array.isArray(universe) ? universe : []).forEach((item) => { if (item && item.code) byCode[item.code] = item })
  const positions = ETF_UNIVERSE.filter((item) => readBoolSetting(`position.${item.code}.enabled`, false)).map((item) => {
    const remote = byCode[item.code] || {}
    const price = finite(remote.quote && remote.quote.price), changePct = finite(remote.quote && remote.quote.changePct)
    const cost = readNumberSetting(`position.${item.code}.cost`, 0), weight = readNumberSetting(`position.${item.code}.weight`, 0)
    const returnPct = price !== null && cost > 0 ? (price / cost - 1) * 100 : null
    return { ...item, price, changePct, cost, weight, returnPct, signal: remote.signal || null }
  })
  const totalWeight = positions.reduce((sum, item) => sum + Math.max(0, Number(item.weight || 0)), 0)
  const weightedReturn = positions.reduce((sum, item) => sum + (Number.isFinite(item.returnPct) ? item.returnPct * Math.max(0, Number(item.weight || 0)) : 0), 0)
  const weightedToday = positions.reduce((sum, item) => sum + (Number.isFinite(item.changePct) ? item.changePct * Math.max(0, Number(item.weight || 0)) : 0), 0)
  return { totalWeight, returnPct: totalWeight > 0 ? weightedReturn / totalWeight : null, todayPct: totalWeight > 0 ? weightedToday / totalWeight : null, positions, source: '东方财富 + 腾讯回退' }
}
