# -*- coding: utf-8 -*-
"""找出各语言覆盖表里"EN 词表已不存在"的惰性条目：永远不会被 emit，属于痕迹。"""
import io
import re

src = io.open('tools/build_i18n.py', encoding='utf-8').read()


def table(name):
    m = re.search(r'^%s = \{' % name, src, re.M)
    if not m:
        return {}
    start = m.end() - 1
    depth = 0
    for i in range(start, len(src)):
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                body = src[start:i + 1]
                break
    keys = set()
    for km in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:", body):
        keys.add(km.group(1))
    return keys


en = table('EN')
print('EN 词表：%d 条' % len(en))
for name in ('ZH_TW', 'JA', 'TR', 'OVERRIDES'):
    t = table(name)
    inert = sorted(k for k in t if k not in en)
    print()
    print('%s：%d 条，其中 EN 里已不存在（惰性）%d 条' % (name, len(t), len(inert)))
    for k in inert:
        print('    -', repr(k))
# OVERRIDES 是嵌套的（按语言分组），它的键其实是语言代码，单独处理
m = re.search(r'OVERRIDES = \{', src)
if m:
    start = m.end() - 1
    depth = 0
    for i in range(start, len(src)):
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                body = src[start:i + 1]
                break
    inert_total = []
    for lm in re.finditer(r"'([a-zA-Z-]+)':\s*\{", body):
        loc = lm.group(1)
        sub_start = lm.end() - 1
        d = 0
        for j in range(sub_start, len(body)):
            if body[j] == '{':
                d += 1
            elif body[j] == '}':
                d -= 1
                if d == 0:
                    sub = body[sub_start:j + 1]
                    break
        keys = set(km.group(1) for km in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:", sub))
        bad = sorted(k for k in keys if k not in en)
        if bad:
            inert_total.append((loc, bad))
    print()
    print('OVERRIDES 里各语言分组中 EN 已不存在的键：')
    if not inert_total:
        print('    （无）')
    for loc, bad in inert_total:
        for k in bad:
            print('    %-8s %r' % (loc, k))
