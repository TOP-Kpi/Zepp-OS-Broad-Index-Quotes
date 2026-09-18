const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))
function assert(cond, msg) { if (!cond) throw new Error(msg) }

const scrollbar = read('utils/navigation/scrollbar.js')
const swiper = read('utils/navigation/swiper.js')
const facade = read('utils/navigation/index.js')

assert(scrollbar.includes('widget.PAGE_SCROLLBAR'), 'native PAGE_SCROLLBAR is not used')
assert(scrollbar.includes('createWidget(widget.PAGE_SCROLLBAR'), 'PAGE_SCROLLBAR is not created directly')
assert(scrollbar.includes('setProperty(prop.TARGET'), 'PAGE_SCROLLBAR is not bound to a VIEW_CONTAINER via TARGET')
assert(scrollbar.includes('deleteWidget(scrollbar)'), 'PAGE_SCROLLBAR lifecycle cleanup missing')
assert(swiper.includes('attachContainerScrollbar'), 'swiper does not attach a bound scrollbar per container')
assert(swiper.includes('detachContainerScrollbar'), 'swiper does not detach the container scrollbar on dispose')
assert(swiper.includes('PAGE_SCROLLBAR') || scrollbar.includes('createSectionPageScrollbar'), 'container scrollbar is not routed through the scrollbar module')
assert(!swiper.includes('PAGE_INDICATOR'), 'legacy PAGE_INDICATOR remains in swiper module')
assert(!facade.includes('createSectionPageIndicator'), 'legacy PAGE_INDICATOR facade export remains')
// 资源目录名由 app.json 声明的形状后缀决定，不写死 gt.s：目录改名后
// "文件本来就不存在"会让 !exists 断言误通过，所以先要求目录存在，再逐个
// 声明过的形状检查旧指示器 PNG 都已删除。
const appJson = JSON.parse(read('app.json'))
const targetKey = Object.keys(appJson.targets || {})[0]
for (const platform of (appJson.targets[targetKey] || {}).platforms || []) {
  const dir = `assets/${targetKey}.${platform.st}`
  assert(exists(dir), `${dir} is missing (shape declared in app.json but no asset folder)`)
  assert(!exists(`${dir}/page_indicator_selected.png`), `${dir}: selected indicator PNG should be removed`)
  assert(!exists(`${dir}/page_indicator_unselected.png`), `${dir}: unselected indicator PNG should be removed`)
}

const scenes = read('utils/navigation/scenes.js')
const marketView = read('page/home/views/market.js')
assert(scenes.includes('isInteractionIdle(context, 240)'), 'render deferral during interaction missing')
assert(scenes.includes('transitionWindow[previous] = true'), 'previous scene is not retained during page transition')
assert(scenes.includes('isInteractionIdle(context, 320)'), 'idle neighbour warm-up missing')
assert(scenes.includes('if (!targetResident) disposeOutsideWindow'), 'resident target still disposes widgets inside page callback')
assert(scenes.includes('residentWindow.indexOf'), 'resident neighbour dirty render scheduling missing')
assert(scenes.includes('targetIsCurrent ? 240 : 520'), 'neighbour render quiet window missing')
assert(scenes.includes('ensureSceneTapListeners(scene)'), 'single shared touch listener set missing')
assert(scenes.includes('scene.onInteraction'), 'interaction probe not merged into shared listeners')
assert(scenes.includes("t('加载中…')"), 'preload hint is not i18n-aware')
assert(!marketView.includes("text: '刷新频率'"), 'market page still displays refresh-frequency card')
assert(!marketView.includes("text: '数据模式'"), 'market page still displays data-mode card')
assert(marketView.includes("t('市场广度')"), 'market breadth section missing')
assert(marketView.includes("t('当前强势')"), 'market strongest section missing')

for (const rel of ['page/home/index.page.js', 'page/detail/index.page.js', 'page/universe/index.page.js']) {
  const source = read(rel)
  // Root-level PAGE_SCROLLBAR never follows SCROLL_MODE_SWIPER pages; the bar is
  // created per page-container inside the swiper module instead.
  assert(!source.includes('createSectionPageScrollbar()'), `${rel}: root-level scrollbar creation still present`)
  assert(!source.includes('pageScrollbar'), `${rel}: root-level pageScrollbar state remains`)
  assert(source.includes('deferCacheHydration'), `${rel}: fast fresh-cache hydration missing`)
  assert(!source.includes('pageIndicator'), `${rel}: legacy pageIndicator state remains`)

  // scenes.js 通过字符串方法名回调渲染与绑定（ensureBound 用 typeof 检查后静默跳过）。
  // 名字写错不会报错，只会"这一屏永远不绑定"：详情页曾经把 'bindPageTapRegions'
  // 传给 scenes.js 却没定义它，于是 bindChartPage 从未被调用，分时/日K 切换整块失效。
  // 所以这里逐个核对：传进去的方法名，页面必须真的定义了。
  const schedulerCalls = [
    /startSectionPerformance\([^;]*?'(\w+)',\s*'(\w+)'\)/g,
    /handleSectionPageChange\([^;]*?'(\w+)',\s*'(\w+)',/g,
  ]
  let matched = 0
  for (const pattern of schedulerCalls) {
    let hit
    while ((hit = pattern.exec(source)) !== null) {
      matched += 1
      for (const method of [hit[1], hit[2]]) {
        assert(new RegExp('\\b' + method + '\\s*:\\s*function').test(source),
          `${rel}: scenes.js is told to call '${method}', but the page does not define it — binding would be skipped silently`)
      }
    }
  }
  assert(matched >= 2, `${rel}: expected both scheduler calls to be matched, found ${matched}`)
}

// 第二类字符串方法名调用点：updateSectionPage(<page>, 索引, '<渲染方法名>')。
// 名字写错同样不报错——renderScene 里 typeof context[renderMethod] !== 'function'
// 会静默 return false，表现只是"那一屏再也不重绘"。这类调用点有二十多处，分布在
// services/ 与 views/，按目录归属逐页核对（page/home/** 归属 home 页，依此类推）。
const PAGE_DIRS = [
  ['page/home', 'page/home/index.page.js'],
  ['page/detail', 'page/detail/index.page.js'],
  ['page/universe', 'page/universe/index.page.js'],
]
function jsFilesUnder(dir) {
  const out = []
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) { walk(full); continue }
      if (name.endsWith('.js')) out.push(path.relative(root, full))
    }
  }
  walk(path.join(root, dir))
  return out
}
for (const [dir, pageFile] of PAGE_DIRS) {
  const pageSource = read(pageFile)
  const methods = new Set()
  let sites = 0
  for (const rel of jsFilesUnder(dir)) {
    const source = read(rel)
    const re = /updateSectionPage\([^,]+,[^,]+,\s*'(\w+)'/g
    let hit
    while ((hit = re.exec(source)) !== null) {
      methods.add(hit[1])
      sites += 1
    }
  }
  assert(sites > 0, `${dir}: no updateSectionPage call sites found — the scanner is not looking at the right files`)
  for (const method of methods) {
    assert(new RegExp('\\b' + method + '\\s*:\\s*function').test(pageSource),
      `${dir}: updateSectionPage is told to call '${method}', but ${pageFile} does not define it — that screen would silently never re-render`)
  }
}

console.log('navigation_static=PASS')
