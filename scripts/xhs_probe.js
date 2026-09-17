/* 小红书通用探针 v2：xhslink 短链或完整 URL → 加载页面存 HTML
 * 用法: node xhs_probe.js <分享链接或完整URL> <outputDir>
 * 后续: python xhs_parse.py <outputDir>（提取元数据/字幕/评论）
 *
 * 踩坑修复（2026-09-07）:
 *  - 游客直访笔记页偶发返回 6KB App 引导页 或 登录墙(SSR 被剥详情)
 *    解法① 预热 cookie：先访问 xiaohongshu.com 首页建立 cookie，再访问笔记
 *    解法② 若首轮 HTML 过小/无 SSR，自动换 桌面 UA+stealth 重试
 * 依赖: playwright（见 SKILL.md 环境安装说明）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INPUT = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

function resolveUrl(input) {
  if (input.includes('xiaohongshu.com')) return input;
  try {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    return execSync(`curl -sL -o /dev/null -w "%{url_effective}" -A "${ua}" "${input}"`, { timeout: 30000 }).toString();
  } catch (e) { return input; }
}

async function grab(browser, realUrl, outDir, mobile) {
  const ctx = await browser.newContext(mobile ? {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 420, height: 1800, isMobile: true, hasTouch: true }, locale: 'zh-CN',
  } : {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 2000 }, locale: 'zh-CN',
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  const page = await ctx.newPage();
  try {
    // 预热 cookie：先访问首页再访问笔记（游客被剥详情的常见解法）
    await page.goto('https://www.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.goto(realUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) { console.log('goto warn:', String(e).slice(0, 80)); }
  await page.waitForTimeout(9000);
  for (let i = 0; i < 10; i++) { await page.evaluate(() => window.scrollBy(0, 1300)).catch(() => {}); await page.waitForTimeout(1000); }
  await page.waitForTimeout(2000);
  const html = await page.content().catch(() => '');
  const txt = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
  fs.writeFileSync(path.join(outDir, 'page.html'), html);
  fs.writeFileSync(path.join(outDir, 'page.txt'), txt);
  await ctx.close();
  return { htmlLen: html.length, hasSSR: html.includes('__INITIAL_STATE__'), txt: txt.slice(0, 200) };
}

(async () => {
  const realUrl = resolveUrl(INPUT);
  console.log('url:', realUrl.slice(0, 160));
  fs.writeFileSync(path.join(OUT, 'real_url.txt'), realUrl);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });

  // 第 1 轮：手机 UA + 预热 cookie
  let r = await grab(browser, realUrl, OUT, true);
  console.log(`[mobile] len=${r.htmlLen} SSR=${r.hasSSR} head=${r.txt.replace(/\n/g, ' ').slice(0, 80)}`);

  // 若被剥详情（HTML 过小或引导页/登录墙），第 2 轮：桌面 UA 重试
  if (r.htmlLen < 50000 || !r.hasSSR) {
    console.log('→ mobile attempt weak, retry desktop…');
    r = await grab(browser, realUrl, OUT, false);
    console.log(`[desktop] len=${r.htmlLen} SSR=${r.hasSSR} head=${r.txt.replace(/\n/g, ' ').slice(0, 80)}`);
  }

  const finalHtml = fs.readFileSync(path.join(OUT, 'page.html'), 'utf-8');
  const ok = finalHtml.length > 50000 && finalHtml.includes('__INITIAL_STATE__');
  console.log(ok ? '✅ SSR page captured (run xhs_parse.py next)' : '❌ 仍未拿到完整内容页（可能需要登录 cookie）');
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
