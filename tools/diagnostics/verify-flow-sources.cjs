// 一次性诊断脚本：定位"主力资金没有相关数据"的根因。
// 需要联网且能访问东方财富（push2/push2his）；仅人工验证，不进 check 套件。
//
// 用法：node tools/diagnostics/verify-flow-sources.cjs [ETF代码，默认 510300]
// 逐档打印每个主机/参数组合的 HTTP 状态与返回体前 160 字符：
//   - 若带 ut 的档位有 klines 而裸档位 data:null → 缺 ut 参数是根因
//   - 若全部 data:null → 接口契约又变了，按打印出的原始响应调整 flow.js
//   - 若全部超时/连接被关闭 → 是网络侧（IP/WAF）封锁，不是客户端契约问题
const https = require('https')

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const UT = 'b2884a393a59ad64002292a3e90d46a5'

function get(urlStr) {
  return new Promise((resolve) => {
    const u = new URL(urlStr)
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, timeout: 15000,
      headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/', Accept: '*/*' },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', (e) => resolve({ error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }) })
    req.end()
  })
}

const CATALOG = {
  '510300': '1.510300', '510500': '1.510500', '512100': '1.512100',
  '515180': '1.515180', '159915': '0.159915', '588000': '1.588000',
}

function variants(secid) {
  const day = (host, ut) => `https://${host}/api/qt/stock/fflow/daykline/get?secid=${secid}&klt=101&lmt=60&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57${ut ? `&ut=${UT}` : ''}`
  const intraday = (host, ut) => `https://${host}/api/qt/stock/fflow/kline/get?secid=${secid}&klt=1&lmt=0&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57${ut ? `&ut=${UT}` : ''}`
  return [
    ['day push2his +ut', day('push2his.eastmoney.com', true)],
    ['day push2his bare', day('push2his.eastmoney.com', false)],
    ['day push2 +ut', day('push2.eastmoney.com', true)],
    ['intraday push2his +ut', intraday('push2his.eastmoney.com', true)],
  ]
}

async function main() {
  const code = process.argv[2] || '510300'
  const secid = CATALOG[code]
  if (!secid) throw new Error(`未知 ETF 代码 ${code}，可选：${Object.keys(CATALOG).join(' ')}`)
  console.log(`# flow source probe for ${code} (${secid})`)
  for (const [name, target] of variants(secid)) {
    const r = await get(target)
    if (r.error) { console.log(`${name.padEnd(22)} ERROR ${r.error}`); continue }
    let klines = null
    try { const j = JSON.parse(r.text); klines = j && j.data && Array.isArray(j.data.klines) ? j.data.klines.length : null } catch (_) {}
    console.log(`${name.padEnd(22)} HTTP ${r.status} klines=${klines === null ? 'n/a' : klines} :: ${String(r.text).slice(0, 160).replace(/\n/g, '')}`)
  }
}

main().catch((error) => { console.error(error.message); process.exit(1) })
