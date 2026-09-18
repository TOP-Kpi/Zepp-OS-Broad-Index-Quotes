import { copyOwn } from './compat'
import { isRuntimeAlive, runtimeGeneration, staleRuntimeError, recordRuntimeError } from './runtime'
import { cacheKey, loadCache, saveCache } from './storage'

var NETWORK_GAP_MS = 55 * 1000
var DEFAULT_REQUEST_TIMEOUT_MS = 14000
var networkSuccessAt = {}
var networkSuccessOrder = []
// Success timestamps are keyed by method+params and live for the whole app
// session. Without a cap the map grows for every distinct request the user
// ever triggers, one entry per page visit pattern.
var MAX_NETWORK_SUCCESS_KEYS = 64

function rememberNetworkSuccess(key) {
  var index = networkSuccessOrder.indexOf(key)
  if (index >= 0) networkSuccessOrder.splice(index, 1)
  networkSuccessOrder.push(key)
  networkSuccessAt[key] = Date.now()
  while (networkSuccessOrder.length > MAX_NETWORK_SUCCESS_KEYS) {
    var oldest = networkSuccessOrder.shift()
    if (oldest) delete networkSuccessAt[oldest]
  }
}

function requestWithTimeout(context, payload, timeoutMs) {
  var timeout = Math.max(3000, Number(timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS))
  return new Promise(function (resolve, reject) {
    var settled = false
    var timer = setTimeout(function () {
      if (settled) return
      settled = true
      var error = new Error('手机数据请求超时')
      error.code = 'ETF_REQUEST_TIMEOUT'
      reject(error)
    }, timeout)
    var request
    try {
      request = context.request(payload)
    } catch (error) {
      clearTimeout(timer)
      settled = true
      reject(error)
      return
    }
    Promise.resolve(request).then(function (value) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }, function (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

function guardRuntime(context, generation, value) {
  if (context && context.state && !isRuntimeAlive(context, generation)) throw staleRuntimeError()
  return value
}

// 各 loadXxx 的 requestWithCache 选项统一由这里拼装。历史上同一份契约有两种
// 调用风格——universe 收裸布尔 cacheOnly，其余服务收 { cacheOnly: true }——
// 合并/重构时是踩雷点，现在只有这一处产出选项对象。
export function requestOptions(forceNetwork, options) {
  var source = options || {}
  return { forceNetwork: forceNetwork === true, cacheOnly: source.cacheOnly === true }
}

export function requestWithCache(context, method, params, options) {
  if (params === void 0) params = {}
  if (options === void 0) options = {}
  var allowExpired = options.allowExpired !== false
  var cacheOnly = options.cacheOnly === true
  var forceNetwork = options.forceNetwork === true
  var preferCache = options.preferCache !== false
  var key = cacheKey(method, params)
  var state = context && context.state
  var generation = state ? runtimeGeneration(context) : null

  if (state && state.runtimeAlive === false) {
    return Promise.reject(staleRuntimeError())
  }

  // The first-frame hydration path is strictly local: it neither starts nor
  // joins a pending BLE request. Only an unexpired cache entry is eligible.
  if (cacheOnly) {
    var onlyCached = loadCache(method, params, false)
    if (onlyCached) {
      try { guardRuntime(context, generation, onlyCached) } catch (error) { return Promise.reject(error) }
      var hydrated = copyOwn({}, onlyCached)
      hydrated.cached = true
      hydrated.instant = true
      return Promise.resolve(hydrated)
    }
    var cacheError = new Error('未找到未过期本地缓存')
    cacheError.code = 'ETF_CACHE_MISS'
    cacheError.cacheMiss = true
    return Promise.reject(cacheError)
  }

  if (!context || typeof context.request !== 'function') {
    return Promise.reject(new Error('页面请求通道不可用'))
  }
  if (state) {
    if (!state.pendingRequests) state.pendingRequests = {}
    if (state.pendingRequests[key]) return state.pendingRequests[key]
  }

  // Avoid an immediate duplicate BLE/Side-Service round-trip after a success.
  if (forceNetwork) {
    var lastSuccess = Number(networkSuccessAt[key] || 0)
    if (lastSuccess && Date.now() - lastSuccess < NETWORK_GAP_MS) forceNetwork = false
  }

  if (!forceNetwork && preferCache) {
    var cached = loadCache(method, params, false)
    if (cached) {
      try { guardRuntime(context, generation, cached) } catch (error) { return Promise.reject(error) }
      var instant = copyOwn({}, cached)
      instant.cached = true
      instant.instant = true
      return Promise.resolve(instant)
    }
  }

  var networkRequest = requestWithTimeout(context, { method: method, params: params }, options.timeoutMs)
    .then(function (data) {
      guardRuntime(context, generation, data)
      rememberNetworkSuccess(key)
      saveCache(method, params, data)
      return { data: data, cached: false, expired: false, instant: false, savedAt: Date.now(), ageMs: 0 }
    })
    .catch(function (error) {
      // Never turn a destroyed/superseded page into a cache update.
      if (error && error.stale === true) throw error
      if (state && !isRuntimeAlive(context, generation)) throw staleRuntimeError()
      var cached = loadCache(method, params, allowExpired)
      if (cached) {
        var fallback = copyOwn({}, cached)
        fallback.cached = true
        fallback.instant = true
        fallback.error = error
        return fallback
      }
      if (context) recordRuntimeError(context, method + ':request', error)
      throw error
    })

  if (!state) return networkRequest
  var trackedRequest = networkRequest.then(function (result) {
    // An older runtime may settle after the page was rebuilt. Only remove
    // the slot when it still points at this exact tracked promise; this
    // prevents an old completion from deleting a newer in-flight request.
    if (state.pendingRequests && state.pendingRequests[key] === trackedRequest) delete state.pendingRequests[key]
    return result
  }, function (error) {
    if (state.pendingRequests && state.pendingRequests[key] === trackedRequest) delete state.pendingRequests[key]
    throw error
  })
  state.pendingRequests[key] = trackedRequest
  return trackedRequest
}
