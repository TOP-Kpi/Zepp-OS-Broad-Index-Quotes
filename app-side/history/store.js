import { settingsLib } from '@zeppos/zml/base-side'
import { DB_PREFIX, DB_VERSION, ETF_META, META_KEY, RETENTION_DAYS, SYNC_FRESH_MS } from './config'

function parseStored(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch (_) { return fallback }
}

function readStored(key, fallback) {
  try { return parseStored(settingsLib.getItem(key), fallback) } catch (_) { return fallback }
}

function writeStored(key, value) {
  try { settingsLib.setItem(key, JSON.stringify(value)); return true } catch (_) { return false }
}

function recordKey(code) { return `${DB_PREFIX}${String(code)}` }

// 已从 ETF_META 移除的标的历史库会永久滞留在设置存储中，启动时按已知代码清扫一次。
// 一并清掉对应的 6 个月份额缓存（shares-cache 前缀），避免 ~50KB 级别的死数据滞留。
const REMOVED_CODES = ['510050', '510180', '159516']
// 与 app-side/shares-cache.js 的 CACHE_PREFIX 是同一串字面量的第二份（那边是缓存的
// 读写键）。这里故意写死而不是 import：本清扫要清掉的是"这些代码被下线时那一版"
// 的缓存，跟着对方的版本号走反而会漏掉历史遗留。但两处必须一起看——对方升版时
// 要确认这一份是否仍需指向旧版前缀，见 shares-cache.js 的对应注释。
const SHARES_CACHE_PREFIX = 'etfstudio.shares6m.v3.'
function sweepRemovedCodes() {
  REMOVED_CODES.forEach((code) => {
    try { settingsLib.removeItem(recordKey(code)) } catch (_) { }
    try { settingsLib.removeItem(SHARES_CACHE_PREFIX + code) } catch (_) { }
  })
}
sweepRemovedCodes()

function emptyStore(code) {
  const meta = ETF_META[String(code)] || {}
  return {
    version: DB_VERSION, code: String(code), name: meta.name || String(code), shortName: meta.shortName || String(code),
    retentionDays: RETENTION_DAYS, updatedAt: '', records: [],
  }
}

function sanitizeRecords(records) {
  const source = Array.isArray(records) ? records : []
  const clean = []
  for (let index = Math.max(0, source.length - RETENTION_DAYS); index < source.length; index += 1) {
    const record = source[index]
    if (!record || !record.date || !record.quote) continue
    clean.push(record)
  }
  return clean
}

export function getHistoryStore(code) {
  const stored = readStored(recordKey(code), null)
  if (!stored || Number(stored.version) !== DB_VERSION || !Array.isArray(stored.records)) return emptyStore(code)
  stored.records = sanitizeRecords(stored.records)
  return stored
}

export function writeHistoryStore(code, store) {
  const safeStore = { ...store, version: DB_VERSION, code: String(code), retentionDays: RETENTION_DAYS, records: sanitizeRecords(store && store.records) }
  const ok = writeStored(recordKey(code), safeStore)
  invalidateHistoryStatusMemo()
  return ok
}

export function getHistoryRecords(code, limit = RETENTION_DAYS) {
  const size = Math.max(1, Math.min(RETENTION_DAYS, Number(limit || RETENTION_DAYS)))
  const records = getHistoryStore(code).records || []
  return records.slice(Math.max(0, records.length - size))
}

// dashboard 每次请求都会读取状态做展示投影；不缓存的话要对 6 只各做一次
// settingsLib.getItem + 整库 JSON.parse。写入时失效，读路径 30 秒 memo。
let statusMemo = null
export function invalidateHistoryStatusMemo() { statusMemo = null }

export function getHistoryDatabaseStatus() {
  if (statusMemo && Date.now() - statusMemo.at < 30 * 1000) return statusMemo.value
  const value = readHistoryDatabaseStatusUncached()
  statusMemo = { at: Date.now(), value }
  return value
}

function readHistoryDatabaseStatusUncached() {
  const meta = readStored(META_KEY, null) || {}
  const codes = Object.keys(ETF_META)
  let totalRecords = 0
  let readyCodes = 0
  let minRecords = RETENTION_DAYS
  let maxRecords = 0
  let earliest = ''
  let latest = ''

  codes.forEach((code) => {
    const store = getHistoryStore(code)
    const count = Array.isArray(store.records) ? store.records.length : 0
    totalRecords += count
    if (count > 0) readyCodes += 1
    minRecords = Math.min(minRecords, count)
    maxRecords = Math.max(maxRecords, count)
    if (count) {
      const first = store.records[0].date || ''
      const last = store.records[count - 1].date || ''
      if (first && (!earliest || first < earliest)) earliest = first
      if (last && last > latest) latest = last
    }
  })
  if (!readyCodes) minRecords = 0
  return {
    version: DB_VERSION, retentionDays: RETENTION_DAYS, codeCount: codes.length, readyCodes, totalRecords, minRecords, maxRecords,
    earliest, latest, lastSyncAt: meta.lastSyncAt || '', lastSyncMs: Number(meta.lastSyncMs || 0), lastError: meta.lastError || '',
    complete: readyCodes === codes.length && minRecords >= RETENTION_DAYS,
  }
}

export function writeHistoryMeta(meta) {
  invalidateHistoryStatusMemo()
  return writeStored(META_KEY, meta)
}

export function shouldSyncHistoryDatabase(force = false) {
  if (force) return true
  const status = getHistoryDatabaseStatus()
  if (!status.complete || !status.lastSyncMs) return true
  return Date.now() - status.lastSyncMs >= SYNC_FRESH_MS
}
