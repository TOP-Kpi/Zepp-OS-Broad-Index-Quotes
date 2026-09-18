// 页面布局文件 · 圆形屏（st="r"）。
// 构建期由 zosLoader:./index.page.[pf].layout.js 解析：方屏目标取 .s.，圆屏目标取 .r.。
// 这里只给与屏幕像素有关的量（原生 swiper 页高、画布宽度都是设备像素）；
// 排版用的设计单位几何在 utils/shape.r.layout.js。
import { getDeviceInfo } from '@zos/device'
export var SHAPE = 'r'
export var DEVICE = getDeviceInfo()
export var SCREEN_WIDTH = DEVICE.width
export var SCREEN_HEIGHT = DEVICE.height
