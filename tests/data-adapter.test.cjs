const fs = require('fs')
const path = require('path')

// 设备端源码是 .js（zeus/rollup 的解析器不认 TS 语法，也不能构建 .ts 入口）。
// 这里仍按 字面路径 -> .ts -> .js 的顺序探测：若日后有文件改用 .ts 且构建链
// 支持，测试无需再改。
function resolveSource(fromDir, specifier) {
  const base = path.resolve(fromDir, specifier)
  if (path.extname(base)) return base
  for (const ext of ['.ts', '.js']) {
    if (fs.existsSync(base + ext)) return base + ext
  }
  return base + '.ts'
}

const vm = require('vm')
const assert = require('assert')

const root = process.cwd()
const cache = new Map()
async function loadModule(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const code = fs.readFileSync(file, 'utf8')
  const mod = new vm.SourceTextModule(code, { identifier: file })
  cache.set(file, mod)
  await mod.link(async (specifier, referencingModule) => {
    if (!specifier.startsWith('.')) throw new Error(`unexpected external import ${specifier}`)
    return loadModule(resolveSource(path.dirname(referencingModule.identifier), specifier))
  })
  await mod.evaluate()
  return mod
}
function targetParam(url, key) { return new URL(url).searchParams.get(key) }
function dateSeries(startYear, startMonth, count) {
  const rows = []
  let y = startYear, m = startMonth
  for (let i=0;i<count;i++) {
    rows.push(`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-20`)
    m += 1; if (m>12) {m=1;y+=1}
  }
  return rows
}
;(async () => {
  const legu = (await loadModule(path.join(root,'app-side/providers/modules/valuation-legulegu.js'))).namespace
  assert.equal(legu.leguleguTokenForDate('2026-08-10'),'34b550a9d919e90c000f88a2199fc62c')
  assert.equal(legu.leguleguTokenForDate('abc'),'900150983cd24fb0d6963f7d28e17f72')
  assert.equal(legu.leguleguIndexCode('000300'),'000300.SH')
  // 后缀按交易所/指数家族而定，不是统一 .SH；000688 属于上交所，000922 走中证
  // （.CSI），399006 是深交所（.SZ）。三者均为 2026-09-11 联网核对确认。
  assert.equal(legu.leguleguIndexCode('000688'),'000688.SH')
  assert.equal(legu.leguleguIndexCode('399006'),'399006.SZ')
  assert.equal(legu.leguleguIndexCode('000922'),'000922.CSI')
  // 未登记的指数仍返回空串，由雪球回退兜底。
  assert.equal(legu.leguleguIndexCode('999999'),'')

  const peDates = dateSeries(2021,1,70)
  let htmlCalls = 0, jsonCalls = 0
  const leguTransport = {
    async requestText() { htmlCalls++; return '<html><meta name="_csrf" content="csrf-test"></html>' },
    async requestJson(target, options) {
      jsonCalls++
      assert.equal(targetParam(target,'indexCode'),'000300.SH')
      assert.ok(/^[a-f0-9]{32}$/.test(targetParam(target,'token')))
      assert.equal(options.headers['X-CSRF-Token'],'csrf-test')
      return { data: peDates.flatMap((d,i) => [
        { date: d.replace('-20','-05'), addTtmPe: 10+i, ttmPe: 9999 },
        { date: d, addTtmPe: 20+i, ttmPe: 9999 },
      ]) }
    },
  }
  const monthly = await legu.loadLeguleguIndexPeMonthly(leguTransport,{indexCode:'000300'})
  assert.equal(htmlCalls,1); assert.equal(jsonCalls,1); assert.equal(monthly.length,60)
  assert.equal(monthly.at(-1).pe,89) // latest monthly row uses addTtmPe, not ttmPe

  const sse = (await loadModule(path.join(root,'app-side/providers/modules/shares-sse.js'))).namespace
  const dayPoints = []
  const start = Date.UTC(2026,3,1)
  for (let i=0;i<130;i++) dayPoints.push({time:new Date(start+i*86400000).toISOString().slice(0,10)})
  const sseDates = []
  const sseTransport = {
    async requestJson(target) {
      const d = targetParam(target,'STAT_DATE'); sseDates.push(d)
      assert.equal(targetParam(target,'sqlId'),'COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L')
      return {result:[{SEC_CODE:'510300',STAT_DATE:d,TOT_VOL:'1,234,500'}]}
    }
  }
  const ssePoints = await sse.loadSseEtfShareSnapshots(sseTransport,'510300',dayPoints)
  assert.equal(sseDates.length,12)
  assert.equal(ssePoints.length,12)
  assert.equal(ssePoints[0].shareBillion,123.45)
  const lastInputDate = dayPoints.at(-1).time
  assert.equal(sseDates.at(-1),lastInputDate)
  assert.deepEqual(sseDates.slice(-3), dayPoints.slice(-3).map(x=>x.time))

  const szse = (await loadModule(path.join(root,'app-side/providers/modules/shares-szse.js'))).namespace
  const szseTransport = { async requestJson(target) {
    assert.equal(targetParam(target,'CATALOGID'),'scsj_fund_jjgm')
    return [{data:[
      {'日期':'2026-08-06','基金代码':159915,'基金规模(份)':'12,345,000,000'},
      {'日期':'2026-08-07','基金代码':'159915','基金规模(份)':'12,500,000,000'},
    ]}]
  }}
  const szPoints = await szse.loadSzseEtfShareDaily(szseTransport,'159915')
  assert.equal(szPoints.length,2)
  assert.equal(szPoints[0].shareBillion,123.45)
  assert.equal(szPoints[1].shareBillion,125)

  const parser = (await loadModule(path.join(root,'app-side/providers/modules/share-parser.js'))).namespace
  let parsed = parser.parseShareHistoryRows([
    ['报告期','期末总份额（亿份）'], ['2026-06-30','88.50'], ['2026-03-31','80.25']
  ])
  assert.deepEqual(parsed.map(x=>x.shareBillion),[80.25,88.5])
  parsed = parser.parseShareHistoryRows([
    ['日期','基金份额(万份)'], ['2026-06-30','12,345']
  ])
  assert.equal(parsed[0].shareBillion,1.2345)
  parsed = parser.parseShareHistoryRows([
    ['日期','基金份额'], ['2026-06-30','12345']
  ])
  assert.equal(parsed.length,0) // unitless fallback is deliberately rejected

  const merged = parser.mergeDailyShareClose(
    [
      {time:'2026-06-01',c:4.0},{time:'2026-06-02',c:4.1},{time:'2026-06-03',c:4.2},{time:'2026-06-04',c:4.3}
    ],
    [{time:'2026-06-01',shareBillion:100},{time:'2026-06-03',shareBillion:105}],
    105
  )
  assert.deepEqual(merged.points.map(x=>x.shareBillion),[100,100,105,105])
  assert.equal(merged.historyAvailable,true)

  const valuation = (await loadModule(path.join(root,'app-side/providers/modules/valuation.js'))).namespace
  const monthlyDates = dateSeries(2021,9,60)
  const valTransport = {
    async cached(key, ttl, loader) { assert.ok(key.startsWith('valuation5y:v4:000300')); return loader() },
    async requestText() { return '<meta content="csrf" name="_csrf">' },
    async requestJson(target) {
      if (target.includes('/api/qt/stock/kline/get')) {
        assert.equal(targetParam(target,'secid'),'1.000300')
        assert.equal(targetParam(target,'klt'),'103')
        return {data:{klines:monthlyDates.map((date,i)=>`${date},${4000+i},${4000+i},${4010+i},${3990+i},100,1000,0,0,0,0`)}}
      }
      return {data:monthlyDates.map((date,i)=>({date,addTtmPe:10+i/10,ttmPe:1000}))}
    }
  }
  const vp = valuation.createValuationProvider(valTransport)
  const result = await vp.valuation('510300')
  assert.equal(result.points.length,60)
  assert.equal(result.currentPe,15.9)
  assert.equal(result.percentile,100)
  assert.ok(result.source.includes('AKShare'))
  assert.ok(result.p20 < result.p80)
  assert.equal(result.currentIndex,4059)
  assert.equal(result.points.at(-1).indexClose,4059)
  assert.ok(result.maxPe > result.avgPe && result.avgPe > result.minPe)

  console.log('adapter_tests=PASS')
})().catch((e)=>{console.error(e);process.exit(1)})
