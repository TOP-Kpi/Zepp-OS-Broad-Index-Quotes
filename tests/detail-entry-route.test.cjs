// 核心标的 → 详情 的入口路径。
//
// 这条路径必须同时满足两件事，才能躲开"详情页黑屏"那个内存问题：
//   1) 用 replace 顶替本页，而不是 push 压栈 —— 栈停在两层，详情页容器才有
//      空间申请（三层时模拟器 JS 堆约 3.7MB 放不下第三个容器，容器申请失败
//      → 页面全黑但返回正常，见 sim-debug.log 里的
//      `js_rt_loadContiner2: failed to load .../page/gt/detail/index.page.js`）。
//   2) 离开前先把本页的场景/控件/数据交出去 —— Zepp 是先申请新页面容器再回收
//      旧页面，不先释放的话本页还压在同一个堆里。
//
// 这两条都属于"看不见的行为约定"：改回 push、或把释放那几行删掉，页面照样
// 能跑、预览也照样对，只有真机/模拟器上三层时才会重新黑屏。所以在这里锁住。
//
// 运行：node --experimental-vm-modules tests/detail-entry-route.test.cjs
const fs = require('fs')
const path = require('path')

// 设备端源码是 .js（zeus/rollup 的解析器不认 TS 语法，也不能构建 .ts 入口）。
// 这里仍按 字面路径 -> .ts -> .js 的顺序探测：若日后有文件改用 .ts 且构建链
// 支持，测试无需再改。
function resolveSource(fromDir, specifier) {
  const base = path.resolve(fromDir, specifier)
  if (path.extname(base)) return base
  for (const ext of ['.ts', '.js']) {
    if (fs.existsSync(base + ext)) return base + ext
  }
  return base + '.ts'
}

const vm = require('vm')

const root = path.resolve(__dirname, '..')
const DESIGN_WIDTH = 390
const DEVICE = { width: 480, height: 480 } // Amazfit Balance：圆屏 480×480
const SCALE = DEVICE.width / DESIGN_WIDTH

const WIDGET = { CANVAS: 'canvas', TEXT: 'text', BUTTON: 'button', VIEW_CONTAINER: 'view-container', PAGE_SCROLLBAR: 'page-scrollbar' }
const created = []
const deleted = []
function makeWidget(type, props = {}) {
  const widget = { id: created.length + 1, type, props: { ...props }, children: [], listeners: [] }
  created.push(widget)
  widget.setProperty = (_prop, patch) => Object.assign(widget.props, patch)
  widget.addEventListener = (event, handler) => widget.listeners.push([event, handler])
  widget.removeEventListener = () => {}
  widget.createWidget = (childType, childProps) => { const child = makeWidget(childType, childProps); widget.children.push(child); return child }
  if (type === WIDGET.CANVAS) {
    for (const method of ['clear', 'drawRect', 'drawText', 'drawLine', 'drawPoly', 'drawCircle', 'strokeCircle', 'strokeArc']) widget[method] = () => {}
    widget.setPaint = () => {}
  }
  return widget
}

const routerCalls = { push: [], replace: [] }
function synthetic(identifier, exports) {
  const names = Object.keys(exports)
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, exports[name]) }, { identifier })
}
const external = new Map([
  ['@zos/ui', synthetic('@zos/ui', {
    createWidget: (type, props) => makeWidget(type, props),
    deleteWidget: (widget) => deleted.push(widget),
    setStatusBarVisible: () => {},
    prop: { MORE: 'MORE', TARGET: 'TARGET' },
    widget: WIDGET,
    align: { LEFT: 0, RIGHT: 1, CENTER_H: 2, TOP: 0, BOTTOM: 1, CENTER_V: 2 },
    text_style: { ELLIPSIS: 'ellipsis' },
    event: { CLICK_DOWN: 'down', MOVE: 'move', CLICK_UP: 'up' },
  })],
  ['@zos/utils', synthetic('@zos/utils', { px: (value) => Math.round(Number(value || 0) * SCALE) })],
  ['@zos/page', synthetic('@zos/page', { SCROLL_MODE_SWIPER: 1, setScrollMode: () => {} })],
  ['@zos/device', synthetic('@zos/device', { getDeviceInfo: () => ({ width: DEVICE.width, height: DEVICE.height, screenShape: 1 }) })],
  ['@zos/i18n', synthetic('@zos/i18n', { getText: (key) => key })],
  ['@zos/router', synthetic('@zos/router', { push: (o) => routerCalls.push.push(o), replace: (o) => routerCalls.replace.push(o), back: () => {} })],
  ['@zos/storage', synthetic('@zos/storage', { localStorage: { getItem: (_k, fallback) => fallback, setItem: () => {}, removeItem: () => {} } })],
  ['@zos/notification', synthetic('@zos/notification', { notify: () => {} })],
  ['@zos/sensor', synthetic('@zos/sensor', {
    Vibrator: function () { this.start = () => {} },
    VIBRATOR_SCENE_DURATION_LONG: 1, VIBRATOR_SCENE_NOTIFICATION: 2,
    VIBRATOR_SCENE_SHORT_MIDDLE: 3, VIBRATOR_SCENE_SHORT_STRONG: 4,
  })],
  ['@zos/settings', synthetic('@zos/settings', { getLanguage: () => 0 })],
  ['@zeppos/zml/base-page', synthetic('@zeppos/zml/base-page', { BasePage: (options) => options })],
])

const modules = new Map()
function getModule(file) {
  file = path.resolve(file)
  if (modules.has(file)) return modules.get(file)
  const module = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file })
  modules.set(file, module)
  return module
}

let capturedPage = null
globalThis.Page = (config) => { capturedPage = config; return config }

async function loadModule(file) {
  const module = getModule(path.join(root, file))
  if (module.status === 'unlinked') {
    await module.link(async (specifier, referencingModule) => {
      if (external.has(specifier)) return external.get(specifier)
      let resolved = specifier
      if (resolved.startsWith('zosLoader:')) resolved = resolved.slice('zosLoader:'.length).replace('[pf]', 'r')
      if (!resolved.startsWith('.')) throw new Error('unexpected external import ' + specifier)
      return getModule(resolveSource(path.dirname(referencingModule.identifier), resolved))
    })
  }
  if (module.status === 'linked') await module.evaluate()
  return module.namespace
}

function assert(condition, message) { if (!condition) throw new Error(message) }

;(async () => {
  await loadModule('page/universe/index.page.js')
  assert(capturedPage && typeof capturedPage.build === 'function', 'universe page config not captured')

  const page = Object.create(capturedPage)
  page.state = capturedPage.state
  if (typeof page.onInit === 'function') page.onInit({ code: '510300', name: '沪深300ETF' })
  page.build()
  await new Promise((resolve) => setTimeout(resolve, 400))

  assert(typeof page.leaveToDetail === 'function', 'universe page must expose leaveToDetail (entry button uses it)')

  const scenesBefore = page.state.scenes.filter(Boolean).length
  const containersBefore = page.state.pageContainers.filter(Boolean).length
  assert(scenesBefore > 0 && containersBefore > 0, 'build() must create scenes and containers first')
  const widgetsBefore = created.length

  const row = page.state.rows[0]
  assert(row && row.item, 'row[0] must be available')
  page.leaveToDetail(row)

  // 1) 资源先交还：数组清空 + 控件被 deleteWidget 回收 + 运行期停用
  assert(page.state.scenes.length === 0, 'leaveToDetail must dispose every scene before navigating')
  assert(page.state.pageContainers.length === 0, 'leaveToDetail must dispose every page container before navigating')
  assert(page.state.runtimeAlive === false, 'leaveToDetail must deactivate the runtime so late responses are ignored')
  assert(deleted.length > 0 && created.length >= widgetsBefore, 'scene widgets must be handed back via deleteWidget (got ' + deleted.length + ')')

  // 2) 顶替而不是压栈，参数取自被点的那一行
  assert(routerCalls.push.length === 0, 'entry must not push: three stacked pages are what breaks the detail page')
  assert(routerCalls.replace.length === 1, 'entry must call router.replace exactly once (got ' + routerCalls.replace.length + ')')
  const options = routerCalls.replace[0] || {}
  assert(options.url === 'page/detail/index.page', 'replace url must be the detail page (got ' + options.url + ')')
  assert(options.params && options.params.code === '510300' && options.params.name === '沪深300ETF',
    'replace params must carry the tapped row (got ' + JSON.stringify(options.params) + ')')

  // 3) 重复点击不会再跳一次
  page.leaveToDetail(row)
  assert(routerCalls.replace.length === 1, 'a second tap must be debounced (still ' + routerCalls.replace.length + ' replace)')

  console.log('detail_entry_route=PASS')
})().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exit(1)
})
