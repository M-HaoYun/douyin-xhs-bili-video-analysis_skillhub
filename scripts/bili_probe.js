/* B站通用探针 v2：SSR/ld+json 元数据 + playurl 音频提取 + 字幕探测
 * 用法: node probe2.js <bvid> <outputDir>
 * 输出: meta.json / audio_url.txt / sub*.json / page.html / apis.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BV = process.argv[2];
const DIR = process.argv[3];
fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('response', async r => {
    const u = r.url();
    if (/api\.bilibili\.com\/(x\/player\/wbi\/v2|playurl|online)/.test(u)) {
      try { const b = await r.text(); if (b.length < 800000) apiLog.push({ url: u, body: b }); } catch (e) {}
    }
  });

  await page.goto('https://www.bilibili.com/video/' + BV + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  fs.writeFileSync(path.join(DIR, 'page.html'), await page.content());
  fs.writeFileSync(path.join(DIR, 'page.txt'), await page.evaluate(() => document.body.innerText));

  // ---- 1. ld+json video-jsonld 元数据 ----
  let meta = null;
  try {
    meta = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const d = JSON.parse(s.textContent);
        if (d['@type'] === 'VideoObject') {
          const st = {};
          (d.interactionStatistic || []).forEach(x => st[x.interactionType['@type']] = x.userInteractionCount);
          // 从页面其他位置补 stat 需要额外接口；jsonld 够基础用
          return {
            bvid: d.url.split('/').filter(Boolean).pop().replace(/\/?videos?\//, ''),
            title: d.name, desc: d.description, duration: d.duration,
            uploadDate: d.uploadDate, author: d.author && d.author.name,
            authorUrl: d.author && d.author.url,
            keywords: Array.isArray(d.keywords) ? d.keywords : (d.keywords ? String(d.keywords).split(',') : []),
            genre: d.genre,
            stat: st,
            thumbnail: d.thumbnailUrl && d.thumbnailUrl[0],
          };
        }
      }
      return null;
    });
  } catch (e) { console.log('jsonld err', String(e).slice(0, 120)); }
  console.log('meta:', JSON.stringify(meta ? { title: meta.title, author: meta.author, duration: meta.duration, stat: meta.stat, keywords: (meta.keywords || []).slice(0, 12) } : null).slice(0, 600));
  fs.writeFileSync(path.join(DIR, 'meta.json'), JSON.stringify(meta, null, 1));

  // ---- 2. playurl 音频 + 字幕（等接口捕获）----
  await page.waitForTimeout(4000);
  fs.writeFileSync(path.join(DIR, 'apis.json'), JSON.stringify(apiLog, null, 1));
  for (const a of apiLog) {
    try {
      const d = JSON.parse(a.body);
      if (d.code !== 0) continue;
      // 音频流
      if (a.url.includes('playurl') && d.data && d.data.dash && d.data.dash.audio) {
        const aud = d.data.dash.audio;
        const best = aud.reduce((x, y) => (y.bandwidth || 0) > (x.bandwidth || 0) ? y : x);
        fs.writeFileSync(path.join(DIR, 'audio_url.txt'), best.baseUrl || best.base_url || '');
        console.log('AUDIO best id=' + best.id + ' bw=' + best.bandwidth);
      }
      // 字幕
      if (a.url.includes('player/wbi/v2') && d.data && d.data.subtitle) {
        const subs = d.data.subtitle.subtitles || [];
        fs.writeFileSync(path.join(DIR, 'subs.json'), JSON.stringify(subs));
        console.log('SUBS n=' + subs.length + ' open=' + d.data.subtitle.subtitle_open);
      }
    } catch (e) {}
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.log('ERR', String(e).slice(0, 300)); process.exit(1); });
