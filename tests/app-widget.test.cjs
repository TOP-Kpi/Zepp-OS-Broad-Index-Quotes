// M1-M2 剪刀差快捷卡片的规范约束回归测试。
//
// 快捷卡片（app-widget）有一批"违反了不报错、只在真机上表现为错位或空白"的约束，
// 官方文档见 zeppos-docs-main：
//   · guides/framework/device/secondary-widget —— 注册、绘制区、可用控件、只响应点击、
//     "卡片拿不到蓝牙实时数据"
//   · designs/customization/shortcut-cards —— 16px 安全边距、最小高度两行文字(120px)、
//     内容排布
//   · reference/app-json.mdx —— app-widget 的 widgets 字段
//   · reference/device-app-api/newAPI/ui/{get,set}AppWidgetSize.mdx —— 尺寸 API
// 这里把能静态判定的部分全部钉住，真机表现仍需实机验收。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))
function assert(condition, message) { if (!condition) throw new Error(message) }

const app = JSON.parse(read('app.json'))

// --- 1) app.json 注册（官方 app-widget 结构） ------------------------------

let widget = null
const targetKeys = Object.keys(app.targets || {})
for (const key of targetKeys) {
  const module = app.targets[key].module || {}
  const registered = module['app-widget']
  if (!registered) continue
  assert(Array.isArray(registered.widgets) && registered.widgets.length > 0,
    `${key}.module.app-widget.widgets must be a non-empty array`)
  // 官方文档：一个 Mini Program 内的 Widget 与快捷卡片合计不超过 5 个。
  assert(registered.widgets.length <= 5, 'at most 5 widgets/shortcut cards are allowed')
  widget = registered.widgets[0]
}
assert(widget, 'app.json declares no app-widget (shortcut card)')

assert(typeof widget.path === 'string' && widget.path, 'app-widget entry must declare a path')
assert(typeof widget.name === 'string' && widget.name, 'app-widget entry must declare a name')
assert(widget.runtime && widget.runtime.type === 'js', 'app-widget runtime.type must be "js"')
// icon 相对"资源目录"解析：资源目录名是 <target 键>.<屏幕限定符>（assets/gt.r、assets/gt.s），
// 所以每个形状的资源目录里都要有一份，缺一个形状就构建失败。
const assetDirs = []
for (const key of targetKeys) {
  for (const platform of app.targets[key].platforms || []) {
    if (!platform.st) continue
    const dir = path.join('assets', `${key}.${platform.st}`)
    if (!assetDirs.includes(dir)) assetDirs.push(dir)
  }
}
assert(assetDirs.length > 0, 'app.json declares no screen type, so there is no asset directory')
if (widget.icon) {
  assert(!widget.icon.includes('/'), 'the app-widget icon is a file name inside the asset directory')
  for (const dir of assetDirs) {
    const icon = path.join(dir, widget.icon)
    assert(exists(icon), `${icon} is missing (the app-widget icon resolves inside each shape's asset dir)`)
    assert(fs.statSync(path.join(root, icon)).size > 0, `${icon} is empty`)
  }
}

const cardPath = widget.path + '.js'
assert(exists(cardPath), `${cardPath} is missing`)

const cardSource = read(cardPath)
// 代码形态检查必须先剥注释：卡片源码的注释里就写着"不用 px()"这类说明，
// 直接在原文上匹配会把注释当成代码。msgid 提取仍用原文，与 build_i18n.py 的
// 扫描方式保持一致（生成器也是按原文正则找 t('...')）。
const cardCode = cardSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// --- 2) 卡片文案的多语言：34 份 .po 必须都有 -------------------------------

const msgids = [...cardSource.matchAll(/\btf?\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1])
assert(msgids.length > 0, 'the card must use t() for its copy, not hardcoded text')

const poFiles = fs.readdirSync(path.join(root, 'page/i18n')).filter((n) => n.endsWith('.po'))
assert(poFiles.length > 0, 'no i18n catalogs found')
for (const name of poFiles) {
  const catalog = read(path.join('page/i18n', name))
  for (const msgid of msgids) {
    assert(catalog.includes(`msgid "${msgid}"`),
      `page/i18n/${name} is missing the card string ${JSON.stringify(msgid)}`)
  }
}

// 卡片名走 app.json 的根 i18n（官方：SecondaryWidget 的名字在 secondary-widget 里配，
// 快捷卡片的名字在根 i18n 里配），每个语言都要有。
for (const locale of Object.keys(app.i18n || {})) {
  const entry = app.i18n[locale]['app-widget']
  const name = entry && entry.widgets && entry.widgets[0] && entry.widgets[0].name
  assert(typeof name === 'string' && name, `app.json i18n.${locale} has no app-widget name`)
}

// --- 3) 绘制区约束 ---------------------------------------------------------

// 布局必须来自官方尺寸 API；拿不到时的兜底也不能是写死的单一分辨率。
assert(cardCode.includes('getAppWidgetSize'), 'the card must lay out from getAppWidgetSize()')

// setAppWidgetSize 只能设高度，且官方限定在设备高度的 20%~60%。
const setSize = cardCode.match(/setAppWidgetSize\(\s*\{\s*h:\s*([^}]+)\}/)
if (setSize) {
  const ratio = Number((setSize[1].match(/([0-9.]+)\s*\)?\s*\*\s*/) || [])[1])
  if (Number.isFinite(ratio)) {
    assert(ratio >= 0.2 && ratio <= 0.6,
      `setAppWidgetSize height ratio ${ratio} is outside the documented 20%-60% band`)
  }
}

// 官方禁止在快捷卡片里使用滚动/层叠类控件。
for (const forbidden of ['GROUP', 'SCROLL_LIST', 'VIEW_CONTAINER', 'PAGE_SCROLLBAR']) {
  assert(!new RegExp(`widget\\.${forbidden}\\b`).test(cardCode),
    `${forbidden} cannot be used in a shortcut card (official restriction)`)
}

// 卡片绘制区的坐标原点是卡片左上角、单位是设备像素：套 px() 会按屏宽再缩放一次。
assert(!/\bpx\(/.test(cardCode),
  'shortcut card coordinates are device pixels relative to the card; px() would scale them again')

// 设计规范：内容与卡片边缘保持 16px 安全边距；单卡最小高度 120px（两行文字）。
assert(/CONTENT_MARGIN\s*=\s*16\b/.test(cardCode), 'the 16px content margin must be a named constant')
assert(/MIN_CARD_HEIGHT\s*=\s*120\b/.test(cardCode),
  'the 120px minimum card height (2 lines of text) must be a named constant')
assert(/x:\s*CONTENT_MARGIN/.test(cardCode),
  'content must be laid out from the content margin, not from the card edge')

// --- 4) 数据来源：只读本地快照，不自己发请求 -------------------------------

// 官方：快捷卡片拿不到蓝牙实时数据，必须由页面把数据落到本地存储。
assert(!/@zos\/ble|MessageBuilder|\.request\(/.test(cardCode),
  'the card cannot use BLE/side-service data; it must read the snapshot the page persisted')
assert(/readSnapshot/.test(cardCode), 'the card must read the shared snapshot helper')

// 页面侧必须真的在写快照，否则卡片永远显示"数据不足"。
const pageSource = read('page/home/index.page.js')
assert(/loadMoneySupply/.test(pageSource), 'the home page must refresh the M1-M2 snapshot for the card')
const serviceSource = read('page/home/services/liquidity.js')
assert(/writeSnapshot/.test(serviceSource), 'the liquidity service must persist the snapshot')

// --- 5) 点击跳回主应用 -----------------------------------------------------

assert(/from '@zos\/router'/.test(cardCode), 'the card must use @zos/router to open the app')
const routeUrl = (cardCode.match(/push\(\s*\{\s*url:\s*'([^']+)'/) || [])[1]
assert(routeUrl, 'the card must push a page url')
const declaredPages = []
for (const key of targetKeys) {
  const pages = (app.targets[key].module.page || {}).pages || []
  declaredPages.push(...pages)
}
assert(declaredPages.includes(routeUrl),
  `the card pushes ${routeUrl}, which is not declared in app.json page.pages`)

// --- 6) 配色与主工程一致（卡片不 import constants.js，靠这条锁住不漂移） ----

const constants = read('utils/constants.js')
const colorMap = {}
for (const line of constants.split('\n')) {
  const matched = line.match(/^\s*(\w+):\s*(0x[0-9a-fA-F]+)/)
  if (matched) colorMap[matched[1]] = matched[2].toLowerCase()
}
const cardColors = [...cardCode.matchAll(/0x[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase())
const known = new Set(Object.values(colorMap))
const rogue = [...new Set(cardColors)].filter((c) => !known.has(c))
assert(rogue.length === 0,
  `the card uses colors absent from utils/constants.js COLORS: ${rogue.join(', ')}`)

// 卡片里那几个命名常量应当分别等于主工程对应色，改配色时两边一起改。
const assigned = {}
for (const matched of cardCode.matchAll(/^var\s+(\w+)\s*=\s*(0x[0-9a-fA-F]{6})/gm)) {
  assigned[matched[1]] = matched[2].toLowerCase()
}
const expected = {
  CARD_BG: colorMap.card,
  TEXT_MAIN: colorMap.text,
  TEXT_MUTED: colorMap.muted,
  TEXT_FAINT: colorMap.faint,
  TONE_FLAT: colorMap.muted,
  GRID: colorMap.grid,
  LINE: colorMap.accent,
  TONE_UP: colorMap.positive,
  TONE_DOWN: colorMap.negative,
}
for (const name of Object.keys(expected)) {
  if (!assigned[name] || !expected[name]) continue
  assert(assigned[name] === expected[name],
    `${name} (${assigned[name]}) must equal the app palette value ${expected[name]} from utils/constants.js`)
}

console.log(`app_widget=PASS (${msgids.length} card strings in ${poFiles.length} catalogs, `
  + `${Object.keys(app.i18n).length} locales named)`)
