// 页面布局文件 · 方形屏（st="s"）。
// 构建期由 zosLoader:./index.page.[pf].layout.js 解析：方屏目标取 .s.，圆屏目标取 .r.。
// 这里只给"设备像素"层面的量（原生 swiper 页高、画布宽度）；排版用的
// 设计单位几何在 utils/shape.s.layout.js。
import { getDeviceInfo } from '@zos/device';
export var SHAPE = 's'
export var DEVICE = getDeviceInfo()
export var SCREEN_WIDTH = DEVICE.width;
export var SCREEN_HEIGHT = DEVICE.height;
