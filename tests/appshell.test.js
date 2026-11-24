/* The installed app never feels like a website (24 Nov 2026): links out of it open over it, the CSV export goes to the
 * share sheet, fields that ask for nothing personal get no autofill offers, no browser dialogs or ungated hover, no scroll
 * bars on a touch screen, and an offline first open is a screen in the app's colours in every language. The rules that
 * need a page are in shaati-handoff/qa/appshell-test.js. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const app = read('app/app.js');

// App.leavesApp, taken from the app's code as it is
const body = app.slice(app.indexOf('App.leavesApp = function'), app.indexOf('\n  };', app.indexOf('App.leavesApp = function')) + 5);
const App = {};
new Function('App', body)(App);
const HERE = 'https://leelor123.github.io/shifts/?source=twa#home';

T.section('the installed app: links, files, fields');
T.test('a link to another site or to a website page leaves the app; the app itself, its pages and the phone\'s links do not', () => {
  for (const u of ['https://www.kolzchut.org.il/he/x', 'https://www.gov.il/he/Departments/Guides/minimum-wage', 'https://www.btl.gov.il/', 'http://example.com',
    'https://leelor123.github.io/shifts/privacy.html', 'https://leelor123.github.io/other/', '/shifts/terms.html']) T.ok(App.leavesApp(u, HERE), u);
  for (const u of ['https://leelor123.github.io/shifts/', './?action=note#home', 'index.ru.html', '#home', 'mailto:a@b.c', 'tel:+972500000000',
    'intent://details?id=x#Intent;scheme=market;end', 'whatsapp://send?text=x']) T.ok(!App.leavesApp(u, HERE), u);
});
T.test('the app shell sends links out through App.linkOut and gives every drawn field its hint', () => {
  T.ok(/document\.addEventListener\('click', App\.linkOut\)/.test(app), 'linkOut bound');
  T.ok(/beforeinstallprompt/.test(app) && /'dragstart'/.test(app), 'install offer and drags are the app\'s');
  T.ok(/App\.fieldHints\(document\)/.test(app) && /setAttribute\('autocomplete', 'off'\)/.test(app), 'fields get autocomplete="off"');
});
T.test('the CSV exports use UI.saveFile (the share sheet in the app), never a bare download', () => {
  const ex = read('app/export.js');
  T.ok(!/UI\.download\([^)]*csv/.test(ex), 'no UI.download of a CSV');
  T.eq((ex.match(/UI\.saveFile\(/g) || []).length, 2);
  T.ok(/function saveFile[\s\S]{0,400}app-shell[\s\S]{0,80}shareFile/.test(read('app/ui.js')), 'saveFile shares in the app shell');
});
T.test('no browser dialog (alert, confirm, prompt) anywhere in the app', () => {
  const files = ['app', 'core'].flatMap((d) => fs.readdirSync(path.join(SRC, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f));
  const bad = [];
  for (const f of files) {
    read(f).split('\n').forEach((l, i) => { if (/(^|[^.\w])(window\.)?(alert|confirm|prompt)\(/.test(l.replace(/\/\/.*$/, '')) && !/function (confirm|prompt)/.test(l)) bad.push(f + ':' + (i + 1)); });
  }
  T.eq(bad.join(', '), '');
});

T.section('the installed app: styles');
const css = ['styles.css', 'styles-v3.css', 'styles-v4.css'].map(read).join('\n');
T.test('no :hover rule outside (hover: hover) and (pointer: fine) (a tap left it stuck)', () => {
  const plain = css.replace(/@media[^{]*hover:\s*hover[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  T.ok(!/:hover/.test(plain), 'ungated :hover');
});
T.test('a ring shows for the keyboard only (:focus-visible), the tap highlight is off', () => {
  T.ok(/\*\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/.test(css), 'tap highlight');
  const rings = [...css.matchAll(/([^{}]*):focus(?![-\w])[^{]*\{([^}]*)\}/g)].filter((m) => /outline:(?!\s*(none|0)\b)/.test(m[2]));
  T.eq(rings.map((m) => m[1].trim()).join(' | '), '', 'an outline on plain :focus');
});
T.test('no scroll bar on a touch screen in the app, no sideways overscroll, nothing dragged off', () => {
  T.ok(/@media \(pointer: coarse\) \{ html\.app-shell, html\.app-shell \* \{ scrollbar-width: none; \} \}/.test(css), 'scrollbars');
  T.ok(/html\.app-shell, html\.app-shell body \{ overscroll-behavior: none; \}/.test(css), 'overscroll');
  T.ok(/html\.app-shell :is\(img, a, svg\) \{ -webkit-user-drag: none; \}/.test(css), 'drag');
  T.ok(/html, body \{ overscroll-behavior-y: none; \}/.test(css), 'no browser pull-to-refresh on the website either (the app has its own)');
});

T.section('the installed app: offline');
T.test('a first open with no connection is a page in the app\'s colours, with a way to try again, in every language', () => {
  const sw = read('sw.js');
  T.ok(/catch \(err\) \{ return offlinePage\(lang\); \}/.test(sw), 'the navigation falls back to offlinePage');
  T.ok(!/text\/plain/.test(sw), 'no plain-text page');
  const words = sw.slice(sw.indexOf('const WORDS = {'), sw.indexOf('};', sw.indexOf('const WORDS = {')));
  for (const l of ['he', 'ar', 'ru', 'en', 'fr', 'es', 'am']) T.ok(new RegExp('\\b' + l + ": \\{ offline: '[^']+', first: '[^']+', retry: '[^']+' \\}").test(words), l);
  T.ok(/<a href=\\?"\\?">/.test(sw) || /<a href=""/.test(sw) || /<a href=\\"\\">/.test(sw), 'the retry opens the same address again');
});
