/* The payslip check is the first offer for a new user (an advisory council, 14 Nov 2026: what no other app does was
 * the last line of three on the welcome sheet). The guards: the welcome sheet's first choice is the payslip, in every
 * language; its tap reaches the payslip sheet with no questions and no account, and is not taken as agreeing to the
 * terms (the terms' own screen asks, as for the demo); the first-steps card offers the payslip before the first shift;
 * the home queue keeps its limit of two cards. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');

const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

T.section('the payslip check comes first');
const ob = rd('src/app/views-onboarding.js');
const welcome = ob.slice(ob.indexOf('function welcome('), ob.indexOf('let welcomed'));

T.test('the welcome sheet offers the payslip check before every other way in', () => {
  const slip = welcome.indexOf('data-slip'), next = welcome.indexOf('data-next'), demo = welcome.indexOf('data-demo');
  T.ok(slip > 0, 'the welcome sheet has a payslip button');
  T.ok(slip < next && slip < demo, 'the payslip offer is above "I agree, let us start" and the demo');
  T.ok(/<button class="w-slip" data-slip/.test(welcome), 'the offer is one button: a single tap');
  T.ok(/יש לך תלוש\? אפשר לבדוק אותו עכשיו/.test(welcome), 'it says what it offers');
  T.ok(!/data-act=/.test(welcome), 'the welcome sheet uses its own handler, never data-act');
});

T.test('the payslip tap skips the questions and the account, and does not agree to the terms by itself', () => {
  const h = ob.slice(ob.indexOf("b.hasAttribute('data-slip')"), ob.indexOf("b.hasAttribute('data-demo')"));
  T.ok(h.length > 0, 'a data-slip handler, before the demo one');
  T.ok(/ensureSaved\(false\)/.test(h), 'the usual answers are saved, no demo data');
  T.ok(/enterApp\(\)/.test(h) && /App\.slipFirst\(\)/.test(h), 'the app opens and then the payslip sheet');
  T.ok(/needsLogin\(\)\)\s*\{\s*App\.localOnly = true;/.test(h) && /guest: true/.test(h), 'not signed in: a guest for now');
  T.ok(!/acceptLegal/.test(h), 'no agreement taken from this tap (App.afterLogin asks with the terms screen)');
  T.ok(/App\.firstRun = !demo && !slip/.test(ob), 'the coach marks do not cover the payslip sheet');
  const fn = ob.slice(ob.indexOf('App.slipFirst = function'), ob.indexOf('/* ---------------- demo data'));
  T.ok(/App\.blocking/.test(fn) && /\.sheet\.show, \.dialog/.test(fn), 'it waits for the terms screen, the lock and any sheet');
  T.ok(/App\.actions\['payslip-new'\]\(\)/.test(fn), 'it opens the payslip sheet');
});

T.test('every translation keeps the payslip offer first on the welcome sheet', () => {
  for (const l of ['en', 'ru', 'ar', 'fr', 'es', 'am']) {
    const cat = JSON.parse(rd('i18n/' + l + '.json'));
    const k = Object.keys(cat).find((x) => x.includes('data-slip'));
    T.ok(k, l + ': the welcome key');
    const v = cat[k] || '';
    T.ok(v.indexOf('data-slip') > 0 && v.indexOf('data-slip') < v.indexOf('data-next'), l + ': the payslip first');
    T.ok(!/[֐-׿]/.test(v), l + ': no Hebrew left');
  }
});

T.test('the first-steps card offers the payslip check before the first shift', () => {
  const g = rd('src/app/views-guide.js');
  const steps = g.slice(g.indexOf('const STEPS = ['), g.indexOf('App.guideCard'));
  const slip = steps.indexOf("id: 'slip'"), shift = steps.indexOf("id: 'shift'");
  T.ok(slip > 0 && slip < shift, 'slip step before the shift step');
  T.ok(/acts: \[\['payslip-new'/.test(steps), 'its button opens the payslip sheet');
  T.ok(/S\.payslips\.some\(\(p\) => !p\.demo\)/.test(steps), 'done once a real payslip is saved (the demo one does not count)');
});

T.test('the home queue still draws two cards at most', () => {
  T.ok(/const HOME_CARDS_MAX = 2;/.test(rd('src/app/views-home.js')), 'HOME_CARDS_MAX is 2');
});
