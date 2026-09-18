export const DIRECT_CONFIG = {
  mode: 'mobile-direct',
  quoteBase: 'https://push2.eastmoney.com',
  historyBase: 'https://push2his.eastmoney.com',
  delayBase: 'https://push2delay.eastmoney.com',
  dataCenterBase: 'https://datacenter-web.eastmoney.com',
  xueqiuBase: 'https://stock.xueqiu.com',
  xueqiuWebBase: 'https://xueqiu.com',
  timeoutMs: 12000,
  quoteCacheMs: 8000,
  overviewCacheMs: 12000,
  historyCacheMs: 30000,
  marginCacheMs: 300000,
  valuationCacheMs: 6 * 60 * 60 * 1000,
  shareHistoryCacheMs: 30 * 60 * 1000,
  // M1/M2 是月频宏观数据（每月中旬公布上月值），6 小时足够避免重复抓取，
  // 又不至于整天看不到修订值。
  moneySupplyCacheMs: 6 * 60 * 60 * 1000,
}
