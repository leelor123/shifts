/* ============================================================
 * payslip.js — payslip text parsing, privacy redaction, analysis
 * against the recorded shifts, explanations and employer message.
 * Runs fully on the device. (Optional AI parsing lives in the app
 * layer and only receives redacted text the user approved.)
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const Engine = root.Engine;

  /* ---------------- field dictionary ----------------
   * kind: pay = earning, ded = employee deduction, emp = employer contribution,
   *       total, info. Matching order = array order (most specific first). */
  const FIELDS = [
    { key: 'vacationBalance', label: 'יתרת ימי חופשה', kind: 'info', pats: ['יתרת חופשה', 'יתרה חופשה', 'יתרת ימי חופשה', 'חופשה יתרה'] },
    { key: 'sickBalance', label: 'יתרת ימי מחלה', kind: 'info', pats: ['יתרת מחלה', 'יתרה מחלה', 'יתרת ימי מחלה', 'מחלה יתרה'] },
    { key: 'creditPoints', label: 'נקודות זיכוי', kind: 'info', pats: ['נקודות זיכוי', 'נק. זיכוי', "נק' זיכוי", 'נק זיכוי'] },
    { key: 'ytdGross', label: 'ברוטו מצטבר (שנתי)', kind: 'info', pats: ['ברוטו מצטבר', 'מצטבר ברוטו', 'ברוטו שנתי'] },
    { key: 'ytdTax', label: 'מס הכנסה מצטבר', kind: 'info', pats: ['מס הכנסה מצטבר', 'מס מצטבר'] },
    { key: 'taxableGross', label: 'ברוטו למס', kind: 'info', pats: ['ברוטו למס', 'הכנסה חייבת', 'שכר חייב'] },
    { key: 'net', label: 'נטו לתשלום', kind: 'total', pats: ['נטו לתשלום', 'שכר נטו', 'סה"כ נטו', 'סה״כ נטו', 'נטו', 'סכום בבנק', 'סכום לבנק', 'העברה לבנק'] },
    { key: 'totalDeductions', label: 'סה״כ ניכויים', kind: 'total', pats: ['סה"כ ניכויים', 'סה״כ ניכויים', 'סך הניכויים', 'סך ניכויים', 'סה"כ ניכויי חובה', 'ניכויים:'] },
    { key: 'gross', label: 'ברוטו', kind: 'total', pats: ['סה"כ ברוטו', 'סה״כ ברוטו', 'שכר ברוטו', 'סך כל התשלומים', 'סה"כ תשלומים', 'סה״כ תשלומים', 'ברוטו'] },
    { key: 'pensionEmployer', label: 'פנסיה (חלק המעסיק)', kind: 'emp', pats: ['תגמולי מעביד', 'תגמולי מעסיק', 'פנסיה מעביד', 'פנסיה מעסיק', 'גמל מעביד', 'גמל מעסיק', 'הפרשת מעביד', 'הפרשת מעסיק'] },
    { key: 'severance', label: 'פיצויים (מעסיק)', kind: 'emp', pats: ['פיצויים'] },
    { key: 'hishtalmutEmployer', label: 'קרן השתלמות (מעסיק)', kind: 'emp', pats: ['השתלמות מעביד', 'השתלמות מעסיק', 'קה"ש מעביד', 'קה"ש מעסיק'] },
    { key: 'incomeTax', label: 'מס הכנסה', kind: 'ded', pats: ['מס הכנסה', 'מ.הכנסה', 'מ. הכנסה', 'מס הכ'] },
    { key: 'nationalInsurance', label: 'ביטוח לאומי', kind: 'ded', pats: ['ביטוח לאומי', 'בטוח לאומי', 'ב.לאומי', 'ב. לאומי', 'ב"ל'] },
    { key: 'healthTax', label: 'מס בריאות', kind: 'ded', pats: ['מס בריאות', 'דמי בריאות', 'ביטוח בריאות', 'בטוח בריאות'] },
    { key: 'hishtalmutEmployee', label: 'קרן השתלמות (עובד)', kind: 'ded', pats: ['קרן השתלמות', 'השתלמות', 'קה"ש'] },
    { key: 'pensionEmployee', label: 'פנסיה (חלק העובד)', kind: 'ded', pats: ['תגמולי עובד', 'פנסיה עובד', 'גמל עובד', 'קופ"ג עובד', 'קרן פנסיה', 'פנסיה', 'תגמולים', 'גמל'] },
    { key: 'rest200', label: 'שבת/חג + נוספות 200%', kind: 'pay', hours: true, pats: ['200%', 'שעות 200'] },
    { key: 'rest175', label: 'שבת/חג + נוספות 175%', kind: 'pay', hours: true, pats: ['175%', 'שעות 175'] },
    { key: 'rest150', label: 'שעות שבת/חג 150%', kind: 'pay', hours: true, pats: ['שבת', 'חג 150', 'שעות חג', 'מנוחה'] },
    { key: 'ot150', label: 'שעות נוספות 150%', kind: 'pay', hours: true, pats: ['150%', 'נוספות 150', 'ש.נ 150', 'ש"נ 150', 'ש.נ. 150'] },
    { key: 'ot125', label: 'שעות נוספות 125%', kind: 'pay', hours: true, pats: ['125%', 'נוספות 125', 'ש.נ 125', 'ש"נ 125', 'ש.נ. 125', 'שעות נוספות'] },
    { key: 'night', label: 'תוספת לילה', kind: 'pay', pats: ['לילה'] },
    { key: 'seniority', label: 'תוספת ותק', kind: 'pay', pats: ['ותק'] },
    { key: 'travel', label: 'נסיעות', kind: 'pay', pats: ['נסיעות', 'נסיעה', 'דמי נסיעה'] },
    { key: 'recuperation', label: 'דמי הבראה', kind: 'pay', pats: ['הבראה'] },
    { key: 'vacationPay', label: 'דמי חופשה', kind: 'pay', pats: ['דמי חופשה', 'חופשה'] },
    { key: 'sickPay', label: 'דמי מחלה', kind: 'pay', pats: ['דמי מחלה', 'מחלה'] },
    { key: 'holidayPay', label: 'דמי חגים', kind: 'pay', pats: ['דמי חג', 'חגים'] },
    { key: 'bonus', label: 'בונוס / פרמיה', kind: 'pay', pats: ['בונוס', 'פרמיה', 'מענק', 'תמריץ'] },
    { key: 'diff', label: 'הפרשי שכר / תיקונים', kind: 'pay', pats: ['הפרשי', 'הפרש', 'רטרו', 'תיקון'] },
    { key: 'base', label: 'שכר יסוד / שעות רגילות', kind: 'pay', hours: true, pats: ['שכר יסוד', 'שכר בסיס', 'שעות רגילות', 'שכר רגיל', 'שכר שעתי', 'שעות 100', '100%', 'משכורת'] },
    { key: 'workHours', label: 'סה״כ שעות עבודה', kind: 'info', pats: ['סה"כ שעות', 'סה״כ שעות', 'שעות עבודה', 'שעות בפועל'] },
    { key: 'workDays', label: 'ימי עבודה', kind: 'info', pats: ['ימי עבודה', 'ימים בפועל'] },
  ];
  const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
  const HOUR_FIELDS = ['base', 'ot125', 'ot150', 'rest150', 'rest175', 'rest200'];

  /* ---------------- explanations (plain Hebrew) ---------------- */
  // the yearly numbers come from Engine.LAW_YEARS when a text is read (getters: never stale, never formatted too early)
  const law = (key) => Engine.lawYear(key, U.todayKey());
  const EXPLAIN = {
    base: 'השכר על השעות הרגילות (100%): מספר השעות × התעריף לשעה. זה הבסיס לחישוב פנסיה, חופשה ומחלה.',
    ot125: 'שעות נוספות: אחרי יום עבודה מלא (8.6 שעות בשבוע של 5 ימים, 8 בשבוע של 6 ימים, 7 במשמרת לילה), השעתיים הראשונות משולמות ב-125% מהתעריף.',
    ot150: 'שעות נוספות מעבר לשעתיים הראשונות: 150% מהתעריף.',
    rest150: 'שעות בשבת או בחג משולמות ב-150% מהתעריף (לפי חוק שעות עבודה ומנוחה).',
    rest175: 'שעות נוספות שנעשו בשבת או בחג, השעתיים הראשונות: 175%.',
    rest200: 'שעות נוספות בשבת או בחג מעבר לשעתיים: 200%.',
    night: 'תוספת על שעות לילה, לפי ההסכם או הנוהג אצל המעסיק (לא חובה בחוק לכל העובדים).',
    seniority: 'תוספת לפי ותק, לפי הסכם קיבוצי או חוזה אישי.',
    get travel() { const t = law('travelCap'); return `החזר הוצאות נסיעה לעבודה: לפי מספר ימי העבודה בפועל, עד תקרה יומית (${U.money(t.value)} לפי צו ההרחבה, ${t.year}). החזר הנסיעות חייב במס.`; },
    get recuperation() { const r = law('recup'); return `דמי הבראה: אחרי שנת עבודה. מספר ימים לפי ותק × תעריף יומי (${U.money(r.value)} במגזר הפרטי, ${r.year}) × היקף המשרה.`; },
    vacationPay: 'תשלום על ימי חופשה שנוצלו, לפי השכר היומי הממוצע.',
    sickPay: 'דמי מחלה לפי חוק: יום ראשון ללא תשלום, ימים 2\u2060–\u20603 ב-50%, מהיום הרביעי 100%.',
    holidayPay: 'דמי חגים: לעובדים שעתיים אחרי 3 חודשי עבודה, על ימי חג שחלו ביום חול ולא עבדו בהם (לפי צו ההרחבה).',
    bonus: 'בונוס, פרמיה או מענק, לפי מדיניות המעסיק. חייב במס ובביטוח לאומי.',
    diff: 'הפרשים: תיקון של חודשים קודמים (למשל שעות שלא שולמו). כדאי לבדוק אם זה סוגר פער פתוח.',
    gross: 'ברוטו: סך כל התשלומים לפני ניכויים.',
    net: 'נטו: מה שנכנס לחשבון הבנק, ברוטו פחות כל הניכויים.',
    totalDeductions: 'סך כל הניכויים מהברוטו: מס הכנסה, ביטוח לאומי, מס בריאות, פנסיה וניכויים נוספים.',
    get incomeTax() { return `מס הכנסה: מחושב לפי מדרגות מס (10%, 14%, 20%...) על השכר החודשי, פחות זיכוי על כל נקודת זיכוי (${U.money(law('tax').value.point, 0)} לנקודה) ופחות זיכוי על הפקדה לפנסיה. אם הוא עלה, לרוב כי הברוטו עלה ונכנסת למדרגה גבוהה יותר.`; },
    get nationalInsurance() { const b = law('bl'); return `ביטוח לאומי (חלק העובד): 1.04% על השכר עד ${U.money(b.value[0], 0)} ו-7% מעל (${b.year}). משתנה ישירות עם הברוטו.`; },
    get healthTax() { const b = law('bl'); return `מס בריאות: 3.23% עד ${U.money(b.value[0], 0)} ו-5.17% מעל (${b.year}). מממן את קופת החולים.`; },
    pensionEmployee: 'הפרשת העובד לפנסיה: לרוב 6% מהשכר הקובע. נחסך על שמך ומקטין את מס ההכנסה (זיכוי 35%).',
    pensionEmployer: 'הפרשת המעסיק לתגמולים: לרוב 6.5%. לא יורד מהנטו. זה כסף נוסף שנחסך בשבילך.',
    severance: 'הפרשת המעסיק לפיצויים: 6% עד 8.33%. נצבר בקרן הפנסיה.',
    hishtalmutEmployee: 'קרן השתלמות: חלק העובד (לרוב 2.5%). חיסכון שאפשר למשוך אחרי 6 שנים, פטור ממס עד תקרה.',
    hishtalmutEmployer: 'קרן השתלמות: חלק המעסיק (לרוב 7.5%).',
    get creditPoints() { return `נקודות זיכוי: מקטינות את מס ההכנסה (כל נקודה ${U.money(law('tax').value.point, 0)} בחודש). תושב/ת: 2.25; אישה: 2.75; ועוד לפי ילדים, תואר, שחרור מצבא וכו׳.`; },
    vacationBalance: 'כמה ימי חופשה צברת ועדיין לא ניצלת.',
    sickBalance: 'כמה ימי מחלה צברת (1.5 ימים לחודש עבודה מלא, עד 90).',
    ytdGross: 'סכום הברוטו מתחילת השנה.',
    ytdTax: 'סך מס ההכנסה שנוכה מתחילת השנה.',
    taxableGross: 'השכר החייב במס: הברוטו אחרי הפחתות מסוימות.',
    workHours: 'סך השעות שהמעסיק רשם לחודש.',
    workDays: 'מספר ימי העבודה שהמעסיק רשם, משמש גם לחישוב הנסיעות.',
  };

  /* ---------------- the line-by-line translator ----------------
   * MEANING: one plain sentence per line, in the app's language (translated like every string).
   * MEANING_HE and HE_TERM stay Hebrew in every language: a worker who reads Russian or Amharic can show the
   * employer the Hebrew term and its Hebrew sentence. MEANING_HE must say exactly what MEANING says in Hebrew
   * (tests/payslip.test.js compares them). */
  const MEANING = {
    vacationBalance: 'ימי החופשה שצברת ועוד לא לקחת.',
    sickBalance: 'ימי המחלה שצברת ועוד לא ניצלת.',
    creditPoints: 'נקודות שמורידות לך את מס ההכנסה, לפי טופס 101 שמילאת.',
    ytdGross: 'כל הברוטו שהרווחת מתחילת השנה.',
    ytdTax: 'כל מס ההכנסה שירד לך מתחילת השנה.',
    taxableGross: 'החלק מהשכר שעליו מחשבים את מס ההכנסה.',
    net: 'הסכום שנכנס לחשבון הבנק שלך.',
    totalDeductions: 'כל מה שירד מהברוטו: מיסים, פנסיה וניכויים אחרים.',
    gross: 'כל הכסף שהרווחת החודש, לפני מיסים וניכויים.',
    pensionEmployer: 'כסף שהמעסיק מפקיד לפנסיה שלך, מעבר לשכר.',
    severance: 'כסף שהמעסיק חוסך בשבילך לפיצויים, בקרן הפנסיה שלך.',
    hishtalmutEmployer: 'כסף שהמעסיק מפקיד לקרן ההשתלמות שלך, מעבר לשכר.',
    incomeTax: 'מס למדינה על השכר שלך, לפי גובה השכר ונקודות הזיכוי.',
    nationalInsurance: 'דמי ביטוח לאומי, שמממנים קצבאות כמו אבטלה, לידה ופגיעה בעבודה.',
    healthTax: 'מס שמממן את קופת החולים שלך.',
    hishtalmutEmployee: 'החלק שלך בקרן השתלמות, חיסכון שאפשר למשוך אחרי 6 שנים.',
    pensionEmployee: 'החלק שלך בחיסכון לפנסיה: יורד מהשכר ונשמר על שמך.',
    rest200: 'שעות נוספות בשבת או בחג מהשעה השלישית והלאה, ב-⁠200% מהתעריף.',
    rest175: 'השעתיים הנוספות הראשונות בשבת או בחג, ב-⁠175% מהתעריף.',
    rest150: 'שעות שעבדת בשבת או בחג, ב-⁠150% מהתעריף לפחות.',
    ot150: 'שעות נוספות מהשעה השלישית והלאה באותו יום, ב-⁠150% מהתעריף.',
    ot125: 'השעתיים הנוספות הראשונות אחרי יום עבודה מלא, ב-⁠125% מהתעריף.',
    night: 'תוספת על שעות לילה, אם ההסכם או המעסיק נותנים אותה.',
    seniority: 'תוספת לפי שנות הוותק שלך אצל המעסיק.',
    travel: 'החזר על הנסיעות לעבודה, לפי מספר ימי העבודה.',
    recuperation: 'דמי הבראה: תשלום שנתי שמגיע אחרי שנת עבודה.',
    vacationPay: 'התשלום על ימי החופשה שלקחת.',
    sickPay: 'התשלום על ימי מחלה עם אישור רופא.',
    holidayPay: 'התשלום על ימי חג שחלו ביום חול ולא עבדת בהם.',
    bonus: 'כסף נוסף מעבר לשכר, כמו בונוס, פרמיה או מענק.',
    diff: 'תיקון של שכר מחודשים קודמים, למשל שעות שלא שולמו.',
    base: 'השכר על השעות הרגילות שעבדת, לפי התעריף שלך לשעה.',
    workHours: 'סך השעות שהמעסיק רשם לך החודש.',
    workDays: 'מספר ימי העבודה שהמעסיק רשם לך החודש.',
  };
  // i18n-keep-start (Hebrew on purpose: the words printed on an Israeli payslip, to show the employer)
  const MEANING_HE = {
    vacationBalance: 'ימי החופשה שצברת ועוד לא לקחת.',
    sickBalance: 'ימי המחלה שצברת ועוד לא ניצלת.',
    creditPoints: 'נקודות שמורידות לך את מס ההכנסה, לפי טופס 101 שמילאת.',
    ytdGross: 'כל הברוטו שהרווחת מתחילת השנה.',
    ytdTax: 'כל מס ההכנסה שירד לך מתחילת השנה.',
    taxableGross: 'החלק מהשכר שעליו מחשבים את מס ההכנסה.',
    net: 'הסכום שנכנס לחשבון הבנק שלך.',
    totalDeductions: 'כל מה שירד מהברוטו: מיסים, פנסיה וניכויים אחרים.',
    gross: 'כל הכסף שהרווחת החודש, לפני מיסים וניכויים.',
    pensionEmployer: 'כסף שהמעסיק מפקיד לפנסיה שלך, מעבר לשכר.',
    severance: 'כסף שהמעסיק חוסך בשבילך לפיצויים, בקרן הפנסיה שלך.',
    hishtalmutEmployer: 'כסף שהמעסיק מפקיד לקרן ההשתלמות שלך, מעבר לשכר.',
    incomeTax: 'מס למדינה על השכר שלך, לפי גובה השכר ונקודות הזיכוי.',
    nationalInsurance: 'דמי ביטוח לאומי, שמממנים קצבאות כמו אבטלה, לידה ופגיעה בעבודה.',
    healthTax: 'מס שמממן את קופת החולים שלך.',
    hishtalmutEmployee: 'החלק שלך בקרן השתלמות, חיסכון שאפשר למשוך אחרי 6 שנים.',
    pensionEmployee: 'החלק שלך בחיסכון לפנסיה: יורד מהשכר ונשמר על שמך.',
    rest200: 'שעות נוספות בשבת או בחג מהשעה השלישית והלאה, ב-⁠200% מהתעריף.',
    rest175: 'השעתיים הנוספות הראשונות בשבת או בחג, ב-⁠175% מהתעריף.',
    rest150: 'שעות שעבדת בשבת או בחג, ב-⁠150% מהתעריף לפחות.',
    ot150: 'שעות נוספות מהשעה השלישית והלאה באותו יום, ב-⁠150% מהתעריף.',
    ot125: 'השעתיים הנוספות הראשונות אחרי יום עבודה מלא, ב-⁠125% מהתעריף.',
    night: 'תוספת על שעות לילה, אם ההסכם או המעסיק נותנים אותה.',
    seniority: 'תוספת לפי שנות הוותק שלך אצל המעסיק.',
    travel: 'החזר על הנסיעות לעבודה, לפי מספר ימי העבודה.',
    recuperation: 'דמי הבראה: תשלום שנתי שמגיע אחרי שנת עבודה.',
    vacationPay: 'התשלום על ימי החופשה שלקחת.',
    sickPay: 'התשלום על ימי מחלה עם אישור רופא.',
    holidayPay: 'התשלום על ימי חג שחלו ביום חול ולא עבדת בהם.',
    bonus: 'כסף נוסף מעבר לשכר, כמו בונוס, פרמיה או מענק.',
    diff: 'תיקון של שכר מחודשים קודמים, למשל שעות שלא שולמו.',
    base: 'השכר על השעות הרגילות שעבדת, לפי התעריף שלך לשעה.',
    workHours: 'סך השעות שהמעסיק רשם לך החודש.',
    workDays: 'מספר ימי העבודה שהמעסיק רשם לך החודש.',
  };
  /** The usual wording of each line on an Israeli payslip. */
  const HE_TERM = {
    vacationBalance: 'יתרת חופשה', sickBalance: 'יתרת מחלה', creditPoints: 'נקודות זיכוי', ytdGross: 'ברוטו מצטבר',
    ytdTax: 'מס הכנסה מצטבר', taxableGross: 'ברוטו למס', net: 'נטו לתשלום', totalDeductions: 'סה״כ ניכויים',
    gross: 'סה״כ ברוטו', pensionEmployer: 'פנסיה מעסיק', severance: 'פיצויים', hishtalmutEmployer: 'קרן השתלמות מעסיק',
    incomeTax: 'מס הכנסה', nationalInsurance: 'ביטוח לאומי', healthTax: 'מס בריאות', hishtalmutEmployee: 'קרן השתלמות עובד',
    pensionEmployee: 'פנסיה עובד', rest200: 'שבת נוספות 200%', rest175: 'שבת נוספות 175%', rest150: 'שעות שבת 150%',
    ot150: 'שעות נוספות 150%', ot125: 'שעות נוספות 125%', night: 'תוספת לילה', seniority: 'תוספת ותק', travel: 'נסיעות',
    recuperation: 'דמי הבראה', vacationPay: 'דמי חופשה', sickPay: 'דמי מחלה', holidayPay: 'דמי חגים', bonus: 'בונוס / פרמיה',
    diff: 'הפרשי שכר', base: 'שכר יסוד', workHours: 'סה״כ שעות', workDays: 'ימי עבודה',
    otherPay: 'תשלום אחר', otherDed: 'ניכוי אחר',
  };
  // i18n-keep-end
  /** The order a worker reads the money in (the translator's list): money in, deductions, the employer's money,
   *  the totals (net last), then information. FIELDS keeps its own order: it is the matching order. */
  const READ_ORDER = ['base', 'ot125', 'ot150', 'rest150', 'rest175', 'rest200', 'night', 'seniority', 'travel', 'recuperation',
    'vacationPay', 'sickPay', 'holidayPay', 'bonus', 'diff',
    'incomeTax', 'nationalInsurance', 'healthTax', 'pensionEmployee', 'hishtalmutEmployee',
    'pensionEmployer', 'severance', 'hishtalmutEmployer',
    'gross', 'totalDeductions', 'net',
    'workHours', 'workDays', 'vacationBalance', 'sickBalance', 'creditPoints', 'taxableGross', 'ytdGross', 'ytdTax'];
  /** What a line does to the worker's money, by its kind. */
  const KIND_LABEL = { pay: 'תשלום לך', ded: 'ניכוי מהשכר', emp: 'כסף מהמעסיק', total: 'סיכום', info: 'מידע' };
  /** The Hebrew words of a line as it was read from the payslip (no numbers), or '' when it was typed or read by AI. */
  function printedTerm(line) {
    if (!line || line === 'AI') return '';
    const first = String(line).split(' | ')[0];
    const t = first.replace(/[\d.,%₪\-+:/()*×]+/g, ' ').replace(/\s+/g, ' ').trim();
    return HEB.test(t) ? t : '';
  }

  /* ---------------- text helpers ---------------- */
  const HEB = /[֐-׿]/;
  const revStr = (s) => s.split('').reverse().join('');
  /** Visual-order (reversed) Hebrew → logical order: reverse token order, reverse letters of Hebrew tokens. */
  function fixVisual(line) {
    return line.split(/\s+/).reverse().map((t) => (HEB.test(t) ? revStr(t) : t)).join(' ');
  }
  // i18n-keep-start (the characters a photo's text recognition puts in a payslip's words and numbers)
  /* A letter that looks like a digit inside an amount ("3,O45.00", "5o.75", "29l.07"): the digit it stands for. Only
   * in a token shaped like an amount (it ends in a separator and two digits), so a word never becomes a number; "l"
   * and "I" only between digits (at the edge they may be a table's border). Read as it was, "3,o45.00" gave 3 and
   * 45.00, and the pay was 45 ₪ (readers campaign, Nov 2026). */
  const LOOK = { O: '0', o: '0', 'ס': '0', I: '1', l: '1' };
  const LOOK_TOKEN = /^[-+(₪]*[\dOoס][\dOoIlס,.]*[.,][\dOoס]{2}\)?%?-?₪?$/;
  function fixDigits(s) {
    if (!/[OoIlס]/.test(s)) return s;
    return s.split(' ').map((t) => (/\d/.test(t) && /[OoIlס]/.test(t) && LOOK_TOKEN.test(t) ? t.replace(/[OoIlס]/g, (c) => LOOK[c]) : t)).join(' ');
  }
  function normalize(s) {
    return fixDigits(s.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').replace(/[״“”]|''/g, '"').replace(/[׳‘’`]/g, "'")
      // "סה"כ" as a photo gives it ("סהייכ", "סה'כ", "סהכ")
      // (and "סה'יכ", the gershayim read as an apostrophe and a yod: round 2, from the payslip screen's sample)
      .replace(/(^|\s)סה(?:יי|['"]י?|י['"])?כ(?=\s)/g, '$1סה"כ')
      // a table's border read as a token ("101 | שעות עבודה רגילות 100.50 |"): it hid the symbol code before the name,
      // and the code was read as the hours (readers campaign, Nov 2026)
      .replace(/(^|\s)[|_¦]+(?=\s|$)/g, ' ')
      // a name glued to its number by a colon, an amount glued to its currency
      .replace(/([֐-׿"'])([:=])(?=[-₪]?\d)/g, '$1$2 ').replace(/(\d)(ש"ח|₪)/g, '$1 $2')
      .replace(/\s+/g, ' ').trim());
  }
  // i18n-keep-end
  /** Numbers in a line, in reading order. Handles 1,234.56 / trailing minus / percents. The result's `dirty` counts
   *  the tokens that mix digits with letters ("3,S45.00", "נטו5,000"): what they hold is not read, and a line with
   *  one is read only when its own arithmetic confirms it. */
  function numbersIn(line) {
    // dates are not values: a full date, and the pay month as "07/2026" or "07-2026" (the title "תלוש משכורת 07-2026"
    // was read as a base pay of 2,026 ₪ for 7 hours, readers campaign, Nov 2026)
    let clean = line.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, ' ').replace(/(^|[^\d.,])\d{1,2}[\/.-]20\d{2}(?![\d.,]\d)/g, '$1 ');
    let dirty = 0;
    if (/\d/.test(clean) && /[A-Za-z֐-׿]/.test(clean)) {
      clean = clean.split(' ').map((t) => {
        if (!/\d/.test(t) || !/[A-Za-z֐-׿]/.test(t)) return t;
        // a one-letter prefix ("ב-150%", "ל-2026", "מ-1") is a word before a clean number
        const pre = /^[֐-׿]{1,2}[-־](?=\d)/.exec(t);
        if (pre && !/[A-Za-z֐-׿]/.test(t.slice(pre[0].length))) return t.slice(pre[0].length);
        dirty++;
        return ' ';
      }).join(' ');
    }
    // A space the recognition put inside an amount: before its point ("56 .32") or after its thousands comma ("6,
    // 287.57"). Read as two numbers it gave 32 ₪ of National Insurance and a gross of 287.57 (readers campaign, Nov
    // 2026). A point with two digits never starts a number, and a comma never ends one.
    clean = clean.replace(/(\d) +([.,]\d{2})(?![\d.,])/g, '$1$2').replace(/(^|[^\d.,])(\d{1,3}), +(\d{3}(?:\.\d{1,2})?)(?![\d,])/g, '$1$2,$3');
    // "6,82344": groups of three after a comma, then two more digits: the decimal point was dropped (6,823.44). Read
    // as it was it gave 6,823 and a bare 44, and the gross was 44 (readers campaign, Nov 2026)
    clean = clean.replace(/(^|[^\d.,])(\d{1,3}(?:,\d{3})*,\d{3})(\d{2})(?![\d.,])/g, '$1$2.$3');
    // Two amounts glued by the text recognition ("57.00669.75", "60.003,045.00", "6,287.57748.45"): the first one ends
    // two digits after its point, the second follows. Read as one number it was 60,003,045 ₪ of base pay or 57.00669
    // ₪ (readers campaign, Nov 2026). A token that is no number as printed (more than two digits after the point,
    // thousands marked by a dot and a comma both, a first group of "0") is cut there. One that is a number too
    // ("1.500.00": 1,500 with its thousands read as a dot, or 1.50 glued to 0.00) stays one, and the cut reading is
    // kept as `alt`: the line's own arithmetic picks it (readLine). The glued token holds the two as they sit on the
    // page, the left one first: in a line read from the right, the right one comes first. Which column each one was
    // is not sure, so `glued` marks the line: a total or a row of totals is not read from it.
    let alt = null, glued = 0;
    if (/\d\.\d{2}\d/.test(clean)) {
      const cut = [];
      const pieces = clean.split(' ').map((t) => {
        const g = GLUED.exec(t);
        if (!g) return t;
        const two = g[3] + g[4] + ' ' + g[1] + g[2];
        if (!ONE_NUMBER.test(t.replace(/^-|-$/g, ''))) { glued++; return two; }
        cut.push(two);
        return t;
      });
      clean = pieces.join(' ');
      if (cut.length) { let k = 0; alt = clean.split(' ').map((t) => (GLUED.test(t) && ONE_NUMBER.test(t.replace(/^-|-$/g, '')) ? cut[k++] : t)).join(' '); }
    }
    // A decimal point lost to a space ("56 32", "2,576 25"): a whole number and two digits after it. Read as they are
    // they were 32 ₪ of National Insurance (readers campaign, Nov 2026); joined they may be hours and a rate ("8 65"
    // in a whole-shekel sheet). The line's arithmetic picks the joined reading (`alt`); without it the line is unsure
    // (`gap`: it is read only when its own arithmetic holds as it is).
    let gap = 0;
    const joinGaps = (t, count) => {
      const w = t.split(' ');
      const o = [];
      for (let i = 0; i < w.length; i++) {
        // (the tier in the name, "ש"נ 125 10 25", is no amount)
        const tier = /^(?:100|125|150|175|200)$/.test(w[i]) && i > 0 && TIER_IN_NAME.test(w[i - 1] + ' ' + w[i]);
        if (!tier && /^-?(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(w[i]) && /^\d{2}-?$/.test(w[i + 1] || '')) { o.push(w[i] + '.' + w[i + 1]); i++; if (count) gap++; } else o.push(w[i]);
      }
      return o.join(' ');
    };
    const gapped = joinGaps(clean, true);
    if (gap) alt = joinGaps(alt != null ? alt : clean, false);
    const out = readNumbers(clean);
    if (alt != null) { out.alt = readNumbers(alt); if (glued || alt !== gapped) out.alt.glued = glued + 1; }
    if (glued) out.glued = glued;
    if (gap) out.gap = gap;
    if (dirty) { out.dirty = dirty; if (out.alt) out.alt.dirty = dirty; }
    return out;
  }
  // i18n-keep-start (number shapes)
  const GLUED = /^(-?)(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(-?)$/;
  /** One number as a payslip prints it: whole, with up to two decimals, or thousands in one separator (the same one
   *  throughout, never the decimal's when it is a comma) and its two decimals. */
  const ONE_NUMBER = /^(?:[1-9]\d{0,2}(?:\.\d{3})+[.,]\d{2}|[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/;
  // i18n-keep-end
  function readNumbers(clean) {
    // the first form: thousands read as a dot by OCR ("8.500.00"): the last separator is the decimal point. Read as
    // two numbers it gave 8.5 and a bare "00", and the net was 0 (deep review, Nov 2026)
    // the third form: a decimal comma ("56,32", "1234,56", a European sheet's export). A comma before one or two digits
    // is never a thousands separator; read as two numbers it gave 56 and 32, and the deduction was 32 (readers
    // campaign, Nov 2026)
    // the fourth form: hours as h:mm ("33:30" is 33.5 hours; read as 33 and 30 it hid the hours × rate = pay, readers
    // campaign, Nov 2026)
    const re = /(-?)(\d{1,3}:[0-5]\d(?![\d:.,])|\d{1,3}(?:[.,]\d{3})+[.,]\d{2}(?!\d)|\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![,\d])|\d+,\d{1,2}(?![\d,])|\d+(?:\.\d+)?)(-?)(\s*%)?/g;
    const out = [];
    let m;
    while ((m = re.exec(clean))) {
      const raw = m[2];
      if (!raw.includes('.') && !raw.includes(',') && raw.length > 6) continue; // ids
      const thou = /^\d{1,3}(?:[.,]\d{3})+[.,]\d{2}$/.test(raw);
      const comma = /^\d+,\d{1,2}$/.test(raw);
      const hm = /^\d{1,3}:[0-5]\d$/.test(raw);
      let v = hm ? +raw.split(':')[0] + raw.split(':')[1] / 60 : thou ? parseFloat(raw.slice(0, -3).replace(/[.,]/g, '') + '.' + raw.slice(-2)) : comma ? parseFloat(raw.replace(',', '.')) : parseFloat(raw.replace(/,/g, ''));
      // a whole number of 1 to 3 digits right before "500.00" may be its thousands split by a space ("8 500.00")
      const spaced = !m[4] && !raw.includes('.') && !raw.includes(',') && raw.length <= 3 && /^ \d{3}[.,]\d{2}(?!\d)/.test(clean.slice(m.index + m[0].length));
      if (m[1] === '-' || m[3] === '-') v = -v;
      out.push(Object.assign({ v, pct: !!m[4], dec: raw.includes('.') || thou || comma || hm, raw: m[0] }, spaced ? { spaced } : null));
    }
    return out;
  }
  function matchField(line) {
    const n = normalize(line);
    // the pension or fund base ("ברוטו לפנסיה") is a base, neither the gross nor the pension deduction: it was read as
    // the gross (deep review, Nov 2026). It waits among the lines to name.
    if (/ברוטו ל(?:פנסי|קופ|גמל|קה"ש|השתלמות|פיצויים)/.test(n)) return null;
    // the job percent ("היקף משרה 100%") is no 100% tier: the header line became a base pay (round 2, from the payslip
    // screen's sample)
    if (/(?:היקף|אחוז|חלקיות) משרה|% משרה/.test(n)) return null;
    for (const f of FIELDS) {
      for (const p of f.pats) {
        if (n.includes(p)) {
          // 150% lines that mention Shabbat/holiday belong to rest150
          if (f.key === 'ot150' && /שבת|חג|מנוחה/.test(n)) return FIELD.rest150;
          if (f.key === 'ot125' && /שבת|חג|מנוחה/.test(n) && /150/.test(n)) return FIELD.rest150;
          // the gross for National Insurance ("ברוטו ב.ל.") is a base, not the gross: it adds imputed benefits
          if (f.key === 'gross' && (/למס|מצטבר/.test(n) || /ברוטו (?:ל)?(?:ב\.ל|ב"ל|ביטוח לאומי)/.test(n))) continue;
          if (f.key === 'net' && /מצטבר/.test(n)) continue;
          // "הפרשת" / "הפרשות" is the employer's provision (pension, National Insurance), not a pay difference
          // ("הפרשי", "הפרש", "הפרשים"): the employer's NI provision was read as a pay difference (real payslip, Nov 2026)
          if (f.key === 'diff' && p.startsWith('הפרש') && !/הפרש(?:י|ים)?(?![א-ת])/.test(n)) continue;
          // the employee's NI deduction, not the NI gross or the employer's NI provision
          // (the bare "ניכויים:" of a summary strip, not the deductions file "תיק ניכויים:")
          // i18n-keep
          if (f.key === 'totalDeductions' && p === 'ניכויים:' && /תיק/.test(n)) continue;
          if (f.key === 'nationalInsurance' && /ברוטו|הפרש[תו]|מעסיק|מעביד/.test(n)) continue;
          // the employer's share named after the fund ("פנסיה - מעסיק", "קרן השתלמות (מעביד)"): it was filed as a
          // second deduction of the worker's (readers campaign, Nov 2026)
          if ((f.key === 'pensionEmployee' || f.key === 'hishtalmutEmployee') && /מעסיק|מעביד/.test(n) && !/עובד/.test(n)) return FIELD[f.key === 'pensionEmployee' ? 'pensionEmployer' : 'hishtalmutEmployer'];
          return f;
        }
      }
    }
    return null;
  }
  // i18n-keep the words printed on an Israeli payslip
  const TIER_IN_NAME = /(?:ש"נ|ש\.נ\.?|נוספות|שעות|חג)\s(100|125|150|175|200)(?![\d.,%])/;
  /** Did the line match the field by its Hebrew words (not only by a tier such as "150%")? */
  function byWords(f, line) {
    const n = normalize(line);
    if (f.key === 'rest150' && /שבת|חג|מנוחה/.test(n)) return true;
    return f.pats.some((p) => HEB.test(p) && n.includes(p));
  }
  /* ---------------- money or a count? ----------------
   * A payslip prints counts next to the money: the sick and vacation days (balance, accrued, used), the years of
   * seniority, the start date. Such a line names the same thing as a payment ("מחלה", "חופשה", "ותק") but holds no
   * money, and read as a payment it added the sick-day balance or the seniority years to the pay (user report, Nov
   * 2026). The rule: a balance, accrual or usage line is never a payment, and a payment named by a word that also
   * names a count ("מחלה" alone, "ותק" alone) needs an amount column. */
  // i18n-keep-start (the words printed on an Israeli payslip)
  const BALANCE_WORD = /יתר[הת]|צביר|נצבר|ניצול|נוצל|זכאות|קודמת/;
  const QTY_WORD = /ימי|ימים|שנים|שנות|שנה|חודשים|חודש|תאריך|שעות/;
  /** Lines named by a word that also names a count: the words that make them a payment for sure. */
  const WEAK_PAY = {
    sickPay: /דמי מחלה|תשלום מחלה|תשלום ימי מחלה/,
    vacationPay: /דמי חופשה|תשלום חופשה|פדיון חופשה/,
    recuperation: /דמי הבראה|תשלום הבראה/,
    seniority: /תוספת ותק|תוס['.]? ?ותק|דמי ותק|פרמיית ותק|גמול ותק/,
  };
  // i18n-keep-end
  /** A count line of these kinds is the balance (information), never the payment. */
  const BALANCE_OF = { sickPay: 'sickBalance', vacationPay: 'vacationBalance' };
  const close = (a, b) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.002);
  /** qty × rate = amount among the values (the shape of a real payment line), or null. Which factor is the quantity:
   *  on an hours line (`hours`), one below 7 is (no hourly wage is that low, not even a youth's), and `sure` says so.
   *  A supplement may be paid by the hour at less than 7 ("ותק 160.00 1.50 240.00": 160 hours at 1.50 ₪), so on
   *  other lines the size proves nothing.
   *  Otherwise by its place: the amount closes the row, so the quantity is the factor further from it (the first
   *  one in a row that ends with its amount, the last one in a row printed the other way round: "367.50 105.00 3.50"
   *  is 3.5 hours at 105, and it was read as 105 hours, readers campaign, Nov 2026). `byPlace`: the place rule and
   *  the size agree, or (not sure) the place rule alone decided. */
  function productOf(vals, hours, strict) {
    if (vals.length < 3) return null;
    for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) for (let k = 0; k < vals.length; k++) {
      if (k === i || k === j) continue;
      const prod = vals[i] * vals[j];
      // (as close as a rate rounded to agorot allows: half an agora for each hour, and the agora of the amount's own
      // rounding, or of its shekel when it is printed whole; and within 1.5% of it. At 1.5% alone, "חופשה 15.50 083 1.00
      // 15.33" was 15.50 × 1.00 = 15.33, and a vacation balance became a vacation payment, readers campaign, Nov 2026)
      const diff = Math.abs(prod - vals[k]);
      // (a factor of 1 makes the amount and the rate the same number: within rounding, either could be the amount.
      // "שעות שבת 175% 1 85 85.31" read the rate 85.31 as the pay of 85 ₪. Only an exact match is a product then)
      if ((Math.abs(vals[i]) === 1 || Math.abs(vals[j]) === 1) && diff > 0.005) continue;
      if (vals[k] !== 0 && diff / Math.abs(vals[k]) < 0.015 && diff <= 0.011 + (strict ? 0 : (Number.isInteger(vals[k]) ? 0.5 : 0) + 0.0051 * Math.max(Math.abs(vals[i]), Math.abs(vals[j])))) {
        let [q, r] = k < i ? [j, i] : [i, j];
        const aq = Math.abs(vals[q]), ar = Math.abs(vals[r]);
        // (equal factors, "40 40 1600": nothing to decide)
        const sure = !!hours && Math.min(aq, ar) < 7 && Math.max(aq, ar) >= 7;
        const byPlace = !sure || aq < ar;
        if (sure && aq > ar) [q, r] = [r, q];
        return { value: vals[k], qty: vals[q], rate: vals[r], sure, byPlace, even: aq === ar, mid: k > Math.min(i, j) && k < Math.max(i, j) };
      }
    }
    return null;
  }
  /** A balance row (previous + accrued − used = balance, in either reading direction): its closing balance, or null. */
  function balanceRow(vals) {
    if (vals.some((v) => v < 0)) return null;
    for (const v of [vals, vals.slice().reverse()]) {
      if (v.length === 4 && close(v[0] + v[1] - v[2], v[3])) return v[3];
      if (v.length === 3 && close(v[0] + v[1], v[2]) && !productOf(v)) return v[2];
    }
    return null;
  }
  /** Days and the money for them ("ימי מחלה 2.00 350.00"): two values, a day count and an amount far above it. */
  function daysAndAmount(vals) {
    if (vals.length !== 2) return false;
    const [a, b] = vals[0] <= vals[1] ? vals : [vals[1], vals[0]];
    return a > 0 && a <= 31 && b >= 50 && b >= a * 20;
  }
  /**
   * Is this line, matched to a payment field, really a payment? Returns the field to file it under: the payment
   * field, the balance it shows (sick and vacation days), or null when it is a count with no money in it.
   */
  function payOrCount(f, line, nums) {
    // only the payments whose name also names a count (the hour lines carry hours by design, travel its days)
    if (!f || f.kind !== 'pay' || !WEAK_PAY[f.key]) return f;
    const vals = nums.filter((x) => !x.pct).map((x) => x.v);
    // (a product is the proof of a payment only on a whole line, and not with a factor of 1: x × 1 = x proves nothing.
    // "מחלה 16.75 1.00ו 1.00 16.75", a balance row with a stray letter, became a sick payment, readers campaign)
    const prod0 = numbersIn(line).dirty ? null : productOf(vals);
    const prod = prod0 && Math.abs(prod0.qty) !== 1 && Math.abs(prod0.rate) !== 1 ? prod0 : null;
    const named = WEAK_PAY[f.key].test(line);
    // a row of four that adds up (previous + accrued − used = balance) is a balance row even when two of its numbers
    // multiply to a third by chance (15.50 × 1.00 ≈ 15.33 made the vacation balance a vacation payment, readers
    // campaign, Nov 2026)
    const row = vals.length === 4 ? balanceRow(vals) : !prod && vals.length >= 3 ? balanceRow(vals) : null;
    // the balance it shows, when the line is the balance (a usage or accrual line alone is not the balance)
    const asBalance = () => (BALANCE_OF[f.key] && (row != null || /יתר[הת]/.test(line)) ? FIELD[BALANCE_OF[f.key]] : null);
    // a balance, accrual or usage line: information (a named payment with qty × rate = amount stays a payment)
    if (row != null) return asBalance();
    if (BALANCE_WORD.test(line) && !(named && prod)) return asBalance();
    if (prod) return f;
    if (QTY_WORD.test(line)) return daysAndAmount(vals) ? f : null;
    if (named) return f;
    // the bare word ("מחלה", "ותק"): a payment only with an amount column (a sum in shekels, with agorot)
    return nums.some((x) => !x.pct && x.dec && Math.abs(x.v) >= 50) ? f : null;
  }

  /** Choose amount / qty / rate from a line's numbers. */
  /** productOf, also when one number lost its decimal point ("5.00 47.50 23750"): quantity × rate says where it was. */
  function productFix(nums, vals, hours) {
    vals = vals || nums.filter((x) => !x.pct).map((x) => x.v);
    // (on a line with a decimal point lost to a space, a whole amount is no whole-shekel amount: "7.75 411 53" is not
    // 7.75 × 53 = 411, readers campaign, Nov 2026)
    const strict = !!nums.gap;
    const prod = productOf(vals, hours, strict);
    if (prod || vals.length < 3) return prod;
    const flat = nums.filter((x) => !x.pct);
    if (flat.length !== vals.length) return null;
    const fixes = [];
    for (let i = 0; i < flat.length; i++) {
      if (flat[i].dec || Math.abs(flat[i].v) < 100 || strict) continue;
      const fixed = productOf(vals.map((v, j) => (j === i ? v / 100 : v)), hours, strict);
      if (fixed && [fixed.value, fixed.qty, fixed.rate].includes(vals[i] / 100)) fixes.push(fixed);
    }
    // two numbers could each be the one that lost its point ("136 4875 6630"): the reading with a rate a person is paid
    const sane = fixes.length > 1 ? fixes.filter((x) => Math.abs(x.rate) >= 7 && Math.abs(x.rate) <= 500) : fixes;
    return sane.length === 1 ? sane[0] : null;
  }
  function pickValues(f, nums) {
    let vals = nums.filter((x) => !x.pct).map((x) => x.v);
    const pcts = nums.filter((x) => x.pct).map((x) => x.v);
    if (!vals.length) return null;
    // (two amounts glued on a total or information line: which one is it is not sure)
    if (nums.glued && (f.kind === 'total' || f.kind === 'info' || f.kind === 'emp')) return null;
    if (f.kind === 'info') {
      // (an unread token on an information line: the number after the name may be the wrong one; and an information
      // line is one number, or a balance row: "שעות עבודה בפועל 60.00 50.75 3 045.00" is a payment's row)
      if (nums.dirty || nums.some((x) => x.spaced)) return null;
      if (!(f.key === 'sickBalance' || f.key === 'vacationBalance') && vals.length > 2) return null;
      // a balance row's closing balance (not the previous balance it starts with)
      // (read in printed order only: backwards, three numbers add up by chance, "חופשה 2.25 1.25 1.00" with its last
      // column lost gave 1.00 + 1.25 = 2.25 and a balance of 2.25, readers campaign, Nov 2026. A row of three or more
      // that does not add up is asked for, never its first number)
      const bal = f.key === 'sickBalance' || f.key === 'vacationBalance';
      if (bal && vals.length >= 3) {
        const fwd = vals.length === 4 ? (close(vals[0] + vals[1] - vals[2], vals[3]) ? vals[3] : null) : vals.length === 3 && close(vals[0] + vals[1], vals[2]) ? vals[2] : null;
        return fwd != null && !vals.some((v) => v < 0) ? { value: fwd } : null;
      }
      return { value: vals[0] };
    }
    // "8 500.00" is 8,500 with its thousands split by a space, or two numbers (8 hours, 500 ₪). The line's own
    // arithmetic decides: the reading in which quantity × rate = amount. With no such proof the line is left for the
    // person to fill in: read as the last number it was 500, and "50.75 60.00 3 045.00" a pay of 45 ₪ (deep review
    // and readers campaign, Nov 2026). A travel refund is never thousands: its days and its sum.
    if (nums.some((x) => x.spaced)) {
      if (f.kind === 'total' || f.kind === 'ded' || f.kind === 'emp') return null;
      const joined = [];
      const flat = nums.filter((x) => !x.pct);
      for (let i = 0; i < flat.length; i++) {
        if (flat[i].spaced && flat[i + 1]) { joined.push((Math.abs(flat[i].v) * 1000 + Math.abs(flat[i + 1].v)) * (flat[i].v < 0 || flat[i + 1].v < 0 ? -1 : 1)); i++; } else joined.push(flat[i].v);
      }
      const pj = productOf(joined), ps = productOf(vals);
      if (pj && !ps) vals = joined;
      else if (!(ps && !pj) && !(f.key === 'travel' && vals.length === 2)) return null;
    }
    const prod = productFix(nums, vals, f.hours);
    if (prod) return Object.assign(prod, { pct: pcts[0] });
    // a token that mixes digits and letters ("3,S45.00") was not read: without the product's proof, the numbers
    // left on the line are not the whole line
    if (nums.dirty) return null;
    // a deduction next to its base or its running total ("מס הכנסה 243.18 1,215.90", "ביטוח לאומי 6,090.53 63.34"):
    // the deduction is the smaller one, whichever column comes first (read as the last number it was the year's
    // total, readers campaign, Nov 2026)
    // (and a deduction next to a whole number on a line that has agorot: "ביטוח לאומי 16395 1,475.55" is 163.95 with its
    // point lost, and the other one the year's total: the line is asked for)
    if ((f.kind === 'ded' || f.kind === 'emp' || f.kind === 'total') && vals.length >= 2 && nums.some((x) => !x.pct && x.dec) && nums.some((x) => !x.pct && !x.dec && Math.abs(x.v) >= 100)) return null;
    if (f.kind === 'ded' && vals.length === 2 && nums.filter((x) => !x.pct).every((x) => x.dec)) return { value: Math.min(Math.abs(vals[0]), Math.abs(vals[1])), pct: pcts[0] };
    if (vals.length === 2 && (f.hours || (WEAK_PAY[f.key] && daysAndAmount(vals)))) {
      // qty + amount (rate missing): hours, or the days of a day-based payment ("ימי מחלה 2.00 350.00"), in either
      // order: the count is the smaller one (a pay rate is above 1 ₪). In printed order the amount was read as the
      // hours when the columns came the other way (deep review, Nov 2026).
      const [q, v] = Math.abs(vals[0]) <= Math.abs(vals[1]) ? vals : [vals[1], vals[0]];
      // (an hours line: the two may also be its rate and amount, or its hours and rate, with a column lost: parseText
      // checks them against the slip's hourly wage, `two`)
      return Object.assign({ value: v, qty: q, pct: pcts[0] }, f.hours ? { two: true } : null);
    }
    // (a payment with three numbers or more whose hours × rate = amount fails: its own arithmetic does not hold, the
    // last one is a guess. "מחלה 29.50 1.500.00 31.00" was a sick pay of 31 ₪, readers campaign, Nov 2026)
    if (f.kind === 'pay' && vals.length >= 3) return null;
    const last = vals[vals.length - 1];
    // a bare "00" left of a misread amount is never the amount (the rule: a misreading is not a value)
    if (last === 0 && vals.some((x) => x !== 0)) return null;
    // (an hours line with one number: its pay, or its hours with the rest of the row lost; parseText checks it, `two`)
    return Object.assign({ value: last, pct: pcts[0] }, bareInt(nums, last) ? { bare: true } : null, f.hours && vals.length === 1 ? { one: true } : null);
  }
  /** Was this value printed as a whole number of four digits or more, with no separator ("89315")? */
  const bareInt = (nums, v) => nums.some((x) => !x.pct && !x.dec && x.v === v && Math.abs(x.v) >= 1000 && /^-?\d+-?$/.test(x.raw.trim()));

  /* ---------------- one printed row, several lines ----------------
   * Payslips print two tables side by side (the payments on the right, the deductions on the left), two totals on one
   * row, or a row of small details ("ותק 2.4 אחוז משרה 100.00"). Read as one line, the row took the first name it
   * matched and every number on it: the base pay became the income tax, the union fee became the travel refund, the
   * job percent became a seniority payment (readers campaign, Nov 2026). A row is cut into its parts, each a name
   * with its own numbers. A word between the numbers of ONE line stays in it: a unit ("שעות", "ש"ח"), the words of a
   * balance row ("יתרה קודמת … ניצול … יתרה"), or any word the quantity × rate = amount product runs across. */
  // i18n-keep-start (the words printed on an Israeli payslip)
  const NUM_TOKEN = /^[-+(₪]*\d[\d.,:\/-]*\)?%?-?₪?$/;
  const TIER_TOKEN = /^(?:100|125|150|175|200)%$/;
  const NOISE_TOKEN = /^[|_\-–—:;.,=*×xX₪%'"`~]+$/;
  /** The currency printed after an amount ("3,045.00 ש"ח"): no name. Read as one, a row ending with it was taken for a
   *  sheet built left to right, turned around, and its symbol code became the pay (readers campaign, Nov 2026). */
  const CURRENCY_TOKEN = /^(?:ש"ח|ש''ח|שח|NIS|ILS)$/;
  const UNIT_WORDS = /^(?:ש"ח|ש''ח|שח|שעות|שעה|ש'|ימים|יום|ימי|יח'|כמות|תעריף|סכום|אחוז|לשעה|ליום|כפול|א|קופה)$/;
  const ROW_WORDS = /^(?:יתר[הת]|קודמת|צבירה|נצבר|זיכוי|ניצול|נוצל|זכאות|חדשה|פתיחה|סגירה|נוכחית|סופית|חודשית)$/;
  // i18n-keep-end
  /** The runs of a line: words (a name) and numbers, in printed order. A tier ("125%") belongs to the name. */
  function runsOf(line) {
    const runs = [];
    for (const t of line.split(' ')) {
      if (!t) continue;
      const kind = NOISE_TOKEN.test(t) || CURRENCY_TOKEN.test(t) ? null : TIER_TOKEN.test(t) ? 'w' : NUM_TOKEN.test(t) || (/\d/.test(t) && !/[֐-׿]{3}/.test(t)) ? 'n' : 'w';
      const last = runs[runs.length - 1];
      if (kind == null) { if (last) last.t.push(t); continue; }
      if (last && last.kind === kind) last.t.push(t);
      else runs.push({ kind, t: [t] });
    }
    return runs;
  }
  const wordsOf = (run) => run.t.filter((t) => !NOISE_TOKEN.test(t) && !CURRENCY_TOKEN.test(t));
  const valsOf = (run) => numbersIn(run.t.join(' ')).filter((x) => !x.pct).map((x) => x.v);
  // i18n-keep-start (the words printed on an Israeli payslip)
  const VOCAB = new Set(FIELDS.reduce((a, f) => a.concat(f.pats.join(' ').split(' ')), []).concat(['תלוש', 'שכר', 'שעות', 'עובד', 'מעסיק', 'מעביד', 'חודש', 'תשלומים', 'ניכויים', 'סכום', 'כמות', 'תעריף', 'יתרה', 'מצטבר',
    'חשבון', 'בנק', 'סניף', 'כתובת', 'תאריך', 'זהות', 'מספר', 'עבודה', 'ימים', 'אחוז', 'משרה', 'חובה', 'רשות', 'קופות', 'מבוטח', 'צבירה', 'ניצול', 'קודמת', 'תחילת', 'משפחתי', 'מינימום', 'לחודש', 'לשעה', 'הדפסה'])
    .filter((w) => /^[א-ת]{3,}$/.test(w)));
  // i18n-keep-end
  /** Are the line's Hebrew words written backwards (visual order)? More of them are payslip words when reversed. */
  function reversedWords(line) {
    const v = wordVotes(line);
    return v.back > v.fwd;
  }
  /** How many of the line's Hebrew words are payslip words as they are (fwd) and backwards (back). */
  function wordVotes(line) {
    let fwd = 0, back = 0;
    for (const t of line.split(' ')) {
      const w = t.replace(/^[^א-ת]+|[^א-ת]+$/g, '');
      if (!/^[א-ת]{3,}$/.test(w)) continue;
      if (VOCAB.has(w)) fwd++;
      if (VOCAB.has(revStr(w))) back++;
    }
    return { fwd, back };
  }
  // i18n-keep-start (the words printed on an Israeli payslip)
  const NAME_PATS = FIELDS.reduce((a, f) => a.concat(f.pats.filter((x) => HEB.test(x))), []).sort((a, b) => b.length - a.length);
  const NAME_EXTRA = /^(?:שוטף|לתשלום|בש"ח|חודשי|החודש)$/;
  // i18n-keep-end
  /**
   * A row of column names ("ברוטו שוטף סה"כ ניכויים שכר נטו סכום בבנק"): its names in order, [{ text, f }], when every
   * word of the row belongs to a name the reader knows (two at least). One unknown word and the row is left alone:
   * its numbers could not be paired for sure.
   */
  function nameRow(line) {
    const found = [];
    let rest = ' ' + line + ' ';
    for (const pat of NAME_PATS) {
      let at;
      while ((at = rest.indexOf(' ' + pat + ' ')) >= 0) {
        found.push({ at, text: pat });
        rest = rest.slice(0, at + 1) + '\u0000'.repeat(pat.length) + rest.slice(at + 1 + pat.length);
      }
    }
    if (found.length < 2) return null;
    found.sort((a, b) => a.at - b.at);
    // the words between the names: only the ones that go with a name ("שוטף", "לתשלום")
    const left = rest.replace(/\u0000+/g, ' ').split(' ').filter(Boolean);
    if (!left.every((w) => NAME_EXTRA.test(w))) return null;
    const list = found.map((x) => ({ text: x.text, f: matchField(x.text) }));
    return list.every((x) => x.f) ? list : null;
  }
  /** Is this text one whole name the reader knows ("ברוטו שוטף", "שכר נטו"), not a word of one ("ימי", "עבודה")? */
  function wholeName(t) {
    // (any of the names it may hold: "שכר נטו לתשלום" is "שכר נטו" and "לתשלום", though "נטו לתשלום" is a name too)
    return NAME_PATS.some((p) => (t === p || t.startsWith(p + ' ') || t.endsWith(' ' + p)) && t.replace(p, ' ').split(' ').filter(Boolean).every((w) => NAME_EXTRA.test(w)));
  }
  /** The numbers first and the name last (a symbol code may follow the name): a row printed the other way round. */
  function nameLast(line) {
    const runs = runsOf(line);
    const w = runs.map((r) => r.kind).lastIndexOf('w');
    if (w < 1 || runs[0].kind !== 'n' || runs.slice(0, w).some((r) => r.kind === 'w' && !r.t.every((t) => TIER_TOKEN.test(t)))) return false;
    const tail = runs.slice(w + 1);
    return !tail.length || (tail.length === 1 && tail[0].t.length === 1 && /^\d{1,6}$/.test(tail[0].t[0]));
  }
  /** A printed row → its lines, each a name followed by its numbers (a row with one name comes back as it is). */
  function segments(line, rowsAfter) {
    let runs = runsOf(line);
    const code0 = runs.length > 1 && runs[0].kind === 'n' && runs[0].t.length === 1 && /^\d{1,6}$/.test(runs[0].t[0]) && runs[1].kind === 'w';
    // the numbers before the names (a sheet built left to right): mirrored, so every name leads its numbers. Not when
    // the first number is a symbol code before a name ("0006 דמי חגים 320.00 ניכויי חובה": turned around, the code
    // became the holiday pay, readers campaign, Nov 2026)
    const numsFirst = runs.length > 1 && runs[0].kind === 'n' && runs[runs.length - 1].kind === 'w' && !code0;
    if (numsFirst) runs = runs.slice().reverse();
    const segs = [];
    // numbers before the first name, when that name has numbers of its own after it, are not its numbers (they are the
    // line before it, its name left on a line of its own: "3.50 105.00 367.50 ביטוח לאומי 56.32" gave a National
    // Insurance of 367.50, readers campaign, Nov 2026). A lone whole number there is the name's symbol code.
    // (not in a row printed the other way round with its symbol code last, "146.03 53.10 2.75 ש.נ 150% 91")
    if (!numsFirst && runs.length >= 3 && runs[0].kind === 'n' && runs[1].kind === 'w' && runs[2].kind === 'n' && !code0 && !nameLast(line)) {
      segs.push([runs[0]]);
      runs = runs.slice(1);
    }
    if (segs.length === 0 && runs.filter((r) => r.kind === 'w').length < 2) return [line];
    let cur = [], named = false, vals = [], numRun = false;
    const close = () => { if (cur.length) segs.push(cur); cur = []; named = false; vals = []; numRun = false; };
    runs.forEach((r, i) => {
      // (a run counts as the name's numbers even when none of them could be read: "ביטוח לאומי l63.95 שעות נוספות
      // 125% 8.50 65.00 552.50" was one line, and the deduction took the overtime's amount)
      if (r.kind === 'n') { cur.push(r); if (named) { vals = vals.concat(valsOf(r)); numRun = true; } return; }
      const next = runs[i + 1];
      const words = wordsOf(r);
      // a second name: it has numbers before it (of the name this part began with) and numbers of its own after it
      // (a tier alone between the numbers, "שעות שבת 3.50 105.00 175% 367.50", is the row's percent column, not a
      // second name: cut there, the amount became a second Shabbat line and the pay was counted twice, readers
      // campaign, Nov 2026)
      if (named && numRun && next && next.kind === 'n' && !words.every((w) => ROW_WORDS.test(w)) && !words.every((w) => TIER_TOKEN.test(w))) {
        const own = !!matchField(words.join(' '));
        const across = !productOf(vals) && !!productOf(vals.concat(valsOf(next)));
        if (own || (!across && !words.every((w) => UNIT_WORDS.test(w)))) {
          // a whole number right before the name is its symbol code, when the line before it has its amounts
          const prev = cur[cur.length - 1];
          // (the line before it is whole without it: its product holds, or it has an amount and the number is short)
          const lastT = prev.kind === 'n' && prev.t.length > 1 && /^\d{1,6}$/.test(prev.t[prev.t.length - 1]) ? +prev.t[prev.t.length - 1] : null;
          const rest = lastT != null ? vals.slice(0, -1) : vals;
          // (two digits after a whole number are its agorot with the point lost, "5,956 05": no code)
          const agorot = lastT != null && /^\d{2}$/.test(prev.t[prev.t.length - 1]) && /^-?[\d,]+$/.test(prev.t[prev.t.length - 2]);
          const isCode = lastT != null && !agorot && prev.t.slice(0, -1).some((t) => /\d[.,]\d{2}\D*$/.test(t)) && !productOf(rest.concat(lastT / 100))
            && (productOf(rest) ? true : !productOf(vals) && lastT < 10000);
          const code = isCode ? prev.t.pop() : null;
          close();
          if (code) cur.push({ kind: 'n', t: [code] });
        }
      }
      // words after the name's numbers with nothing after them (a heading or another row's name the recognition joined
      // to this line: "קרן פנסיה 319.95 הפרשות מעסיק" was the employer's pension) are a part of their own
      // Which side the numbers go with: the name before them when it is a payslip line ("קרן פנסיה"), else the name
      // after them when that one is ("תשלומים 3,045.00 60.00 50.75 שכר רגיל", a sheet built left to right with its
      // heading joined: cut after the numbers, the base pay took the next row's numbers, readers campaign, Nov 2026).
      if (named && numRun && !next && !words.every((w) => UNIT_WORDS.test(w) || ROW_WORDS.test(w) || TIER_TOKEN.test(w))) {
        const lead = [];
        for (const x of cur) { if (x.kind !== 'w') break; lead.push(...wordsOf(x)); }
        // (a row of column names joined after a number, "120.00 קופות גמל שכר מבוטח עובד מעביד פיצויים", is no name)
        if (!rowsAfter || matchField(lead.join(' ')) || !matchField(words.join(' ')) || words.length > 4) close();
        else { const k = cur.findIndex((x) => x.kind === 'n'); segs.push(cur.slice(0, k)); cur = cur.slice(k); }
      }
      cur.push(r);
      named = true;
    });
    close();
    if (segs.length < 2) return [line];
    return segs.map((s) => s.map((r) => r.t.join(' ')).join(' '));
  }

  /** Group pdf.js text items into logical lines (right-to-left). */
  function linesFromPdfItems(items) {
    // A row's pieces sit a little above or below each other (another font, a bold amount): measured from the row's
    // first piece, a piece 3 points off began a new line, and a row's amount was left on a line of its own (readers
    // campaign, Nov 2026). The pieces are sorted by height and a row grows while the next one is within 3 points of
    // the one before it.
    const rows = [];
    const list = items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str, w: it.width || 0 })).sort((a, b) => b.y - a.y);
    let last = null;
    for (const it of list) {
      if (!last || last.y - it.y >= 3) rows.push({ y: it.y, items: [] });
      rows[rows.length - 1].items.push({ x: it.x, s: it.s, w: it.w });
      last = it;
    }
    const out = [];
    rows.forEach((r, i) => {
      r.items.sort((a, b) => b.x - a.x);
      r.items = joinPieces(r.items);
      out.push(r.items.map((it) => it.s).join(' '));
      out.push(...tableColumns(rows[i - 1], r));
    });
    return out;
  }
  /**
   * A PDF may draw one number or one word in pieces ("3,04" + "5.00", or a letter at a time). Joined with spaces from
   * right to left, an amount came out as "5.00 3,04" and was read as 4 ₪, a word as single letters (readers campaign,
   * Nov 2026). Pieces that touch (no gap a space would leave) are one token again: a number's pieces from left to
   * right, a Hebrew word's from right to left. items: one row, sorted from the right.
   */
  function joinPieces(items) {
    const out = [];
    const cw = (it) => (it.w > 0 && it.s.trim().length ? it.w / it.s.trim().length : 0);
    const kind = (it) => (HEB.test(it.s) ? 'h' : /\d/.test(it.s) ? 'n' : 'o');
    for (const it of items) {
      const g = out[out.length - 1];
      const prev = g && g.p[g.p.length - 1];
      const c = prev ? Math.min(cw(prev), cw(it)) : 0;
      const gap = prev ? prev.x - (it.x + it.w) : 0;
      const k = kind(it);
      // the same kind (a mark such as "%" or a quote goes with either), no space at the touching edges, and closer
      // than a third of a character
      if (prev && c > 0 && (k === g.kind || k === 'o' || g.kind === 'o') && gap < c * 0.3 && gap > -c && !/^\s|\s$/.test(it.s) && !/^\s|\s$/.test(prev.s)) {
        g.p.push(it);
        if (g.kind === 'o') g.kind = k;
      } else out.push({ p: [it], kind: k });
    }
    return out.map((g) => { const right = g.p[0], left = g.p[g.p.length - 1]; return { s: (g.kind === 'h' ? g.p : g.p.slice().reverse()).map((it) => it.s).join(''), x: left.x, w: right.x + right.w - left.x }; });
  }
  /**
   * A summary table printed as a row of column names over a row of numbers ("ברוטו שוטף … שכר נטו … סכום בבנק"
   * above "10,000.00 … 8,500.00 … 8,500.00"): joined row by row, the numbers lost their names and the net was
   * missed (real payslip, Nov 2026). Each number is paired with the name above it (the nearest by the middle of
   * the box), and the totals and information columns come out as their own "name value" lines. The columns that
   * repeat a payment (the base, the overtime) stay as printed: read again they would be added to the lines above.
   */
  const NUM_CELL = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?-?$/;
  function tableColumns(head, row) {
    if (!head || !row) return [];
    const nums = row.items.map((it) => ({ s: it.s.trim(), x: it.x, w: it.w })).filter((it) => it.s);
    const names = head.items.map((it) => ({ s: normalize(it.s), x: it.x, w: it.w })).filter((it) => it.s);
    if (nums.length < 3 || names.length < 3 || !nums.every((it) => NUM_CELL.test(it.s))) return [];
    if (!names.every((it) => HEB.test(it.s) && !/\d/.test(it.s))) return [];
    // A PDF gives each word of a name as its own piece: paired word by word with the nearest number, "ימי עבודה שעות
    // עבודה …" shifted by a column and the work hours were 18 (readers campaign round 2, from the payslip screen's
    // sample). When the row's names, read whole, are as many as its numbers, the row under a row of names is read by
    // parseText in order (heads); here only a piece that is a whole name by itself is paired.
    const mid = (it) => it.x + it.w / 2;
    const lines = [];
    for (const nm of names) {
      if (!wholeName(nm.s)) continue;
      let best = null;
      for (const nu of nums) { const d = Math.abs(mid(nu) - mid(nm)); if (!best || d < best.d) best = { d, nu }; }
      if (!best || best.d > Math.max(nm.w, best.nu.w) * 0.75 + 4) continue;
      const f = matchField(nm.s);
      if (f && (f.kind === 'total' || f.kind === 'info')) lines.push(nm.s + ' ' + best.nu.s);
    }
    return lines;
  }

  // i18n-keep
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  function detectPeriod(text) {
    const counts = {};
    const bump = (y, m) => { if (y < 2000 || y > 2100 || m < 1 || m > 12) return; const k = y + '-' + U.pad(m); counts[k] = (counts[k] || 0) + 1; };
    let m;
    // a full date (the print date, the start date, the payment date) is not the pay month: its "MM/YYYY" tail was
    // read as one, and the print date of the next month won (deep review, Nov 2026)
    const t = text.replace(/(^|[^\d])\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?!\d)/g, '$1 ');
    // a month right after the payslip's own label ("לחודש", "תקופה") counts above a bare one
    // i18n-keep the words printed on an Israeli payslip
    const LABEL = /(?:חודש|תקופ[הת]|משכורת|שכר)[\s:'"]*$/;
    const labelled = (i) => LABEL.test(t.slice(Math.max(0, i - 14), i));
    const re1 = /(?:^|[^\d])(\d{1,2})[\/.-](20\d{2})(?!\d)/g;
    while ((m = re1.exec(t))) { const at = m.index + m[0].indexOf(m[1]); bump(+m[2], +m[1]); if (labelled(at)) { bump(+m[2], +m[1]); bump(+m[2], +m[1]); } }
    MONTHS.forEach((name, i) => {
      // i18n-keep a pattern for the Hebrew payslip's text
      const re = new RegExp(name + "\\s*['׳]?\\s*(20\\d{2})", 'g');
      let mm;
      while ((mm = re.exec(t))) { bump(+mm[1], i + 1); bump(+mm[1], i + 1); if (labelled(mm.index)) { bump(+mm[1], i + 1); bump(+mm[1], i + 1); } }
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }

  // i18n-keep-start (the words printed on an Israeli payslip)
  /** The amount that reaches the bank, after every deduction ("שכר נטו" may still be before the voluntary ones). */
  const NET_FINAL = /נטו לתשלום|בבנק|לבנק/;
  /** The total of the mandatory deductions only: not the total of all the deductions. */
  const MAND_TOTAL = /ניכויי חובה/;
  /** The heading of the year's block, inside a line. */
  const CUM_HEAD = /(?:סכומים|נתונים|ערכים) מצטברים|מצטבר שנתי|מצטבר מתחילת/;
  const GROSS_TOTAL = /סה"כ ברוטו|סך כל התשלומים|סה"כ תשלומים|סה"כ התשלומים/;
  /** The columns of a fund table: the worker's share, the employer's, the severance. */
  const FUND_COLS = [['emp', /עובד/], ['er', /מעביד|מעסיק/], ['sev', /פיצויים/]];
  const FUND_KEYS = { pensionEmployee: { emp: 'pensionEmployee', er: 'pensionEmployer', sev: 'severance' }, hishtalmutEmployee: { emp: 'hishtalmutEmployee', er: 'hishtalmutEmployer' } };
  // i18n-keep-end
  /**
   * A fund row that prints the worker's and the employer's shares side by side ("5,332.50 6.00% 319.95 6.50% 346.61
   * 8.33% 444.20"): each percent with its amount, in printed order, or null when the row is not of that shape. The
   * amounts must fit their percents (of the insured wage on the row, or of one wage they share). Read as one
   * deduction the row gave its last number, the severance, as the worker's pension (readers campaign, Nov 2026).
   */
  function fundShares(nums) {
    const fitsAll = (pairs, b) => pairs.every((x) => Math.abs(b * x.p / 100 - x.v) <= Math.max(0.03, x.v * 0.003));
    const pIdx = nums.map((x, i) => (x.pct ? i : -1)).filter((i) => i >= 0);
    const vals = nums.filter((x) => !x.pct).map((x) => x.v);
    if (pIdx.length >= 2) {
      for (const dir of [1, -1]) {
        const pairs = pIdx.map((i) => { const a = nums[i + dir]; return a && !a.pct ? { p: nums[i].v, v: a.v } : null; });
        if (pairs.some((x) => !x || !(x.p > 0))) continue;
        if (vals.some((b) => fitsAll(pairs, b)) || fitsAll(pairs, pairs[0].v / pairs[0].p * 100)) return pairs;
      }
      return null;
    }
    if (pIdx.length) return null;
    // the percents printed without "%": a wage on the row, and two or more (percent, amount) pairs that fit it
    for (const b of vals) {
      if (!(b >= 100)) continue;
      const pairs = [];
      for (let i = 0; i + 1 < nums.length; i++) {
        const p = nums[i].v, v = nums[i + 1].v;
        if (p > 0 && p <= 25 && v !== b && Math.abs(b * p / 100 - v) <= Math.max(0.03, v * 0.003)) { pairs.push({ p, v }); i++; }
      }
      if (pairs.length >= 2) return pairs;
    }
    return null;
  }

  /**
   * Parse raw text (one line per row).
   * Returns { fields:{key:{value,qty,rate,pct,line}}, other:[{line,value,guess}], period, lineCount }.
   * A field with value null is a line that was seen and could not be read for sure: the check screen asks for it.
   */
  /**
   * Some PDFs store each line backwards, letter by letter and digit by digit ("00.0 הסנכה סמ", "50.659,5"): the
   * Hebrew words are reversed and so are the amounts, so the words were not matched and the amounts became other
   * numbers (5,956.05 read as 50.659, readers campaign, Nov 2026). An amount with agorot ("5,956.05") reversed no
   * longer has its two decimals at the end: a line whose amounts read right only backwards is turned around, and so
   * is a line with no amount to tell when the rest of the payslip is backwards and its words read right backwards.
   */
  const MONEY_SHAPE = /^\d{1,3}(?:,\d{3})*\.\d{2}$|^\d+\.\d{2}$/;
  /** A number as it may be printed forwards: whole or with one or two decimals, thousands in threes, no "00." start. */
  const FWD_SHAPE = /^(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d{1,2})?$|^(?:[1-9]\d{0,2}(?:\.\d{3})+|\d+),\d{2}$/;
  /** How many of the line's numbers read right as they are (fwd) and only backwards (back). A backwards vote needs a
   *  number no payslip prints forwards ("00.0", "50.659,5", "%571"): "35.4" is a rate as it is, though "4.53" would be
   *  an amount (a visual-order payslip with its digits intact was turned around on that, readers campaign). The year
   *  on the month's line votes too ("6202" by a month's name). */
  function moneyVotes(line) {
    let fwd = 0, back = 0;
    const month = MONTHS.some((m) => line.includes(m) || line.includes(revStr(m)));
    for (const t of line.split(' ')) {
      if (/^%\d+(?:\.\d+)?$/.test(t)) { back++; continue; }
      if (/^\d+(?:\.\d+)?%$/.test(t)) { fwd++; continue; }
      if (month && /^\d{4}$/.test(t)) { if (/^20[0-4]\d$/.test(t)) fwd++; else if (/^20[0-4]\d$/.test(revStr(t))) back++; continue; }
      const n = t.replace(/^[-₪(]+|[-₪)]+$/g, '');
      if (!/^\d[\d.,]*\d$/.test(n)) continue;
      const a = MONEY_SHAPE.test(n), b = MONEY_SHAPE.test(revStr(n));
      // (a vote either way needs the other reading to be one no payslip prints: "4.53" read backwards is the rate "35.4")
      if (a && !b && !FWD_SHAPE.test(revStr(n))) fwd++;
      if (b && !a && !FWD_SHAPE.test(n)) back++;
    }
    return { fwd, back };
  }
  function unreverse(lines) {
    const votes = lines.map(moneyVotes);
    const fwd = votes.reduce((s, v) => s + v.fwd, 0), back = votes.reduce((s, v) => s + v.back, 0);
    const words = lines.map(wordVotes).reduce((a, w) => ({ fwd: a.fwd + w.fwd, back: a.back + w.back }), { fwd: 0, back: 0 });
    const doc = (back >= 2 && back > fwd * 2) || (back >= 1 && fwd === 0 && words.back > words.fwd * 2);
    return lines.map((l, i) => {
      const v = votes[i];
      // (the words have the last say: "ותק 12.5" has an amount shape only backwards, "5.21", and its word reads forwards)
      const w = wordVotes(l);
      if (w.fwd > w.back) return l;
      if (v.back > v.fwd || (doc && !v.fwd && w.fwd <= w.back)) return normalize(revStr(l));
      return l;
    });
  }
  function parseText(text) {
    const allLines = unreverse(text.split(/\r?\n/).map(normalize).filter(Boolean));
    // Two payslips in one file (the worker's copy and the employer's, two months downloaded together, two workplaces):
    // read as one, every payment was counted twice (readers campaign, Nov 2026). The second one starts at the second
    // title line ("תלוש שכר לחודש 07/2026"); only the first is read, and what the second one holds is not added to it.
    // (or where the payslip's first three lines come again, the same copy printed twice with no title word)
    const titles = allLines.map((l, i) => ((/תלוש/.test(l) || /^חודש\b/.test(l)) && /\d/.test(l) && detectPeriod(l) ? i : -1)).filter((i) => i >= 0);
    let cut = titles.length > 1 && titles[1] - titles[0] > 3 ? titles[1] : allLines.length;
    for (let j = 4; j + 2 < cut; j++) if (allLines[j] === allLines[0] && allLines[j + 1] === allLines[1] && allLines[j + 2] === allLines[2]) { cut = j; break; }
    const rawLines = allLines.slice(0, cut);
    // Which side of its numbers a name is printed on, over the whole payslip: before them (read from the right) or
    // after them (a sheet built left to right). A name left alone on its line takes the numbers at the start of the
    // next line only on a payslip of the first kind: on the other, those are the next row's (readers campaign).
    // The side is counted apart for the rows (payments, deductions) and for the totals and information: a sheet may
    // print its rows left to right and its totals right to left ("36160 נסיעות" took the next row's amount).
    // A column of symbol codes printed right after the names ("שעות עבודה בפועל 301 35.40 …", "דמי חגים 304 960.00"):
    // whole numbers that rise by 1 to 3 from row to row. Read as a value, the code was a holiday pay of 304 ₪ (readers
    // campaign, Nov 2026). They are taken out of their lines.
    {
      const cand = rawLines.map((l) => { const rs = runsOf(l); return rs.length >= 2 && rs[0].kind === 'w' && rs[1].kind === 'n' && /^\d{2,4}$/.test(rs[1].t[0]) && matchField(rs[0].t.join(' ')) ? +rs[1].t[0] : null; });
      let best = [], cur = [];
      cand.forEach((c, i) => {
        if (c == null) return;
        if (cur.length && c - cand[cur[cur.length - 1]] >= 1 && c - cand[cur[cur.length - 1]] <= 3) cur.push(i); else cur = [i];
        if (cur.length > best.length) best = cur.slice();
      });
      // (two rows are enough when their codes follow each other and are of three digits or more: 301, 302)
      if (best.length >= 3 || (best.length === 2 && cand[best[1]] - cand[best[0]] === 1 && cand[best[0]] >= 100)) for (const i of best) { const rs = runsOf(rawLines[i]); rs[1].t.shift(); rawLines[i] = rs.filter((r) => r.t.length).map((r) => r.t.join(' ')).join(' '); }
    }
    const side = { row: [0, 0], sum: [0, 0] };
    const groupOf = (fd) => (fd.kind === 'total' || fd.kind === 'info' ? 'sum' : 'row');
    for (const l of rawLines) {
      if (!/\d/.test(l) || !HEB.test(l)) continue;
      const rs = runsOf(l);
      const lead = rs[0] && rs[0].kind === 'n' && rs[0].t.length === 1 && /^\d{1,6}$/.test(rs[0].t[0]) && rs[1] && rs[1].kind === 'w' ? rs.slice(1) : rs;
      const f1 = lead.length >= 2 && lead[0].kind === 'w' && lead[1].kind === 'n' ? matchField(lead[0].t.join(' ')) : null;
      if (f1) { side[groupOf(f1)][0]++; continue; }
      const f2 = nameLast(l) ? matchField(l) : null;
      if (f2) side[groupOf(f2)][1]++;
    }
    const allFirst = side.row[0] + side.sum[0] > side.row[1] + side.sum[1];
    /** Is a name printed before its numbers, for this field's section? */
    const joinNextFor = (fd) => { const g = side[groupOf(fd)]; return g[0] + g[1] ? g[0] > g[1] : allFirst; };
    const rowsAfter = !(side.row[0] + side.row[1] ? side.row[0] > side.row[1] : allFirst);
    const fields = {};
    const other = [];
    let cumulative = false;
    let hourRate = null; // the hourly rate printed in the header, when there is one
    let colHint = 0; // from the payments table's heading: 1 = the rate next to the amount (hours further), 2 = the other way
    let fundCols = null; // the order of a fund table's columns, from its heading
    let mand = null; // the total of the mandatory deductions, kept apart from the total of all of them
    let heads = null; // a row of column names, waiting for the row of numbers under it
    let pending = null; // a total's name printed alone, waiting for the number on the next line
    const ask = (f, line) => { if (!fields[f.key]) fields[f.key] = { line, value: null }; };
    const logical = []; // the lines in logical order, for the pay month
    const unsure = new Set(); // payments with a line that could not be read: their sum stays unknown
    const money = [], bare = []; // the amounts' style (with agorot or not), and the amounts read from a bare whole number
    const parts = {}, votes = { ok: 0, no: 0, amb: 0 }; // the hour lines' quantity and rate, and what their sizes say about the column order

    /** A line named after a field whose numbers could not be read for sure. */
    function notRead(f, line) {
      // a line that would win over the one read before it (the amount to the bank over a net before the voluntary
      // deductions, the total of the payments over another gross) and cannot be read: the field is asked for. The
      // earlier one stayed, and "שכר נטו" was shown as the net paid (readers campaign, Nov 2026)
      const prior = fields[f.key];
      if (prior && prior.value != null && ((f.key === 'net' && NET_FINAL.test(line) && !NET_FINAL.test(prior.line)) || (f.key === 'gross' && GROSS_TOTAL.test(line) && !GROSS_TOTAL.test(prior.line)))) {
        fields[f.key] = { line: prior.line + ' | ' + line, value: null };
        return;
      }
      // (a payment in several lines with one of them unread is not the sum of the others: "שכר יסוד" for two
      // roles came out as the first role's pay alone, readers campaign, Nov 2026)
      if (f.kind === 'pay' && fields[f.key]) { fields[f.key] = { line: fields[f.key].line + ' | ' + line, value: null }; unsure.add(f.key); }
      else if (f.kind !== 'info') { ask(f, line); if (f.kind === 'pay') unsure.add(f.key); }
      return;
    }
    /** A line of names with no numbers: a row of column names, a fund table's heading, the year's block. Returns true
     *  when it opened the year's block (the line is read no further). */
    function heading(raw) {
      const vis = reversedWords(raw);
      const list = nameRow(vis ? fixVisual(raw) : raw);
      if (list) heads = { list, visual: vis };
      const words = raw.split(' ').length;
      const head = [raw, fixVisual(raw)];
      // the heading of a fund table: the order of its columns (the worker's, the employer's, the severance)
      const fh = head.find((h) => FUND_COLS[0][1].test(h) && FUND_COLS[1][1].test(h));
      if (fh) fundCols = FUND_COLS.filter((c) => c[1].test(fh)).sort((a, b) => fh.search(a[1]) - fh.search(b[1])).map((c) => c[0]);
      // a block of the year's running totals ("- סכומים מצטברים -", "נתונים מצטברים"): its gross and tax are the
      // year's, not the month's (the year's taxable gross was read as the month's, real payslip, Nov 2026). It
      // starts at its heading (a line with no numbers) and ends at the next heading: a "- name -" line or a row
      // of three or more column names. The heading of two columns ("החודש מצטבר") opens no block: the month's
      // numbers are on its lines too (every deduction under it was read as the year's, readers campaign, Nov 2026).
      // the heading of the payments table ("כמות תעריף סכום"): the rate next to the amount, or the hours
      const tw = raw.split(' ');
      const iq = tw.findIndex((w) => /^(?:כמות|שעות|ימים)$/.test(w)), ir = tw.findIndex((w) => /^תעריף$/.test(w)), ia = tw.findIndex((w) => /^(?:סכום|סה"כ)$/.test(w));
      if (iq >= 0 && ir >= 0 && ia >= 0) colHint = Math.abs(ir - ia) < Math.abs(iq - ia) ? 1 : 2;
      const cum = head.find((h) => /מצטבר/.test(h));
      if (cum && words <= 5 && !/חודש|שוטף|נוכחי/.test(cum)) { cumulative = true; return true; }
      if (cumulative && (/^[-–*].*[-–*]$/.test(raw) || words >= 3)) cumulative = false;
      return false;
    }
    function readLine(line, moved) {
      // the hourly rate printed in the header ("שכר שעה 36.00", "תעריף לשעה 60.00") and the job percent ("היקף משרה
      // 100%"): no pay line. They were summed into the base pay (round 2); the rate is kept as evidence of which column
      // of the hour lines is the rate, and both are taken out of the line
      const rm = /(?:שכר|תעריף|ערך) ?ל?שעה(?![א-ת]):? *(\d+(?:\.\d+)?)(?![\d.,%])/.exec(line);
      if (rm) { if (+rm[1] > 0) hourRate = +rm[1]; line = line.replace(rm[0], ' '); }
      line = line.replace(/(?:היקף|אחוז|חלקיות) משרה:? *\d+(?:\.\d+)?%?/g, ' ').replace(/\s+/g, ' ').trim();
      if (!line) return;
      let f = matchField(line);
      // a line matched by its tier alone ("150%") whose name was not read: no Hebrew word, or Latin letters in its name
      // ("שעות naw 150%" for שבת). It was Shabbat pay filed as overtime (round 2, from the payslip screen's sample); it
      // waits among the lines to name
      if (f && f.hours && !byWords(f, line)) {
        const words = line.replace(/[\d.,%₪:/-]+/g, ' ').trim();
        // (a name of single letters is still a name: "125% נ.ש" is overtime; refusing it lost 2 fields of every such
        // payslip in round 2's first try)
        if (!/[֐-׿]/.test(words) || /[A-Za-z]{2,}/.test(words)) f = null;
      }
      if (cumulative && f) {
        // only the year's own lines: the gross and the income tax become the running totals, the rest is skipped
        f = f.key === 'gross' ? FIELD.ytdGross : f.key === 'incomeTax' ? FIELD.ytdTax : f.key === 'ytdGross' || f.key === 'ytdTax' ? f : null;
        if (!f) return;
      }
      // a payroll system's symbol code before the name ("9268 שעות בפועל 147.33", "300 125% …") is not a value:
      // the hours and days were read as the code (real payslip, Nov 2026). A whole number at the start, right before
      // the Hebrew name, with a value after it.
      let nums = numbersIn(line);
      const code = /^\d{1,6}\s+(?=(?:\d{2,3}%\s+)?[֐-׿])/.exec(line);
      if (code) { const rest = numbersIn(line.slice(code[0].length)); if (rest.length || (f && joinNextFor(f) && /^\d{1,6}\s+[֐-׿]/.test(line))) nums = rest; }
      // (on a payslip that prints its names before their numbers, a whole number before a name with nothing after it
      // is its symbol code: "0003 נסיעות" with the amount on a lower line was a travel refund of 3 ₪, readers campaign)
      // a token that is one number or two glued ("1.500.00"): two, when only that reading adds up (hours × rate = pay,
      // or a balance row: "מחלה 29.50 1.500.00 31.00" is 29.50 + 1.50 − 0.00 = 31.00, not a sick pay of 1,500 ₪)
      if (nums.alt) {
        const sums = (l) => { const v = l.filter((x) => !x.pct).map((x) => x.v); return !!(productOf(v) || (v.length >= 3 && v.length <= 4 && balanceRow(v) != null)); };
        // (a decimal point lost to a space: the joined reading wins whenever it adds up, also when the whole shekels
        // add up too, "8,50 65.00 552 50" is 552.50 and not 552 with a stray 50)
        // (with the line as it is, only an exact product holds then: "8 65 520" in a whole-shekel sheet; "7.75 411 53"
        // is no 7.75 × 53 = 411 but 411.53, "386.81 3,868 10" no 386.81 × 10 = 3,868 but a year's total of 3,868.10)
        if (nums.gap ? sums(nums.alt) : sums(nums.alt) && !sums(nums)) nums = nums.alt;
      }
      if (nums.gap) nums.dirty = (nums.dirty || 0) + nums.gap;
      const glued = nums.glued;
      // the tier printed without "%" in the name ("ש"נ 125 562.50", "שעות 100 160.00 8,000.00") is not a value: it was
      // read as 125 overtime hours, or made a third value that hid the hours (deep review, Nov 2026)
      const tier = f && f.hours && TIER_IN_NAME.exec(normalize(line));
      if (tier && !productOf(nums.filter((x) => !x.pct).map((x) => x.v))) {
        const i = nums.findIndex((x) => !x.pct && !x.dec && x.v === +tier[1]);
        if (i >= 0) nums = nums.slice(0, i).concat(nums.slice(i + 1));
      }
      // the hours line of a small payslip ("שעות עבודה 120 40 4,800": hours × rate = pay) is the base pay, not only
      // the hours total: the pay was dropped and 120 kept (readers campaign, Nov 2026)
      if (f && f.key === 'workHours' && !cumulative && productFix(nums)) f = FIELD.base;
      // the payslip's title ("תלוש משכורת …") names no payment
      if (f && f.kind === 'pay' && /תלוש/.test(line)) return;
      if (f && f.kind === 'pay') {
        f = payOrCount(f, line, nums);
        if (!f) return; // a count (sick days, seniority years) with no money in it: not a payment, not a line to name
      }
      if (!f) {
        const vals = nums.filter((x) => !x.pct && x.dec);
        if (vals.length && HEB.test(line)) other.push({ line, value: vals[vals.length - 1].v, guess: null });
        return;
      }
      // a name with no number on its line: the number may be alone on the next one (a box with its title above it)
      // (every number on it unreadable, "נטו לתשלום 3,898.9l": the line is not read, it does not wait for a number)
      if (!nums.length && numbersIn(line).dirty) { notRead(f, line); return; }
      // (a percent alone is the name's tier, "שעות שבת 175%": the name still waits for its numbers)
      if (!nums.some((x) => !x.pct) && !numbersIn(line).dirty) { if (line.split(' ').length <= 5) pending = { f, line }; return; }
      if (f.kind === 'info') {
        // the number right after the name: on a merged line ("ימי עבודה 22 שעות עבודה 176.00") the first number
        // belonged to the line before it, and 22 days were read as the hours (deep review, Nov 2026)
        const n = normalize(line);
        const p = f.pats.filter((x) => n.includes(x)).sort((a, b) => n.indexOf(b) - n.indexOf(a))[0];
        const after = p ? numbersIn(n.slice(n.indexOf(p) + p.length)) : [];
        if (after.length) nums = after;
      }
      // a fund row with the employer's columns: the worker's share by the table's heading, never by its place alone
      const fk = FUND_KEYS[f.key];
      // (with a decimal point lost to a space, the joined reading when its amounts fit their percents)
      const shares = fk ? (nums.gap ? (nums.alt && fundShares(nums.alt)) || null : fundShares(nums)) : null;
      if (fk && !shares && nums.filter((x) => x.pct).length >= 2) { ask(f, line); return; }
      if (shares) {
        const cols = fundCols && fundCols.length === shares.length ? fundCols : null;
        const same = shares.every((x) => x.v === shares[0].v) || (shares.length === 3 && shares[0].v === shares[2].v);
        const own = cols && cols.includes('emp') ? shares[cols.indexOf('emp')] : same ? shares[0] : null;
        if (!own) { ask(f, line); return; }
        if (!fields[f.key] || fields[f.key].value == null) fields[f.key] = { line, value: Math.abs(own.v), pct: own.p };
        if (cols) for (const c of cols) if (c !== 'emp' && fk[c] && !fields[fk[c]]) fields[fk[c]] = { line, value: Math.abs(shares[cols.indexOf(c)].v), pct: shares[cols.indexOf(c)].p };
        return;
      }
      // (a token that mixes digits and letters makes the whole line unsure, whatever was cut from the list since: the
      // tier's copy lost the mark, and "ש"נ 150 2.75 53.I0 l46.03" gave a pay of 2.75 ₪, readers campaign, Nov 2026)
      const unread = numbersIn(line).dirty;
      if (unread) nums.dirty = unread;
      if (glued) nums.glued = glued;
      const pv = pickValues(f, nums);
      if (!pv) { notRead(f, line); return; }
      if (unsure.has(f.key)) { fields[f.key].line += ' | ' + line; return; }
      // the hour lines, to settle which factor is the hours once every line was read
      // (the amount between the two factors, or numbers brought from the next line: their places do not say which is the
      // hours. "שעות עבודה 60 3045 50.75" was 60 hours at 50.75 ₪; the size rule or the slip's wage decides, or neither)
      const placeless = pv.rate != null && !pv.sure && !pv.even && (pv.mid || moved);
      if (placeless && !f.hours) { delete pv.qty; delete pv.rate; }
      if (f.hours && placeless) (parts[f.key] = parts[f.key] || []).push({ qty: pv.qty, rate: pv.rate, amb: false, mid: true, value: pv.value });
      else if (f.hours && pv.even) (parts[f.key] = parts[f.key] || []).push({ qty: pv.qty, rate: pv.rate, amb: false });
      else if (f.hours && pv.rate != null && pv.sure != null && !pv.mid && !moved) { votes[pv.sure ? (pv.byPlace ? 'ok' : 'no') : 'amb']++; (parts[f.key] = parts[f.key] || []).push({ qty: pv.qty, rate: pv.rate, amb: !pv.sure }); }
      else if (f.hours) (parts[f.key] = parts[f.key] || []).push({ qty: pv.qty, rate: pv.rate, amb: false, two: !!pv.two, one: !!pv.one, value: pv.value });
      delete pv.two; delete pv.one;
      delete pv.sure; delete pv.byPlace; delete pv.mid; delete pv.even;
      if (f.kind !== 'info') { money.push(...nums.filter((x) => !x.pct).map((x) => x.dec)); if (pv.bare) bare.push({ f, line }); }
      delete pv.bare;
      // the total of the mandatory deductions is kept apart: it is the total of all the deductions only on a payslip
      // with no others (it was read as the total, and the gross minus it was not the net, readers campaign, Nov 2026)
      if (f.key === 'totalDeductions' && MAND_TOTAL.test(line)) { if (mand == null) mand = { line, value: Math.abs(pv.value) }; return; }
      // the payslip's own total of the payments wins over another line that only names the gross
      if (f.key === 'gross' && fields.gross && GROSS_TOTAL.test(line) && !GROSS_TOTAL.test(fields.gross.line)) delete fields.gross;
      // the amount paid to the bank wins over a net printed before the voluntary deductions
      if (f.key === 'net' && fields.net && NET_FINAL.test(line) && !NET_FINAL.test(fields.net.line)) delete fields.net;
      if (fields[f.key] && fields[f.key].value == null) delete fields[f.key]; // asked for, and now read
      if (fields[f.key]) {
        // a second line for the same field: sum earnings (e.g. two roles' base pay), keep first for others
        if (f.kind === 'pay') {
          const cur = fields[f.key];
          if (cur.qty && cur.rate == null) cur.rate = cur.value / cur.qty;
          cur.value += pv.value;
          cur.line += ' | ' + line;
          // the rate is the sum over the hours only when both lines carry hours: a line with no hours (a supplement
          // of the same name) made 40 h × 40 ₪ + 300 ₪ a rate of 47.5 (deep review, Nov 2026)
          if (pv.qty != null && cur.qty != null) { cur.qty += pv.qty; cur.rate = cur.qty ? cur.value / cur.qty : cur.rate; }
          else if (pv.qty != null) { cur.qty = pv.qty; cur.rate = pv.rate != null ? pv.rate : pv.qty ? pv.value / pv.qty : undefined; }
        } else if ((f.kind === 'ded' || f.kind === 'emp') && nums.some((x) => !x.pct && x.dec)) {
          // a second deduction or employer line of the same kind (two pension funds): never dropped silently,
          // it waits among the lines to name (the translator and the check screen show it)
          other.push({ line, value: Math.abs(pv.value), guess: null });
        }
        return;
      }
      // a deduction printed with a minus ("מס הכנסה 900.00-") is the same deduction: stored negative, the checks
      // passed it ("income tax reasonable -900") and the net reconciliation went off (deep review, Nov 2026)
      if ((f.kind === 'ded' || f.kind === 'emp' || f.key === 'totalDeductions') && pv.value != null) pv.value = Math.abs(pv.value);
      fields[f.key] = Object.assign({ line }, pv);
    }

    for (let li = 0; li < rawLines.length; li++) {
      let raw = rawLines[li];
      const was = pending;
      pending = null;
      // a name alone on its line, and the numbers at the start of the next one: they are its numbers (a photo's lines
      // drift apart). A total takes one number; a payment its hours, rate and amount, with the words that go between
      // them ("20 ימים 236.00"). What follows on that line is read on its own.
      if (was && joinNextFor(was.f)) {
        const runs = runsOf(raw);
        let n = 0;
        while (n < runs.length && (runs[n].kind === 'n' || wordsOf(runs[n]).every((w) => UNIT_WORDS.test(w)))) n++;
        const lead = runs.slice(0, n).map((r) => r.t.join(' ')).join(' ');
        // (a lone whole number before a name is that name's symbol code: "ניכויים:" over "9001 ביטוח לאומי 62.31")
        const code1 = runs[0].kind === 'n' && runs[0].t.length === 1 && /^\d{1,6}$/.test(runs[0].t[0]) && runs[1] && runs[1].kind === 'w';
        if (n && runs[0].kind === 'n' && !code1 && !/[A-Za-z]/.test(lead)) {
          const ns = numbersIn(lead);
          if (ns.length && (was.f.kind === 'pay' || (ns.length === 1 && !ns[0].pct))) readLine(was.line + ' ' + lead);
          if (n === runs.length) continue;
          raw = runs.slice(n).map((r) => r.t.join(' ')).join(' ');
        }
      }
      // the numbers under a row of column names
      const names = heads;
      heads = null;
      if (names && !HEB.test(raw) && !/[A-Za-z]/.test(raw)) {
        const ns = numbersIn(raw);
        // (as many numbers as names: "18 142.75" under "ימי עבודה שעות עבודה" is two columns, not 18,142.75)
        if (ns.length === names.list.length && !ns.dirty && !ns.glued && !ns.gap && !ns.some((x) => x.pct)) {
          (names.visual ? ns.slice().reverse() : ns).forEach((x, i) => { const nm = names.list[i]; if (nm.f.kind === 'total' || nm.f.kind === 'info') readLine(nm.text + ' ' + x.raw.trim()); });
          logical.push(raw);
          continue;
        }
      }
      if (!/\d/.test(raw) && HEB.test(raw) && heading(raw)) continue;
      // the heading of the year's block joined to the line after it ("- סכומים מצטברים - ברוטו למס 75,051.41"): the
      // block starts on this line (its taxable gross was read as the month's, readers campaign, Nov 2026)
      if (/\d/.test(raw) && CUM_HEAD.test(raw)) cumulative = true;
      let line = raw;
      const f0 = matchField(raw);
      if (reversedWords(raw)) {
        // more of the line's words are payslip words when read backwards: a line in visual order. A row of two
        // tables matched a tier ("150%") as it was, and its Shabbat hours were filed as overtime (readers
        // campaign, Nov 2026)
        line = fixVisual(raw);
      } else if (!f0 && HEB.test(raw)) {
        const alt = fixVisual(raw);
        // (by its words, not by a tier alone: a header turned around matched "100%")
        const fv = matchField(alt);
        if (fv && byWords(fv, alt)) line = alt;
      } else if (f0 && nameLast(raw) && !byWords(f0, raw)) {
        // matched only by its tier ("150%"): a visual-order line matches that too, and its reversed words ("תבש")
        // were never read, so Shabbat hours were filed as overtime and the numbers kept their reversed order (deep
        // review, Nov 2026). A line that ends with its name (the numbers first) is turned to logical order, and wins
        // when it then matches by its words.
        const alt = fixVisual(raw);
        const fa = matchField(alt);
        if (fa && byWords(fa, alt)) line = alt;
      }
      logical.push(line);
      // (a part with no numbers, cut from a line that has some, may be a heading the recognition joined to the line)
      // the rest of a payment's row on the next line, numbers only ("שעות שבת 150% 7" over "51.48 360"): joined when
      // only together they add up (hours × rate = pay)
      // (or the numbers at the start of the next line, before a name with numbers of its own: the row's amount column on
      // a lower baseline, "שעות 100% 50:45" over "60.00 3,045.00 מס הכנסה 0.00"). Only the line's last part takes them.
      const nx = rawLines[li + 1];
      let moved = null;
      if (nx && /\d/.test(line)) {
        const rs = runsOf(nx);
        let lead = null, rest = null;
        if (!HEB.test(nx) && !/[A-Za-z]/.test(nx)) lead = nx;
        else if (rs.length >= 3 && rs[0].kind === 'n' && rs[1].kind === 'w' && rs[2].kind === 'n' && !(rs[0].t.length === 1 && /^\d{1,6}$/.test(rs[0].t[0]))) {
          lead = rs[0].t.join(' ');
          rest = rs.slice(1).map((r) => r.t.join(' ')).join(' ');
        }
        if (lead) {
          const sg = segments(line, rowsAfter);
          const lastSeg = sg[sg.length - 1];
          const vs = (t) => numbersIn(t).filter((x) => !x.pct).map((x) => x.v);
          const v1 = vs(lastSeg), v2 = vs(lastSeg + ' ' + lead);
          const fm = matchField(lastSeg);
          if (fm && (fm.kind === 'pay' || fm.key === 'workHours') && !productOf(v1) && productOf(v2) && v2.length <= 4) {
            line = line + ' ' + lead;
            moved = lastSeg + ' ' + lead;
            if (rest == null) li++; else rawLines[li + 1] = rest;
          }
        }
      }
      for (const seg of segments(line, rowsAfter)) { if (seg !== line && !/\d/.test(seg) && HEB.test(seg) && heading(seg)) continue; readLine(seg, seg === moved); }
    }
    // a payslip that prints its amounts with agorot ("893.15") and one amount as a bare whole number ("89315"): the
    // decimal point was probably dropped by the text recognition. Such an amount is asked for, never shown as read
    // (it was 89,315 ₪ of deductions, readers campaign, Nov 2026)
    if (bare.length && money.length >= 6 && money.filter(Boolean).length >= money.length * 0.8) {
      for (const b of bare) { const F = fields[b.f.key]; if (F && String(F.line).split(' | ').includes(b.line)) fields[b.f.key] = { line: F.line, value: null }; }
    }
    // the hours and the rate of a line where both could be the hours ("50.75 60.00 3,045.00"): the table's columns
    // are in one order, and the lines whose sizes leave no doubt ("2.00 75.00 150.00") say which
    // Its place alone is a guess: a sheet may print the rate before the hours ("שעות עבודה בפועל 35.40 168.25
    // 5,956.05" was 35.40 hours at 168.25 ₪, readers campaign, Nov 2026). The evidence on the slip decides: the lines
    // whose sizes leave no doubt (votes), the one wage the lines agree on (each rate over its tier), the hours total
    // printed on the slip. With no evidence, or evidence both ways, the hours and the rate are left out (the amount
    // stays: it is the product either way).
    const TIERS = { base: 1, ot125: 1.25, ot150: 1.5, rest150: 1.5, rest175: 1.75, rest200: 2 };
    if (Object.keys(parts).some((k) => parts[k].some((x) => x.amb))) {
      const hp = [];
      for (const k of Object.keys(parts)) for (const p of parts[k]) if (TIERS[k] && p.rate > 0 && !p.two && !p.mid && !p.one) hp.push({ k, p });
      const agree = (sw) => {
        const ws = hp.map(({ k, p }) => Math.abs(sw && p.amb ? p.qty : p.rate) / TIERS[k]);
        return ws.reduce((best, a) => Math.max(best, ws.filter((b) => Math.abs(b - a) <= a * 0.02).length), 0);
      };
      const a1 = agree(false), a2 = agree(true);
      const wh = fields.workHours && fields.workHours.value;
      const tot = (sw) => hp.reduce((t, { p }) => t + Math.abs(sw && p.amb ? p.rate : p.qty), 0);
      const h1 = wh ? Math.abs(tot(false) - wh) <= 0.05 : false, h2 = wh ? Math.abs(tot(true) - wh) <= 0.05 : false;
      // in order of weight: the lines whose sizes decide; the table's heading (is the rate next to the amount?); the
      // hours total; the one wage, only when one reading has the lines agree and the other is far off (a rate a little
      // below the others is what the check is for: it must not turn the line around)
      const far = (sw) => { const ws = hp.map(({ k, p }) => Math.abs(sw && p.amb ? p.qty : p.rate) / TIERS[k]); const m = ws.slice().sort((x, y) => x - y)[ws.length >> 1]; return ws.some((w) => Math.abs(w - m) > m * 0.25); };
      let ev = 0;
      if (votes.ok && !votes.no) ev = 1;
      else if (votes.no && !votes.ok) ev = 2;
      else if (!votes.ok && !votes.no && hourRate && hp.some(({ k, p }) => k === 'base' && p.amb && (Math.abs(p.rate - hourRate) <= 0.005 || Math.abs(p.qty - hourRate) <= 0.005))) {
        const b = hp.find(({ k, p }) => k === 'base' && p.amb).p;
        ev = Math.abs(b.rate - hourRate) <= 0.005 ? 1 : 2;
      } else if (!votes.ok && !votes.no && colHint) ev = colHint;
      else if (!votes.ok && !votes.no && h1 !== h2) ev = h1 ? 1 : 2;
      else if (!votes.ok && !votes.no && hp.length >= 2 && a2 === hp.length && far(false) && !far(true)) ev = 2;
      else if (!votes.ok && !votes.no && hp.length >= 2 && a1 === hp.length && far(true) && !far(false)) ev = 1;
      const for1 = ev === 1, for2 = ev === 2;
      for (const k of Object.keys(parts)) {
        const F = fields[k];
        if (!F || F.value == null || !parts[k].some((x) => x.amb)) continue;
        if (for2 && !for1) {
          const q = parts[k].reduce((t, x) => t + (x.amb ? x.rate : x.qty || 0), 0);
          if (q > 0) { F.qty = q; F.rate = F.value / q; }
        } else if (!(for1 && !for2)) { delete F.qty; delete F.rate; }
      }
    }
    // An hours line with two numbers: its hours and its pay, or (a column lost, a row split by the PDF) its hours and
    // its rate, or its rate and its pay. "שעות שבת 150% 8.25 57.00" was read as a Shabbat pay of 57 ₪ (readers campaign,
    // Nov 2026). The hourly wage the slip's whole lines agree on (hours × rate = pay, each rate over its tier) decides:
    // the pay over the hours must be that wage at the line's tier, or the smaller number is the rate itself (the hours
    // were lost). With whole lines that do not agree on one wage, or with none and a pay of under 20 ₪ an hour, the
    // line is asked for.
    const TIER = { base: 1, ot125: 1.25, ot150: 1.5, rest150: 1.5, rest175: 1.75, rest200: 2 };
    const whole = [];
    for (const k of Object.keys(parts)) for (const p of parts[k]) if (!p.two && !p.mid && p.rate > 0 && TIER[k]) whole.push(Math.abs(p.rate) / TIER[k]);
    const wage = whole.length && whole.every((r) => Math.abs(r - whole[0]) <= whole[0] * 0.02) ? whole[0] : null;
    // a line whose places say nothing: its rate is the factor that is the slip's wage at the line's tier, or the hours
    // and the rate are left out (the amount stays: it is the product either way)
    for (const k of Object.keys(parts)) {
      const F = fields[k];
      const mids = parts[k].filter((p) => p.mid);
      if (!F || F.value == null || !mids.length) continue;
      const want = wage != null && TIER[k] ? wage * TIER[k] : null;
      if (parts[k].length === 1 && want != null) {
        const p = mids[0];
        const r = [p.qty, p.rate].find((x) => Math.abs(Math.abs(x) - want) <= want * 0.01);
        if (r != null && Math.abs(p.qty) !== Math.abs(p.rate)) { F.rate = r; F.qty = r === p.qty ? p.rate : p.qty; continue; }
      }
      delete F.qty; delete F.rate;
    }
    // (with no whole line, the slip's two-number hours lines are of one kind: when one of them cannot be hours and a pay,
    // "35.40 125.00" with its amount cut off, none of them is read as hours and a pay: "53.10 1.25" was a rate and hours)
    const twoAllFit = Object.keys(parts).every((k) => !TIER[k] || parts[k].every((p) => !p.two || (p.value / p.qty / TIER[k] >= 24 && p.value / p.qty <= 1000)));
    for (const k of Object.keys(parts)) {
      const F = fields[k];
      // (an hours line with one number on a payslip whose hour lines are whole: "שעות שבת 150% 7" with its rate and pay
      // on the next line was a Shabbat pay of 7 ₪, readers campaign, Nov 2026)
      if (F && F.value != null && TIER[k] && whole.length && parts[k].length === 1 && parts[k][0].one) { fields[k] = { line: F.line, value: null }; continue; }
      const two = parts[k].filter((p) => p.two);
      if (!F || F.value == null || !two.length || !TIER[k]) continue;
      const want = wage != null ? wage * TIER[k] : hourRate != null ? hourRate * TIER[k] : null;
      // (with no whole line to give the wage: the pay over the hours, over the tier, is at least a youth's minimum wage)
      const fits = (p) => (want != null ? Math.abs(p.value / p.qty - want) <= want * 0.02 : !whole.length && p.value / p.qty / TIER[k] >= 24 && p.value / p.qty <= 1000);
      if (two.every(fits) && (want != null || twoAllFit)) continue;
      if (parts[k].length === 1 && want != null && Math.abs(two[0].qty - want) <= want * 0.01) { F.rate = two[0].qty; F.qty = Math.round(F.value / F.rate * 100) / 100; continue; }
      // (no wage on the slip and two numbers that are not hours and their pay, "שעות נוספות 125% 43.75 218.75": a rate and
      // its pay (5 hours at 43.75 ₪) or hours and a rate with the pay lost (43.75 hours at 218.75 ₪, or 142.50 hours at
      // 38 ₪ in "38.00 142.50 שכר רגיל") cannot be told apart. Tried in round 2, it read the second kind as the first:
      // the line is asked for)
      fields[k] = { line: F.line, value: null };
    }
    // The hours lines read from one or two numbers (their places not proven by hours × rate = pay) stand only when the
    // payments add up to the gross: "שעות רגילות 140.25" with its pay on a lower line was a base pay of 140.25 ₪, and
    // "105.00 3.50 שעות שבת 175%" with its amount cut off a Shabbat pay of 105 ₪ (readers campaign, Nov 2026).
    if (fields.gross && fields.gross.value != null) {
      const weak = Object.keys(parts).filter((k) => TIER[k] && fields[k] && fields[k].value != null && parts[k].some((p) => p.two || p.one));
      if (weak.length) {
        const sum = FIELDS.filter((x) => x.kind === 'pay' && fields[x.key] && fields[x.key].value != null).reduce((t, x) => t + fields[x.key].value, 0);
        if (Math.abs(sum - fields.gross.value) > Math.max(2, Math.abs(fields.gross.value) * 0.005)) for (const k of weak) fields[k] = { line: fields[k].line, value: null };
      }
    }
    // the mandatory deductions' total stands for the total only when the payslip's own numbers say it is one
    if (!fields.totalDeductions && mand) {
      const g = fields.gross && fields.gross.value, n = fields.net && fields.net.value;
      if (g != null && n != null && Math.abs(g - mand.value - n) <= 2) fields.totalDeductions = mand;
    }
    // a guard for running totals printed without a heading: a taxable gross far above the gross is the year's
    if (fields.taxableGross && fields.gross && fields.taxableGross.value > fields.gross.value * 2) delete fields.taxableGross;
    // (secondSlip: the file held more after the first payslip, and it was not read: the screen can say so)
    return { fields, other, period: detectPeriod(logical.join('\n')) || detectPeriod(text), lineCount: rawLines.length, secondSlip: cut < allLines.length };
  }

  /* ---------------- redaction (before optional AI) ---------------- */
  function redact(text) {
    let count = 0;
    const lines = text.split(/\r?\n/).map((line) => {
      let l = line;
      if (/(רחוב|רח'|רח׳|כתובת|מיקוד|ת\.ד|דירה|שכונת|ישוב:|יישוב:)/.test(l)) { count++; return '[כתובת הוסתרה]'; }
      // the worker's name ("שם העובד: נדב כהן", "שם: …", "לכבוד …"): the name is what follows the label, to the next
      // label or number on the line (it went to the AI as it was, readers campaign, Nov 2026). The marks stay Hebrew in
      // every language: they are what the AI reads in place of the name.
      l = l.replace(/(^|\s)(שם העובד|שם עובד|שם העובדת|שם משפחה|שם פרטי|שם|לכבוד)(\s*[:：]\s*|\s+)([^\d:|]+?)(?=\s+(?:מספר|מס'|ת\.ז|ת"ז|ת״ז|זהות|תאריך|מחלקה|תפקיד|סניף|בנק|קוד)|\s*\d|\s*\||$)/g,
        // i18n-keep
        (m0, pre, a, sep, name) => (/[֐-׿A-Za-z]/.test(name) ? (count++, pre + a + sep + '[שם הוסתר]') : m0));
      // the employer's name before its company mark ("סופר השכונה בע"מ"): up to four words
      // i18n-keep
      l = l.replace(/(?:[^\s\d|:]+\s+){0,3}[^\s\d|:]+\s+בע(?:"|״|'')מ/g, () => { count++; return '[שם המעסיק הוסתר]'; });
      // the worker's and the employer's numbers: the employee number, the deductions file, the company number
      l = l.replace(/((?:מספר|מס'|מס׳)\s*עובד|תיק(?:\s*ניכויים)?|ח\.?פ\.?|ע\.?מ\.?|מספר מעסיק|מס' מעסיק)(\s*[:.]?\s*)(\d[\d\-\s]{2,}\d|\d{3,})/g, (m0, a, sep) => { count++; return a + sep + '[מספר הוסתר]'; });
      if (/(בנק|סניף|חשבון|IBAN|מס' חשבון)/i.test(l)) {
        // (to the end of the run, slashes too: "10-802-123456/78" left "/78", round 2 from the intake session)
        l = l.replace(/\d[\d\-\s/]{2,}\d/g, () => { count++; return '[פרטי בנק הוסתרו]'; });
      }
      // a birth date ("תאריך לידה 12/03/1999"): it passed (round 2, from the intake session)
      // i18n-keep
      if (/תאריך לידה|ת\. ?לידה|יום הולדת/.test(l)) l = l.replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, () => { count++; return '[תאריך הוסתר]'; });
      if (/(ת\.ז|ת"ז|ת״ז|תעודת זהות|מספר זהות|מס' זהות|זהות)/.test(l)) {
        l = l.replace(/\d[\d\-\s]{4,}\d/g, () => { count++; return '[ת״ז הוסתרה]'; });
      }
      l = l.replace(/\b\d{9}\b/g, () => { count++; return '[מספר הוסתר]'; });
      // (an ID number printed in groups, "012 345 678" or "012-345-678", with no label on its line)
      l = l.replace(/\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/g, () => { count++; return '[מספר הוסתר]'; });
      l = l.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => { count++; return '[אימייל הוסתר]'; });
      l = l.replace(/(?:\+972[-\s]?|\b0)(?:5\d|[2-489]|7\d)[-\s]?\d{3}[-\s]?\d{4}\b/g, () => { count++; return '[טלפון הוסתר]'; });
      return l;
    });
    return { text: lines.join('\n'), count };
  }

  /** JSON schema for the optional AI extraction (structured output).
   *  Kept flat with no optional/union types: qty and rate are 0 when absent. */
  function aiSchema() {
    return {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Pay month as YYYY-MM, or empty string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: FIELDS.map((f) => f.key) },
              value: { type: 'number' }, qty: { type: 'number' }, rate: { type: 'number' },
            },
            required: ['key', 'value', 'qty', 'rate'], additionalProperties: false,
          },
        },
        otherLines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, amount: { type: 'number' }, type: { type: 'string', enum: ['payment', 'deduction', 'employer', 'info'] } },
            required: ['label', 'amount', 'type'], additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['period', 'fields', 'otherLines', 'notes'], additionalProperties: false,
    };
  }
  function aiPrompt() {
    // i18n-keep-start
    return 'You read the text of an Israeli payslip (תלוש שכר) produced by PDF text extraction or Hebrew OCR. ' +
      'Hebrew words may appear reversed (visual order) and table columns may be out of order; reconstruct the meaning carefully. ' +
      'Personal details were replaced with placeholders such as [ת״ז הוסתרה]; ignore them.\n' +
      'Return the monthly amounts in ILS for every field key below that appears in the payslip (omit keys that do not appear). ' +
      'For hour-based lines also return qty (hours) and rate (ILS per hour); use 0 when a line has no quantity or rate. ' +
      'Deductions are positive numbers. Do not invent values. Year-to-date (מצטבר) columns go only to the ytd* keys.\n' +
      'Money keys hold shekels only, never a count of days, hours or years. Sick and vacation day balances, accruals and usage (יתרה, צבירה, ניצול, ימי מחלה, ימי חופשה) are not payments: ' +
      'the closing balance goes to sickBalance / vacationBalance, the rest is left out. sickPay and vacationPay are only payment lines with a shekel amount for days taken. ' +
      'seniority is only a payment line such as תוספת ותק with a shekel amount; the years of seniority (ותק, שנות ותק) and the start date are not a payment and are left out.\n' +
      'Field keys: ' + FIELDS.map((f) => `${f.key} = ${f.label}`).join('; ') + '.\n' +
      'Put every other payment, deduction or employer-contribution line in otherLines. ' +
      'period is the pay month (YYYY-MM) if visible, otherwise an empty string. notes: one short Hebrew sentence about anything unclear, or an empty string.';
    // i18n-keep-end
  }
  /** An AI value in a count-named payment field (sickPay, seniority...) that looks like money, not a count. */
  function countFree(x, balances) {
    const v = +x.value, q = +x.qty || 0, r = +x.rate || 0;
    if (!(v > 0)) return false;
    if (q && r && close(q * r, v)) return true;
    if (q && close(q, v)) return false; // the count copied as the amount
    if (balances.some((b) => close(b, v))) return false; // the balance (or the days) copied as the amount
    return v >= 50;
  }
  /** Convert AI JSON to the same {fields, other, period} shape as parseText. */
  /**
   * A number from the AI's answer: a finite number or a plain numeric string ("1234.56", not "1,234.56" or "12 שעות"),
   * within what a month's payslip holds. Anything else is no number (null): read as it came, a string became NaN on
   * the screen, a negative tax passed the checks, and a value of a billion shekels went into the analysis (readers
   * campaign, Nov 2026).
   */
  const MAX_AMOUNT = 1e6, MAX_QTY = 744; // a month's money for an hourly worker, a month's hours (31 × 24)
  function aiNum(x, max) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(x) ? +x : NaN;
    return Number.isFinite(n) && Math.abs(n) <= max ? (Object.is(n, -0) ? 0 : n) : null;
  }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function fromAi(json) {
    json = json && typeof json === 'object' ? json : {};
    const fields = {};
    const other = [];
    // (a key is one of the reader's own fields: "__proto__" or "constructor" never reach the object)
    const list = (Array.isArray(json.fields) ? json.fields : []).filter((x) => x && typeof x === 'object' && typeof x.key === 'string' && own(FIELD, x.key))
      .map((x) => ({ key: x.key, value: aiNum(x.value, FIELD[x.key].kind === 'info' ? 10000 : MAX_AMOUNT), qty: aiNum(x.qty, MAX_QTY), rate: aiNum(x.rate, MAX_AMOUNT) }))
      .filter((x) => x.value != null);
    const balances = list.filter((x) => FIELD[x.key].kind === 'info').map((x) => x.value);
    for (const x of list) {
      const f = FIELD[x.key];
      // a count the AI put in a money field (the sick-day balance as sick pay, the seniority years as a seniority
      // payment): left out, as the text reader does (payOrCount)
      if (WEAK_PAY[x.key] && !countFree(x, balances)) continue;
      // a minus is the way a deduction is printed, not a negative deduction; a negative payment is only a correction
      // (הפרשים); a negative total or count is no reading
      let value = x.value;
      if (f.kind === 'ded' || f.kind === 'emp') value = Math.abs(value);
      else if (value < 0 && x.key !== 'diff') continue;
      const qty = x.qty && x.qty > 0 ? x.qty : undefined, rate = x.rate && x.rate > 0 ? x.rate : undefined;
      const F = { value, qty, rate, line: 'AI' };
      // the same field twice: two lines of one payment add up (two roles' base pay); any other second line waits among
      // the lines to name (kept, the second base pay was the base pay)
      if (fields[x.key]) {
        if (f.kind === 'pay') {
          const P = fields[x.key];
          const q = P.qty != null && qty != null ? P.qty + qty : undefined;
          fields[x.key] = { value: P.value + value, qty: q, rate: q ? (P.value + value) / q : undefined, line: 'AI' };
        } else other.push({ line: f.label, value, guess: null });
        continue;
      }
      fields[x.key] = F;
    }
    // the hours times the rate is the amount, or the hours and the rate are not the AI's to give
    for (const k of Object.keys(fields)) {
      const F = fields[k];
      if (F.qty != null && F.rate != null && Math.abs(F.qty * F.rate - F.value) > Math.max(1, F.value * 0.01)) { F.qty = undefined; F.rate = undefined; }
    }
    // gross, deductions and net that cannot be one payslip (the net above the gross, a total of deductions above the
    // gross): swapped or misread, none of the three is shown as read, they are asked for
    const g = fields.gross && fields.gross.value, n = fields.net && fields.net.value, d = fields.totalDeductions && fields.totalDeductions.value;
    if ((g != null && n != null && n > g + 0.01) || (g != null && d != null && d > g + 0.01)) {
      for (const k of ['gross', 'net', 'totalDeductions']) if (fields[k]) fields[k] = { value: null, line: 'AI' };
    }
    for (const o of Array.isArray(json.otherLines) ? json.otherLines : []) {
      if (!o || typeof o !== 'object') continue;
      const value = aiNum(o.amount, MAX_AMOUNT);
      if (value == null) continue;
      other.push({ line: String(o.label == null ? '' : o.label).slice(0, 120), value, guess: o.type === 'deduction' ? 'otherDed' : o.type === 'payment' ? 'otherPay' : 'ignore' });
    }
    const period = typeof json.period === 'string' && /^(\d{4})-(0[1-9]|1[0-2])$/.test(json.period) ? json.period : null;
    return { fields, other, period, notes: typeof json.notes === 'string' ? json.notes.slice(0, 500) : '' };
  }

  /* ---------------- analysis ---------------- */
  const val = (F, k) => (F[k] && F[k].value != null && !isNaN(F[k].value) ? +F[k].value : null);
  const qty = (F, k) => (F[k] && F[k].qty != null && !isNaN(F[k].qty) ? +F[k].qty : null);
  /**
   * The payslip's hours: the sum of the hour lines' quantities, or the work-hours total. When the base line was read
   * without its hours, the sum held only the overtime and Shabbat hours, and the check reported the rest as unpaid
   * (deep review, Nov 2026). Then the work-hours total counts (the larger of the two), and with no total the hours
   * are unknown (null), never a part of them.
   */
  function hoursOnSlip(F) {
    F = F || {};
    const sum = HOUR_FIELDS.reduce((s, k) => s + (qty(F, k) || 0), 0);
    const wh = val(F, 'workHours');
    if (qty(F, 'base') > 0 || (val(F, 'base') == null && !wh)) return sum || wh;
    if (wh) return Math.max(sum, wh);
    return null;
  }
  const slipHoursOf = (F) => hoursOnSlip(F) || 0;

  /**
   * The workplace a payslip belongs to: the one it was saved for (slip.employerId), or the primary one. With two or
   * three workplaces the check counted every workplace's shifts against one employer's payslip and reported the other
   * workplace's hours as unpaid (deep review, Nov 2026).
   */
  function slipEmployer(model, slip) {
    const id = slip && slip.employerId;
    return (id && model.ctx.employers.get(id)) || model.ctx.primaryEmployer();
  }
  /** The employerId to filter shifts by: only with more than one workplace (as Engine.periodSummary does). */
  const empFilter = (model, emp) => (model.ctx.employers.size > 1 && emp && emp.id ? emp.id : null);

  /** App-side expectations for a pay period, for one workplace (empId; the primary one when not given). */
  function expected(model, pk, useAuto, empId) {
    const emp = (empId && model.ctx.employers.get(empId)) || model.ctx.primaryEmployer();
    const only = empFilter(model, emp);
    const P = Engine.periodByKey(pk, emp);
    const results = useAuto && model.autoResults && model.autoResults.size ? model.autoResults : model.results;
    const m = Object.assign({}, model, { results });
    const t = Engine.totals(m, P.from, P.to, { employerId: only });
    const pay = { base: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0 };
    const hrs = { base: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0 };
    const shifts = [];
    for (const r of results.values()) {
      if (r.status !== 'done' || r.dateKey < P.from || r.dateKey > P.to) continue;
      if (only && r.employerId !== only) continue;
      shifts.push(r);
      for (const l of r.lines) {
        const k = l.rest ? ['rest150', 'rest175', 'rest200'][l.tier] : ['base', 'ot125', 'ot150'][l.tier];
        pay[k] += l.amount; hrs[k] += l.hours;
      }
    }
    shifts.sort((a, b) => a.start - b.start);
    const net = Engine.netEstimate({ gross: t.gross, pensionBase: Engine.pensionBaseOf(t, model.ctx.settings), deductions: t.deductions, periodTo: P.to }, model.ctx.settings);
    return { P, emp, only, t, pay, hrs, shifts, net, avgRate: t.hours ? t.wage / t.hours : 0, baseRate: hrs.base ? pay.base / hrs.base : 0 };
  }

  /**
   * A payslip may print every hour at 100% in the base line and only the supplement (25%, 50%, 75%, 100%) on the
   * overtime and Shabbat lines: a lawful way to print the same pay. Checked as if each premium line carried the whole
   * rate, a right payslip was "a Shabbat rate of 20 ₪ an hour, 160 ₪ missing", and its hours were counted twice, which
   * hid a shift that was not paid (round 2, the verdict-layer check; israeli-attendance-wage-checker Step 1b: establish
   * the convention first). It is that convention when every premium line's rate is the base rate times its supplement
   * and the base line holds all the hours (the app's, or the payslip's own total). The checks then see the same pay in
   * the full-rate form: the base line with the ordinary hours, each premium line with its whole rate.
   */
  const SUPPLEMENT = { ot125: 0.25, ot150: 0.5, rest150: 0.5, rest175: 0.75, rest200: 1 };
  function fullRateView(F, appHours) {
    const bq = qty(F, 'base'), bv = val(F, 'base');
    if (!(bq > 0) || !(bv > 0)) return F;
    const br = F.base.rate || bv / bq;
    const prem = Object.keys(SUPPLEMENT).filter((k) => qty(F, k) > 0 && val(F, k) > 0);
    if (!prem.length) return F;
    const fits = prem.every((k) => Math.abs(val(F, k) / qty(F, k) - br * SUPPLEMENT[k]) <= Math.max(0.02, br * SUPPLEMENT[k] * 0.02));
    const ph = prem.reduce((t, k) => t + qty(F, k), 0);
    const wh = val(F, 'workHours');
    const allHours = (appHours > 0 && Math.abs(bq - appHours) <= Math.max(0.25, ph * 0.5) && Math.abs(bq - appHours) < Math.abs(bq + ph - appHours)) || (wh != null && Math.abs(bq - wh) <= 0.25);
    // (rates that fit the supplements are that convention unless, read in the full-rate form, the hours are the app's:
    // a shift missing as well left the base line short of all the hours, and the Shabbat line was read as paid at 50%)
    const fullFits = appHours > 0 && Math.abs(bq + ph - appHours) <= 0.25;
    if (!fits || (!allHours && fullFits) || ph >= bq) return F;
    const G = Object.assign({}, F);
    G.base = Object.assign({}, F.base, { qty: bq - ph, value: (bq - ph) * br, rate: br, convention: 'supplement' });
    for (const k of prem) G[k] = Object.assign({}, F[k], { value: val(F, k) / SUPPLEMENT[k] * (1 + SUPPLEMENT[k]), rate: br * (1 + SUPPLEMENT[k]) });
    return G;
  }

  /**
   * Compare a verified payslip to the recorded shifts.
   * slip = { period:'YYYY-MM', fields:{...}, other:[{line,value,guess}] }
   */
  function analyze(slip, model) {
    const S = model.ctx.settings;
    const empId = slipEmployer(model, slip).id;
    const E = expected(model, slip.period, false, empId);
    // (the payslip's lines in the full-rate form; checkGap, settingsCheck and reconcile read the same view, a.fields)
    const F = fullRateView(slip.fields || {}, E.t.hours);
    const A = expected(model, slip.period, true, empId);
    const overridesInPeriod = E.shifts.filter((r) => r.overridden || r.dayRuleHit);
    const hasOv = overridesInPeriod.length > 0;
    const findings = [];
    let fid = 0;
    const add = (o) => findings.push(Object.assign({ id: 'f' + (++fid), amount: 0, shifts: [], confidence: 'medium', fromOverride: null }, o));
    const ovNote = (appVal, autoVal, slipVal, tol) => {
      if (!hasOv || Math.abs(appVal - autoVal) < tol) return null;
      if (slipVal != null && Math.abs(slipVal - autoVal) <= Math.abs(slipVal - appVal)) {
        return `הפער נובע כנראה מעקיפה ידנית שהזנת ב-${overridesInPeriod.length} משמרות: בלי העקיפה האפליקציה הייתה מחשבת ${U.num(autoVal, 2)}, קרוב למה שבתלוש.`;
      }
      return `שים לב: ${overridesInPeriod.length} משמרות בתקופה כוללות עקיפה ידנית (חישוב אוטומטי: ${U.num(autoVal, 2)}).`;
    };
    const dates = (rs) => rs.map((r) => U.fmtDate(r.dateKey, 'short')).join(', ');
    // no shift logged in the payslip's period (a new user checks a payslip first): there is nothing to compare the
    // payslip's hours, rate, Shabbat, overtime and travel with, and comparing them with zero warned "the payslip has more
    // hours than you logged" (14 Nov 2026). Those checks wait for shifts; the checks the payslip answers alone stay
    // (minimum wage, pension, recuperation, tax and National Insurance, the deductions), and the screen invites the
    // person to log the shifts or import a schedule (noShifts).
    const noShifts = !E.shifts.length;

    /* 1. total hours */
    let covered = []; // shifts already identified as unpaid — excluded from the OT / rest checks to avoid double counting
    const slipHours = slipHoursOf(F) || null;
    const appHours = E.t.hours;
    if (noShifts) { /* nothing logged to compare with */ } else if (slipHours == null || slipHours === 0) {
      add({ area: 'שעות', status: 'warn', title: 'לא זוהו שעות בתלוש', detail: `באפליקציה רשומות ${U.hours(appHours)} שעות לתקופה. אם התלוש מציג שעות, הוסף אותן במסך האימות כדי לבדוק התאמה.`, basis: 'אין כמות שעות בשורות התלוש שזוהו.', confidence: 'low' });
    } else {
      const diff = appHours - slipHours;
      if (diff > 0.25) {
        // try to name the missing shift(s)
        // which shift(s) are probably missing? 1) the last shifts of the period (cut-off), 2) a single shift of that length
        let suspects = [], how = '', conf = 'medium';
        let acc = 0; const tail = [];
        for (let i = E.shifts.length - 1; i >= 0 && acc < diff - 0.3; i--) { acc += E.shifts[i].paidHours; tail.unshift(E.shifts[i]); }
        if (tail.length && Math.abs(acc - diff) <= 0.3) {
          suspects = tail; conf = 'high';
          how = tail.length > 1 ? 'המשמרות האחרונות בתקופה, ייתכן שנכנסו לתלוש הבא' : 'המשמרת האחרונה בתקופה, ייתכן שנכנסה לתלוש הבא';
        } else {
          const same = E.shifts.filter((r) => Math.abs(r.paidHours - diff) <= 0.3);
          if (same.length === 1) { suspects = same; how = 'משמרת באורך השעות החסרות'; conf = 'high'; }
          else if (same.length > 1) { suspects = same; how = 'אחת מהמשמרות באורך הזה'; }
        }
        if (conf === 'high') covered = suspects;
        const exact = conf === 'high' ? suspects.reduce((x, r) => x + r.wage, 0) : 0;
        const amount = exact || diff * E.avgRate;
        add({ area: 'שעות', status: 'bad', title: 'שעות שלא שולמו', amount, shifts: suspects.map((r) => r.id),
          detail: `רשמת ${U.hours(appHours)} שעות, בתלוש ${U.hours(slipHours)}. חסרות ${U.hours(diff)} שעות` + (suspects.length ? ` (${how}: ${dates(suspects)})` : '') + (exact ? `. השכר על ${suspects.length > 1 ? 'המשמרות האלה' : 'המשמרת הזו'} לפי החישוב: ${U.money(amount)} (כולל תוספות).` : `. לפי שכר ממוצע של ${U.money(E.avgRate)} לשעה ≈ ${U.money(amount)}.`),
          basis: 'השוואת סך השעות בתלוש לשעות ששולמו לפי המשמרות שרשמת לתקופה ' + '\u2066' + U.fmtDate(E.P.from, 'short') + '\u2060–\u2060' + U.fmtDate(E.P.to, 'short') + '\u2069.',
          confidence: conf, fromOverride: ovNote(appHours, A.t.hours, slipHours, 0.1) });
      } else if (diff < -0.25) {
        add({ area: 'שעות', status: 'warn', title: 'בתלוש יש יותר שעות ממה שרשמת', detail: `בתלוש ${U.hours(slipHours)} שעות, באפליקציה ${U.hours(appHours)}. אולי שכחת לרשום משמרת?`, basis: 'השוואת סך השעות.', confidence: 'medium' });
      } else {
        add({ area: 'שעות', status: 'ok', title: 'סך השעות תואם', detail: `${U.hours(slipHours)} שעות בתלוש מול ${U.hours(appHours)} באפליקציה.`, basis: 'השוואת סך השעות.', confidence: 'high' });
      }
    }

    /* 2. hourly base rate */
    const bq = qty(F, 'base'), bv = val(F, 'base');
    if (bq && bv && E.hrs.base > 0) {
      const slipRate = F.base.rate || bv / bq;
      // rates actually used in the period (per role, by date)
      const rates = [];
      for (const r of E.shifts) for (const l of r.lines) if (!l.rest && l.tier === 0) rates.push(l.rate);
      const minRate = rates.length ? Math.min(...rates) : E.baseRate;
      const maxRate = rates.length ? Math.max(...rates) : E.baseRate;
      const mixed = maxRate - minRate > 0.01;
      if (slipRate < minRate - 0.02) {
        // below even the lowest agreed rate → certainly underpaid on every regular hour
        const amount = (E.baseRate - slipRate) * bq;
        add({ area: 'תעריף', status: 'bad', title: 'תעריף לשעה נמוך מהמוסכם', amount,
          detail: `בתלוש ${U.money(slipRate)} לשעה, ${mixed ? `נמוך מהתעריף הנמוך ביותר שלך בתקופה (${U.money(minRate)})` : `התעריף שהגדרת ${U.money(minRate)}`}. על ${U.hours(bq)} שעות רגילות ≈ ${U.money(amount)}.`,
          basis: 'שכר יסוד ÷ שעות רגילות בתלוש, מול התעריף לפי תאריך המשמרת (כולל היסטוריית תעריפים).',
          confidence: mixed ? 'medium' : 'high', fromOverride: ovNote(E.baseRate, A.baseRate, slipRate, 0.01) });
      } else if (mixed && Math.abs(bq - E.hrs.base) <= 0.25 && new Set([].concat(...E.shifts.map((r) => r.lines.map((l) => l.roleId)))).size === 1 && bv < E.pay.base - Math.max(2, E.pay.base * 0.003)) {
        // one role whose rate changed in the period (a raise from a date): the same hours paid less money is the raise
        // not paid on the hours after it. Read as "an average a little low, maybe another role", it said nothing missing
        // (round 2, the verdict-layer check)
        const amount = E.pay.base - bv;
        // TRANSLATE (the lead): the title and the detail below are new texts, Hebrew in every language until translated
        // i18n-keep-start
        add({ area: 'תעריף', status: 'bad', title: 'התעריף החדש לא שולם על כל השעות', amount,
          detail: `התעריף שלך השתנה בתקופה (\u2066${U.money(minRate)}\u2060–\u2060${U.money(maxRate)}\u2069). על ${U.hours(bq)} שעות רגילות מגיע ${U.money(E.pay.base)} לפי תאריך כל משמרת, ובתלוש ${U.money(bv)}: חסרים ≈ ${U.money(amount)}.`,
          basis: 'שכר יסוד בתלוש מול השעות הרגילות כפול התעריף לפי תאריך המשמרת (היסטוריית תעריפים), באותו מספר שעות.',
          confidence: 'high', fromOverride: ovNote(E.pay.base, A.pay.base, bv, 1) });
        // i18n-keep-end
      } else if (mixed && slipRate < E.baseRate - 0.02 && Math.abs(bq - E.hrs.base) <= 0.25) {
        add({ area: 'תעריף', status: 'warn', title: 'תעריף ממוצע נמוך מהצפוי', amount: (E.baseRate - slipRate) * bq,
          detail: `בתלוש ${U.money(slipRate)} לשעה בממוצע; לפי המשמרות שרשמת הממוצע המשוקלל ${U.money(E.baseRate)} (תעריפים \u2066${U.money(minRate)}\u2060–\u2060${U.money(maxRate)}\u2069). ייתכן שחלק מהשעות שולמו בתעריף של תפקיד זול יותר, או שחסרות שעות בתפקיד היקר.`,
          basis: 'השוואת ממוצע משוקלל; תלוי בתמהיל התפקידים.', confidence: 'low' });
      } else {
        add({ area: 'תעריף', status: 'ok', title: 'התעריף לשעה תקין', detail: `${U.money(slipRate)} לשעה בתלוש (באפליקציה: ${mixed ? '\u2066' + U.money(minRate) + '\u2060–\u2060' + U.money(maxRate) + '\u2069' : U.money(E.baseRate)}).` + (mixed && Math.abs(bq - E.hrs.base) > 0.25 ? ' הממוצע לא הושווה כי מספר השעות שונה.' : ''), basis: 'שכר יסוד ÷ שעות רגילות.', confidence: mixed ? 'medium' : 'high' });
      }
    }

    /* 3. Shabbat & holiday */
    const slipRestH = (qty(F, 'rest150') || 0) + (qty(F, 'rest175') || 0) + (qty(F, 'rest200') || 0);
    const slipRestPay = (val(F, 'rest150') || 0) + (val(F, 'rest175') || 0) + (val(F, 'rest200') || 0);
    const covSum = (f) => covered.reduce((x, r) => x + f(r), 0);
    const appRestH = E.t.restHours - covSum((r) => r.restHours);
    if (!noShifts && (appRestH > 0.01 || slipRestH > 0 || slipRestPay > 0)) {
      const restShifts = E.shifts.filter((r) => r.restHours > 0 && !covered.includes(r));
      if (slipRestH === 0 && slipRestPay === 0 && appRestH > 0.25) {
        const amount = E.t.restPremium;
        add({ area: 'שבת וחג', status: 'bad', title: 'לא שולמה תוספת שבת/חג', amount, shifts: restShifts.map((r) => r.id),
          detail: `רשמת ${U.hours(appRestH)} שעות בשבת/חג (${dates(restShifts)}), ובתלוש לא מופיעה שורת שבת/חג. התוספת (מעבר ל-100%) ≈ ${U.money(amount)}.`,
          basis: 'חלון השבת/חג לפי ' + (S.rest.mode === 'city' ? 'זמני כניסה ויציאה ב' + S.rest.city : 'השעות הקבועות שהגדרת') + ', ' + (E.emp.restPct || 150) + '%.',
          confidence: 'medium', fromOverride: ovNote(appRestH, A.t.restHours, 0, 0.1) });
      } else if (slipRestH > 0 && appRestH - slipRestH > 0.25) {
        const missingH = appRestH - slipRestH;
        const amount = missingH * E.avgRate * ((E.emp.restPct || 150) - 100) / 100;
        add({ area: 'שבת וחג', status: 'bad', title: 'חסרות שעות שבת/חג', amount, shifts: restShifts.map((r) => r.id),
          detail: `באפליקציה ${U.hours(appRestH)} שעות שבת/חג, בתלוש ${U.hours(slipRestH)}. ${U.hours(missingH)} שעות כנראה שולמו כרגילות; התוספת החסרה ≈ ${U.money(amount)}.`,
          basis: 'השוואת שעות 150%/175%/200% בתלוש לשעות בתוך חלון השבת/חג.', confidence: 'medium',
          fromOverride: ovNote(appRestH, A.t.restHours, slipRestH, 0.1) });
      } else if (slipRestH > 0 && slipRestPay > 0) {
        const eff = slipRestPay / slipRestH;
        const exp = E.pay.rest150 + E.pay.rest175 + E.pay.rest200;
        const expRate = appRestH > 0 ? exp / appRestH : 0;
        if (expRate > 0 && eff < expRate * 0.97) {
          const amount = (expRate - eff) * slipRestH;
          add({ area: 'שבת וחג', status: 'bad', title: 'תעריף שבת/חג נמוך', amount, detail: `בתלוש ${U.money(eff)} לשעת שבת, צפוי ${U.money(expRate)}. ≈ ${U.money(amount)}.`, basis: 'סכום ÷ שעות בשורות השבת/חג.', confidence: 'medium' });
        } else add({ area: 'שבת וחג', status: 'ok', title: 'שעות שבת/חג תקינות', detail: `${U.hours(slipRestH)} שעות בתלוש מול ${U.hours(appRestH)} באפליקציה.`, basis: 'שעות 150%/175%/200%.', confidence: 'medium' });
      } else if (slipRestH > appRestH + 0.25) {
        add({ area: 'שבת וחג', status: 'warn', title: 'בתלוש יותר שעות שבת/חג', detail: `בתלוש ${U.hours(slipRestH)}, באפליקציה ${U.hours(appRestH)}. ייתכן שהמעסיק מגדיר את חלון השבת אחרת. אפשר לכוון בהגדרות › שבת וחגים.`, basis: 'השוואת שעות.', confidence: 'low' });
      } else add({ area: 'שבת וחג', status: 'ok', title: 'שעות שבת/חג תקינות', detail: `${U.hours(slipRestH)} שעות.`, basis: 'השוואת שעות.', confidence: 'medium' });
    }

    /* 4. overtime */
    const slipOt = (qty(F, 'ot125') || 0) + (qty(F, 'ot150') || 0);
    const appOt1 = E.t.hoursBy.ot1 - covSum((r) => r.hoursBy.ot1), appOt2 = E.t.hoursBy.ot2 - covSum((r) => r.hoursBy.ot2);
    const appOt = appOt1 + appOt2;
    if (!noShifts && (appOt > 0.25 || slipOt > 0)) {
      const otShifts = E.shifts.filter((r) => r.hoursBy.ot1 + r.hoursBy.ot2 > 0 && !covered.includes(r));
      if (appOt - slipOt > 0.25) {
        const missing125 = Math.max(0, appOt1 - (qty(F, 'ot125') || 0));
        const missing150 = Math.max(0, appOt2 - (qty(F, 'ot150') || 0));
        const amount = E.avgRate * (missing125 * 0.25 + missing150 * 0.5);
        add({ area: 'שעות נוספות', status: 'bad', title: 'שעות נוספות חסרות', amount, shifts: otShifts.map((r) => r.id),
          detail: `באפליקציה ${U.hours(appOt1)} ש׳ ב-125% ו-${U.hours(appOt2)} ש׳ ב-150% (${dates(otShifts)})${covered.length ? ', לא כולל המשמרות שחסרות לגמרי' : ''}; בתלוש ${U.hours(qty(F, 'ot125') || 0)} ו-${U.hours(qty(F, 'ot150') || 0)}. התוספת החסרה ≈ ${U.money(amount)}.`,
          basis: Engine.otByLaw(E.emp) ? 'שעות נוספות לפי החוק: ביום מעל 8.6 שעות (8 בשבוע של 6 ימים, 7 במשמרת לילה) ובשבוע מעל 42 שעות רגילות.' : 'שעות נוספות יומיות אחרי ' + E.emp.otThreshold + ' שעות (לפי ההגדרות).', confidence: 'medium',
          fromOverride: ovNote(appOt, A.t.hoursBy.ot1 + A.t.hoursBy.ot2, slipOt, 0.1) });
      } else add({ area: 'שעות נוספות', status: 'ok', title: 'שעות נוספות תקינות', detail: `${U.hours(slipOt)} בתלוש מול ${U.hours(appOt)} באפליקציה.`, basis: 'השוואת שעות 125%/150%.', confidence: 'medium' });
    }

    /* 5. travel */
    const slipTravel = val(F, 'travel');
    if (!noShifts && (E.t.travel > 0 || slipTravel)) {
      const d = E.t.travel - (slipTravel || 0);
      const emp = E.emp;
      const basis = `${E.t.workDays} ימי עבודה × ${U.money(emp.travelPerDay)}` + (+emp.travelMonthlyCap ? `, תקרה ${U.money(emp.travelMonthlyCap)}` : '') + '.';
      if (d > 1) add({ area: 'נסיעות', status: 'bad', title: 'החזר נסיעות חסר', amount: d, detail: `צפוי ${U.money(E.t.travel)}, בתלוש ${U.money(slipTravel || 0)}.` + (val(F, 'workDays') ? ` המעסיק רשם ${val(F, 'workDays')} ימי עבודה.` : ''), basis, confidence: 'high', fromOverride: ovNote(E.t.travel, A.t.travel, slipTravel, 0.5) });
      else if (d < -1) add({ area: 'נסיעות', status: 'warn', title: 'נסיעות גבוהות מהצפוי', detail: `בתלוש ${U.money(slipTravel)}, צפוי ${U.money(E.t.travel)}. אולי התעריף היומי שהגדרת שונה?`, basis, confidence: 'medium' });
      else add({ area: 'נסיעות', status: 'ok', title: 'נסיעות תקינות', detail: U.money(slipTravel || 0), basis, confidence: 'high' });
    }

    /* 6. minimum wage */
    const rateForMin = bq && bv ? (F.base.rate || bv / bq) : E.baseRate;
    if (rateForMin > 0) {
      const MW = Engine.minWageFor(S, (slip.period || U.todayKey().slice(0, 7)) + '-15');
      const mw = MW.hourly;
      if (rateForMin + 0.005 < mw) {
        const h = bq || E.hrs.base;
        add({ area: 'שכר מינימום', status: 'bad', title: 'שכר נמוך משכר המינימום', amount: (mw - rateForMin) * h, detail: `${U.money(rateForMin)} לשעה, שכר המינימום ${U.money(mw)}.`, basis: 'שכר מינימום לשעה כפי שמוגדר בהגדרות (עדכן אם השתנה).', confidence: 'high' });
      } else add({ area: 'שכר מינימום', status: 'ok', title: 'מעל שכר המינימום', detail: `${U.money(rateForMin)} ≥ ${U.money(mw)} לשעה.`, basis: MW.custom ? 'שכר מינימום לשעה (מההגדרות).' : `שכר מינימום ${MW.youth ? 'לנוער בגיל ' + MW.age : 'למבוגר'} לפי החוק, מ-${U.fmtDate(MW.from)}.`, confidence: 'high' });
    }

    /* 7. pension */
    const gross = val(F, 'gross');
    // pensionable wage per the settings: "base" = all paid hours × hourly rate; "all" = gross without travel/recuperation
    const slipBaseRate = bq && bv ? (F.base.rate || bv / bq) : 0;
    const pBase = S.pension.base === 'base' && slipBaseRate && slipHours
      ? slipHours * slipBaseRate
      : (gross || E.t.gross) - (slipTravel || 0) - (val(F, 'recuperation') || 0);
    const active = Engine.pensionActive(S, E.P.to);
    const pe = val(F, 'pensionEmployee'), pr = val(F, 'pensionEmployer');
    if (S.pension.enabled) {
      if (active && !pe) {
        const amount = pBase * ((+S.pension.employerPct || 0) + (+S.pension.severancePct || 0)) / 100;
        add({ area: 'פנסיה', status: 'bad', title: 'לא נמצאה הפרשה לפנסיה', amount,
          detail: `לפי תאריך תחילת העבודה (${S.startDate ? U.fmtDate(S.startDate) : '—'}) ההפרשות היו אמורות להתחיל אחרי ${S.pension.startAfterMonths} חודשים. חלק המעסיק (תגמולים + פיצויים) ≈ ${U.money(amount)} בחודש.`,
          basis: 'צו ההרחבה לפנסיה חובה. הסכום הוא כסף שהמעסיק אמור להפקיד לקרן, לא לנטו.', confidence: S.startDate ? 'medium' : 'low',
          note: 'אם הייתה לך קרן פנסיה פעילה לפני כן, ההפרשה אמורה להתחיל כבר אחרי 3 חודשים (ולעיתים רטרואקטיבית). כדאי לוודא מול המעסיק.' });
      } else if (pe) {
        const p = pBase > 0 ? (pe / pBase) * 100 : 0;
        const ok = Math.abs(p - S.pension.employeePct) <= 0.6;
        add({ area: 'פנסיה', status: ok ? 'ok' : 'warn', title: ok ? 'הפרשת עובד לפנסיה תקינה' : 'אחוז הפרשה לפנסיה לא צפוי',
          detail: `${U.money(pe)} = ${U.num(p, 2)}% מ-${U.money(pBase)} (צפוי ~${S.pension.employeePct}%).` + (pr ? ` מעסיק: ${U.money(pr)} (${U.num(pBase ? pr / pBase * 100 : 0, 2)}%).` : ''),
          basis: (S.pension.base === 'base' ? 'הבסיס המשוער: כל השעות × התעריף הבסיסי (בלי תוספות)' : 'הבסיס המשוער: ברוטו פחות נסיעות והבראה') + '. השכר הקובע לפנסיה עשוי להיות שונה לפי ההסכם. אפשר לשנות בהגדרות › נטו משוער.', confidence: 'low' });
        if (pr != null && pBase > 0 && pr / pBase * 100 < (+S.pension.employerPct || 6.5) - 0.6) {
          add({ area: 'פנסיה', status: 'warn', title: 'הפרשת המעסיק נמוכה', amount: pBase * S.pension.employerPct / 100 - pr, detail: `${U.num(pr / pBase * 100, 2)}% במקום ${S.pension.employerPct}%.`, basis: 'צו ההרחבה: לפחות 6.5% תגמולי מעסיק.', confidence: 'low' });
        }
      } else if (!active) {
        const minorP = Engine.isMinor(S, E.P.to);
        add({ area: 'פנסיה', status: 'ok', title: 'פנסיה עוד לא חובה', detail: minorP ? 'מתחת לגיל 18 אין חובת הפרשה לפנסיה.' : `ההפרשות מתחילות אחרי ${S.pension.startAfterMonths} חודשי עבודה.`, basis: 'צו ההרחבה לפנסיה חובה.', confidence: S.startDate ? 'medium' : 'low' });
      }
    }

    /* 8. recuperation */
    const L = Engine.leaveBalances(model, E.P.to);
    if (L.recuperation && L.recuperation.eligible) {
      const rm = +S.leave.recuperationMonth || 0;
      const month = +slip.period.slice(5, 7);
      const rec = val(F, 'recuperation');
      if (rm === 0 || rm === month) {
        const exp = rm === 0 ? L.recuperation.amount / 12 : L.recuperation.amount;
        if (!rec) add({ area: 'הבראה', status: 'warn', title: 'לא נמצאו דמי הבראה', amount: exp, detail: `לפי ותק ${U.num(L.seniorityYears, 1)} שנים והיקף משרה ~${U.num(L.jobPct * 100, 0)}%: ≈ ${U.money(exp)}.`, basis: 'צו ההרחבה לדמי הבראה (מגזר פרטי).', confidence: 'low', note: 'מעסיקים משלמים בחודשים שונים. אם קיבלת בחודש אחר, הכול בסדר.' });
        else add({ area: 'הבראה', status: 'ok', title: 'שולמו דמי הבראה', detail: `${U.money(rec)} (הערכה: ${U.money(exp)}).`, basis: 'צו ההרחבה לדמי הבראה.', confidence: 'low' });
      }
    }

    /* 9-10. the leave balances and the credit points are settings the payslip can correct: settingsCheck() lists
     * them with what the payslip says, what the settings say and a way to take the payslip's value */
    const cp = val(F, 'creditPoints');

    /* 11-12. tax & social security */
    const minor = Engine.isMinor(S, E.P.to);
    if (minor) {
      const blm = (val(F, 'nationalInsurance') || 0) + (val(F, 'healthTax') || 0);
      const itm = val(F, 'incomeTax') || 0;
      if (blm > 0) add({ area: 'ביטוח לאומי', status: 'bad', title: 'נוכו ביטוח לאומי / מס בריאות לעובד מתחת לגיל 18', amount: blm, detail: `נוכו ${U.money(blm)}, אבל עובד שטרם מלאו לו 18 פטור מדמי ביטוח לאומי ומס בריאות.`, basis: 'חוק הביטוח הלאומי: פטור לנער עד גיל 18 (לפי תאריך הלידה שהוזן).', confidence: 'medium' });
      if (itm > 0) {
        // a minor pays income tax by the same brackets, with the credit points (one more at 16-17): the deduction is
        // compared with the engine's estimate for the period, and only one clearly above it is flagged
        let estT = 0;
        try {
          const est = Engine.netEstimate({ gross: gross || E.t.gross, pensionBase: pBase, pensionActive: !!pe, deductions: 0, periodTo: E.P.to }, Object.assign({}, S, { tax: Object.assign({}, S.tax, { creditPoints: cp != null ? cp : S.tax.creditPoints }) }));
          estT = Math.max(0, +est.incomeTax || 0);
        } catch (e) { estT = 0; }
        const over = itm - estT;
        if (over > Math.max(40, estT * 0.15)) add({ area: 'מס הכנסה', status: 'warn', title: 'נוכה מס הכנסה גבוה מההערכה (מתחת לגיל 18)', amount: over, detail: `נוכו ${U.money(itm)}, הערכה ${U.money(estT)}. בשכר רגיל של נער/ה, נקודות הזיכוי מקטינות את המס, לרוב עד אפס. כדאי לבדוק שמולא טופס 101.`, basis: 'מדרגות מס ונקודות זיכוי.', confidence: 'low', note: 'מס שנוכה ביתר אפשר לקבל בחזרה בהחזר מס שנתי.' });
        else add({ area: 'מס הכנסה', status: 'ok', title: 'מס הכנסה סביר', detail: `${U.money(itm)} (הערכה: ${U.money(estT)}).`, basis: 'מדרגות מס חודשיות ונקודות זיכוי.', confidence: 'low' });
      }
      if (!blm && !itm) add({ area: 'ביטוח לאומי', status: 'ok', title: 'ללא ניכויי חובה (מתחת לגיל 18)', detail: 'הנטו אמור להיות שווה לברוטו (פחות ניכויים אישיים, אם יש).', basis: 'פטור לנער עד גיל 18.', confidence: 'medium' });
    }
    if (gross && !minor) {
      const est = Engine.netEstimate({ gross, pensionBase: pe ? pe / (S.pension.employeePct / 100) : pBase, pensionActive: !!pe, deductions: 0, periodTo: E.P.to }, Object.assign({}, S, { tax: Object.assign({}, S.tax, { creditPoints: cp != null ? cp : S.tax.creditPoints }) }));
      const it = val(F, 'incomeTax');
      if (it != null) {
        const over = it - est.incomeTax;
        if (over > Math.max(40, est.incomeTax * 0.15)) add({ area: 'מס הכנסה', status: 'warn', title: 'מס הכנסה גבוה מההערכה', amount: over, detail: `נוכו ${U.money(it)}, הערכה ${U.money(est.incomeTax)}. סיבות אפשריות: עבודה אצל יותר ממעסיק אחד בלי תיאום מס, טופס 101 חסר (מס מקסימלי), או רכיבים שלא ידועים לאפליקציה.`, basis: 'מדרגות מס חודשיות ונקודות זיכוי (מההגדרות).', confidence: 'low', note: 'אם נוכה מס ביתר, אפשר לקבל אותו בהחזר מס שנתי.' });
        else add({ area: 'מס הכנסה', status: 'ok', title: 'מס הכנסה סביר', detail: `${U.money(it)} (הערכה: ${U.money(est.incomeTax)}).`, basis: 'מדרגות מס חודשיות.', confidence: 'low' });
      }
      const bl = val(F, 'nationalInsurance'), ht = val(F, 'healthTax');
      if (bl != null || ht != null) {
        const actual = (bl || 0) + (ht || 0);
        const expBL = (bl != null ? est.bl : 0) + (ht != null ? est.health : 0);
        const ok = Math.abs(actual - expBL) <= Math.max(15, expBL * 0.1);
        add({ area: 'ביטוח לאומי', status: ok ? 'ok' : 'warn', title: ok ? 'ביטוח לאומי ומס בריאות סבירים' : 'ביטוח לאומי / בריאות שונים מההערכה', detail: `נוכו ${U.money(actual)}, הערכה ${U.money(expBL)}.`, basis: `שיעורים מופחתים עד ${U.money(Engine.blLimits(S.tax || {}, E.P.to).thr, 0)} בחודש, מלאים מעל.`, confidence: 'medium' }); // the year's threshold (LAW_YEARS), not "60% of the average wage" (review 2026-11-16)
      }
      const net = val(F, 'net'), td = val(F, 'totalDeductions');
      if (net != null && td != null) {
        const ok = Math.abs(gross - td - net) <= 2;
        add({ area: 'נטו', status: ok ? 'ok' : 'warn', title: ok ? 'החשבון ברוטו → נטו נסגר' : 'ברוטו פחות ניכויים ≠ נטו', detail: `${U.money(gross)} − ${U.money(td)} = ${U.money(gross - td)}; בתלוש נטו ${U.money(net)}.`, basis: 'בדיקה אריתמטית.', confidence: 'high' });
      }
      // the gross against the app's own calculation: reconcile() takes it apart line by line
    }

    /* 13. unexplained deductions */
    const unexplained = (slip.other || []).filter((o) => o.guess === 'otherDed');
    if (unexplained.length) {
      add({ area: 'ניכויים', status: 'warn', title: 'ניכויים שלא מוסברים', amount: 0, detail: unexplained.map((o) => `${o.line.replace(/[\d.,\-%]+/g, '').trim() || 'ניכוי'}: ${U.money(Math.abs(o.value))}`).join(' · '), basis: 'שורות ניכוי שלא שייכות לניכויי החובה המוכרים. ניכוי מהשכר מותר רק לפי חוק או בהסכמה בכתב.', confidence: 'medium' });
    }

    const bad = findings.filter((f) => f.status === 'bad');
    const totalMissing = bad.reduce((s, f) => s + Math.max(0, f.amount || 0), 0);
    return { findings, expected: E, auto: A, totalMissing, overridesInPeriod: overridesInPeriod.length, period: slip.period, noShifts, fields: F };
  }

  /* ---------------- before writing to the employer: innocent reasons for a gap ----------------
   * For every finding with money missing, the likely innocent reasons, each checked on the person's own data where
   * it can be: found 'yes' (the data fits: the reason closes this gap), 'maybe' (the condition is there, it explains
   * part or cannot be measured), 'no' (checked, not this). A setting's effect is measured by running the same check
   * on a copy of the data with that setting the employer's likely way (the break unpaid, overtime by the law, no
   * rounding): what is left of the finding there is what the setting does not explain. Only 'yes' reasons lower the
   * gap that is left for the letter; of several, the largest counts (they may describe the same hours). */
  const altCache = new WeakMap(); // model -> { key: the model rebuilt with one setting changed }
  function altModel(model, key, change) {
    if (!model.data) return null;
    let c = altCache.get(model);
    if (!c) { c = {}; altCache.set(model, c); }
    if (!(key in c)) {
      try { c[key] = Engine.buildModel(Object.assign({}, model.data, change(model.data))); } catch (e) { c[key] = null; }
    }
    return c[key];
  }
  const badIn = (a, area) => a.findings.find((f) => f.area === area && f.status === 'bad');
  /** How much of a finding a changed setting explains (0 when it changes nothing). */
  function whatIf(slip, model, key, change, f) {
    const m = altModel(model, key, change);
    if (!m) return null;
    let a2;
    try { a2 = analyze(slip, m); } catch (e) { return null; }
    const f2 = badIn(a2, f.area);
    return Math.max(0, f.amount - (f2 ? Math.max(0, f2.amount || 0) : 0));
  }
  /** yes when it closes the finding, maybe when it explains a part of it. */
  const closes = (x, amount) => x >= amount - Math.max(2, amount * 0.1);
  const grade = (x, amount) => (x == null || x < 0.5 ? 'no' : closes(x, amount) ? 'yes' : 'maybe');
  // the finding's area (its Hebrew name in this build) → a code
  const AREAS = [['שעות', 'hours'], ['תעריף', 'rate'], ['שבת וחג', 'rest'], ['שעות נוספות', 'ot'], ['נסיעות', 'travel'], ['שכר מינימום', 'minwage'], ['פנסיה', 'pension'], ['ביטוח לאומי', 'ni'], ['מס הכנסה', 'tax']];
  const codeOf = (area) => { const x = AREAS.find((p) => p[0] === area); return x ? x[1] : ''; };
  const AREA_FIELDS = { hours: HOUR_FIELDS.concat('workHours'), rate: ['base'], rest: ['rest150', 'rest175', 'rest200'], ot: ['ot125', 'ot150'], travel: ['travel', 'workDays'], minwage: ['base'], pension: ['pensionEmployee', 'pensionEmployer'], ni: ['nationalInsurance', 'healthTax'], tax: ['incomeTax'] };
  const RANK = { edge: 1, period: 2, travelDays: 2, minAge: 2, pensionStart: 2, birth18: 2, break: 3, otLaw: 3, restWindow: 3, rate: 3, travelRate: 3, unplaced: 4, travelMonth: 4, estimate: 4, long: 5, travelCap: 5, entered: 6, rounding: 6, ocr: 7 };
  const FOUND = { yes: 0, maybe: 1, no: 2 };

  /**
   * checkGap(analysis, slip, model) → { items: [{ id, area, title, amount, reasons, explained, left }], total,
   * explained, left, all }. A reason: { id, title, text, found: 'yes'|'maybe'|'no', amount (₪ it explains, or null),
   * line (what the payslip reader read, for a misread), shifts: [ids], fix: { kind: 'set', k, f } | { kind: 'verify',
   * key } | null }.
   */
  function checkGap(a, slip, model) {
    const S = model.ctx.settings;
    const F = (a && a.fields) || slip.fields || {};
    const E = a.expected;
    const P = E.P;
    const emp = E.emp || model.ctx.primaryEmployer();
    const raw = new Map(((model.data && model.data.shifts) || []).map((s) => [s.id, s]));
    // a list of dates in a Hebrew sentence: isolated left to right (its brackets and commas stay in order) and on one
    // line (no-break spaces between the dates)
    const dates = (rs) => '\u2066' + rs.map((r) => U.fmtDate(r.dateKey, 'short')).join(',\u00a0') + '\u2069';
    const slipHours = slipHoursOf(F);
    const items = [];
    for (const f of a.findings) {
      if (f.status !== 'bad' || !(f.amount > 0)) continue;
      const code = codeOf(f.area);
      const R = [];
      const add = (o) => R.push(Object.assign({ amount: null, line: null, shifts: [], fix: null }, o, { amount: o.amount != null ? Math.min(f.amount, Math.max(0, o.amount)) : null }));

      /* the last shifts of the period: paid on the next payslip */
      if (code === 'hours' || code === 'travel') {
        const diffH = code === 'hours' ? E.t.hours - slipHours : 0;
        const edgeFrom = U.addDays(P.to, -3);
        let tail = [], acc = 0;
        if (code === 'hours') {
          for (let i = E.shifts.length - 1; i >= 0 && acc < diffH - 0.3; i--) { acc += E.shifts[i].paidHours; tail.unshift(E.shifts[i]); }
          if (!(tail.length && Math.abs(acc - diffH) <= 0.3 && tail[0].dateKey >= edgeFrom)) tail = [];
        } else {
          // travel: the days at the end of the period whose travel adds up to what is missing
          const per = +emp.travelPerDay || 0;
          const days = [...new Set(E.shifts.map((r) => r.dateKey))].sort().reverse();
          for (let k = 1; k <= Math.min(3, days.length) && per > 0; k++) {
            if (days[k - 1] < edgeFrom) break;
            if (Math.abs(k * per - f.amount) <= 0.5) { tail = E.shifts.filter((r) => days.slice(0, k).includes(r.dateKey)); break; }
          }
        }
        const last = E.shifts.filter((r) => r.dateKey >= U.addDays(P.to, -1));
        if (tail.length) {
          add({ id: 'edge', found: 'yes', amount: code === 'hours' ? tail.reduce((x, r) => x + r.wage, 0) : f.amount, shifts: tail.map((r) => r.id),
            title: 'משמרות בסוף התקופה', short: 'כנראה בתלוש הבא', nextSlip: true,
            text: code === 'hours' ? `המשמרות האחרונות בתקופה (${dates(tail)}) מסבירות את כל ההפרש. יש מעסיקים שמשלמים עליהן בתלוש של החודש הבא. אם הן מופיעות שם, לא חסר כסף.`
              : `הנסיעות של הימים האחרונים בתקופה (${dates(tail)}) מסבירות את כל ההפרש. יש מעסיקים שמשלמים עליהן בתלוש של החודש הבא.` });
        } else {
          add({ id: 'edge', found: last.length ? 'maybe' : 'no', shifts: last.map((r) => r.id), title: 'משמרות בסוף התקופה',
            text: last.length ? `יש משמרות ביומיים האחרונים של התקופה (${dates(last)}). ייתכן שהן ייכנסו לתלוש הבא.` : 'אין משמרות בסוף התקופה שמסבירות את ההפרש.' });
        }
      }

      if (code === 'hours') {
        const diffH = E.t.hours - slipHours;
        /* the pay period: the employer counts the month from another day */
        const cur = +emp.periodStartDay || 1;
        let best = null;
        for (const d of [1, 21, 26, 25, 20, 16, 15, 24, 11, 10]) { // the common ones first: an even match keeps the first
          if (d === cur) continue;
          const P2 = Engine.periodByKey(slip.period, Object.assign({}, emp, { periodStartDay: d }));
          const h = Engine.totals(model, P2.from, P2.to, { employerId: E.only }).hours;
          if (!best || Math.abs(h - slipHours) < Math.abs(best.h - slipHours)) best = { d, h };
        }
        const match = best && Math.abs(best.h - slipHours) <= 0.25;
        // (a period from an unusual day, the 10th or the 11th, matches by chance whenever the missing hours are those of
        // the last shifts before that day: a shift really unpaid was explained away and nothing was left for the letter,
        // round 2. The common first days close the gap; another one may)
        const common = match && [1, 15, 16, 20, 21, 25, 26].includes(best.d);
        add({ id: 'period', found: match ? (common ? 'yes' : 'maybe') : 'no', amount: common ? f.amount : null, title: 'תקופת השכר',
          text: !match ? 'בדקנו תקופות שמתחילות בימים אחרים בחודש, ואף אחת לא תואמת לשעות בתלוש.'
            : best.d === 1 ? 'אם המעסיק סופר את השעות לפי חודש קלנדרי, השעות בתלוש תואמות בדיוק. אפשר לשנות את תחילת התקופה בהגדרות.'
              : `אם המעסיק סופר את החודש מה-${best.d} בחודש, השעות בתלוש תואמות בדיוק. אפשר לשנות את תחילת התקופה בהגדרות.`,
          fix: { kind: 'set', k: 'pay', f: 'התקופה מתחילה ב-' } });

        /* a shift much longer than the rest: a clock left running */
        const lens = E.shifts.map((r) => r.paidHours).sort((x, y) => x - y);
        const typical = lens.length >= 3 ? lens[Math.floor(lens.length / 2)] : 8;
        const longs = E.shifts.filter((r) => r.paidHours >= 12 && r.paidHours >= typical + 3);
        const fit = longs.find((r) => Math.abs(r.paidHours - typical - diffH) <= 0.5);
        const lg = fit || longs[0];
        add({ id: 'long', found: fit ? 'yes' : longs.length ? 'maybe' : 'no', amount: lg ? (lg.paidHours - typical) * E.avgRate : null, shifts: longs.map((r) => r.id),
          title: 'משמרת ארוכה במיוחד',
          text: lg ? `משמרת של ${U.hm(lg.paidMin)} שעות ב-${U.fmtDate(lg.dateKey, 'short')}. אם שכחת לעצור את השעון, נרשמו יותר שעות ממה שעבדת.` : 'אין בתקופה משמרות ארוכות במיוחד.' });

        /* shifts written before they began (from the plan) or changed after they ended */
        const entered = E.shifts.filter((r) => {
          const s = raw.get(r.id);
          if (!s || s.demo) return false;
          const c = +s.createdAt || 0, u = +s.updatedAt || 0;
          return (c && c < s.start - 5 * 60000) || (u && c && u - c > 10 * 60000 && u > s.end);
        });
        add({ id: 'entered', found: entered.length ? 'maybe' : 'no', shifts: entered.map((r) => r.id), title: 'משמרות שנרשמו מראש או תוקנו',
          text: entered.length ? 'חלק מהמשמרות נרשמו לפני שהתחילו, או תוקנו אחרי שנגמרו. כדאי לוודא שהשעות בהן הן השעות שעבדת בפועל.' : 'אין בתקופה משמרות שנרשמו מראש או תוקנו אחר כך.' });
      }

      /* the break: paid in the app, maybe not by the employer */
      if (code === 'hours' || code === 'ot') {
        const withBreak = E.shifts.filter((r) => r.breakPaid && r.breakMin > 0);
        const x = withBreak.length ? whatIf(slip, model, 'break', (d) => ({ shifts: (d.shifts || []).map((s) => (s.breakPaid === false ? s : Object.assign({}, s, { breakPaid: false }))) }), f) : 0;
        const bh = withBreak.reduce((s, r) => s + r.breakMin / 60, 0);
        add({ id: 'break', found: withBreak.length ? (grade(x, f.amount) === 'no' ? 'maybe' : grade(x, f.amount)) : 'no', amount: withBreak.length ? x : null, shifts: withBreak.map((r) => r.id),
          title: 'ההפסקה',
          text: withBreak.length ? `באפליקציה ההפסקות נספרות כזמן עבודה בתשלום, ${U.hours(bh)} שעות בתקופה. אם יכולת לצאת בזמן ההפסקה, מותר למעסיק לא לשלם עליה.` : 'אין בתקופה הפסקות שנספרות בתשלום.',
          fix: { kind: 'set', k: 'calc', f: 'הפסקה' } });
      }

      /* overtime: after a flat number of hours in the app, by the law at the employer */
      if (code === 'ot') {
        const byLaw = Engine.otByLaw(emp);
        const x = byLaw ? 0 : whatIf(slip, model, 'otLaw', (d) => ({ employers: (d.employers || []).map((e) => Object.assign({}, e, { otLaw: true })) }), f);
        add({ id: 'otLaw', found: grade(x, f.amount), amount: x || null, title: 'מתי מתחילות שעות נוספות',
          text: byLaw ? 'באפליקציה שעות נוספות כבר מחושבות לפי החוק.'
            : x >= 0.5 ? `באפליקציה שעות נוספות מתחילות אחרי ${+emp.otThreshold || 8} שעות ביום. לפי החוק, בשבוע של 5 ימים הן מתחילות רק מעל 8.6 שעות ביום או מעל 42 שעות בשבוע, ולכן המעסיק סופר פחות שעות נוספות.`
              : 'חישוב לפי החוק לא משנה את השעות הנוספות בתקופה הזו.',
          fix: byLaw ? null : { kind: 'set', k: 'calc', f: 'לפי החוק (מומלץ)' } });
      }

      /* rounding of clock times */
      if (code === 'hours' || code === 'ot') {
        const mode = emp.roundingMode || 'none';
        if (mode === 'up' || mode === 'nearest') {
          const x = whatIf(slip, model, 'round-none', (d) => ({ employers: (d.employers || []).map((e) => Object.assign({}, e, { roundingMode: 'none' })) }), f);
          add({ id: 'rounding', found: grade(x, f.amount), amount: x || null, title: 'עיגול שעות',
            text: `באפליקציה זמני המשמרות מעוגלים ל-${+emp.roundingUnit || 15} דקות. אם המעסיק לא מעגל, הוא משלם לפי הדקות המדויקות.`,
            fix: { kind: 'set', k: 'calc', f: 'עיגול זמן משמרת' } });
        } else if (mode === 'none') {
          const x = whatIf(slip, model, 'round-down', (d) => ({ employers: (d.employers || []).map((e) => Object.assign({}, e, { roundingMode: 'down', roundingUnit: 15 })) }), f);
          // rounding down time that was worked is not a reason to let it go: at most 'maybe'
          add({ id: 'rounding', found: x >= 0.5 ? 'maybe' : 'no', amount: x || null, title: 'עיגול שעות',
            text: x >= 0.5 ? 'אם המעסיק מעגל את שעות הכניסה והיציאה כלפי מטה לרבע שעה, יוצא פער כזה. גם דקות שעוגלו הן זמן שעבדת, אז כדאי לשאול על זה.' : 'עיגול השעות לא מסביר את ההפרש.' });
        }
      }

      /* Shabbat and holidays: hours close to the start or end of the window */
      if (code === 'rest' && root.HebCal) {
        const H = 3600000;
        const restShifts = E.shifts.filter((r) => r.restHours > 0);
        let edgeH = 0;
        for (const r of restShifts) {
          const wins = root.HebCal.restWindows(U.addDays(r.dateKey, -1), U.addDays(r.dateKey, 2), model.ctx.restCfg);
          const pf = r.roundedMin ? r.paidMin / r.roundedMin : 1;
          for (const sl of r.slices || []) {
            if (!sl.rest) continue;
            const w = wins.find((x) => (sl.a + sl.b) / 2 >= x.start && (sl.a + sl.b) / 2 < x.end);
            if (!w) continue;
            const ov = (s0, e0) => Math.max(0, Math.min(sl.b, e0) - Math.max(sl.a, s0));
            edgeH += (ov(w.start, w.start + H) + ov(w.end - H, w.end)) / H * pf;
          }
        }
        const pct = ((emp.restPct || 150) - 100) / 100;
        const slipRestH = (qty(F, 'rest150') || 0) + (qty(F, 'rest175') || 0) + (qty(F, 'rest200') || 0);
        const missingH = Math.max(0, E.t.restHours - slipRestH);
        const x = edgeH * E.avgRate * pct;
        const fits = edgeH > 0.05 && edgeH >= missingH - 0.25;
        const city = S.rest.mode === 'city';
        add({ id: 'restWindow', found: fits ? 'yes' : edgeH > 0.05 ? 'maybe' : 'no', amount: edgeH > 0.05 ? (fits ? f.amount : x) : null, shifts: restShifts.map((r) => r.id),
          title: 'שעת כניסת השבת או החג',
          text: edgeH > 0.05 ? (city ? `${U.hours(edgeH)} שעות שבת/חג שלך נמצאות בשעה הראשונה או האחרונה של החלון. האפליקציה מחשבת לפי זמני השבת בעיר שבחרת, ומעסיק יכול לספור משעה קבועה. כדאי לבדוק שהעיר נכונה.`
            : `${U.hours(edgeH)} שעות שבת/חג שלך נמצאות בשעה הראשונה או האחרונה של החלון, לפי השעות הקבועות שהגדרת. אם המעסיק סופר משעה אחרת, יוצא פער כזה.`)
            : 'שעות השבת/חג שלך לא קרובות לכניסה או ליציאה.',
          fix: { kind: 'set', k: 'rest' } });
      }

      /* the hourly rate */
      if (code === 'rate') {
        const bq = qty(F, 'base'), bv = val(F, 'base');
        const slipRate = bq && bv ? (F.base.rate || bv / bq) : 0;
        let raise = null;
        const roleIds = new Set();
        for (const r of E.shifts) for (const id of Object.keys(r.byRole || {})) roleIds.add(id);
        for (const id of roleIds) {
          const role = model.ctx.roles.get ? model.ctx.roles.get(id) : null;
          const rates = role && (role.rates || []).slice().sort((x, y) => String(x.from).localeCompare(String(y.from)));
          if (!rates) continue;
          for (let i = 1; i < rates.length; i++) {
            if (rates[i].from > U.addDays(P.from, -45) && rates[i].from <= P.to && Math.abs(+rates[i - 1].rate - slipRate) <= 0.03) raise = { from: rates[i].from, old: +rates[i - 1].rate, rate: +rates[i].rate };
          }
        }
        const baseRates = new Set();
        for (const r of E.shifts) for (const l of r.lines) if (!l.rest && l.tier === 0) baseRates.add(Math.round(l.rate * 100));
        // (a raise from the period's first day or its last days may start later at the employer, payroll often moves it
        // to the next payslip; one from the middle of it, set by
        // the person, is what the payslip did not pay: it stays in the gap, the reason shown. Closing it erased a raise
        // never paid, round 2, the verdict-layer check)
        const late = raise && (raise.from <= U.addDays(P.from, 1) || raise.from > U.addDays(P.to, -7));
        add({ id: 'rate', found: raise ? (late ? 'yes' : 'maybe') : 'maybe', amount: late ? f.amount : null, title: 'התעריף לשעה',
          text: raise ? `הגדרת העלאה ל-${U.money(raise.rate)} מ-${U.fmtDate(raise.from)}, ובתלוש מופיע התעריף הקודם (${U.money(raise.old)}). אם ההעלאה מתחילה אצל המעסיק מאוחר יותר, כדאי לבדוק את התאריך בתפקיד.`
            : baseRates.size > 1 ? 'בתקופה יש משמרות בכמה תפקידים בתעריפים שונים. אם משמרת נרשמה בתפקיד הלא נכון, התעריף יוצא שונה.'
              : `בתלוש ${U.money(slipRate)} לשעה, ובאפליקציה ${U.money(E.baseRate)}. כדאי לבדוק שהתעריף שהגדרת הוא התעריף שסוכם.`,
          fix: { kind: 'set', k: 'roles' } });
      }

      /* travel */
      if (code === 'travel') {
        const per = +emp.travelPerDay || 0;
        const slipT = val(F, 'travel') || 0;
        const wd = val(F, 'workDays');
        const appDays = E.t.workDays;
        if (wd != null && wd < appDays) {
          const x = (appDays - wd) * per;
          add({ id: 'travelDays', found: grade(Math.min(x, f.amount), f.amount), amount: x, title: 'מספר ימי העבודה',
            text: `המעסיק רשם ${U.num(wd, 0)} ימי עבודה, ובאפליקציה ${appDays}. ייתכן שהנסיעות על שאר הימים ישולמו בתלוש אחר.` });
        }
        const days = wd || appDays;
        const perSlip = slipT && days ? slipT / days : 0;
        const clean = perSlip > 0 && Math.abs(perSlip * 100 - Math.round(perSlip * 100)) < 0.01;
        if (perSlip > 0 && perSlip < per - 0.05 && (wd != null || clean)) {
          add({ id: 'travelRate', found: wd != null && Math.abs(wd - appDays) < 0.5 ? 'yes' : 'maybe', amount: (per - perSlip) * days, title: 'סכום הנסיעות ליום',
            text: `בתלוש יוצא ${U.money(perSlip)} ליום, ובאפליקציה ${U.money(per)}. המעסיק משלם את מחיר הנסיעה בפועל עד התקרה, אז ייתכן שזה מחיר הנסיעה שלך.`,
            fix: { kind: 'set', k: 'pay', f: 'סכום ליום עבודה ₪' } });
        }
        if (!slipT) {
          add({ id: 'travelMonth', found: 'maybe', amount: f.amount, title: 'נסיעות בחודש אחר',
            text: 'בתלוש לא זוהתה שורת נסיעות. יש מעסיקים שמשלמים נסיעות חודש אחרי, או בשורה בשם אחר.' });
        } else if (!+emp.travelMonthlyCap) {
          add({ id: 'travelCap', found: 'maybe', title: 'חופשי חודשי',
            text: 'אם חופשי חודשי זול יותר מהנסיעות של כל הימים, המעסיק יכול לשלם רק את מחירו. אפשר להגדיר תקרה חודשית.',
            fix: { kind: 'set', k: 'pay', f: 'תקרה חודשית ₪' } });
        }
      }

      /* the minimum wage: a minor's is lower */
      if (code === 'minwage') {
        const bq = qty(F, 'base'), bv = val(F, 'base');
        const rate = bq && bv ? (F.base.rate || bv / bq) : E.baseRate;
        const youth = Engine.legalMinWage(P.to, U.addMonths(P.to, -(17 * 12 + 1)));
        const may = !S.birthDate && youth && rate + 0.005 >= youth.hourly;
        add({ id: 'minAge', found: may ? 'maybe' : 'no', amount: may ? f.amount : null, title: 'גיל ושכר מינימום',
          text: may ? 'לא הזנת תאריך לידה. מתחת לגיל 18 שכר המינימום נמוך יותר, ואז התעריף בתלוש עשוי להיות תקין.'
            : S.birthDate ? 'שכר המינימום חושב לפי הגיל שלך מתאריך הלידה שהזנת.' : 'גם שכר המינימום לנוער גבוה מהתעריף בתלוש.',
          fix: { kind: 'set', k: 'personal', f: 'תאריך לידה (לא חובה)' } });
      }

      /* pension: when the duty begins */
      if (code === 'pension') {
        const months = S.startDate ? Engine.monthsBetween(S.startDate, P.to) : null;
        const recent = months != null && months <= (+S.pension.startAfterMonths || 6) + 2;
        add({ id: 'pensionStart', found: !S.startDate || recent ? 'maybe' : 'no', amount: !S.startDate || recent ? f.amount : null, title: 'מתי מתחילה הפנסיה',
          text: !S.startDate ? 'לא הזנת תאריך תחילת עבודה, ולכן האפליקציה לא יודעת מתי חובת ההפרשה מתחילה.'
            : recent ? 'לפי תאריך תחילת העבודה שהזנת, חובת ההפרשה התחילה רק לאחרונה. אם התאריך לא מדויק, גם הבדיקה לא מדויקת.'
              : 'לפי תאריך תחילת העבודה, ההפרשה הייתה אמורה להתחיל כבר.',
          fix: { kind: 'set', k: 'leave', f: 'תאריך תחילת עבודה' } });
      }

      /* National Insurance and tax: the age, and the estimates */
      if (code === 'ni' || code === 'tax') {
        if (S.birthDate) {
          const b18 = U.addMonths(S.birthDate, 12 * 18);
          const near = b18 > P.from && b18 <= U.addDays(P.to, 31);
          add({ id: 'birth18', found: near ? 'yes' : 'maybe', amount: near ? f.amount : null, title: 'הגיל לפי תאריך הלידה',
            text: near ? `יום ההולדת ה-18 שלך ב-${U.fmtDate(b18)}, קרוב לחודש של התלוש. מהגיל הזה מנכים ביטוח לאומי, ומעסיקים סופרים אותו לפי החודש.`
              : `האפליקציה יודעת את הגיל רק מתאריך הלידה שהזנת (${U.fmtDate(S.birthDate)}). אם הוא לא מדויק, גם הבדיקה לא מדויקת.`,
            fix: { kind: 'set', k: 'personal', f: 'תאריך לידה (לא חובה)' } });
        }
        add({ id: 'estimate', found: 'maybe', title: 'הערכה של ניכויים',
          text: 'מס הכנסה, ביטוח לאומי ופנסיה באפליקציה הם הערכה לפי ההגדרות שלך. הם משנים רק את הנטו, לא את הברוטו.' });
      }

      /* a payslip line the reader could not place: maybe this payment under another name */
      if (code !== 'ni' && code !== 'tax') {
        const lines = (slip.other || []).filter((o) => o.guess !== 'otherDed' && !FIELD[o.guess] && +o.value > 0);
        const near = lines.slice().sort((x, y) => Math.abs(+x.value - f.amount) - Math.abs(+y.value - f.amount))[0];
        if (near && +near.value >= f.amount * 0.3) {
          add({ id: 'unplaced', found: Math.abs(+near.value - f.amount) <= Math.max(2, f.amount * 0.1) ? 'yes' : 'maybe', amount: +near.value, line: near.line,
            title: 'שורה שלא זוהתה',
            text: `בתלוש יש שורה שהאפליקציה לא שייכה, על ${U.money(+near.value)}. ייתכן שזה התשלום הזה בשם אחר.`,
            fix: { kind: 'verify', key: '' } });
        }
      }

      /* the reader misread a number */
      const keys = (AREA_FIELDS[code] || []).filter((k) => F[k]);
      const src = slip.source || 'manual';
      if (keys.length && src !== 'manual') {
        const odd = keys.find((k) => { const v = F[k]; return v.qty && v.rate && v.value && Math.abs(v.qty * v.rate - v.value) > Math.max(1, Math.abs(v.value) * 0.015); });
        const k0 = odd || keys[0];
        const ln = F[k0].line && F[k0].line !== 'AI' ? String(F[k0].line).slice(0, 140) : null;
        add({ id: 'ocr', found: odd ? 'yes' : src === 'pdf' ? 'no' : 'maybe', line: ln, title: 'קריאת התלוש',
          text: odd ? 'בשורה שנקראה המספרים לא מסתדרים: שעות כפול תעריף לא שווה לסכום. כנראה ספרה נקראה לא נכון.'
            : src === 'ocr' ? 'התלוש נקרא מצילום, וזיהוי מצילום טועה לפעמים בספרות. כדאי להשוות את השורה לתלוש.'
              : src === 'ai' ? 'הקריאה נעשתה בעזרת AI, והוא יכול לטעות. כדאי להשוות את השורה לתלוש.'
                : 'המספרים נקראו מקובץ ה-⁠PDF עצמו, כך שטעות קריאה פחות סבירה.',
          fix: { kind: 'verify', key: k0 } });
      }

      R.sort((x, y) => (FOUND[x.found] - FOUND[y.found]) || ((y.amount || 0) - (x.amount || 0)) || ((RANK[x.id] || 9) - (RANK[y.id] || 9)));
      // a 'yes' without a measured amount (a misread) explains nothing in shekels
      const yes = R.filter((r) => r.found === 'yes' && r.amount != null).sort((x, y) => y.amount - x.amount);
      const explained = yes.length ? Math.min(f.amount, yes[0].amount) : 0;
      // by: the reason that explains the most (its short name for the findings list)
      items.push({ id: f.id, area: f.area, title: f.title, amount: f.amount, reasons: R, explained, left: Math.max(0, f.amount - explained),
        by: yes.length ? (yes[0].short || yes[0].title) : '', nextSlip: yes.some((r) => r.nextSlip && closes(r.amount, f.amount)) });
    }
    const total = items.reduce((s, x) => s + x.amount, 0);
    const explained = items.reduce((s, x) => s + x.explained, 0);
    const left = Math.max(0, total - explained);
    // nextSlip: a finding is explained by shifts the next payslip may pay (worth looking for there)
    return { items, total, explained, left, all: total > 0 && left < 1, nextSlip: items.some((x) => x.nextSlip) };
  }

  /* ---------------- the payslip against the app's own calculation ----------------
   * reconcile() takes the gap between the payslip and the app apart, line by line, so that the lines add up to the
   * whole gap exactly: what no line explains is its own line ('rest'), never left out. Each line says where its part
   * comes from when the data shows it (state 'clear', with the fix), or asks the one question that would settle it
   * (state 'ask'). settingsCheck() lists the settings the payslip says otherwise (credit points, the rate, travel,
   * seniority, pension, the leave balances...), each with a one-tap update when the payslip is the better source. */
  const r2 = (x) => Math.round(x * 100) / 100;
  // a premium line paid as the supplement only (25%, 50%...), with its hours already at 100% in the base line, is
  // turned into the app's own way (the whole 125%, 150%...): the total stays the same, only the split moves
  const SUPP = { ot125: 0.25, ot150: 0.5, rest150: 0.5, rest175: 0.75, rest200: 1 };
  function slipWork(F) {
    const bq = qty(F, 'base'), bv = val(F, 'base');
    const rate = bq && bv ? (+F.base.rate || bv / bq) : 0;
    const lines = {};
    let moved = 0;
    for (const k of Object.keys(SUPP)) {
      const v = val(F, k), q = qty(F, k);
      if (v == null) continue;
      let supp = false;
      if (rate && q) {
        const per = v / q, s = SUPP[k] * rate, f = (1 + SUPP[k]) * rate;
        supp = Math.abs(per - s) < Math.abs(per - f) && Math.abs(per - s) <= Math.max(0.05, s * 0.08);
      }
      lines[k] = { value: v, qty: q, supp };
      if (supp) moved += q;
    }
    const out = { base: bv, baseQ: bq, rate, lines, supp: false };
    if (moved > 0 && bq && moved <= bq + 0.25) {
      out.supp = true;
      out.base = bv - moved * rate; out.baseQ = bq - moved;
      for (const k of Object.keys(lines)) if (lines[k].supp) lines[k].value += lines[k].qty * rate;
    }
    return out;
  }
  const sumOf = (o, ks, f) => ks.reduce((s, k) => s + ((o[k] && o[k][f || 'value']) || 0), 0);
  const OT_KEYS = ['ot125', 'ot150'], REST_KEYS = ['rest150', 'rest175', 'rest200'];
  /** The payslip's own pension base, the way the settings count it (all hours × the base rate, or the gross). */
  function slipPensionBase(F, S, E) {
    const W = slipWork(F);
    const hrs = slipHoursOf(F);
    if (S.pension.base === 'base' && W.rate && hrs) return hrs * W.rate;
    const g = val(F, 'gross');
    return (g != null ? g : E.t.gross) - (val(F, 'travel') || 0) - (val(F, 'recuperation') || 0);
  }
  const otherSum = (slip, guess) => (slip.other || []).filter((o) => o && o.guess === guess).reduce((s, o) => s + Math.abs(+o.value || 0), 0);
  const unnamedOf = (slip) => unknownLines(slip.other, slip.fields).filter((u) => !u.guess && u.value);

  /**
   * settingsCheck(slip, model, a?) → [{ id, label, slip, app, text, recommend: 'slip'|'ask', apply, set }]: a setting
   * the payslip says otherwise. slip / app: the two values as text. apply: a one-tap change to the payslip's value
   * ({ kind: 'settings', path, value } | { kind: 'employer', patch } | { kind: 'role', id, from, rate }), set: the
   * settings screen to look at ({ kind: 'set', k, f }).
   */
  function settingsCheck(slip, model, a) {
    a = a || analyze(slip, model);
    const S = model.ctx.settings, F = (a && a.fields) || slip.fields || {}, E = a.expected, P = E.P;
    const emp = E.emp || model.ctx.primaryEmployer();
    const out = [];
    const add = (o) => out.push(Object.assign({ recommend: 'slip', apply: null, set: null }, o));
    const W = slipWork(F);
    const slipHours = slipHoursOf(F);

    /* credit points: the employer applies form 101, and the app's net follows the settings */
    const cp = val(F, 'creditPoints');
    if (cp != null && Math.abs(cp - (+S.tax.creditPoints || 0)) >= 0.01) {
      add({ id: 'creditPoints', label: 'נקודות זיכוי', slip: U.num(cp, 2), app: U.num(+S.tax.creditPoints || 0, 2),
        text: cp < +S.tax.creditPoints ? `המעסיק מחשב את המס לפי ${U.num(cp, 2)} נקודות. אם מגיעות לך יותר (ילדים, תואר, שחרור מצבא), צריך למסור לו טופס 101 מעודכן. עד אז, הנטו באפליקציה יתאים לתלוש רק עם המספר שבתלוש.`
          : `המעסיק מחשב את המס לפי ${U.num(cp, 2)} נקודות, לפי טופס 101 שמסרת. עם המספר הזה הנטו באפליקציה יתאים לתלוש.`,
        apply: { kind: 'settings', path: 'tax.creditPoints', value: cp }, set: { kind: 'set', k: 'net', f: 'נקודות זיכוי' } });
    }

    /* the hourly rate: one job in the period, the payslip's rate for its regular hours */
    const roleIds = new Set();
    for (const r of E.shifts) for (const id of Object.keys(r.byRole || {})) roleIds.add(id);
    const aRate = E.hrs.base ? E.pay.base / E.hrs.base : 0;
    if (W.rate && aRate && roleIds.size === 1 && Math.abs(W.rate - aRate) > 0.02) {
      const id = [...roleIds][0];
      const role = model.ctx.roles && model.ctx.roles.get ? model.ctx.roles.get(id) : null;
      const higher = W.rate > aRate;
      add({ id: 'rate', label: 'תעריף לשעה' + (role && role.name ? ' · ' + role.name : ''), slip: U.money(W.rate), app: U.money(aRate), recommend: higher ? 'slip' : 'ask',
        text: higher ? `בתלוש התעריף גבוה מזה שבאפליקציה. אם קיבלת העלאה, אפשר לעדכן את התעריף מ-${U.fmtDate(P.from)}.`
          : `בתלוש התעריף נמוך מזה שהגדרת. אם התעריף שסוכם הוא ${U.money(aRate)}, ייתכן שיש פער על כל שעה. אם הוא ${U.money(W.rate)}, כדאי לעדכן.`,
        apply: role ? { kind: 'role', id, from: P.from, rate: r2(W.rate) } : null, set: { kind: 'set', k: 'roles', f: 'תעריף' } });
    }

    /* travel: the payslip's sum for a day, when the days are known */
    const sTravel = val(F, 'travel');
    const wd = val(F, 'workDays');
    const days = wd || (Math.abs(slipHours - E.t.hours) <= 0.25 ? E.t.workDays : 0);
    const per = +emp.travelPerDay || 0;
    if (sTravel > 0 && days > 0) {
      const sPer = sTravel / days;
      const capped = +emp.travelMonthlyCap && Math.abs(sTravel - +emp.travelMonthlyCap) <= 0.5;
      if (!capped && Math.abs(sPer - per) > 0.05 && sPer <= 60) {
        add({ id: 'travel', label: 'נסיעות ליום עבודה', slip: U.money(sPer), app: U.money(per),
          text: `בתלוש ${U.money(sTravel)} על ${U.num(days, 0)} ימי עבודה, כלומר ${U.money(sPer)} ליום. המעסיק משלם את מחיר הנסיעה בפועל עד התקרה, ולכן הסכום בתלוש הוא המדויק.`,
          apply: { kind: 'employer', patch: { travelPerDay: r2(sPer) } }, set: { kind: 'set', k: 'pay', f: 'סכום ליום עבודה ₪' } });
      }
    } else if (!sTravel && E.t.travel > 0) {
      add({ id: 'travelNone', label: 'נסיעות', slip: 'אין שורה', app: U.money(E.t.travel), recommend: 'ask',
        text: 'בתלוש לא זוהתה שורת נסיעות. אם המעסיק לא משלם נסיעות כי אין צורך בתחבורה (מגיעים ברגל, או שהמעסיק מסיע), אפשר לאפס אותן בהגדרות. אחרת, החזר נסיעות מגיע לפי צו ההרחבה.',
        set: { kind: 'set', k: 'pay', f: 'סכום ליום עבודה ₪' } });
    }

    /* seniority: a bonus the employer pays and the app does not count, or the other way round */
    const sSen = val(F, 'seniority') || 0;
    if (sSen > 0 && !emp.seniorityEnabled) {
      // the app pays seniority on every paid hour at its percent (an overtime hour at 125%...): the sum for an hour
      // is the one that gives the payslip's amount on this period's hours
      let weighted = 0;
      for (const r of E.shifts) for (const l of r.lines) weighted += l.hours * (+l.pct || 100) / 100;
      const perH = (weighted || slipHours) ? r2(sSen / (weighted || slipHours)) : 0;
      add({ id: 'seniority', label: 'תוספת ותק', slip: U.money(sSen), app: 'לא מוגדרת',
        text: perH ? `המעסיק משלם תוספת ותק, ${U.money(perH)} לשעה בממוצע. אפשר להוסיף אותה לחישוב כסכום קבוע לשעה.` : 'המעסיק משלם תוספת ותק, והיא לא מוגדרת באפליקציה.',
        apply: perH ? { kind: 'employer', patch: { seniorityEnabled: true, seniorityType: 'fixedPerHour', seniorityValue: perH, seniorityAfterMonths: 0 } } : null,
        set: { kind: 'set', k: 'calc', f: 'תוספת ותק' } });
    } else if (emp.seniorityEnabled && E.t.seniority > 0.5 && Math.abs(sSen - E.t.seniority) > 1) {
      add({ id: 'seniority', label: 'תוספת ותק', slip: sSen ? U.money(sSen) : 'אין שורה', app: U.money(E.t.seniority), recommend: 'ask',
        text: sSen ? 'תוספת הוותק בתלוש שונה מהחישוב. כדאי לבדוק בהגדרות את סוג התוספת, הסכום והחודש שממנו היא מתחילה.'
          : 'באפליקציה מוגדרת תוספת ותק, ובתלוש אין שורה כזו. האם ההסכם שלך כולל תוספת ותק?',
        set: { kind: 'set', k: 'calc', f: 'תוספת ותק' } });
    }
    if (!S.startDate) {
      add({ id: 'startDate', label: 'תאריך תחילת עבודה', slip: '—', app: 'לא הוזן', recommend: 'ask',
        text: 'הוותק נספר מתאריך תחילת העבודה, וממנו גם ימי החופשה, דמי ההבראה ומועד הפנסיה. בלי התאריך הבדיקות האלה לא מדויקות.',
        set: { kind: 'set', k: 'leave', f: 'תאריך תחילת עבודה' } });
    }

    /* pension: deposits the app does not expect yet, or a different rate or base */
    const pe = val(F, 'pensionEmployee');
    const minor = Engine.isMinor(S, P.to);
    if (S.pension.enabled && pe > 0 && !minor) {
      const active = Engine.pensionActive(S, P.to);
      if (!active) {
        add({ id: 'pensionStart', label: 'מועד תחילת הפנסיה', slip: U.money(pe), app: `אחרי ${S.pension.startAfterMonths} חודשים`,
          text: 'המעסיק כבר מפקיד לפנסיה, ובאפליקציה ההפרשה עוד לא התחילה. זה קורה כשהייתה לך קרן פנסיה פעילה לפני העבודה הזו: אז ההפקדות מגיעות מהיום הראשון.',
          apply: { kind: 'settings', path: 'pension.startAfterMonths', value: 0 }, set: { kind: 'set', k: 'leave', f: 'תאריך תחילת עבודה' } });
      } else {
        const pBase = slipPensionBase(F, S, E);
        const pct = pBase > 0 ? pe / pBase * 100 : 0;
        const setPct = +S.pension.employeePct || 0;
        if (pct > 0 && Math.abs(pct - setPct) > 0.3) {
          // the other way of counting the base may be the one the employer uses
          const other = S.pension.base === 'base' ? 'all' : 'base';
          const oBase = slipPensionBase(F, Object.assign({}, S, { pension: Object.assign({}, S.pension, { base: other }) }), E);
          const oPct = oBase > 0 ? pe / oBase * 100 : 0;
          const half = Math.round(pct * 2) / 2;
          if (oPct && Math.abs(oPct - setPct) <= 0.15) {
            add({ id: 'pensionPct', label: 'השכר לפנסיה', slip: `${U.num(oPct, 2)}%`, app: `${U.num(pct, 2)}%`,
              text: other === 'all' ? `המעסיק מפריש ${U.num(setPct, 2)}% מכל השכר (בלי נסיעות והבראה), לא רק מהשעות × התעריף.` : `המעסיק מפריש ${U.num(setPct, 2)}% מהשעות × התעריף, בלי התוספות.`,
              apply: { kind: 'settings', path: 'pension.base', value: other }, set: { kind: 'set', k: 'net', f: 'פנסיה חובה' } });
          } else if (Math.abs(pct - half) <= 0.15 && half >= 4 && half <= 8) {
            add({ id: 'pensionPct', label: 'אחוז הפרשת העובד לפנסיה', slip: `${U.num(half, 2)}%`, app: `${U.num(setPct, 2)}%`,
              text: `בתלוש ירדו ${U.money(pe)}, כלומר ${U.num(half, 2)}% מהשכר לפנסיה.`,
              apply: { kind: 'settings', path: 'pension.employeePct', value: half }, set: { kind: 'set', k: 'net', f: 'פנסיה חובה' } });
          } else {
            add({ id: 'pensionPct', label: 'אחוז הפרשת העובד לפנסיה', slip: `${U.num(pct, 2)}%`, app: `${U.num(setPct, 2)}%`, recommend: 'ask',
              text: `בתלוש ירדו ${U.money(pe)}, כלומר ${U.num(pct, 2)}% מהשכר שהאפליקציה מעריכה לפנסיה (${U.money(pBase)}). האחוז לא עגול, אז כנראה המעסיק מחשב את השכר לפנסיה אחרת. מה אחוז ההפרשה שלך לפי הקרן או ההסכם?`,
              set: { kind: 'set', k: 'net', f: 'פנסיה חובה' } });
          }
        }
      }
    }

    /* study fund */
    const he = val(F, 'hishtalmutEmployee');
    if (he > 0 && !(S.hishtalmut && S.hishtalmut.enabled)) {
      const pBase = slipPensionBase(F, S, E);
      const pct = pBase > 0 ? Math.round(he / pBase * 100 * 2) / 2 : 0;
      add({ id: 'hishtalmut', label: 'קרן השתלמות', slip: U.money(he), app: 'לא מוגדרת',
        text: 'בתלוש יורד חלק העובד לקרן השתלמות, והוא לא מוגדר באפליקציה, ולכן הנטו באפליקציה גבוה מהתלוש.',
        apply: { kind: 'settings', path: 'hishtalmut', value: Object.assign({}, S.hishtalmut, { enabled: true, employeePct: pct >= 1 && pct <= 5 ? pct : 2.5, startAfterMonths: 0 }) },
        set: { kind: 'set', k: 'net', f: 'קרן השתלמות' } });
    } else if (!he && S.hishtalmut && S.hishtalmut.enabled && E.net.hishtalmut > 0.5) {
      add({ id: 'hishtalmut', label: 'קרן השתלמות', slip: 'אין שורה', app: U.money(E.net.hishtalmut), recommend: 'ask',
        text: 'באפליקציה מוגדרת קרן השתלמות, ובתלוש לא זוהה ניכוי כזה. יש לך קרן השתלמות דרך העבודה?',
        set: { kind: 'set', k: 'net', f: 'קרן השתלמות' } });
    }

    /* the pay period: another first day makes the hours match exactly */
    if (slipHours > 0 && Math.abs(slipHours - E.t.hours) > 0.25) {
      const cur = +emp.periodStartDay || 1;
      for (const d of [1, 21, 26, 25, 20, 16, 15, 24, 11, 10]) {
        if (d === cur) continue;
        const P2 = Engine.periodByKey(slip.period, Object.assign({}, emp, { periodStartDay: d }));
        if (Math.abs(Engine.totals(model, P2.from, P2.to, { employerId: E.only }).hours - slipHours) <= 0.25) {
          add({ id: 'period', label: 'תחילת תקופת השכר', slip: d === 1 ? 'חודש קלנדרי' : `מה-${d} בחודש`, app: cur === 1 ? 'חודש קלנדרי' : `מה-${cur} בחודש`,
            text: 'עם תקופה שמתחילה ביום הזה, השעות בתלוש תואמות בדיוק לשעות שרשמת.',
            apply: { kind: 'employer', patch: { periodStartDay: d } }, set: { kind: 'set', k: 'pay', f: 'התקופה מתחילה ב-' } });
          break;
        }
      }
    }

    /* the leave balances: the employer's books are the official ones, the app can start from them */
    const L = Engine.leaveBalances(model, P.to);
    for (const [key, opening, label, entity] of [['vacationBalance', 'vacationOpening', 'יתרת ימי חופשה', 'vacation'], ['sickBalance', 'sickOpening', 'יתרת ימי מחלה', 'sick']]) {
      const v = val(F, key);
      if (v == null) continue;
      const appV = entity === 'vacation' ? L.vacationAccrued - L.vacationUsed : L.sickAccrued - L.sickUsed;
      if (Math.abs(v - appV) < 0.5) continue;
      const can = !!S.startDate;
      add({ id: key, label, slip: U.num(v, 2), app: U.num(appV, 2), recommend: can ? 'slip' : 'ask',
        text: can ? 'היתרה של המעסיק היא היתרה הרשמית. אפשר לעדכן את יתרת הפתיחה באפליקציה כך שהיתרה תהיה כמו בתלוש, והצבירה תמשיך ממנה.'
          : 'כדי שהאפליקציה תספור את הצבירה, צריך להזין קודם תאריך תחילת עבודה.',
        apply: can ? { kind: 'settings', path: 'leave.' + opening, value: r2((+S.leave[opening] || 0) + v - appV) } : null,
        set: { kind: 'set', k: 'leave', f: entity === 'vacation' ? 'יתרת פתיחה: חופשה' : 'תאריך תחילת עבודה' } });
    }
    return out;
  }

  /**
   * reconcile(slip, model, a?, c?) → { gross: { app, slip, total, items, rest }, net: { ... } | null, open, asks }.
   * Every item: { id, label, app, slip, diff (₪ the payslip is above the app: + more, − less), hours: { app, slip }
   * | null, state: 'match'|'clear'|'ask', text, ask (the question that would settle it, or ''), fixes: [fix],
   * parts: [{ label, amount, known }] | null }. The items of each side add up to its total exactly; 'rest' is the
   * part no line explains (an item of its own when it is not zero). c: the gap check (checkGap), whose reasons found
   * in the person's data say where a part comes from.
   */
  function reconcile(slip, model, a, c) {
    a = a || analyze(slip, model);
    const S = model.ctx.settings, F = (a && a.fields) || slip.fields || {}, E = a.expected, t = E.t, P = E.P;
    const emp = E.emp || model.ctx.primaryEmployer();
    const W = slipWork(F);
    const sc = settingsCheck(slip, model, a);
    const scFix = (id) => (sc.some((x) => x.id === id) ? [{ kind: 'sc', id }] : []);
    // the reason the gap check found in the person's data for a finding of this area ('yes'), and its fix
    const yesOf = (code) => {
      const it = c && c.items.find((x) => codeOf(x.area) === code);
      return (it && it.reasons.find((y) => y.found === 'yes')) || null;
    };
    const fixOfReason = (r) => (r.fix ? [r.fix] : []).concat(r.shifts && r.shifts.length ? [{ kind: 'shifts', ids: r.shifts }] : []);
    const items = [];
    const add = (o) => {
      const it = Object.assign({ app: 0, slip: 0, hours: null, state: 'clear', text: '', ask: '', fixes: [], parts: null }, o);
      it.diff = o.diff != null ? o.diff : (it.slip || 0) - (it.app || 0);
      // tol: a sum per hour rounded to agorot (a seniority bonus taken from the payslip) leaves a few agorot over
      if (Math.abs(it.diff) < (o.tol || 0.5) && it.state !== 'info') { it.state = 'match'; it.ask = ''; }
      delete it.tol;
      items.push(it);
      return it;
    };

    /* 1-2. regular hours and the rate: (hours on the slip − in the app) × the app's rate, then the rate on the
     * payslip's hours. The two add up to the base line's gap exactly. */
    const aRate = E.hrs.base ? E.pay.base / E.hrs.base : 0;
    const slipHours = slipHoursOf(F);
    const totalSame = slipHours > 0 && Math.abs(slipHours - t.hours) <= 0.25;
    if (W.base != null && W.baseQ) {
      const rate = aRate || W.rate;
      const hoursAmt = (W.baseQ - E.hrs.base) * rate;
      const h = add({ id: 'hours', label: 'שעות רגילות', app: E.pay.base, slip: E.pay.base + hoursAmt, diff: hoursAmt, hours: { app: E.hrs.base, slip: W.baseQ } });
      const dh = W.baseQ - E.hrs.base;
      if (h.state !== 'match') {
        const r = yesOf('hours') || (totalSame ? yesOf('ot') : null);
        if (totalSame) {
          h.text = `סך השעות זהה (${U.hours(slipHours)}), אבל המעסיק מחלק אחרת בין שעות רגילות לשעות נוספות.` + (r ? ' ' + r.text : '');
          h.fixes = r ? fixOfReason(r) : [{ kind: 'set', k: 'calc', f: 'שעות רגילות ביום' }];
          if (!r) { h.state = 'ask'; h.ask = 'המעסיק סופר שעות נוספות רק מעל 8.6 שעות ביום, או מעל מספר אחר?'; }
        } else if (r) {
          h.text = r.title + ': ' + r.text;
          h.fixes = fixOfReason(r).concat(scFix('period'));
        } else if (dh < 0) {
          h.state = 'ask';
          h.text = `בתלוש ${U.hours(W.baseQ)} שעות רגילות, ובאפליקציה ${U.hours(E.hrs.base)}. לא מצאנו בנתונים שלך סיבה לזה.`;
          h.ask = 'עבדת בכל המשמרות שרשמת בתקופה, בשעות שרשמת? אם כן, זה כסף שחסר, והוא מופיע במכתב למעסיק.';
          h.fixes = scFix('period');
        } else {
          h.state = 'ask';
          h.text = `בתלוש ${U.hours(W.baseQ)} שעות רגילות, יותר מ-${U.hours(E.hrs.base)} שרשמת.`;
          h.ask = 'עבדת בתקופה משמרת שלא רשמת, או קיבלת על ימי חופשה או מחלה תשלום בשעות?';
          h.fixes = [{ kind: 'shift' }].concat(scFix('period'));
        }
      }
      const rateAmt = W.base - E.pay.base - hoursAmt;
      const rt = add({ id: 'rate', label: 'התעריף לשעה', app: aRate, slip: W.rate, diff: rateAmt });
      if (rt.state !== 'match') {
        const r = yesOf('rate');
        rt.text = `בתלוש ${U.money(W.rate)} לשעה, ובאפליקציה ${U.money(aRate)}, על ${U.hours(W.baseQ)} שעות רגילות.` + (r ? ' ' + r.text : '');
        rt.fixes = (r ? fixOfReason(r) : []).concat(scFix('rate'));
        if (!r) { rt.state = 'ask'; rt.ask = `מה התעריף שסוכם איתך: ${U.money(W.rate)} או ${U.money(aRate)}?`; }
      }
    } else {
      const b = add({ id: 'base', label: 'שכר על שעות רגילות', app: E.pay.base, slip: W.base || 0, hours: { app: E.hrs.base, slip: null } });
      if (b.state !== 'match') {
        b.state = 'ask';
        b.text = W.base == null ? 'לא נקראה מהתלוש שורת שכר יסוד או שעות רגילות.' : 'ליד שכר היסוד בתלוש אין מספר שעות, ולכן אי אפשר להפריד בין השעות לתעריף.';
        b.ask = W.base == null ? 'יש בתלוש שורת שכר יסוד? אם כן, כדאי להוסיף אותה בנתוני התלוש.' : 'כמה שעות רגילות כתובות בתלוש?';
        b.fixes = [{ kind: 'verify', key: 'base' }];
      }
    }

    /* 3. overtime, 4. Shabbat and holidays */
    for (const [id, keys, label, code, appPay, appHrs, setF] of [
      ['ot', OT_KEYS, 'שעות נוספות', 'ot', E.pay.ot125 + E.pay.ot150, E.hrs.ot125 + E.hrs.ot150, 'שעות רגילות ביום'],
      ['rest', REST_KEYS, 'שבת וחג', 'rest', E.pay.rest150 + E.pay.rest175 + E.pay.rest200, E.hrs.rest150 + E.hrs.rest175 + E.hrs.rest200, ''],
    ]) {
      const sv = sumOf(W.lines, keys), sq = sumOf(W.lines, keys, 'qty');
      if (!sv && !appPay) continue;
      const it = add({ id, label, app: appPay, slip: sv, hours: { app: appHrs, slip: sq } });
      if (it.state === 'match') continue;
      // the reason of this area, or the hours' reason when its shifts (say the last ones of the period, paid on the
      // next payslip) hold exactly the hours of this kind that are missing
      let r = yesOf(code);
      const rh = r ? null : yesOf('hours');
      if (rh && rh.shifts && rh.shifts.length) {
        const ids = new Set(rh.shifts);
        const inThem = E.shifts.filter((x) => ids.has(x.id)).reduce((s, x) => s + (id === 'ot' ? x.hoursBy.ot1 + x.hoursBy.ot2 : x.restHours), 0);
        if (inThem > 0 && Math.abs(inThem - (appHrs - sq)) <= 0.25) r = rh;
      }
      if (r) { it.text = r.title + ': ' + r.text; it.fixes = fixOfReason(r); continue; }
      it.state = 'ask';
      if (Math.abs(sq - appHrs) <= 0.25 && sq > 0) {
        it.text = `אותן ${U.hours(sq)} שעות, סכום אחר: בתלוש ${U.money(sv / sq)} לשעה, ובאפליקציה ${U.money(appPay / appHrs)}.`;
        it.ask = id === 'ot' ? 'באיזה אחוז המעסיק משלם על שעות נוספות: 125% ו-150%, או אחר?' : 'באיזה אחוז המעסיק משלם על שעות בשבת ובחג?';
        it.fixes = [{ kind: 'set', k: 'calc', f: id === 'ot' ? 'אחוז דרגה 1' : 'שבת/חג %' }];
      } else {
        it.text = `בתלוש ${U.hours(sq)} שעות, ובאפליקציה ${U.hours(appHrs)}.`;
        it.ask = id === 'ot' ? 'המעסיק סופר שעות נוספות לפי החוק (מעל 8.6 שעות ביום או 42 בשבוע) או לפי מספר אחר?'
          : (S.rest.mode === 'city' ? 'המעסיק סופר את השבת לפי זמני כניסת השבת בעיר, או משעה קבועה?' : 'מאיזו שעה המעסיק סופר את השבת והחג?');
        it.fixes = [{ kind: 'set', k: id === 'ot' ? 'calc' : 'rest', f: setF }];
      }
    }

    /* 5. night */
    const sNight = val(F, 'night') || 0;
    if (sNight || t.nightPremium) {
      const it = add({ id: 'night', label: 'תוספת לילה', app: t.nightPremium, slip: sNight });
      if (it.state !== 'match') {
        it.state = 'ask';
        it.text = !emp.nightEnabled ? 'המעסיק משלם תוספת לילה, והיא לא מוגדרת באפליקציה.'
          : !sNight ? 'באפליקציה מוגדרת תוספת לילה, ובתלוש אין שורה כזו. תוספת לילה לא חובה בחוק לכל העובדים, היא לפי ההסכם.'
            : 'תוספת הלילה בתלוש שונה מהחישוב.';
        it.ask = !emp.nightEnabled ? 'מה תוספת הלילה אצלך: אחוז מהתעריף או סכום לשעה, ומאיזו שעה?' : 'ההסכם שלך כולל תוספת לילה? באיזה גובה?';
        it.fixes = [{ kind: 'set', k: 'calc', f: 'תוספת לילה' }];
      }
    }

    /* 6. seniority */
    const sSen = val(F, 'seniority') || 0;
    if (sSen || t.seniority) {
      const it = add({ id: 'seniority', label: 'תוספת ותק', app: t.seniority, slip: sSen, tol: Math.max(0.5, t.hours * 0.01) });
      if (it.state !== 'match') {
        const s = sc.find((x) => x.id === 'seniority');
        it.text = s ? s.text : 'תוספת הוותק בתלוש שונה מהחישוב.';
        it.fixes = scFix('seniority');
        if (!s || s.recommend === 'ask') { it.state = 'ask'; it.ask = 'מה תוספת הוותק לפי ההסכם שלך, וממתי היא משולמת?'; }
        if (!it.fixes.length) it.fixes = [{ kind: 'set', k: 'calc', f: 'תוספת ותק' }];
      }
    }

    /* 7. what only the app adds: eve premium, the minimum shift, amounts set by hand, a special rate */
    const appExtra = t.evePremium + t.minTopUp + t.adjust + t.specialPremium;
    if (appExtra) { // even a few agorot: the items add up to the whole gap
      const what = [[t.evePremium, 'תוספת ערב שבת/חג'], [t.minTopUp, 'השלמה למינימום שעות במשמרת'], [t.adjust, 'סכומים שהזנת ידנית'], [t.specialPremium, 'תעריף מיוחד']]
        .filter((x) => Math.abs(x[0]) >= 0.5).map((x) => `${x[1]} ${U.money(x[0])}`).join(', ');
      add({ id: 'extras', label: 'תוספות שרק באפליקציה', app: appExtra, slip: 0, state: 'ask',
        text: `באפליקציה: ${what}. בתלוש לא זוהתה שורה בשבילן.`, ask: 'המעסיק משלם את התוספות האלה? אם לא, כדאי לכבות אותן בהגדרות או במשמרת.',
        fixes: [{ kind: 'set', k: 'calc', f: '' }] });
    }

    /* 8. travel */
    const sTravel = val(F, 'travel') || 0;
    if (sTravel || t.travel) {
      const it = add({ id: 'travel', label: 'נסיעות', app: t.travel, slip: sTravel });
      if (it.state !== 'match') {
        const r = yesOf('travel');
        const s = sc.find((x) => x.id === 'travel' || x.id === 'travelNone');
        if (r) { it.text = r.title + ': ' + r.text; it.fixes = fixOfReason(r).concat(scFix('travel')); }
        else if (s && s.recommend === 'slip') { it.text = s.text; it.fixes = scFix(s.id); }
        else {
          it.state = 'ask';
          it.text = `באפליקציה ${t.workDays} ימי עבודה × ${U.money(+emp.travelPerDay || 0)}` + (val(F, 'workDays') ? `, ובתלוש ${U.num(val(F, 'workDays'), 0)} ימים.` : '.');
          it.ask = sTravel ? 'כמה עולה לך הנסיעה לעבודה ביום, הלוך וחזור?' : 'המעסיק משלם לך נסיעות? אם כן, באיזו שורה בתלוש?';
          it.fixes = s ? scFix(s.id) : [{ kind: 'set', k: 'pay', f: 'סכום ליום עבודה ₪' }];
        }
      }
    }

    /* 9. vacation and sick pay */
    const sLeave = (val(F, 'vacationPay') || 0) + (val(F, 'sickPay') || 0);
    if (sLeave || t.leavePay) {
      const it = add({ id: 'leave', label: 'דמי חופשה ומחלה', app: t.leavePay, slip: sLeave });
      if (it.state !== 'match') {
        it.state = 'ask';
        const daysTxt = `באפליקציה רשומים בתקופה ${t.vacationDays} ימי חופשה ו-${t.sickDays} ימי מחלה.`;
        if (sLeave && !t.leavePay) {
          it.text = 'בתלוש יש תשלום על חופשה או מחלה. ' + daysTxt;
          it.ask = 'לקחת בתקופה ימי חופשה או מחלה? אם כן, אפשר לרשום אותם, והחישוב יכלול אותם.';
          it.fixes = [{ kind: 'entry', entry: 'vacation', date: P.from }, { kind: 'entry', entry: 'sick', date: P.from }];
        } else if (!sLeave) {
          it.text = daysTxt + ' בתלוש לא זוהה עליהם תשלום.';
          it.ask = 'ימי מחלה: היום הראשון לא משולם, הימים 2 ו-3 ב-50%. האם המעסיק שילם עליהם בשורה אחרת?';
          it.fixes = [{ kind: 'verify', key: 'vacationPay' }];
        } else {
          it.text = daysTxt + ' הסכום ליום אצל המעסיק שונה מההערכה.';
          it.ask = 'כמה ימים המעסיק רשם בתלוש, ומה השכר היומי?';
          it.fixes = [{ kind: 'set', k: 'leave', f: '' }];
        }
      }
    }

    /* 10-13. lines the app does not count in a month's pay: holiday pay, recuperation, past corrections, bonuses */
    const sHol = val(F, 'holidayPay') || 0;
    if (sHol) add({ id: 'holiday', label: 'דמי חגים', app: 0, slip: sHol, text: 'האפליקציה לא מחשבת דמי חגים בברוטו. זה תשלום על חג שחל ביום חול ולא עבדת בו, לעובד שעתי אחרי 3 חודשי עבודה.' });
    const sRec = val(F, 'recuperation') || 0;
    if (sRec) {
      const L = Engine.leaveBalances(model, P.to);
      add({ id: 'recuperation', label: 'דמי הבראה', app: 0, slip: sRec,
        text: 'דמי הבראה לא נכללים בחישוב החודשי של האפליקציה.' + (L.recuperation && L.recuperation.eligible ? ` לפי הוותק והיקף המשרה מגיעים לך בערך ${U.money(L.recuperation.amount)} לשנה.` : '') });
    }
    const sDiff = val(F, 'diff') || 0;
    if (sDiff) add({ id: 'diff', label: 'הפרשים ותיקונים', app: 0, slip: sDiff, text: 'תיקון על חודש קודם. הוא לא חלק מהמשמרות של התקופה הזו, ולכן אינו באפליקציה.' });
    const sBonus = val(F, 'bonus') || 0;
    const aBonus = t.bonus + t.additions;
    if (sBonus || aBonus) {
      const it = add({ id: 'bonus', label: 'בונוסים ותוספות', app: aBonus, slip: sBonus });
      if (it.state !== 'match') {
        it.state = 'ask';
        it.text = !aBonus ? `בתלוש ${U.money(sBonus)} בונוס או מענק, ובאפליקציה לא רשום בונוס בתקופה.` : !sBonus ? `רשמת בתקופה בונוסים ותוספות של ${U.money(aBonus)}, ובתלוש לא זוהתה שורה כזו.` : 'הבונוס בתלוש שונה ממה שרשמת.';
        it.ask = !aBonus ? 'אפשר לרשום את הבונוס כתוספת באפליקציה. לרשום אותו?' : 'המעסיק שילם את התוספות האלה בתלוש הזה, או ישלם בתלוש אחר?';
        it.fixes = !aBonus ? [{ kind: 'entry', entry: 'adjustment', date: P.to }] : [];
      }
    }
    const sOther = otherSum(slip, 'otherPay');
    if (sOther) add({ id: 'otherPay', label: 'תשלומים אחרים', app: 0, slip: sOther, text: 'שורות שסימנת בתלוש כתשלום אחר. האפליקציה לא יודעת מה הן, ולכן אינן בחישוב.' });

    /* what is left: the payslip's gross against the lines that were read */
    const appGross = items.reduce((s, x) => s + (x.id === 'rate' ? 0 : +x.app || 0), 0);
    const slipLines = appGross + items.reduce((s, x) => s + x.diff, 0);
    const sGross = val(F, 'gross') != null ? val(F, 'gross') : slipLines;
    const restG = sGross - slipLines;
    const unnamed = unnamedOf(slip);
    if (Math.abs(restG) >= 0.5) {
      // lines the app has and the payslip shows no line for, whose sum is this amount: the gross probably holds them
      const lone = items.filter((x) => x.app > 0 && !x.slip && x.id !== 'rate').slice(0, 8);
      let twins = null;
      for (let mask = 1; mask < (1 << lone.length) && !twins; mask++) {
        const pick = lone.filter((_, i) => mask & (1 << i));
        const s = pick.reduce((t, x) => t + x.app, 0);
        if (Math.abs(s - restG) <= Math.max(1, s * 0.01)) twins = pick;
      }
      const names = twins ? twins.map((x) => '"' + x.label + '"').join(', ') : '';
      // one answer settles them together with this line: their sum is not counted twice in what is still open
      if (twins) for (const x of twins) x.twin = true;
      const m = U.money(Math.abs(restG));
      add({ id: 'unexplained', label: 'לא מוסבר', app: 0, slip: restG, state: 'ask',
        text: (unnamed.length ? `הברוטו בתלוש שונה בעוד ${m} מסכום השורות שזיהינו.` + ' ' + (unnamed.length === 1 ? 'יש בתלוש שורה אחת שלא זיהינו, וייתכן שהיא ההפרש.' : `יש בתלוש ${unnamed.length} שורות שלא זיהינו, וייתכן שהן ההפרש.`)
          : `הברוטו בתלוש שונה בעוד ${m} מסכום השורות שנקראו. ייתכן ששורה לא נקראה או נקראה לא נכון.`)
          + (!twins ? '' : ' ' + (twins.length === 1 ? `הסכום הזה שווה לשורה "${twins[0].label}" למעלה, שלא זוהתה בתלוש. ייתכן שהיא כלולה בברוטו בשם אחר.`
            : `הסכום הזה שווה לשורות ${names} למעלה, שלא זוהו בתלוש. ייתכן שהן כלולות בברוטו בשמות אחרים.`)),
        ask: unnamed.length ? 'מה השורות שלא זיהינו? אפשר לסמן כל אחת, והפער יוסבר.' : 'הברוטו ושורות התשלום בנתוני התלוש כתובים כמו בתלוש?',
        fixes: unnamed.length ? [{ kind: 'label' }] : [{ kind: 'verify', key: 'gross' }] });
    }
    const gross = { app: appGross, slip: sGross, total: sGross - appGross, items, rest: restG, override: '' };
    // shifts with a manual override in the period: the app's gross without them, when it is closer to the payslip
    if (a.overridesInPeriod && a.auto && Math.abs(a.auto.t.gross - t.gross) >= 1) {
      const n = a.overridesInPeriod, autoG = a.auto.t.gross;
      gross.override = Math.abs(sGross - autoG) <= Math.abs(sGross - t.gross)
        ? `${n} משמרות בתקופה כוללות עקיפה ידנית. בלי העקיפות האפליקציה הייתה מחשבת ${U.money(autoG)} ברוטו, קרוב יותר לתלוש, כך שהפער נובע כנראה מהעקיפה.`
        : `${n} משמרות בתקופה כוללות עקיפה ידנית. בלי העקיפות האפליקציה הייתה מחשבת ${U.money(autoG)} ברוטו.`;
    }

    /* the net: the gross gap, then each deduction (its part on the net), then what is left */
    let net = null;
    const sNet = val(F, 'net');
    if (sNet != null) {
      const N = E.net;
      const nItems = [];
      const nAdd = (o) => {
        const it = Object.assign({ hours: null, state: 'clear', text: '', ask: '', fixes: [], parts: null }, o);
        if (Math.abs(it.diff) < 0.5 && it.state !== 'info') { it.state = 'match'; it.ask = ''; }
        nItems.push(it);
        return it;
      };
      nAdd({ id: 'gross', label: 'הפרש בברוטו', app: N.gross, slip: sGross, diff: gross.total, text: 'הפירוט בשורות הברוטו למעלה.', state: 'info' });
      // the employer's deductions estimated on the payslip's own gross, then with its credit points: what is left
      // of each deduction after that is what the settings cannot explain
      const pe = val(F, 'pensionEmployee');
      const pBase = pe > 0 && +S.pension.employeePct ? pe / (+S.pension.employeePct / 100) : (appGross > 0 ? Engine.pensionBaseOf(t, S) * sGross / appGross : sGross);
      const est = (cpts) => Engine.netEstimate({ gross: sGross, pensionBase: pBase, pensionActive: pe > 0 ? true : undefined, deductions: 0, periodTo: P.to },
        cpts == null ? S : Object.assign({}, S, { tax: Object.assign({}, S.tax, { creditPoints: cpts }) }));
      const T1 = est(null);
      const cp = val(F, 'creditPoints');
      const T2 = cp != null && Math.abs(cp - (+S.tax.creditPoints || 0)) >= 0.01 ? est(cp) : T1;
      // a deduction's line: its part on the net is minus what the payslip deducts more
      const ded = (o) => {
        const parts = o.parts.filter((p) => Math.abs(p.amount) >= 0.5);
        return nAdd(Object.assign(o, { diff: -((o.slip || 0) - (o.app || 0)), parts: parts.length > 1 ? parts : null }));
      };
      const sTax = val(F, 'incomeTax') || 0;
      const tax = ded({ id: 'tax', label: 'מס הכנסה', app: N.incomeTax, slip: sTax, parts: [
        { label: 'בגלל הברוטו', amount: -(T1.incomeTax - N.incomeTax), known: true },
        { label: 'בגלל נקודות הזיכוי', amount: -(T2.incomeTax - T1.incomeTax), known: true },
        { label: 'לא מוסבר', amount: -(sTax - T2.incomeTax), known: false }] });
      const taxLeft = sTax - T2.incomeTax;
      if (tax.state !== 'match') {
        if (Math.abs(taxLeft) < Math.max(5, T2.incomeTax * 0.03)) {
          tax.text = Math.abs(T2.incomeTax - T1.incomeTax) >= 0.5 ? 'ההפרש נובע מהברוטו ומנקודות הזיכוי בתלוש.' : 'ההפרש נובע מההפרש בברוטו: המס עולה ויורד עם השכר.';
          tax.fixes = scFix('creditPoints');
        } else if (taxLeft > 0) {
          tax.state = 'ask';
          tax.text = `המעסיק ניכה ${U.money(taxLeft)} יותר ממה שהמדרגות ונקודות הזיכוי נותנות. זה קורה בעבודה אצל יותר ממעסיק אחד בלי תיאום מס, כשלא נמסר טופס 101, או בתיקון מס שנתי.`;
          tax.ask = 'עבדת בתקופה גם אצל מעסיק אחר, או שלא מסרת למעסיק טופס 101?';
          tax.fixes = [{ kind: 'set', k: 'net', f: 'נקודות זיכוי' }];
        } else {
          tax.state = 'ask';
          tax.text = `המעסיק ניכה ${U.money(-taxLeft)} פחות ממה שהמדרגות ונקודות הזיכוי שבהגדרות נותנות. ייתכן שיש לך זיכויים נוספים, למשל על ילדים, תואר, שחרור מצבא או יישוב מזכה.`;
          tax.ask = 'יש לך נקודות זיכוי או הקלות מס שלא מופיעות בהגדרות?';
          tax.fixes = scFix('creditPoints').length ? scFix('creditPoints') : [{ kind: 'set', k: 'net', f: 'נקודות זיכוי' }];
        }
      }
      const sNi = (val(F, 'nationalInsurance') || 0) + (val(F, 'healthTax') || 0);
      const aNi = N.bl + N.health, eNi = T1.bl + T1.health;
      const ni = ded({ id: 'ni', label: 'ביטוח לאומי ומס בריאות', app: aNi, slip: sNi, parts: [
        { label: 'בגלל הברוטו', amount: -(eNi - aNi), known: true },
        { label: 'לא מוסבר', amount: -(sNi - eNi), known: false }] });
      if (ni.state !== 'match') {
        if (Math.abs(sNi - eNi) < Math.max(5, eNi * 0.05)) ni.text = 'ההפרש נובע מההפרש בברוטו.';
        else {
          ni.state = 'ask';
          ni.text = `אחרי ההפרש בברוטו נשארו ${U.money(Math.abs(sNi - eNi))} שהשיעורים הרגילים לא מסבירים. השיעור תלוי בגיל ובמעמד (למשל מתחת לגיל 18, או מגיל פרישה), ולפעמים המעסיק מחשב על רכיבים שלא בברוטו, כמו שווי.`;
          ni.ask = S.birthDate ? 'יש בתלוש רכיב של שווי (רכב, טלפון, ארוחות) שנוסף לשכר לצורך מס?' : 'מה תאריך הלידה שלך? השיעור תלוי בגיל.';
          ni.fixes = S.birthDate ? [{ kind: 'verify', key: 'nationalInsurance' }] : [{ kind: 'set', k: 'personal', f: 'תאריך לידה (לא חובה)' }];
        }
      }
      const sPe = pe || 0;
      const pen = ded({ id: 'pension', label: 'פנסיה (חלק העובד)', app: N.pensionEmployee, slip: sPe, parts: [
        { label: 'בגלל השכר לפנסיה', amount: -(T1.pensionEmployee - N.pensionEmployee), known: true },
        { label: 'לא מוסבר', amount: -(sPe - T1.pensionEmployee), known: false }] });
      if (pen.state !== 'match') {
        const s = sc.find((x) => x.id === 'pensionStart' || x.id === 'pensionPct');
        if (!sPe) {
          pen.state = 'ask';
          pen.text = 'בתלוש לא זוהה ניכוי לפנסיה, ובאפליקציה ההפרשה כבר התחילה.';
          pen.ask = 'מתי התחלת לעבוד אצל המעסיק, והייתה לך קרן פנסיה פעילה לפני כן?';
          pen.fixes = [{ kind: 'set', k: 'leave', f: 'תאריך תחילת עבודה' }];
        } else if (s) { pen.text = s.text; pen.fixes = scFix(s.id); if (s.recommend === 'ask') { pen.state = 'ask'; pen.ask = 'מה אחוז ההפרשה שלך לפי הקרן או ההסכם?'; } }
        else pen.text = 'ההפרש נובע מההפרש בשכר שממנו מפרישים לפנסיה.';
      }
      const sHe = val(F, 'hishtalmutEmployee') || 0;
      if (sHe || N.hishtalmut) {
        const h = ded({ id: 'hishtalmut', label: 'קרן השתלמות', app: N.hishtalmut, slip: sHe, parts: [{ label: '', amount: -(sHe - N.hishtalmut), known: false }] });
        if (h.state !== 'match') {
          const s = sc.find((x) => x.id === 'hishtalmut');
          h.text = s ? s.text : 'ההפרשה לקרן ההשתלמות בתלוש שונה מההגדרות.';
          h.fixes = s ? scFix('hishtalmut') : [{ kind: 'set', k: 'net', f: 'קרן השתלמות' }];
          if (!s || s.recommend === 'ask') { h.state = 'ask'; h.ask = 'מה אחוז ההפרשה שלך לקרן ההשתלמות?'; }
        }
      }
      const sOd = otherSum(slip, 'otherDed');
      if (sOd || t.deductions) {
        const o = ded({ id: 'otherDed', label: 'ניכויים אחרים', app: t.deductions, slip: sOd, parts: [{ label: '', amount: -(sOd - t.deductions), known: false }] });
        if (o.state !== 'match') {
          o.state = 'ask';
          o.text = sOd > t.deductions ? 'בתלוש יש ניכויים שלא רשמת באפליקציה, למשל ארוחות, ועד עובדים או הלוואה. ניכוי מהשכר מותר לפי חוק או בהסכמה שלך בכתב.' : 'רשמת ניכויים שלא זוהו בתלוש.';
          o.ask = sOd > t.deductions ? 'הסכמת בכתב לניכויים האלה? אם כן, אפשר לרשום אותם כניכוי באפליקציה.' : 'המעסיק ניכה אותם בתלוש הזה, בשורה אחרת?';
          o.fixes = sOd > t.deductions ? [{ kind: 'entry', entry: 'deduction', date: P.to }] : [];
        }
      }
      // what is left: the payslip's net against its gross minus the deductions that were read
      const readDed = sTax + sNi + sPe + sHe + sOd;
      const restN = sNet - (sGross - readDed);
      if (Math.abs(restN) >= 0.5) {
        const td = val(F, 'totalDeductions');
        const unread = td != null && Math.abs(td - readDed) >= 0.5;
        nAdd({ id: 'unexplained', label: 'לא מוסבר', app: 0, slip: restN, diff: restN, state: 'ask',
          text: unread ? `סך הניכויים בתלוש ${U.money(td)}, והניכויים שנקראו ${U.money(readDed)}. יש ניכוי שלא זוהה.` : `הנטו בתלוש שונה ב-${U.money(Math.abs(restN))} מהברוטו פחות הניכויים שנקראו.`,
          ask: unnamed.length ? 'מה השורות שלא זיהינו בתלוש? אפשר לסמן כל אחת.' : 'הנטו והניכויים בנתוני התלוש כתובים כמו בתלוש?',
          fixes: unnamed.length ? [{ kind: 'label' }] : [{ kind: 'verify', key: 'net' }] });
      }
      const appNet = N.net;
      net = { app: appNet, slip: sNet, total: sNet - appNet, items: nItems, rest: restN };
    }
    const all = gross.items.concat(net ? net.items : []);
    const open = all.filter((x) => x.state === 'ask' && !x.twin).reduce((s, x) => s + Math.abs(x.diff), 0);
    return { gross, net, settings: sc, open, asks: all.filter((x) => x.state === 'ask').length, exact: all.every((x) => x.state !== 'ask') };
  }

  /** Waterfall steps gross → net. */
  function waterfall(F) {
    const g = val(F, 'gross');
    if (!g) return null;
    const steps = [{ label: 'ברוטו', value: g, type: 'total' }];
    const items = [['incomeTax', 'מס הכנסה'], ['nationalInsurance', 'ביטוח לאומי'], ['healthTax', 'מס בריאות'], ['pensionEmployee', 'פנסיה'], ['hishtalmutEmployee', 'השתלמות']];
    let known = 0;
    for (const [k, l] of items) { const v = val(F, k); if (v) { steps.push({ label: l, value: -Math.abs(v), type: 'neg' }); known += Math.abs(v); } }
    const net = val(F, 'net');
    if (net != null) {
      const other = g - known - net;
      if (Math.abs(other) > 1) steps.push({ label: 'ניכויים אחרים', value: -other, type: 'neg' });
      steps.push({ label: 'נטו', value: net, type: 'total' });
    }
    return steps;
  }

  /** Line-by-line plain explanations. The only change against the previous payslip is a leave balance's (compareSlips). */
  function explainLines(F, prevF) {
    const out = [];
    const deltas = compareSlips(prevF, F);
    for (const f of FIELDS) {
      const v = val(F, f.key);
      if (v == null) continue;
      const d = deltas.find((x) => x.key === f.key);
      const change = d && Math.abs(d.delta) >= 0.005 ? d.text : null;
      const printed = printedTerm(F[f.key] && F[f.key].line);
      out.push({ key: f.key, label: f.label, kind: f.kind, kindLabel: KIND_LABEL[f.kind], value: v, qty: qty(F, f.key),
        explain: EXPLAIN[f.key] || '', meaning: MEANING[f.key] || '', meaningHe: MEANING_HE[f.key] || '', heTerm: HE_TERM[f.key] || '',
        printed: printed && printed !== HE_TERM[f.key] ? printed : '', change });
    }
    return out;
  }
  /**
   * The payslip lines the reader could not name (slip.other), for the translator: each with its original text, its
   * amount, its index in slip.other and what the person said it is (guess: 'otherPay' / 'otherDed', or null).
   * A line already turned into a known field (guess = a field key present in F) is left out: it shows as that field.
   */
  /**
   * The lines the person named on the verify screen (other[].guess a field key) go into the fields. A line named after
   * a payment, deduction or employer field the slip already has is added to it (a second pension fund): it was
   * dropped, and then hidden everywhere because a named line of an existing field is not shown (deep review, Nov
   * 2026). Runs again safely: a line already in the field is not added twice. Changes fields in place.
   */
  function addNamedLines(fields, other) {
    for (const o of other || []) {
      const f = o && typeof o.guess === 'string' && own(FIELD, o.guess) ? FIELD[o.guess] : null;
      if (!f) continue;
      const cur = fields[o.guess];
      if (!cur) { fields[o.guess] = { value: Math.abs(+o.value || 0), line: o.line }; continue; }
      // (a field the reader asked for, value null, has a line it could not read: a named line added to it is a part of
      // the sum shown as the whole, round 2. It stays asked for)
      if (cur.value == null) continue;
      if (!['pay', 'ded', 'emp'].includes(f.kind) || String(cur.line || '').split(' | ').includes(o.line)) continue;
      cur.value = (+cur.value || 0) + Math.abs(+o.value || 0);
      cur.line = (cur.line || '') + ' | ' + o.line;
    }
    return fields;
  }
  function unknownLines(other, F) {
    F = F || {};
    const out = [];
    (other || []).forEach((o, i) => {
      if (!o || FIELD[o.guess] && F[o.guess]) return;
      const g = o.guess === 'otherPay' || o.guess === 'otherDed' ? o.guess : null;
      out.push({ index: i, line: String(o.line || ''), value: +o.value || 0, guess: g,
        kind: g === 'otherPay' ? 'pay' : g === 'otherDed' ? 'ded' : null, kindLabel: g === 'otherPay' ? KIND_LABEL.pay : g === 'otherDed' ? KIND_LABEL.ded : '',
        heTerm: g ? HE_TERM[g] : '' });
    });
    return out;
  }
  /**
   * The person names an unrecognised line (slip.other[index]) from the translator. key: a field key, or
   * 'otherPay' / 'otherDed'. Returns a new slip (fields and other copied, never the stored record's own objects):
   * a field key the slip does not have yet takes the line's amount and text.
   */
  function labelOther(slip, index, key) {
    const s = Object.assign({}, slip, { fields: Object.assign({}, slip.fields), other: (slip.other || []).map((o) => Object.assign({}, o)) });
    const o = s.other[index];
    if (!o) return s;
    if (FIELD[key]) {
      if (s.fields[key]) return s; // already on the slip: keep what was verified
      s.fields[key] = { value: Math.abs(+o.value || 0), line: o.line };
      o.guess = key;
    } else if (key === 'otherPay' || key === 'otherDed') o.guess = key;
    return s;
  }

  /**
   * The one thing a payslip is compared with the payslip before it on: the vacation and sick-day balances, up or
   * down. Every other line is checked against the app's own calculation (reconcile), never against another payslip.
   * → [{ type: 'vacation'|'sick', key, label, prev, now, delta, used, text }]. a (optional): the analysis, for the
   * days recorded in the period.
   */
  function compareSlips(prevF, F, a) {
    const out = [];
    if (!prevF || !F) return out;
    for (const [key, type] of [['vacationBalance', 'vacation'], ['sickBalance', 'sick']]) {
      const now = val(F, key), prev = val(prevF, key);
      if (now == null || prev == null) continue;
      const delta = now - prev;
      const used = a && a.expected ? (type === 'vacation' ? a.expected.t.vacationDays : a.expected.t.sickDays) : null;
      const n = U.num(Math.abs(delta), 2), from = U.num(prev, 2), to = U.num(now, 2);
      let text = Math.abs(delta) < 0.005 ? `לא השתנתה מהתלוש הקודם: ${to} ימים.`
        : delta > 0 ? `עלתה ב-${n} ימים מהתלוש הקודם, מ-${from} ל-${to}.` : `ירדה ב-${n} ימים מהתלוש הקודם, מ-${from} ל-${to}.`;
      if (used === 1) text += type === 'vacation' ? ' בתקופה רשמת יום חופשה אחד.' : ' בתקופה רשמת יום מחלה אחד.';
      else if (used) text += type === 'vacation' ? ` בתקופה רשמת ${used} ימי חופשה.` : ` בתקופה רשמת ${used} ימי מחלה.`;
      out.push({ type, key, label: FIELD[key].label, prev, now, delta, used, text });
    }
    return out;
  }

  /** Polite message to the employer / HR. */
  function employerMessage(analysis, opts) {
    opts = opts || {};
    let bad = analysis.findings.filter((f) => f.status === 'bad' || (opts.includeWarn && f.status === 'warn' && f.amount > 0));
    const P = analysis.expected.P;
    if (!bad.length) return '';
    // after the check (checkGap): what the innocent reasons explain in full stays out of the letter, and a finding
    // they explain in part asks for what is left. When they explain everything, the letter is still there, whole.
    const chk = opts.check || null;
    const itemOf = (f) => (chk ? chk.items.find((x) => x.id === f.id) : null);
    const leftOf = (f) => { const it = itemOf(f); return it ? it.left : Math.max(0, f.amount || 0); };
    if (chk) {
      const kept = bad.filter((f) => { const it = itemOf(f); return !it || it.left >= 1; });
      if (kept.length) bad = kept;
    }
    const useLeft = !!chk && bad.some((f) => itemOf(f) && itemOf(f).left >= 1);
    let s = `שלום${opts.to ? ' ' + opts.to : ''},\n\nבדקתי את תלוש השכר של ${U.fmtMonth(analysis.period)} מול רישום המשמרות שלי (\u2066${U.fmtDate(P.from)}\u2060–\u2060${U.fmtDate(P.to)}\u2069), ונראה לי שיש כמה נקודות שכדאי לבדוק:\n\n`;
    // findings are written to the user ("רשמת"); the message speaks in first person
    // i18n-keep-start
    const firstPerson = (t) => t.replace(/(^|\s)רשמת(\s)/g, '$1רשמתי$2').replace(/שרשמת(\s|\)|\.|,)/g, 'שרשמתי$1').replace(/באפליקציה/g, 'לפי הרישום שלי').replace(/שהגדרת/g, 'שסוכמו');
    // i18n-keep-end
    bad.forEach((f, i) => {
      s += `${i + 1}. ${f.title}: ${firstPerson(f.detail)}`;
      const it = useLeft ? itemOf(f) : null;
      if (it && it.explained >= 1 && it.left >= 1) s += ` (אחרי מה שבדקתי, נשאר הפרש משוער של ${U.money(it.left)})`;
      else if (f.amount > 0 && !/≈|לפי החישוב/.test(f.detail)) s += ` (הפרש משוער: ${U.money(f.amount)})`;
      s += '\n';
    });
    const tot = bad.reduce((x, f) => x + (useLeft ? leftOf(f) : Math.max(0, f.amount || 0)), 0);
    if (tot > 0) s += `\nסה״כ הפרש משוער: ${U.money(tot)}.\n`;
    s += '\nאשמח אם תוכלו לבדוק ולעדכן אותי, ואם צריך, לתקן בתלוש הבא. אם פספסתי משהו, אשמח להסבר.\n\nתודה רבה,\n' + (opts.name || '');
    return s.trim();
  }

  root.Payslip = { FIELDS, FIELD, HOUR_FIELDS, hoursOnSlip, EXPLAIN, READ_ORDER, MEANING, MEANING_HE, HE_TERM, KIND_LABEL, printedTerm, unknownLines, addNamedLines, labelOther, normalize, fixVisual, numbersIn, matchField, pickValues, linesFromPdfItems, detectPeriod, parseText, redact, aiSchema, aiPrompt, fromAi, expected, analyze, checkGap, reconcile, settingsCheck, waterfall, explainLines, compareSlips, employerMessage };
})(typeof window !== 'undefined' ? window : globalThis);
