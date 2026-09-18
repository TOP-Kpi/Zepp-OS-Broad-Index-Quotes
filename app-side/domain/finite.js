// 上游把"无数据"下发成好几种形态：东方财富部分接口给 '-'，另一些给 '--'，
// 还有空串。三者都必须归一到 null——否则 Number('-') 得到 NaN、Number('') 得到 0，
// 后者会伪装成真实读数（0 份额、0 涨跌）混进图表与信号评分。
//
// 这是 side service 唯一的数值归一实现：providers/modules/common.js 与
// history/value.js 都从这里再导出，新增取数模块请直接 import 本文件，
// 不要各自再写一份过滤字符集。
export function finite(value) {
  if (value === null || value === undefined || value === '' || value === '--' || value === '-') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
