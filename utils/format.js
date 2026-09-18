import { isFiniteNumber } from './compat'
import { finite as finiteNumber } from './finite'

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch (_) {
    // A malformed % sequence must not crash page construction; fall back to
    // the raw text so at least the recognisable part survives.
    return value
  }
}

export function parseParams(params) {
  if (!params) return {}
  if (typeof params === 'object') return params
  try {
    return JSON.parse(params)
  } catch (_) {
    var result = {}
    var pairs = String(params).split('&')
    var index
    for (index = 0; index < pairs.length; index += 1) {
      var pair = pairs[index]
      var separator = pair.indexOf('=')
      var rawKey = separator >= 0 ? pair.slice(0, separator) : pair
      var rawValue = separator >= 0 ? pair.slice(separator + 1) : ''
      if (rawKey) result[safeDecode(rawKey)] = safeDecode(rawValue)
    }
    return result
  }
}

export function fixed(value, digits, fallback) {
  var digitCount = digits === undefined ? 2 : digits
  var fallbackText = fallback === undefined ? '--' : fallback
  var number = finiteNumber(value)
  return number === null ? fallbackText : number.toFixed(digitCount)
}

export function signed(value, digits, suffix) {
  var digitCount = digits === undefined ? 2 : digits
  var suffixText = suffix === undefined ? '' : suffix
  var number = finiteNumber(value)
  if (number === null) return '--'
  return [number > 0 ? '+' : '', number.toFixed(digitCount), suffixText].join('')
}

export function compactMoney(value) {
  var number = finiteNumber(value)
  if (number === null) return '--'
  var absolute = Math.abs(number)
  if (absolute >= 100000000) return [(number / 100000000).toFixed(2), '亿'].join('')
  if (absolute >= 10000) return [(number / 10000).toFixed(1), '万'].join('')
  return number.toFixed(0)
}

export function signColor(value, colors) {
  var number = finiteNumber(value)
  if (number === null || number === 0) return colors.text
  return number > 0 ? colors.positive : colors.negative
}

export function latest(array) {
  return Array.isArray(array) && array.length ? array[array.length - 1] : null
}

export function clamp(value, min, max) {
  var number = Number(value)
  if (!isFiniteNumber(number)) return min
  return Math.min(max, Math.max(min, number))
}

export function shortDateTime(value) {
  if (!value) return '--'
  var text = String(value)
  return text.length > 16 ? text.slice(5, 16) : text
}

