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
    { key: 'net', label: 'נטו לתשלום', kind: 'total', pats: ['נטו לתשלום', 'שכר נטו', 'סה"כ נטו', 'סה״כ נטו', 'נטו'] },
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
          if (f.key === 'gross' && /למס|מצטבר/.test(n)) continue;
          if (f.key === 'net' && /מצטבר/.test(n)) continue;
          return f;
        }
      }
    }
    return null;
  }
  /** Choose amount / qty / rate from a line's numbers. */
  function pickValues(f, nums) {
    const vals = nums.filter((x) => !x.pct).map((x) => x.v);
    const pcts = nums.filter((x) => x.pct).map((x) => x.v);
    if (!vals.length) return null;
    if (f.kind === 'info') return { value: vals[0] };
    if (vals.length >= 3) {
      for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) for (let k = 0; k < vals.length; k++) {
        if (k === i || k === j) continue;
        const prod = vals[i] * vals[j];
        if (vals[k] !== 0 && Math.abs(prod - vals[k]) / Math.abs(vals[k]) < 0.015) {
          return { value: vals[k], qty: vals[i], rate: vals[j], pct: pcts[0] };
        }
      }
    }
    if (vals.length === 2 && f.hours) {
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
    return rows.map((r) => r.items.sort((a, b) => b.x - a.x).map((i) => i.s).join(' '));
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
    for (const raw of rawLines) {
      let f = matchField(raw);
      let line = raw;
      if (!f && HEB.test(raw)) {
        const alt = fixVisual(raw);
        f = matchField(alt);
        if (f) line = alt;
      }
      const nums = numbersIn(line);
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
      'Field keys: ' + FIELDS.map((f) => `${f.key} = ${f.label}`).join('; ') + '.\n' +
      'Put every other payment, deduction or employer-contribution line in otherLines. ' +
      'period is the pay month (YYYY-MM) if visible, otherwise an empty string. notes: one short Hebrew sentence about anything unclear, or an empty string.';
    // i18n-keep-end
  }
  /** Convert AI JSON to the same {fields, other, period} shape as parseText. */
  function fromAi(json) {
    const fields = {};
    for (const x of json.fields || []) {
      if (!FIELD[x.key] || x.value == null) continue;
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

    /* 1. total hours */
    let covered = []; // shifts already identified as unpaid — excluded from the OT / rest checks to avoid double counting
    const slipHours = HOUR_FIELDS.reduce((s, k) => s + (qty(F, k) || 0), 0) || val(F, 'workHours');
    const appHours = E.t.hours;
    if (slipHours == null || slipHours === 0) {
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
    if (appRestH > 0.01 || slipRestH > 0 || slipRestPay > 0) {
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
    if (appOt > 0.25 || slipOt > 0) {
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
    if (E.t.travel > 0 || slipTravel) {
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

    /* 9. leave balances */
    const vb = val(F, 'vacationBalance');
    if (vb != null) {
      const appV = L.vacationAccrued - L.vacationUsed;
      const ok = Math.abs(appV - vb) <= 1.5;
      add({ area: 'חופשה', status: ok ? 'ok' : 'warn', title: ok ? 'יתרת חופשה סבירה' : 'יתרת חופשה שונה מההערכה', detail: `בתלוש ${U.num(vb, 2)} ימים, הערכה באפליקציה ${U.num(appV, 2)}.`, basis: 'חוק חופשה שנתית, לפי היקף המשרה בפועל. תלוי בהסכם ובצבירה מלפני השימוש באפליקציה.', confidence: 'low' });
    }
    const sb = val(F, 'sickBalance');
    if (sb != null) {
      const appS = L.sickAccrued - L.sickUsed;
      const ok = Math.abs(appS - sb) <= 2;
      add({ area: 'מחלה', status: ok ? 'ok' : 'warn', title: ok ? 'יתרת מחלה סבירה' : 'יתרת מחלה שונה מההערכה', detail: `בתלוש ${U.num(sb, 2)} ימים, הערכה ${U.num(appS, 2)}.`, basis: '1.5 ימים לחודש מלא, יחסית להיקף המשרה.', confidence: 'low' });
    }

    /* 10. credit points */
    const cp = val(F, 'creditPoints');
    if (cp != null) {
      const ok = Math.abs(cp - S.tax.creditPoints) < 0.01;
      add({ area: 'נקודות זיכוי', status: ok ? 'ok' : 'warn', title: ok ? 'נקודות הזיכוי תואמות' : 'נקודות זיכוי שונות', detail: `בתלוש ${cp}, בהגדרות ${S.tax.creditPoints}.` + (ok ? '' : ' אם מגיעות לך יותר, מלא טופס 101 מעודכן.'), basis: 'טופס 101 שמילאת אצל המעסיק.', confidence: 'medium' });
    }

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
      // gross vs app
      const dg = E.t.gross - gross;
      add({ area: 'ברוטו', status: Math.abs(dg) <= Math.max(20, gross * 0.02) ? 'ok' : dg > 0 ? 'warn' : 'ok', title: 'ברוטו: תלוש מול אפליקציה', detail: `בתלוש ${U.money(gross)}, לפי המשמרות ${U.money(E.t.gross)} (הפרש ${U.money(dg)}).`, basis: 'כולל שכר, נסיעות, בונוסים וימי חופשה/מחלה שרשמת.', confidence: 'medium', fromOverride: ovNote(E.t.gross, A.t.gross, gross, 1) });
    }

    /* 13. unexplained deductions */
    const unexplained = (slip.other || []).filter((o) => o.guess === 'otherDed');
    if (unexplained.length) {
      add({ area: 'ניכויים', status: 'warn', title: 'ניכויים שלא מוסברים', amount: 0, detail: unexplained.map((o) => `${o.line.replace(/[\d.,\-%]+/g, '').trim() || 'ניכוי'}: ${U.money(Math.abs(o.value))}`).join(' · '), basis: 'שורות ניכוי שלא שייכות לניכויי החובה המוכרים. ניכוי מהשכר מותר רק לפי חוק או בהסכמה בכתב.', confidence: 'medium' });
    }

    const bad = findings.filter((f) => f.status === 'bad');
    const totalMissing = bad.reduce((s, f) => s + Math.max(0, f.amount || 0), 0);
    return { findings, expected: E, auto: A, totalMissing, overridesInPeriod: overridesInPeriod.length, period: slip.period };
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

  /** Line-by-line plain explanations, with change vs previous slip. */
  function explainLines(F, prevF) {
    const out = [];
    for (const f of FIELDS) {
      const v = val(F, f.key);
      if (v == null) continue;
      let change = null;
      if (prevF) {
        const pv = val(prevF, f.key);
        if (pv == null) change = 'שורה חדשה: לא הופיעה בתלוש הקודם.';
        else if (Math.abs(v - pv) > Math.max(1, Math.abs(pv) * 0.05)) {
          const up = v > pv;
          change = (up ? 'עלה' : 'ירד') + ` ב-${U.money(Math.abs(v - pv))} לעומת התלוש הקודם (${U.money(pv)})`;
          if (['incomeTax', 'nationalInsurance', 'healthTax', 'pensionEmployee'].includes(f.key)) {
            const gNow = val(F, 'gross'), gPrev = val(prevF, 'gross');
            if (gNow && gPrev) change += gNow > gPrev === up ? ', בהתאם לשינוי בברוטו.' : ', למרות שהברוטו השתנה בכיוון ההפוך; כדאי לבדוק.';
          } else change += '.';
        }
      }
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

  /** Notable changes between consecutive slips (for alerts). */
  function compareSlips(prevF, F) {
    const out = [];
    if (!prevF) return out;
    const g1 = val(prevF, 'gross'), g2 = val(F, 'gross');
    const gChange = g1 && g2 ? (g2 - g1) / g1 : 0;
    for (const f of FIELDS.filter((x) => x.kind === 'ded')) {
      if (val(F, f.key) && !val(prevF, f.key)) out.push({ type: 'newDeduction', text: `ניכוי חדש: ${f.label} (${U.money(val(F, f.key))})` });
    }
    const p1 = val(prevF, 'pensionEmployee'), p2 = val(F, 'pensionEmployee');
    if (p1 && (!p2 || (p2 - p1) / p1 < -0.15) && gChange > -0.1) out.push({ type: 'pensionDrop', text: `הפרשת הפנסיה ירדה מ-${U.money(p1)} ל-${U.money(p2 || 0)} למרות שהברוטו כמעט לא ירד.` });
    const c1 = val(prevF, 'creditPoints'), c2 = val(F, 'creditPoints');
    if (c1 != null && c2 != null && c1 !== c2) out.push({ type: 'credit', text: `נקודות הזיכוי השתנו מ-${c1} ל-${c2}.` });
    const t1 = val(prevF, 'incomeTax'), t2 = val(F, 'incomeTax');
    if (t1 && t2 && (t2 - t1) / t1 > 0.3 && gChange < 0.1) out.push({ type: 'taxJump', text: `מס ההכנסה קפץ מ-${U.money(t1)} ל-${U.money(t2)} בלי עלייה דומה בברוטו.` });
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

  root.Payslip = { FIELDS, FIELD, HOUR_FIELDS, EXPLAIN, READ_ORDER, MEANING, MEANING_HE, HE_TERM, KIND_LABEL, printedTerm, unknownLines, labelOther, normalize, fixVisual, numbersIn, matchField, pickValues, linesFromPdfItems, detectPeriod, parseText, redact, aiSchema, aiPrompt, fromAi, expected, analyze, checkGap, waterfall, explainLines, compareSlips, employerMessage };
})(typeof window !== 'undefined' ? window : globalThis);
