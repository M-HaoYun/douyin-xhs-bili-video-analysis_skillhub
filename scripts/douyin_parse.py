# -*- coding: utf-8 -*-
"""抖音详情解析器：从 douyin_probe.js 保存的 apis.json 提取视频详情 + 高赞评论
用法: python douyin_parse.py <outputDir>
产出: detail.json / comments_summary.txt
"""
import json
import os
import sys
import datetime

DIR = sys.argv[1] if len(sys.argv) > 1 else '.'
apis_path = os.path.join(DIR, 'apis.json')
if not os.path.exists(apis_path):
    print('NO_APIS_JSON'); sys.exit(0)
apis = json.load(open(apis_path, encoding='utf-8'))

aweme = None
comments = []
for a in apis:
    try:
        d = json.loads(a['body'])
    except Exception:
        continue
    u = a['url']
    if 'aweme/detail' in u and d.get('aweme_detail'):
        aweme = d['aweme_detail']
        with open(os.path.join(DIR, 'detail.json'), 'w', encoding='utf-8') as f:
            json.dump(aweme, f, ensure_ascii=False, indent=1)
    elif 'comment/list' in u:
        comments.extend(d.get('comments') or [])

if not aweme:
    print('NO_DETAIL (未捕获 detail 接口，可重试或改用登录 cookie)')
else:
    print('desc:', aweme.get('desc'))
    st = aweme.get('statistics') or {}
    print('likes:', st.get('digg_count'), 'comments:', st.get('comment_count'),
          'collects:', st.get('collect_count'), 'shares:', st.get('share_count'))
    ct = aweme.get('create_time')
    if ct:
        print('time:', datetime.datetime.fromtimestamp(ct).strftime('%Y-%m-%d %H:%M:%S'))
    au = aweme.get('author') or {}
    print('author:', au.get('nickname'), '| fans:', au.get('follower_count'),
          '| likes_total:', au.get('total_favorited'))
    print('duration:', aweme.get('duration'), 'ms')
    tags = aweme.get('video_tag') or []
    print('tags:', [t.get('tag_name') for t in tags][:15])

print('\ncomments captured:', len(comments))
for c in comments[:15]:
    print(f"  [{c.get('digg_count')}赞|{c.get('reply_comment_total')}回复] {str(c.get('text'))[:100]}")
with open(os.path.join(DIR, 'comments_summary.txt'), 'w', encoding='utf-8') as f:
    for c in comments[:30]:
        f.write(f"[{c.get('digg_count')}赞] {str(c.get('text'))}\n")
