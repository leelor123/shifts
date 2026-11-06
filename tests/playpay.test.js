/* Google Play's payments policy: inside the Android app nothing may lead to another payment provider. Every place
 * plus.js names Lemon Squeezy's pages must sit behind a check that this is not the Play app (inPlayApp() or
 * webShop(), which includes it), so a web purchase is honoured there without a link to where it was bought. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'plus.js'), 'utf8');

T.section('Google Play payments policy');
T.test('every Lemon Squeezy page plus.js opens is kept out of the Play app', () => {
  const lines = src.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (!/lemonsqueezy\.com\/(my-orders|buy|checkout)/.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
    if (!/inPlayApp\(\)|webShop\(\)/.test(l)) bad.push(`plus.js:${i + 1}`);
  });
  T.eq(bad.join(', '), '');
});
T.test('the manage button is drawn only when there is a link, and opens only then', () => {
  T.ok(/manageUrl\(\) \? `<button[^`]*data-plus-manage/.test(src));
  T.ok(src.includes("b.hasAttribute('data-plus-manage') && manageUrl()"));
});
