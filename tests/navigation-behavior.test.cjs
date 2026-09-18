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
const assert = require('assert')

const root = path.resolve(__dirname, '..')
const modules = new Map()
let deletedWidgets = 0

function makeWidget(type) {
  return {
    type,
    createWidget: makeWidget,
    addEventListener() {},
    clear() {},
    drawRect() {},
    drawText() {},
  }
}

const uiExports = {
  createWidget: makeWidget,
  deleteWidget() { deletedWidgets += 1 },
  setStatusBarVisible() {},
  prop: { MORE: 'more' },
  widget: { CANVAS: 'canvas', VIEW_CONTAINER: 'view-container' },
  event: { CLICK_DOWN: 'down', MOVE: 'move', CLICK_UP: 'up' },
}
const utilsExports = { px(value) { return Number(value || 0) } }
const pageExports = { SCROLL_MODE_SWIPER: 1, setScrollMode() {} }
const deviceExports = { getDeviceInfo() { return { width: 390, height: 450 } } }
const i18nExports = { getText(key) { return key } }
const settingsExports = { getLanguage() { return 0 } }

function synthetic(identifier, exports) {
  const names = Object.keys(exports)
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, exports[name])
  }, { identifier })
}

const external = new Map([
  ['@zos/ui', synthetic('@zos/ui', uiExports)],
  ['@zos/utils', synthetic('@zos/utils', utilsExports)],
  ['@zos/page', synthetic('@zos/page', pageExports)],
  ['@zos/device', synthetic('@zos/device', deviceExports)],
  ['@zos/i18n', synthetic('@zos/i18n', i18nExports)],
  ['@zos/settings', synthetic('@zos/settings', settingsExports)],
])

function getModule(file) {
  file = path.resolve(file)
  if (modules.has(file)) return modules.get(file)
  const source = fs.readFileSync(file, 'utf8')
  const mod = new vm.SourceTextModule(source, { identifier: file })
  modules.set(file, mod)
  return mod
}

async function loadModule(file) {
  const mod = getModule(file)
  // Dependencies are linked recursively by Node and may already be linked or
  // evaluated when requested again through the cache.
  if (mod.status === 'unlinked') {
    await mod.link(async (specifier, referencingModule) => {
      if (external.has(specifier)) return external.get(specifier)
      // zosLoader 的 [pf] 由 zeus 在构建期替换；设备桩是方屏，故固定取 s 那份样式表。
      if (specifier.startsWith('zosLoader:')) specifier = specifier.slice('zosLoader:'.length).replace('[pf]', 's')
      if (!specifier.startsWith('.')) throw new Error(`unexpected external import ${specifier}`)
      return getModule(resolveSource(path.dirname(referencingModule.identifier), specifier))
    })
  }
  if (mod.status === 'linked') await mod.evaluate()
  return mod
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

;(async () => {
  const scenes = (await loadModule(path.join(root, 'utils/navigation/scenes.js'))).namespace
  const runtime = (await loadModule(path.join(root, 'utils/runtime.js'))).namespace
  const renders = [0, 0, 0]
  const page = {
    state: { scenes: new Array(3), pageContainers: [null, null, null] },
    renderPage(index) { renders[index] += 1 },
  }

  runtime.activateRuntime(page)
  scenes.startSectionPerformance(page, 3, 450, 'renderPage', null)
  assert.equal(renders[0], 1, 'initial page was not rendered')

  await wait(430)
  assert.equal(renders[1], 1, 'initial resident neighbour was not warmed')

  page.state.lastInteractionAt = Date.now() - 1000
  scenes.updateSectionPage(page, 1, 'renderPage', 1)
  await wait(150)
  assert.equal(renders[1], 2, 'dirty resident neighbour was not rendered offscreen')
  assert.equal(page.state.dirtyPages[1], false)

  runtime.markInteraction(page)
  scenes.updateSectionPage(page, 1, 'renderPage', 1)
  await wait(150)
  assert.equal(renders[1], 2, 'resident neighbour rendered during active interaction')
  page.state.lastInteractionAt = Date.now() - 1000
  await wait(260)
  assert.equal(renders[1], 3, 'deferred resident neighbour did not render after idle')

  const deletedBeforePageChange = deletedWidgets
  scenes.handleSectionPageChange(page, 3, 450, 1, 'renderPage', null, 240)
  assert.equal(deletedWidgets, deletedBeforePageChange, 'resident page change synchronously deleted native widgets')

  scenes.clearSectionTimers(page)
  scenes.disposeSectionScenes(page.state.scenes)
  runtime.deactivateRuntime(page)
  console.log('navigation_behavior=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
