/* The NFC sticker at work (src/core/nfc.js): the address a sticker holds, what a touch does, the repeat guard and
 * the messages for a failed write; plus the parts of the app that must stay in step with it. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const N = globalThis.Nfc;

T.section('the NFC sticker');
T.test('the sticker holds the app address under /shifts/ with the action and its id', () => {
  const u = N.tagUrl('abc123xyz0');
  T.eq(u, 'https://leelor123.github.io/shifts/?action=nfc&tag=abc123xyz0');
  const p = new URL(u);
  T.ok(p.pathname.startsWith('/shifts/'), 'inside the Android app link filter');
  T.eq(N.readOpen(p.search), 'abc123xyz0');
});
T.test('a new id is 10 lower case letters and digits, and valid', () => {
  for (let i = 0; i < 50; i++) { const id = N.newId(); T.eq(id.length, 10); T.ok(N.validId(id), id); }
  T.eq(N.newId(() => 0), '0000000000');
});
T.test('readOpen: another action is not a sticker; a missing or strange id is an unknown sticker', () => {
  T.eq(N.readOpen('?action=start'), null);
  T.eq(N.readOpen(''), null);
  T.eq(N.readOpen('?action=nfc'), '');
  T.eq(N.readOpen('?action=nfc&tag=<script>'), '');
  T.eq(N.readOpen('?action=nfc&tag=AB'), '');
});
const tags = [{ id: 'aaaaaa1111', roleId: 'r_1', at: 1 }];
const now = 1_800_000_000_000;
T.test('no shift running: a known sticker starts one at once, with its role', () => {
  T.eq(JSON.stringify(N.decide({ active: false, tags, tag: 'aaaaaa1111', last: 0, now })), JSON.stringify({ kind: 'start', ask: false, roleId: 'r_1' }));
});
T.test('a shift running: a known sticker ends it at once', () => {
  T.eq(N.decide({ active: true, tags, tag: 'aaaaaa1111', last: 0, now }).kind, 'stop');
  T.eq(N.decide({ active: true, tags, tag: 'aaaaaa1111', last: 0, now }).ask, false);
});
T.test('an id this account did not write (or none) asks first', () => {
  T.eq(JSON.stringify(N.decide({ active: false, tags, tag: 'bbbbbb2222', last: 0, now })), JSON.stringify({ kind: 'start', ask: true, roleId: null }));
  T.eq(N.decide({ active: true, tags, tag: '', last: 0, now }).ask, true);
  T.eq(N.decide({ active: false, tags: null, tag: 'aaaaaa1111', last: 0, now }).ask, true);
});
T.test('a second open within a few seconds is the same touch: nothing happens', () => {
  T.eq(N.decide({ active: true, tags, tag: 'aaaaaa1111', last: now - 3000, now }).kind, 'same');
  T.eq(N.decide({ active: true, tags, tag: 'aaaaaa1111', last: now - N.SAME_TOUCH + 1, now }).kind, 'same');
  T.eq(N.decide({ active: true, tags, tag: 'aaaaaa1111', last: now - N.SAME_TOUCH, now }).kind, 'stop');
  // a clock that went back (last in the future) is not a repeat for ever
  T.eq(N.decide({ active: false, tags, tag: 'aaaaaa1111', last: now + 60000, now }).kind, 'start');
});
T.test('addTag keeps the newest, drops a rewrite of the same id and stays short', () => {
  let l = [];
  for (let i = 0; i < N.MAX_TAGS + 3; i++) l = N.addTag(l, { id: 'tag' + String(i).padStart(7, '0'), at: i });
  T.eq(l.length, N.MAX_TAGS);
  T.eq(l[l.length - 1].at, N.MAX_TAGS + 2);
  l = N.addTag(l, { id: l[0].id, at: 99 });
  T.eq(l.filter((t) => t.id === l[l.length - 1].id).length, 1);
  T.eq(N.addTag([{ id: 'bad' }, null], { id: 'cccccc3333' }).length, 1);
});
T.test('a failed write: the message by Web NFC error name', () => {
  T.eq(N.errorKind({ name: 'AbortError' }), 'cancel');
  T.eq(N.errorKind({ name: 'NotAllowedError' }), 'denied');
  T.eq(N.errorKind({ name: 'NotReadableError' }), 'off');
  T.eq(N.errorKind({ name: 'NotSupportedError' }), 'none');
  T.eq(N.errorKind({ name: 'NetworkError' }), 'failed');
  T.eq(N.errorKind(null), 'failed');
});
T.test('the app reads the sticker id before it clears the address, and hands it to the toggle', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'app.js'), 'utf8');
  const read = app.indexOf('App.pendingTag = ');
  const clear = app.indexOf("if (App.pendingAction) history.replaceState(");
  T.ok(read > 0 && read < clear, 'pendingTag is read first');
  T.ok(/action === 'nfc' && App\.nfcOpen\) App\.nfcOpen\(App\.pendingTag/.test(app), 'the toggle runs after the code lock');
  const intro = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'intro.js'), 'utf8');
  T.ok(intro.includes('const fromShortcut = /[?&]action=/'), 'the opening show treats it as a shortcut (no full show)');
});
