# ETFstudio 双屏版（V2）

> 手腕上的“指数仪表盘” —— 在 Amazfit 等搭载 Zepp OS 的手表上，直接查看宽基指数行情与 M1-M2 剪刀差。

![Zepp OS](https://img.shields.io/badge/Zepp%20OS-Compatible-00A6FF?style=flat-square)
![Zeus CLI](https://img.shields.io/badge/Zeus%20CLI-Build%20Ready-4CAF50?style=flat-square)
![i18n](https://img.shields.io/badge/i18n-34%20Languages-FF9800?style=flat-square)
![Dual Screen](https://img.shields.io/badge/Screen-Round%20%7C%20Square-9C27B0?style=flat-square)

## 项目定位

**ETFstudio 双屏版** 是一个面向 Zepp OS 手表的轻量行情应用。它的核心目标，是让用户在 Amazfit 等手表上直接查看宽基指数（如沪深300、中证500等 ETF 追踪的指数）的实时行情。

项目前身为 **ETFstudio**，当前 V2 版本也常被称为 **ETFstudio 双屏版**。

## 核心功能

### 指数行情展示

应用内包含：

- **首页**：快速查看核心指数行情
- **指数宇宙**：浏览更多宽基指数
- **详情页**：查看具体指数的报价与相关信息

### M1-M2 剪刀差快捷卡片

项目附带一个名为 **“M1-M2 剪刀差”** 的桌面快捷卡片（app-widget）。

该卡片会显示特定的经济指标：

1. 数据由手机端获取；
2. 写入手表本地快照；
3. 卡片随时读取本地快照；
4. 无需打开应用即可查看。

## 技术栈与开发方式

- **开发框架**：基于 Zepp OS 的轻量化开发框架
- **开发工具**：使用 Zeus CLI 进行开发、构建和预览

### 双屏适配方案

这是项目的一个技术亮点：

- 使用**同一套视图代码**；
- 在构建时根据屏幕形状进行分包；
- 通过 `app.json` 中的 `platforms` 字段区分：
  - 圆屏：`st: "r"`
  - 方屏：`st: "s"`
- 几何布局由 `zosLoader` 注入的形状样式表自动推导；
- 例如圆屏会按 **390×390 的内切圆弦宽** 来收窄内容。

### 国际化

- 应用全量接入 `getText` 多语言方案；
- 支持 **34 种系统语言**；
- 使用 **Noto Sans** 和 **Zepp OS Number** 设计字体。

## 快速开始

### 环境要求

- Node.js 推荐使用 LTS 版本
- Zeus CLI

### 安装 Zeus CLI

```bash
npm i -g @zeppos/zeus-cli
```

### 克隆项目

```bash
git clone https://github.com/<your-name>/<your-repo>.git
cd <your-repo>
npm install
```

### 开发预览

```bash
zeus dev
```

### 构建

```bash
zeus build
```

### 预览

```bash
zeus preview
```

## 项目结构示意

```text
.
├── app.json              # 应用配置，含 platforms 圆/方屏分包
├── app.js
├── page/
│   ├── home/             # 首页
│   ├── universe/         # 指数宇宙
│   └── detail/           # 详情页
├── widget/
│   └── m1-m2/            # M1-M2 剪刀差快捷卡片
├── i18n/                 # getText 多语言资源
├── assets/               # 字体与图标
└── utils/                # 数据、布局与工具
```

> 实际目录以仓库为准。

## 数据流：M1-M2 剪刀差卡片

```text
手机端获取数据
      │
      ▼
写入手表本地快照
      │
      ▼
app-widget 读取快照
      │
      ▼
桌面直接显示，无需打开应用
```

## 兼容设备

- Amazfit 等搭载 Zepp OS 的手表
- 圆屏设备
- 方屏设备

## 截图预览

| 首页 | 指数宇宙 | 详情页 | M1-M2 卡片 |
| --- | --- | --- | --- |
| <img width="507" height="585" alt="image" src="https://github.com/user-attachments/assets/8fe9c616-42ca-4491-892a-951c72af9ba6" />
 | <img width="505" height="586" alt="image" src="https://github.com/user-attachments/assets/3be0da3e-9bbc-4e54-82fb-1d64726338e8" />
 | <img width="503" height="581" alt="image" src="https://github.com/user-attachments/assets/035ab621-ffd4-4c28-8104-2ce89415be0d" />
 | <img width="450" height="277" alt="image" src="https://github.com/user-attachments/assets/eac27c74-7e6f-4822-af26-b9ee5345e8fc" />
 |

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 新建功能分支
3. 提交更改
4. 发起 Pull Request

## 许可证

请查看仓库中的 `LICENSE` 文件。

## 致谢

- Zepp OS / Zeus CLI
- Noto Sans
- Zepp OS Number
- ETFstudio 前身项目

---

> 行情数据仅供参考，不构成任何投资建议。
