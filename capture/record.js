// record.js — drive the demo headlessly and record its visuals to webm.
// Measures the preroll (page-create -> demo start) so the audio can be aligned.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const demoUrl = 'file:///' + path.resolve(__dirname, '..', 'demo', 'index.html').replace(/\\/g, '/');
  const nav = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
  const runSec = nav.total;
  const videoDir = path.join(__dirname, 'video');

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(demoUrl, { waitUntil: 'load' });
  await page.waitForTimeout(4500);            // let satellite tiles settle
  const prerollMs = Date.now() - t0;
  await page.evaluate(() => window.__startDemo && window.__startDemo());
  await page.waitForTimeout(runSec * 1000 + 4000);   // full run + tail

  const video = page.video();
  await context.close();                      // finalizes the webm
  const vpath = await video.path();
  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'preroll.json'),
    JSON.stringify({ prerollMs, runSec, video: vpath }, null, 2));
  console.log('recorded ' + vpath + '  preroll=' + prerollMs + 'ms run=' + runSec + 's');
})();
