# -*- coding: utf-8 -*-
"""小红书 SSR 解析器：从 xhs_probe.js 保存的 page.html 提取笔记元数据/字幕URL/评论预览
用法: python xhs_parse.py <outputDir>
产出: state.json / meta.txt / subtitle_urls.txt（由调用者按需 curl 下载 srt）
"""
import json
import os
import re
import sys
import datetime

DIR = sys.argv[1] if len(sys.argv) > 1 else '.'
html_path = os.path.join(DIR, 'page.html')
html = open(html_path, encoding='utf-8', errors='ignore').read()

# --- 1. 提取 window.__INITIAL_STATE__ ---
start = html.find('window.__INITIAL_STATE__')
if start < 0:
    print('NO_INITIAL_STATE')
    sys.exit(0)
val_start = html.find('{', start)
i = val_start
depth = 0
in_str = False
esc = False
while i < len(html):
    ch = html[i]
    if in_str:
        if esc:
            esc = False
        elif ch == '\\':
            esc = True
        elif ch == '"':
            in_str = False
    else:
        if ch == '"':
            in_str = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                i += 1
                break
    i += 1
raw = html[val_start:i]
clean = re.sub(r'\bundefined\b', 'null', raw)
state = json.loads(clean)
with open(os.path.join(DIR, 'state.json'), 'w', encoding='utf-8') as f:
    json.dump(state, f, ensure_ascii=False, indent=1)

# --- 2. 找笔记详情 ---
note = None
# 常见路径 1: note.noteDetailMap.{id}.note
try:
    ndm = state['note']['noteDetailMap']
    for nid, det in ndm.items():
        note = det.get('note') or (det if det.get('title') else {})
        break
except Exception:
    pass
# 常见路径 2（桌面版/部分入口）: noteData.data.noteData
if not note:
    try:
        note = state['noteData']['data']['noteData']
    except Exception:
        pass
# 路径 3: 递归兜底找含 noteId 的对象（结构变化防呆）
if not note:
    import sys as _sys
    def _find(o):
        if isinstance(o, dict):
            if o.get('noteId') and (o.get('title') or o.get('desc')):
                return o
            for v in o.values():
                r = _find(v)
                if r:
                    return r
        elif isinstance(o, list):
            for v in o:
                r = _find(v)
                if r:
                    return r
        return None
    try:
        note = _find(state) or {}
    except Exception:
        pass
if not note:
    print('NOTE_NOT_FOUND (游客可能被剥离详情，需登录 cookie 或预热后重试)')
    sys.exit(0)

# --- 3. 打印核心元数据 ---
def g(*keys, default=None):
    for k in keys:
        if note and isinstance(note.get(k), (str, int, float)):
            return note.get(k)
    return default

print('noteId:', note.get('noteId'))
print('title:', note.get('title'))
print('desc:', str(note.get('desc'))[:300])
inter = note.get('interactInfo') or {}
print('liked:', inter.get('likedCount'), 'collected:', inter.get('collectedCount'),
      'comment:', inter.get('commentCount'), 'shared:', inter.get('shareCount'))
u = note.get('user') or {}
print('author:', u.get('nickname') or u.get('nickName'), u.get('userId'))
t = note.get('time', 0)
if t:
    print('time:', datetime.datetime.fromtimestamp(t / 1000).strftime('%Y-%m-%d %H:%M:%S'))
print('type:', note.get('type'))
video = note.get('video') or {}
dur = video.get('capa', {}).get('duration')
print('duration:', dur, 's')
tags = note.get('tagList') or []
print('tags:', [x.get('name') for x in tags][:15])

# --- 4. 字幕 URL ---
mv = video.get('mediaV2', '') or ''
urls = {}
for m in re.finditer(r'"url":"(https?://sns-subtitle[^"]+?\.srt[^"]*?)".{0,100}?"language":"([a-zA-Z-]+)"', mv):
    urls[m.group(2)] = m.group(1).replace('\\u002F', '/').replace('\\/', '/')
if not urls:
    for m in re.finditer(r'(https?://sns-subtitle[^"\\]+?\.srt[^"\\]*)', mv):
        pass
with open(os.path.join(DIR, 'subtitle_urls.txt'), 'w', encoding='utf-8') as f:
    for lang, url in urls.items():
        f.write(f'{lang}\t{url}\n')
print('subtitle_urls:', urls if urls else 'NONE')

# --- 5. 评论区预览 ---
try:
    cd_ = state['noteData']['data']['commentData']
    comments = cd_.get('comments') or []
    print('comments in SSR:', len(comments))
    for c in comments[:10]:
        cu = c.get('user') or {}
        print(f"  [{c.get('likeCount')}赞] {cu.get('nickname')}: {str(c.get('content'))[:80]}")
except Exception:
    pass
