import { COLORS, CONTENT, FONT, LAYOUT, THEME } from '../../../utils/constants'
import { t, tf } from '../../../utils/i18n'
import { fixed, signColor, signed } from '../../../utils/format'
import {
  clearScene,
  createButtonRegion,
  drawCandlestickChartAt,
  drawAreaLineChartAt,
  drawDotAt,
  drawDottedHorizontalAt,
  drawGlassCard,
  drawMultiLineChartAt,
  drawRect,
  drawRoundRect,
  drawText,
  finishScene,
  updateButtonRegion,
} from '../../../utils/ui/index'
import { prepareDayKSeries, prepareIntradaySeries, readKlineCount } from '../model'
import { drawDetailHeader } from './common'

var S = LAYOUT.chart
var TABS = S.tabs
var RIGHT_EDGE = CONTENT.x + CONTENT.width
// 两个标签页在卡片内左右对称：首列贴左内缩，次列由首列宽 + 间隙推出。
var TAB_X = CONTENT.x + TABS.firstInsetX
var TAB_X2 = TAB_X + TABS.w + TABS.gap

function updateTabs(page) {
  var scene = page.state.scenes[1]
  if (!scene || !Array.isArray(scene.chartTabButtons)) return
  var periods = ['intraday', 'day']
  var labels = [t('分时'), t('日K')]
  var xs = [TAB_X, TAB_X2]
  var index
  for (index = 0; index < periods.length; index += 1) {
    updateButtonRegion(scene.chartTabButtons[index], {
      x: xs[index], y: TABS.y, w: TABS.w, h: TABS.h, radius: Math.min(19, TABS.h / 2),
      text: labels[index], textSize: TABS.size,
      color: page.state.period === periods[index] ? COLORS.accent : COLORS.text,
    })
  }
}

function renderTabs(page, c) {
  updateTabs(page)
  var activeX = page.state.period === 'day' ? TAB_X2 : TAB_X
  drawRect(c, activeX + S.underline.insetX, S.underline.y, S.underline.w, S.underline.h, COLORS.accent)
}

function renderEmpty(c, loading, label) {
  drawText(c, {
    x: CONTENT.innerX, y: S.intraday.plot.y + 12, w: CONTENT.innerWidth, h: 44,
    text: loading ? tf('正在获取{label}…', { label: label }) : tf('{label}暂无可用数据', { label: label }),
    size: 14, color: COLORS.muted, align: 'center',
  })
}

function updateClockText(value) {
  var raw = String(value || '')
  var matched = raw.match(/(?:T|\s)(\d{2}):(\d{2})/)
  return matched ? matched[1] + ':' + matched[2] : '--:--'
}

function cachedIntradaySeries(page, points) {
  var cache = page.state.chart.intradayPrepared
  if (cache && cache.source === points && cache.data) return cache.data
  var data = prepareIntradaySeries(points)
  page.state.chart.intradayPrepared = { source: points, data: data }
  return data
}

function cachedDayKSeries(page, points, limit) {
  var cache = page.state.chart.dayPrepared
  if (cache && cache.source === points && Number(cache.limit) === Number(limit) && cache.data) return cache.data
  var data = prepareDayKSeries(points, limit)
  page.state.chart.dayPrepared = { source: points, limit: Number(limit), data: data }
  return data
}

function renderIntraday(page, c) {
  var I = S.intraday
  var points = Array.isArray(page.state.chart.points) ? page.state.chart.points : []
  var prepared = cachedIntradaySeries(page, points)
  if (prepared.lastIndex < 0) {
    renderEmpty(c, page.state.chart.loading === true, t('分时'))
    return
  }

  // 参考元素清单：单色暖调（亮线+同色深底面积）、点状网格线、绘图区左右
  // 边界竖线、最新点白色圆点、左上角实心价格徽标、右轴三档刻度、首尾
  // 时间标签、底部圆角信息条。圆屏去掉了标的名称胶囊（页头已给出），
  // 腾出的纵向空间给绘图区。
  var plotX = CONTENT.x + I.plot.insetX
  var plotY = I.plot.y
  var plotW = I.plot.w
  var plotH = I.plot.h
  var padding = I.padding
  var range = prepared.range
  var change = prepared.first ? (prepared.last / prepared.first - 1) * 100 : 0
  var valueMax = prepared.priceMax
  var valueMin = prepared.priceMin
  var yFor = function (value) {
    return plotY + padding + ((range.max - value) / (range.max - range.min)) * (plotH - padding * 2)
  }

  drawText(c, { x: CONTENT.x + I.updatedInsetX, y: I.updatedY, w: CONTENT.innerWidth, h: I.updatedH, text: tf('更新 {time}', { time: updateClockText(page.state.chart.updatedAt) }), size: I.updatedSize, color: COLORS.muted })
  drawText(c, { x: RIGHT_EDGE - I.updatedRightInset - I.updatedW, y: I.updatedY, w: I.updatedW, h: I.updatedH, text: prepared.lastClock || updateClockText(page.state.chart.updatedAt), size: I.updatedSize, color: COLORS.muted, align: 'right', font: FONT.number })
  if (I.chip) {
    drawRoundRect(c, CONTENT.x + I.chip.insetX, I.chip.y, I.chip.w, I.chip.h, I.chip.h / 2, COLORS.panelAlt)
    drawText(c, { x: CONTENT.x + I.chip.insetX + 8, y: I.chip.y, w: I.chip.w - 16, h: I.chip.h, text: page.state.name || page.state.code, size: I.chip.size, color: COLORS.text, align: 'center' })
  }

  // 点状网格线（max/mid）+ min 基线
  drawDottedHorizontalAt(c, plotX, plotY, plotW, plotH, valueMax, range, { padding: padding, color: COLORS.faint })
  drawDottedHorizontalAt(c, plotX, plotY, plotW, plotH, (valueMax + valueMin) / 2, range, { padding: padding, color: COLORS.faint })
  drawRect(c, plotX + padding, plotY + plotH - padding, plotW - padding * 2, 1, COLORS.border)

  // 单色暖调：亮红线 + 深色面积；均价线保持琥珀
  drawAreaLineChartAt(c, plotX, plotY, plotW, plotH, prepared.prices, {
    padding: padding, range: range, color: COLORS.positive, fillColor: COLORS.positiveSoft, lineWidth: 3, sampleStep: 4,
  })
  drawMultiLineChartAt(c, plotX, plotY, plotW, plotH, [
    { values: prepared.averages, color: COLORS.warning, lineWidth: 2, range: range },
  ], { padding: padding, grid: false, sampleStep: 4 })

  // 最新点白色圆点
  var slotCount = Math.max(2, prepared.prices.length)
  var dotX = plotX + padding + (prepared.lastIndex / (slotCount - 1)) * (plotW - padding * 2)
  var dotY = yFor(prepared.last)
  drawDotAt(c, dotX, dotY, 5, COLORS.white)

  // 右轴三档刻度（max/mid/min）
  var axisX = plotX + plotW + 6
  drawText(c, { x: axisX, y: yFor(valueMax) - 8, w: I.axisW, h: 16, text: fixed(valueMax, 3), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })
  drawText(c, { x: axisX, y: yFor((valueMax + valueMin) / 2) - 8, w: I.axisW, h: 16, text: fixed((valueMax + valueMin) / 2, 3), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })
  drawText(c, { x: axisX, y: yFor(valueMin) - 8, w: I.axisW, h: 16, text: fixed(valueMin, 3), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })

  // 左上角实心价格徽标（暖色填充）
  var priceBadgeX = CONTENT.x + I.badge.insetX
  drawRoundRect(c, priceBadgeX, I.badge.y, I.badge.w, I.badge.h, 8, COLORS.positive)
  drawText(c, { x: priceBadgeX, y: I.badge.y, w: I.badge.w, h: I.badge.h, text: fixed(prepared.last, 3), size: I.badge.size, color: COLORS.white, align: 'center', font: FONT.number })

  // 首尾时间标签（压缩轴：09:30 直连 15:00）
  drawText(c, { x: CONTENT.x + I.timeInsetX, y: I.timeY, w: I.timeW, h: I.timeH, text: '09:30', size: I.timeSize, color: COLORS.faint, align: 'left', font: FONT.number })
  drawText(c, { x: RIGHT_EDGE - I.timeRightInset - I.timeW, y: I.timeY, w: I.timeW, h: I.timeH, text: '15:00', size: I.timeSize, color: COLORS.faint, align: 'right', font: FONT.number })

  // 底部圆角信息条（价格 + 涨跌幅，涨跌语义保留在数字颜色上）
  var barX = CONTENT.x + I.bar.insetX
  drawRoundRect(c, barX, I.bar.y, I.bar.w, I.bar.h, I.bar.h / 2, COLORS.panelAlt)
  drawText(c, { x: barX, y: I.bar.y, w: I.bar.w, h: I.bar.h, text: signed(change, 2, '%') + ' · ' + t('价格 / 均价'), size: I.bar.size, color: signColor(change, COLORS), align: 'center', font: FONT.number })
}

function renderDayK(page, c) {
  var D = S.dayk
  var allPoints = Array.isArray(page.state.chart.points) ? page.state.chart.points : []
  if (!allPoints.length) {
    renderEmpty(c, page.state.chart.loading === true, t('日K'))
    return
  }
  var limit = readKlineCount()
  page.state.klineCount = limit
  var prepared = cachedDayKSeries(page, allPoints, limit)
  var points = prepared.points
  if (!points.length) {
    renderEmpty(c, page.state.chart.loading === true, t('日K'))
    return
  }

  // 与分时图同一套参考元素：点状网格线、左右边界竖线、右轴三档刻度、
  // 左上角实心徽标（最新收盘，按末根涨跌着色）、首尾日期、底部信息条。
  // 蜡烛保留 A 股红涨绿跌；最新位置由末根蜡烛本身指示，不再叠加圆点。
  var plotX = CONTENT.x + D.plot.insetX
  var plotY = D.plot.y
  var plotW = D.plot.w
  var plotH = D.plot.h
  var padding = D.padding

  var range = drawCandlestickChartAt(c, plotX, plotY, plotW, plotH, points, { padding: padding, normalized: true, range: prepared.range })
  if (range) {
    drawMultiLineChartAt(c, plotX, plotY, plotW, plotH, [
      { values: prepared.ma5, color: COLORS.accent, lineWidth: 2, range: range },
      { values: prepared.ma20, color: COLORS.warning, lineWidth: 2, range: range },
    ], { padding: padding, grid: false, sampleStep: points.length > 60 ? 2 : 1 })
  }
  if (!range) return

  drawDottedHorizontalAt(c, plotX, plotY, plotW, plotH, range.max, range, { padding: padding, color: COLORS.faint })
  drawDottedHorizontalAt(c, plotX, plotY, plotW, plotH, (range.max + range.min) / 2, range, { padding: padding, color: COLORS.faint })
  drawRect(c, plotX + padding, plotY + plotH - padding, plotW - padding * 2, 1, COLORS.border)

  var yFor = function (value) {
    return plotY + padding + ((range.max - value) / (range.max - range.min)) * (plotH - padding * 2)
  }
  drawText(c, { x: plotX + plotW + 6, y: yFor(range.max) - 8, w: D.axisW, h: 16, text: fixed(range.max, 2), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })
  drawText(c, { x: plotX + plotW + 6, y: yFor((range.max + range.min) / 2) - 8, w: D.axisW, h: 16, text: fixed((range.max + range.min) / 2, 2), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })
  drawText(c, { x: plotX + plotW + 6, y: yFor(range.min) - 8, w: D.axisW, h: 16, text: fixed(range.min, 2), size: 11, color: COLORS.secondary, align: 'right', font: FONT.number })

  var lastCandle = points[points.length - 1]
  var lastClose = Number(lastCandle.c)
  var lastUp = lastClose >= Number(lastCandle.o)
  var badgeX = CONTENT.x + D.badge.insetX
  drawRoundRect(c, badgeX, D.badge.y, D.badge.w, D.badge.h, 8, lastUp ? COLORS.positive : COLORS.negative)
  drawText(c, { x: badgeX, y: D.badge.y, w: D.badge.w, h: D.badge.h, text: fixed(lastClose, 3), size: D.badge.size, color: COLORS.white, align: 'center', font: FONT.number })

  // MA 图例（替代原脚注）
  var maMeta = [[COLORS.accent, 'MA5'], [COLORS.warning, 'MA20']]
  D.legend.items.forEach(function (item, index) {
    drawRect(c, item.x, item.y, item.lineW, 3, maMeta[index][0])
    drawText(c, { x: item.x + item.lineW + 5, y: item.y - 7, w: item.w, h: 18, text: maMeta[index][1], size: item.size, color: COLORS.secondary, font: FONT.number })
  })

  // 首尾日期（来自原始日K数据的时间戳）
  var startIdx = Math.max(0, allPoints.length - points.length)
  var firstTime = String((allPoints[startIdx] && allPoints[startIdx].time) || '')
  var lastTime = String((allPoints[allPoints.length - 1] && allPoints[allPoints.length - 1].time) || '')
  drawText(c, { x: CONTENT.x + D.dateInsetX, y: D.dateY, w: D.dateW, h: D.dateH, text: firstTime ? firstTime.slice(5, 10) : '--', size: D.dateSize, color: COLORS.faint, align: 'left', font: FONT.number })
  drawText(c, { x: RIGHT_EDGE - D.dateRightInset - D.dateW, y: D.dateY, w: D.dateW, h: D.dateH, text: lastTime ? lastTime.slice(5, 10) : '--', size: D.dateSize, color: COLORS.faint, align: 'right', font: FONT.number })

  // 底部圆角信息条：根数 + 最新收盘 + 区间涨跌
  var firstOpen = Number(points[0].o)
  var intervalChange = firstOpen ? (lastClose - firstOpen) * 100 / firstOpen : 0
  var barX = CONTENT.x + D.bar.insetX
  drawRoundRect(c, barX, D.bar.y, D.bar.w, D.bar.h, D.bar.h / 2, COLORS.panelAlt)
  drawText(c, {
    x: barX, y: D.bar.y, w: D.bar.w, h: D.bar.h,
    text: points.length + '根  ' + fixed(lastClose, 3) + '  ' + signed(intervalChange, 2, '%'),
    size: D.bar.size, color: signColor(intervalChange, COLORS), align: 'center', font: FONT.number,
  })
}

export function renderChartPage(page) {
  var c = page.state.scenes[1]
  if (!c) return
  clearScene(c, CONTENT.screenHeight)
  drawDetailHeader(c, t('行情图'), page.state.code, 2)
  renderTabs(page, c)
  drawGlassCard(c, CONTENT.margin, S.card.y, CONTENT.width, S.card.h, 18, { accent: THEME.universe })
  if (page.state.period === 'day') renderDayK(page, c)
  else renderIntraday(page, c)
  finishScene(c)
}

export function bindChartPage(page) {
  var scene = page.state.scenes[1]
  if (!scene || Array.isArray(scene.chartTabButtons)) return
  scene.chartTabButtons = [
    createButtonRegion({
      scene: scene, x: TAB_X, y: TABS.y, w: TABS.w, h: TABS.h, radius: Math.min(19, TABS.h / 2),
      text: t('分时'), textSize: TABS.size, color: COLORS.accent,
      normalColor: COLORS.card, pressColor: COLORS.accentSoft,
      onClick: function () { page.changePeriod('intraday') },
    }),
    createButtonRegion({
      scene: scene, x: TAB_X2, y: TABS.y, w: TABS.w, h: TABS.h, radius: Math.min(19, TABS.h / 2),
      text: t('日K'), textSize: TABS.size, color: COLORS.text,
      normalColor: COLORS.card, pressColor: COLORS.accentSoft,
      onClick: function () { page.changePeriod('day') },
    }),
  ]
}
