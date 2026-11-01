# ASO: how the store page was written, and what to check before publishing

Written with the israeli-aso skill (2 Nov 2026). The texts themselves are in `listing.md` (Hebrew, the default page)
and `listing-langs.md` (English, Russian, Arabic, French, Spanish).

## Who sees which page
Google Play shows the page in the phone's language, not by country. Many Israelis keep their phone in English, so they
see the English page, not the Hebrew one. That is why the English page speaks to Israelis: "Hourly pay in Israel",
Shabbat pay, payslip checks.

## The words people search, and where they sit
Google Play has no keyword field. It reads the name, the short description and the full description.

| Word | Where |
|---|---|
| שעון נוכחות | name, full description (2) |
| חישוב שכר, מחשבון שכר | short, full |
| משמרות, סידור עבודה | short, full |
| דוח שעות | full |
| תלוש שכר, תלוש משכורת | short, full (both forms) |
| שעות נוספות, שבת, חג | short, full |
| שכר מינימום, נוער עובד, חוק עבודת הנוער | full |
| זכויות עובדים, דמי הבראה, דמי נסיעה, החזר מס | full |
| שעתי (the Hebrew name) | short, full |

## What was removed (Google Play rules)
Play forbids, in the name, both descriptions, the screenshots and the feature graphic: emojis, price words ("free",
"חינם"), rankings ("best", "#1", "הכי טוב") and calls to action ("download now", "הורידו").
- 10 emoji lines in Hebrew and 46 in the other languages: removed.
- "everything else stays free" in every language: now "everything else is included".
- The feature graphic said "חינם · בלי פרסומות": now "בלי פרסומות · עובד גם בלי אינטרנט", in the app's
  current look (night blue and gold). 1024x500, no transparency layer, as Play requires
  (`qa/feature-graphic.js` makes it).

## Before publishing (the user, in Play Console)
1. Main store listing (Hebrew): paste the name, the short and the full description from `listing.md`.
2. Translations: paste each language from `listing-langs.md`.
3. Feature graphic: upload the new `store/feature-graphic.png` (the old one says "חינם").
4. Screenshots: the ones in `store/screenshots` are from 1.26 (the purple look). After 1.30 is out they are taken
   again in the new look (`qa/store-shots.js`). The first screenshot matters most: the home screen with the pay card.
   In Hebrew the order reads from the right.
5. Screenshot descriptions (alt text, read by screen readers), in Hebrew:
   1. מסך הבית: כמה הרווחת החודש, ברוטו ונטו משוער
   2. משמרת: שעת התחלה, סיום והפסקה, והשכר שלה
   3. ייבוא סידור עבודה מצילום או מהודעת וואטסאפ
   4. בדיקת תלוש שכר: מה חסר ומה שולם
   5. מדריך הזכויות: שכר מינימום, שבת, נסיעות ועוד
   6. דוחות: סיכום חודשי וגרפים
   7. משחקים קצרים על שכר וזכויות
   8. מצב כהה

## Testing what works (after publishing)
- Play Console › Store listings › Experiments: a localized experiment on the Hebrew page can test the short
  description (for example "שעון נוכחות" first or "תלוש" first) and the first screenshot. Up to 2 versions against
  the current one.
- The numbers: Play Console › Statistics › store listing acquisition, by search.

## Reviews
Answer every review in Hebrew within a day or two, the 1-star ones first. The app asks for a rating only after a good
moment (a shift just ended and looked at, nothing else open), never in the middle of a task (`src/app/review.js`).

## If there is an iPhone version one day
Apple has a 100-character keyword field per language, not counted with the name. A field that does not repeat the
name's words (90 characters):
```
משמרות,דוח שעות,תלוש,משכורת,שעות נוספות,שבת,מינימום,נוער,זכויות עובדים,החזר מס,סידור עבודה
```
