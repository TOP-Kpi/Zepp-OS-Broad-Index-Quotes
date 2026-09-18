// 标的字典单源（app-side 侧）。portfolio / history / providers 的标的映射全部
// 从这里派生，禁止再各写一份字面量。设备端 utils/constants.js 与
// setting/index.js 因打包边界各持显示用副本，增删标的时须同步（全局搜索
// 510300 定位全部副本）。
export const ETF_CATALOG = [
  { code: '510300', name: '沪深300ETF', shortName: '沪深300', indexCode: '000300', secid: '1.510300', indexSymbol: 'sh.000300', xqSymbol: 'SH000300' },
  { code: '510500', name: '中证500ETF', shortName: '中证500', indexCode: '000905', secid: '1.510500', indexSymbol: 'sh.000905', xqSymbol: 'SH000905' },
  { code: '512100', name: '中证1000ETF', shortName: '中证1000', indexCode: '000852', secid: '1.512100', indexSymbol: 'sh.000852', xqSymbol: 'SH000852' },
  { code: '515180', name: '中证红利ETF', shortName: '中证红利', indexCode: '000922', secid: '1.515180', indexSymbol: 'sh.000922', xqSymbol: 'SH000922' },
  { code: '159915', name: '创业板ETF', shortName: '创业板指', indexCode: '399006', secid: '0.159915', indexSymbol: 'sz.399006', xqSymbol: 'SZ399006' },
  { code: '588000', name: '科创50ETF', shortName: '科创50', indexCode: '000688', secid: '1.588000', indexSymbol: 'sh.000688', xqSymbol: 'SH000688' },
]

export const ETF_CATALOG_BY_CODE = ETF_CATALOG.reduce((map, item) => {
  map[item.code] = item
  return map
}, {})
