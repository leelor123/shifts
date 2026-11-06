/* The words the coin reads aloud (app/mascot-voice.js MascotSpeech.spoken): one form of each Hebrew slash pair,
 * no emoji, no "..." or "›", no hidden direction marks. */
const path = require('path');
const T = require('./t.js');
require(path.join(__dirname, '..', 'src', 'app', 'mascot-voice.js'));
const { spoken } = globalThis.MascotSpeech;
T.section('the coin reads aloud');
T.test('slash pairs: the first form when the gender is not known', () => {
  T.eq(spoken('בוא/י נכיר 😊', 'he', ''), 'בוא נכיר');
  T.eq(spoken('איפה את/ה עובד/ת?', 'he', ''), 'איפה אתה עובד?');
  T.eq(spoken('מעדיף/ה לא לומר', 'he', 'x'), 'מעדיף לא לומר');
  T.eq(spoken('לא בטוח/ה?', 'he', ''), 'לא בטוח?');
  T.eq(spoken('משתמשים/ות יקרים/ות', 'he', ''), 'משתמשים יקרים');
});
T.test('slash pairs: the feminine form for a girl, the first for a boy', () => {
  T.eq(spoken('בוא/י נכיר', 'he', 'f'), 'בואי נכיר');
  T.eq(spoken('איפה את/ה עובד/ת?', 'he', 'f'), 'איפה את עובדת?');
  T.eq(spoken('מעדיף/ה לא לומר', 'he', 'f'), 'מעדיפה לא לומר');
  T.eq(spoken('משתמשים/ות יקרים/ות', 'he', 'f'), 'משתמשות יקרות');
  T.eq(spoken('איפה את/ה עובד/ת?', 'he', 'm'), 'איפה אתה עובד?');
});
T.test('two whole words with a slash: a pause, never the word "slash"', () => {
  const s = spoken('בן/בת', 'he', '');
  T.ok(!s.includes('/'), s);
  T.eq(s, 'בן בת');
});
T.test('no emoji, no "..." or "›", no hidden marks', () => {
  T.eq(spoken('ואת/ה...', 'he', ''), 'ואתה');
  T.eq(spoken('הגדרות › מראה', 'he', ''), 'הגדרות, מראה');
  T.eq(spoken('גיל 16! יש לך זכויות מיוחדות, נדאג להן 🛡\uFE0F', 'he', ''), 'גיל 16! יש לך זכויות מיוחדות, נדאג להן');
  T.eq(spoken('בשבת מרוויחים לפחות 150%! 🤑', 'he', ''), 'בשבת מרוויחים לפחות 150%!');
  T.eq(spoken('\u2068Chrome\u2069 … ok', 'en', ''), 'Chrome ok');
  T.eq(spoken('Where do you work? 🤔', 'en', ''), 'Where do you work?');
});
T.test('other languages keep their words', () => {
  T.eq(spoken('Как тебя зовут?', 'ru', 'f'), 'Как тебя зовут?');
  T.eq(spoken('ما اسمك؟ 😊', 'ar', ''), 'ما اسمك؟');
  T.eq(spoken('እንተዋወቅ 😊', 'am', ''), 'እንተዋወቅ');
});
