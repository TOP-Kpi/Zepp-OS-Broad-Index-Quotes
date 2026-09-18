// M1-M2 剪刀差 · 快捷卡片（Shortcut Card / app-widget）
//
// 官方规范见 zeppos-docs-main：
//   · guides/framework/device/secondary-widget —— 注册方式、生命周期、绘制区约束
//   · designs/customization/shortcut-cards —— 组图、16px 安全边距、最小高度、
//     内容排布（"文字 + 图表"那一类）
//   · reference/device-app-api/newAPI/global/AppWidget.mdx —— 构造器与生命周期回调
//
// 本文件遵守的几条硬约束（违反了不会报错，只会在真机上表现为错位或空白）：
//   1. 绘制区的坐标原点是**卡片左上角**，且坐标是设备像素，不是设计单位。
//      所以这里一次 px() 都不用：px() 会把值按 designWidth 再放大一次。
//   2. 卡片拿不到蓝牙实时数据（官方明确写了这条）——数据只能由页面侧取好后写进
//      本地存储，这里只读快照（utils/m1m2.js）。读不到就画"数据不足"，不发请求。
//   3. 不能用 GROUP / SCROLL_LIST / VIEW_CONTAINER（官方禁止滚动与层叠类控件），
//      所以整卡只用一个 CANVAS + 若干 TEXT。
//   4. 只响应点击，不响应滑动/手势/按键；点击整卡跳回主应用。
//
// 关于高度：官方给了 setAppWidgetSize({h})，只能改高度、范围是屏高的 20%~60%。
// 这里**不调用它**：getAppWidgetSize() 在文档里返回的是"系统默认卡片尺寸"，
// 设了高度之后它是否立刻返回新值没有明确规定，一旦不一致，按返回值排的版就会
// 与实际卡片高度错位。改成完全按 getAppWidgetSize() 返回的 w/h 排布，卡片多高
// 就画多高，高度不足时先让出图表（见 renderChart 的降级分支）。
import { align, createWidget, deleteWidget, event, getAppWidgetSize, text_style, widget } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { push } from '@zos/router'
import { t } from '../utils/i18n'
import {
  M1M2_TREND_MONTHS,
  formatGap,
  formatPercent,
  gapBounds,
  gapTone,
  readSnapshot,
  trendSeries,
} from '../utils/m1m2'

// 卡片绘制区很窄，取色与字体沿用手表端的一套（utils/constants.js 的 COLORS / FONT）。
// 这里不 import constants.js：那会把形状样式表（8KB×2）与 ETF 清单一起打进卡片包，
// 而卡片只用到十来个数字。改动配色时请与 constants.js 同步——有一处测试锁这条。
var CARD_BG = 0x171717
var TEXT_MAIN = 0xffffff
var TEXT_MUTED = 0x8e8e93
var TEXT_FAINT = 0x636366
var TONE_UP = 0xff453a
var TONE_DOWN = 0x30d158
var TONE_FLAT = 0x8e8e93
var LINE = 0x0a84ff
var GRID = 0x2c2c2e

var FONT_SANS = 'fonts/NotoSans-Regular.ttf'
var FONT_MEDIUM = 'fonts/NotoSans-Medium.ttf'
var FONT_NUMBER = 'fonts/Zepp-OS-Number.ttf'

// 设计规范：卡片内容与卡片边缘保持 16px 安全边距。
var CONTENT_MARGIN = 16
// 设计规范：单卡最小高度 = 两行文字（120px）。
var MIN_CARD_HEIGHT = 120
// 正文最小字号，与 utils/ui/components.js 的 readableTextSize 下限一致。
var MIN_TEXT_SIZE = 12

var card = {
  canvas: null,
  texts: [],
  fingerprint: '',
}

var DEVICE = (function () {
  try { return getDeviceInfo() || {} } catch (_) { return {} }
})()

function deviceWidth() { return Number(DEVICE.width) || 0 }
function deviceHeight() { return Number(DEVICE.height) || 0 }

// 卡片尺寸：优先用官方 API；拿不到就退回"屏宽减两侧 16 边距 × 屏高一半"
// （官方文档：卡片默认高度是设备高度的 50%）。
function cardSize() {
  var size = null
  try { size = getAppWidgetSize() } catch (_) { size = null }
  var width = Number(size && size.w) || Math.max(MIN_CARD_HEIGHT, deviceWidth() - CONTENT_MARGIN * 2)
  var height = Number(size && size.h) || Math.max(MIN_CARD_HEIGHT, Math.round(deviceHeight() * 0.5))
  var radius = Number(size && size.radius)
  return {
    w: Math.max(MIN_CARD_HEIGHT, width),
    h: Math.max(MIN_CARD_HEIGHT, height),
    radius: radius > 0 ? radius : 24,
  }
}

function toneColor(gap) {
  var tone = gapTone(gap)
  if (tone === 'up') return TONE_UP
  if (tone === 'down') return TONE_DOWN
  return TONE_FLAT
}

function clear() {
  var index
  for (index = 0; index < card.texts.length; index += 1) {
    try { deleteWidget(card.texts[index]) } catch (_) { }
  }
  card.texts = []
  try { if (card.canvas) deleteWidget(card.canvas) } catch (_) { }
  card.canvas = null
}

function addText(options) {
  var size = Math.max(MIN_TEXT_SIZE, Math.round(options.size))
  var ref = null
  try {
    ref = createWidget(widget.TEXT, {
      x: Math.round(options.x),
      y: Math.round(options.y),
      w: Math.max(1, Math.round(options.w)),
      h: Math.max(1, Math.round(options.h)),
      color: options.color,
      text_size: size,
      align_h: options.alignH === undefined ? align.LEFT : options.alignH,
      align_v: align.CENTER_V,
      // 标签宁可截断也不要换行：换行会顶掉下面的图表。
      text_style: text_style.ELLIPSIS,
      font: options.font || FONT_SANS,
      text: options.text === undefined || options.text === null ? '' : String(options.text),
    })
  } catch (_) {
    ref = null
  }
  if (ref) card.texts.push(ref)
  return ref
}

// 卡片的圆角背景。CANVAS 没有 drawRoundRect，官方可行做法是两个矩形加四个圆
// （与 utils/ui/components.js 的 drawRoundRect 同一套画法）。
// 注意**不要**用一整块 drawRect 打底：那会把系统卡片的圆角填成直角。
function drawCardBackground(ctx, size) {
  var r = Math.max(0, Math.min(size.radius, size.w / 2, size.h / 2))
  if (r <= 1) {
    ctx.drawRect({ x1: 0, y1: 0, x2: size.w, y2: size.h, color: CARD_BG })
    return
  }
  var corners = [
    { cx: r, cy: r },
    { cx: size.w - r, cy: r },
    { cx: r, cy: size.h - r },
    { cx: size.w - r, cy: size.h - r },
  ]
  // 两个交叉矩形补上中间区域，四角留给圆——圆外那四个小角保持透明，
  // 于是卡片看起来就是系统卡片本身的圆角。
  ctx.drawRect({ x1: r, y1: 0, x2: size.w - r, y2: size.h, color: CARD_BG })
  ctx.drawRect({ x1: 0, y1: r, x2: size.w, y2: size.h - r, color: CARD_BG })
  var index
  for (index = 0; index < corners.length; index += 1) {
    ctx.drawCircle({ center_x: corners[index].cx, center_y: corners[index].cy, radius: r, color: CARD_BG })
  }
}

// 近一年剪刀差走势。纵轴必须包含 0（零轴是剪刀差最关键的一条参考线），
// 数据不足两个点时直接不画——只连一个点会看起来像一条"平的线"。
function drawTrend(ctx, series, area) {
  if (area.w <= 2 || area.h <= 2) return
  if (!series || series.length < 2) return
  var bounds = gapBounds(series)
  var span = Math.max(0.1, bounds.max - bounds.min)
  var step = area.w / Math.max(1, series.length - 1)
  var zeroY = area.y + area.h - ((0 - bounds.min) / span) * area.h

  ctx.setPaint({ color: GRID, line_width: 1 })
  ctx.drawLine({ x1: area.x, y1: Math.round(zeroY), x2: area.x + area.w, y2: Math.round(zeroY) })

  var points = []
  var index
  for (index = 0; index < series.length; index += 1) {
    var value = series[index].gap
    points.push({
      x: area.x + step * index,
      y: area.y + area.h - ((value - bounds.min) / span) * area.h,
    })
  }
  // 面积填充：把折线两端落到零轴再闭合，视觉上立刻能看出正负区间的占比。
  var polygon = [{ x: points[0].x, y: zeroY }]
  for (index = 0; index < points.length; index += 1) polygon.push(points[index])
  polygon.push({ x: points[points.length - 1].x, y: zeroY })
  ctx.drawPoly({ data_array: polygon, color: 0x102a43 })

  ctx.setPaint({ color: LINE, line_width: 2 })
  for (index = 1; index < points.length; index += 1) {
    ctx.drawLine({
      x1: Math.round(points[index - 1].x), y1: Math.round(points[index - 1].y),
      x2: Math.round(points[index].x), y2: Math.round(points[index].y),
    })
  }
  // 最新一期用实心点标出来
  ctx.drawCircle({ center_x: Math.round(points[points.length - 1].x), center_y: Math.round(points[points.length - 1].y), radius: 3, color: LINE })
}

function render() {
  var size = cardSize()

  var snapshot = readSnapshot()
  var fingerprint = snapshot
    ? [snapshot.month, snapshot.gap, snapshot.m1Yoy, snapshot.m2Yoy, snapshot.updatedAt].join('|')
    : 'empty'
  // 每月只变一次（页面侧 6 小时才去取一次），重复进负一屏不必重画。
  if (fingerprint === card.fingerprint && card.canvas) return
  card.fingerprint = fingerprint

  clear()

  var canvas = null
  try {
    canvas = createWidget(widget.CANVAS, { x: 0, y: 0, w: size.w, h: size.h })
  } catch (_) {
    canvas = null
  }
  card.canvas = canvas
  if (!canvas) return
  // 整卡可点：官方说明卡片只响应点击，点击后跳回主应用（可带参数）。
  try {
    canvas.addEventListener(event.CLICK_UP, function () { openApp() })
  } catch (_) { }

  try {
    drawCardBackground(canvas, size)
  } catch (_) { }

  var innerW = size.w - CONTENT_MARGIN * 2
  var titleSize = Math.max(MIN_TEXT_SIZE, Math.round(size.w * 0.042))
  var heroSize = Math.max(MIN_TEXT_SIZE + 6, Math.round(size.w * 0.125))
  var labelSize = Math.max(MIN_TEXT_SIZE, Math.round(size.w * 0.036))
  var titleH = Math.round(titleSize * 1.6)
  var heroH = Math.round(heroSize * 1.25)
  var labelH = Math.round(labelSize * 1.7)

  addText({
    x: CONTENT_MARGIN, y: CONTENT_MARGIN, w: Math.round(innerW * 0.62), h: titleH,
    size: titleSize, color: TEXT_MUTED, font: FONT_MEDIUM, text: t('M1-M2 剪刀差'),
  })
  // 数据月份靠右：它是"这个读数属于哪个月"的限定，不是主角。
  addText({
    x: CONTENT_MARGIN + Math.round(innerW * 0.55), y: CONTENT_MARGIN,
    w: Math.round(innerW * 0.45), h: titleH,
    size: titleSize, color: TEXT_FAINT, alignH: align.RIGHT,
    text: snapshot && snapshot.month ? snapshot.month : '',
  })

  var heroY = CONTENT_MARGIN + titleH
  var heroWidth = Math.round(innerW * 0.58)
  addText({
    x: CONTENT_MARGIN, y: heroY, w: heroWidth, h: heroH,
    size: heroSize, color: toneColor(snapshot && snapshot.gap), font: FONT_NUMBER,
    text: snapshot ? formatGap(snapshot.gap) : '--',
  })
  addText({
    x: CONTENT_MARGIN + heroWidth, y: heroY, w: innerW - heroWidth, h: heroH,
    size: labelSize, color: TEXT_FAINT, alignH: align.LEFT,
    text: t('百分点'),
  })

  var labelY = heroY + heroH
  var halfInner = Math.round(innerW / 2)
  addText({
    x: CONTENT_MARGIN, y: labelY, w: halfInner - 4, h: labelH,
    size: labelSize, color: TEXT_MUTED,
    text: t('M1 同比') + ' ' + (snapshot ? formatPercent(snapshot.m1Yoy) : '--'),
  })
  addText({
    x: CONTENT_MARGIN + halfInner, y: labelY, w: halfInner, h: labelH,
    size: labelSize, color: TEXT_MUTED,
    text: t('M2 同比') + ' ' + (snapshot ? formatPercent(snapshot.m2Yoy) : '--'),
  })

  // 图表吃掉剩下的高度。高度不够（卡片被系统压得很矮）时就不画图表，
  // 文字仍然完整——优先保证"一眼能看到读数"这件事本身。
  var chartTop = labelY + labelH + 6
  var chartHeight = size.h - CONTENT_MARGIN - chartTop
  if (chartHeight >= 24) {
    try {
      drawTrend(canvas, trendSeries(snapshot, M1M2_TREND_MONTHS), { x: CONTENT_MARGIN, y: chartTop, w: innerW, h: chartHeight })
    } catch (_) { }
  }
}

function openApp() {
  // 卡片与主应用之间只有这一条通路：跳回首页（首页会顺带把快照刷新掉）。
  try { push({ url: 'page/home/index.page' }) } catch (_) { }
}

AppWidget({
  state: {},

  onInit: function () {
    // 生命周期回调都包 try/catch：卡片里抛出的异常会让模拟器卡住，
    // 官方调试建议里专门提了这条。
    // cardSize() 的返回值在这里被丢弃，也不触发绘制——这是一次刻意的探活：
    // 真机上 getAppWidgetSize() 在某些时机可能不可用，先在 onInit 里试一次，
    // 让偶发失败落在能被 try/catch 吞掉的地方，而不是等 build() 里排版时才发现。
    try {
      cardSize()
    } catch (_) { }
  },

  build: function () {
    try {
      render()
    } catch (_) { }
  },

  onResume: function () {
    // 页面侧可能刚更新过快照（比如用户刚从应用里出来），重新读一次。
    try {
      render()
    } catch (_) { }
  },

  onPause: function () { },

  onDestroy: function () {
    try {
      clear()
      card.fingerprint = ''
    } catch (_) { }
  },
})
