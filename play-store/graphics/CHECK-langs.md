# Google Play screenshots: ru, ar, fr, es, am (app 1.34.0, built 2026-11-06)

Made with `C:\Users\User\shaati-handoff\qa\store-shots.js <docs> <out> <lang>` on a fresh `node tools/build.js`
(1.34.0, ff139f7b). Each folder holds 8 PNGs, 01-home … 08-dark, upload in that order.

## Measured (IHDR + tRNS read by script)
All 40 files: 1080 x 1920, 8 bits per channel, colour type 2 (RGB), no tRNS, so no alpha. 500 to 660 KB each.
Google's phone limits (2 to 8 per language, 9:16, 24-bit PNG or JPEG, no alpha; 1080x1920 for recommendations): pass.

## Checked by eye
Every image of ru, fr and am, and ar 01-05, 07, 08 (after the caption fix), es 01-05, 07 were opened and read.
- Captions: one line for every title (the tool shrinks a long title, smallest 64 px in ru), subtitles in one or two
  lines broken between words only (word-break: keep-all, text-wrap: balance).
- Arabic: RTL throughout (app and captions); numbers, ₪ and Latin words (Shaati, Excel, PDF) placed correctly.
- Amharic: captions in Noto Sans Ethiopic, the app in its own Ethiopic font; nothing falls back to boxes.
- Hebrew left on screen: the tool now lists any visible Hebrew text in a translated picture. Result for all five
  languages: "no Hebrew on screen".
- No placeholder text, no demo or backup banners, no consent card (answered off-screen), no toast.

## Fixed while making them
- Captions rewritten in all languages (tool): the old ru/ar/fr/es subtitles promised "by the law, to the shekel"
  (the Misleading Claims rejection of 25 Oct 2026) and "looks great"; scene 08 advertised Plus card designs, which
  the Android app does not sell. Now: "every premium listed, line by line" and "dark mode, by hand or by the phone".
- Scene 08: plain dark mode at 20:30 (evening sky) instead of the Plus "galaxy" card at 13:00.
- The "share usage statistics?" card covered the lower half of 01 and 08: now answered off-screen (statsAsked).
- ar 01: the subtitle "وShaati" rendered as "Shaatiو" (bidi). Rephrased to "ويحسب Shaati أجرك".
- Amharic was not supported by the tool (no captions, no names): added, with an Ethiopic web font for captions.

## Left as the app shows them (app issues, not the pictures)
- ru 02-shift: the label "Оплачиваемые часы" breaks inside the word ("Оплачиваем / ые") in the narrow three-column
  KPI of the shift sheet. Fix in the app: a shorter ru string ("Часы к оплате") or a label rule that never breaks a
  word (i18n/ru.json "שעות לתשלום", styles.css .kpi .l). After that, rerun the tool for ru.
- es 01-home and 08-dark: the date reads "jueves, 22 de octubre de" (a dangling "de"). views-home.js line 452 cuts
  the year with `.replace(/\s\d{4}$/, '')`, which leaves Spanish "de" behind and leaves the year in Russian
  ("2026 г."). Formatting without the year (as sky.js does: weekday, day, month) fixes every language.
- ar: the greeting uses a Latin comma ("نهارك سعيد, نادر"); Arabic takes "،".
- 07-games in every language shows two players with a "Plus" badge, as on the he/en pictures. Plus is not sold on
  Android yet; if the reviewer objects, drop the badges from the seeded leaderboard (bg: '' for u2 and u4).
- 03-import: the third role chip is cut at the edge because that row scrolls sideways (same in he/en).

## Feature graphic
None per language yet: every translation keeps the Hebrew feature-graphic.png.
