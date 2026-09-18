function samplePoints(points, maximum) {
  if (!Array.isArray(points)) return []
  const clean = points.filter((item) => item && typeof item === 'object')
  const limit = Math.max(2, Number(maximum || 2))
  if (clean.length <= limit) return clean

  // Preserve both endpoints. The previous sampler could drop the newest
  // minute, which made the current-price bubble lag behind the real quote.
  const sampled = [clean[0]]
  const interiorCount = limit - 2
  const span = clean.length - 1
  for (let index = 1; index <= interiorCount; index += 1) {
    const sourceIndex = Math.max(1, Math.min(clean.length - 2, Math.round(index * span / (limit - 1))))
    if (sampled[sampled.length - 1] !== clean[sourceIndex]) sampled.push(clean[sourceIndex])
  }
  if (sampled[sampled.length - 1] !== clean[clean.length - 1]) sampled.push(clean[clean.length - 1])
  while (sampled.length > limit) sampled.splice(sampled.length - 2, 1)
  return sampled
}

export function compactResponse(method, data) {
  if (!data || typeof data !== 'object') return data
  // chart 的 90 / 96 与设备端 page/detail/services/chart.js 的
  // CHART_POINT_LIMITS 是同一条契约的两端（设备端那份只是旧缓存的兜底）。
  // 改这里要同时改那里，否则设备端会悄悄丢点，图表底部"N根"会变。
  if (method === 'chart') return { ...data, points: samplePoints(data.points, data.period === 'day' ? 90 : 96) }
  if (method === 'shares') return { ...data, points: samplePoints(data.points, 96) }
  if (method === 'valuation') return { ...data, points: samplePoints(data.points, 60) }
  if (method === 'margin') return { ...data, points: samplePoints(data.points, 60) }
  if (method === 'flow') return { ...data, intervals: samplePoints(data.intervals, 12), offMarket: samplePoints(data.offMarket, 20) }
  if (method === 'alerts') return samplePoints(data, 30)
  return data
}
