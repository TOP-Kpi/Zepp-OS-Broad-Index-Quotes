// 上游把"无数据"下发成好几种形态：'-'、'--'、空串。三者都必须归一到 null，
// 否则 Number('-') 得到 NaN、Number('') 得到 0，后者会伪装成真实读数
// （0 涨跌、0 价格）混进排版。过滤字符集只在这里维护一处，改动会同时作用于
// 全部设备端格式化。
export function finite(value) {
  if (value === null || value === undefined || value === '' || value === '--' || value === '-') return null
  var number = Number(value)
  return isFinite(number) ? number : null
}
