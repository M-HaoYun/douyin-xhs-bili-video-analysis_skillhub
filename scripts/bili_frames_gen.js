/* B站知识类低密度截帧（通用版）：片头 30s 每 8s + 主体每 50s + 结尾，封顶 22
 * 用法: node frames_gen.js <bvid> <outputDir> [durationHint]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BV = process.argv[2];
const DIR = process.argv[3];

function samplePoints(dur) {
  const pts = [];
  for (let t = 1; t <= 30 && t < dur - 2; t += 8) pts.push(+t.toFixed(1));
  for (let t = 35; t < dur - 5; t += 50) pts.push(t);
  if (dur > 8) pts.push(dur - 8);
  if (dur > 3) pts.push(dur - 2);
  const uniq = [...new Set(pts)].filter(t => t > 0 && t < dur - 0.5);
  if (uniq.length > 22) {
    const head = uniq.filter(t => t <= 31);
    const body = uniq.filter(t => t > 31);
    const cap = 22 - head.length;
    const step = body.length / cap;
    const out = [...head];
    for (let i = 0; i < cap; i++) out.push(body[Math.min(body.length - 1, Math.round(i * step))]);
    return [...new Set(out)].sort((a, b) => a - b);
  }
  return uniq;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto('https://www.bilibili.com/video/' + BV + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  const video = await page.$('.bpx-player-video-wrap video')
    || await page.$('.bpx-player-container video')
    || await page.$('video');
  if (!video) { console.log('NO VIDEO'); await browser.close(); process.exit(1); }
  await video.evaluate(el => { el.muted = true; el.play && el.play().catch(() => {}); }).catch(() => {});

  let dur = 1017;
  try { const vdur = await video.evaluate(el => el.duration); if (vdur && vdur > 10) dur = vdur; } catch (e) {}
  console.log('duration:', dur);

  const pts = samplePoints(dur);
  console.log('points n=' + pts.length);
  fs.writeFileSync(path.join(DIR, 'frame_pts.txt'), JSON.stringify(pts));

  let ok = 0;
  for (const t of pts) {
    try {
      await video.evaluate((el, tv) => { el.muted = true; el.currentTime = tv; }, t);
      await page.waitForTimeout(500);
      const fn = 'f_' + String(Math.round(t)) + 's.jpg';
      await video.screenshot({ path: path.join(DIR, fn) });
      ok++;
    } catch (e) { console.log('fail t=' + t + ' ' + String(e).slice(0, 80)); }
  }
  fs.writeFileSync(path.join(DIR, 'frames_status.txt'), 'saved ' + ok + '/' + pts.length);
  console.log('DONE ' + ok + '/' + pts.length);
  await browser.close();
})().catch(e => { console.log('ERR', String(e).slice(0, 300)); process.exit(1); });
