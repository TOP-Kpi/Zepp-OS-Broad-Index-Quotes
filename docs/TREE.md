# 宽基指数行情 V2 · 完整目录树

> 应用：宽基指数行情（appId 1126615）　包名：etfstudio-dualscreen　版本：1.0.0（version.code=100）
> 类型：Zepp OS 手表小程序（App）· configVersion v3 · API 兼容 3.0.0 / 目标 3.5.0
> 屏幕：单工程双屏。构建目标 `gt`，`platforms = [{"st":"r"},{"st":"s"}]`，designWidth 390；
> 构建期按形状分包（圆屏 390×390 内切圆弦宽安全区 / 方屏 390×450 版面），运行期无形状分支（`zosLoader [pf]`）。
> 页面：`page/home` · `page/universe` · `page/detail`　默认语言 zh-CN，共 34 种语言
>
> 形态：设备端 `page/ + utils/ + app-widget/`（QuickJS / Canvas / TEXT）
> ＋ 手机端 `app-side/`（Side Service，联网取数并压缩回传）＋ `setting/` 设置页。
>
> 统计：**211 个受版本控制的文件**（另有 `package-lock.json` 被 .gitignore 忽略）。
> 大小为 0.x KB 级别的按 1 位小数四舍五入展示，取自当前工作树。
> 本文件由人工整理，`docs/project_structure_report.txt` 由 `npm run docs:structure` 生成（含逐文件职责说明）。

```
.

├── app.js                              (0.5 KB)   应用级主入口（空壳）：创建 BaseApp 并注册 onCreate/onDestroy
├── app.json                            (7.9 KB)   ★应用/页面配置（构建必读）：targets.gt（pages / app-side / setting /
│                                                  app-widget / platforms / designWidth）+ 34 语言 i18n（appName + 卡片名）
├── global.d.ts                         (0.1 KB)   TypeScript 类型引用：指向 @zeppos/device-types
├── jsconfig.json                       (1.0 KB)   编辑器 IntelliSense 配置（不提供类型检查，原因见文件内注释）
├── package.json                        (3.2 KB)   Node/构建脚本清单（维护入口）。check = check:tests + check:visual
├── package-lock.json                   (1.0 KB)   本地锁文件（.gitignore 已忽略，不入版本库）
├── .gitignore                          (0.2 KB)   忽略 node_modules / dist / 日志 / IDE 文件
│
├── app-side/                                       【手机端】Side Service：联网取数 → 压缩 → 蓝牙回传手表
│   ├── index.js                        (4.0 KB)   Side Service 主入口：注册 BaseSideService、请求编排、
│   │                                              历史库空闲同步（IDLE_HISTORY_DELAY_MS）与预取调度
│   ├── config.js                       (0.7 KB)   DIRECT_CONFIG：东财各主机基址与移动端直连参数
│   ├── history-db.js                   (0.5 KB)   兼容门面：再导出 history/ 的持久化、同步与回退适配
│   ├── shares-cache.js                 (5.1 KB)   份额 6 个月缓存（132 点上限、CACHE_PREFIX 版本号）
│   │
│   ├── domain/                                     业务域：算法与编排（不直接发请求）
│   │   ├── request-router.js           (7.0 KB)   ★method → provider 的映射与统一错误处理
│   │   ├── signal.js                   (5.1 KB)   信号派生与归一（normalizeAction / deriveSignal）
│   │   ├── prefetch.js                 (4.1 KB)   空闲预取编排（页面打开后后台补数）
│   │   ├── compact.js                  (1.8 KB)   回传压缩：缩字段名、截精度，降低蓝牙传输量
│   │   ├── settings.js                 (1.9 KB)   读取 settingsLib 设置项（readSetting / readBoolSetting / readNumberSetting）
│   │   ├── market.js                   (1.7 KB)   市场概览汇总（summarizeMarket：涨跌家数、情绪分等）
│   │   ├── portfolio.js                (1.7 KB)   持仓投影（只消费 code/name/shortName/indexCode → ETF_UNIVERSE）
│   │   ├── etf-catalog.js              (1.4 KB)   标的字典单源 ETF_CATALOG（code/name/indexCode/secid/…）
│   │   └── finite.js                   (0.7 KB)   数值归一：'-' / '--' / 空串 → null（side 侧唯一实现）
│   │
│   ├── history/                                    手机端 132 日历史数据库（离线兜底的数据来源）
│   │   ├── store.js                    (5.2 KB)   落盘与 LRU 清理（DB_PREFIX / META_KEY / SYNC_FRESH_MS）
│   │   ├── fallback.js                 (5.1 KB)   历史记录 → 日K / 资金流 / 份额 / 融资 / 概览 的适配
│   │   ├── sync.js                     (4.7 KB)   按需回补：缺哪些标的、补哪些交易日
│   │   ├── record-builder.js           (3.4 KB)   由报价点构造日线记录（含均线、前收）
│   │   ├── config.js                   (0.4 KB)   DB_VERSION / RETENTION_DAYS=132 / ETF_META
│   │   └── value.js                    (0.9 KB)   数值归一兼容门面：再导出 domain/finite.js
│   │
│   └── providers/                                  数据源适配（东财为主，腾讯/新浪/两所/雪球/乐咕/中证回退）
│       ├── eastmoney.js                (2.1 KB)   组合根：把 transport 与各能力 provider 组装成一个 provider
│       └── modules/                                单个数据能力的取数与解析
│           ├── transport.js            (12.1 KB)  ★网络层：ReadableStream 正文读取、内存 LRU（96 键）、
│           │                                      请求去重、jar:true 的按主机 cookie 转发（乐咕需要）
│           ├── valuation.js             (7.4 KB)  PE 编排：乐咕为主、雪球/中证回退，指数 → 后缀映射
│           ├── valuation-legulegu.js   (10.7 KB)  乐咕 PE：指数页解析 + indexCode 后缀（.SH/.SZ/.CSI）
│           ├── valuation-xueqiu.js      (2.9 KB)  雪球 PE 回退（现要求登录，多为兜底路径）
│           ├── valuation-csindex.js     (2.6 KB)  中证指数官网每日估值（peg = 加权 PE-TTM）
│           ├── share-parser.js          (7.8 KB)  份额文本/HTML 解析（去标签、按日合并收盘）
│           ├── overview.js              (7.1 KB)  详情页概览卡：均价、成交、估值等派生
│           ├── flow.js                  (4.9 KB)  主力资金日线（ut 参数是接口契约的一部分，缺了返回空）
│           ├── chart.js                 (4.8 KB)  分时 / 日K 取数与解析（东财、腾讯、qtimg 三源）
│           ├── shares.js                (4.8 KB)  份额聚合：两所直取 + 基金档案页回退
│           ├── quote.js                 (4.0 KB)  批量报价（东财 push2 为主，腾讯回退）
│           ├── common.js                (3.8 KB)  url / text / nowText / parseKlineRow / 各字段解析助手
│           ├── shares-szse.js           (3.6 KB)  深交所 ETF 规模报表取数
│           ├── money-supply.js          (3.2 KB)  ★M1-M2 月报（RPT_ECONOMY_CURRENCY_SUPPLY；字段认错会得到反向剪刀差）
│           ├── quote-parser.js          (2.5 KB)  报价行解析（东财 f43/f2 与腾讯字段）
│           ├── universe.js              (2.1 KB)  核心标的列表（批量报价合成 universe 行）
│           ├── shares-sse.js            (5.0 KB)  上交所 ETF 规模接口（COMMON_SSE_ZQPZ_ETFZL…）
│           └── margin.js                (1.3 KB)  融资余额
│
├── app-widget/                                     【快捷卡片】负一屏 M1-M2 剪刀差
│   └── index.js                        (12.2 KB)  单 CANVAS + TEXT 绘制（卡片坐标是设备像素，不用 px()；
│                                                  拿不到蓝牙实时数据，只读页面侧写入的本地快照）
│
├── setting/                                        【设置页】手机端
│   └── index.js                         (4.4 KB)  自选标的与参数设置（标的清单在此有一份显示用副本，增删须同步）
│
├── assets/                                         按形状分包的资源目录（<target 键>.<st>）
│   ├── gt.r/                                       圆屏（st="r"）
│   │   ├── icon.png                    (158 KB)   应用图标
│   │   └── fonts/                                  子集化设计字体（由 tools/subset_fonts.py 生成）
│   │       ├── NotoSans-Regular.ttf    (496.6 KB)
│   │       ├── NotoSans-Medium.ttf     (189.5 KB)
│   │       ├── Zepp-OS-Number.ttf       (11.1 KB)
│   │       └── Zepp-OS-Number-blod.ttf  (10.1 KB)
│   └── gt.s/                                       方屏（st="s"）：与 gt.r 同构的五份资源
│       ├── icon.png                    (158 KB)
│       └── fonts/  （同上 4 个 ttf，字节数一致）
│
├── page/                                           一目录一页面
│   ├── home/                                       首页：6 屏分页 swiper（市场温度 / 宽基行情 / 智能信号 / 自选持仓 / 预警 / 设置）
│   │   ├── index.page.js                (5.3 KB)  页面逻辑 + 生命周期（RENDERERS / BINDERS / PAGE_COUNT=6）
│   │   ├── index.page.r.layout.js       (0.5 KB)  ★圆屏版面：原生 swiper 页高、画布宽（设备像素）
│   │   ├── index.page.s.layout.js       (0.5 KB)  ★方屏版面：同构的另一份
│   │   ├── model.js                     (4.9 KB)  状态与行数据装配（不含请求、不含绘制）
│   │   ├── services/                               数据装载（一屏一个 loader）
│   │   │   ├── portfolio.js             (3.1 KB)  自选持仓
│   │   │   ├── signal.js                (2.9 KB)  智能信号
│   │   │   ├── dashboard.js             (2.6 KB)  一次 dashboard 请求喂满多屏（含行指纹门控）
│   │   │   ├── alerts.js                (1.8 KB)  预警记录（本地历史 + 通知）
│   │   │   ├── liquidity.js             (1.4 KB)  M1/M2 取数并写卡片快照（utils/m1m2.js）
│   │   │   └── history.js               (0.9 KB)  触发手机端 132 日历史库同步并回显状态
│   │   └── views/                                  绘制与交互（一屏一个 renderer）
│   │       ├── alerts.js                (4.6 KB)  预警记录屏（列表 + 纵向滚动）
│   │       ├── market.js                (4.5 KB)  市场温度屏（半环仪表 + 评分环）
│   │       ├── signal.js                (3.3 KB)  智能信号屏
│   │       ├── universe.js              (3.2 KB)  宽基行情屏（四宫格）
│   │       ├── portfolio.js             (2.8 KB)  自选持仓屏（指标卡）
│   │       ├── settings.js              (1.9 KB)  设置屏
│   │       └── common.js                (0.2 KB)  首页页头（统一 1/6 页码）
│   │
│   ├── universe/                                   核心标的列表页：一屏一只标的（屏数 = ETF_UNIVERSE.length）
│   │   ├── index.page.js                (4.1 KB)  页面逻辑：replace 入口（leaveToDetail 先释放本页资源）
│   │   ├── index.page.r.layout.js       (0.5 KB)  ★圆屏版面
│   │   ├── index.page.s.layout.js       (0.5 KB)  ★方屏版面
│   │   ├── model.js                     (1.2 KB)  UNIVERSE_PAGE_COUNT + 空行与合并（走 utils/universe.js）
│   │   ├── services/
│   │   │   └── universe.js              (1.3 KB)  dashboard 请求 → 按屏渲染门控
│   │   └── views/
│   │       └── detail.js                (3.4 KB)  单标的整页（大卡 + 底部「进入详情」按钮）
│   │
│   ├── detail/                                     ETF 详情页：6 屏（详细 / 行情图 / 资金流 / 份额 / 融资 / PE 估值）
│   │   ├── index.page.js                (9.5 KB)  页面逻辑：常驻窗口 Paging、预热、自动刷新、错误壳
│   │   ├── index.page.r.layout.js       (0.5 KB)  ★圆屏版面
│   │   ├── index.page.s.layout.js       (0.5 KB)  ★方屏版面
│   │   ├── model.js                    (13.7 KB)  状态与派生：分时压缩时间轴、午间断线桥接、K 线、释放策略
│   │   ├── services/
│   │   │   ├── chart.js                 (3.7 KB)  分时 / 日K
│   │   │   ├── valuation.js             (3.0 KB)  PE 五年估值
│   │   │   ├── shares.js                (3.0 KB)  基金份额
│   │   │   ├── overview.js              (2.0 KB)  概览卡
│   │   │   ├── flow.js                  (1.8 KB)  资金流
│   │   │   └── margin.js                (1.5 KB)  融资
│   │   └── views/
│   │       ├── chart.js                (13.2 KB)  行情图屏（折线/面积 + 分时↔日K 切换，唯一有 binder 的屏）
│   │       ├── valuation.js             (7.2 KB)  PE 五年估值屏（面积线 + 分位虚线 + 半环）
│   │       ├── shares.js                (3.4 KB)  份额屏（双轴面积 + 图例）
│   │       ├── overview.js              (2.6 KB)  概览屏（指标卡）
│   │       ├── flow.js                  (2.1 KB)  资金流屏（柱图）
│   │       ├── margin.js                (1.5 KB)  融资屏（柱图 + 指标卡）
│   │       └── common.js                (1.4 KB)  详情页页头、预热空壳、错误壳
│   │
│   └── i18n/                                       34 个 getText 词条目录（msgid = zh-CN 源文，编译为 assets/raw/locale/*.btxt）
│       ├── zh-CN.po                     (6.2 KB)  默认语言
│       ├── zh-TW.po                     (5.9 KB)
│       ├── en-US.po                     (5.9 KB)
│       ├── es-ES.po  ru-RU.po  ko-KR.po  fr-FR.po  de-DE.po  id-ID.po  pl-PL.po  it-IT.po
│       ├── ja-JP.po  th-TH.po  ar-EG.po  vi-VN.po  pt-PT.po  nl-NL.po  tr-TR.po  uk-UA.po
│       ├── iw-IL.po  pt-BR.po  ro-RO.po  cs-CZ.po  el-GR.po  sr-RS.po  ca-ES.po  fi-FI.po
│       └── nb-NO.po  da-DK.po  sv-SE.po  hu-HU.po  ms-MY.po  sk-SK.po  hi-IN.po
│       （每份 5～6 KB；缺失词条在设备端回落为 msgid 的中文源文）
│
├── utils/                                          设备端工具层（2 空格缩进、无分号、ES5 var function，QuickJS 友好）
│   ├── constants.js                    (12.4 KB)  ★设备与版面令牌：防御性读设备信息、由形状样式表推导
│   │                                              SAFE_AREA / CONTENT / columns()、色板、标的清单、缓存 TTL、字体清单
│   ├── shape.r.layout.js                (8.7 KB)  ★★圆屏形状样式表：页头度量 + 13 屏纵向节奏（键集合与 s 必须一致）
│   ├── shape.s.layout.js                (7.9 KB)  ★★方屏形状样式表（同构的另一份，构建期由 [pf] 选中）
│   ├── storage.js                      (10.1 KB)  本地存储：注册表 + LRU 淘汰、cacheKey/saveCache/loadCache、
│   │                                              预警历史、最近信号
│   ├── m1m2.js                          (6.9 KB)  ★M1-M2 契约 + 本地快照（页面写、卡片读；缺失一律 null 不冒充 0）
│   ├── refresh.js                       (6.2 KB)  定时刷新与延迟调度（deferInitialLoad / deferCacheHydration / 自动刷新退避）
│   ├── data.js                          (6.1 KB)  requestWithCache：TTL 缓存、请求去重、cacheOnly 水合、失败保留上帧
│   ├── signals.js                       (4.4 KB)  信号归一、通知与振动评估（consumeDashboardSignals）
│   ├── runtime.js                       (4.3 KB)  运行期开关与代次：避免页面销毁后迟到的响应继续渲染
│   ├── format.js                        (2.4 KB)  数值/日期格式化与颜色映射（数值归一走 utils/finite.js）
│   ├── universe.js                      (2.0 KB)  远端 universe × market.items 合并规则（首页与核心标的页共用）
│   ├── compat.js                        (1.7 KB)  ES5 兼容小工具（findFirst / isFiniteNumber / createArray…）
│   ├── i18n.js                          (1.4 KB)  getText 封装（t / tf）；不再内联多语言兜底表（见文件内注释）
│   ├── view-state.js                    (1.4 KB)  shouldRenderData 等渲染门控（轻量指纹，避免大数组 JSON.stringify）
│   ├── finite.js                        (0.5 KB)  数值归一（设备端版）：'-' / '--' / 空串 → null
│   │
│   ├── navigation/                                 导航与场景
│   │   ├── index.js                     (0.6 KB)  导航门面（页面 import 的稳定入口）
│   │   ├── scenes.js                   (16.2 KB)  场景常驻窗口管理：创建/复用/释放场景与容器、绘制分派
│   │   ├── swiper.js                    (4.2 KB)  原生分页 swiper 封装（页高走设备像素）
│   │   ├── window.js                    (4.1 KB)  常驻窗口索引计算（中心 ± 邻居，最多 3 个场景）
│   │   ├── route.js                     (2.0 KB)  safePush / safeReplace（带防连点）
│   │   └── scrollbar.js                 (0.7 KB)  原生 PAGE_SCROLLBAR 绘制与命中
│   │
│   └── ui/                                         绘图与交互 primitive
│       ├── charts.js                   (19.9 KB)  图表 primitive：折线/面积/柱/双轴/图例/轴标签/虚线/散点
│       ├── components.js               (14.5 KB)  组件级绘制：drawHeader（按 SAFE_AREA 与形状度量自适应）、
│       │                                          玻璃卡、圆角矩形、指标卡（含 tight 档）、信号胶囊、评分环
│       ├── scene.js                     (7.6 KB)  场景创建与绘制收尾（clearScene / finishScene / 画布错误降级）
│       ├── interaction.js               (6.0 KB)  触摸与手势：点击区、纵向滚动（设备像素 ↔ 设计单位换算）
│       ├── motion.js                    (3.5 KB)  有界画布动效：帧率封顶、交互期让位、随页面销毁取消
│       ├── vscroll.js                   (2.6 KB)  纵向长页面滚动（attachVerticalScroller + 滚动条绘制）
│       └── index.js                     (0.9 KB)  绘图门面（页面 import 的稳定入口）
│
├── tests/                                          18 个离线回归测试（npm run check:tests）
│   ├── shape-layout.test.cjs            (9.2 KB)  两份形状表键集合比对 + 视图用键静态扫描 + 四角圆内校验
│   ├── m1m2.test.cjs                   (13.8 KB)  剪刀差契约 + 数据源字段映射（真实响应样本，见 utils/m1m2.js）
│   ├── platform-shapes.test.cjs        (11.6 KB)  形状声明齐全，每个形状的版面与 assets 资源完整
│   ├── detail-lifecycle.test.cjs       (11.8 KB)  详情页窗口/预热/释放三条回归（1→2→1 空白、PE 不可用、不秒出）
│   ├── lifecycle-release.test.cjs      (11.1 KB)  重复启动内存增长：canvas 监听器解绑 + Side Service LRU 上限
│   ├── payload-trim.test.cjs            (8.2 KB)  载荷瘦身：多语言只走 getText；图表只发设备真正读取的字段
│   ├── detail-entry-route.test.cjs      (8.1 KB)  核心标的 → 详情：replace 顶替 + 先释放本页资源
│   ├── app-widget.test.cjs              (9.2 KB)  卡片官方约束：注册字段、可用控件、16px 边距、只读快照
│   ├── data-adapter.test.cjs            (7.1 KB)  数据适配与字段映射
│   ├── navigation-static.test.cjs       (7.0 KB)  导航静态约束（原生 PAGE_SCROLLBAR、门面导出）
│   ├── intraday-lunch-bridge.test.cjs   (6.7 KB)  分时午间断线桥接（slot 120/121 必须有值）
│   ├── pe-source-coverage.test.cjs      (6.3 KB)  6 只 ETF / 7 条指数 → 乐咕后缀映射全覆盖
│   ├── device-metrics.test.cjs          (5.4 KB)  异常 getDeviceInfo 不抛错；390×450 取值不变
│   ├── navigation-behavior.test.cjs     (4.8 KB)  导航行为（vm 沙箱跑真实导航模块）
│   ├── cache-hydration.test.cjs         (4.5 KB)  缓存水合：cacheOnly 命中与未命中的错误路径
│   ├── detail-visual-static.test.cjs    (4.5 KB)  详情页视觉静态约束（图表 primitive 与视图用法）
│   ├── transport-contract.test.cjs      (4.3 KB)  ★网络层契约：ReadableStream 正文、cookie 只走显式 jar:true
│   └── production-static.test.cjs       (3.9 KB)  版本一致（app/package 1.0.0 / code 100）、debug=false
│
├── tools/                                          构建、渲染、校验脚本（Node + Python）
│   ├── build_i18n.py                   (59.7 KB)  ★生成 page/i18n/*.po 全 34 语言（msgid = zh-CN 源文，断言无缺译）
│   ├── render-preview.js               (33.8 KB)  ★离屏渲染器：vm 沙箱加载真实视图模块 → 逐屏 SVG 帧
│   ├── structure-report.cjs            (18.7 KB)  ★生成 docs/project_structure_report.txt（事实来源是文件树与 app.json）
│   ├── verify-frames.cjs               (12.3 KB)  ★逐帧几何校验：r = 圆内 + 内容带 + 不叠字（硬闸门）；s = 对基线
│   ├── verify-card.cjs                  (8.7 KB)  卡片版面校验（圆角是"两矩形 + 四圆"、走势与零轴是否画出）
│   ├── render-compare.cjs               (4.0 KB)  方屏/圆屏并排对照画册（同屏两形状一行）
│   ├── subset_fonts.py                  (3.8 KB)  设计字体子集化 → assets/<target>.<st>/fonts/
│   ├── frame-freshness.cjs              (3.1 KB)  帧新鲜度签名（先渲染再校验，防止拿旧帧"全绿"）
│   ├── i18n-report.py                   (2.6 KB)  报告不再被引用的词条（扫描 page/ + utils/ + app-widget/）
│   ├── unused-imports.py                (1.7 KB)  报告导入而未使用的名字（只扫 .js，别改回 .ts）
│   ├── verify-font-glyphs.py            (1.7 KB)  子集字体覆盖全部译文用字（需 fontTools）
│   ├── dead-exports.py                  (1.6 KB)  报告导出但无外部消费者的符号
│   │
│   ├── diagnostics/                                人工诊断（不进 check 套件 / 不参与 CI）
│   │   ├── verify-pe-sources.cjs        (6.6 KB)  联网核对 6 个 ETF 的 PE 源是否还通
│   │   ├── smoke-dashboard.cjs          (4.6 KB)  载荷瘦身体积对比 + dashboard 契约冒烟
│   │   ├── consistency-audit.py         (3.9 KB)  跨文件手抄常量逐个比对
│   │   ├── verify-flow-sources.cjs      (3.1 KB)  定位"主力资金没有相关数据"（逐档打印 HTTP 状态）
│   │   ├── i18n-script-audit.py         (2.3 KB)  全部 .po msgstr 的混排字母表 / 重复字符普查
│   │   └── i18n-inert-keys.py           (2.2 KB)  各语言覆盖表里"EN 词表已不存在"的惰性条目
│   │
│   └── fonts-src/                                  字体母本（子集化的输入，不打包进应用）
│       ├── Noto-Sans-Regular.ttf      (13.5 MB)
│       ├── Noto-Sans-Medium.ttf       (13.5 MB)
│       ├── Zepp-OS-Number-Condensed.ttf      (27.4 KB)
│       ├── Zepp-OS-Number-Condensed-blod.ttf (22.9 KB)
│       ├── Zepp-OS-Number.ttf                (11.1 KB)
│       └── Zepp-OS-Number-blod.ttf           (10.1 KB)
│
├── docs/                                           文档与送审材料
│   ├── PROJECT_DOCS.md                 (68.4 KB)  项目文档合集（README / 架构 / 优化 / 加固 / 审计 / 设备 / 发布日志）
│   ├── project_structure_report.txt    (22.5 KB)  结构与文件说明维护报告（由 tools/structure-report.cjs 生成）
│   ├── ROUND_ADAPTATION.md             (14.6 KB)  双屏适配说明（方屏 390×450 + 圆屏 390×390）与回归证据
│   ├── 宽基指数行情_思维导图.md         (11.2 KB)  源码思维导图
│   ├── 送审材料.md                      (9.1 KB)  应用市场送审材料
│   ├── SHORTCUT_CARD.md                 (7.7 KB)  快捷卡片：官方规范对应关系与约束
│   ├── BUILD_VALIDATION.txt             (4.6 KB)  生产验证记录（门禁清单、构建产物、真机待验项）
│   └── TREE.md                                    本文件（完整目录树）
│
└── preview/                                        渲染产物（不打包进应用；构成 check:visual 的输入与证据）
    ├── index.html                                     方屏画册（20 屏，含 1 帧快捷卡片）
    ├── index-round.html                               圆屏画册（20 屏）
    ├── compare.html                                   方屏/圆屏对照画册（20 屏）
    ├── frames-s.json / frames-r.json                  帧数据（group / label / svg）
    ├── frames-s.sources.json / frames-r.sources.json  帧新鲜度签名（shape / digest / sources / at）
    ├── frames-s/                                      方屏 19 帧 SVG（01.svg … 19.svg）
    ├── frames-r/                                      圆屏 19 帧 SVG（01.svg … 19.svg）
    ├── card-s/card.svg                                方屏快捷卡片帧（366×225）
    ├── card-r/card.svg                                圆屏快捷卡片帧（366×195）
    ├── chart-frame.html / dayk-frame.html             行情图分时/日K 单帧复核
    ├── market-frame.html / pe-frame.html              市场温度 / PE 单帧复核
    ├── shares-frame.html                              份额单帧复核
    ├── sheet-s-1.html / sheet-s-2.html                方屏分屏对照单页
    ├── sheet-r-1.html / sheet-r-2.html                圆屏分屏对照单页
    └── shots/                                         截图归档（8 张 PNG）
        ├── all.png                       (285.9 KB)
        ├── check.png                      (87.3 KB)
        ├── home.png                       (64.2 KB)
        ├── shares.png                     (17.7 KB)
        ├── chart.png                      (15.7 KB)
        ├── market.png                     (12.5 KB)
        ├── dayk.png                       (12.2 KB)
        └── pe.png                         (12.1 KB)
```

---

## 布局约定（构建期生效，不是运行期分支）

| 关注点 | 声明位置 | 说明 |
| --- | --- | --- |
| 屏幕特征 | `app.json` → `targets.gt.platforms` | `[{"st":"r"},{"st":"s"}]`，构建期各打一份包 |
| 资源目录 | `assets/gt.r/` · `assets/gt.s/` | 目录名 = `<target 键>.<配置限定符>` |
| 页面版面 | `page/<page>/index.page.[pf].layout.js` | 只给设备像素量（原生 swiper 页高、画布宽） |
| 形状样式表 | `utils/shape.[pf].layout.js` | 排版用的设计单位几何；两份键集合必须一致（测试锁定） |
| 运行期形状判断 | 无 | 视图只读 `utils/constants.js` 暴露的 `SAFE_AREA` / `CONTENT` / `LAYOUT` |

## 维护入口

| 命令 | 作用 |
| --- | --- |
| `npm run check` | `check:tests`（18 项离线测试）+ `check:visual`（渲染 + 逐帧/卡片/字体校验） |
| `npm run docs:structure` | 重新生成 `docs/project_structure_report.txt` |
| `npm run render` / `render:round` / `render:compare` | 重出方屏 / 圆屏 / 对照画册 |
| `npm run i18n` | 重建 34 语言词条并重新子集化字体（顺序不可颠倒） |
| `zeus build` | 打包（`zeus` 是全局安装，不是项目依赖） |
