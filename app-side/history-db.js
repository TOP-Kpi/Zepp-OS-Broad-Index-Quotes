// Compatibility facade. History persistence, record construction, syncing and
// fallback adaptation are separated so each module owns one concern.
export {
  getHistoryStore,
  getHistoryRecords,
  getHistoryDatabaseStatus,
  shouldSyncHistoryDatabase,
} from './history/store'
export { syncHistoryDatabase } from './history/sync'
export {
  historyRecordsAsDayChart,
  historyRecordsAsFlow,
  historyRecordsAsShares,
  historyRecordsAsMargin,
  historyLatestOverview,
} from './history/fallback'
