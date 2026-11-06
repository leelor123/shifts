/* The widgets' right-to-left and left-to-right layouts (node tools/android-layouts.js).
 *
 * Each widget has one layout to edit, android/widgets/res/layout/w_<name>.xml, whose direction follows the phone's
 * language (the launcher uses it for the widget picker's preview and the first picture, before the app has said its
 * language). The widgets themselves speak the app's language (WidgetLang.java), and the launcher draws them in the
 * phone's language, so the direction cannot come from "locale": w_<name>_rtl.xml (Hebrew, Arabic) and
 * w_<name>_ltr.xml (the others) are the same layout with the direction written in. This writes them;
 * tools/android-strings-check.js fails when one is missing or differs from what this would write. */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'android', 'widgets', 'res', 'layout');
const isBase = (f) => /^w_[a-z]+\.xml$/.test(f);

/** The layout with its direction written in (dir: 'rtl' or 'ltr'). */
function variant(xml, base, dir) {
  if (!/android:layoutDirection="locale"/.test(xml)) throw new Error(base + ': no layoutDirection="locale" on its root');
  return xml
    .replace(/<!--[^]*?-->\n/, `<!-- Made by tools/android-layouts.js from ${base} (edit that one, then run it): the ${dir === 'rtl' ? 'right-to-left layout (Hebrew, Arabic)' : 'left-to-right layout (the other languages)'}. -->\n`)
    .replace(/android:layoutDirection="locale"/g, `android:layoutDirection="${dir}"`)
    .replace(/android:textDirection="locale"/g, `android:textDirection="${dir}"`);
}

/** Every variant: [{file, text}]. */
function variants() {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter(isBase)) {
    const xml = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const dir of ['rtl', 'ltr']) out.push({ base: f, file: f.replace('.xml', `_${dir}.xml`), text: variant(xml, f, dir) });
  }
  return out;
}

module.exports = { variants, DIR };

if (require.main === module) {
  for (const v of variants()) fs.writeFileSync(path.join(DIR, v.file), v.text);
  console.log('written:', variants().map((v) => v.file).join(', '));
}
