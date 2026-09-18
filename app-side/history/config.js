import { ETF_CATALOG } from '../domain/etf-catalog'

export const DB_VERSION = 2
export const RETENTION_DAYS = 132
export const DB_PREFIX = 'etfstudio.history132.v2.'
export const META_KEY = `${DB_PREFIX}meta`
export const SYNC_FRESH_MS = 30 * 60 * 1000

export const ETF_META = ETF_CATALOG.reduce((map, item) => {
  map[item.code] = { name: item.name, shortName: item.shortName, indexCode: item.indexCode }
  return map
}, {})
