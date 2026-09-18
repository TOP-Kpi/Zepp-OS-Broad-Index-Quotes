import { COLORS, columns, CONTENT, LAYOUT } from '../../../utils/constants'
import { t } from '../../../utils/i18n'
import { clearScene, drawBarChartAt, drawGlassCard, drawText, finishScene } from '../../../utils/ui/index'
import { drawDetailHeader } from './common'

var S = LAYOUT.flow
var METRIC = columns(3, CONTENT.gridGap3)
var METRIC_TIGHT = S.metrics.h < 50

export function renderFlowPage(page) {
  var c = page.state.scenes[2]
  var v = page.state.flow
  if (!c) return
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, t('资金流'), page.state.code, 3)
  var inner = S.metricInner
  ;[[t('今日主力'), v.today, v.todayColor], [t('区间主力'), v.interval, v.intervalColor], [t('份额申赎'), v.offMarket, v.offMarketColor]].forEach(function (item, index) {
    var column = METRIC[index]
    drawGlassCard(c, column.x, S.metrics.y, column.w, S.metrics.h, 17, {})
    if (METRIC_TIGHT) {
      // 圆屏：112×65 的三列卡压到 92×46，标题与数值各占一行，字号降档。
      drawText(c, { x: column.x + inner.padX, y: S.metrics.y + 4, w: column.w - inner.padX * 2, h: 15, text: item[0], size: 10, color: COLORS.muted, align: 'center' })
      drawText(c, { x: column.x + inner.padX, y: S.metrics.y + 18, w: column.w - inner.padX * 2, h: S.metrics.h - 20, text: item[1], size: 13, color: item[2], align: 'center' })
      return
    }
    drawText(c, { x: column.x + inner.padX, y: S.metrics.y + inner.titleY, w: column.w - inner.padX * 2, h: inner.titleH, text: item[0], size: inner.titleSize, color: COLORS.muted, align: 'center' })
    drawText(c, { x: column.x + inner.padX, y: S.metrics.y + inner.valueY, w: column.w - inner.padX * 2, h: inner.valueH, text: item[1], size: inner.valueSize, color: item[2], align: 'center' })
  })
  drawGlassCard(c, CONTENT.margin, S.card.y, CONTENT.width, S.card.h, 20, {})
  drawText(c, { x: CONTENT.x + S.label.insetX, y: S.card.y + S.label.y, w: CONTENT.width - S.label.insetX * 2, h: S.label.h, text: t('区间主力净流向'), size: S.label.size, color: COLORS.muted })
  drawBarChartAt(c, CONTENT.x + S.bar.insetX, S.card.y + S.bar.y, S.bar.w, S.bar.h, v.bars)
  finishScene(c)
}
