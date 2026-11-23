// Renders the web splash logo (src/index.html #intro .intro-logo: 58px box, scale(2) = 116dp) to Android splash PNGs.
// usage: node tools/render-splash.js <path to puppeteer-core> android/res   (the launcher splash = the page's #intro logo, same size)
const puppeteer = require(process.argv[2]);
const out = process.argv[3];
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const CANVAS = 160, BOX = 116; // dp; box centred, room for the round stroke caps
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  for (const [d, s] of Object.entries(dens)) {
    await p.setViewport({ width: CANVAS, height: CANVAS, deviceScaleFactor: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">
      <div style="position:absolute;left:${(CANVAS-BOX)/2}px;top:${(CANVAS-BOX)/2}px;width:${BOX}px;height:${BOX}px">
      <svg viewBox="0 0 1024 1024" style="display:block;width:100%;height:100%;overflow:visible">
      <path d="M300 660 A258 258 0 0 1 603 271 L603 600" fill="none" stroke="#2ee59d" stroke-width="104" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M420 422 L420 753 A258 258 0 0 0 720 362" fill="none" stroke="#f5b93e" stroke-width="104" stroke-linecap="round" stroke-linejoin="round"/>
      </svg></div></body></html>`);
    require('fs').mkdirSync(`${out}/drawable-${d}`, { recursive: true });
    await p.screenshot({ path: `${out}/drawable-${d}/splash.png`, omitBackground: true });
  }
  await b.close();
})();
