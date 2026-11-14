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
    { key: 'totalDeductions', label: 'סה״כ ניכויים', kind: 'total', pats: ['סה"כ ניכויים', 'סה״כ ניכויים', 'סך הניכויים', 'סך ניכויים', 'סה"כ ניכויי חובה'] },
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
  const EXPLAIN = {
    base: 'השכר על השעות הרגילות (100%): מספר השעות × התעריף לשעה. זה הבסיס לחישוב פנסיה, חופשה ומחלה.',
    ot125: 'שעות נוספות: אחרי יום עבודה מלא (8.6 שעות בשבוע של 5 ימים, 8 בשבוע של 6 ימים, 7 במשמרת לילה), השעתיים הראשונות משולמות ב-125% מהתעריף.',
    ot150: 'שעות נוספות מעבר לשעתיים הראשונות: 150% מהתעריף.',
    rest150: 'שעות בשבת או בחג משולמות ב-150% מהתעריף (לפי חוק שעות עבודה ומנוחה).',
    rest175: 'שעות נוספות שנעשו בשבת או בחג, השעתיים הראשונות: 175%.',
    rest200: 'שעות נוספות בשבת או בחג מעבר לשעתיים: 200%.',
    night: 'תוספת על שעות לילה, לפי ההסכם או הנוהג אצל המעסיק (לא חובה בחוק לכל העובדים).',
    seniority: 'תוספת לפי ותק, לפי הסכם קיבוצי או חוזה אישי.',
    travel: 'החזר הוצאות נסיעה לעבודה: לפי מספר ימי העבודה בפועל, עד תקרה יומית (22.60 ₪ לפי צו ההרחבה, 2025). החזר הנסיעות חייב במס.',
    recuperation: 'דמי הבראה: אחרי שנת עבודה. מספר ימים לפי ותק × תעריף יומי (451.50 ₪ במגזר הפרטי, 2026) × היקף המשרה.',
    vacationPay: 'תשלום על ימי חופשה שנוצלו, לפי השכר היומי הממוצע.',
    sickPay: 'דמי מחלה לפי חוק: יום ראשון ללא תשלום, ימים 2\u2060–\u20603 ב-50%, מהיום הרביעי 100%.',
    holidayPay: 'דמי חגים: לעובדים שעתיים אחרי 3 חודשי עבודה, על ימי חג שחלו ביום חול ולא עבדו בהם (לפי צו ההרחבה).',
    bonus: 'בונוס, פרמיה או מענק, לפי מדיניות המעסיק. חייב במס ובביטוח לאומי.',
    diff: 'הפרשים: תיקון של חודשים קודמים (למשל שעות שלא שולמו). כדאי לבדוק אם זה סוגר פער פתוח.',
    gross: 'ברוטו: סך כל התשלומים לפני ניכויים.',
    net: 'נטו: מה שנכנס לחשבון הבנק, ברוטו פחות כל הניכויים.',
    totalDeductions: 'סך כל הניכויים מהברוטו: מס הכנסה, ביטוח לאומי, מס בריאות, פנסיה וניכויים נוספים.',
    incomeTax: 'מס הכנסה: מחושב לפי מדרגות מס (10%, 14%, 20%...) על השכר החודשי, פחות זיכוי על כל נקודת זיכוי (242 ₪ לנקודה) ופחות זיכוי על הפקדה לפנסיה. אם הוא עלה, לרוב כי הברוטו עלה ונכנסת למדרגה גבוהה יותר.',
    nationalInsurance: 'ביטוח לאומי (חלק העובד): 1.04% על השכר עד 7,703 ₪ ו-7% מעל (2026). משתנה ישירות עם הברוטו.',
    healthTax: 'מס בריאות: 3.23% עד 7,703 ₪ ו-5.17% מעל (2026). מממן את קופת החולים.',
    pensionEmployee: 'הפרשת העובד לפנסיה: לרוב 6% מהשכר הקובע. נחסך על שמך ומקטין את מס ההכנסה (זיכוי 35%).',
    pensionEmployer: 'הפרשת המעסיק לתגמולים: לרוב 6.5%. לא יורד מהנטו. זה כסף נוסף שנחסך בשבילך.',
    severance: 'הפרשת המעסיק לפיצויים: 6% עד 8.33%. נצבר בקרן הפנסיה.',
    hishtalmutEmployee: 'קרן השתלמות: חלק העובד (לרוב 2.5%). חיסכון שאפשר למשוך אחרי 6 שנים, פטור ממס עד תקרה.',
    hishtalmutEmployer: 'קרן השתלמות: חלק המעסיק (לרוב 7.5%).',
    creditPoints: 'נקודות זיכוי: מקטינות את מס ההכנסה (כל נקודה 242 ₪ בחודש). תושב/ת: 2.25; אישה: 2.75; ועוד לפי ילדים, תואר, שחרור מצבא וכו׳.',
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
  function normalize(s) {
    return s.replace(/[\u200e\u200f\u202A-\u202E]/g, '').replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'").replace(/\s+/g, ' ').trim();
  }
  /** Numbers in a line, in reading order. Handles 1,234.56 / trailing minus / percents. */
  function numbersIn(line) {
    const clean = line.replace(/\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g, ' ');
    const re = /(-?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(-?)(\s*%)?/g;
    const out = [];
    let m;
    while ((m = re.exec(clean))) {
      const raw = m[2];
      if (!raw.includes('.') && !raw.includes(',') && raw.length > 6) continue; // ids
      let v = parseFloat(raw.replace(/,/g, ''));
      if (m[1] === '-' || m[3] === '-') v = -v;
      out.push({ v, pct: !!m[4], dec: raw.includes('.'), raw: m[0] });
    }
    return out;
  }
  function matchField(line) {
    const n = normalize(line);
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
          if (f.key === 'nationalInsurance' && /ברוטו|הפרש[תו]|מעסיק|מעביד/.test(n)) continue;
          return f;
        }
      }
    }
    return null;
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
  /** qty × rate = amount among the values (the shape of a real payment line), or null. */
  function productOf(vals) {
    if (vals.length < 3) return null;
    for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) for (let k = 0; k < vals.length; k++) {
      if (k === i || k === j) continue;
      const prod = vals[i] * vals[j];
      if (vals[k] !== 0 && Math.abs(prod - vals[k]) / Math.abs(vals[k]) < 0.015) return { value: vals[k], qty: vals[i], rate: vals[j] };
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
    const prod = productOf(vals);
    const named = WEAK_PAY[f.key].test(line);
    const row = !prod && vals.length >= 3 ? balanceRow(vals) : null;
    // the balance it shows, when the line is the balance (a usage or accrual line alone is not the balance)
    const asBalance = () => (BALANCE_OF[f.key] && (row != null || /יתר[הת]/.test(line)) ? FIELD[BALANCE_OF[f.key]] : null);
    // a balance, accrual or usage line: information (a named payment with qty × rate = amount stays a payment)
    if (BALANCE_WORD.test(line) && !(named && prod)) return asBalance();
    if (row != null) return asBalance();
    if (prod) return f;
    if (QTY_WORD.test(line)) return daysAndAmount(vals) ? f : null;
    if (named) return f;
    // the bare word ("מחלה", "ותק"): a payment only with an amount column (a sum in shekels, with agorot)
    return nums.some((x) => !x.pct && x.dec && Math.abs(x.v) >= 50) ? f : null;
  }

  /** Choose amount / qty / rate from a line's numbers. */
  function pickValues(f, nums) {
    const vals = nums.filter((x) => !x.pct).map((x) => x.v);
    const pcts = nums.filter((x) => x.pct).map((x) => x.v);
    if (!vals.length) return null;
    if (f.kind === 'info') {
      // a balance row's closing balance (not the previous balance it starts with)
      const b = (f.key === 'sickBalance' || f.key === 'vacationBalance') && vals.length >= 3 ? balanceRow(vals) : null;
      return { value: b != null ? b : vals[0] };
    }
    const prod = productOf(vals);
    if (prod) return Object.assign(prod, { pct: pcts[0] });
    if (vals.length === 2 && (f.hours || (WEAK_PAY[f.key] && daysAndAmount(vals)))) {
      // qty + amount (rate missing): hours, or the days of a day-based payment ("ימי מחלה 2.00 350.00")
      if (!f.hours) { const [q, v] = vals[0] <= vals[1] ? vals : [vals[1], vals[0]]; return { value: v, qty: q, pct: pcts[0] }; }
      // qty + amount (rate missing)
      return { value: vals[1], qty: vals[0], pct: pcts[0] };
    }
    return { value: vals[vals.length - 1], pct: pcts[0] };
  }

  /** Group pdf.js text items into logical lines (right-to-left). */
  function linesFromPdfItems(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    const out = [];
    rows.forEach((r, i) => {
      r.items.sort((a, b) => b.x - a.x);
      out.push(r.items.map((it) => it.s).join(' '));
      out.push(...tableColumns(rows[i - 1], r));
    });
    return out;
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
    const mid = (it) => it.x + it.w / 2;
    const lines = [];
    for (const nm of names) {
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
    const re1 = /(?:^|[^\d])(\d{1,2})[\/.-](20\d{2})(?!\d)/g;
    while ((m = re1.exec(text))) bump(+m[2], +m[1]);
    MONTHS.forEach((name, i) => {
      // i18n-keep a pattern for the Hebrew payslip's text
      const re = new RegExp(name + "\\s*['׳]?\\s*(20\\d{2})", 'g');
      let mm;
      while ((mm = re.exec(text))) { bump(+mm[1], i + 1); bump(+mm[1], i + 1); }
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }

  /**
   * Parse raw text (one line per row).
   * Returns { fields:{key:{value,qty,rate,pct,line}}, other:[{line,value,guess}], period, lineCount }
   */
  function parseText(text) {
    const rawLines = text.split(/\r?\n/).map(normalize).filter(Boolean);
    const fields = {};
    const other = [];
    let cumulative = false;
    for (const raw of rawLines) {
      // a block of the year's running totals ("- סכומים מצטברים -", "נתונים מצטברים"): its gross and tax are the
      // year's, not the month's (the year's taxable gross was read as the month's, real payslip, Nov 2026). It
      // starts at its heading (a line with no numbers) and ends at the next heading: a "- name -" line or a row
      // of three or more column names.
      if (!/\d/.test(raw) && HEB.test(raw)) {
        if (/מצטבר/.test(raw) && raw.split(' ').length <= 5) { cumulative = true; continue; }
        if (cumulative && (/^[-–*].*[-–*]$/.test(raw) || raw.split(' ').length >= 3)) cumulative = false;
      }
      let f = matchField(raw);
      let line = raw;
      if (!f && HEB.test(raw)) {
        const alt = fixVisual(raw);
        f = matchField(alt);
        if (f) line = alt;
      }
      if (cumulative && f) {
        // only the year's own lines: the gross and the income tax become the running totals, the rest is skipped
        f = f.key === 'gross' ? FIELD.ytdGross : f.key === 'incomeTax' ? FIELD.ytdTax : f.key === 'ytdGross' || f.key === 'ytdTax' ? f : null;
        if (!f) continue;
      }
      // a payroll system's symbol code before the name ("9268 שעות בפועל 147.33", "300 125% …") is not a value:
      // the hours and days were read as the code (real payslip, Nov 2026). A whole number at the start, right before
      // the Hebrew name, with a value after it.
      let nums = numbersIn(line);
      const code = /^\d{2,6}\s+(?=(?:\d{2,3}%\s+)?[֐-׿])/.exec(line);
      if (code) { const rest = numbersIn(line.slice(code[0].length)); if (rest.length) nums = rest; }
      if (f && f.kind === 'pay') {
        f = payOrCount(f, line, nums);
        if (!f) continue; // a count (sick days, seniority years) with no money in it: not a payment, not a line to name
      }
      if (!f) {
        const vals = nums.filter((x) => !x.pct && x.dec);
        if (vals.length && HEB.test(line)) other.push({ line, value: vals[vals.length - 1].v, guess: null });
        continue;
      }
      const pv = pickValues(f, nums);
      if (!pv) continue;
      if (fields[f.key]) {
        // a second line for the same field: sum earnings (e.g. two roles' base pay), keep first for others
        if (f.kind === 'pay') {
          const cur = fields[f.key];
          cur.value += pv.value;
          if (pv.qty != null) cur.qty = (cur.qty || 0) + pv.qty;
          cur.line += ' | ' + line;
          cur.rate = cur.qty ? cur.value / cur.qty : cur.rate;
        } else if ((f.kind === 'ded' || f.kind === 'emp') && nums.some((x) => !x.pct && x.dec)) {
          // a second deduction or employer line of the same kind (two pension funds): never dropped silently,
          // it waits among the lines to name (the translator and the check screen show it)
          const vals = nums.filter((x) => !x.pct && x.dec);
          other.push({ line, value: vals[vals.length - 1].v, guess: null });
        }
        continue;
      }
      fields[f.key] = Object.assign({ line }, pv);
    }
    // a guard for running totals printed without a heading: a taxable gross far above the gross is the year's
    if (fields.taxableGross && fields.gross && fields.taxableGross.value > fields.gross.value * 2) delete fields.taxableGross;
    return { fields, other, period: detectPeriod(text), lineCount: rawLines.length };
  }

  /* ---------------- redaction (before optional AI) ---------------- */
  function redact(text) {
    let count = 0;
    const lines = text.split(/\r?\n/).map((line) => {
      let l = line;
      if (/(רחוב|רח'|רח׳|כתובת|מיקוד|ת\.ד|דירה|שכונת|ישוב:|יישוב:)/.test(l)) { count++; return '[כתובת הוסתרה]'; }
      if (/(בנק|סניף|חשבון|IBAN|מס' חשבון)/i.test(l)) {
        l = l.replace(/\d[\d\-\s]{2,}\d/g, () => { count++; return '[פרטי בנק הוסתרו]'; });
      }
      if (/(ת\.ז|ת"ז|ת״ז|תעודת זהות|מספר זהות|מס' זהות|זהות)/.test(l)) {
        l = l.replace(/\d[\d\-\s]{4,}\d/g, () => { count++; return '[ת״ז הוסתרה]'; });
      }
      l = l.replace(/\b\d{9}\b/g, () => { count++; return '[מספר הוסתר]'; });
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
  function fromAi(json) {
    const fields = {};
    const list = (json.fields || []).filter((x) => x && FIELD[x.key] && x.value != null && Number.isFinite(+x.value));
    const balances = list.filter((x) => FIELD[x.key].kind === 'info').map((x) => +x.value);
    for (const x of list) {
      // a count the AI put in a money field (the sick-day balance as sick pay, the seniority years as a seniority
      // payment): left out, as the text reader does (payOrCount)
      if (WEAK_PAY[x.key] && !countFree(x, balances)) continue;
      fields[x.key] = { value: +x.value, qty: x.qty ? +x.qty : undefined, rate: x.rate ? +x.rate : undefined, line: 'AI' };
    }
    const other = (json.otherLines || []).map((o) => ({ line: o.label, value: o.amount, guess: o.type === 'deduction' ? 'otherDed' : o.type === 'payment' ? 'otherPay' : 'ignore' }));
    return { fields, other, period: /^\d{4}-\d{2}$/.test(json.period || '') ? json.period : null, notes: json.notes || '' };
  }

  /* ---------------- analysis ---------------- */
  const val = (F, k) => (F[k] && F[k].value != null && !isNaN(F[k].value) ? +F[k].value : null);
  const qty = (F, k) => (F[k] && F[k].qty != null && !isNaN(F[k].qty) ? +F[k].qty : null);

  /** App-side expectations for a pay period. */
  function expected(model, pk, useAuto) {
    const emp = model.ctx.primaryEmployer();
    const P = Engine.periodByKey(pk, emp);
    const results = useAuto && model.autoResults && model.autoResults.size ? model.autoResults : model.results;
    const m = Object.assign({}, model, { results });
    const t = Engine.totals(m, P.from, P.to);
    const pay = { base: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0 };
    const hrs = { base: 0, ot125: 0, ot150: 0, rest150: 0, rest175: 0, rest200: 0 };
    const shifts = [];
    for (const r of results.values()) {
      if (r.status !== 'done' || r.dateKey < P.from || r.dateKey > P.to) continue;
      shifts.push(r);
      for (const l of r.lines) {
        const k = l.rest ? ['rest150', 'rest175', 'rest200'][l.tier] : ['base', 'ot125', 'ot150'][l.tier];
        pay[k] += l.amount; hrs[k] += l.hours;
      }
    }
    shifts.sort((a, b) => a.start - b.start);
    const net = Engine.netEstimate({ gross: t.gross, pensionBase: Engine.pensionBaseOf(t, model.ctx.settings), deductions: t.deductions, periodTo: P.to }, model.ctx.settings);
    return { P, t, pay, hrs, shifts, net, avgRate: t.hours ? t.wage / t.hours : 0, baseRate: hrs.base ? pay.base / hrs.base : 0 };
  }

  /**
   * Compare a verified payslip to the recorded shifts.
   * slip = { period:'YYYY-MM', fields:{...}, other:[{line,value,guess}] }
   */
  function analyze(slip, model) {
    const S = model.ctx.settings;
    const F = slip.fields || {};
    const E = expected(model, slip.period, false);
    const A = expected(model, slip.period, true);
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
    const slipHours = HOUR_FIELDS.reduce((s, k) => s + (qty(F, k) || 0), 0) || val(F, 'workHours');
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
          basis: 'חלון השבת/חג לפי ' + (S.rest.mode === 'city' ? 'זמני כניסה ויציאה ב' + S.rest.city : 'השעות הקבועות שהגדרת') + ', ' + (model.ctx.primaryEmployer().restPct || 150) + '%.',
          confidence: 'medium', fromOverride: ovNote(appRestH, A.t.restHours, 0, 0.1) });
      } else if (slipRestH > 0 && appRestH - slipRestH > 0.25) {
        const missingH = appRestH - slipRestH;
        const amount = missingH * E.avgRate * ((model.ctx.primaryEmployer().restPct || 150) - 100) / 100;
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
          basis: Engine.otByLaw(model.ctx.primaryEmployer()) ? 'שעות נוספות לפי החוק: ביום מעל 8.6 שעות (8 בשבוע של 6 ימים, 7 במשמרת לילה) ובשבוע מעל 42 שעות רגילות.' : 'שעות נוספות יומיות אחרי ' + model.ctx.primaryEmployer().otThreshold + ' שעות (לפי ההגדרות).', confidence: 'medium',
          fromOverride: ovNote(appOt, A.t.hoursBy.ot1 + A.t.hoursBy.ot2, slipOt, 0.1) });
      } else add({ area: 'שעות נוספות', status: 'ok', title: 'שעות נוספות תקינות', detail: `${U.hours(slipOt)} בתלוש מול ${U.hours(appOt)} באפליקציה.`, basis: 'השוואת שעות 125%/150%.', confidence: 'medium' });
    }

    /* 5. travel */
    const slipTravel = val(F, 'travel');
    if (!noShifts && (E.t.travel > 0 || slipTravel)) {
      const d = E.t.travel - (slipTravel || 0);
      const emp = model.ctx.primaryEmployer();
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
        add({ area: 'ביטוח לאומי', status: ok ? 'ok' : 'warn', title: ok ? 'ביטוח לאומי ומס בריאות סבירים' : 'ביטוח לאומי / בריאות שונים מההערכה', detail: `נוכו ${U.money(actual)}, הערכה ${U.money(expBL)}.`, basis: 'שיעורים מופחתים עד 60% מהשכר הממוצע, מלאים מעל.', confidence: 'medium' });
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
    return { findings, expected: E, auto: A, totalMissing, overridesInPeriod: overridesInPeriod.length, period: slip.period, noShifts };
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
  const slipHoursOf = (F) => HOUR_FIELDS.reduce((s, k) => s + (qty(F, k) || 0), 0) || val(F, 'workHours') || 0;
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
    const F = slip.fields || {};
    const E = a.expected;
    const P = E.P;
    const emp = model.ctx.primaryEmployer();
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
          const h = Engine.totals(model, P2.from, P2.to).hours;
          if (!best || Math.abs(h - slipHours) < Math.abs(best.h - slipHours)) best = { d, h };
        }
        const match = best && Math.abs(best.h - slipHours) <= 0.25;
        add({ id: 'period', found: match ? 'yes' : 'no', amount: match ? f.amount : null, title: 'תקופת השכר',
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
        add({ id: 'rate', found: raise ? 'yes' : 'maybe', amount: raise ? f.amount : null, title: 'התעריף לשעה',
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
    const S = model.ctx.settings, F = slip.fields || {}, E = a.expected, P = E.P;
    const emp = model.ctx.primaryEmployer();
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
        if (Math.abs(Engine.totals(model, P2.from, P2.to).hours - slipHours) <= 0.25) {
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
    const S = model.ctx.settings, F = slip.fields || {}, E = a.expected, t = E.t, P = E.P;
    const emp = model.ctx.primaryEmployer();
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

  root.Payslip = { FIELDS, FIELD, HOUR_FIELDS, EXPLAIN, READ_ORDER, MEANING, MEANING_HE, HE_TERM, KIND_LABEL, printedTerm, unknownLines, labelOther, normalize, fixVisual, numbersIn, matchField, pickValues, linesFromPdfItems, detectPeriod, parseText, redact, aiSchema, aiPrompt, fromAi, expected, analyze, checkGap, reconcile, settingsCheck, waterfall, explainLines, compareSlips, employerMessage };
})(typeof window !== 'undefined' ? window : globalThis);
