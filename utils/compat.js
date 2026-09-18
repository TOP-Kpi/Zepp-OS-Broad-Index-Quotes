// Device-runtime compatibility helpers.
// Style convention (whole utils layer): 2-space indent, no semicolons,
// ES5 var functions, single quotes — QuickJS-friendly, one voice everywhere.
export function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value)
}

export function contains(list, value) {
  return Array.isArray(list) && list.indexOf(value) >= 0
}

export function createArray(length, factory) {
  var size = Math.max(0, Number(length || 0))
  var result = new Array(size)
  var index
  for (index = 0; index < size; index += 1) {
    result[index] = typeof factory === 'function' ? factory(index) : factory
  }
  return result
}

export function findFirst(list, predicate) {
  if (!Array.isArray(list) || typeof predicate !== 'function') return undefined
  var index
  for (index = 0; index < list.length; index += 1) {
    if (predicate(list[index], index)) return list[index]
  }
  return undefined
}

export function copyOwn(target, source) {
  if (!target || !source) return target
  var key
  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key]
  }
  return target
}

export function minValue(values, fallback) {
  if (!Array.isArray(values) || !values.length) return fallback
  var min = Number(values[0])
  var index
  for (index = 1; index < values.length; index += 1) {
    if (Number(values[index]) < min) min = Number(values[index])
  }
  return min
}

export function maxValue(values, fallback) {
  if (!Array.isArray(values) || !values.length) return fallback
  var max = Number(values[0])
  var index
  for (index = 1; index < values.length; index += 1) {
    if (Number(values[index]) > max) max = Number(values[index])
  }
  return max
}
