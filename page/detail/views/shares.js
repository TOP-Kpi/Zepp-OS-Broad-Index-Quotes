import { COLORS, columns, CONTENT, FONT, LAYOUT, THEME } from '../../../utils/constants'
import { t, tf } from '../../../utils/i18n'
import { clearScene, drawChartAxis, drawChartLegend, drawDualAxisAreaChartAt, drawGlassCard, drawMetricCard, drawText, finishScene } from '../../../utils/ui/index'
import { drawDetailHeader } from './common'

var S = LAYOUT.shares
var LEGEND = S.legend.items
var METRIC = columns(2, CONTENT.gridGap)
var METRIC_TIGHT = S.metrics.h < 50
var RIGHT_EDGE = CONTENT.x + CONTENT.width

export function renderSharesPage(page) {
  var c = page.state.scenes[3]
  var v = page.state.shares
  if (!c) return
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, t('份额变动'), page.state.name + ' · ' + t('近6个月'), 4)

  drawGlassCard(c, CONTENT.margin, S.card.y, CONTENT.width, S.card.h, 18, {})
  drawChartLegend(c, LEGEND[0].x, LEGEND[0].y, COLORS.accent, t('基金份额(亿份)'), { width: LEGEND[0].w, lineW: LEGEND[0].lineW, size: LEGEND[0].size })
  drawChartLegend(c, LEGEND[1].x, LEGEND[1].y, COLORS.warning, t('收盘价(元)'), { width: LEGEND[1].w, lineW: LEGEND[1].lineW, size: LEGEND[1].size })

  if (Array.isArray(v.values) && v.values.length > 1 && Array.isArray(v.closes) && v.closes.length > 1) {
    var chartResult = drawDualAxisAreaChartAt(c, S.plot.x, S.plot.y, S.plot.w, S.plot.h, v.values, v.closes, {
      padding: S.padding,
      leftColor: COLORS.accent,
      leftFillColor: COLORS.accentSoft,
      rightColor: COLORS.warning,
      leftLineWidth: 3,
      rightLineWidth: 2,
      sampleStep: 1,
    })
    drawChartAxis(c, chartResult && chartResult.leftRange, S.axis.leftX, S.axis.y, S.axis.w, 'right', 1, { step: S.axis.step, size: S.axis.size })
    drawChartAxis(c, chartResult && chartResult.rightRange, S.axis.rightX, S.axis.y, S.axis.w, 'left', 2, { step: S.axis.step, size: S.axis.size })
    if (Array.isArray(v.dates) && v.dates.length > 1) {
      drawText(c, { x: S.dateX[0], y: S.dateY, w: S.dateW, h: S.dateH, text: String(v.dates[0] || '').slice(5), size: S.dateSize, color: COLORS.faint, font: FONT.number })
      drawText(c, { x: S.dateX[1], y: S.dateY, w: S.dateW, h: S.dateH, text: String(v.dates[v.dates.length - 1] || '').slice(5), size: S.dateSize, color: COLORS.faint, align: 'right', font: FONT.number })
      drawText(c, { x: CONTENT.x + S.updatedInsetX, y: S.updatedY, w: CONTENT.innerWidth, h: S.updatedH, text: tf('更新于 {date}', { date: String(v.dates[v.dates.length - 1] || '').slice(5) }), size: S.updatedSize, color: COLORS.faint, font: FONT.number })
    }
  } else {
    drawText(c, { x: CONTENT.innerX, y: S.empty.y, w: CONTENT.innerWidth, h: S.empty.h, text: v.note || t('正在获取份额历史…'), size: S.empty.size, color: COLORS.muted, align: 'center' })
  }

  drawMetricCard(c, {
    x: METRIC[0].x, y: S.metrics.y, w: METRIC[0].w, h: S.metrics.h,
    title: t('最新基金份额'), value: v.latest, valueColor: COLORS.accent, valueSize: METRIC_TIGHT ? 15 : 17, valueFont: FONT.number, tight: METRIC_TIGHT,
    accent: THEME.universe,
  })
  drawMetricCard(c, {
    x: METRIC[1].x, y: S.metrics.y, w: METRIC[1].w, h: S.metrics.h,
    title: t('近6个月份额变动'), value: v.change, valueColor: v.changeColor, valueSize: METRIC_TIGHT ? 15 : 17, subtitle: v.changeAmount, valueFont: FONT.number, tight: METRIC_TIGHT,
    accent: v.changeColor === COLORS.muted ? undefined : v.changeColor,
  })
  finishScene(c)
}
