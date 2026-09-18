# M1-M2 剪刀差快捷卡片（Shortcut Card / app-widget）

在负一屏（Negative Screen）上显示 A 股宏观流动性指标 **M1-M2 剪刀差**
（= M1 同比增长 − M2 同比增长，单位：百分点）。代码在 `app-widget/index.js`。

## 1. 官方规范对应关系

| 官方规定（zeppos-docs-main） | 本工程的实现 |
| --- | --- |
| 卡片目录 `app-widget/`，入口文件调一次 `AppWidget()`（reference/…/global/AppWidget.mdx） | `app-widget/index.js` 只调一次，声明 `onInit` / `build` / `onResume` / `onPause` / `onDestroy` |
| `app.json` 的 `module["app-widget"].widgets[]` 里登记 path / icon / name / runtime（reference/app-json.mdx） | 登记在 `targets.gt.module["app-widget"]`，`icon: "icon.png"`（两个形状的 `assets/gt.r|gt.s/icon.png` 都已存在） |
| 快捷卡片的名字配在**根 `i18n`** 里（与 SecondaryWidget 不同） | 34 种语言各自有 `i18n.<语言>["app-widget"].widgets[0].name` |
| 绘制区 = 卡片本身，尺寸由 `getAppWidgetSize()` 给出（guides/…/secondary-widget） | 布局全部由 `getAppWidgetSize()` 的 `w/h/radius` 推导，没有写死分辨率 |
| 坐标原点是卡片左上角，单位是**设备像素** | 卡片里一次 `px()` 都不用（`px()` 会按 designWidth 再缩放一次） |
| 高度只能由 `setAppWidgetSize()` 改，范围屏高 20%~60% | **故意不调用**，理由见第 4 节 |
| 不能用 GROUP / SCROLL_LIST / VIEW_CONTAINER 等滚动与层叠控件 | 整卡只有 1 个 CANVAS + 6 个 TEXT |
| 只响应点击，点击通常跳回主应用（`@zos/router` push） | 点击整卡 `push({ url: 'page/home/index.page' })` |
| 内容距卡片边缘 16px 安全边距；单卡最小高度 = 两行文字 120px（designs/customization/shortcut-cards） | `CONTENT_MARGIN = 16`、`MIN_CARD_HEIGHT = 120` 两个具名常量，所有内容由它们推导 |
| 一个应用最多 5 个 Widget/快捷卡片 | 当前 1 个 |
| 卡片拿不到蓝牙实时数据（guides/…/secondary-widget 的 caution） | 卡片只读本地快照，不发任何请求，见第 3 节 |

## 2. 卡片上有什么

内容按"一眼看清"排（设计规范要求卡片只放核心信息）：

```
┌───────────────────────────────────────┐
│ M1-M2 剪刀差                  2026-08 │  ← 标题 + 数据月份（靠右）
│ −3.4 pp                               │  ← 主角：剪刀差，按符号着色
│ M1 同比 4.1%      M2 同比 7.5%        │  ← 两端各自的同比
│        ╱╲    ╱╲___                    │  ← 近 13 个月走势 + 零轴
│ ___╱╲__╱  ╲__╱                        │
└───────────────────────────────────────┘
```

- 得数为正表示 M1 增速高于 M2（资金活化改善），为负表示资金淤积在定期端；
  着色沿用主工程的红涨绿跌惯例（`COLORS.positive` / `COLORS.negative`）。
- 走势图的纵轴**必须包含 0**：零轴是剪刀差最关键的一条参考线，只画数据区间会把
  正负号这个信息丢掉。
- 缺数据时显示 `--` 而不是 0：0 是"剪刀差为零"这个具体读数。

## 3. 数据链路（为什么卡片不自己取数）

```
东方财富宏观·货币供应量
        ↓  app-side/providers/modules/money-supply.js（手机端联网、6 小时缓存）
   request-router 的 'money-supply' method
        ↓  蓝牙
page/home/services/liquidity.js（首页辅助刷新，取到后写本地快照）
        ↓  localStorage: etfstudio.m1m2.v1（契约与校验在 utils/m1m2.js）
app-widget/index.js（卡片只读快照）
```

官方明确说明快捷卡片**拿不到蓝牙实时数据**，所以"取数"必须在页面侧完成、卡片只读缓存。
这条链路的任何一环断掉，卡片都会停在"数据不足"——`tests/app-widget.test.cjs` 把
"页面侧确实在写快照"也一起钉住了。

快照写入有个去重：月份、剪刀差、updatedAt 三者都没变就不写盘（首页每 60 秒自动刷新
都会走到这里，手表闪存写入次数有限）。

### 数据源字段映射（改动前务必先看这一段）

东财报表 `RPT_ECONOMY_CURRENCY_SUPPLY` 的字段名不含指标名，映射是靠该页面自身脚本
（`data.eastmoney.com/newstatic/js/cjsj/cn/hbgyl.js`）确认的：报表 `columns` 顺序与页面
表头 `货币和准货币(M2)` / `货币(M1)` / `流通中的现金(M0)` 逐一对应。

| JSON 字段 | 指标 |
| --- | --- |
| `BASIC_CURRENCY` / `_SAME` / `_SEQUENTIAL` | M2 余额（亿元）/ 同比增长(%) / 环比增长(%) |
| `CURRENCY` / `_SAME` / `_SEQUENTIAL` | M1 余额 / 同比 / 环比 |
| `FREE_CASH` / `_SAME` / `_SEQUENTIAL` | M0 余额 / 同比 / 环比 |

**剪刀差 = `CURRENCY_SAME` − `BASIC_CURRENCY_SAME`。**
把 M1 与 M2 认错会得到一个符号相反、看上去仍然"合理"的剪刀差，所以
`tests/m1m2.test.cjs` 用真实抓取的响应行把映射钉死了（还顺带断言 M0 < M1 < M2 的量级自洽）。

## 4. 两个刻意的取舍

**不调用 `setAppWidgetSize()`。** 官方文档说 `getAppWidgetSize()` 返回的是"系统默认卡片
尺寸"，设过高度之后它是否立刻返回新值没有明确规定。一旦两者不一致，按返回值排的版就会
与实际卡片高度错位（内容悬空或图表被切）。改为完全按 `getAppWidgetSize()` 的返回值排布：
卡片多高就画多高，高度不足时先让出图表、文字仍完整。

**不配 `preview` 预览图。** 官方 `app.json` 示例里 `preview` 只出现在 `secondary-widget`
（Widget）上，`app-widget` 示例没有它；设计规范里"长按进入编辑态需要静态预览图"那一条
也写在 Widget 章节。所以这里与官方示例保持一致不配预览图。若上架时平台要求补，再按
"尺寸 = 屏幕分辨率"补 `preview.png`。

## 5. 验证方式

```bash
npm run test:app-widget   # 卡片规范约束：注册字段、可用控件、16px 边距、只读快照、点击目标
npm run test:m1m2         # 剪刀差契约 + 数据源字段映射（含真实响应样本）
npm run render            # 方屏 20 帧（含卡片）-> preview/index.html
npm run render:round      # 圆屏 20 帧（含卡片）-> preview/index-round.html
npm run verify:card       # 卡片版面：圆角背景、内容不出卡、16px 边距、走势图存在、文字不重叠
npm run render:compare    # 方屏/圆屏并排（含卡片）-> preview/compare.html
npm run check             # 以上全部（check:visual 已含 verify:card）
zeus build                # 12 个包，各含 app-widget/index.bin（约 11 KB）
```

卡片帧单独落在 `preview/card-<形状>/card.svg`，**不混进** `preview/frames-<形状>/`
——页面帧的硬闸门是"圆内 / 内容带 / 不叠字"，而卡片是圆角矩形、绘制区就是卡片本身，
混在一起会让它对卡片误报。

`tools/verify-card.cjs` 的判据做过反向测试：故意把文字挪出边距、删掉折线、只留矩形背景，
三种注入缺陷都被抓出来并 exit 1，不是"永远通过"的空闸门。

### 仍需真机确认

- 卡片在负一屏里的实际高度与圆角（`getAppWidgetSize()` 的返回值在真机上才知道），
  以及内容在最小档圆屏（360×360）上是否够看。
- 点击整卡跳回应用的响应与系统对手势的接管（卡片只收点击事件）。
- 中文以外的语言：卡片标签在 zh-CN / zh-TW / ja-JP / es-ES 四种语言有专门译文，
  其余 30 种回落到英文短式（`M1 YoY` / `pp`），与主工程 130 余条词条的既有回落策略一致。
  卡片空间小，长译文本来也会被省略号截断，所以短式是刻意的选择。
