# Release notes for 1.35.0 (Play Console › Release › Release notes)

Written 6 Nov 2026, before 1.35.0 is finished. What it brings, as briefed: a smooth opening even when the phone is
busy; an NFC sticker at work that starts and ends a shift with a tap; fixes to widgets and shortcuts; a "start shift"
tile in Android's Quick Settings.

**Before pasting, check against the finished build.** The NFC sticker was still being built on 6 Nov. If it does not
ship in 1.35.0, delete its line in every language (a release note that promises a missing feature is the same
Misleading Claims risk as the listing). The same goes for the Quick Settings tile.

Play's language tags: Hebrew is `iw-IL` (Play still uses the old code), Arabic `ar`, Amharic `am`. Paste only the
tags of languages that have a store listing translation in Console; Play rejects a tag with no listing. Spanish has
the same text under both `es-419` and `es-ES` (see listing-es.md). Limit 500 characters per language; counts printed
by node on the exact text between the tags.

iw-IL 183 · en-US 204 · ru-RU 213 · ar 182 · fr-FR 277 · es-419 254 · es-ES 254 · am 156.
(The 1.32.1 notes below used `<he-IL>`; Play's code for Hebrew is `iw-IL`.)

```
<iw-IL>
• פתיחה חלקה גם כשהטלפון עמוס
• מדבקת NFC בעבודה: מקרבים אליה את הטלפון, והמשמרת מתחילה או מסתיימת
• כפתור ״התחלת משמרת״ בהגדרות המהירות של אנדרואיד
• תיקונים בווידג׳טים ובקיצורי הדרך
</iw-IL>
<en-US>
• A smooth opening, even when the phone is busy
• An NFC sticker at work: hold your phone to it to start or end a shift
• A "Start shift" tile in Android's Quick Settings
• Fixes for widgets and shortcuts
</en-US>
<ru-RU>
• Плавное открытие, даже когда телефон загружен
• NFC-метка на работе: поднесите к ней телефон, и смена начнётся или закончится
• Плитка «Начать смену» в быстрых настройках Android
• Исправления виджетов и ярлыков
</ru-RU>
<ar>
• فتح سلس حتى عندما يكون الهاتف مشغولًا
• ملصق NFC في العمل: قرّب الهاتف منه لتبدأ الوردية أو تنهيها
• زر «بدء وردية» في الإعدادات السريعة في أندرويد
• إصلاحات في الأدوات والاختصارات
</ar>
<fr-FR>
• Une ouverture fluide, même quand le téléphone est très sollicité
• Une étiquette NFC au travail : approchez le téléphone pour commencer ou terminer un service
• Une tuile « Commencer le service » dans les réglages rapides d'Android
• Corrections des widgets et des raccourcis
</fr-FR>
<es-419>
• Apertura fluida, incluso cuando el teléfono está ocupado
• Una etiqueta NFC en el trabajo: acerca el teléfono para empezar o terminar un turno
• Un botón «Iniciar turno» en la configuración rápida de Android
• Correcciones en widgets y accesos directos
</es-419>
<es-ES>
• Apertura fluida, incluso cuando el teléfono está ocupado
• Una etiqueta NFC en el trabajo: acerca el teléfono para empezar o terminar un turno
• Un botón «Iniciar turno» en la configuración rápida de Android
• Correcciones en widgets y accesos directos
</es-ES>
<am>
• ስልኩ ሥራ በበዛበት ጊዜም መተግበሪያው ያለችግር ይከፈታል
• በሥራ ቦታ የNFC ተለጣፊ፦ ስልኩን ያስጠጉ፣ ፈረቃው ይጀምራል ወይም ያበቃል
• በAndroid ፈጣን ቅንብሮች ውስጥ «ፈረቃ ጀምር» አዝራር
• የዊጀቶች እና የአቋራጮች ማስተካከያዎች
</am>
```

For a native speaker: am line 1 ("opens smoothly even when the phone is busy") and the Quick Settings names
("הגדרות מהירות", "быстрые настройки", "الإعدادات السريعة", "réglages rapides", "configuración rápida",
"ፈጣን ቅንብሮች") should match what each language's Android shows; phone makers word them differently.

---

# Release notes for 1.32.1 (Play Console › Release › Release notes)

What changed since 1.21.0, the version the testers had (from the in-app changelog, src/app/views-guide.js, and
LOG.md). Limit 500 characters per language; counts printed by node on the exact text between the tags.
Paste the whole block below into the release notes box.

Hebrew: 467 characters. English: 498 characters.

```
<he-IL>
• כניסה עם אימייל וסיסמה, או התחלה כאורח/ת: הנתונים נשמרים בטלפון
• שעתי גם באנגלית, בערבית, ברוסית, בצרפתית ובספרדית
• בדיקת החזר מס לשכירים, עד 6 שנים אחורה
• תחרות עם חברים, והסכומים מוסתרים עד שבוחרים להציג אותם
• שעות נוספות גם לפי שבוע עבודה, כאפשרות בהגדרות
• תזכורות למשמרת, אישור משמרות מתוכננות ודוח שעות ב-PDF
• דוח שעות מצילום נקרא כטבלה, ולכל תפקיד אפשר תמונה או אימוג'י
• מצב פרטיות שמסתיר סכומים, ונעילת קוד חזקה יותר
• מראה חדש ופתיחה עם פעולות מהירות
</he-IL>
<en-US>
• Sign in with email, or start as a guest with your data on the phone
• A photo or emoji for each role
• Shaati in English, Arabic, Russian, French and Spanish
• Tax refund check for employees, up to 6 years back
• A pay contest with friends, amounts hidden until you show them
• Overtime by the working week, an option in Settings
• Shift reminders, confirming planned shifts, hours report as PDF
• Privacy mode that hides amounts, and a stronger code lock
• A new look and quick actions at launch
</en-US>
```
