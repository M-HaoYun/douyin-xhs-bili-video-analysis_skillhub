# -*- coding: utf-8 -*-
"""抖音热榜解析：hot_words.json(热搜词) + hotspot.json(热点视频) + page.html(在榜视频配对)
用法: python douyin_hot_parse.py <outputDir>
产出: 终端打印三类清单：
  1. 实时热搜词榜（word_list 去 type=14 置顶词，按 hot_value 降序）
  2. channel/hotspot 热点视频精选（aweme_list 标题/作者/赞评藏转/时长）
  3. 页面在榜视频（HTML /video/{aweme_id} 与 page.txt 渲染文本按顺序配对 → id↔标题↔播放）
实证(2026-09-07): 热搜 51 条；hotspot aweme_list 20 条；页面 HTML 含 30 个在榜 /video/ 链接
"""
import json, re, sys, os

def rd(p):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception as e:
        print(f'!! 读取失败 {os.path.basename(p)}: {e}'); return None

def human(n):
    try: n = float(n or 0)
    except: return str(n)
    if n >= 10000: return f'{n/10000:.1f}万'
    return f'{int(n)}'

def main(d):
    print('=' * 60); print('一、实时热搜词榜')
    j = rd(os.path.join(d, 'hot_words.json'))
    if j:
        ws = (j.get('data') or {}).get('word_list') or []
        ws = [w for w in ws if w.get('word_type') != 14]  # type=14 置顶时政词剔除
        for i, w in enumerate(ws[:30], 1):
            print(f"{i:>2}. {w.get('word','')} 热度{w.get('hot_value',0) / 10000 if isinstance(w.get('hot_value'),(int,float)) else ''}万")
        print(f'... 共 {len(ws)} 条')

    print('=' * 60); print('二、热点视频精选（channel/hotspot）')
    j = rd(os.path.join(d, 'hotspot.json'))
    if j:
        lst = j.get('aweme_list') or (j.get('data') or {}).get('aweme_list') or []
        for i, a in enumerate(lst[:20], 1):
            st = (a.get('statistics') or {})
            au = (a.get('author') or {})
            dur = (a.get('video') or {}).get('duration', 0)
            print(f"{i:>2}. {a.get('desc','')[:40]} | @{au.get('nickname','?')} | 赞{human(st.get('digg_count'))} 评{human(st.get('comment_count'))} 藏{human(st.get('collect_count'))} 转{human(st.get('share_count'))} | {int(dur)}s | id={a.get('aweme_id')}")

    print('=' * 60); print('三、页面在榜视频（HTML id ↔ page.txt 文本配对）')
    html_p = os.path.join(d, 'page.html'); txt_p = os.path.join(d, 'page.txt')
    if os.path.exists(html_p) and os.path.exists(txt_p):
        html = open(html_p, encoding='utf-8', errors='ignore').read()
        txt = open(txt_p, encoding='utf-8', errors='ignore').read()
        ids = re.findall(r'/video/(\d{15,20})', html)
        # 去重保序
        seen = set(); ids = [x for x in ids if not (x in seen or seen.add(x))]
        lines = [l.strip() for l in txt.split('\n') if l.strip()]
        print(f'页面含 {len(ids)} 个视频链接；page.txt {len(lines)} 行。配对样本：')
        # 简化配对：正文行中出现在线标题（含"在看/赞"关键词）按序对应 id
        hot_lines = [l for l in lines if re.search(r'(万)?人?在看|万赞|万 赞', l)]
        for i in range(min(10, len(ids), len(hot_lines))):
            print(f'  id={ids[i]}  <-  {hot_lines[i][:60]}')
        print('提示：如需精确配对，人工核对 page.txt 相邻标题行与 id 顺序即可（实证为顺序一致）')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
