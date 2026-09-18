import { DB_VERSION, ETF_META, RETENTION_DAYS } from './config'
import { buildDailyRecords } from './record-builder'
import {
  getHistoryDatabaseStatus,
  getHistoryStore,
  shouldSyncHistoryDatabase,
  writeHistoryMeta,
  writeHistoryStore,
} from './store'

function preserveAuxiliaryData(records, previousStore) {
  const previousByDate = {}
  ;(previousStore.records || []).forEach((record) => {
    if (record && record.date) previousByDate[record.date] = record
  })
  return records.map((record) => {
    const previous = previousByDate[record.date] || {}
    return {
      ...record,
      flow: record.flow || previous.flow || null,
      shares: record.shares || previous.shares || null,
      margin: record.margin || previous.margin || null,
      signal: record.signal || previous.signal || null,
    }
  })
}


async function waitForForegroundQuiet(options) {
  if (!options || typeof options.shouldPause !== 'function') return true
  let waits = 0
  while (options.shouldPause()) {
    if (typeof options.shouldStop === 'function' && options.shouldStop()) return false
    await new Promise((resolve) => setTimeout(resolve, 500))
    waits += 1
    // Foreground interactions always win. After 30 seconds of continuous
    // activity, abort this background sync turn instead of starting a heavy
    // multi-source request while the user is still operating the watch.
    if (waits >= 60) return false
  }
  return !(typeof options.shouldStop === 'function' && options.shouldStop())
}

// Background sync used to fan all six sources out at once per code. Every
// in-flight response body stays resident until it settles, so a single code
// could hold six full payloads (plus the nested share/valuation sub-requests)
// at the same time — the largest transient spike in the Side Service, and it
// landed while the watch was already holding page caches. Running the same
// calls in small bounded batches keeps results identical while cutting the
// peak, and it also reduces radio contention with foreground requests.
const SYNC_REQUEST_CONCURRENCY = 3

async function runBounded(tasks, concurrency) {
  const limit = Math.max(1, Number(concurrency || SYNC_REQUEST_CONCURRENCY))
  const results = new Array(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const index = next
      next += 1
      results[index] = await tasks[index]()
    }
  }

  const workers = []
  for (let index = 0; index < Math.min(limit, tasks.length); index += 1) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

async function syncOne(provider, code, signalResolver) {
  const tasks = [
    () => provider.chart(code, 'day'),
    () => provider.flow(code).catch(() => ({ code, intervals: [], source: '' })),
    () => provider.shares(code).catch(() => ({ code, points: [], source: '' })),
    () => provider.margin(code, RETENTION_DAYS).catch(() => ({ code, points: [], source: '' })),
    () => provider.quote(code).catch(() => null),
    () => (signalResolver ? signalResolver(code).catch(() => null) : Promise.resolve(null)),
  ]
  const [daily, flow, shares, margin, liveQuote, latestSignal] = await runBounded(tasks, SYNC_REQUEST_CONCURRENCY)

  let records = buildDailyRecords(code, daily, flow, shares, margin, liveQuote, latestSignal)
  if (!records.length) throw new Error(`${code} 日线数据为空`)
  records = preserveAuxiliaryData(records, getHistoryStore(code))

  const meta = ETF_META[code] || {}
  const store = {
    version: DB_VERSION,
    code,
    name: meta.name || code,
    shortName: meta.shortName || code,
    retentionDays: RETENTION_DAYS,
    updatedAt: new Date().toISOString(),
    records,
  }
  writeHistoryStore(code, store)
  return store
}

export async function syncHistoryDatabase(provider, signalResolver = null, options = {}) {
  const force = options.force === true
  if (!shouldSyncHistoryDatabase(force)) return getHistoryDatabaseStatus()
  const codes = Object.keys(ETF_META)
  const errors = []
  let interrupted = false

  for (let index = 0; index < codes.length; index += 1) {
    if (!(await waitForForegroundQuiet(options))) { interrupted = true; break }
    const code = codes[index]
    try {
      await syncOne(provider, code, signalResolver)
    } catch (error) {
      errors.push(`${code}:${error && error.message ? error.message : String(error)}`)
    }
  }

  // Do not mark an interrupted cycle as fresh. The idle scheduler can resume
  // later, while already-written per-code stores remain valid.
  if (!interrupted) {
    writeHistoryMeta({
      version: DB_VERSION,
      lastSyncAt: new Date().toISOString(),
      lastSyncMs: Date.now(),
      lastError: errors.join(' | '),
    })
  }
  return getHistoryDatabaseStatus()
}
