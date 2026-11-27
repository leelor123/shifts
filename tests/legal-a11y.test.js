/* Legal texts, consistency and accessibility (27 Nov 2026): what the app says matches what the code and the law do,
 * and the screens hold for people who need larger text or a screen reader. Each block guards one fix. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const app = read('app/app.js');

// the legal documents as the app builds them (inside the Android app or not)
function legalDocs(androidApp) {
  const ctx = { document: { addEventListener() {} } };
  ctx.window = ctx;
  ctx.App = { sheetsApi: {}, actions: {}, androidApp };
  ctx.Store = { S: { settings: {} } };
  ctx.UI = { icon: () => '', esc: (s) => String(s) };
  vm.createContext(ctx);
  vm.runInContext(read('app/views-legal.js'), ctx);
  return ctx.App.LEGAL_DOCS;
}

T.section('legal texts and accessibility (27 Nov 2026)');
T.test('installed app: pinch zoom stays off (the owner) with the reason written; text sizes are rem so the phone font size applies', () => {
  T.ok(/maximum-scale=1, user-scalable=no/.test(app), 'the zoom lock is the owner\'s choice');
  T.ok(/WCAG 1\.4\.4[\s\S]{0,300}rem\/em[\s\S]{0,300}200%/.test(app), 'the comment by the viewport line says what makes up for it');
  const css = ['styles.css', 'styles-v3.css', 'styles-v4.css'].map(read).join('\n');
  T.ok(/html \{ font-size: calc\(100% \* var\(--fs\)\); \}/.test(css), 'the root follows the browser\'s font size (not 16px)');
  const px = css.split('\n').filter((l) => /font-size:\s*[\d.]+px/.test(l) && !/^\.chart text/.test(l.trim()));
  T.eq(px.join(' | '), '', 'no text sized in px');
});
T.test('installed app: a long press on reading text keeps the phone\'s menu; on a control it does not', () => {
  const body = app.slice(app.indexOf("App.READ_TEXT = '"), app.indexOf('\n  };', app.indexOf('App.copyOnHold = function')) + 5);
  const App = {};
  new Function('App', 'root', body)(App, {});
  const el = (inside) => ({ closest: (sel) => (sel.split(',').map((s) => s.trim()).some((s) => inside.includes(s)) ? {} : null) });
  const ev = (inside) => { const e = { target: el(inside), prevented: false, preventDefault() { this.prevented = true; } }; App.copyOnHold(e); return e.prevented; };
  T.ok(!ev(['p']), 'a paragraph: the phone menu');
  T.ok(!ev(['li', '.legal']), 'a legal text: the phone menu');
  T.ok(ev(['p', 'button']), 'a paragraph inside a button: blocked');
  T.ok(ev(['.nav']), 'the navigation: blocked');
  T.ok(!ev(['input']), 'a field: the phone menu');
  T.ok(/html\.app-shell :is\(p, li, dd, blockquote, \.legal, \.read-text\):not\(/.test(read('styles-v3.css')), 'reading text is selectable in the app shell');
});
T.test('toggle buttons say which one is on (aria-pressed), and every icon-only button has a name', () => {
  T.ok(/App\.SEG_BTN = '\.seg:not\(\[role="tablist"\]\) > button, \.color-pick > button, \.font-pick > button'/.test(app), 'the shared selector');
  T.ok(/attributeFilter: \['class', 'aria-pressed'\]/.test(app), 'kept in step with the on class, also after a redraw');
  const bad = [];
  for (const f of fs.readdirSync(path.join(SRC, 'app')).filter((x) => x.endsWith('.js'))) {
    const s = read('app/' + f); const re = /<button([^>]*)>\s*\$\{icon\('[\w-]+'(?:, '[\w-]+')?\)\}\s*<\/button>/g; let m;
    while ((m = re.exec(s))) if (!/aria-label|title=/.test(m[1])) bad.push(f + ': ' + m[0].slice(0, 80));
  }
  T.eq(bad.join(' | '), '');
});
T.test('calendar days: readable text, and a big font hides the amount rather than cutting it', () => {
  const css = read('styles.css');
  const size = (sel) => +(new RegExp(sel.replace(/\./g, '\\.') + ' \\{[^}]*font-size: ([\\d.]+)rem').exec(css) || [])[1];
  for (const s of ['.cal-day .hd', '.cal-day .amt', '.cal-day .hol']) T.ok(size(s) >= 0.66, s + ' ' + size(s));
  T.ok(/\.cal-grid \{[^}]*repeat\(7, minmax\(0, 1fr\)\)[^}]*grid-auto-rows: 1fr/.test(css), 'seven equal columns, equal rows');
  T.ok(/@container \(max-width: [\d.]+rem\) \{ \.cal-day \.amt \{ display: none; \} \}/.test(css), 'the amount steps aside in a narrow day');
});
T.test('rights texts match the engine and the law', () => {
  const r = read('app/views-rights.js');
  T.ok(!/מעודכן לאפריל|מעודכן ל[א-ת]+ 20\d\d/.test(r), 'no hand-written "updated" date');
  T.ok(/Engine\.MIN_WAGE\[Engine\.MIN_WAGE\.length - 1\]/.test(r), 'the date comes from the legal table');
  T.ok(/חג שחל בשבת לא משולם כדמי חג/.test(r) && !/חג ביום שישי או בשבת משתלם רק/.test(r), 'a Shabbat holiday is never paid (engine.js holidayPay)');
  T.ok(/dow === 6 \|\| \(dow === 5 && !usual\)/.test(read('core/engine.js')), 'the engine rule the text follows');
  T.ok(/בין משמרת למשמרת מגיעות <b>8 שעות<\/b>/.test(r) && !/בין שני ימי עבודה, ומנוחה/.test(r), 'the rest between shifts is a whole sentence');
  T.ok(/רשימה סגורה בחוק הגנת השכר/.test(r) && !/בדרך כלל אסור לנכות בלי הסכמה/.test(r), 'fines and shortages are never deductible (Wage Protection Law §25)');
});
T.test('form 135: the yearly assessment caveat in the app, its report and the website', () => {
  T.ok(/tr-caveat[\s\S]{0,400}לפעמים מתברר שצריך לשלם/.test(read('app/views-taxrefund.js')), 'the app');
  T.ok(/<p><b>לפני שמגישים:<\/b>[^<]*לפעמים מתברר שצריך לשלם/.test(read('app/views-taxrefund.js')), 'the report');
  T.ok(/לפעמים מתברר שצריך לשלם/.test(fs.readFileSync(path.join(ROOT, 'site', 'tax-refund.html'), 'utf8')), 'the website');
});
T.test('no text promises money that is only an estimate', () => {
  for (const f of ['app/views-home.js', 'app/views-payslip.js', 'app/views-rights.js']) T.ok(!/מגיעים לך <span|שהגיעו לך|שעתי החזירה לך|הכסף חזר אליך|לפי האפליקציה מגיעים לך/.test(read(f)), f);
});
T.test('terms inside the Android app speak only of Google Play purchases; the website keeps the full text', () => {
  const web = legalDocs(false).terms.html, play = legalDocs(true).terms.html;
  T.ok(/Lemon Squeezy/.test(web), 'web: Lemon Squeezy is named');
  T.ok(!/Lemon Squeezy/.test(play), 'app: no web checkout');
  T.ok(/Google Play/.test(play), 'app: Google Play');
});
T.test('the privacy policy matches the code', () => {
  const d = legalDocs(false);
  T.ok(!/היא כבויה עד שמסכימים/.test(d.privacy.html) && /לא נאסף ולא נשלח עד שמאשרים/.test(d.privacy.html), 'statistics: nothing before the confirm (stats.js Stats.enabled)');
  T.ok(/S\.settings\.statsAsked === true && S\.settings\.shareStats === true/.test(read('app/stats.js')), 'the gate the text describes');
  T.ok(!/התנתקות מוחקת את הנתונים מהמכשיר ומשאירה אותם בחשבון\./.test(d.privacy.html) && /מוצפנים, וחוזרים רק כשאותו חשבון מתחבר/.test(d.privacy.html), 'sign-out as cloud.js does it');
  const crop = /חותכים את התמונה כך שיישאר בה רק החלק שלך/;
  T.ok(crop.test(d.terms.html) && crop.test(d.privacy.html), 'terms §4 and privacy §7 say the same about schedule photos');
  const look = read('app/views-settings.js');
  const mount = look.slice(look.indexOf('RENDER.look = {'), look.indexOf('RENDER.security'));
  T.ok(!/fontCss\(/.test(mount), 'no Google font is fetched to draw the previews');
  T.ok(/נטענים מ-⁠Google Fonts רק אם בוחרים אחד מהם/.test(d.licenses.html), 'as the licenses page says');
});
T.test('the licenses page names the Android libraries tools/android.js adds, and Sentry', () => {
  const lic = legalDocs(false).licenses.html, android = fs.readFileSync(path.join(ROOT, 'tools', 'android.js'), 'utf8');
  for (const [dep, name] of [['androidbrowserhelper', 'Android Browser Helper'], ['androidx.credentials', 'AndroidX Credentials'], ['play-services-location', 'Google Play services'], ['play:review', 'Play In-App Review'], ['googleid', 'Google Identity Services']]) {
    T.ok(android.includes(dep), 'android.js adds ' + dep);
    T.ok(lic.includes(name), 'licenses name ' + name);
  }
  T.ok(/<b>Sentry<\/b>/.test(lic), 'Sentry');
});
T.test('the champions table never fills in a real name', () => {
  const lb = read('app/views-leaderboard.js');
  const prof = lb.slice(lb.indexOf('Champions.profile = function'), lb.indexOf('UI.openSheet', lb.indexOf('Champions.profile = function')));
  T.ok(!/firstName\(/.test(prof) && /LB\.randomNick\(\)/.test(prof), 'a neutral nickname to start from');
  T.ok(!/id="lb-n"[^>]*autocomplete="given-name"/.test(lb), 'no name autofill on the nickname');
});
T.test('examples never name a real business', () => {
  const bad = [];
  for (const d of ['app', 'core']) for (const f of fs.readdirSync(path.join(SRC, d)).filter((x) => x.endsWith('.js'))) if (/יוחננוף|קפה גרג|רמי לוי|שופרסל|ארומה/.test(read(d + '/' + f))) bad.push(f);
  T.eq(bad.join(', '), '');
});
T.test('someone under 18 is never offered Plus unasked: every offer goes through Plus.noOffers', () => {
  const p = read('app/plus.js');
  T.ok(/Plus\.noOffers = \(\) => !sim\(\) && !!root\.Engine\.isMinor\(S\.settings\)/.test(p), 'one rule');
  T.ok(/Plus\.tipCard = \(\) => \(Plus\.tips\.length && !sim\(\) && !Plus\.noOffers\(\)/.test(p), 'the tip card');
  T.ok(/n\.never \|\| Plus\.noOffers\(\)/.test(p), 'the nudge card');
  T.ok(/const minor = Plus\.noOffers\(\);[\s\S]{0,1600}\$\{minor \? '' : Plus\.canTrial\(\)/.test(p), 'the allowance sheet');
  T.ok(/rec\.type === 'plusend' && root\.Plus && !root\.Plus\.noOffers\(\)/.test(read('app/views-insights.js')), 'the trial-end notice');
  T.eq((p.match(/Engine\.isMinor\(/g) || []).length, 1, 'no second, different check');
});
T.test('the Play data safety answers include the error reports (errors.js sends them to Firestore and Sentry)', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'play-store', 'APP-CONTENT.md'), 'utf8');
  T.ok(/Sentry/.test(read('app/errors.js')), 'errors.js sends to Sentry');
  T.ok(/\*\*App info and performance › Crash logs\*\* \| Yes/.test(doc), 'Crash logs ticked');
  T.ok(!/no crash reporting/.test(doc), 'the old answer is gone');
  T.ok(/Owner action[\s\S]{0,200}Play Console/.test(doc), 'the owner updates the Console');
});
