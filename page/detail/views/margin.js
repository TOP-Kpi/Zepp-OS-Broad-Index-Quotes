import { COLORS, columns, CONTENT, LAYOUT, THEME } from '../../../utils/constants'
import { t } from '../../../utils/i18n'
import { clearScene, drawBarChartAt, drawGlassCard, drawMetricCard, drawText, finishScene } from '../../../utils/ui/index'
import { drawDetailHeader } from './common'

var S = LAYOUT.margin
var METRIC = columns(2, CONTENT.gridGap)
var METRIC_TIGHT = S.metrics.h < 50

export function renderMarginPage(page) {
  var c = page.state.scenes[4]
  var v = page.state.margin
  if (!c) return
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, t('融资'), page.state.code, 5)
  drawGlassCard(c, CONTENT.margin, S.card.y, CONTENT.width, S.card.h, 20, {})
  drawText(c, { x: CONTENT.x + S.label.insetX, y: S.card.y + S.label.y, w: CONTENT.width - S.label.insetX * 2, h: S.label.h, text: t('融资净买入 · 红流入 / 绿流出'), size: S.label.size, color: COLORS.muted })
  drawBarChartAt(c, CONTENT.x + S.bar.insetX, S.card.y + S.bar.y, S.bar.w, S.bar.h, v.bars)
  drawMetricCard(c, {
    x: METRIC[0].x, y: S.metrics.y, w: METRIC[0].w, h: S.metrics.h,
    title: t('最新融资净买入'), value: v.net, valueColor: v.netColor, valueSize: METRIC_TIGHT ? 15 : 18, tight: METRIC_TIGHT,
    accent: v.netColor === COLORS.muted ? undefined : v.netColor,
  })
  drawMetricCard(c, {
    x: METRIC[1].x, y: S.metrics.y, w: METRIC[1].w, h: S.metrics.h,
    title: t('融资余额'), value: v.balance, valueColor: COLORS.accent, valueSize: METRIC_TIGHT ? 15 : 18, tight: METRIC_TIGHT,
    accent: THEME.market,
  })
  finishScene(c)
}
