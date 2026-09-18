import { COLORS, columns, CONTENT, FONT, LAYOUT } from '../../../utils/constants'
import { t, tf } from '../../../utils/i18n'
import { clearScene, drawGlassCard, drawMetricCard, drawText, finishScene } from '../../../utils/ui/index'
import { drawDetailHeader } from './common'

var S = LAYOUT.overview
var CELLS = S.cells
var METRIC = columns(3, CONTENT.gridGap3)
var RIGHT_EDGE = CONTENT.x + CONTENT.width
// 指标卡在圆屏上只有 48 高，走紧凑排版（标题 15 + 数值一行）。
var METRIC_TIGHT = S.metrics.h < 50

export function renderOverviewPage(page) {
  var c = page.state.scenes[0]
  var q = page.state.quote
  if (!c) return
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, page.state.name, tf('{code} · 更新 {time}', { code: page.state.code, time: q.updatedAt }), 1)
  drawText(c, { x: CONTENT.x + S.price.insetX, y: S.price.y, w: S.price.w, h: S.price.h, text: q.price, size: S.price.size, color: q.color, font: FONT.numberBold })
  drawText(c, { x: RIGHT_EDGE - S.change.rightInset - S.change.w, y: S.change.y, w: S.change.w, h: S.change.h, text: q.changePct, size: S.change.size, color: q.color, align: 'right', font: FONT.number })
  drawText(c, { x: RIGHT_EDGE - S.changeAbs.rightInset - S.changeAbs.w, y: S.changeAbs.y, w: S.changeAbs.w, h: S.changeAbs.h, text: q.change, size: S.changeAbs.size, color: q.color, align: 'right', font: FONT.number })
  drawGlassCard(c, CONTENT.margin, S.card.y, CONTENT.width, S.card.h, 20, {})
  var cellCols = [CONTENT.innerX, CONTENT.x + CELLS.col2InsetX]
  ;[
    [t('今开'), q.open, 0, 0], [t('昨收'), q.previousClose, 1, 0],
    [t('最高'), q.high, 0, 1], [t('最低'), q.low, 1, 1],
    [t('均价'), q.average, 0, 2], [t('振幅'), q.amplitude, 1, 2],
  ].forEach(function (item) {
    var x = cellCols[item[2]]
    var y = CELLS.row0 + item[3] * CELLS.rowStep
    drawText(c, { x: x, y: y, w: CELLS.w, h: CELLS.labelH, text: item[0], size: CELLS.labelSize, color: COLORS.muted })
    drawText(c, { x: x, y: y + CELLS.labelH, w: CELLS.w, h: CELLS.valueH, text: item[1], size: CELLS.valueSize, font: FONT.number })
  })
  ;[
    [t('成交量'), q.volume, 0, {}],
    [t('成交额'), q.amount, 1, {}],
    [t('今日主力'), q.todayMain, 2, { valueColor: q.todayMainColor, accent: q.todayMainColor === COLORS.muted ? undefined : q.todayMainColor }],
  ].forEach(function (item) {
    var column = METRIC[item[2]]
    var extra = item[3]
    drawMetricCard(c, {
      x: column.x, y: S.metrics.y, w: column.w, h: S.metrics.h,
      title: item[0], value: item[1], valueSize: 16, valueFont: FONT.number, tight: METRIC_TIGHT,
      valueColor: extra.valueColor, accent: extra.accent,
    })
  })
  finishScene(c)
}
