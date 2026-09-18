import { COLORS, STORAGE_KEYS } from '../../utils/constants'
import { contains, createArray, isFiniteNumber, maxValue, minValue } from '../../utils/compat'
import { getValue } from '../../utils/storage'

export function readKlineCount() {
  var value = Number(getValue(STORAGE_KEYS.klineCount, '45'))
  return contains([30, 45, 60, 90], value) ? value : 45
}



function twoDigits(value) {
  var number = Math.max(0, Number(value || 0))
  return number < 10 ? '0' + String(number) : String(number)
}

function validTradingMinute(hour, minute) {
  return isFiniteNumber(hour) && isFiniteNumber(minute) &&
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function minuteOfDay(value) {
  var raw = String(value || '').trim()
  // Eastmoney commonly returns "YYYY-MM-DD HH:MM" and some sources append
  // seconds. Do not require HH:MM to be the final token.
  var matched = raw.match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (!matched) matched = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (matched) {
    var colonHour = Number(matched[1])
    var colonMinute = Number(matched[2])
    if (validTradingMinute(colonHour, colonMinute)) return colonHour * 60 + colonMinute
  }

  // Tencent and fallback sources can use HHMM, YYYYMMDDHHMM, or
  // YYYYMMDDHHMMSS. Read the clock portion from the right instead of using a
  // regex that can accidentally interpret the year as a time.
  var digits = raw.replace(/\D/g, '')
  var token = ''
  if (digits.length === 4) token = digits
  else if (digits.length >= 14) token = digits.slice(-6, -2)
  else if (digits.length >= 12) token = digits.slice(-4)
  if (token.length === 4) {
    var compactHour = Number(token.slice(0, 2))
    var compactMinute = Number(token.slice(2, 4))
    if (validTradingMinute(compactHour, compactMinute)) return compactHour * 60 + compactMinute
  }
  return null
}

function interpolateIntradaySession(values, start, end) {
  var previousIndex = -1
  var previousValue = null
  var index
  for (index = start; index <= end; index += 1) {
    var raw = values[index]
    if (raw === null || raw === undefined || !isFiniteNumber(Number(raw))) continue
    var currentValue = Number(raw)
    if (previousIndex >= start && index - previousIndex > 1) {
      var gap = index - previousIndex
      var fillIndex
      for (fillIndex = previousIndex + 1; fillIndex < index; fillIndex += 1) {
        var ratio = (fillIndex - previousIndex) / gap
        values[fillIndex] = previousValue + (currentValue - previousValue) * ratio
      }
    }
    previousIndex = index
    previousValue = currentValue
  }
  // Only extend to the requested session end. Callers deliberately pass the
  // latest real sample during live trading, so this never invents future ticks.
  if (previousIndex >= start && previousIndex < end && previousValue !== null) {
    for (index = previousIndex + 1; index <= end; index += 1) values[index] = previousValue
  }
}

export function prepareIntradaySeries(points) {
  var source = Array.isArray(points) ? points : []
  // Tonghuashun-style compressed axis: the lunch recess (11:30-13:00) is not
  // part of the time axis at all. Morning 09:30..11:30 fills slots 0..120 and
  // the afternoon 13:00..15:00 continues at slot 121..241, so no artificial
  // flat segment is drawn while the market is closed.
  var slotCount = 242
  var prices = createArray(slotCount, null)
  var averages = createArray(slotCount, null)
  var samples = []
  var index

  // Normalize first, then sort by trading time. This makes cumulative-average
  // fallback deterministic even when a provider returns rows out of order.
  for (index = 0; index < source.length; index += 1) {
    var item = source[index] || {}
    var price = Number(item.c !== undefined ? item.c : item.close)
    if (!isFiniteNumber(price) || price <= 0) continue
    var minute = minuteOfDay(item.time)
    if (!isFiniteNumber(minute)) continue
    var slot = -1
    if (minute >= 9 * 60 + 30 && minute <= 11 * 60 + 30) slot = minute - (9 * 60 + 30)
    else if (minute >= 13 * 60 && minute <= 15 * 60) slot = 121 + (minute - 13 * 60)
    if (slot < 0) continue
    samples.push({ slot: slot, price: price, avg: Number(item.avg) })
  }
  samples.sort(function (left, right) { return left.slot - right.slot })

  // Collapse duplicate timestamps so one minute contributes only once.
  var deduped = []
  for (index = 0; index < samples.length; index += 1) {
    var sample = samples[index]
    if (deduped.length && deduped[deduped.length - 1].slot === sample.slot) deduped[deduped.length - 1] = sample
    else deduped.push(sample)
  }

  var sum = 0
  var count = 0
  var first = null
  var last = null
  var lastClock = ''
  var lastIndex = -1
  var morningLast = -1
  var afternoonLast = -1
  var min = Infinity
  var max = -Infinity
  var priceMin = Infinity
  var priceMax = -Infinity

  for (index = 0; index < deduped.length; index += 1) {
    var current = deduped[index]
    sum += current.price
    count += 1
    var rawAverage = current.avg
    var average = isFiniteNumber(rawAverage) && rawAverage > 0 && rawAverage > current.price * 0.5 && rawAverage < current.price * 1.5
      ? rawAverage
      : sum / count

    prices[current.slot] = current.price
    averages[current.slot] = average
    if (first === null) first = current.price
    last = current.price
    var absoluteMinute = 9 * 60 + 30 + current.slot
    var clockHour = Math.floor(absoluteMinute / 60)
    var clockMinute = absoluteMinute % 60
    lastClock = twoDigits(clockHour) + ':' + twoDigits(clockMinute)
    lastIndex = current.slot
    if (current.slot <= 120) morningLast = current.slot
    else afternoonLast = current.slot
    if (current.price < min) min = current.price
    if (current.price > max) max = current.price
    if (current.price < priceMin) priceMin = current.price
    if (current.price > priceMax) priceMax = current.price
    if (average < min) min = average
    if (average > max) max = average
  }

  // A sparse provider (for example one point every 5 minutes) used to leave a
  // null between every pair of samples. drawSingleLineAt intentionally breaks
  // on null, so the whole price/average curve could disappear. Interpolate
  // only inside each trading session; the two sessions are adjacent on the
  // compressed axis and connect directly like Tonghuashun does.
  //
  // The sessions must also be bridged to each other. Slot 120 (11:30) and slot
  // 121 (13:00) are neighbours on the compressed axis, but the two calls below
  // interpolate disjoint ranges: when the afternoon's first sample is not
  // exactly 13:00, slot 121 had no sample and no fill, so it stayed null and
  // drawSingleLineAt broke the curve at the lunch boundary. Fill 121..first-1
  // from the morning close so the line is continuous across the break.
  var bridge = function (values, beforeSlot, firstAfternoon) {
    var anchor = values[beforeSlot]
    if (anchor === null || anchor === undefined || !isFiniteNumber(Number(anchor))) return
    var target = values[firstAfternoon]
    if (target === null || target === undefined || !isFiniteNumber(Number(target))) return
    var span = firstAfternoon - beforeSlot
    var fill
    for (fill = beforeSlot + 1; fill < firstAfternoon; fill += 1) {
      values[fill] = Number(anchor) + (Number(target) - Number(anchor)) * ((fill - beforeSlot) / span)
    }
  }
  if (morningLast >= 0) {
    var morningEnd = afternoonLast >= 121 ? 120 : morningLast
    interpolateIntradaySession(prices, 0, morningEnd)
    interpolateIntradaySession(averages, 0, morningEnd)
  }
  if (afternoonLast >= 121) {
    var firstAfternoon = -1
    var probe
    for (probe = 121; probe <= afternoonLast; probe += 1) {
      if (prices[probe] !== null && prices[probe] !== undefined) { firstAfternoon = probe; break }
    }
    if (firstAfternoon > 121) {
      bridge(prices, 120, firstAfternoon)
      bridge(averages, 120, firstAfternoon)
    }
    interpolateIntradaySession(prices, 121, afternoonLast)
    interpolateIntradaySession(averages, 121, afternoonLast)
  }

  if (min === Infinity || max === -Infinity) { min = 0; max = 1 }
  if (min === max) {
    var pad = Math.max(Math.abs(min) * 0.002, 0.005)
    min -= pad
    max += pad
  } else {
    var spanPad = (max - min) * 0.08
    min -= spanPad
    max += spanPad
  }
  return {
    prices: prices, averages: averages, first: first, last: last, lastClock: lastClock,
    lastIndex: lastIndex, sampleCount: deduped.length,
    priceMin: priceMin === Infinity ? first : priceMin,
    priceMax: priceMax === -Infinity ? last : priceMax,
    range: { min: min, max: max },
  }
}

export function cumulativeAverage(values) {
  var sum = 0
  return values.map(function (value, index) { sum += value; return sum / (index + 1) })
}

export function movingAverage(values, windowSize) {
  var result = createArray(values.length, null)
  var sum = 0
  var index
  for (index = 0; index < values.length; index += 1) {
    sum += Number(values[index] || 0)
    if (index >= windowSize) sum -= Number(values[index - windowSize] || 0)
    if (index >= windowSize - 1) result[index] = sum / windowSize
  }
  return result
}

export function prepareDayKSeries(points, limit) {
  var source = Array.isArray(points) ? points : []
  var maxVisible = Math.max(1, Number(limit || 45))
  var candles = []
  var ma5 = []
  var ma20 = []
  var sum5 = 0
  var sum20 = 0
  var index

  for (index = 0; index < source.length; index += 1) {
    var item = source[index]
    var candle = {
      o: Number(item && (item.o !== undefined ? item.o : item.open)),
      c: Number(item && (item.c !== undefined ? item.c : item.close)),
      h: Number(item && (item.h !== undefined ? item.h : item.high)),
      l: Number(item && (item.l !== undefined ? item.l : item.low)),
    }
    if (!isFiniteNumber(candle.o) || !isFiniteNumber(candle.c) || !isFiniteNumber(candle.h) || !isFiniteNumber(candle.l)) continue

    var cleanIndex = candles.length
    candles.push(candle)
    sum5 += candle.c
    sum20 += candle.c
    if (cleanIndex >= 5) sum5 -= candles[cleanIndex - 5].c
    if (cleanIndex >= 20) sum20 -= candles[cleanIndex - 20].c
    ma5.push(cleanIndex >= 4 ? sum5 / 5 : null)
    ma20.push(cleanIndex >= 19 ? sum20 / 20 : null)
  }

  var start = Math.max(0, candles.length - maxVisible)
  var visible = start > 0 ? candles.slice(start) : candles
  var visibleMa5 = start > 0 ? ma5.slice(start) : ma5
  var visibleMa20 = start > 0 ? ma20.slice(start) : ma20
  var min = Infinity
  var max = -Infinity
  for (index = 0; index < visible.length; index += 1) {
    if (visible[index].l < min) min = visible[index].l
    if (visible[index].h > max) max = visible[index].h
  }
  if (min === Infinity || max === -Infinity) { min = 0; max = 1 }
  if (min === max) { min -= 1; max += 1 }
  return { points: visible, ma5: visibleMa5, ma20: visibleMa20, range: { min: min, max: max } }
}

export function sharedRange(values) {
  var clean = (Array.isArray(values) ? values : []).map(Number).filter(isFiniteNumber)
  if (!clean.length) return { min: 0, max: 1 }
  var min = minValue(clean, 0)
  var max = maxValue(clean, 1)
  if (min === max) { min -= 1; max += 1 }
  return { min: min, max: max }
}

// The page state object is a module-level singleton: Zepp rebuilds the page on
// every navigation, but this object survives. After onDestroy it would keep
// holding every chart series, share/valuation array and flow bar for as long as
// the app stays in the background.
//
// Only the chart series are released. They are by far the biggest (240 intraday
// points ~19 KB plus their prepared derivatives, and 90 daily bars ~6.5 KB),
// while the PE, flow, share and margin series together stay under 8 KB and are
// what a returning visit actually shows: keeping them means 资金流/份额/融资/PE
// re-render from memory instead of showing an empty chart and re-requesting.
// The chart is the one page that already refreshes on its own (prefetch plus
// the 60s auto-refresh), so it is the cheapest to reload and the hungriest to
// keep.
export function releaseDetailStateData(state) {
  if (!state) return
  if (state.chart) {
    state.chart.points = []
    state.chart.intradayPoints = []
    state.chart.dayPoints = []
    state.chart.intradayPrepared = null
    state.chart.dayPrepared = null
    state.chart.intradayStamp = ''
    state.chart.dayStamp = ''
    // Empty series means "not yet loaded", not "no data". Mark it loading so a
    // same-code re-entry renders the busy state instead of a blank chart while
    // cache hydration repopulates the series.
    state.chart.loading = true
  }
  // flow / shares / margin / valuation deliberately retained — see above.
}

export function createDetailState() {
  return {
    code: '510300', name: '沪深300ETF', period: 'intraday', klineCount: 45,
    scenes: [], pageContainers: [], slowLoadTimers: [], visibleDataTimer: 0,
    quote: {
      price: '--', change: '--', changePct: '--', color: COLORS.muted,
      open: '--', high: '--', low: '--', previousClose: '--', average: '--',
      volume: '--', amount: '--', amplitude: '--', todayMain: '--', todayMainColor: COLORS.muted,
      source: '', updatedAt: '--',
    },
    chart: { points: [], intradayPoints: [], dayPoints: [], loading: false, updatedAt: '', intradayPrepared: null, dayPrepared: null, intradayStamp: '', dayStamp: '' },
    flow: { today: '--', todayColor: COLORS.muted, interval: '--', intervalColor: COLORS.muted, offMarket: '--', offMarketColor: COLORS.muted, bars: [] },
    shares: { values: [], closes: [], dates: [], latest: '--', change: '--', changeAmount: '--', changeColor: COLORS.muted, note: '' },
    margin: { bars: [], net: '--', netColor: COLORS.muted, balance: '--' },
    valuation: { values: [], indexValues: [], dates: [], currentPe: '--', currentPeValue: null, percentile: '--', percentileValue: null, p20: null, p80: null, maxPe: null, minPe: null, avgPe: null, currentIndex: null, indexCode: '', indexName: '', note: '' },
  }
}
