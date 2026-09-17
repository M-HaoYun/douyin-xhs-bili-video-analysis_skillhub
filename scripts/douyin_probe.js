/* 抖音视频通用探针：短链或 aweme_id → 详情/评论接口 + 画面截帧
 * 用法: node douyin_probe.js <分享链接或aweme_id> <outputDir>
 * 依赖: playwright（见 SKILL.md 环境安装说明）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INPUT = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

function extractAwemeId(input) {
  if (/^\d{15,20}$/.test(input)) return input;
  // v.douyin.com 短链 → 解真实跳转拿 id
  try {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    const real = execSync(`curl -sL -o /dev/null -w "%{url_effective}" -A "${ua}" "${input}"`, { timeout: 30000 }).toString();
    const m = real.match(/\/video\/(\d{15,20})/);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

(async () => {
  const vid = extractAwemeId(INPUT);
  if (!vid) { console.log('NO_AWEME_ID'); process.exit(1); }
  console.log('aweme_id:', vid);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--lang=zh-CN', '--autoplay-policy=no-user-gesture-required', '--disable-web-security'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }, locale: 'zh-CN'
  });
  const page = await ctx.newPage();
  const apis = [];
  page.on('response', async (r) => {
    const u = r.url();
    try {
      const ct = r.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      if (/aweme\/v1\/web\/(aweme\/detail|comment\/list)/i.test(u)) {
        const t = await r.text();
        apis.push({ url: u.slice(0, 220), body: t.slice(0, 200000) });
        fs.writeFileSync(path.join(OUT, 'apis.json'), JSON.stringify(apis));
      }
    } catch (e) {}
  });
  try { await page.goto(`https://www.douyin.com/video/${vid}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
  catch (e) { console.log('goto warn:', e.message); }
  await page.waitForTimeout(8000);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 1200).catch(() => {}); await page.waitForTimeout(1000); }
  await page.evaluate(() => { window.scrollTo(0, 300); });
  await page.waitForTimeout(1500);
  // 隐藏登录遮罩
  await page.evaluate(() => {
    const kill = (sel) => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.style.visibility = 'hidden'; });
    ['div[class*="login"]', 'div[class*="mask"]', 'div[class*="modal"]', 'div[class*="dialog"]', 'div[class*="guide"]', 'div[role="dialog"]', 'div[class*="cover"]', 'div[class*="overlay"]', 'div[class*="toast"]'].forEach(kill);
  }).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'page.html'), await page.content().catch(() => ''));
  fs.writeFileSync(path.join(OUT, 'page.txt'), await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => ''));
  console.log('apis:', apis.length);

  // video 截帧
  let dur = 0;
  try {
    await page.waitForSelector('video', { timeout: 15000 });
    await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.play().catch(() => {}); } });
    await page.waitForTimeout(2500);
    dur = await page.evaluate(() => { const v = document.querySelector('video'); return v ? v.duration : 0; }).catch(() => 0);
  } catch (e) { console.log('video err:', e.message.slice(0, 100)); }
  console.log('duration:', dur);

  if (dur > 0) {
    const step = dur <= 30 ? 1.5 : (dur <= 180 ? 6 : 20);
    const times = [];
    for (let t = 0.3; t < dur - 0.3; t += step) times.push(t);
    if (times.length > 40) { const k = Math.ceil(times.length / 40); const f = times.filter((_, i) => i % k === 0); times.length = 0; times.push(...f); }
    console.log('frames:', times.length);
    for (const t of times) {
      await page.evaluate((tt) => { const v = document.querySelector('video'); if (v) v.currentTime = tt; }, t).catch(() => {});
      await page.waitForTimeout(700);
      const name = path.join(OUT, `f_${String(Math.round(t * 10) / 10).replace('.', '_')}s.jpg`);
      const v = page.locator('video');
      let ok = false;
      if (await v.count()) { try { await v.screenshot({ path: name, type: 'jpeg', quality: 85, timeout: 10000 }); ok = true; } catch (e) {} }
      if (!ok) await page.screenshot({ path: name, type: 'jpeg', quality: 85 }).catch(() => {});
    }
  }
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
