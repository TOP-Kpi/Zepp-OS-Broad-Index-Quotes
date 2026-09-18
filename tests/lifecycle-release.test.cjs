// Regression coverage for the repeated-launch memory growth fix.
//
// The failure mode on device was: first launch smooth, repeated launches lead
// to a black screen and then a watch reboot. Root causes were (1) native
// canvas listeners that were never detached, keeping a closure chain alive from
// the widget through scene.onInteraction to the whole page instance, and (2) a
// Side Service LRU whose order list could detach from the cache, letting
// entries escape the cap forever. Both are asserted here.

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

let attached = []
let detached = []
let deletedWidgets = 0

function makeWidget(type) {
  const widgetRef = {
    type,
    createWidget: makeWidget,
    addEventListener(kind, handler) { attached.push({ widget: widgetRef, kind, handler }) },
    removeEventListener(kind, handler) { detached.push({ widget: widgetRef, kind, handler }) },
    clear() {},
    drawRect() {},
    drawText() {},
    setProperty() {},
  }
  return widgetRef
}

const uiExports = {
  createWidget: makeWidget,
  deleteWidget() { deletedWidgets += 1 },
  setStatusBarVisible() {},
  prop: { MORE: 'more' },
  widget: { CANVAS: 'canvas', VIEW_CONTAINER: 'view-container', BUTTON: 'button', TEXT: 'text' },
  event: { CLICK_DOWN: 'down', MOVE: 'move', CLICK_UP: 'up' },
}
const utilsExports = { px(value) { return Number(value || 0) } }
const pageExports = { SCROLL_MODE_SWIPER: 1, setScrollMode() {} }
const deviceExports = { getDeviceInfo() { return { width: 390, height: 450 } } }
const i18nExports = { getText(key) { return key } }
const settingsExports = { getLanguage() { return 0 } }
const storageExports = { localStorage: { getItem() { return '' }, setItem() {}, removeItem() {} } }

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
  ['@zos/storage', synthetic('@zos/storage', storageExports)],
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
  if (mod.status === 'unlinked') {
    await mod.link(async (specifier, referencingModule) => {
      if (external.has(specifier)) return external.get(specifier)
      if (specifier.startsWith('@zeppos/')) throw new Error(`skip side-service-only import ${specifier}`)
      // zosLoader 的 [pf] 由 zeus 在构建期替换；设备桩是方屏，故固定取 s 那份样式表。
      if (specifier.startsWith('zosLoader:')) specifier = specifier.slice('zosLoader:'.length).replace('[pf]', 's')
      if (!specifier.startsWith('.')) throw new Error(`unexpected external import ${specifier}`)
      return getModule(resolveSource(path.dirname(referencingModule.identifier), specifier))
    })
  }
  if (mod.status === 'linked') await mod.evaluate()
  return mod
}

;(async () => {
  // ---- 1. Scene teardown must detach native listeners and drop closures ----
  const scene = (await loadModule(path.join(root, 'utils/ui/scene.js'))).namespace
  const interaction = (await loadModule(path.join(root, 'utils/ui/interaction.js'))).namespace
  const runtime = (await loadModule(path.join(root, 'utils/runtime.js'))).namespace

  attached = []
  detached = []
  deletedWidgets = 0

  const page = { state: { runtimeAlive: true, runtimeGeneration: 1, runtimeErrors: [] } }
  runtime.activateRuntime(page)

  const created = scene.createScene(450, 0, 0, null)
  assert.ok(created && created.canvas, 'scene canvas was not created')

  // bindInteractionProbe equivalent: the closure captures the page instance.
  created.onInteraction = function () { runtime.markInteraction(page) }
  interaction.ensureSceneTapListeners(created)

  assert.equal(attached.length, 3, 'expected exactly three native listeners per canvas')
  assert.deepEqual(attached.map((entry) => entry.kind).sort(), ['down', 'move', 'up'])

  // View layers stash widget refs and click regions on the scene.
  created.hitRegions = [{ x1: 0, y1: 0, x2: 9, y2: 9, onClick() { page.state.runtimeAlive = false } }]
  created.chartTabButtons = [{ id: 'tab1' }, { id: 'tab2' }]
  created.detailButton = { id: 'detail' }

  scene.disposeScene(created)

  // Three targeted removals plus one no-argument sweep as a safety net.
  const targeted = detached.filter((entry) => entry.handler)
  const sweep = detached.filter((entry) => !entry.handler)
  assert.equal(targeted.length, 3, 'disposeScene must detach all three native listeners')
  assert.equal(sweep.length, 1, 'disposeScene must sweep remaining listeners as a safety net')
  for (const entry of attached) {
    const matched = targeted.some((other) => other.widget === entry.widget && other.kind === entry.kind && other.handler === entry.handler)
    assert.ok(matched, `listener ${entry.kind} was registered but never removed`)
  }
  assert.equal(created.tapListeners.length, 0, 'listener bookkeeping must be emptied')
  assert.equal(created.onInteraction, null, 'closure holding the page instance must be dropped')
  assert.equal(created.onDragDown, null, 'drag closure must be dropped')
  assert.equal(created.onDragMove, null, 'drag closure must be dropped')
  assert.equal(created.onDragUp, null, 'drag closure must be dropped')
  assert.equal(created.hitRegions.length, 0, 'click regions carry onClick closures and must be cleared')
  assert.equal(created.chartTabButtons, null, 'view-stashed widget refs must be cleared')
  assert.equal(created.detailButton, null, 'view-stashed widget refs must be cleared')
  assert.equal(created.vscrollBound, false, 'scroll binding flag must reset so a reused scene rebinds')
  assert.equal(created.canvas, null, 'canvas ref must be cleared')
  assert.ok(deletedWidgets >= 1, 'native widgets must be deleted on dispose')

  // Disposing twice must stay a no-op rather than re-deleting.
  const before = deletedWidgets
  scene.disposeScene(created)
  assert.equal(deletedWidgets, before, 'disposeScene must be idempotent')

  // ---- 2. Repeated open/close must not accumulate native listeners ----
  // This is the exact reported symptom: first launch is smooth, repeated
  // launches end in a black screen and a reboot. Each cycle simulates one page
  // instance with two resident scenes (the hard two-scene bound from
  // navigation/window.js), bound and then torn down.
  const CYCLES = 25
  let cyclesAttached = 0
  let cyclesDetached = 0
  attached = []
  detached = []

  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    const instancePage = { state: { runtimeErrors: [] } }
    runtime.activateRuntime(instancePage)
    const scenes = []
    for (let slot = 0; slot < 2; slot += 1) {
      const resident = scene.createScene(450, 0, slot, null)
      resident.onInteraction = function () { runtime.markInteraction(instancePage) }
      interaction.ensureSceneTapListeners(resident)
      resident.hitRegions = [{ x1: 0, y1: 0, x2: 9, y2: 9, onClick() { instancePage.state.touched = true } }]
      scenes.push(resident)
    }
    cyclesAttached += attached.length
    attached = []

    runtime.deactivateRuntime(instancePage)
    scene.disposeScene(scenes[0])
    scene.disposeScene(scenes[1])
    cyclesDetached += detached.length
    detached = []
  }

  assert.equal(cyclesAttached, CYCLES * 2 * 3, 'every resident scene must bind three listeners')
  // Each scene also issues one no-argument sweep, so total detach calls are the
  // targeted removals plus one sweep per scene. What matters is conservation:
  // every registered listener is accounted for by a removal.
  const cyclesTargeted = cyclesDetached - (CYCLES * 2)
  assert.equal(cyclesTargeted, cyclesAttached, `listeners leaked across ${CYCLES} open/close cycles: ${cyclesAttached} attached vs ${cyclesTargeted} removed`)

  // ---- 3. Transport LRU must never exceed its cap ----
  const transport = (await loadModule(path.join(root, 'app-side/providers/modules/transport.js'))).namespace
  const MAX_KEYS = 96
  const instance = transport.createTransport()
  const HOUR = 60 * 60 * 1000

  const live = []
  function countLive() { return live.filter((key) => instance.peek(key, HOUR) !== null).length }

  // Keys whose loader never settles stay in the pending map. The old eviction
  // shifted such a key out of cacheOrder without deleting it from cache, so the
  // order list detached from the cache and the cap stopped being enforced.
  const stalled = []
  for (let index = 0; index < 50; index += 1) {
    const key = `stalled:${index}`
    stalled.push(key)
    instance.cached(key, HOUR, () => new Promise(() => {})).catch(() => null)
    live.push(key)
  }
  for (let index = 0; index < 250; index += 1) {
    const key = `normal:${index}`
    live.push(key)
    await instance.cached(key, HOUR, () => Promise.resolve({ index }))
  }

  // A stalled key holds no cached value yet, so only normal keys can resolve.
  const resolvedLive = live.filter((key) => key.indexOf('normal:') === 0 && instance.peek(key, HOUR) !== null)
  assert.ok(resolvedLive.length <= MAX_KEYS, `cache cap breached: ${resolvedLive.length} live entries > ${MAX_KEYS}`)
  assert.equal(countLive(), resolvedLive.length, 'peek must not resurrect entries beyond the cap')
  assert.ok(resolvedLive.length > 0, 'cache should still serve recent entries')
  assert.equal(resolvedLive[resolvedLive.length - 1], 'normal:249', 'most recent entry must survive eviction')
  assert.ok(resolvedLive.indexOf('normal:0') < 0, 'oldest entry must have been evicted')

  // clearCache(prefix) must purge the order list too, not just the values.
  instance.clearCache('normal:')
  const afterPrefixClear = live.filter((key) => key.indexOf('normal:') === 0 && instance.peek(key, HOUR) !== null)
  assert.equal(afterPrefixClear.length, 0, 'prefix clear must remove every matching entry')

  await instance.cached('survivor', HOUR, () => Promise.resolve({ ok: true }))
  instance.clearCache()
  assert.equal(instance.peek('survivor', HOUR), null, 'full clear must empty the cache')

  console.log('lifecycle_release=PASS')
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error))
  process.exit(1)
})
