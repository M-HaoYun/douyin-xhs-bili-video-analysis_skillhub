/* 抖音热榜/热点探测：实时热搜词榜 + 热点视频榜 + 页面在榜视频提取
 * 用法: node douyin_hot.js <outputDir>
 * 产出:
 *   hot_words.json   接口 aweme/v1/web/hot/search/list 完整响应（热搜词榜，word_list 带 hot_value）
 *   hotspot.json     接口 aweme/v1/web/channel/hotspot?channel_id=99 完整响应（热点视频精选流 aweme_list）
 *   page.html/txt    热榜页渲染结果（含 /video/{aweme_id} 链接与在榜标题/播放文本，用于 id↔标题配对）
 * 后续: python douyin_hot_parse.py <outputDir> 解析成可读清单
 * 依赖: playwright（见 SKILL.md 环境说明）
 * 实证(2026-09-07): 热搜词 51 条带 hot_value；hotspot 响应可达 400KB+，勿截断保存
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--lang=zh-CN', '--disable-web-security'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }, locale: 'zh-CN'
  });
  const page = await ctx.newPage();
  const hits = [];
  page.on('response', async (r) => {
    const u = r.url();
    try {
      const ct = r.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      let key = null;
      if (/aweme\/v1\/web\/hot\/search\/list/i.test(u)) key = 'hot_words';
      else if (/aweme\/v1\/web\/channel\/hotspot/i.test(u)) key = 'hotspot';
      if (!key) return;
      const t = await r.text();
      if (!hits.find(h => h.key === key)) {
        hits.push({ key, url: u.slice(0, 220), len: t.length, body: t }); // 完整保存，勿截断
        fs.writeFileSync(path.join(OUT, key + '.json'), t);
        console.log(`saved ${key}: ${t.length} bytes`);
      }
    } catch (e) {}
  });
  try { await page.goto('https://www.douyin.com/hot', { waitUntil: 'domcontentloaded', timeout: 45000 }); }
  catch (e) { console.log('goto warn:', e.message); }
  await page.waitForTimeout(8000);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 1500).catch(() => {}); await page.waitForTimeout(1200); }
  await page.waitForTimeout(3000);
  fs.writeFileSync(path.join(OUT, 'page.html'), await page.content().catch(() => ''));
  fs.writeFileSync(path.join(OUT, 'page.txt'), await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => ''));
  console.log('saved page.html/txt; api hits:', hits.length);
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
