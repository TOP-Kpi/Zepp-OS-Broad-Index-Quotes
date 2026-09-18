# -*- coding: utf-8 -*-
"""Report exported symbols with zero consumers outside their defining file."""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sources = {}
for base in ('page', 'utils', 'app-side', 'setting', 'tests', 'tools'):
    for root_dir, _dirs, files in os.walk(os.path.join(ROOT, base)):
        for name in files:
            # 设备端源码是 .ts；app-side/index.js 等入口仍是 .js；维护脚本是 .cjs。
            if name.endswith('.ts') or name.endswith('.js') or name.endswith('.cjs'):
                p = os.path.join(root_dir, name)
                sources[os.path.relpath(p, ROOT)] = io.open(p, encoding='utf-8').read()

export_re = re.compile(r'^export (?:async )?(?:function|var|const|let) ([A-Za-z_$][\w$]*)', re.M)
dead = []
for rel, src in sources.items():
    if not (rel.startswith('utils') or rel.startswith('app-side')):
        continue
    for name in export_re.findall(src):
        uses = 0
        for other_rel, other in sources.items():
            if other_rel == rel:
                # 定义文件内部：扣除定义行本身，数其余引用
                body = other.replace('export function ' + name, '', 1).replace('export var ' + name, '', 1).replace('export const ' + name, '', 1).replace('export async function ' + name, '', 1)
                uses += len(re.findall(r'\b' + re.escape(name) + r'\b', body))
            else:
                uses += len(re.findall(r'\b' + re.escape(name) + r'\b', other))
        if uses == 0:
            dead.append((rel, name))
for rel, name in sorted(dead):
    print('%-46s %s' % (rel, name))
print('total dead exports:', len(dead))
