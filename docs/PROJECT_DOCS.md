# ETFstudio 项目文档合集
> 本文件是项目唯一的 Markdown 文档，由原 8 个分散文档（README / ARCHITECTURE /
> OPTIMIZATION_PLAN / PRODUCTION_HARDENING / QUALITY_AUDIT / GTS4_OPTIMIZATION /
> SUPPORTED_DEVICES / RELEASE_NOTES）合并而成，原文已删除。合并时间：2026-09-06。
> 各章节保留原文内容，仅在标题层级上整体下移一级以便统一目录。
## 目录

- [双屏版 (DUAL SCREEN)](#双屏版-dual-screen)
- [项目说明 (README)](#项目说明-readme)
- [架构说明 (ARCHITECTURE)](#架构说明-architecture)
- [企业级优化方案 (OPTIMIZATION PLAN)](#企业级优化方案-optimization-plan)
- [生产加固 (PRODUCTION HARDENING)](#生产加固-production-hardening)
- [质量审计 (QUALITY AUDIT)](#质量审计-quality-audit)
- [GTS4 优化 (GTS4 OPTIMIZATION)](#gts4-优化-gts4-optimization)
- [支持设备 (SUPPORTED DEVICES)](#支持设备-supported-devices)
- [发布日志 (RELEASE NOTES)](#发布日志-release-notes)

---


---

## 双屏版 (DUAL SCREEN)

> 2026-09-17。把此前独立的圆屏移植工程合并回本工程，改为**单工程双屏**：
> 同一套视图代码，构建期按屏幕形状分包。本节描述当前结构；下方各历史章节保留
> 写作时的内容（当时是方屏单屏），其中「支持设备」「字体打包」两处结论已被本节取代。

### 目录结构（按官方 folder-structure 规范）

```
.
├── app.js
├── app.json                      # targets.gt，platforms = [{"st":"r"},{"st":"s"}]
├── app-side/                     # 手机端 Side Service
├── app-widget/                   # 快捷卡片（负一屏）：M1-M2 剪刀差
│   └── index.js                  #   见 docs/SHORTCUT_CARD.md
├── setting/                      # 设置页
├── assets/
│   ├── gt.r/                     # 圆屏资源：icon.png + fonts/（4 个设计字体）
│   └── gt.s/                     # 方屏资源：同构
├── page/
│   ├── home/                     # 一目录一页面
│   │   ├── index.page.js         #   页面逻辑
│   │   ├── index.page.r.layout.js#   圆屏版面（构建期由 [pf] 选中）
│   │   ├── index.page.s.layout.js#   方屏版面
│   │   ├── model.js
│   │   ├── views/
│   │   └── services/             #   liquidity.js 取 M1/M2 并写卡片用的快照
│   ├── universe/
│   ├── detail/
│   └── i18n/                     # 34 个 <语言>.po
└── utils/
    ├── shape.r.layout.js         # 形状样式表（页头度量 + 13 屏纵向节奏）
    ├── shape.s.layout.js
    ├── constants.js              # 由形状表推导 CONTENT / SAFE_AREA
    ├── m1m2.js                   # M1-M2 契约 + 本地快照（页面写、卡片读）
    └── …
```

### 声明方式（官方 v3 屏幕适配规范）

`app.json` 只声明**一个构建目标**，屏幕特征写在 `platforms` 里：

```json
"targets": {
  "gt": {
    "module": { "page": { "pages": ["page/home/index.page", "…"] }, "app-side": {…}, "setting": {…} },
    "platforms": [{ "st": "r" }, { "st": "s" }],
    "designWidth": 390
  }
}
```

- 资源目录名 = `<target 键>.<配置限定符>`，即 `assets/gt.r`、`assets/gt.s`。
- 版面文件名 = `[name].[配置限定符].layout.js`，与页面同目录。
- 视图层用 `zosLoader:./shape.[pf].layout.js` 取形状样式表，构建期把 `[pf]` 换成
  `r` / `s`，**运行期没有形状判断分支**。
- 官方 app-json 把 `deviceSource` 标注为 "YES, v3 NO"（v3 非必需）：声明 `st` 后构建期
  自动按形状与分辨率分包，因此**不再逐个枚举设备型号**。原先手工维护的 18 个方屏
  deviceSource 与 `gt.r` / `gt.s` 双 target 写法已合并为上述形态。
- 覆盖范围（minVersion 3.0.0）：83 个 deviceSource（圆屏 65 + 方屏 18），共 8 个分辨率档：
  圆屏 480×480、466×466、454×454、416×416、360×360；方屏 390×450、320×380、432×514。

### 构建产物

`zeus build` 产出单个 `.zab`（含中间产物），内含 **12 个 `.zpk`：7 圆屏 + 5 方屏**。
圆屏包与方屏包内同名页面产物逐字节不同（已比对 md5），即 `[pf]` 确实按形状分别解析。

### 门禁

`npm run check`（= `check:tests` + `check:visual`，当前 exit 0）：

- `check:tests`：18 项静态/单元测试，含 `test:shape`（两份形状样式表键集合一致、
  视图用键可解析）、`test:platforms`（形状声明齐全 + 每个形状的版面文件与 assets 资源完整）、
  `test:app-widget`（快捷卡片规范约束）与 `test:m1m2`（剪刀差契约与数据源字段映射）。
- `check:visual`：`render` / `render:round`（各 20 帧离屏渲染，真实视图代码，含快捷卡片帧）
  + `verify:square`（方屏越界清单 7 条与基线逐条一致）+ `verify:round`（圆屏逐帧硬闸门）
  + `verify:card`（卡片版面：圆角背景、内容不出卡、16px 边距、走势图存在、文字不重叠）。

圆屏版面的排布依据、各屏数值对照与回归证据见 [双屏适配说明](./ROUND_ADAPTATION.md)。
快捷卡片的官方规范对应、数据链路与取舍见 [M1-M2 剪刀差快捷卡片](./SHORTCUT_CARD.md)。

### 快捷卡片（M1-M2 剪刀差）

负一屏上的 `app-widget`，显示 M1−M2 同比增长之差（剪刀差）与近 13 个月走势。
官方规范要求卡片**拿不到蓝牙实时数据**，所以链路是"手机端取数 → 首页写本地快照 →
卡片只读快照"（`utils/m1m2.js` 是两端共用的契约）。卡片包 11 KB，没有把形状样式表
拖进去——它按 `getAppWidgetSize()` 在运行时自适配，与屏幕形状无关。详见
[docs/SHORTCUT_CARD.md](./SHORTCUT_CARD.md)。

### 本次一并修掉的问题

- `tools/render-preview.js` 的 `@zos/router` 桩只有 `push`，而 `utils/navigation/route.js`
  还 import 了 `replace`，渲染器一跑就 `does not provide an export named 'replace'`。
- `tools/subset_fonts.py` 只输出 `assets/gt.s/fonts/`，圆屏资源目录不会随 i18n 更新；
  现改为从 `app.json` 的形状声明推导输出目录，两个形状一起产出。
- 6 个旧测试的 vm 加载器不认识 `zosLoader:` 说明符；`tests/detail-entry-route.test.cjs`
  的断言还停在 `page/gt/detail/index.page` 旧路径。
- 工程根目录里混进了官方文档仓库（Docusaurus 源码）与圆屏工程副本，zeus 会把它们当源码
  打包，`zeus build` 直接以 JSX 语法错误失败。两者已移出工程（见下）。
- `tools/render-preview.js`、`tools/verify-frames.cjs`、`page/universe/index.page.js` 等
  4 个文件是 CRLF，与工程其余部分的 LF 不一致，已统一。

### 工程外的东西

以下内容不属于应用，已移到工程外，避免被 zeus 打包：

| 位置 | 内容 |
| --- | --- |
| `Desktop/zeppos-docs-main/` | Zepp OS 官方文档仓库（Docusaurus 站点源码） |
| `Desktop/_ETF2.0-归档/` | 圆屏移植期独立工程副本、`backup-square-only-*.zip`、被取代的旧测试与临时脚本、改造前整包备份 |

---

## 项目说明 (README)

## 宽基指数行情（ETFstudio）1.0.0

> 生产发布分支：Zepp OS 方屏设备全系（390×450 / 432×514 / 320×380） / API 3.5。1.0.0 按 Zepp OS 设计规范翻新：34 种系统语言全量国际化（`@zos/i18n` + `page/i18n/*.po`）、Noto Sans / Zepp OS Number 设计字体（子集化见 `tools/subset_fonts.py`，语言文案更新后重跑即可）、屏幕尺寸按设备实时推导（安全边距随各机型玻璃圆角缩放，卡片几何统一走 `CONTENT` 令牌）与一批调度/交互修复。应用名已改为「宽基指数行情」；设备卡顿/重启的根因与优化对照见下方「GTS4 优化」章节。

### 生产发布检查

```bash
npm install
npm run check
npm run build
```

详见下方「生产加固」章节。

面向 Zepp OS 方屏设备全系（390×450 / 432×514 / 320×380）的 ETF 行情、指数 PE 估值、基金份额、资金流、持仓与预警小程序。持仓和预警仍保留在首页对应屏，ETF 详情页不再重复展示。

### 页面

主页 6 屏：市场温度、核心标的、智能信号、自选持仓、预警记录、设置。

8 个核心 ETF 均可进入统一详情页；详情共 6 屏：详细、分时/日K、资金流、基金份额、融资、PE 五年估值。

### 0.1.9 数据修复

- **指数 PE 五年估值**：Side Service 使用 AKShare `stock_index_pe_lg` 当前实现对应的乐咕指数 PE 协议作为主源；只读取标准“滚动市盈率”对应的 `addTtmPe`，按自然月保留月末有效值，最多 60 点。AKShare 当前未覆盖的指数使用独立雪球指数 PE 回退，不以 ETF 自身 PE 冒充指数 PE。

  > **修复（2026-09-11）**：乐咕接口的 `indexCode` 后缀**不统一**，也无法从指数号推导——`.SH` 上交所（000300/000905/000010/000852/000688）、`.SZ` 深交所（399006）、`.CSI` 中证指数公司（000922）。后缀错的返回 HTTP 200 + 空 `data`，表现为"无数据"而非报错。原先白名单只覆盖 4 个指数，中证红利(000922)、创业板指(399006)、科创50(000688) 落到雪球回退；而**雪球现已要求登录**（HTTP 400 / error_code 400016，预热首页只拿到 `acw_tc` WAF cookie，不是 API 需要的 `xq_a_token`），导致这 3 个 ETF 的 PE 页**完全无可用数据源**，显示"指数PE历史暂不可用"。已按实测补齐三个映射，6 个 ETF 全部走通乐咕（各 60 个月）。核对脚本 `tools/diagnostics/verify-pe-sources.cjs`（需联网，不进 check 套件）；离线回归见 `tests/pe-source-coverage.test.cjs`。
- **上交所 ETF 基金份额**：使用交易所 ETF 规模专用查询，严格按 `TOT_VOL` 的万份口径转换为亿份；近 3 个月从真实交易日选择 7 个份额快照，最多 2 个并发请求。
- **深交所 ETF 基金份额**：使用当前基金规模日频目录 `scsj_fund_jjgm`，按“基金规模(份)”绝对份额转换为亿份；保留基金档案作为最后回退。
- **错误路径清除**：实时行情字段不再承担基金份额职责；删除份额单位自动 ×10000 / ÷10000 的猜测校准，数据源各自有专用解析函数。
- **旧缓存隔离**：估值、份额 Side Service 缓存与 Device 持久缓存均升级命名空间，避免旧版 `0.001亿份` 或旧 PE 数据继续闪现。

### 运行策略

- 前台优先：用户滑页、点击、返回时，自动刷新和后台同步主动延后。
- 最小常驻：当前页完整渲染，最多只保留一个轻量邻页壳，不预先画完整隐藏页。
- 生命周期隔离：Page 销毁后，旧异步结果、Timer 和事件回调不能继续写入 UI。
- 失败保留好数据：网络错误优先维持上一帧有效行情/图表，并使用过期缓存作为兜底。
- 有界资源：设备/手机端缓存、图表点数、历史数据、并发和重试次数均设上限。
- 减少重绘：行情内容无变化时跳过 Canvas/TEXT 全量刷新。

### 质量检查

```powershell
npm run test:data
```

该测试覆盖乐咕 token/CSRF/指数映射/PE 字段、上交所 SQL 与单位、深交所份额单位、基金档案单位拒猜、份额与收盘价对齐，以及沪深300 PE Provider 端到端结果。

### 终端命令

```powershell
npm install
npm run preview
```

开发调试：

```powershell
npm run dev
```

正式构建：

```powershell
npm run build
```


---

## 架构说明 (ARCHITECTURE)

## ETFstudio 1.0.1 模块边界

### Device App

- `page/home/`：主页 6 屏生命周期、视图与服务。
- `page/universe/`：8 个核心 ETF 卡片。
- `page/detail/`：详情 6 屏；详细、行情图、资金流、基金份额、融资和 PE 估值按页加载。持仓与预警仅保留在首页。
- `utils/runtime.js`：页面生命周期、过期异步结果、交互/渲染错误保护。
- `utils/data.js`：Device→Side Service 请求超时、去重、缓存与网络失败回退。
- `utils/view-state.js`：低成本视图指纹，避免相同数据重复重绘。

### UI / Navigation

- `utils/ui/scene.js`：Canvas scene 创建、清理、熔断与幂等销毁。
- `utils/ui/components.js`：TEXT 复用、卡片与通用组件。
- `utils/ui/interaction.js`：Canvas 点击和原生 BUTTON 容错。
- `utils/ui/charts.js`：分时、面积、双线、柱状、K线与 PE 图。
- `utils/navigation/window.js`：最多 2 个 scene 的方向窗口、创建失败退避。
- `utils/navigation/scenes.js`：当前页完整渲染、驻留邻页空闲预渲染、dirty render、销毁与恢复。
- `utils/navigation/route.js`：重复点击路由防抖。

### Side Service

- `app-side/index.js`：请求生命周期、响应保护、前台请求计数、空闲历史同步。
- `app-side/providers/modules/transport.js`：Fetch 超时、一次有限重试、请求去重、内存缓存与旧值回退。
- `app-side/providers/modules/overview.js`：完整 overview 与详情首屏 light overview 分离。
- `app-side/history/`：60 交易日历史数据库；同步在前台请求出现时让路。
- `app-side/shares-cache.js`：最近 3 个月基金份额 + ETF 收盘价持久缓存。

#### PE 估值专业适配器

- `valuation-legulegu.js`：AKShare `stock_index_pe_lg` 同源协议；负责受支持指数映射、日期 MD5 token、CSRF 握手、`addTtmPe` 解析和自然月月末抽样。
- `valuation-xueqiu.js`：独立的指数 PE 回退；不与乐咕字段逻辑混用。
- `valuation.js`：只负责 PE 数据质量守卫、五年样本、20%/80%分位与当前分位计算。

#### ETF 份额专业适配器

- `shares-sse.js`：上交所 ETF 规模快照；使用当前 SQL ID，精确处理 `TOT_VOL` 万份口径，并从真实交易日选取有限快照。
- `shares-szse.js`：深交所基金规模日频；只按明确的绝对“份”字段换算。
- `share-parser.js`：东方财富基金档案最后回退；仅在表头明确写出亿份/万份/份时解析，单位缺失直接拒绝。
- `shares.js`：按交易所选择专业适配器，负责结果去重、回退顺序及与 ETF 收盘价阶梯对齐。
- `quote-parser.js`：实时行情不再推导 ETF 基金份额，避免行情字段与基金规模语义混淆。

### 资源原则

1. 先释放隐藏的完整 Widget/Canvas，再为当前页分配资源。
2. 网络、解析、估值和份额历史由手机 Side Service 完成；Device 只接收显示所需的紧凑数据。
3. PE 最多 60 个自然月点；份额图最多保留最近 3 个月交易日；上交所规模快照固定最多 7 个且并发最多 2 个。
4. 数据源必须使用自己的专业解析函数，禁止以跨数据源“万能单位猜测”修正异常值。
5. 相同数据不重绘；旧异步结果不回写；页面销毁必须清 Timer/Scene/Container。
6. 异常数据宁可显示上一份可信缓存，也不让 `NaN/null/超长数组` 进入绘图热路径。


---

## 企业级优化方案 (OPTIMIZATION PLAN)

## ETFstudio 企业级优化方案（Optimization Plan）

> 版本：1.0.0 · 依据：全源码扫描（数据链路 / 并发模型 / 设备端性能 / 蓝牙协议四主题，逐条带文件:行号证据）
> 设计语言基线：Zepp OS 设计规范——磨砂玻璃 • 光影 • 温暖；友好 / 轻量 / 有效。

---

### 0. 总览：四个工程目标

| 目标 | 现状结论（扫描证据摘要） | 北极星指标 |
|---|---|---|
| 数据可靠性 | 双源容错已覆盖 quote/chart/valuation，但 **signal、valuation 无历史库回退**（request-router.js:88,92）；熔断**无半开恢复**（transport.js:46-53） | 全源失败时用户可见"完全空白页"次数 = 0 |
| 并发与响应 | portfolio 独立 BLE 往返是纯开销（dashboard 本地可算，request-router.js:94）；signal 错峰 700ms 有真实原因（overview 7 路冷启动） | 首页数据完整时延 P50 ≤ 2.5s（冷）/ ≤1s（热） |
| 流畅度 | 每帧全量重绘 + 逐点 drawLine（242 槽×2 线，sampleStep 3）；无动画系统 | 翻页无卡顿；重绘 drawLine 调用数 ↓25% |
| 蓝牙带宽 | dashboard/overview/signal/portfolio **不过 compact**；universe quote 19 字段全量过蓝牙，实际消费 3 个 | dashboard 载荷 ↓≥50% |

---

### 1. 数据可靠性（Phase A）

#### A1 熔断半开恢复 ✅ 已实施
- **问题**：host 熔断 cooldown（20s）到期后 failures 不清零，再失败 1 次立即重新熔断，形成"一次抖动→反复熔断"的恶性循环。
- **修复**：`transport.js assertHostAvailable()` 在冷却期满时清零计数（半开窗口），给数据源完整的新探测窗口。
- **验收**：断网 25s → 恢复网络 → 下一次刷新必须成功而不是 NETWORK_CIRCUIT_OPEN。

#### A2 signal / valuation 历史库回退 ✅ 已实施
- **问题**：margin/chart/flow/shares 都有历史库回退，唯独 `signal`（overview 七路全挂→抛）和 `valuation`（乐咕+雪球双挂→抛）没有——这是仅有的两个"整屏 --"单点。
- **修复**：request-router 两个 handler 照 margin 模式接入 `historyLatestOverview`：signal 用历史快照重算 deriveSignal；valuation 回退最近估值快照的 currentPe/percentile（图表降级为"数据不足"但关键信息保留）。
- **验收**：飞行模式开关切换，信号页与估值页始终有上一帧有效数据。

#### A3 全源失败负缓存（规划）
- batchQuotes 全挂抛错前，把空结果以 20s 短 TTL 写入 `transport.cached`，避免 60s 自动刷新每轮打满东财+腾讯两连击（省电 + 省请求）。风险低，实施时补一个单测。

#### A4 SZSE 报表共享缓存（规划）
- 深交所基金规模日频全市场表按 CATALOGID+日期窗加 `transport.cached`：159915/159516 两只共用一次请求，history 同步尾延迟显著缩短（sync.js:44-52 的 6 路 Promise.all 受最慢分支拖累）。

#### A5 历史库写入失败可观测（规划，与 settingsLib→文件存储迁移合并做）
- 现状 `writeStored` 失败静默 return false（history/store.js:14-16），容量不足时用户只看到"0/8只"无诊断。方案：失败计入 meta.lastError 并在设置页"历史数据库"行展示"写入失败"。

---

### 2. 并发与响应（Phase B）

#### B1 dashboard 顺带返回 portfolio ✅ 已实施
- portfolio = portfolioFromUniverse(universe)，纯本地 settings+算术（portfolio.js:21-35），原先却走一次独立 BLE 往返 + 独立渲染调度。
- dashboard 返回体新增 `portfolio` 字段；设备端 `loadPortfolio` 优先消费本地 dashboard 缓存中的附带结果（零往返），强制刷新时仍走原 'portfolio' 方法兜底——完全向后兼容。
- **效果**：首页稳定态蓝牙往返 3 次 → 2 次。

#### B2 signal"缓存热则顺带"（规划）
- 在 provider 增加只读 `peekOverview(code)`（transport 暴露缓存查询），dashboard 请求时若 overview 缓存未过期则顺带返回 signal。冷启动保持现有 700ms 错峰（那是真实的数据依赖差异），热稳态再省一次往返。

#### B3 历史库状态 memo ✅ 已实施
- `getHistoryDatabaseStatus()` 每次 dashboard 都对 8 只做 settingsLib.getItem + **整库 JSON.parse（每库最多 132 条）**——side 端每次 dashboard 最大的隐藏 CPU 成本。
- 修复：读路径 30s memo，`writeHistoryStore/writeHistoryMeta` 时失效。

#### B4 历史同步并发升级（规划，需真机压测）
- 现状 8 只串行 for 循环（sync.js:79-87）。方案：并发度 2 的分批池（BLE/后台 CPU 友好），配合 A4 后单轮同步时长预计 ↓40%。必须保持现有让路策略（前台静默才跑）。

---

### 3. 流畅度与动效（Phase C）

#### C1 分时采样步长 3→4 ✅ 已实施
- 242 点 / 350px 本就 1.45px/点，step 4 视觉无差、drawLine 调用 ↓~25%。

#### C2 评分环扫入动效 ✅ 已实施
- `utils/ui/motion.js`：通用 `animateValue`——**帧数封顶（8 帧 × 56ms）**、easeOutCubic、写入 sectionTimers（翻页/销毁自动取消）、交互忙时延迟起步。信号页评分变化时环从近值扫入，静态优先、数据驱动。

#### C3 图表分配削减（规划）
- `copyOptions` 双重浅拷贝改单次复用（charts.js:103-113）；`numeric()/paddedRange()` 按数据引用 memo（照抄 views/chart.js cachedSeries 模式）——估值页 60 点×2 轴重绘分配降为 0。

#### C4 增量重绘评估（规划，需真机帧测）
- 现状每帧 clearScene 全量重绘。分时页可拆"静态层（网格/标签/名称胶囊）+ 动态层（线/气泡）"两个 Canvas，数据变化只清动态层区域。收益取决于真机 clear 成本，先做帧耗时测量再决定。

#### C5 动效规范（本方案确立）
- 只允许三类动效，全部数据驱动、帧数封顶 ≤10、单次 ≤800ms：①数值扫入（评分环）；②状态闪光（行情变动时价格列 1 帧提亮后回落，待实施）；③原生按钮按压态（系统自带）。禁止循环动画、禁止翻页动画——轻量原则。

---

### 4. 视觉：磨砂玻璃 • 光影 • 温暖（Phase D）

#### D1 玻璃卡片体系 ✅ 已实施
- `drawGlassCard()`：深灰面板 + **顶部 1px 高光**（受光面）+ **底部 2px 落影**（半层空间关系）；纯矢量绘制合成，零图片资源、零额外内存。初版的模块主题色左侧竖条光晕经真机评审后移除（全页面重复感强），模块色彩回归语义元素（温度数字、信号 pill、徽标、图例）。
- 色彩即功能（Zepp"色彩心理学"）：市场温度=暖琥珀（温暖/光）、宽基行情=晴蓝、智能信号=静紫、自选持仓=生机绿、预警=暖红、融资=琥珀。`constants.THEME` 集中管理。
- 应用范围：首页五屏全部卡片、详情页六屏容器与指标卡、预警行按动作着色光晕。

#### D2 字体可靠性修复 ✅ 已实施（真机缺字根因）
- **根因**：全量文本默认走自定义子集字体，子集只含 po 文案用字——运行时数据（"20日均线位于60日均线上方"、"亿份"、基金名等）字符不在字库 → 真机渲染空白。
- **修复**：默认回退**系统字体**（Zepp 系统字体即 Noto Sans 全字库）；Zepp OS Number 数字字体仅在内容为纯 ASCII 时启用（`safeFontFor` 门控，"84.31亿份"这类混合串自动回落系统字体）。

#### D3 友好反馈细化（规划）
- 顶部统一"数据时延徽标"：行情数据超过 2 个刷新周期未更新时，头部角标旁显示相对时延（友好指引）；空态文案统一为"下一步动作"句式（如"请在 Zepp 手机端设置"已是范本）。
- 无障碍：颜色语义（红涨绿跌）始终伴随文字符号（+/−），已有；对比度抽检所有 muted/faint 文本 ≥3:1（设计规范硬指标）。

#### D4 国际化完整性（持续）
- 34 语言 po 已全量接入；剩余中文死角=**side 端生成的动态文案**（信号 reasons、数据源描述）。方案：side 只下发结构化 code+参数，设备端 po 渲染（协议小改，列入 Phase E）。

---

#### D5 纵向滚动条 ✅ 已实施

- 对照设计规范"滚动条：在纵向长页面滚动时，用来指示页面当前所处位置的控件"：新增 `utils/ui/vscroll.js`——`attachVerticalScroller`（竖向拖拽换算内容偏移，复用统一触摸层的拖拽钩子，移动超阈值自动抑制点击）+ `drawVerticalScrollbar`（右缘轨道+滑块，按内容/视口比例定位，内容不溢出时不绘制）。
- 首个落地页面：**预警记录**改为纵向长页面——预警历史最多 12 条可滚动浏览（原先固定 5 条），滚动时行内容滑入头/尾遮罩下方（背景色带裁切），头部常驻；5 个槽位点击区按滚动偏移动态映射到对应记录。
- 横向翻页指示仍由系统 `PAGE_SCROLLBAR` 承担，两者互补。

---

#### D5b 市场温度页重设计 ✅ 已实施

- 用户确认三项形态后落地：**半环量表主视觉**（新原语 `drawHalfGauge`：0-100 上半环轨道+数值弧，弧色随温度语义 ≥70 暖红 / 50-70 琥珀 / <50 绿，中央大号温度数字）+ **市场广度三段比例条**（红/灰/绿按家数比例分段，下方数字标注）+ **三块分层结构**（温度 hero 卡 / 广度卡 / 当前强势卡：领涨标的 + 小评分环）。
- 广度与强势由模型拆出数值字段（breadthUp/Flat/Down、strongestName/Score），文字串仅作兼容保留，渲染指纹同步更新。

---

#### D6 分时图参考元素重设计 ✅ 已实施

- 用户提供两张 Zepp 官方风格参考图（心率图 + 天气卡片），确认四项决策后落地：**白点标记最新点 + 左上角实心价格徽标、X 轴只标首尾（09:30/15:00）、单色暖调（亮红线+同色深底面积，涨跌只看数字符号颜色）、底部圆角信息条**。（左右边界竖线经评审后移除）
- 其余元素：点状水平网格线（max/mid，新原语 `drawDottedHorizontalAt`）、min 基线、右轴三档刻度（max/mid/min）。
- 移除：跟随气泡、四段竖向参考线、三段式时间标签、独立脚注行。新原语：`drawDotAt`（圆点）、`drawDottedHorizontalAt`（点状网格线），均可复用。
- **日K 同步重设计**：同一套设计语言——点状网格线（max/mid）、暖色边界竖线、右轴三档刻度、左上角实心徽标（最新收盘，按末根涨跌红/绿着色）、MA5/MA20 图例移至右上、首尾日期标签（取自真实日K时间戳）、底部圆角信息条（根数+最新收盘+区间涨跌）。蜡烛保留 A 股红涨绿跌；最新位置由末根蜡烛本身指示，不叠加圆点。

---

#### D6b PE 五年估值页重设计 ✅ 已实施

- 用户确认四项决策后落地：**半环量表主视觉**（复用 `drawHalfGauge`，0-100 指针指到当前历史分位，弧色按分位语义 ≤20% 绿·低估 / 20-80% 琥珀 / ≥80% 红·高估，中央大号分位数字）+ **PE 曲线单色暖调**（亮暖红线+同色深底面积，危险橙/机会绿虚线保留）+ **移除指数点位曲线及其右轴**（指数代码缩为 hero 区一行小注）+ **统计精简**（只留危险值/机会值两枚彩色 chip；最高/平均/最低/指数点位行删除）。
- 图表其余元素：点状网格线（max/mid）+ min 基线 + 右轴三档刻度 + 白点标记最新 PE + 首尾年月标签。
- `drawValuationHistoryChartAt` 双轴渲染函数与旧版静态断言一并清理；新断言覆盖量表、暖调面积图、危险/机会虚线。新增 i18n 词条：历史分位 / 当前PE / 指数 / 上涨 / 平盘 / 下跌。

---

#### D7 轻原则重构与代码风格统一 ✅ 已实施

- **风格统一**：`constants / compat / format / data / storage / signals` 六个核心文件重写为全项目统一约定（2 空格缩进、无分号、ES5 var 函数、单引号）；清除转译器残留（`__assign` 垫片 ×3、`String.prototype.concat` 拼接链），改用 `compat.copyOwn`。逻辑与行为零变更，生产静态断言（请求身份守卫、缓存自愈、空间回收）全部保留。
- **轻界面**：删除四页自解释副标题（市场温度/宽基行情/自选持仓/预警记录）；详情页头部只留代码（标题已是名称）；分时信息条去重（价格只在左上徽标出现一次）；九标的页副标题与入口按钮文案精简。
- **轻操作/轻流程**：市场温度「当前强势」卡新增点按直达该 ETF 详情（BINDERS 注册 `bindMarketPage`），省去"回列表→翻页→进详情"的路径。
- po 目录同步清理 6 条废弃词条、新增 4 条，34 语言重新生成。

---

### 5. 蓝牙协议（Phase E）

#### E1 universe quote 瘦身 ✅ 已实施
- 设备端仅消费 price/changePct/updatedAt，其余 16 个数值字段不再过蓝牙（universe 行构建处裁剪）——dashboard 载荷预计 ↓50%+。

#### E2 settings 投影 ✅ 已实施
- historyDatabase 12 字段 → 只传设备端展示用的 3 个（readyCodes/codeCount/minRecords）。

#### E3 market.items 去重（规划）
- market.items 与 universe 行大面积重复（signal 对象冗余第二份），保留 strongest 所需字段即可，再省 ~30%。

#### E4 compact 覆盖 dashboard/overview（规划）
- compact.js 目前只压 chart/shares/valuation/margin/flow；dashboard 体积最大却未压缩。E1/E2 落地后叠加字段白名单压缩。

---

### 6. 实施状态与里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| 本轮已落地 | A1 半开恢复、A2 signal/valuation 回退、B1 portfolio 并入、B3 状态 memo、C1 采样步长、C2 评分环动效、D1 玻璃卡体系、D2 字体根因修复、E1/E2 蓝牙瘦身、死配置清理（danjuanBase） | ✅ 全部通过 6 项回归测试 |
| Phase A3/A4 | 负缓存、SZSE 共享缓存 | 低风险，下个迭代 |
| Phase B2/B4 | signal 顺带、历史同步并发 2 | 需真机 BLE 压测 |
| Phase C3/C4 | 图表分配 memo、双 Canvas 分层 | 需帧耗时测量 |
| Phase D3/E3/E4 | 时延徽标、对比度抽检、协议继续瘦身 | 视觉走查 + 真机抓包 |

**验收基线**（每阶段合入前跑）：`npm run check` 6 项全绿 + `npm run render` 视觉走查 + 真机冒烟（断网 30s 恢复 / 冷启动计时 / 翻页流畅度 / 飞行模式下历史回退）。


---

## 生产加固 (PRODUCTION HARDENING)

## ETFstudio 1.0.1 生产与流畅度加固说明

### 目标

面向 Amazfit GTS 4（390×450，Zepp OS 3.5）优先保证：首屏可用、滑动不被后台任务抢占、弱网可退化、缓存可恢复、页面销毁后旧异步任务不能污染新页面。

1.0.1 不改变现有视觉参数和数据口径，重点将驻留邻页的 dirty render 移到空闲时段，使常规相邻翻页尽量直接展示已完成的 Scene。ETF 详情页精简为 6 屏。

### 本版关键机制

1. **页面 generation 隔离**：每次 build 都创建新的运行代次；旧异步结果即使晚到也只能结束自身，不能覆盖新页面或删除新请求。
2. **缓存优先 + 静默刷新**：有效缓存立即返回；网络失败允许使用过期缓存，避免页面直接空白。
3. **数据源短熔断**：同一主机连续失败后短时间跳过，快速进入备用源/缓存，避免反复等待坏源。
4. **超时不重叠**：无法可靠取消的 fetch 超时后不立即复制第二个同源请求。
5. **存储自愈**：损坏 JSON 单键清理；容量不足优先淘汰最旧行情缓存，不清空全部用户数据。
6. **后台同步让路**：历史数据库只在前台安静窗口工作；持续交互时中止本轮，下一空闲周期再继续。
7. **份额页有界抓取**：SSE 六个月份额采用代表性采样和固定并发上限，避免几十次长尾串行请求。

### 发布前检查

```bash
npm install
npm run check
npm run build
```

`npm run check` 必须全部 PASS。最终 `npm run build` 需要在安装了 Zepp OS Zeus CLI 的开发机执行。


---

## 质量审计 (QUALITY AUDIT)

## ETFstudio 1.0.1 生产级补充审查

本文件后半部分保留 0.1.12 图表专项审查记录。1.0.1 在 1.0.0 生产加固基础上增加驻留邻页预渲染、快速缓存恢复和图表重复描线消除，并将 ETF 详情页精简为 6 屏。旧版 8 屏记录仅作历史审查保留。

## ETFstudio 0.1.12 估值 / 份额详情页专项审查

### 本版目标

0.1.12 在不改变详情页 8 屏结构、原生 `PAGE_SCROLLBAR` 和资源上限的前提下，将第 4 屏“基金份额”和第 6 屏“PE 五年估值”改造成更接近常见基金行情软件的双轴趋势图。

### 五年 PE 页面

- 保留指数 PE-TTM 口径，最多 60 个自然月样本。
- 顶部集中显示：当前 PE、近 5 年分位、80% 危险值、20% 机会值、指数点位、PE 最高/平均/最低。
- PE 使用蓝色面积线；80% 危险值使用橙色虚线；20% 机会值使用绿色虚线。
- 新增对应指数点位红色右轴曲线，左右 Y 轴独立缩放。
- 指数月线和 PE 按 `YYYY-MM` 对齐；指数点位加载失败时只隐藏红色右轴，不影响已有 PE 图。
- 指数月线请求与 PE 主请求最多同时 2 路，符合项目“并发最多 2 个请求”的约束。
- Side Service 估值缓存从 `valuation5y:v3` 升级到 `valuation5y:v4`；设备端估值缓存命名空间升级到 `v5`，防止 0.1.11 的旧 payload 缺少 `indexClose`。

### 基金份额页面

- 保持近 3 个月窗口，不扩成 6 个月，继续符合项目现有资源边界。
- 份额使用蓝色面积线，ETF 收盘价使用橙色右轴线。
- 显示左右 Y 轴刻度、起止日期和最后更新时间。
- 摘要卡改为：最新基金份额 + 近 3 月份额变动百分比；绝对变动亿份作为副信息。
- Device 端再次限制最多 90 个有效对齐点；非正份额/价格不会进入图表。
- SSE/SZSE 专业份额解析、交易所单位规则和基金档案回退逻辑未被改动。

### Canvas / UI

新增两个通用绘图能力：

- `drawDualAxisAreaChartAt`：左轴面积线 + 右轴折线。
- `drawValuationHistoryChartAt`：PE 面积线 + 机会/危险虚线 + 指数右轴折线。

两者均复用现有 Scene 生命周期和 native Canvas 安全封装，没有增加常驻 Canvas，也没有改变页面销毁时的资源释放流程。

### 版本与页面结构

- `app.json`：`0.1.12`，version code `145`。
- 详情页仍为 8 屏：详情 / 行情图 / 资金流 / 基金份额 / 融资 / PE五年估值 / 我的持仓 / ETF预警。
- 首页 6 屏和核心 ETF 9 项结构未修改。
- 原生 `PAGE_SCROLLBAR` 导航逻辑未修改。

### 自动化检查结果

以下命令在本次修改后的源码上通过：

```text
npm run test:data       PASS
npm run test:navigation PASS
npm run test:detail     PASS
all JS node --check     PASS
```

`test:data` 已增加 510300 指数月线请求、`1.000300` secid、月 K `klt=103`、PE/指数按月对齐、当前指数点位以及 PE 最大/平均/最小统计检查。

`test:detail` 新增静态约束检查，确保 0.1.12 双轴图组件、页面关键字段、60/90 点资源上限和新缓存命名空间存在。

### 当前环境限制

当前容器没有 Zepp `zeus` CLI，因此没有声称 `zeus build` 或真机预览已经通过。源码语法、数据适配器和静态导航/UI 约束已通过；最终像素位置和真机帧率仍应在 GTS 4 或同尺寸 390×450 设备上执行 `npm run build` / `npm run preview` 验证。

### 真机重点验收

1. 510300 第 6 屏：应看到 PE 蓝色面积线、危险/机会虚线；指数月线可用时出现红色右轴曲线。
2. 当前 PE、分位、危险值、机会值、指数点位和 PE 最高/平均/最低不应互相遮挡。
3. 第 4 屏：蓝色份额面积线与橙色收盘价线应共存，左右轴范围互不影响。
4. 份额仍应为正确的“亿份”单位，不得出现此前 `0.001亿份` 一类错误值。
5. 快速上下滚动 8 屏后返回估值/份额页，旧 Scene 应被释放且无重复重绘/崩溃。


---

## GTS4 优化 (GTS4 OPTIMIZATION)

## GTS 4 优化说明——为什么旧版会卡顿甚至重启

适用设备:Amazfit GTS 4(390×450,Zepp OS 3.5)。

用户反馈:运行未优化的旧版本时明显卡顿,偶发整机重启。以下逐条说明卡顿与重启的根因,以及当前版本(1.0.0 → 1.0.2)对应做的优化。

### 一、重启的根因与对策

Zepp OS 上手表重启几乎都来自两个机制:**内存耗尽(OOM)被系统杀掉回收**,以及**主线程长时间阻塞触发看门狗**。本项目数据密度大(8 个 ETF × 行情/K线/份额/融资/PE 五年估值),旧版在这两点上都踩线。

#### 1. 内存峰值过高 → 系统回收重启

- **旧版问题**:首页 6 屏 + 详情 8 屏的控件、图表点数、历史数据全部常驻;旧缓存(未升级命名空间的估值/份额快照)反复累积;网络失败后无限重试继续堆内存。
- **优化**:
  - 有界资源:图表点数(最多 60 个 PE 点 / 96 个绘图点)、历史数据(手机端 132 个交易日)、缓存条目、并发数(最多 2~4 路)、重试次数全部设上限,内存占用可预估、不随使用时间增长(1.0.0)。
  - 本地存储自愈:损坏 JSON 自动清键,空间不足时只淘汰最旧缓存后重试,避免缓存挤爆存储引发异常(1.0.0)。
  - 驻留策略:最多只保留一个轻量邻页壳,不再预先画完整隐藏页;翻页时旧窗口原生控件延后到 settle 阶段统一回收,避免瞬时控件数量翻倍(1.0.1)。
  - 字体子集化:1.0.2 接入设计字体后,按全部 34 种语言译文用字把字体裁剪到约 0.7MB,而不是整字体文件(单套 Noto Sans 即数 MB)直接进包占内存。

#### 2. 主线程阻塞 → 看门狗重启

- **旧版问题**:滑页/转表冠过程中同步销毁上一页 Canvas、同步重绘大图,单帧工作时间过长。
- **优化**:切页不再同步销毁 Canvas;用户交互停止后再整理窗口,空闲时才预热下一页;异步数据返回时若正在滑动,延迟 Canvas 重绘(0.1.12 / 1.0.1)。

### 二、卡顿的根因与对策

#### 3. 重复绑定触摸监听,一次点击触发三倍回调

- **旧版问题**:每个 Canvas 绑了 down/move/up 多套监听,点击一次滚动、刷新、重绘各执行多遍。
- **优化(1.0.2)**:每个 Canvas 只绑定一套触摸监听,交互标记与点击区域分发合一。

#### 4. 无变化也全量重绘 Canvas

- **旧版问题**:60 秒自动刷新或数据返回后,即使行情数字没变也做整页 Canvas 全量重绘,GTS 4 的 Canvas 是逐像素软件绘制,开销极大。
- **优化(0.1.x 起)**:行情内容无变化时跳过 Canvas/TEXT 全量刷新;图表取消被同色折线完全覆盖的重复描线(1.0.1)。

#### 5. 定时器互相踩踏、重复启动

- **旧版问题**:缓存恢复、首载、自动刷新的延迟定时器共用一处,互相取消导致反复重渲染;`startAutoRefresh` 可被重复调用叠加多个 60 秒定时器,CPU 常驻高负载——这是旧版"越用越卡"的直接原因之一。
- **优化(1.0.2)**:定时器按 label 隔离,互不再取消;`startAutoRefresh` 防重复;页面销毁时显式清理全部 Timer 与监听(生命周期隔离,1.0.0)。

#### 6. 首帧渲染慢、失败后白屏

- **旧版问题**:冷启动必须等网络;首屏渲染失败后误清 dirty 标记,页面卡在空白。
- **优化**:首帧优先纯缓存恢复(1.0.1);渲染失败页自动重试(1.0.2);驻留邻页在交互空闲期预渲染,首次翻入图表页不再同步承受整页绘制压力(1.0.1)。

#### 7. 网络弱时反复请求拖垮前台

- **旧版问题**:弱网下同一数据源反复重试,超时后立刻重叠发起第二次请求,前台滑动时后台仍在拉 12 路历史数据。
- **优化(1.0.0)**:同一数据源连续失败触发 20 秒短熔断;超时不立即重叠重试;用户持续操作 30 秒后本轮后台同步主动中止;前台优先策略——滑页、点击、返回时自动刷新和后台同步延后。

#### 8. 硬编码 390/450 与小字号

- **优化(1.0.2)**:尺寸常量改由 `getDeviceInfo()` 提供,字号映射补全并设 12px 可读下限,图表刻度从 9px 提升——这属于可读性/正确性,不直接影响流畅度,但避免在其它方屏设备上因错误布局引发额外的重排。

### 三、验收建议

真机上重点验证旧版出现问题的场景:

1. 首页 ↔ 详情页快速连续翻页 1 分钟(看是否卡顿/重启);
2. 弱网或断网状态下进入份额、PE 估值页(看熔断与缓存兜底);
3. 挂机 10 分钟观察自动刷新期间内存与发热;
4. 冷启动到首帧时间(应为纯缓存恢复,不等网络)。


---

## 支持设备 (SUPPORTED DEVICES)

## ETFstudio 1.0.2 支持设备

本版本以 Zepp OS 方屏通用平台 `st: "s"` 和 390×450 设计宽度开发，并已完成全地区语言适配（34 种系统语言）。

### 当前构建包含的设备

| 设备 | 屏幕 | API_LEVEL | 适配状态 |
|---|---:|---:|---|
| Amazfit GTS 4 | 390×450 | 3.5 | 已支持（本构建目标） |
| Amazfit Cheetah (Square) | 390×450 | 3.6 | 已支持 |
| Amazfit Active | 390×450 | 3.6 | 已支持 |
| Amazfit Active 2 (Square) | 390×450 | 4.2 | 已支持 |
| Amazfit Bip 6 | 390×450 | 4.2 | 已支持 |

以上设备（含国行 deviceSource 变体）已全部通过 `app.json` targets.gt.s.platforms 的 `st: "s"` + `deviceSource` 显式声明，共用 390×450 方屏布局。

> **（2026-09-17 已被取代，见卷首「双屏版」章节）** 现在只声明一个目标 `gt`，
> `platforms` 为 `[{"st":"r"},{"st":"s"}]`，不再枚举 deviceSource——官方 app-json 规范里
> `deviceSource` 在 v3 已非必需字段，构建期按形状与分辨率自动分包。上表的 5 个机型
> 现在仍全部覆盖（且新增圆屏全系）。

### 其它方屏设备（未包含在当前构建目标内）

| 设备 | 屏幕 | API_LEVEL | 说明 |
|---|---:|---:|---|
| Amazfit GTS 3 | 390×450 | Zepp OS 1.0 | 低于运行时 minVersion 3.0，无法安装 |
| Amazfit GTS 4 mini | 336×384 | Zepp OS 1.0 | 低于 minVersion 3.0，且分辨率不同 |
| Amazfit Bip 5 | 320×380 | 2.1 | 低于 minVersion 3.0 |
| Amazfit Bip 5 Unity | 320×380 | 3.0 | 满足 minVersion 但分辨率不同，布局未真机验证，暂未声明 |

### 兼容策略

- 运行时最低 API_LEVEL：3.0。
- 目标 API_LEVEL：3.5，以 GTS 4 为最低主目标设备。
- 同分辨率设备共用 390×450 方屏布局，不引入 4.x 专属 API；但 .zab 安装包只包含 app.json `targets` 中声明的平台，未声明的设备无法安装。
- 表冠只用于页面翻页；关键导航入口使用屏幕点击。


---

## 发布日志 (RELEASE NOTES)

## ETFstudio 1.0.2 设计规范翻新版

- **分时图采用压缩时间轴**（同花顺式）：午休 11:30-13:00 不再占用横轴，上午收盘价直接衔接下午开盘，删除了原"休市横线"逻辑；时间标签改为 09:30 / 11:30/13:00 / 15:00 三段式。

  > **修复（2026-09-11）**：压缩轴的槽位映射本身是对的（上午 slot 0..120、下午 121..241），但两个时段是**各自独立插值**的。当下午首个真实样本不是 13:00 整（数据源偶发缺这一根）时，slot 121 既无样本也不会被填充，保留为 `null`；而 `drawSingleLineAt` 遇到 null 会断开折线 —— 表现就是价格线在 11:30 与 13:00 之间断开。现已在 `prepareIntradaySeries` 中加跨时段的桥接插值：以 slot 120 的收盘价为锚点、按比例填充到下午首个真实样本之前，价格线与均价线同时处理。回归测试 `tests/intraday-lunch-bridge.test.cjs` 覆盖缺 11:30、缺 13:00、下午 13:05/13:30 才开始、5 分钟稀疏采样等场景，并断言"仅上午数据时不得凭空造出下午值"。
- **屏幕 R 角安全区**：GTS 4 玻璃圆角约 92px，全局标题区下移至安全线以下（SAFE_AREA.top 26），详情页行情图整体下移、份额页底部卡片上收，避免四角内容被裁切。
- **自选持仓改版**：今日收益独立成卡（与总仓位/浮动收益同级），持仓行从 7 个精简为 4 个。
- **设置页**移除版本号副标题。
- **历史 PE 校验**：确认危险值/机会值为近 5 年（60 个月频样本）PE 的 80%/20% 分位（线性插值），与 Wind 历史估值低 20%/高 80% 同方法同窗口，无需校准。
- 新增离屏页面渲染器 `tools/render-preview.js`（`npm run render`）：桩掉 @zos 层、用真实视图代码渲染 22 帧页面预览（preview/index.html）。
- **全量国际化**：设备端全部 UI 文案改走 `@zos/i18n` 的 `getText`（`utils/i18n.js` 封装 `t()/tf()`），`page/i18n` 生成全部 34 种 Zepp OS 系统语言的 `.po` 资源（约 135 条/语言）；发布地区不再受语言限制。手机端信号只传动作码，展示标签统一由手表端按系统语言渲染。
  - **详情页生命周期修复（2026-09-11）**：三个独立问题。(1) 常驻场景窗口由 2 个改为 3 个（`RESIDENT_SCENE_LIMIT`），此前 1→2 翻页会把窗口变成 [2,3] 并销毁场景 1，返回 1 只能从空场景重建；现在中心两侧都常驻，单向反转不再重建。(2) `deferCacheHydration` 原先只预热第 0/1 页，资金流/份额/融资/PE 四页从未预热——已补齐全部 6 页的 cacheOnly 预热（四个 loader 新增 `requestOptions` 透传），PE 与份额缓存有效期 6 小时、融资 15 分钟，命中即可秒出。(3) `releaseDetailStateData` 原先清空全部分时/K线/PE/资金流数组，再次进入同一标的时保留的已是空数组——现只释放最重的图表序列（分时 240 点约 19 KB + 日K 90 根约 6.5 KB 及其派生对象），保留 PE/资金流/份额/融资（合计 < 8 KB）。另将 `deferInitialLoad` 380→180ms、图表预取 2200→1200ms（保留 `isInteractionIdle` 守卫）。回归测试 `tests/detail-lifecycle.test.cjs` 断言窗口全量不变量、六页预热齐全、释放策略分层、时序上限。
  - **载荷瘦身（2026-09-11）**：曾把全部 33 种语言内联成 JS 兜底表 `utils/i18n-data.js`，占设备端 JS 的 38% 且与 `.po` 重复，已移除——译文唯一来源是 `page/i18n/*.po`（zeus 编译为 `assets/raw/locale/*.btxt`）。同时图表数据手机→手表只发设备读取的字段（`time/o/c/h/l/volume/amount[/avg]`），分时帧缩小 67%、日K 帧 64%。两项合计使编译产物从 429 KB 降到 245 KB（-43%）。回归测试见 `tests/payload-trim.test.cjs`。
- **设计字体接入**：按 Zepp OS 设计资源将 Noto Sans Regular/Medium 与 Zepp OS Number 系列字体接入 TEXT 组件（`font` 属性）；大字号数值（价格、评分、涨跌幅）使用 Zepp OS Number。字体按全部译文用字子集化到 `assets/gt.s/fonts/`（共约 0.7MB），生成脚本见 `tools/subset_fonts.py`。

  > **实测更正（2026-09-11）**：`zeus build` 当前**不会**把这 4 个 ttf 打进安装包——包内无 `assets/fonts/`，而 `assets/gt.s/` 只剩 `icon.png`。这与 1.0.2 的旧包（`宽基指数ETF_WireV2_GTS4`）逐项一致，属既有行为，非本次改动引入。因此手表上实际显示的是**系统字体**（Zepp 系统字体即 Noto Sans 全字库），视觉差异极小；`safeFontFor` 的门控也已保证混合中英文串回落系统字体。若要真正启用自定义字体，需先查清 zeus 打包 ttf 的条件（尚未查清）。
  >
  > **复测更正（2026-09-17）**：上面这条结论已不成立。解包当前 `zeus build` 产物
  > （`.zab` → 各 `.zpk` → `device.zip`）实测，**两个形状的包内都有 `assets/fonts/`，
  > 且 4 个 ttf 齐全**（`NotoSans-Regular.ttf`、`NotoSans-Medium.ttf`、
  > `Zepp-OS-Number.ttf`、`Zepp-OS-Number-blod.ttf`）。资源目录在包内被扁平化：
  > 源工程的 `assets/gt.<形状>/fonts/` 到包里变成 `assets/fonts/`，这大概是 9-11 那次
  > 没在包内找到 `assets/gt.s/` 就判定"未打包"的原因。另外 `assets/gt.r/fonts/` 也必须
  > 存在：只写真 `gt.s` 时圆屏包会因为缺字体资源而构建失败。
- **屏幕尺寸常量化**：`390/450` 硬编码全部替换为 `getDeviceInfo()` 实际宽高；此前闲置的 `index.page.s.layout.js` 成为唯一屏幕尺寸来源，底层组件（swiper/scene/components）同步改造。
- **可读性符合设计规范**：字号映射表补全缺失档位并设 12px 可读下限；图表轴刻度、日期标签从 9px 提升到可读字号并加宽文本框。
- **交互修复**：每个 Canvas 只绑定一套触摸监听（交互标记 + 点击区域分发合一），消除此前三事件重复绑定；路由防抖改为推送成功后才记录，失败不再吞掉用户重试。
- **调度修复**：延迟刷新定时器按 label 隔离，缓存恢复/首载/自动刷新互不再取消；`startAutoRefresh` 增加防重复调用。
- **首帧可靠性**：删除首屏渲染失败后误清 dirty 标记的语句，渲染失败页会自动重试。
- **数据正确性**：份额页 note 死分支修复；分时页"刚刚更新"改为真实更新时间；手机端默认 ETF 代码按核心标的白名单校验，设置页改为选择器。
- **配置诚实化**：设置页与 `SUPPORTED_DEVICES.md` 只宣称当前构建目标（390×450 / API 3.5 / st "s"）；`app.json` 声明 34 语言并升级 `1.0.2` / `version.code=202`。
- **死代码清理**：移除未使用的 `percentage/asBoolean/loadPrimarySnapshot/clearViewSignatures/drawDualLineChartAt/PERIOD_LABELS`、页面门面多余导出、Side Service 从未接收的 5 个请求 handler、`app.js` 闲置 globalData。

## ETFstudio 1.0.1 流畅优化版

- ETF 详情页从 8 屏精简为 6 屏，移除详情内的“我的持仓”和“ETF 预警”两屏；首页的自选持仓和预警记录功能保留。
- 驻留邻页在数据返回后于交互空闲期完成 dirty render，降低首次翻入图表页时的同步绘制压力。
- 常规相邻翻页中，若目标 Scene 已驻留，旧窗口回收延后到 settle 阶段，避免在翻页回调内删除原生控件。
- 首帧后优先恢复未过期本地缓存，网络请求、超时、自动刷新和数据源逻辑保持不变。
- 份额双轴图和 PE 估值图取消被后续同色折线完全覆盖的重复描线，保留原有面积、网格、折线顺序与视觉参数。
- 版本升级为 `1.0.1`，`version.code=201`，`debug=false`。

## ETFstudio 1.0.0 生产版

- 页面生命周期隔离：重新进入页面时清空旧 generation 的 pending request 注册表，并使用 Promise 身份校验防止旧请求完成后误删新请求。
- 弱网保护：同一数据源连续失败触发 20 秒短熔断；网络超时不再立刻发起可能重叠的第二次 fetch；仍保留缓存回退和跨数据源降级。
- 本地存储自愈：损坏 JSON 自动清除单键；写入空间不足时只淘汰最旧缓存后重试，避免缓存挤占设置和预警记录。
- 后台历史库前台避让：用户持续操作时，30 秒后中止本轮后台同步，不再强行进入重网络阶段；中断周期不标记为已刷新。
- 上交所 ETF 份额：修复抽样循环少取点问题，并改成 12 个六个月代表样本、4 路有界并发、2.8 秒单请求超时，降低首次进入份额页尾延迟。
- 融资融券接口增加 5.2 秒网络边界。
- 发布检查新增生产静态测试、版本一致性、资源存在性、页面清理、网络/缓存防护及设备端禁止 async/await 检查。
- 版本升级为 `1.0.0`，`version.code=200`，`debug=false`。

## ETFstudio 0.1.12

- 五年 PE 估值页按 390×450 方屏重新布局，视觉结构参考“历史 PE/PB”类行情页：当前 PE、五年分位、80% 危险值、20% 机会值、指数点位、PE 最高/平均/最低集中展示。
- PE 图新增指数点位右轴：Side Service 在获取指数 PE 的同时最多并发 1 个指数月线请求，按自然月与 PE 月频样本对齐；不支持的指数代码或指数月线失败时仍保留 PE 图，不伪造点位。
- PE 图新增蓝色面积 PE、橙色危险虚线、绿色机会虚线、红色指数点位曲线；左右 Y 轴独立缩放，最多 60 个月点。
- 估值 Side Service 缓存升级为 `valuation5y:v4`，设备估值缓存命名空间升级为 `v5`，避免旧缓存缺少指数点位字段。
- 基金份额页按“份额变动”图重新布局：蓝色基金份额面积线 + 橙色 ETF 收盘价右轴，并显示左右轴刻度、起止日期与最新更新时间。
- 份额摘要改为“最新基金份额 + 近 6 月份额变动百分比”，同时保留绝对变动亿份作为副信息；手机端历史库保留 132 个交易日，设备端保持当前最多 96 个绘图数据点。
- 新增通用 `drawDualAxisAreaChartAt` 与 `drawValuationHistoryChartAt` Canvas 绘图能力；本次性能补丁不修改任何图表点数、线宽、颜色、坐标轴或 `sampleStep`。
- 性能补丁：切页时不再同步销毁上一页 Canvas；用户交互停止后再整理两页窗口，并在空闲时完整预热可能进入的下一页。异步数据返回时若正在滑动/转表冠，延迟 Canvas 重绘。
- 首页“市场温度”移除“刷新频率 / 数据模式”两个展示卡，但 60 秒自动刷新和原数据模式逻辑保持不变；空白区域改为扩展“市场广度 / 当前强势”信息。
- 数据适配测试新增指数月线与 PE 按月对齐检查；原有份额单位、SSE/SZSE 适配和导航静态测试继续通过。

## ETFstudio 0.1.11

- 右侧导航改为 Zepp OS 原生 `PAGE_SCROLLBAR`，通过代码直接创建，不再依赖选中/未选中 PNG 图片。
- 导航由系统绑定整页滚动/Swiper 位置，视觉和交互行为交由 Zepp OS 原生控件管理，接近官方天气等系统应用的右侧滚动条。
- 删除 `page_indicator_selected.png`、`page_indicator_unselected.png` 以及手工计算 6/8/9 屏分段高度、间距和居中位置的逻辑。
- 将导航职责从 `navigation/swiper.js` 拆到专用 `navigation/scrollbar.js`，避免 Swiper 配置与导航渲染耦合。
- 首页 6 屏、详情 8 屏、核心标的 9 屏统一使用同一原生滚动条；页面销毁时显式释放控件。
- 保留 0.1.9 的 PE 五年估值与 ETF 基金份额修复。

## ETFstudio 0.1.9

- PE 五年估值主源改为 AKShare `stock_index_pe_lg` 同源协议：乐咕指数基础 PE，使用 `addTtmPe`（AKShare 输出“滚动市盈率”）而非等权 TTM 字段；日频数据按自然月取月末有效值，最多 60 点。
- 乐咕适配器独立实现：指数支持白名单、日期 MD5 token、CSRF 页面握手、Cookie 会话、PE 字段解析、月末抽样与数据质量检查均拆成专用逻辑；雪球保留为独立回退源。
- 沪深300 510300、上证50 510050、中证500 510500、中证1000 512100、上证180 510180 优先走 AKShare 当前支持的乐咕指数 PE 映射；不支持的指数不做错误替代。
- 上交所 ETF 份额接口更新为 AKShare 当前使用的 `COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L`；严格按 `TOT_VOL` 为万份解析，直接换算为亿份，不再使用通用单位猜测。
- 上交所近 3 个月份额以 ETF 日线真实交易日为锚点抽取 7 个均匀快照，并限制最多 2 个并发请求；减少周末空请求、手机流量和内存峰值，再按交易日阶梯对齐收盘价。
- 深交所份额切换到当前日频基金规模目录 `scsj_fund_jjgm` 的 JSON 协议尝试，字段按“基金规模(份)”绝对份额解析；保留旧目录作为兼容回退。
- 彻底停止用东方财富实时行情 `f84` 推断 ETF 基金份额；该字段不是稳定的基金份额契约，是 `0.001亿份` 异常值的主要风险来源。最新份额现在只来自交易所规模披露或基金档案回退。
- 删除份额历史的 1/10000 与 ×10000 自动校准逻辑；SSE、SZSE、基金档案各自使用专业解析函数，避免错误单位被“猜测修正”。
- 份额 Side Service 缓存升级到 `share-history3m:v2` / `shares:v2`，设备持久缓存升级到 `etfstudio.shares3m.v2`，设备请求缓存 `shares` 升到 v3；PE 设备缓存升到 v4，阻止旧错误数据升级后继续显示。
- PE 与份额失败时仍保留已有有效缓存；若只能拿到最新份额而历史不足，页面显示最新值但不伪造一条平坦的 3 个月历史曲线。

## ETFstudio 0.1.8

- 修复指数五年 PE 严重错位：旧版只按六位 `SECURITY_CODE` 查询估值，指数代码与 A 股代码重号时可能拿到个股 PE。0.1.8 改为交易所限定的指数身份，例如上证180使用 `SH000010`。
- 五年 PE 数据统一改为指数 PE-TTM 月频样本：近 5 年最多 60 个自然月点，当前分位、20%机会值、80%危险值全部基于同一组月度 PE 计算，不再混用不同频率/口径。
- 雪球指数 K 线请求使用 `period=month` + `indicator=pe`；按返回列名动态定位 timestamp/PE，避免字段顺序变化导致读错列。
- 新增指数 PE 数据质量守卫：有效月数不足、PE 非正数或最新值相对自身五年中位数出现数量级异常时拒绝展示，宁可显示暂不可用也不展示错误估值。
- 估值缓存升级到新命名空间，阻止 0.1.7 已缓存的错误 PE 在升级后继续闪现。
- PE 五年估值页从第 8 页移动到融资之后的第 6 页。详情顺序固定为：详情 / 行情图 / 资金流 / 基金份额 / 融资 / PE五年估值 / 我的持仓 / ETF预警。
- PE 页标题中的月频点数改为真实返回数量，最多 60 点，不再无条件写死“60点”。
- 近5年 PE 分位显示保留两位小数，便于与月频 60 点估值工具核对。
- 保留 0.1.7 的生命周期守卫、按需 Scene、请求竞态保护、缓存上限和相同数据跳过重绘等稳定性优化。

## ETFstudio 0.1.7

- 稳定性专项：新增 Device Runtime 生命周期守卫，页面销毁后异步请求、定时器和旧回调不再继续写 UI。
- Swiper 改为当前完整场景 + 最多一个轻量邻页壳；切页瞬间优先释放旧完整场景，降低 390×450 Canvas/TEXT/按钮同时常驻数量。
- UI 场景增加 native Canvas/TEXT/BUTTON 错误隔离；连续 native 绘制失败自动熔断，并带退避重建，避免资源不足时反复创建导致崩溃。
- 所有主要自动刷新均等待用户交互结束后再运行；页面切换、点击期间延迟后台刷新，前台操作优先。
- 详情首屏新增 light overview：只加载报价、日线和分时，份额/估值/融资等进入对应页面后按需请求；今日主力仅在报价缺失时补请求。
- 请求加入设备端超时、Side Service 总超时、可重试错误边界、旧缓存回退和同请求去重。
- 修正设备缓存策略：未过期缓存瞬时返回；过期缓存只作为网络失败回退，避免“看见旧数据后不再联网”。
- 设备内存缓存限制 72 项，持久缓存限制 48 项并自动淘汰旧业务缓存；Side Service 内存缓存限制 96 项。
- 历史数据库同步改为空闲任务；前台请求出现时，后台同步在 ETF 之间主动让路，不再连续抢占网络。
- 分时/日K增加数据指纹：行情没有变化时不重新准备数据、不全量重绘；K线和柱图绘制改为单个 native 保护区批量执行。
- 首页市场、核心标的、信号、持仓、预警、设置及详情多页增加渲染指纹，相同数据不再重复 setProperty/Canvas 重绘。
- 返回同一 ETF 时保留上一帧有效状态实现快速首屏；切换到不同 ETF 时立即清理旧标的数据，避免闪现上一只 ETF 的报价。
- 分时数据继续保持午间视觉连续；稀疏数据在交易时段内插值，价格线/均价线不因采样点缺失消失。
- 分时响应保留首末点并提高到最多 96 点，确保实时价格气泡使用最新样本。
- PE 五年估值请求上限收紧到 1800 条并设置有界超时，手表只接收月频最多 60 点。
- 基金份额继续保留近 3 个月日期/份额/收盘价紧凑缓存；网络失败时优先保留上一份有效图表，不用错误提示覆盖好数据。

## ETFstudio 0.1.6

- 分时图午间不再断线：11:30 至 13:00 使用午间休市的横向连续段，价格线/均价线保持完整。
- 主页智能信号接入对应指数近 5 年 PE-TTM 历史分位，不再用 ETF 自身 PE 代替指数估值。
- ETF 详情新增第 8 页“PE五年估值”：近 5 年、月频最多 60 点，并显示 20%低估线与 80%危险线。
- 基金份额主数据源改为交易所 ETF 日度规模数据，最近 3 个月与 ETF 每日收盘价按交易日对齐；东方财富基金档案仅作为回退。
- 详情概览补齐均价、振幅、今日主力的派生/回退逻辑。
- 资金流页“今日主力”使用最近资金流记录回退；原“场外申购”改为可验证的“份额申赎”（最近两个交易日 ETF 份额净变化）。
- 九个核心标的增加原生 Zepp BUTTON“进入详情”，提供按压反馈并避免 TEXT Widget 吞掉 Canvas 点击。
- 份额页保留最近 3 个月手机端持久化缓存，显示最新份额与区间份额变动。

## ETFstudio 0.1.5

- 分时页改为手表友好的面积行情卡片：价格面积线、均价线、09:30/11:30/13:00/15:00 四条竖线、最新价格气泡、最高/最低价提示。
- 分时图按当日涨跌使用红/绿主色，午间休市保持断线。
- 基金份额页固定展示最近 3 个月，按交易日将基金份额与 ETF 收盘价对齐。
- 新增手机端持久化紧凑缓存：每只 ETF 保存最近 3 个月的 日期/份额/收盘价；网络失败优先从该缓存恢复图表。
- 份额桥接上限提升到 90 点，并显示图表起止日期。

## ETFstudio 0.1.4

- 修复分时价格线与均价线可能完全消失：兼容带秒时间戳/紧凑时间戳，并对上午、下午交易段内缺失分钟做前值补齐；午休仍保持断线。
- 保留 09:30、11:30、13:00、15:00 四条交易时段竖线与实时价格气泡。
- 固化 9 组指数/ETF 双代码：指数代码仅用于 PE 五年估值；ETF 代码用于 ETF 行情和基金份额。
- 新增中证红利 000922 ↔ 515180、半导体 882121 ↔ 159516。
- 不使用 ETF PE 冒充指数 PE；历史 PE 数据源未就绪时继续显示估值分位不可用。

## ETFstudio 0.1.3

GTS 4 real-device correctness and navigation performance pass.

- Page containers are now created lazily with the active scene instead of allocating all 6/7 `VIEW_CONTAINER` widgets at startup.
- First/last section pages keep only one neighbour alive; leaving detail/universe pages destroys fewer widget trees.
- Intraday chart now uses a 09:30–15:00 wall-clock timeline with the lunch break preserved.
- Added four vertical session guides for 09:30 open, 11:30 morning close, 13:00 afternoon open, and 15:00 close.
- Added a live-price callout bubble with a triangular pointer anchored to the latest price point.
- Invalid/zero Eastmoney average-price fields no longer flatten the price line; a cumulative average fallback is used.
- Intraday/Day-K tabs now use native Zepp OS BUTTON widgets for reliable taps and visible pressed feedback.
- Period-specific chart caches and request guards prevent late intraday responses from overwriting Day-K after switching tabs.
- Switching periods renders the active tab immediately and shows a loading state while uncached data is fetched.
- Fund-share history is now aligned by most-recent disclosure date (`disclosure <= trading day`) instead of exact date equality.
- Share and close series are filtered as aligned pairs, preventing shifted/empty share charts.

## ETFstudio 0.1.2

Performance-focused GTS 4 build.

- TEXT widgets are no longer blanked and immediately rewritten on every render.
- Added `finishScene()` to hide only stale, unused TEXT widgets after a render.
- Cached TEXT properties skip redundant `setProperty(prop.MORE, ...)` calls.
- Day-K preparation now normalizes candles and computes MA5/MA20 in one pass.
- Candlestick wicks use one continuous wick rectangle behind the body, reducing each candle from up to 3 canvas draw calls to 2.
- Line charts avoid temporary `map/filter` arrays and per-point temporary objects.
- Grid coordinate conversion and bar max-absolute scanning were simplified.

## ETFstudio 1.0.0 Release Notes

### 正式版结构

- 版本名统一为 `1.0.0`。
- 首页、详情页均采用“生命周期编排 / view / service”分层。
- UI 基础设施拆为 scene、components、interaction、charts。
- Swiper 基础设施拆为 swiper、window、scenes。
- 60 交易日数据库拆为 store、record-builder、sync、fallback。
- 行情 Provider 拆为 transport、quote、chart、flow、margin、shares、overview、universe。
- 所有业务/运行时 JavaScript 文件均少于 200 行。

### 页面正式化

- 删除页面底部前期测试状态文字与调试反馈。
- 删除后将卡片、列表、图表向下扩展，占用原状态区域。
- 删除 `scripts/check.mjs`、`scripts/refactor-audit.mjs` 等前期测试模块。
- 保留真正属于产品内容的行情更新时间、数据模式、历史库状态等信息。

### 正式支持设备

- Amazfit GTS 4 · 390×450 · API 3.5 · 已支持
- Amazfit Cheetah (Square) · 390×450 · API 3.6 · 适配很低
- Amazfit Active · 390×450 · API 3.6 · 适配很低
- Amazfit Active 2 (Square) · 390×450 · API 4.2 · 适配很低
- Amazfit Bip 6 · 390×450 · API 4.2 · 适配很低


---

## 附：开发工具目录（tools/、preview/、tests/）说明

这些目录是**开发机上的维护工具与验证产物，不进手表安装包**——zeus 只打包 app.json 声明的 `page/`、`app-side/`、`setting/`、`assets/<target>.<形状>/`、`app.js`、`app.json`（当前包内容实测：两个形状的包内均为 35 个编译语言目录 .btxt + 1 png + 4 ttf + 页面 .bin，零 Python。注意：`zeus build` 会把工程根目录下所有 `.js` 与 `.ts` 当源码扫描，所以这里只保留 `.cjs`/`.py`；任何放在工程内的第三方 `.js` / `.ts`（例如官方文档站仓库）都会让构建失败）。

### 源码扩展名：必须用 `.js`，不能用 `.ts`

**结论：本项目设备端源码一律 `.js`。全部改成 `.ts` 会导致 `zeus build` 失败。**

实测（zeus-cli，2026-09 验证）：

```
$ zeus build            # 源码为 .ts 时
page Error: ...\Temp\zpm-xxxx\page\home\index.page.js does not exist
[✘] Build package error, the package name is undefined
```

`zeus` 把 `app.json` 的 `pages` 条目（`page/home/index.page`，无扩展名）当作
**字面路径 + `.js`** 去解析，不会回退到 `.ts`。而且它的 JS 编译链
（rollup + `@rollup/plugin-commonjs` + esbuild + QJSC）**没有 TS 转译步骤**：
即使把文件改名成 `.js`，只要函数体里残留 TS 语法（类型注解、`param?:` 可选参数、
`interface` 等），rollup 的解析器就会直接抛错：

```
export function isRuntimeAlive(context, generation?) { ... }
                                              ^ PLUGIN_ERROR (commonjs--resolver)
```

因此本项目**不引入 TypeScript 语法**。类型提示只来自
`jsconfig.json`（`checkJs: true`）+ `global.d.ts` + `@zeppos/device-types`
——这也正是官方 zeus 工程模板自带的那三个文件。

> 注：官方 zeus 模板（`zeus-cli/private-modules/zeppos-app-utils/dist/public/template/`）
> 里所有页面、`utils/`、`app-side/index.js`、`app-widget/index.js` 均为 `.js`，
> 且随包附带 `jsconfig.json` + `global.d.ts`。官方文档提到 TypeScript 的地方，
> 仅指 `global.d.ts` 这一个类型声明引用文件。

四个入口文件（`app.js`、`app-side/index.js`、`app-widget/index.js`、
`tools/render-preview.js`）除此之外还有各自被写死的名字来源：

| 文件 | 名字来源 |
|---|---|
| `app.js` | `package.json` 的 `main` 与 ZeppOS 应用主入口约定 |
| `app-side/index.js` | `app.json` → `targets.gt.module["app-side"].path` |
| `app-widget/index.js` | `app.json` → `app-widget.widgets[0].path`，且声明 `"runtime": { "type": "js" }` |
| `tools/render-preview.js` | `package.json` 的 `render` 脚本写死路径 |

其余约定：

- 源码内部 import 一律**不写扩展名**（`from '../../../utils/constants'`），由构建期解析。
- `zosLoader:` 说明符写成 `.layout.js`，与文件名一致；`[pf]` 占位符由构建期替换。
- 版面文件用 `.js`（`index.page.[pf].layout.js`、`shape.[pf].layout.js`），每个形状各一份。
- 测试与 `tools/` 的 loader 走 `resolveSource()`：**先探测 `.ts`，回退 `.js`**。
  当前全是 `.js`，分级探测只是为了日后若构建链支持 `.ts` 时测试不必再改。
- 类型检查配置是 `jsconfig.json`（不是 `tsconfig.json`）。

> 另一条实测教训：`zeus build` 会扫描**工程根目录下的所有 `.js`/`.ts`**。
> 工程内若存在第三方 JS（如官方文档站仓库 `zeppos-docs-main/`，含 JSX 的 `.js`），
> 构建会在 rollup 解析该文件时失败。这类目录必须放在工程目录之外。

| 路径 | 用途 | 运行方式 |
|---|---|---|
| `tools/build_i18n.py` | 从翻译目录生成 34 语言 .po（唯一译文来源，zeus 编译为 `assets/raw/locale/*.btxt`）；改文案后必须重跑 | `npm run i18n`（连带字体子集） |
| `tools/subset_fonts.py` | 把 Noto Sans 全字库按"全部译文用字"裁剪成子集（14MB→0.5MB 级）。输出目录由 `app.json` 的形状声明推导，**每个形状各一份**（`assets/gt.r/fonts/`、`assets/gt.s/fonts/`） | `npm run i18n` 第二步 |
| `tools/render-preview.js` | 离屏渲染 22 帧页面预览（桩掉 @zos 层，加载真实视图代码） | `npm run render` |
| `tools/i18n-report.py` | 校验翻译目录与代码双向覆盖（0 缺失 / 0 未用） | `python tools/i18n-report.py` |
| `tools/dead-exports.py` / `tools/unused-imports.py` | 死导出 / 未用导入扫描 | `python tools/xxx.py` |
| `tests/` | 6 项回归测试 | `npm run check` |
| `preview/` | 渲染预览 HTML 与截图（本地 `python -m http.server` 查看） | — |

选 Python 的原因：字体子集化的事实标准工具 `fonttools/pyftsubset` 只有 Python 版；这类"资源生成 + 静态分析"任务在构建机侧完成，与手表端 QuickJS 运行时无关。
