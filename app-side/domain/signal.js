import { readBoolSetting, readNumberSetting } from './settings'
import { finite } from './finite'

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }

export function normalizeAction(value) {
  const raw = String(value || '').trim().toUpperCase()
  const aliases = {
    BUY: 'BUY', '分批买入': 'BUY', '买入': 'BUY',
    HOLD: 'HOLD', '继续持有': 'HOLD', '持有': 'HOLD',
    WATCH: 'WATCH', '耐心观察': 'WATCH', '观察': 'WATCH',
    REDUCE: 'REDUCE', '考虑减仓': 'REDUCE', '减仓': 'REDUCE',
    EXIT: 'EXIT', '清仓预警': 'EXIT', '清仓': 'EXIT',
  }
  return aliases[raw] || 'UNKNOWN'
}

export function actionLabel(action) {
  return { BUY: '分批买入', HOLD: '继续持有', WATCH: '耐心观察', REDUCE: '考虑减仓', EXIT: '清仓预警', UNKNOWN: '数据不足' }[action] || '数据不足'
}

export function deriveSignal(overview = {}, code = '') {
  const quote = overview.quote || {}, valuation = overview.valuation || {}, trend = overview.trend || {}, flow = overview.flow || {}, shares = overview.shares || {}, margin = overview.margin || {}
  const close = finite(quote.price), ma5 = finite(trend.ma5), ma20 = finite(trend.ma20), ma60 = finite(trend.ma60), pePercentile = finite(valuation.pePercentile)
  const todayMain = finite(flow.todayMain), shareChange = finite(shares.changeBillion), marginNet = finite(margin.netBuy)
  const known = [close, ma5, ma20, ma60, todayMain, marginNet].filter((item) => item !== null).length
  if (known < 2) {
    return { code, action: 'UNKNOWN', actionLabel: '数据不足', score: 0, suggestedPosition: 0, valuation: '估值分位暂不可用', trend: '趋势数据不足', flow: '资金数据不足', shareTrend: '历史份额暂不可用', risk: '等待手机联网数据', reasons: ['请确认手机已联网且 Zepp 可访问网络'], updatedAt: overview.updatedAt || quote.updatedAt || '', source: '手机直连' }
  }

  let score = 40
  const reasons = []
  // 估值分位缺失（PE 历史源当天全挂）不应把建议仓位一并清零：仓位由趋势/资金
  // 与用户设置的仓位权重决定，估值只作为加减分项参与评分。
  const valuationAvailable = pePercentile !== null
  const valuationThreshold = readNumberSetting('threshold.valuationPercentile', 20)
  if (valuationAvailable) {
    if (pePercentile <= valuationThreshold) { score += 25; reasons.push(`估值分位 ${pePercentile.toFixed(0)}%，处于低位`) }
    else if (pePercentile <= 40) score += 12
    else if (pePercentile >= 80) { score -= 18; reasons.push(`估值分位 ${pePercentile.toFixed(0)}%，处于高位`) }
  } else reasons.push('手机直连暂缺历史估值分位，买入信号保持观察')

  if (ma20 !== null && ma60 !== null) {
    if (ma20 > ma60) { score += 22; reasons.push('20日均线位于60日均线上方') }
    else { score -= 14; reasons.push('20日均线未站上60日均线') }
  }
  if (close !== null && ma5 !== null) {
    if (close >= ma5) score += 8
    else { score -= 28; reasons.unshift('价格跌破5日均线') }
  }
  if (todayMain !== null) { if (todayMain > 0) { score += 12; reasons.push('今日主力资金净流入') } else score -= 8 }
  if (shareChange !== null) { if (shareChange > 0) { score += 9; reasons.push('基金份额区间增加') } else score -= 5 }
  if (marginNet !== null) score += marginNet > 0 ? 5 : -4
  score = clamp(Math.round(score), 0, 100)

  let action = 'WATCH'
  const exitBelowMa5 = readBoolSetting('threshold.exitBelowMa5', true)
  const buyScore = readNumberSetting('threshold.buyScore', 75)
  if (close !== null && ma5 !== null && close < ma5 && exitBelowMa5) action = 'EXIT'
  else if (score >= buyScore && (!valuationAvailable || pePercentile <= valuationThreshold)) action = 'BUY'
  else if (score >= 60) action = 'HOLD'
  else if (score < 40) action = 'REDUCE'

  // 建议仓位：清仓预警归零；其余情形给用户设置的仓位权重（默认 20%），
  // 卖出档位按比例收敛。只依赖本地配置，不因上游估值缺失而变 0。
  const weight = clamp(readNumberSetting(`position.${code}.weight`, 20), 0, 100)
  let suggestedPosition = 0
  if (action === 'EXIT') suggestedPosition = 0
  else if (action === 'REDUCE') suggestedPosition = Math.round(weight / 2)
  else if (action === 'BUY') suggestedPosition = Math.max(20, weight)
  else suggestedPosition = weight

  return {
    code, action, actionLabel: actionLabel(action), score,
    suggestedPosition,
    valuation: valuationAvailable ? `PE分位 ${pePercentile.toFixed(0)}%` : '估值分位暂不可用', valuationPercentile: pePercentile,
    pe: finite(valuation.pe), pb: finite(valuation.pb), trend: ma20 !== null && ma60 !== null ? (ma20 > ma60 ? '趋势向上' : '趋势偏弱') : '趋势数据不足',
    ma5, ma20, ma60, flow: todayMain === null ? '资金数据不可用' : (todayMain > 0 ? '主力流入' : '主力流出'),
    shareTrend: shareChange === null ? '仅有最新份额' : (shareChange > 0 ? '份额增加' : '份额减少'), risk: action === 'EXIT' ? '跌破5日均线' : score < 40 ? '风险偏高' : '风险正常',
    reasons: reasons.slice(0, 4), updatedAt: overview.updatedAt || quote.updatedAt || '', source: '东方财富 + 腾讯回退',
  }
}
