// constants.js 在模块顶层读取设备信息，而所有 page/view 模块都在顶层 import 它。
// 一旦这里抛错，整个 import 图失败，页面表现为全黑（只有系统状态栏）。
// 本测试用真实的 utils/constants.js 在各种异常 getDeviceInfo 下求值，断言：
//   1) 不抛错；
//   2) 390×450 / 未知设备都回落到既有的 GTS 4 安全边距与卡片宽度；
//   3) 已知的大屏设备按比例放大。
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

async function loadConstants(deviceFactory) {
  const modules = new Map()
  const deviceModule = new vm.SyntheticModule(['getDeviceInfo'], function () {
    this.setExport('getDeviceInfo', deviceFactory)
  }, { identifier: '@zos/device' })
  const i18nModule = new vm.SyntheticModule(['getText', 't', 'tf'], function () {
    this.setExport('getText', (k) => k)
    this.setExport('t', (k) => k)
    this.setExport('tf', (k) => k)
  }, { identifier: '@zos/i18n' })
  const settingsModule = new vm.SyntheticModule(['getLanguage'], function () {
    this.setExport('getLanguage', () => 0)
  }, { identifier: '@zos/settings' })

  async function load(file) {
    file = path.resolve(file)
    if (modules.has(file)) return modules.get(file)
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file })
    modules.set(file, mod)
    await mod.link(async (specifier, ref) => {
      if (specifier === '@zos/device') return deviceModule
      if (specifier === '@zos/i18n') return i18nModule
      if (specifier === '@zos/settings') return settingsModule
      // zosLoader 的 [pf] 由 zeus 在构建期替换；本测试断言的是方屏基线取值，
      // 故固定取 s 那份形状样式表。
      if (specifier.startsWith('zosLoader:')) specifier = specifier.slice('zosLoader:'.length).replace('[pf]', 's')
      return load(resolveSource(path.dirname(ref.identifier), specifier))
    })
    await mod.evaluate()
    return mod
  }

  return (await load(path.join(root, 'utils/constants.js'))).namespace
}

function assert(cond, msg) { if (!cond) throw new Error(msg) }

;(async () => {
  // 异常/缺失的设备信息必须被吸收，不能中断模块求值。
  for (const [label, factory] of [
    ['undefined', () => undefined],
    ['null', () => null],
    ['empty object', () => ({})],
    ['throwing', () => { throw new Error('device unavailable') }],
  ]) {
    let safe, content
    try {
      ({ SAFE_AREA: safe, CONTENT: content } = await loadConstants(factory))
    } catch (error) {
      throw new Error(`constants.js threw when getDeviceInfo returned ${label}: ${error.message}`)
    }
    assert(safe && content, `${label}: SAFE_AREA/CONTENT missing`)
    assert(safe.left === 30 && safe.right === 30, `${label}: expected GTS4 side inset 30, got ${safe.left}`)
    assert(safe.top === 26 && safe.bottom === 26, `${label}: expected GTS4 edge inset 26, got ${safe.top}`)
    assert(content.width === 358, `${label}: expected content width 358, got ${content.width}`)
  }

  // 基准屏 390×450 必须与改动前的取值完全一致。
  const base = await loadConstants(() => ({ width: 390, height: 450 }))
  assert(base.SAFE_AREA.left === 30, `390x450 side inset must stay 30, got ${base.SAFE_AREA.left}`)
  assert(base.SAFE_AREA.top === 26, `390x450 edge inset must stay 26, got ${base.SAFE_AREA.top}`)
  assert(base.CONTENT.width === 358, `390x450 content width must stay 358, got ${base.CONTENT.width}`)
  assert(base.CONTENT.margin * 2 + base.CONTENT.width === 390, '390x450: card band must exactly fill the screen')

  // 大屏设备按圆角比例放大，且卡片带仍精确铺满屏宽。
  const big = await loadConstants(() => ({ width: 432, height: 514 }))
  assert(big.SAFE_AREA.left > base.SAFE_AREA.left, 'Bip Max side inset should scale up from the 390 reference')
  assert(big.CONTENT.width === 400, `Bip Max content width should be 400, got ${big.CONTENT.width}`)
  assert(big.CONTENT.margin * 2 + big.CONTENT.width === 432, 'Bip Max: card band must exactly fill the screen')
  assert(big.CONTENT.innerX + big.CONTENT.innerWidth <= 432, 'Bip Max: inner content must stay on screen')
  assert(big.CONTENT.scrollbarX > 0 && big.CONTENT.scrollbarX < 432, 'Bip Max: scrollbar must stay on screen')

  // 小屏设备同样收敛，且内容不越界。
  const small = await loadConstants(() => ({ width: 320, height: 380 }))
  assert(small.SAFE_AREA.left < base.SAFE_AREA.left, 'Bip 5 Unity side inset should shrink from the 390 reference')
  assert(small.CONTENT.margin * 2 + small.CONTENT.width === 320, 'Bip 5 Unity: card band must exactly fill the screen')
  assert(small.CONTENT.innerX + small.CONTENT.innerWidth <= 320, 'Bip 5 Unity: inner content must stay on screen')

  console.log('device_metrics=PASS')
})().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exit(1)
})
