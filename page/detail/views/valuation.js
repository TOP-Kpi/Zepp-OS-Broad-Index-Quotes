import { COLORS, CONTENT, FONT, LAYOUT } from '../../../utils/constants'
import { t, tf } from '../../../utils/i18n'
import { clearScene, drawAreaLineChartAt, drawChartLegend, drawDashedHorizontalAt, drawDottedHorizontalAt, drawDotAt, drawGlassCard, drawHalfGauge, drawRect, drawText, finishScene } from '../../../utils/ui/index'
import { fixed } from '../../../utils/format'
import { isFiniteNumber } from '../../../utils/compat'
import { drawDetailHeader } from './common'

var S = LAYOUT.valuation
var LEGEND = S.legends.items

function axisText(value, digits) {
  return isFiniteNumber(Number(value)) ? fixed(Number(value), digits) : '--'
}

// 分位语义色：≤20% 低估（绿·机会）/ 20-80% 中性（琥珀）/ ≥80% 高估（红·危险）
function percentileColor(value) {
  if (!isFiniteNumber(Number(value))) return COLORS.muted
  var p = Number(value)
  if (p <= 20) return COLORS.negative
  if (p >= 80) return COLORS.positive
  return COLORS.warning
}

function seriesRange(values, extras) {
  var min = Infinity
  var max = -Infinity
  var scan = function (arr) {
    var source = Array.isArray(arr) ? arr : []
    for (var i = 0; i < source.length; i += 1) {
      var n = Number(source[i])
      if (!isFiniteNumber(n) || n <= 0) continue
      if (n < min) min = n
      if (n > max) max = n
    }
  }
  scan(values)
  scan(extras)
  if (min === Infinity || max === -Infinity) return null
  if (min === max) { min -= 0.5; max += 0.5 }
  var pad = (max - min) * 0.06
  return { min: min - pad, max: max + pad }
}

export function renderValuationPage(page) {
  var c = page.state.scenes[5]
  var v = page.state.valuation
  if (!c) return
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, (v.indexName || page.state.name) + ' · ' + t('历史PE'), tf('PE-TTM · 近5年 · 月频{count}点', { count: String(Array.isArray(v.values) ? v.values.length : 0) }), 6)

  var pColor = percentileColor(v.percentileValue)

  // ── hero：半环量表（历史分位）+ 当前 PE + 危险/机会参照 ──
  drawGlassCard(c, CONTENT.margin, S.hero.y, CONTENT.width, S.hero.h, 20, {})
  drawHalfGauge(c, S.gauge.cx, S.gauge.cy, S.gauge.r, v.percentileValue, { color: pColor, lineWidth: S.gauge.lw })
  drawText(c, { x: S.percentile.cx - S.percentile.w / 2, y: S.percentile.y, w: S.percentile.w, h: S.percentile.h, text: v.percentile === '--' ? '--' : fixed(v.percentileValue, 0) + '%', size: S.percentile.size, color: pColor, align: 'center', font: FONT.numberBold })
  drawText(c, { x: S.percentileLabel.cx - S.percentileLabel.w / 2, y: S.percentileLabel.y, w: S.percentileLabel.w, h: S.percentileLabel.h, text: t('历史分位'), size: S.percentileLabel.size, color: COLORS.muted, align: 'center' })

  drawText(c, { x: S.peLabel.x, y: S.peLabel.y, w: S.peLabel.w, h: S.peLabel.h, text: t('当前PE'), size: S.peLabel.size, color: COLORS.muted })
  drawText(c, { x: S.peValue.x, y: S.peValue.y, w: S.peValue.w, h: S.peValue.h, text: v.currentPe, size: S.peValue.size, color: pColor, font: FONT.numberBold })
  drawRect(c, S.danger.x, S.danger.y, S.danger.w, S.danger.h, COLORS.warning)
  drawText(c, { x: S.danger.textX, y: S.danger.textY, w: S.danger.textW, h: S.danger.textH, text: t('危险') + '  ' + axisText(v.p80, 2), size: S.danger.textSize, color: COLORS.secondary })
  drawRect(c, S.chance.x, S.chance.y, S.chance.w, S.chance.h, COLORS.negative)
  drawText(c, { x: S.chance.textX, y: S.chance.textY, w: S.chance.textW, h: S.chance.textH, text: t('机会') + '  ' + axisText(v.p20, 2), size: S.chance.textSize, color: COLORS.secondary })
  drawText(c, { x: S.indexCode.x, y: S.indexCode.y, w: S.indexCode.w, h: S.indexCode.h, text: v.indexCode ? t('指数') + ' ' + v.indexCode : '', size: S.indexCode.size, color: COLORS.faint, font: FONT.number })

  // ── 图表：单色暖调 PE 面积 + 危险/机会虚线 + 白点当前值 ──
  drawGlassCard(c, CONTENT.margin, S.card.y, CONTENT.width, S.card.h, 20, {})
  var legendMeta = [[COLORS.positive, t('PE')], [COLORS.warning, t('危险')], [COLORS.negative, t('机会')]]
  LEGEND.forEach(function (item, index) {
    drawChartLegend(c, item.x, S.legends.y, legendMeta[index][0], legendMeta[index][1], { width: item.w, lineW: item.lineW, size: item.size })
  })

  var values = Array.isArray(v.values) ? v.values : []
  var canPlot = values.length > 1 && isFiniteNumber(v.p20) && isFiniteNumber(v.p80)
  if (!canPlot) {
    drawText(c, { x: CONTENT.x + 24, y: S.empty.y, w: CONTENT.innerWidth, h: S.empty.h, text: v.note || t('正在获取指数PE历史…'), size: S.empty.size, color: COLORS.muted, align: 'center' })
    finishScene(c)
    return
  }

  var peRange = seriesRange(values, [v.p20, v.p80])
  var plotX = S.plot.x
  var plotY = S.plot.y
  var plotW = S.plot.w
  var plotH = S.plot.h
  var padding = S.padding
  var yFor = function (value) {
    return plotY + padding + ((peRange.max - value) / (peRange.max - peRange.min)) * (plotH - padding * 2)
  }

  var valueMax = -Infinity
  var valueMin = Infinity
  for (var i = 0; i < values.length; i += 1) {
    var n = Number(values[i])
    if (!isFiniteNumber(n) || n <= 0) continue
    if (n > valueMax) valueMax = n
    if (n < valueMin) valueMin = n
  }

  drawDottedHorizontalAt(c, plotX, plotY, plotW, plotH, valueMax, peRange, { padding: padding, color: COLORS.faint })
  drawDottedHorizontalAt(c, plotX, plotY, plotW, plotH, (valueMax + valueMin) / 2, peRange, { padding: padding, color: COLORS.faint })
  drawDashedHorizontalAt(c, plotX, plotY, plotW, plotH, v.p80, peRange, { padding: padding, color: COLORS.warning, lineWidth: 2, dash: 6, gap: 4 })
  drawDashedHorizontalAt(c, plotX, plotY, plotW, plotH, v.p20, peRange, { padding: padding, color: COLORS.negative, lineWidth: 2, dash: 6, gap: 4 })
  drawRect(c, plotX + padding, plotY + plotH - padding, plotW - padding * 2, 1, COLORS.border)

  drawAreaLineChartAt(c, plotX, plotY, plotW, plotH, values, {
    padding: padding, range: peRange, color: COLORS.positive, fillColor: COLORS.positiveSoft, lineWidth: 3, sampleStep: 1,
  })

  var lastIndex = values.length - 1
  var dotX = plotX + padding + (lastIndex / (values.length - 1)) * (plotW - padding * 2)
  drawDotAt(c, dotX, yFor(values[lastIndex]), 5, COLORS.white)

  drawText(c, { x: plotX + plotW + 6, y: yFor(valueMax) - 8, w: S.axisW, h: 16, text: fixed(valueMax, 2), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })
  if (S.axisLabelCount > 2) {
    drawText(c, { x: plotX + plotW + 6, y: yFor((valueMax + valueMin) / 2) - 8, w: S.axisW, h: 16, text: fixed((valueMax + valueMin) / 2, 2), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })
  }
  drawText(c, { x: plotX + plotW + 6, y: yFor(valueMin) - 8, w: S.axisW, h: 16, text: fixed(valueMin, 2), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })

  // 首尾年月
  var dates = Array.isArray(v.dates) ? v.dates : []
  var firstDate = dates.length ? String(dates[0]).slice(0, 7) : '--'
  var lastDate = dates.length ? String(dates[dates.length - 1]).slice(0, 7) : '--'
  drawText(c, { x: S.dateX[0], y: S.dateY, w: S.dateW, h: S.dateH, text: firstDate, size: S.dateSize, color: COLORS.faint, align: 'left', font: FONT.number })
  drawText(c, { x: S.dateX[1], y: S.dateY, w: S.dateW, h: S.dateH, text: lastDate, size: S.dateSize, color: COLORS.faint, align: 'right', font: FONT.number })

  finishScene(c)
}
