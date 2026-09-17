/* 触发播放并捕获 playurl 音频流 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BV = process.argv[2];
const DIR = process.argv[3];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  let playurlBody = null;
  page.on('response', async r => {
    const u = r.url();
    if (/playurl/.test(u) && u.includes('bvid=' + BV)) {
      try {
        const b = await r.text();
        if (b.length > 500) playurlBody = b;
      } catch (e) {}
    }
  });

  await page.goto('https://www.bilibili.com/video/' + BV + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  // 点击播放按钮（可能多个，取第一个可见的）
  try {
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.bpx-player-ctrl-play, .bpx-player-start, .bpx-player-video-btn-play, .squirtle-video-play');
      for (const b of btns) { if (b.offsetParent !== null) { b.click(); return; } }
      // 兜底：直接触发 video play
      const v = document.querySelector('video');
      if (v) { v.muted = true; v.play().catch(() => {}); }
    });
    console.log('clicked play');
  } catch (e) { console.log('play click err', String(e).slice(0, 100)); }

  // 等 playurl 出现
  for (let i = 0; i < 12 && !playurlBody; i++) {
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2000);

  if (playurlBody) {
    fs.writeFileSync(path.join(DIR, 'playurl.json'), playurlBody);
    console.log('playurl captured len=' + playurlBody.length);
    try {
      const d = JSON.parse(playurlBody);
      const aud = d.data && d.data.dash && d.data.dash.audio;
      if (aud) {
        const best = aud.reduce((x, y) => (y.bandwidth || 0) > (x.bandwidth || 0) ? y : x);
        fs.writeFileSync(path.join(DIR, 'audio_url.txt'), best.baseUrl || best.base_url || '');
        console.log('AUDIO id=' + best.id + ' bw=' + best.bandwidth);
      } else {
        console.log('NO dash.audio in playurl');
      }
    } catch (e) { console.log('parse err', String(e).slice(0, 100)); }
  } else {
    console.log('NO playurl captured');
  }
  await browser.close();
})().catch(e => { console.log('ERR', String(e).slice(0, 300)); process.exit(1); });
