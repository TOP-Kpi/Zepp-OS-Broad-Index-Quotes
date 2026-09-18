# -*- coding: utf-8 -*-
"""2.5 数字一致性：跨文件手抄的常量逐个比对。"""
import io
import os
import re
import json


def read(p):
    return io.open(p, encoding='utf-8').read()


def grep_files(dirs, pattern, exts=('.js', '.cjs', '.json', '.py', '.txt', '.md')):
    hits = []
    for base in dirs:
        if os.path.isfile(base):
            files = [base]
        else:
            files = []
            for rd, dd, fs in os.walk(base):
                dd[:] = [d for d in dd if d not in ('node_modules', 'dist', 'preview', 'i18n', 'fonts-src')]
                for n in fs:
                    if n.endswith(exts):
                        files.append(os.path.join(rd, n))
        for f in files:
            src = read(f)
            for m in re.finditer(pattern, src):
                line = src[:m.start()].count('\n') + 1
                hits.append('%s:%d  %s' % (f, line, src.split('\n')[line - 1].strip()[:110]))
    return hits


app = json.loads(read('app.json'))
pkg = json.loads(read('package.json'))

print('=' * 78)
print('1) ETF_UNIVERSE.length —— 是否还有硬编码的标的数量兜底')
print('=' * 78)
consts = read('utils/constants.js')
n = len(re.findall(r"code: '\d{6}'", consts))
print('utils/constants.js 里 ETF_UNIVERSE 实际条数 =', n)
for h in grep_files(['page', 'utils', 'app-side'],
                    r"\|\|\s*[689]\b|/\s*9\s*只|/\s*8\s*只|六只|6 只核心|八个核心|六个核心"):
    print('   ', h)

print()
print('=' * 78)
print('2) 版本号：app.json ⟷ package.json ⟷ 测试断言 ⟷ setting/index.js')
print('=' * 78)
print('app.json   version =', app['app']['version'])
print('package.json version =', pkg['version'])
print('一致：', app['app']['version']['name'] == pkg['version'])
for h in grep_files(['tests', 'setting', 'tools'],
                    r"1\.0\.0|version\.code|version\.name|100"):
    print('   ', h)

print()
print('=' * 78)
print('3) 语言清单：app.json i18n 键 ⟷ page/i18n/*.po ⟷ 测试断言')
print('=' * 78)
declared = set(app['i18n'].keys())
pos = set(f[:-3] for f in os.listdir('page/i18n') if f.endswith('.po'))
print('app.json 声明 %d 种 | .po 目录 %d 份' % (len(declared), len(pos)))
print('声明但无 .po：', sorted(declared - pos) or '无')
print('有 .po 但未声明：', sorted(pos - declared) or '无')
for h in grep_files(['tests'], r"34|>= 30|locales\.length|length >= 3"):
    print('   ', h)

print()
print('=' * 78)
print('4) chart 截断上限：side compact.js ⟷ device chart.js')
print('=' * 78)
compact = read('app-side/domain/compact.js')
chart = read('page/detail/services/chart.js')
print("compact.js chart:", re.findall(r"data\.period === 'day' \? (\d+) : (\d+)", compact))
print("chart.js limits :", re.findall(r"day: (\d+), intraday: (\d+)", chart))
print('shares/valuation/margin in compact:',
      re.findall(r"method === '(shares|valuation|margin)'\) return \{ \.\.\.data, points: samplePoints\(data\.points, (\d+)\)", compact))

print()
print('=' * 78)
print('5) 安全边距：constants.js 公式 ⟷ 测试断言')
print('=' * 78)
print('constants.js:', re.findall(r'REFERENCE_SIDE = (\d+)|REFERENCE_EDGE = (\d+)', consts))
print("constants.js '390x450' 半径:", re.findall(r"'390x450': (\d+)", consts))
for h in grep_files(['tests'], r"=== 30|=== 26|30/26|side inset|edge inset|REF_(SIDE|EDGE|RADIUS) = \d+"):
    print('   ', h)

print()
print('=' * 78)
print('6) 其它跨端常量：TTL / 点数上限 / 保留天数')
print('=' * 78)
for pat, label in [(r"RETENTION_DAYS = (\d+)", 'RETENTION_DAYS'),
                   (r"SHARE_CACHE_MAX_POINTS = (\d+)", 'SHARE_CACHE_MAX_POINTS'),
                   (r"SHARE_CACHE_MONTHS = (\d+)", 'SHARE_CACHE_MONTHS'),
                   (r"M1M2_TREND_MONTHS = (\d+)", 'M1M2_TREND_MONTHS'),
                   (r"SSE_SCALE_SAMPLE_COUNT = (\d+)", 'SSE_SCALE_SAMPLE_COUNT'),
                   (r"REQUEST_TIMEOUT_MS = (\d+)", 'REQUEST_TIMEOUT_MS')]:
    print('%-28s' % label, grep_files(['.'], pat)[:4])
