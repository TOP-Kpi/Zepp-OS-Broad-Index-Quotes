import { getDeviceInfo } from '@zos/device'
import { t } from './i18n'
// 形状样式表：构建期由 zosLoader 把 [pf] 换成目标形状后缀（gt.r / gt.s），
// 方屏与圆屏各自只打包自己那份版面常量。两份表导出同一组键，视图层
// 因此只有一条代码路径，不需要在运行时判断自己在哪种屏上。
import { ROUND, HEADER, METRICS, SCREENS as SCREEN_STYLE } from 'zosLoader:./shape.[pf].layout.js'

// 模块加载期读取设备信息：view/page 模块都在顶层 import 本文件，因此这里
// 一旦抛错，整个 import 图会一起失败（表现为页面全黑、仅有状态栏）。
// getDeviceInfo 在两侧都做防御：调用本身可能不可用，返回值也可能为空。
function readDeviceInfo() {
  var info = null
  try { info = getDeviceInfo() } catch (_) { info = null }
  return info && typeof info === 'object' ? info : {}
}

var DEVICE = readDeviceInfo()

export var COLORS = {
  background: 0x000000,
  card: 0x171717,
  panel: 0x171717,
  panelAlt: 0x222222,
  text: 0xffffff,
  secondary: 0xe5e5e7,
  muted: 0x8e8e93,
  faint: 0x636366,
  border: 0x2c2c2e,
  grid: 0x2c2c2e,
  accent: 0x0a84ff,
  accentSoft: 0x102a43,
  positive: 0xff453a,
  positiveSoft: 0x3a1715,
  negative: 0x30d158,
  negativeSoft: 0x12321c,
  warning: 0xff9f0a,
  warningSoft: 0x3a2a0d,
  purple: 0x5e5ce6,
  purpleSoft: 0x242345,
  black: 0x000000,
  white: 0xffffff,
  // 磨砂玻璃材质层（光影：顶光/底影）
  glassHighlight: 0x2f2f36,
  glassShade: 0x0f0f12,
}

// 模块主题色（Zepp 设计语言：不同功能模块用不同主题色，兼具"温暖"气质）
export var THEME = {
  market: 0xff9f0a,    // 市场温度：暖琥珀（光）
  universe: 0x0a84ff,  // 宽基行情：晴蓝
  signal: 0x5e5ce6,    // 智能信号：静紫
  portfolio: 0x30d158, // 自选持仓：生机绿
  alerts: 0xff453a,    // 预警记录：暖红
  settings: 0x8e8e93,  // 设置：中性灰
}

export var ETF_UNIVERSE = [
  { code: '510300', name: '沪深300ETF', shortName: '沪深300', indexCode: '000300', indexSymbol: 'sh.000300', xqSymbol: 'SH000300' },
  { code: '510500', name: '中证500ETF', shortName: '中证500', indexCode: '000905', indexSymbol: 'sh.000905', xqSymbol: 'SH000905' },
  { code: '512100', name: '中证1000ETF', shortName: '中证1000', indexCode: '000852', indexSymbol: 'sh.000852', xqSymbol: 'SH000852' },
  { code: '515180', name: '中证红利ETF', shortName: '中证红利', indexCode: '000922', indexSymbol: 'sh.000922', xqSymbol: 'SH000922' },
  { code: '159915', name: '创业板ETF', shortName: '创业板指', indexCode: '399006', indexSymbol: 'sz.399006', xqSymbol: 'SZ399006' },
  { code: '588000', name: '科创50ETF', shortName: '科创50', indexCode: '000688', indexSymbol: 'sh.000688', xqSymbol: 'SH000688' },
]

export var HOME_UNIVERSE_CODES = ['510300', '510500', '512100', '588000']

// Signal labels are resolved through i18n on the device; the side service only
// sends action codes, so the displayed language always follows the device.
export var SIGNAL_ACTIONS = {
  BUY: { label: t('分批买入'), short: t('买入'), color: COLORS.positive, soft: COLORS.positiveSoft, priority: 5 },
  HOLD: { label: t('继续持有'), short: t('持有'), color: COLORS.accent, soft: COLORS.accentSoft, priority: 2 },
  WATCH: { label: t('耐心观察'), short: t('观察'), color: COLORS.warning, soft: COLORS.warningSoft, priority: 1 },
  REDUCE: { label: t('考虑减仓'), short: t('减仓'), color: COLORS.warning, soft: COLORS.warningSoft, priority: 4 },
  EXIT: { label: t('清仓预警'), short: t('清仓'), color: COLORS.negative, soft: COLORS.negativeSoft, priority: 6 },
  UNKNOWN: { label: t('数据不足'), short: '--', color: COLORS.muted, soft: COLORS.panelAlt, priority: 0 },
}

export var STORAGE_KEYS = {
  alertHistory: 'etfstudio.alertHistory.v1',
  lastSignals: 'etfstudio.lastSignals.v1',
  klineCount: 'etfstudio.klineCount',
}

export var CACHE_TTL_MS = {
  dashboard: 60 * 1000,
  universe: 60 * 1000,
  market: 60 * 1000,
  overview: 60 * 1000,
  signal: 60 * 1000,
  chart: 60 * 1000,
  flow: 60 * 1000,
  shares: 6 * 60 * 60 * 1000,
  valuation: 6 * 60 * 60 * 1000,
  margin: 15 * 60 * 1000,
  // M1/M2 是月频数据，设备端也按 6 小时缓存：60 秒一次的自动刷新不会真的去打网络，
  // 而快捷卡片读的是这份缓存落下去的快照（卡片拿不到蓝牙）。
  moneySupply: 6 * 60 * 60 * 1000,
  portfolio: 60 * 1000,
  alerts: 5 * 60 * 1000,
  settings: 60 * 60 * 1000,
}

// 方屏设备的玻璃圆角半径（rAngle）随分辨率变化，并非固定值：
//   390×450 → 86 / 336×384 → 80 / 320×380 → 69 / 432×514 → 106
// 圆角以内、贴近边缘的区域会被屏幕裁切，所以安全边距必须按当前屏幕
// 反推，而不是写死 GTS 4 的数值——否则小屏上边距过宽浪费本就紧张的
// 纵向空间，大屏上边距过窄会把标题压进圆角裁切区。
var SQUARE_CORNER_RADII = {
  '390x450': 86,
  '432x514': 106,
  '336x384': 80,
  '320x380': 69,
}

// 以 390×450（rAngle 86）为基准把边距按比例缩放到当前屏幕。基准必须
// 精确复现调整前的取值：左右各 30px、上下各 26px。
var REFERENCE_RADIUS = 86
var REFERENCE_SIDE = 30
var REFERENCE_EDGE = 26

function cornerRadiusFor(width, height) {
  // 设备信息缺失/异常时按基准屏（390×450）处理：本文件其它取值也一律以
  // 390/450 兜底，圆角必须同源，否则未知设备会推出与基准不同的安全边距
  // （0.245 外推比基准自身的 86/390≈0.2205 更大，会得到 33 而不是 30）。
  var w = Number(width) || 390
  var h = Number(height) || 450
  var known = SQUARE_CORNER_RADII[String(w) + 'x' + String(h)]
  if (known) return known
  // 未登记的分辨率：按短边线性外推，再夹到合理区间。
  // 均值 0.22——真实圆角普遍大于短边的 22%，低估会让 scaleInset 给出偏小
  // 的安全边距，内容可能落进圆角裁切区；高估只是多留几像素，无害。
  var shorter = Math.min(w, h)
  return Math.round(Math.min(110, Math.max(40, shorter * 0.245)))
}

// 圆角越大，越需要远离边缘；同时不低于可读性下限。
function scaleInset(base, radius, floor) {
  return Math.max(floor, Math.round(base * radius / REFERENCE_RADIUS))
}

var SCREEN_CORNER_RADIUS = cornerRadiusFor(DEVICE.width, DEVICE.height)

// 圆屏：圆形显示区由屏宽决定——直径就是屏宽（圆屏设备宽高相等），
// 圆心在屏幕正中，半径 = 屏宽 / 2。因此圆屏的安全区不是一个固定边距，
// 而是"随纵向位置变化的弦宽"：离圆心越远，可用宽度越窄。
//
//   半弦长(dy) = √(R² - dy²)，R 取半径减去视觉余量。
//   页头标题行 dy = -161 → 半弦 99 → 可用宽度 198；
//   标题+页码徽标（约 190）刚好放得下，所以标题字号从 24 降到 20。
//   副标题行 dy = -132 → 半弦 135 → 可用宽度 270。
//
// 内容卡片带取"整块同宽"的最大内接矩形，保证各屏左右边距一致、翻页不跳动：
//   W = 300、H = 228 时四角半径 188.4 < 189（= 195 - 6 余量），是全屏通用的
//   最大可用矩形。更靠上的页头、更靠外的滚动条各自按所在行的弦宽收窄。
var DESIGN_WIDTH = 390
var ROUND_TOLERANCE = 6
var ROUND_CONTENT = { x: 45, y: 81, w: 300, h: 228 }

// 圆屏设计画布高度：px() 以设计宽度为基准缩放，宽高相等的圆屏因此得到
// 390×390 的设计画布（方屏 390×450）。视觉安全半径按设计单位计算。
function roundDesignHeight() {
  var width = Number(DEVICE.width)
  var height = Number(DEVICE.height)
  if (!(width > 0) || !(height > 0)) return DESIGN_WIDTH
  return Math.round(height * DESIGN_WIDTH / width)
}

var DESIGN_HEIGHT = ROUND ? roundDesignHeight() : (Number(DEVICE.height) || 450)

// 设计单位 → 设备像素的缩放系数：px() 以 app.json 的 designWidth（= DESIGN_WIDTH）
// 为基准按屏宽缩放。触摸事件给的是设备像素，而排版偏移是设计单位，
// 凡是"手指数值"与"排版数值"相遇的地方（只此一处：列表纵向滚动）都要用它换算，
// 否则圆屏上拖动 1px 内容只走 1 设计单位（≈1.2 设备像素），手感发黏。
export var DESIGN_SCALE = (Number(DEVICE.width) || DESIGN_WIDTH) / DESIGN_WIDTH

export var SHAPE = ROUND ? 'r' : 's'
export var IS_ROUND = ROUND
export var LAYOUT = SCREEN_STYLE
export var HEADER_STYLE = HEADER

// 圆屏的可用半宽（设计单位）——需要贴边放元素时用它收窄，而不是写死边距。
export function roundHalfChord(dy) {
  var radius = DESIGN_WIDTH / 2 - ROUND_TOLERANCE
  var offset = Math.abs(Number(dy) || 0)
  if (offset >= radius) return 0
  return Math.sqrt(radius * radius - offset * offset)
}

export var SAFE_AREA = ROUND
  ? {
      // 圆屏没有"一条边的安全内缩"这个概念，这里给出内容是可信的含义：
      // 左右 = 卡片带内缩，上下 = 页头标题行 / 卡片带下缘到屏边的留白。
      left: ROUND_CONTENT.x,
      right: ROUND_CONTENT.x,
      top: HEADER.titleY,
      bottom: Math.round(DESIGN_HEIGHT - ROUND_CONTENT.y - ROUND_CONTENT.h),
    }
  : {
      // 390×450 → 30/26，与调整前的取值完全相同，GTS 4 视觉不变。
      left: scaleInset(REFERENCE_SIDE, SCREEN_CORNER_RADIUS, 20),
      right: scaleInset(REFERENCE_SIDE, SCREEN_CORNER_RADIUS, 20),
      top: scaleInset(REFERENCE_EDGE, SCREEN_CORNER_RADIUS, 18),
      bottom: scaleInset(REFERENCE_EDGE, SCREEN_CORNER_RADIUS, 18),
    }

// 卡片/列表的横向几何。视图层原先在 15 个文件里重复写死 16 / 358，
// 那是"390 宽屏、左右各 16 边距"的展开值；改由这里统一推导，窄屏
// 才能得到等比例的留白与卡片宽度。
// 双列卡片（指标卡）每列 173 宽、列间 12 间隙；右侧列起点由屏宽推出。
var CARD_GAP = METRICS.gridGap
var HALF_CARD_WIDTH = ROUND
  ? Math.floor((ROUND_CONTENT.w - CARD_GAP) / 2)
  : 173

export var CONTENT = ROUND
  ? {
      // 圆屏全部走设计单位：整块内容统一用同一个矩形，纵向节奏由
      // shape.r.layout.js 的 SCREENS 表压缩到 228 高（方屏是 358）。
      screenWidth: DESIGN_WIDTH,
      screenHeight: DESIGN_HEIGHT,
      x: ROUND_CONTENT.x,
      y: ROUND_CONTENT.y,
      w: ROUND_CONTENT.w,
      h: ROUND_CONTENT.h,
      margin: ROUND_CONTENT.x,
      width: ROUND_CONTENT.w,
      innerX: ROUND_CONTENT.x + METRICS.innerPad,
      innerWidth: ROUND_CONTENT.w - METRICS.innerPad * 2,
      scrollbarX: ROUND_CONTENT.x + ROUND_CONTENT.w + 2,
      columnRightX: ROUND_CONTENT.x + HALF_CARD_WIDTH + CARD_GAP,
      halfWidth: HALF_CARD_WIDTH,
      gridGap: CARD_GAP,
      gridGap3: METRICS.gridGap3,
      headerCardY: METRICS.headerCardY,
    }
  : {
      screenWidth: Number(DEVICE.width) || 390,
      screenHeight: Number(DEVICE.height) || 450,
      x: 16,
      y: METRICS.headerCardY,
      w: (Number(DEVICE.width) || 390) - 32,
      h: (Number(DEVICE.height) || 450) - METRICS.headerCardY,
      margin: 16,
      width: (Number(DEVICE.width) || 390) - 32,
      innerX: 29,
      innerWidth: (Number(DEVICE.width) || 390) - 61,
      scrollbarX: (Number(DEVICE.width) || 390) - 14,
      // 右列起点：左列宽 + 间隙，再加左边距。390 宽下即 16 + 173 + 12 = 201。
      columnRightX: 16 + HALF_CARD_WIDTH + CARD_GAP,
      halfWidth: HALF_CARD_WIDTH,
      gridGap: CARD_GAP,
      gridGap3: METRICS.gridGap3,
      headerCardY: METRICS.headerCardY,
    }

// 等宽多列：390 宽方屏下 columns(2, 12) → 16 / 201（= columnRightX）、
// columns(3, 11) → 16 / 139 / 262，与改动前逐像素一致；圆屏同式收窄。
export function columns(count, gap) {
  var total = Math.max(1, Math.floor(Number(count) || 1))
  var spacing = Number(gap === undefined ? CONTENT.gridGap : gap)
  var width = Math.floor((CONTENT.width - spacing * (total - 1)) / total)
  var list = []
  var index
  for (index = 0; index < total; index += 1) {
    list.push({ x: CONTENT.x + index * (width + spacing), w: width })
  }
  return list
}


// Zepp OS 3.0 design-library fonts, subset into assets/gt.s/fonts/.
// Canvas drawText has no font support; every widget-based drawText goes
// through these paths, so language coverage == subset glyph coverage.
export var FONT = {
  sans: 'fonts/NotoSans-Regular.ttf',
  sansMedium: 'fonts/NotoSans-Medium.ttf',
  number: 'fonts/Zepp-OS-Number.ttf',
  numberBold: 'fonts/Zepp-OS-Number-blod.ttf',
}
