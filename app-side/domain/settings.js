import { settingsLib } from '@zeppos/zml/base-side'
import { getHistoryDatabaseStatus } from '../history-db'
import { ETF_META } from '../history/config'

export function readSetting(key, fallback = '') {
  let value
  try { value = settingsLib.getItem(key) } catch (_) { value = fallback }
  return value === undefined || value === null || value === '' ? fallback : value
}

export function readBoolSetting(key, fallback = false) {
  const value = readSetting(key, fallback)
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1' || value === 1) return true
  if (value === 'false' || value === '0' || value === 0) return false
  return fallback
}

export function readNumberSetting(key, fallback = 0) {
  const number = Number(readSetting(key, fallback))
  return Number.isFinite(number) ? number : fallback
}

export function readAppSettings() {
  // The settings page offers a fixed list, but the store may still hold an
  // arbitrary string from an older install; never forward an unknown code.
  const rawPrimary = String(readSetting('display.primaryCode', '510300'))
  const primaryCode = Object.prototype.hasOwnProperty.call(ETF_META, rawPrimary) ? rawPrimary : '510300'
  // 蓝牙瘦身：设备端只读 readyCodes/codeCount/minRecords 三个字段，
  // 其余 9 个状态字段不再随每次 dashboard 过蓝牙。
  const status = getHistoryDatabaseStatus()
  return {
    alertsEnabled: readBoolSetting('alerts.enabled', true),
    primaryCode,
    buyScore: readNumberSetting('threshold.buyScore', 75),
    valuationPercentile: readNumberSetting('threshold.valuationPercentile', 20),
    refreshSeconds: 60,
    dataMode: '手机直连',
    dataSource: '东方财富批量行情 + 腾讯回退',
    webRequired: false,
    historyDatabase: { readyCodes: status.readyCodes, codeCount: status.codeCount, minRecords: status.minRecords },
  }
}
