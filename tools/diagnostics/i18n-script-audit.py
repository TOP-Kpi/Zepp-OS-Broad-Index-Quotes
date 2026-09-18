# -*- coding: utf-8 -*-
"""扫描全部 .po 的 msgstr：混排字母表 / 重复字符硬警报。

背景：翻译文本曾用 .replace() 拼造，产出过 'Portfolioo'、'Ευρυτηταность'
（希腊+西里尔）、'Тeмпerаtуrа trжишtа'（拉丁+西里尔混排）三处坏数据。
这里做一次全量普查，确认没有第四处。
"""
import io
import os
import glob
import re
import unicodedata

RANGES = [
    ('Greek', 0x0370, 0x03FF),
    ('Cyrillic', 0x0400, 0x04FF),
    ('Hebrew', 0x0590, 0x05FF),
    ('Arabic', 0x0600, 0x06FF),
    ('Devanagari', 0x0900, 0x097F),
    ('Thai', 0x0E00, 0x0E7F),
    ('Kana', 0x3040, 0x30FF),
    ('CJK', 0x4E00, 0x9FFF),
    ('Hangul', 0xAC00, 0xD7AF),
    ('Latin', 0x0041, 0x024F),
]


def scripts_of(text):
    found = set()
    for ch in text:
        cp = ord(ch)
        for name, lo, hi in RANGES:
            if lo <= cp <= hi:
                found.add(name)
    return found


hard = []
soft = []
dup = []
total = 0
for path in sorted(glob.glob('page/i18n/*.po')):
    locale = os.path.basename(path)[:-3]
    msgid = None
    for line in io.open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('msgid '):
            msgid = line[6:]
            continue
        if not line.startswith('msgstr '):
            continue
        val = line[7:]
        total += 1
        s = scripts_of(val)
        nonlatin = s - {'Latin'}
        if len(nonlatin) >= 2:
            hard.append((locale, msgid, val, sorted(s)))
        elif 'Latin' in s and 'Cyrillic' in s:
            soft.append((locale, msgid, val, sorted(s)))
        # 同一字母连续 3 次以上（正常文本极少出现）
        m = re.search(r'([A-Za-z\u00c0-\u024f\u0370-\u04ff])\1\1+', val)
        if m:
            dup.append((locale, msgid, val, m.group(0)))

print('检查 msgstr 条数：', total)
print()
print('【硬警报】单条混用 2 种以上非拉丁字母表：%d' % len(hard))
for loc, mid, val, s in hard:
    print('   %-7s %-22s %-30s %s' % (loc, mid, val, s))
print()
print('【次级】拉丁 + 西里尔混排：%d' % len(soft))
for loc, mid, val, s in soft[:20]:
    print('   %-7s %-22s %-30s' % (loc, mid, val))
print()
print('【可疑】同字母连续 3 次以上：%d' % len(dup))
for loc, mid, val, run in dup[:20]:
    print('   %-7s %-22s %-30s run=%s' % (loc, mid, val, run))
