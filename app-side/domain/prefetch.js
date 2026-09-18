import { ETF_CATALOG_BY_CODE } from './etf-catalog'

// 预加载只取“长 TTL + 高成本”的三路重源：
//   valuation 6h   最贵（乐咕/雪球协议 + 指数月线），首波联网后全天秒回
//   shares  30min  历史6月键命中时稳态仅剩 1 路日K + 本地合并
//   margin  5min   详情页融资 60 点键（overview 内部用的是 :5 键，互不覆盖）
// 短 TTL 键（quote 8s / intraday 10s / overview 12s / flow 20s / dayK 30s）
// 不预取：它们必然赶不上下一次 60s 手表轮询就过期，预取纯属白耗射频与
// transport 96 键 LRU 配额；实时报价按新鲜度契约就该现取现用。
// 所有调用走 provider 原 cached() 通道，成功后自动入缓存，TTL 内重复调用零成本。
const CODE_TASKS = [
  { name: 'valuation', fn: (provider, code) => provider.valuation(code) },
  { name: 'shares', fn: (provider, code) => provider.shares(code) },
  { name: 'margin', fn: (provider, code) => provider.margin(code, 60) },
]

const PREFETCH_COOLDOWN_MS = 60 * 1000           // 交易时段两波最短间隔 60s
const PREFETCH_IDLE_DELAY_MS = 25 * 1000         // 请求空闲后延迟 25s
const PREFETCH_QUIET_MS = 12 * 1000              // 再次确认静默 12s
const NON_TRADING_COOLDOWN_MS = 30 * 60 * 1000   // 非交易时段 30min
const WAVE_DEADLINE_MS = 180 * 1000              // 单波硬死线：首波估值源最慢也不能无限拖住射频

export function schedulePrefetch(service) {
  if (service.serviceAlive === false) return
  if (service.prefetchRunning) return
  if (service.historySyncPromise) return  // 历史库同步优先
  const cooldown = isTradingHours() ? PREFETCH_COOLDOWN_MS : NON_TRADING_COOLDOWN_MS
  if (Date.now() - (service.lastPrefetchAt || 0) < cooldown) return
  if (service.prefetchTimer) clearTimeout(service.prefetchTimer)
  service.prefetchTimer = setTimeout(() => {
    service.prefetchTimer = null
    const quietFor = Date.now() - (service.lastRequestAt || 0)
    if (Number(service.activeRequestCount || 0) > 0 || quietFor < PREFETCH_QUIET_MS) {
      schedulePrefetch(service)  // 不空闲则重新调度
      return
    }
    prefetchAll(service).catch(() => {})
  }, PREFETCH_IDLE_DELAY_MS)
}

// 标的间串行、标的内任务顺序执行：任一时刻至多 1 路 provider 在途，
// 与前台手表请求共享 transport 缓存而不叠加并发峰值。
async function prefetchAll(service) {
  service.prefetchRunning = true
  const waveStartedAt = Date.now()
  try {
    const codes = Object.keys(ETF_CATALOG_BY_CODE)
    outer:
    for (let index = 0; index < codes.length; index += 1) {
      for (let taskIndex = 0; taskIndex < CODE_TASKS.length; taskIndex += 1) {
        if (shouldAbortWave(service, waveStartedAt)) break outer
        await prefetchOne(service, CODE_TASKS[taskIndex], codes[index])
      }
    }
  } finally {
    service.prefetchRunning = false
    service.lastPrefetchAt = Date.now()
  }
}

function shouldAbortWave(service, waveStartedAt) {
  if (service.serviceAlive === false) return true
  if (Number(service.activeRequestCount || 0) > 0) return true  // 前台请求随到随断，余量丢弃
  if (service.historySyncPromise) return true
  return Date.now() - waveStartedAt >= WAVE_DEADLINE_MS
}

async function prefetchOne(service, task, code) {
  if (service.serviceAlive === false) return
  if (Number(service.activeRequestCount || 0) > 0) return  // 前台请求优先
  try {
    await task.fn(service.provider, code)  // transport.cached 在 loader 成功后自动入缓存
  } catch (_) {}  // 静默失败，不影响任何现有功能
}

function isTradingHours() {
  // 锚定北京时间（UTC+8）而非手机本地时区：用户出境后手机时区偏移不再让
  // 冷却节奏错位；周末 A 股无行情，按非交易时段降频，避免 60s 一波白耗射频。
  const now = new Date()
  const beijing = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000)
  const weekday = beijing.getDay()
  if (weekday === 0 || weekday === 6) return false
  const time = beijing.getHours() * 100 + beijing.getMinutes()
  return time >= 915 && time <= 1505  // 9:15 - 15:05
}
