// Writes the promo's scenes (compositions/*.html) and index.html from one place: the shots (real app captures),
// the copy and the timing. Run: node build.mjs — then `npx hyperframes check`. Edit the copy here, not in the output.
import fs from 'node:fs';

const W = 1080, H = 1920;
// a crop of a real capture (1170×2532, 3×): its rows y0..y1, shown 960 px wide (0.891×)
const S = 960 / (1125 - 48);
const crop = (id, file, y0, y1, top, extra = '') => {
  const h = Math.round((y1 - y0) * S);
  return `<div id="${id}" class="shot" data-layout-allow-overflow style="top:${top}px;height:${h}px" ${extra}><img src="assets/shots/${file}.png" alt="" style="left:${(-48 * S).toFixed(1)}px;top:${(-y0 * S).toFixed(1)}px;width:${(1170 * S).toFixed(1)}px"></div>`;
};
// the app's own fonts (variable, every weight), inside the files: a path from a scene did not load and the titles
// fell back to a serif
const font64 = (f) => fs.readFileSync(`assets/fonts/${f}.woff2`).toString('base64');
const FONTS = [['Rubik', '300 900', 'Rubik-hebrew', 'U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F'], ['Rubik', '300 900', 'Rubik-latin', ''], ['Fredoka', '300 700', 'Fredoka-latin', '']]
  .map(([f, w, file, range]) => `@font-face{font-family:'${f}';font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${font64(file)}) format('woff2');${range ? `unicode-range:${range};` : ''}}`).join('\n');
const BASE = `${FONTS}
#root{position:absolute;inset:0;overflow:hidden;background:#F4F1FF;color:#1B1530;font-family:'Rubik',sans-serif;direction:rtl}
.t{position:absolute;left:70px;right:70px;text-align:center;font-weight:900;font-size:112px;line-height:1.04;letter-spacing:-.01em}
.sub{position:absolute;left:70px;right:70px;text-align:center;font-weight:700;font-size:58px;line-height:1.2;color:#4A3F6B}
.shot{position:absolute;left:60px;width:960px;overflow:hidden;border-radius:44px;box-shadow:0 30px 70px rgba(40,20,120,.22);background:#fff}
.shot img{position:absolute}
.purple{background:linear-gradient(160deg,#4F2BD9 0%,#6A35E0 45%,#8E44E8 100%);color:#fff}
.num{font-family:'Fredoka','Rubik',sans-serif;font-weight:700;direction:ltr;unicode-bidi:isolate}`;

// scene: [id, duration, extra css, markup, timeline js]
const SCENES = [
  ['hook', 2.4, `#hook-t{top:190px}`,
    `<h1 id="hook-t" class="t">חסר לך כסף<br>בתלוש?</h1>
     ${crop('hook-card', 'payslip', 655, 1170, 520)}
     ${crop('hook-counts', 'payslip', 375, 635, 1040)}`,
    // frame 0 is the thumbnail: everything already there; the camera pushes in on the missing money
    `tl.fromTo('#hook-card', { scale: 1 }, { scale: 1.06, duration: 2.3, ease: 'power1.inOut' }, 0);
     tl.fromTo('#hook-counts', { y: 0 }, { y: 24, duration: 2.3, ease: 'power1.inOut' }, 0);`],
  ['tension', 2.6, `#ten-t{top:190px} #ten-t2{top:190px}`,
    `<h1 id="ten-t" class="t">שעות שלא<br>שולמו</h1>
     <h1 id="ten-t2" class="t">ושבת בתעריף<br>נמוך</h1>
     ${crop('ten-f1', 'payslip', 1285, 1890, 460)}
     ${crop('ten-f2', 'payslip', 2005, 2240, 1030)}`,
    `tl.fromTo('#ten-f1', { y: 90, scale: .94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .45, ease: 'power3.out' }, 0);
     tl.fromTo('#ten-t', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0.05);
     tl.to('#ten-t', { opacity: 0, duration: .2, ease: 'power2.in' }, 1.25);
     tl.fromTo('#ten-t2', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 1.35);
     tl.fromTo('#ten-f2', { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: .45, ease: 'power3.out' }, 1.3);`],
  ['reveal', 2.4, `#rv-logo{position:absolute;left:390px;top:330px;width:300px;height:300px;border-radius:70px;box-shadow:0 30px 60px rgba(0,0,0,.25)}
     #rv-name{top:700px;font-size:170px;color:#fff} #rv-sub{top:930px;color:#fff;opacity:.92;font-size:64px}`,
    `<div id="rv-bg" class="clip purple" data-start="0" data-duration="2.4" style="position:absolute;inset:0"></div>
     <img id="rv-logo" src="assets/logo.png" alt="">
     <h1 id="rv-name" class="t">שעתי</h1>
     <div id="rv-sub" class="sub">השכר שלך, לפי החוק</div>`,
    `tl.fromTo('#rv-logo', { scale: .55, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: .55, ease: 'back.out(1.6)' }, 0.25);
     tl.fromTo('#rv-name', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, 0.55);
     tl.fromTo('#rv-sub', { opacity: 0, y: 30 }, { opacity: .92, y: 0, duration: .4, ease: 'power3.out' }, 0.65);`],
  ['timer', 3.0, `#tm-t{top:190px} #tm-tap{position:absolute;left:470px;top:735px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.55);border:6px solid #fff}`,
    `<h1 id="tm-t" class="t">לוחצים<br>כשמגיעים</h1>
     ${crop('tm-btn', 'home', 1000, 1210, 710)}
     <div id="tm-tap"></div>
     ${crop('tm-card', 'timer', 1000, 1665, 520)}`,
    // the tap on the real start button, then the live timer that replaces it (a real click's result)
    `tl.fromTo('#tm-t', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0);
     tl.fromTo('#tm-btn', { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out' }, 0);
     tl.fromTo('#tm-tap', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .18, ease: 'power2.out' }, 0.5);
     tl.to('#tm-tap', { scale: 1.6, opacity: 0, duration: .35, ease: 'power2.out' }, 0.68);
     tl.to('#tm-btn', { scale: .96, duration: .08, ease: 'power2.out' }, 0.55);
     tl.to('#tm-btn', { opacity: 0, scale: 1.04, duration: .15, ease: 'power2.in' }, 0.72);
     tl.fromTo('#tm-card', { opacity: 0, scale: .9, y: 60 }, { opacity: 1, scale: 1, y: 0, duration: .5, ease: 'power3.out' }, 0.9);`],
  ['pay', 3.0, `#py-t{top:190px} #py-sub{top:1190px}`,
    `<h1 id="py-t" class="t">השכר מחושב<br>לבד</h1>
     ${crop('py-card', 'galaxy', 215, 970, 450)}
     <div id="py-sub" class="sub">שבת, לילה ונוספות לפי החוק</div>`,
    `tl.fromTo('#py-t', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0);
     tl.fromTo('#py-card', { opacity: 0, y: 90, scale: .94 }, { opacity: 1, y: 0, scale: 1, duration: .5, ease: 'power3.out' }, 0.05);
     tl.fromTo('#py-card img', { scale: 1 }, { scale: 1.05, duration: 2.4, ease: 'power1.inOut', transformOrigin: '50% 30%' }, 0.5);
     tl.fromTo('#py-sub', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0.7);`],
  ['tax', 3.5, `#tx-t{top:190px} #tx-sub{top:1070px}`,
    `<h1 id="tx-t" class="t">ואפילו<br>החזר מס</h1>
     ${crop('tx-card', 'taxrefund', 378, 930, 500)}
     <div id="tx-sub" class="sub">עד 6 שנים אחורה</div>`,
    `tl.fromTo('#tx-t', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0);
     tl.fromTo('#tx-card', { opacity: 0, y: 90, scale: .94 }, { opacity: 1, y: 0, scale: 1, duration: .5, ease: 'power3.out' }, 0.15);
     tl.fromTo('#tx-sub', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0.9);`],
  ['payoff', 4.0, `#po-l{top:430px;color:#fff;font-size:70px}
     #po-n{position:absolute;left:0;right:0;top:560px;text-align:center;font-size:270px;line-height:1;color:#FFB020}
     #po-s{top:900px;color:#fff;font-size:66px} #po-note{top:1230px;color:#fff;opacity:.7;font-size:32px;font-weight:500}`,
    `<div id="po-bg" class="clip purple" data-start="0" data-duration="4" style="position:absolute;inset:0"></div>
     <div id="po-l" class="sub">שעתי מצאה לנועה</div>
     <div id="po-n" class="num">0 ₪</div>
     <div id="po-s" class="sub">שחסרו בתלוש ובמס</div>
     <div id="po-note" class="sub">דוגמה מנתוני ההדגמה של האפליקציה</div>`,
    // the number counts up to the two real findings together: ₪916 (payslip) + ₪907 (tax refund)
    `tl.fromTo('#po-l', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0.1);
     const box = { v: 0 }; const el = document.querySelector('#po-n');
     tl.fromTo(box, { v: 0 }, { v: 1823, duration: 1.3, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(box.v).toLocaleString('en-US') + ' ₪'; } }, 0.1);
     tl.fromTo('#po-n', { scale: .8 }, { scale: 1, duration: 1.3, ease: 'power2.out' }, 0.1);
     tl.to('#po-n', { scale: 1.08, duration: .12, ease: 'power2.out' }, 1.4);
     tl.to('#po-n', { scale: 1, duration: .3, ease: 'power2.inOut' }, 1.52);
     tl.fromTo('#po-s', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 1.5);
     tl.fromTo('#po-note', { opacity: 0 }, { opacity: .7, duration: .3 }, 1.7);`],
  ['claim', 2.3, `#cl-t{top:560px} #cl-s{top:880px}`,
    `<h1 id="cl-t" class="t">חינם ובלי<br>פרסומות</h1>
     <div id="cl-s" class="sub">בעברית, ערבית, רוסית ועוד</div>`,
    `tl.fromTo('#cl-t', { opacity: 0, scale: .92 }, { opacity: 1, scale: 1, duration: .4, ease: 'back.out(1.4)' }, 0.05);
     tl.fromTo('#cl-s', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 0.5);`],
  ['end', 4.0, `#en-logo{position:absolute;left:400px;top:300px;width:280px;height:280px;border-radius:66px;box-shadow:0 26px 50px rgba(40,20,120,.3)}
     #en-name{top:620px;font-size:150px} #en-btn{position:absolute;left:150px;right:150px;top:900px;height:150px;border-radius:75px;
       background:#FFB020;color:#2B1A00;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:72px;box-shadow:0 18px 40px rgba(255,150,0,.35)}
     #en-where{top:1110px;font-size:46px}`,
    `<img id="en-logo" src="assets/logo.png" alt="">
     <h1 id="en-name" class="t">שעתי</h1>
     <div id="en-btn">הורידו בחינם</div>
     <div id="en-where" class="sub"><span class="num" style="font-family:Rubik">Google Play · shaati.web.app</span></div>`,
    `tl.fromTo('#en-logo', { scale: 0, rotation: -12 }, { scale: 1, rotation: 0, duration: .6, ease: 'back.out(1.7)' }, 0.1);
     tl.fromTo('#en-name', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, 0.45);
     tl.fromTo('#en-btn', { opacity: 0, scale: .8 }, { opacity: 1, scale: 1, duration: .45, ease: 'back.out(1.8)' }, 0.9);
     tl.to('#en-btn', { scale: 1.05, duration: .25, ease: 'power2.inOut' }, 2.2);
     tl.to('#en-btn', { scale: 1, duration: .25, ease: 'power2.inOut' }, 2.45);
     tl.fromTo('#en-where', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 1.2);`],
];

fs.mkdirSync('compositions', { recursive: true });
let t = 0;
const hosts = [];
for (const [id, dur, css, html, js] of SCENES) {
  fs.writeFileSync(`compositions/${id}.html`, `<template>
  <style>
${BASE}
${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    ${html}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${js}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`);
  hosts.push(`      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${t.toFixed(2)}" data-duration="${dur}" data-track-index="1" data-track-kind="graphics" data-width="${W}" data-height="${H}"></div>`);
  t += dur;
}
const TOTAL = +t.toFixed(2);
// sound: each effect placed so its measured peak (npx hyperframes audio) lands one frame after its picture,
// given as [id, file, scene, the picture's time in that scene, volume] so a scene's new length moves its sounds too
const PEAK = { pop: 0.12, error: 0.745, 'whoosh-cinematic': 2.503, click: 0.073, whoosh: 0.162, 'whoosh-short': 0.162, riser: 3.472, 'impact-bass-1': 0.073, sparkle: 0.027 };
const LEN = { pop: 0.72, error: 1.62, 'whoosh-cinematic': 5.54, click: 0.37, whoosh: 0.57, 'whoosh-short': 0.57, riser: 4.4, 'impact-bass-1': 2.12, sparkle: 1.8 };
const START = {};
{ let x = 0; for (const [id, d] of SCENES) { START[id] = x; x += d; } }
const SFX = [
  ['s-pop1', 'pop', 'hook', 0.1, 0.6], ['s-err', 'error', 'tension', 0.2, 0.5], ['s-rev', 'whoosh-cinematic', 'reveal', 0.4, 0.7],
  ['s-click', 'click', 'timer', 0.55, 0.9], ['s-wh1', 'whoosh', 'pay', 0.05, 0.7], ['s-pop2', 'pop', 'tax', 0.3, 0.6],
  ['s-rise', 'riser', 'payoff', 1.4, 0.6], ['s-imp', 'impact-bass-1', 'payoff', 1.4, 0.85], ['s-wh2', 'whoosh-short', 'claim', 0.05, 0.6],
  ['s-spk', 'sparkle', 'end', 0.15, 0.6], ['s-pop3', 'pop', 'end', 0.95, 0.7],
].map(([id, f, sc, at, vol]) => [id, f, Math.max(0, +(START[sc] + at + 1 / 30 - PEAK[f]).toFixed(3)), vol]);
// one track per sound in turn (three lanes), each as long as its file
const audio = SFX.map(([id, f, at, vol], i) => `      <audio id="${id}" src="assets/sfx/${f}.mp3" data-start="${at}" data-duration="${LEN[f]}" data-volume="${vol}" data-track-index="${3 + (i % 3)}"></audio>`).join('\n');
fs.writeFileSync('index.html', `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      ${FONTS}
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #F4F1FF; }
      #root { position: relative; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}">
${hosts.join('\n')}
${audio}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`);
console.log('scenes', SCENES.length, 'total', TOTAL, 's');
