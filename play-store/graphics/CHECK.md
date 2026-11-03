# Google Play graphics: check (app 1.32.1, built 2026-11-03)

Measured by a script that reads each PNG's IHDR chunk (width, height, bit depth, colour type) and looks for a tRNS chunk.
"Has alpha" = colour type 4/6 or a tRNS chunk.

| File | Width | Height | Bit depth | Has alpha | Size |
|---|---|---|---|---|---|
| icon-512.png | 512 | 512 | 32-bit (8/channel, RGBA) | yes | 20.8 KB |
| feature-graphic.png | 1024 | 500 | 24-bit (8/channel, RGB) | no | 284.0 KB |
| he/01.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 626.3 KB |
| he/02.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 500.3 KB |
| he/03.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 505.1 KB |
| he/04.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 526.7 KB |
| he/05.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 488.8 KB |
| he/06.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 478.9 KB |
| he/07.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 546.9 KB |
| he/08.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 628.3 KB |
| en/01.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 655.3 KB |
| en/02.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 524.4 KB |
| en/03.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 541.0 KB |
| en/04.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 565.3 KB |
| en/05.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 535.7 KB |
| en/06.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 505.4 KB |
| en/07.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 561.4 KB |
| en/08.png | 1080 | 1920 | 24-bit (8/channel, RGB) | no | 655.8 KB |

Google's limits, checked against the table:
- Icon: 512x512, 32-bit PNG with alpha, at most 1024 KB. Passes. It is the full-bleed square (docs/icon-maskable-512.png, every
  pixel opaque); Google Play applies its own rounded mask. No text or badges.
- Feature graphic: 1024x500, 24-bit PNG, no alpha. Passes.
- Phone screenshots: 8 per language (4 to 8 allowed), 1080x1920 (9:16), 24-bit PNG, no alpha. Passes.

## What each screenshot shows

Every screen is the real app (docs/, 1.32.1) running in Chrome at 390x844 x3 with the built-in demo data: made-up roles
(סדרן / Usher, מזגן / Snack bar, אחמ"ש / Shift manager), the made-up name נדב / Nadav, and made-up leaderboard first names.
No real emails or personal data. The clock is fixed to Thursday 22 October 2026 (13:00; the night scene 20:30). The
one-time "share usage statistics?" question is answered off-screen, so no screen shows it.

| # | Hebrew caption (title / subtitle) | English caption (title / subtitle) | Screen |
|---|---|---|---|
| 01 | כל משמרת בלחיצה אחת / מתחילים, מסיימים, ושעתי מחשבת את השכר | Every shift in one tap / Start, finish, and Shaati works out your pay | Home: month's gross pay card, Start shift button, tomorrow's shift, quick actions, recent shifts |
| 02 | שבת, לילה ושעות נוספות / כל תוספת מפורטת, שורה אחרי שורה | Shabbat, nights and overtime / Every premium listed, line by line | A shift's detail sheet (Shabbat and Rosh Hashanah, past midnight): time bar, pay, line-by-line breakdown |
| 03 | יש דוח שעות מהעבודה? / מעלים קובץ או צילום, וכל המשמרות בפנים | Got an hours report from work? / Upload a file or a photo, and every shift is in | Import an hours report: 5 shifts found, role picker, shifts to add (2 already exist) |
| 04 | בודקים את התלוש / ומגלים אם חסר לכם כסף | Check your payslip / and find out if money is missing | Payslip analysis for September 2026: 8 OK, 1 to check, 2 missing, estimated difference 320.00 |
| 05 | יודעים מה מגיע לכם / שכר מינימום, הבראה, חופשה ועבודת נוער | Know what you are owed / Minimum wage, recuperation pay, vacation and youth work | My rights: quick check of each role's rate against the minimum, travel, vacation, sick days, recuperation |
| 06 | דוחות וגרפים ברורים / כמה עבדתם וכמה הרווחתם, בכל חודש | Clear reports and charts / How much you worked and earned, every month | Reports > Charts: gross pay by month, hours by role |
| 07 | משחקים וטבלת אלופים / לומדים על זכויות ומתחרים על המקום הראשון | Games and a leaderboard / Learn about your rights and race for first place | Leaderboard (coins, today): podium and ranks 4 to 7, the user 5th |
| 08 | נוח לעיניים גם בלילה / מצב כהה ועיצובים לכרטיס השכר | Easy on the eyes at night / Dark mode and designs for your pay card | Home in dark mode at evening, the pay card in the "galaxy" design (a Plus design) |

Captions: no promise of accuracy and no link to any authority. Each title sits on one line; each subtitle fits in one line
(en/05: two lines, balanced). Lines break only between words (word-break: keep-all, no hyphens).

## Feature graphic

The app icon, the name שעתי, "משמרות, שכר וזכויות", the line "רושמים משמרות, רואים כמה הרווחתם ובודקים את התלוש.", the
pill "בלי פרסומות · עובד גם בלי אינטרנט", and the real home screen (evening, demo data) in a tilted phone.

## How they were made

Scratch scripts (not in the repo), based on shaati-handoff/qa/store-shots.js and feature-graphic.js:
`play-shots.cjs <docs> <out> <he|en>` and `play-fg.cjs <docs> <out>`; fonts are the app's own Fredoka and Rubik from docs/fonts.
