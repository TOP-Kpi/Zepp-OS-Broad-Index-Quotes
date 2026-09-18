import { normalizeAction } from './signal'
import { finite } from './finite'

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }

export function summarizeMarket(items) {
  const source = Array.isArray(items) ? items : []
  const latestItem = source.find((item) => item && item.signal && item.signal.updatedAt)
  const rows = source.map((item) => {
    const signal = item.signal || {}
    const score = finite(signal.score)
    const changePct = finite(item.quote && item.quote.changePct)
    const action = normalizeAction(signal.action || signal.actionLabel)
    return { code: item.code, name: item.name, shortName: item.shortName, score: score === null ? (changePct === null ? 50 : clamp(Math.round(50 + changePct * 8), 20, 80)) : score, action, changePct }
  })
  const scores = rows.map((item) => item.score).filter(Number.isFinite)
  const temperature = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 50
  const up = rows.filter((item) => Number(item.changePct) > 0).length
  const down = rows.filter((item) => Number(item.changePct) < 0).length
  // 蓝牙瘦身：items 只保留设备端"当前强势"卡与信号回退所需字段；
  // 完整 signal 对象不再随 market 重复下发（universe 行已各带一份）。
  const slimItems = rows.map((item) => ({ code: item.code, name: item.name, shortName: item.shortName, score: item.score, action: item.action }))
  return { temperature, regime: temperature >= 70 ? '偏强' : temperature >= 50 ? '震荡' : '偏弱', breadth: { up, flat: Math.max(0, rows.length - up - down), down }, items: slimItems, updatedAt: latestItem ? latestItem.signal.updatedAt : '', source: '东方财富 + 腾讯回退' }
}
