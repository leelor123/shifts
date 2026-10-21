/* Clean language (core/clean.js): bad words refused, real words never. */
const T = require('./t.js');
const C = globalThis.Clean;
T.section('clean language');
T.test('bad words, also disguised', () => {
  for (const s of ['זין', 'שרמוטה', 'בן זונה', 'יא מניאק', 'כוס אמק', 'כוסעמק', 'חרא של משמרת', 'זייייין', 'ש.ר.מ.ו.ט.ה', 'ש ר מ ו ט ה', 'fuck', 'F*CK', 'sh1t', 'fuuuuck', 'motherfucker', 'בנזונה', 'אתה דביל', 'והמניאק', 'son of a bitch', 'זונה']) T.ok(!C.isClean(s), s);
});
T.test('real words and names pass', () => {
  for (const s of ['מזין נתונים', 'הזין את הנתונים', 'כוס קפה', 'כוסות', 'פינוי זבל', 'נתתי מוצץ', 'בדיקת שתן', 'טיפול בכלבה', 'מתחת לבית', 'סדרן', 'אחמ״ש', 'נועה כהן', 'קופאי', 'Niger', 'cocktail bar', 'Scunthorpe', 'shitake', 'מזכירה', 'זינוק', 'ברזיני', 'מוזיאון', 'כוסמת', 'שרמנטה', 'דניאל', 'שירן', 'זיו', 'יום בחירות', '']) T.ok(C.isClean(s), s);
});
