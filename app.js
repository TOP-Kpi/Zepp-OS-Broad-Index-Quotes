import { BaseApp } from '@zeppos/zml/base-app'

// 应用级入口只负责注册 BaseApp：设备端没有跨页面的应用级状态，也没有
// 应用级初始化工作——业务逻辑全部在 app-side/（手机侧）与 page/（手表侧各页），
// 每个页面自己管自己的生命周期（见各 index.page.js 的 onInit/onDestroy）。
// 这里刻意留空，不是漏了实现。
App(BaseApp({
  onCreate: function () {},
  onDestroy: function () {},
}))
