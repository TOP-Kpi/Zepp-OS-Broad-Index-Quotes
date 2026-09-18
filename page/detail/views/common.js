import { clearScene, drawHeader, drawRoundRect, drawText, finishScene } from '../../../utils/ui/index'
import { COLORS, CONTENT, LAYOUT } from '../../../utils/constants'
import { t, tf } from '../../../utils/i18n'

var PRELOAD_CARD = LAYOUT.overview.card

export function drawDetailHeader(scene, title, subtitle, page) {
  drawHeader(scene, title, subtitle, page + '/6')
}

export function renderPreloadShell(page, index) {
  var c = page.state.scenes[index]
  if (!c) return
  var titles = [t('ETF详细'), t('行情图'), t('资金流'), t('基金份额'), t('融资'), t('PE五年估值')]
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, titles[index] || t('ETF详情'), page.state.code, index + 1)
  drawRoundRect(c, CONTENT.margin, PRELOAD_CARD.y, CONTENT.width, PRELOAD_CARD.h, 22, COLORS.card)
  finishScene(c)
}

export function renderErrorShell(page, index, error) {
  var c = page.state.scenes[index]
  if (!c || c.disposed || c.broken) return
  var message = error && error.message ? String(error.message) : String(error || '未知错误')
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, t('页面渲染失败'), tf('第 {n} 页', { n: index + 1 }), index + 1)
  drawText(c, {
    x: CONTENT.innerX, y: CONTENT.y + 60, w: CONTENT.innerWidth, h: 72,
    text: message.slice(0, 80), size: 12, color: COLORS.muted, align: 'center',
  })
  finishScene(c)
}