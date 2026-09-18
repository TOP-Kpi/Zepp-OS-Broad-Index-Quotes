import { finite } from '../domain/finite'

// 数值归一已收敛到 domain/finite.js；此处保留同名再导出，历史模块
// （fallback / record-builder）继续从 './value' 取用。
export { finite }

export function dateText(value) {
  const raw = String(value || '')
  const matched = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  return matched ? `${matched[1]}-${matched[2]}-${matched[3]}` : raw.slice(0, 10)
}

export function mapByDate(points) {
  const result = {}
  ;(Array.isArray(points) ? points : []).forEach((item) => {
    if (!item) return
    const key = dateText(item.time)
    if (key) result[key] = item
  })
  return result
}

export function movingAverage(points, index, count) {
  if (index < count - 1) return null
  let sum = 0
  for (let cursor = index - count + 1; cursor <= index; cursor += 1) {
    const close = finite(points[cursor] && points[cursor].c)
    if (close === null) return null
    sum += close
  }
  return sum / count
}
