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
const values = new Map()
const localStorage = {
  getItem(key, fallback) { return values.has(key) ? values.get(key) : fallback },
  setItem(key, value) { values.set(key, value) },
  removeItem(key) { values.delete(key) },
}

const storageModule = new vm.SyntheticModule(['localStorage'], function () {
  this.setExport('localStorage', localStorage)
}, { identifier: '@zos/storage' })

const i18nModule = new vm.SyntheticModule(['getText'], function () {
  this.setExport('getText', (key) => key)
}, { identifier: '@zos/i18n' })

const settingsModule = new vm.SyntheticModule(['getLanguage'], function () {
  this.setExport('getLanguage', () => 0)
}, { identifier: '@zos/settings' })

// constants.js derives SAFE_AREA / CONTENT from the device, so any module graph
// that reaches it needs a device stub here.
const deviceModule = new vm.SyntheticModule(['getDeviceInfo'], function () {
  this.setExport('getDeviceInfo', () => ({ width: 390, height: 450 }))
}, { identifier: '@zos/device' })

async function loadModule(file) {
  file = path.resolve(file)
  if (modules.has(file)) return modules.get(file)
  const source = fs.readFileSync(file, 'utf8')
  const mod = new vm.SourceTextModule(source, { identifier: file })
  modules.set(file, mod)
  await mod.link(async (specifier, referencingModule) => {
    if (specifier === '@zos/storage') return storageModule
    if (specifier === '@zos/i18n') return i18nModule
    if (specifier === '@zos/settings') return settingsModule
    if (specifier === '@zos/device') return deviceModule
    // zeus 在构建期把 zosLoader 说明符里的 [pf] 换成目标形状后缀。本测试的设备桩
    // 是 390×450 方屏，因此固定取形状样式表 s 那份；两份表的同构性由
    // tests/shape-layout.test.cjs 锁定。
    if (specifier.startsWith('zosLoader:')) specifier = specifier.slice('zosLoader:'.length).replace('[pf]', 's')
    if (!specifier.startsWith('.')) throw new Error(`unexpected external import ${specifier}`)
    return loadModule(resolveSource(path.dirname(referencingModule.identifier), specifier))
  })
  await mod.evaluate()
  return mod
}

function context(request) {
  return {
    state: {
      runtimeAlive: true,
      runtimeGeneration: 1,
      requestEpochs: {},
      pendingRequests: {},
      runtimeErrors: [],
    },
    request,
  }
}

;(async () => {
  const data = (await loadModule(path.join(root, 'utils/data.js'))).namespace
  let networkCalls = 0
  const page = context(() => {
    networkCalls += 1
    return Promise.resolve({ marker: 'network-value' })
  })

  await data.requestWithCache(page, 'dashboard', {}, { forceNetwork: true })
  assert.equal(networkCalls, 1)

  const cached = await data.requestWithCache(page, 'dashboard', {}, { cacheOnly: true })
  assert.equal(networkCalls, 1, 'cache-only hydration started a network request')
  assert.equal(cached.data.marker, 'network-value')
  assert.equal(cached.cached, true)

  await assert.rejects(
    data.requestWithCache(page, 'chart', { code: '510300', period: 'day' }, { cacheOnly: true }),
    (error) => error && error.code === 'ETF_CACHE_MISS'
  )
  assert.equal(networkCalls, 1, 'cache miss started a network request')

  let finishPending
  const pendingPage = context(() => {
    networkCalls += 1
    return new Promise((resolve) => { finishPending = resolve })
  })
  const pending = data.requestWithCache(pendingPage, 'flow', { code: '510300' }, { forceNetwork: true })
  await assert.rejects(
    data.requestWithCache(pendingPage, 'flow', { code: '510300' }, { cacheOnly: true }),
    (error) => error && error.code === 'ETF_CACHE_MISS'
  )
  finishPending({ marker: 'pending-value' })
  await pending
  assert.equal(networkCalls, 2, 'cache-only hydration duplicated or joined the pending request')

  console.log('cache_hydration=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
