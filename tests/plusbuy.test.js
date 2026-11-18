/* Buying Plus (plus.js): Google Play's offers on a subscription (a free trial, the founders' price) read from what
 * Play returns and said in full before paying; the reminder the day before Play's free trial ends; the thank-you
 * tip once per finding and never to someone under 18; the recap in the card's design for Plus only. Every one of
 * them shows nothing when Google Play does not return the product or the offer (none exists in Play Console yet). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = rd('src/app/plus.js');

/** plus.js in a page of its own: just enough of the app around it. */
function load(over) {
  const S = { meta: {}, settings: { skin: '' } };
  const ctx = {
    console, Intl, Date, Math, JSON, Promise, setTimeout, clearTimeout, URLSearchParams,
    navigator: { userAgent: 'test', onLine: true },
    document: { documentElement: { dataset: {}, style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} } } },
    App: { actions: {}, applyTheme() {}, rerender() {}, isAdmin: false },
    Store: { S, setMeta: async (p) => Object.assign(S.meta, p), setSettings: async (fn) => fn(S.settings) },
    UI: { icon: (n) => `<i data-i="${n}"></i>`, esc: (x) => String(x), toast() {} },
    U: { LOCALE: 'he-IL', fmtDate: (k) => k, epochKey: (t) => new Date(t).toISOString().slice(0, 10) },
    Engine: { isMinor: (s) => !!s.minor },
  };
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { Plus: ctx.Plus, S, ctx };
}
const ILS = (v) => ({ currency: 'ILS', value: v });
const playWith = (items, owned) => ({
  getDigitalGoodsService: async () => ({
    getDetails: async (ids) => items.filter((x) => ids.includes(x.itemId)),
    listPurchases: async () => (owned || []).map((itemId) => ({ itemId, purchaseToken: 't-' + itemId })),
  }),
});

T.section('Plus: Google Play offers');
T.test('a period from Google Play in days', () => {
  const { Plus } = load();
  T.eq(Plus.periodDays('P7D'), 7); T.eq(Plus.periodDays('P1W'), 7); T.eq(Plus.periodDays('P1M'), 30);
  T.eq(Plus.periodDays(''), 0); T.eq(Plus.periodDays('7 days'), 0); T.eq(Plus.periodDays(undefined), 0);
});
T.test('the offer: a free trial, a lower introductory price; a higher or broken one is no offer', () => {
  const { Plus } = load();
  const base = { itemId: 'shaati_plus_monthly', price: ILS('6.90'), subscriptionPeriod: 'P1M' };
  T.eq(Plus.offerOf(Object.assign({ freeTrialPeriod: 'P7D' }, base)).trial, 7);
  const o = Plus.offerOf(Object.assign({ introductoryPrice: ILS('3.90'), introductoryPricePeriod: 'P1M', introductoryPriceCycles: 3 }, base));
  T.eq(o.intro.value, 3.9); T.eq(o.intro.n, 3); T.ok(/3\.90/.test(o.intro.price));
  T.ok(!Plus.offerOf(Object.assign({ introductoryPrice: ILS('9.90'), introductoryPricePeriod: 'P1M', introductoryPriceCycles: 3 }, base)).intro, 'not lower');
  T.ok(!Plus.offerOf(Object.assign({ introductoryPrice: ILS('3.90') }, base)).intro, 'no period');
  T.eq(JSON.stringify(Plus.offerOf(base)), '{}');
});
T.test('the founders\' price in words, every length', () => {
  const { Plus } = load();
  const t = (per, n) => Plus.introText({ price: '₪3.90', per, n });
  T.eq(t('P1M', 1), '₪3.90 לחודש בחודש הראשון');
  T.eq(t('P1M', 2), '₪3.90 לחודש בחודשיים הראשונים');
  T.eq(t('P1M', 6), '₪3.90 לחודש ב-6 החודשים הראשונים');
  T.eq(t('P3M', 1), '₪3.90 ל-3 חודשים ב-3 החודשים הראשונים');
  T.eq(t('P1Y', 1), '₪3.90 לשנה בשנה הראשונה');
  T.eq(t('P1W', 2), '₪3.90 לשבוע בשבועיים הראשונים');
});
T.atest('nothing from Google Play: no offer, no yearly plan, no tips, Plus hidden', async () => {
  const { Plus } = load(playWith([]));
  await Plus.init();
  T.ok(!Plus.available && !Plus.yearly && !Plus.tips.length && !Object.keys(Plus.offers).length && !Plus.visible());
});
T.atest('Google Play returns the monthly plan with a trial and the yearly one with a founders\' price: both kept, each with its own', async () => {
  const { Plus } = load(playWith([
    { itemId: 'shaati_plus_monthly', price: ILS('6.90'), subscriptionPeriod: 'P1M', freeTrialPeriod: 'P7D' },
    { itemId: 'shaati_plus_yearly', price: ILS('49.90'), subscriptionPeriod: 'P1Y', introductoryPrice: ILS('39.90'), introductoryPricePeriod: 'P1Y', introductoryPriceCycles: 1 },
    { itemId: 'shaati_tip_small', price: ILS('9.90') }, { itemId: 'shaati_tip_large', price: ILS('29.90') }, { itemId: 'shaati_tip_medium', price: ILS('19.90') },
  ]));
  await Plus.init();
  T.ok(Plus.available && Plus.monthly && Plus.yearly && Plus.yearly.sku === 'shaati_plus_yearly');
  T.eq(Plus.offers.shaati_plus_monthly.trial, 7);
  T.eq(Plus.offers.shaati_plus_yearly.intro.value, 39.9);
  T.eq(Plus.saving(), Math.round((1 - 49.9 / (6.9 * 12)) * 100), 'the yearly plan marked with its saving');
  T.eq(Plus.tips.map((x) => x.value).join(), '9.9,19.9,29.9', 'tips from the cheapest');
});

T.section('Plus: the reminder before Google Play\'s free trial ends');
T.atest('the day before: what will be charged and where to stop it; not two days before, not after', async () => {
  const { Plus, S } = load(playWith([{ itemId: 'shaati_plus_monthly', price: ILS('6.90'), subscriptionPeriod: 'P1M' }], ['shaati_plus_monthly']));
  await Plus.init();
  T.ok(Plus.owned());
  const now = Date.now();
  S.meta.plusPlayTrial = { sku: 'shaati_plus_monthly', from: now - 6 * 864e5, until: now + 20 * 3600e3, then: '₪6.90 לחודש' };
  const a = Plus.endAlert(now);
  T.ok(a && a.type === 'plusend' && /מחר/.test(a.title) && /₪6\.90 לחודש/.test(a.body) && /תשלומים ומינויים/.test(a.body), JSON.stringify(a));
  T.eq(Plus.endAlert(now - 864e5), null, 'two days before');
  T.eq(Plus.endAlert(now + 20 * 3600e3), null, 'after it ended');
  S.meta.plusPlayTrial = null;
  T.eq(Plus.endAlert(now), null, 'bought without a trial: nothing');
});
T.test('kept at purchase only when the plan had a trial (buyPlay), and the page says until when', () => {
  T.ok(/if \(o\.trial && has !== false\) await Store\.setMeta\(\{ plusPlayTrial:/.test(src));
  T.ok(/ניסיון חינם ב-⁠Google Play עד/.test(src));
});

T.section('Plus: the thank-you tip');
T.atest('offered with Google Play\'s prices; never to someone under 18', async () => {
  const items = [{ itemId: 'shaati_plus_monthly', price: ILS('6.90'), subscriptionPeriod: 'P1M' }, { itemId: 'shaati_tip_small', price: ILS('9.90') }];
  const a = load(playWith(items));
  await a.Plus.init();
  T.ok(/data-tip="0"/.test(a.Plus.tipCard()));
  const b = load(playWith(items));
  b.S.settings.minor = true;
  await b.Plus.init();
  T.eq(b.Plus.tipCard(), '');
});
T.test('once per finding: kept on the finding, also when its payslip is saved again', () => {
  const v = rd('src/app/views-payslip.js');
  T.ok(/const tip = back && !g\.tipAsked && root\.Plus/.test(v), 'asked only when not asked before');
  T.ok(/tip \? \{ tipAsked: true \} : \{\}/.test(v), 'saved with the finding');
  T.ok(/\.tipAsked\) gap\.tipAsked = true/.test(v), 'a payslip saved again keeps it');
  T.ok(/x\.status === 'resolved' && x\.id !== g\.id\)\.reduce\(\(sum, x\) => sum \+ x\.amount, 0\) \+ g\.amount/.test(v), 'the total counts this finding once');
  const set = v.slice(v.indexOf("App.actions['gap-set']"), v.indexOf("App.actions['found-share']"));
  T.eq((set.match(/tipCard\(\)/g) || []).length, 1, 'the card is drawn once, into tip');
  T.ok(/data-k="back">[^`]*<\/button>\s*\$\{tip\}`/.test(set), 'the sheet shows only the tip asked once');
});

T.section('Plus: the recap in the card\'s design');
T.test('for Plus only (Plus.skin is empty without it), never the photo', () => {
  const r = rd('src/app/views-recap.js');
  T.ok(/const skin = root\.Plus && root\.Plus\.skin \? root\.Plus\.skin\(\) : ''/.test(r));
  T.ok(/if \(skin && root\.Plus\.SKINS\[skin\]\) el\.classList\.add\('st-skin', 'sk-' \+ skin\)/.test(r));
  T.ok(/if \(!el\.classList\.contains\('st-skin'\)\) el\.dataset\.bg/.test(r));
  T.ok(/\.story\.st-skin \{ background: var\(--grad-hero\); \}/.test(rd('src/styles-v3.css')));
  const { Plus, S } = load();
  S.settings.skin = 'gold';
  T.eq(Plus.skin(), '', 'no Plus: no skin');
});
