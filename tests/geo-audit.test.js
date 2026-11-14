/* The Google Play background-location audit (15 Nov 2026) for the suggestion when you arrive at work: the disclosure
 * says "collects location data" and "even when the app is closed or not in use" in every language, the feature has one
 * name everywhere, the notifications are checked before "saved", the "Allow all the time" line uses Android's own
 * label from Android 11, the disclosure is Shaati's window (not Android's look), the store listings name the feature,
 * and the declaration text fits Play's 500 characters. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const str = (dir, name) => {
  const m = read(`android/widgets/res/${dir}/w_strings.xml`).match(new RegExp(`<string name="${name}">([^<]*)</string>`));
  return m ? m[1] : null;
};
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// per language: [folder, "collects location data", "closed or not in use", "checked on this phone", the feature name]
const LANGS = [
  ['values', 'אוספת נתוני מיקום', 'גם כשהאפליקציה סגורה או לא בשימוש', 'המיקום נבדק בטלפון', 'הצעה כשמגיעים לעבודה', 'he'],
  ['values-en', 'collects location data', 'even when the app is closed or not in use', 'checked on this phone', 'Suggestion when you arrive at work', 'en'],
  ['values-ar', 'يجمع Shaati بيانات الموقع', 'حتى عندما يكون التطبيق مغلقًا أو غير مستخدم', 'يُفحص الموقع على هذا الهاتف', 'اقتراح عند الوصول إلى العمل', 'ar'],
  ['values-ru', 'собирает данные о местоположении', 'даже когда приложение закрыто или не используется', 'проверяется на этом телефоне', 'Подсказка, когда вы приходите на работу', 'ru'],
  ['values-fr', 'collecte des données de localisation', "même lorsque l\\'application est fermée ou n\\'est pas utilisée", 'vérifiée sur ce téléphone', 'Suggestion en arrivant au travail', 'fr'],
  ['values-es', 'recopila datos de ubicación', 'incluso cuando la app está cerrada o no se está usando', 'se comprueba en este teléfono', 'Sugerencia al llegar al trabajo', 'es'],
  ['values-am', 'የአካባቢ ውሂብ ይሰበስባል', 'መተግበሪያው ተዘግቶ ወይም ጥቅም ላይ ባይውልም', 'በዚህ ስልክ ላይ ይፈተሻል', 'ሥራ ሲደርሱ ጥቆማ', 'am'],
];

T.section('Play background-location audit (suggestion when you arrive at work)');
T.test('the disclosure says "collects location data" and "even when closed or not in use", in every language', () => {
  for (const [dir, collects, closed, phone] of LANGS) {
    const d = str(dir, 'w_geo_disc');
    T.ok(d, dir + ': w_geo_disc');
    T.ok(d.includes(collects), dir + ': collects location data');
    T.ok(d.includes(closed), dir + ': closed or not in use');
    T.ok(d.includes(phone), dir + ': checked on the phone');
  }
});
T.test('one feature name: the disclosure title is the Settings row, the privacy policy names it too', () => {
  const settings = read('src/app/views-settings.js');
  T.ok(settings.includes("arrive: { icon: 'pin', title: 'הצעה כשמגיעים לעבודה'"), 'the Settings row');
  T.ok(read('src/app/views-legal.js').includes('<b>הצעה כשמגיעים לעבודה</b>'), 'the Hebrew privacy policy');
  for (const [dir, , , , name, lang] of LANGS) {
    T.eq(str(dir, 'w_geo_disc_t'), name, dir + ': the disclosure title');
    if (lang === 'he') continue;
    const dict = JSON.parse(read(`i18n/${lang}.json`));
    T.eq(dict['הצעה כשמגיעים לעבודה'], name, lang + ': the Settings row');
    const legal = Object.entries(dict).find(([k]) => k.includes('<b>הצעה כשמגיעים לעבודה</b>'));
    T.ok(legal && legal[1].includes(`<b>${name}</b>`), lang + ': the privacy policy');
  }
  T.ok(read('site/privacy.en.html').includes('<b>Suggestion when you arrive at work</b>'), 'the website\'s English policy');
});
T.test('before "saved", the notifications are checked; Android 13 asks for them, earlier the settings open', () => {
  const c = code(read('android/widgets/java/WorkGeoActivity.java'));
  T.ok(/areNotificationsEnabled\(\)/.test(c), 'areNotificationsEnabled');
  T.ok(/SDK_INT >= 33 && checkSelfPermission\(Manifest\.permission\.POST_NOTIFICATIONS\)[^;]*\)\s*\{\s*requestPermissions\(new String\[\] \{ Manifest\.permission\.POST_NOTIFICATIONS \}/.test(c), 'POST_NOTIFICATIONS from 13');
  T.ok(c.includes('Settings.ACTION_APP_NOTIFICATION_SETTINGS'), 'the app\'s notification settings');
  const done = c.slice(c.indexOf('private void done()'));
  T.ok(done.indexOf('notesOn()') > 0 && done.indexOf('notesOn()') < done.indexOf('saved()'), 'checked before the saved line');
  T.ok(/say\(notesOn\(\) \? R\.string\.w_geo_saved : R\.string\.w_geo_need_notes\)/.test(c), 'the saved line says when no suggestion can come');
  for (const [dir] of LANGS) for (const k of ['w_geo_notes_t', 'w_geo_notes', 'w_geo_need_notes']) T.ok(str(dir, k), dir + ': ' + k);
});
T.test('"Allow all the time": Android\'s own label from Android 11, the fixed line on Android 10', () => {
  const c = code(read('android/widgets/java/WorkGeoActivity.java'));
  T.ok(/SDK_INT >= 30\) \{\s*try \{\s*CharSequence label = getPackageManager\(\)\.getBackgroundPermissionOptionLabel\(\);/.test(c), 'the label on 30+');
  T.ok(/getString\(R\.string\.w_geo_always_x, label\)/.test(c) && /return mLang\.getString\(R\.string\.w_geo_always\);/.test(c), 'formatted, with the fixed fallback');
  T.ok(/setMessage\(alwaysLine\(\)\)/.test(c), 'the dialog uses it');
  for (const [dir] of LANGS) T.ok((str(dir, 'w_geo_always_x') || '').includes('%1$s'), dir + ': w_geo_always_x holds the label');
});
T.test('the disclosure is Shaati\'s window: its colours and icon, light and night', () => {
  for (const dir of ['values', 'values-night']) {
    const s = read(`android/widgets/res/${dir}/w_styles.xml`);
    T.ok(s.includes('<item name="android:alertDialogTheme">@style/WorkGeoDialog</item>'), dir + ': WorkGeoTheme uses WorkGeoDialog');
    T.ok(/<style name="WorkGeoDialog" parent="@android:style\/Theme\.Material[^"]*Dialog\.Alert">[\s\S]*@drawable\/w_geo_dialog[\s\S]*@color\/w_geo_button/.test(s), dir + ': app colours');
    T.ok(/name="w_geo_bg"/.test(read(`android/widgets/res/${dir}/w_colors.xml`)), dir + ': colours defined');
  }
  T.ok(/setIcon\(getApplicationInfo\(\)\.icon\)/.test(read('android/widgets/java/WorkGeoActivity.java')), 'the app icon');
});
T.test('the store listings name the feature; the declaration fits 500 characters', () => {
  const block = (s, head) => { const i = s.indexOf('```', s.indexOf(head)); const a = s.indexOf('\n', i) + 1; return s.slice(a, s.indexOf('\n```', a)); };
  const he = block(read('play-store/listing-he.md'), '**תיאור מלא**');
  T.ok(he.includes('הצעה להתחיל משמרת כשמגיעים למקום העבודה ששמרת, גם כשהאפליקציה סגורה או לא בשימוש'), 'Hebrew listing');
  T.ok([...he].length <= 4000, 'Hebrew listing ≤ 4000: ' + [...he].length);
  const en = block(read('play-store/listing-en.md'), '**Full description**');
  T.ok(en.includes('location-based suggestion to start a shift when you arrive at work, even with the app closed'), 'English listing');
  T.ok([...en].length <= 4000, 'English listing ≤ 4000: ' + [...en].length);
  const ac = read('play-store/APP-CONTENT.md');
  const decl = block(ac, '### 4.1 Location permissions declaration');
  T.ok(decl.startsWith('Shaati is a time clock and payslip checker') && decl.includes('"Suggestion when you arrive at work"'), 'the declaration');
  T.ok([...decl].length <= 500, 'declaration ≤ 500: ' + [...decl].length);
  T.ok(ac.includes('Location feature: Settings › My work › Suggestion when you arrive at work (works as a guest)'), 'App access line');
});
