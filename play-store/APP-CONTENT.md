# Shaati (שעתי): Google Play Console "App content" answers

App: **Shaati**, package `io.github.leelor123.shifts`, Trusted Web Activity (Bubblewrap) around the PWA at
`https://leelor123.github.io/shifts/`. Checked against the code of **1.32.1** (build adcf27c4, versionCode 13201) on
3 Nov 2026. Every answer below was verified in the code; the earlier drafts (`store/PLAY_STORE.md`, the memory note,
`legal-audit/B-data-vs-policy.md`) were only a starting point and are corrected where they were wrong.

Path in Play Console: **Policy and programs › App content** (Hebrew UI: מדיניות ותוכניות › תוכן האפליקציה).

---

## 0. What the app does with data (the trace this document is built on)

| Data | Where it lives | Leaves the phone? | Evidence |
|---|---|---|---|
| Shifts, roles and rates, employers, leave/sick days, additions, templates, day rules, payslip fields (redacted lines), pay gaps | IndexedDB; Firestore `users/{uid}/{store}/{id}` once signed in | Only when signed in (sync) | `src/app/store.js:18`, `src/app/cloud.js:260-266, 426-467`, `firestore.rules:11-21, 247-253` |
| Settings: optional name, birth date, gender, chosen town (name + town-centre lat/lon), tax profile (army service, degree, form 106), pay rules, Plus licence key, invite code | IndexedDB; Firestore `users/{uid}/kv/settings` once signed in | Only when signed in | `src/core/defaults.js:75-82, 126, 129, 158`; `src/app/cloud.js:22, 273-277` |
| Never synced: Claude API key, PIN lock, backup timestamps, payslip raw text, payslip image/PDF files, assistant chat history, pay-card photo | Phone only | No | `src/app/cloud.js:12-14, 22-23`; `src/app/views-assistant.js:7, 140`; `src/app/plus.js:48-51` |
| Account: Firebase UID, email, Google display name + photo URL, password (email/password accounts, held by Firebase Auth only) | Firebase Authentication (Google, USA) | Yes, when the user signs in | `src/app/cloud.js:183-213, 361`; `src/app/firebase-config.js:9` (email+password ON), `:7` (email link OFF) |
| Usage statistics (opt-in, off by default): random install ID, app version, platform, first/last day, active days, shift/payslip counts, age group, feature flags incl. Plus yes/no and where bought | Firestore `stats/{installId}` (admins only) | Only after an explicit yes, and only when signed in | `src/app/stats.js:36-66, 70-83`; `firestore.rules:25-29, 195-208`; `src/core/defaults.js:124` |
| Champions table (opt-in): nickname, emoji, background, Plus badge, best game scores | Firestore `lb/{uid}`, readable by every signed-in user | Yes, by choice | `firestore.rules:73-82, 210-245`; leave: `src/app/views-leaderboard.js:455, 506-510` |
| Friends' competition (opt-in): nickname, emoji, friend UIDs, optionally gross month/year/all-time and pay per hour | Firestore `fr/{uid}`, readable only by listed friends; invitations `inv/{code}` | Yes, by choice | `firestore.rules:87-107, 151-165`; `src/app/views-friends.js:94-110, 171, 208, 359-371` |
| Invite a friend: invite code `refc/{code}`, record `ref/{uid}` = who invited whom (UIDs + date) | Firestore | Yes, by choice; `ref` is never deleted | `firestore.rules:112-130`; `src/app/invite.js:133-144` |
| Support requests: reason, text, messages, first name, optional app version + platform + **full browser User-Agent**; guests also an email | Firestore `tickets/{id}` + `msgs` | Yes, when the user writes one | `src/app/views-support.js:161-162, 210-216, 84-96`; `firestore.rules:42-69, 176-190` |
| Weather for the opening sky: chosen town's coordinates rounded to 2 decimals (default Tel Aviv), no ID, no cookies, no referrer, at most hourly | MET Norway `api.met.no` (Norway) | Yes, automatically (guest too) | `src/app/sky.js:12-17, 28, 320-345` |
| Device location ("המיקום שלי" in the town picker) | Used on the phone to find the nearest town, then dropped | No | `src/app/placepicker.js:268-284` |
| AI features (payslip check, rights assistant, schedule photo reading) with the user's **own** Anthropic API key: redacted payslip text, question (+ optional numeric summary), schedule **photo** incl. colleagues' names | Anthropic API (USA), under the user's own key | Yes, only on the user's explicit action | `src/app/views-payslip.js:19, 585-620`; `src/app/views-assistant.js:5-7, 103`; `src/app/schedule-import.js:141, 165-166, 274`; `src/sw.js:97` |
| Plus purchase in the Android app | Google Play Billing (Digital Goods API + Payment Request) | Handled by Google Play | `src/app/plus.js:33-37, 115-123, 210-232` |
| Plus bought on the web: licence key + instance name "Shaati · Android/web · date" | Lemon Squeezy licence API (USA) | Yes, when the account holds a web key | `src/app/plus.js:41, 125-148, 133` |
| Pay-card photo (Plus): checked by an on-device NSFW model, kept on this phone | Phone only (model files downloaded from jsDelivr) | No | `src/app/plus.js:48-53, 357-363` |
| Payslip/timesheet OCR (Tesseract), PDF (pdf.js), Excel import (SheetJS) | On the phone; only the libraries and language data are downloaded | No (download only) | `src/app/docread.js:13`; `src/app/views-payslip.js:17-19, 61-68`; `src/app/import.js:18`; `src/sw.js:130` |
| Optional fonts from Google Fonts (only if the user picks one) | Download only | No (IP reaches Google) | `src/app/app.js:65` |
| "Add to Google Calendar": shift title/time in the URL the user opens | Google Calendar, opened by the user | User-initiated | `src/app/export.js:69-72` |
| Fingerprint unlock: WebAuthn platform authenticator, only a credential ID stored (in `lock`, device-only) | Phone | No | `src/app/app.js:697-710`; `src/app/cloud.js:22` |
| Notifications: local only, no push service, no FCM token | Phone | No | no `push` listener / `pushManager` / `getToken` anywhere in `src/` |
| Home-screen widgets: numbers passed over the TWA postMessage channel | Phone | No | `src/app/widgets.js:60-95` |

Not in the app at all: ads, analytics SDKs, crash reporting, tracking cookies, Advertising ID (searched `src/` for
adsbygoogle/admob/gtag/analytics/sponsor: no hits).

---

## 1. Data safety form

### 1.1 Data collection and security (first page)

| Console question | Answer | Why / evidence |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Section 0 |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Every endpoint is HTTPS: Firebase SDK `cloud.js:21`, Identity Toolkit `cloud.js:97`, MET `sky.js:28`, Lemon Squeezy `plus.js:41`, Anthropic SDK `views-payslip.js:19`, CDNs `sw.js:130`. The page itself is served over HTTPS (GitHub Pages) |
| Which of the following methods of account creation does your app support? | **Username and password** and **OAuth** (Sign in with Google). Not "Other" | `firebase-config.js:9` `AUTH_EMAIL_PASSWORD = true`; Google `cloud.js:183-197`; email link is OFF (`firebase-config.js:7`), no other providers (`:12` empty) |
| Delete account URL | `https://leelor123.github.io/shifts/delete-account.html` | Loads (HTTP 200, same as `docs/`), see section 3 |
| Do you provide a way for users to request that some or all of their data is deleted, without requiring them to delete their account? | **Yes**, URL `https://leelor123.github.io/shifts/delete-account.html#data` | Single records (trash icon), leave champions table, turn off statistics, sign out clears the phone |
| Has your app successfully completed an independent security review (MASA)? | **No** | Not done |
| (If asked) UPI / Families / other badges | Not applicable | |

### 1.2 Data types

Definitions applied (Google Play Data safety help):
- **Collected** = transmitted off the device by the app (including by libraries/web content inside it). Not collected:
  data processed only on the device.
- **Shared** = transferred to a third party. Exceptions used here: **(a) service providers** that process data on the
  developer's behalf (Google Firebase Auth/Firestore, Lemon Squeezy as merchant of record, Google Play Billing);
  **(b) user-initiated transfers the user reasonably expects** (joining the champions table or the friends'
  competition, sending a payslip/question/schedule photo to Anthropic with their own API key after tapping the AI
  button, opening Google Calendar, the share sheet); **(c) legal** is not relied on.
- **Optional**: Shaati has a full **guest mode** ("להמשיך כאורח, בלי חשבון", `views-login.js:136-147`) in which
  nothing in this table leaves the phone except the weather request and support requests the user chooses to write.
  Every type below can therefore be avoided while still using the app, so each is **Optional** ("Users can choose
  whether this data is collected").
- **Ephemeral**: No for every type stored in Firestore/Firebase Auth. See notes for MET Norway and Anthropic.

Select exactly these types (everything not listed: leave unticked).

| Category › Data type | Collected | Shared | Ephemeral | Required/Optional | Purposes (collected) | What exactly, evidence |
|---|---|---|---|---|---|---|
| **Personal info › Name** | Yes | No (b: nickname on champions table/friends is user-initiated) | No | Optional | App functionality, Account management | Optional name `defaults.js:76`; Google display name `cloud.js:361`; nickname `firestore.rules:79, 90, 146-150`; first name in support tickets `views-support.js:213` |
| **Personal info › Email address** | Yes | No | No | Optional | Account management, App functionality | Firebase Auth email (`cloud.js:201-206`); guest support tickets `views-support.js:161, 215` (answering the request) |
| **Personal info › User IDs** | Yes | No | No | Optional | Account management, App functionality | Firebase UID (`cloud.js:279`), friend UIDs in `fr.f`, `ref/{uid}` (`firestore.rules:87-130`) |
| **Personal info › Other info** | Yes | No | No | Optional | App functionality | Date of birth, gender, tax profile (army service, degree) `defaults.js:75, 126, 129` (synced in settings, `cloud.js:273-277`) |
| **Financial info › Purchase history** | Yes | No (a: Lemon Squeezy / Google Play) | No | Optional | App functionality, Analytics | Plus licence key in settings `plus.js:242`, `defaults.js:158`; Plus yes/no + where bought, tip yes/no in opt-in stats `stats.js:58-63`. Payment card data is handled only by Google Play / Lemon Squeezy (`plus.js:210-232`), so **User payment info is NOT ticked** |
| **Financial info › Other financial info** | Yes | No (b: amounts on a friends card only if the user chooses to show them) | No | Optional | App functionality | Hourly rates, pay, payslip fields, tax data `store.js:18`, `cloud.js:250-266`; friends' gross/hourly `firestore.rules:156-165` |
| **Location › Approximate location** | Yes | **See DECISION D1** (recommended: Yes, MET Norway) | No | Optional | App functionality | Chosen town + town-centre coordinates in synced settings `defaults.js:78-82`; coordinates rounded to 2 decimals sent to MET Norway `sky.js:327-333`. Precise location is used on the device only (`placepicker.js:273-277`), so **Precise location is NOT ticked** |
| **Messages › Other in-app messages** | Yes | No | No | Optional | App functionality (support), Account management | Support tickets + messages `views-support.js:210-216`, `firestore.rules:42-69` |
| **Photos and videos › Photos** | **See DECISION D2** (recommended: Yes) | No (b: user's own Anthropic key, explicit tap) | No | Optional | App functionality | Only the work-schedule photo for "קריאה חכמה עם Claude" goes off the device, to Anthropic `schedule-import.js:141, 165-166`. Payslip images/PDFs and the pay-card photo stay on the phone (`cloud.js:23`, `plus.js:48-51`) |
| **App activity › App interactions** | Yes | No | No | Optional | Analytics | Opt-in stats: active days, shift/payslip counts, feature flags `stats.js:38-66` |
| **App activity › Other user-generated content** | Yes | No (b) | No | Optional | App functionality | Shifts, notes, role/employer names, templates `store.js:18`; questions sent to the AI assistant with the user's key `views-assistant.js:139-160` |
| **App activity › Other actions** | Yes | No (b: shown on the champions table by choice) | No | Optional | App functionality | Game scores per period on `lb/{uid}` (`firestore.rules:210-245`). Google's own example for "Other actions" is gameplay |
| **App info and performance › Diagnostics** | Yes | No | No | Optional | App functionality | Support ticket "לצרף פרטים טכניים" (on by default, can be unticked): app version, platform, full User-Agent `views-support.js:162, 216` |
| **Device or other IDs** | Yes | No | No | Optional | Analytics | Random install ID = document ID of `stats/{installId}`, only after opting in to statistics `stats.js:78-80` |

NOT ticked (and why):
- Phone number, Address, Race/ethnicity, Political/religious beliefs, Sexual orientation: never asked.
- User payment info, Credit score: payment goes through Google Play / Lemon Squeezy only.
- Health and fitness: sick days are leave bookkeeping, not health data.
- Emails, SMS: none.
- Videos, Audio, Music files, Voice: none (game music is synthesised on the phone, `music.js`).
- Files and docs: payslip PDFs/images and imported timesheets/Excel stay on the phone (`cloud.js:23`, `import.js:18`).
  The text recognised from a payslip goes to Anthropic only after redaction and after the user approves it; it is
  covered by "Other financial info".
- Calendar events: the app never reads a calendar; "Add to Google Calendar" is a user-opened link (`export.js:69-72`).
- Contacts: none.
- Web browsing / in-app search history: none.
- Installed apps: none.
- Crash logs, Other app performance data: no crash reporting (`app.js:1063-1067` only silences storage errors).
- Precise location: on-device only (see above).

### 1.3 Notes the reviewer may ask about
- **Firebase (Google)** is a service provider (exception a). Firestore region me-west1 (Tel Aviv); Auth in the USA.
- **Anthropic**: the user pastes their own API key (`views-settings.js:909`), sees the redacted text first, and taps the
  AI button; nothing goes to Anthropic otherwise. This is a user-initiated transfer (exception b), so not "Shared".
- **MET Norway**: see D1.
- **Lemon Squeezy**: merchant of record for web purchases; in the Android app it is only asked to validate a licence
  key the account already holds (`plus.js:125-148`). Service provider (exception a).
- **Google Play Billing**: purchases in the Android app go through Google Play; Google does not ask developers to
  declare the payment data Google Play itself collects.

---

## 2. App access

Answer: **All or some functionality in my app is restricted** (כל הפונקציונליות או חלק ממנה מוגבלים).

Reason: everything core works without an account (guest + sample data), but the champions table, the friends'
competition, invite links and cloud sync need a signed-in account (`firestore.rules:73-75, 87-88, 112-113`), and
Shaati Plus needs a purchase or the free trial.

Instruction 1 (name: `Guest mode with sample data, no login`). Paste in "Any other information required to access
your app":

```
No login is needed for the core app.
1. On the first screen ("שלום") pick a language. "English" switches the whole app to English.
2. On the welcome sheet tap the third button: "Just look around (sample data)"
   (Hebrew: "רק להציץ (נתונים לדוגמה)").
3. On "The sample data is ready" tap "Continue as a guest, without an account"
   (Hebrew: "להמשיך כאורח, בלי חשבון"), then "Continue as a guest" (Hebrew: "להמשיך כאורח").
4. Tick "I have read and agree to the terms of use and the privacy policy"
   (Hebrew: "קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות") and tap "Agree and continue" (Hebrew: "אישור והמשך").
The app opens with a full sample month: shifts, pay calculation, payslip check, rights, reports, games and settings.
Features that need an account (champions table, friends' competition, invite links, cloud sync): on the last setup
screen, or in Settings > Me and my account > Account and sync, sign in with any Google account, or create an account
with "Save with email and password" (Hebrew: "שמירה עם אימייל וסיסמה"). Account creation is open to anyone.
Shaati Plus (optional pay-card designs) can be tried free for 3 days with no payment details, from the brush button
on the pay card on home, once the subscription is active in Play.
```

Verified live on 3 Nov 2026 in a clean browser: language screen → welcome sheet (buttons: "מסכים/ה לתנאים, בואו
נתחיל", "כבר יש לי חשבון, כניסה", "רק להציץ (נתונים לדוגמה)") → "הנתונים לדוגמה מוכנים!" with "שמירה עם Google",
"שמירה עם אימייל וסיסמה", "להמשיך כאורח, בלי חשבון" → dialog "להמשיך כאורח?" → terms screen "לפני שממשיכים".
(The last tap, accepting the terms, was not clicked in the check; code path: `views-legal.js:203-230` then home.)
Code: `views-onboarding.js:200-213, 233, 380-385`; `views-login.js:136-147, 175`; English strings from the built
bundle `docs/app.en.adcf27c4.js`.

The earlier draft said "tap the second button" and stopped there. It is the **third** button, and three more taps are
needed (guest, confirm, terms).

Instruction 2 (optional, see DECISION D4): a dedicated reviewer account (email + password) for the signed-in features.

---

## 3. Account deletion

| Console field | Answer |
|---|---|
| Can users create an account in your app? | **Yes** (Google sign-in, email + password) |
| Delete account URL | `https://leelor123.github.io/shifts/delete-account.html` |
| Partial deletion URL | `https://leelor123.github.io/shifts/delete-account.html#data` |

In-app path (exact names, `views-settings.js:133, 169`; `views-login.js:290-325`):
**הגדרות › אני והחשבון › חשבון וסנכרון › "מחק את כל הנתונים מהחשבון"** (English UI: Settings › Me and my account ›
Account and sync › "Delete all data from the account"), section "אזור מסוכן" (Danger zone). Then: confirm
"למחוק את החשבון ואת כל הנתונים?" › "מחק הכול", type "מחק" in "אישור סופי", and for a password account enter the
password. Google accounts may be asked to re-confirm (re-authentication if the sign-in is older than 4 minutes,
`cloud.js:557-567`).

What the deletion does (`cloud.js:553-596`), in this order, stopping before anything is lost if a step fails:
stats record of this phone, all support tickets + messages, champions row, friends card + own invitations, own invite
code (`Stats/Support/Champions/FriendsView/Invite.forget` with `strict`), then every document under `users/{uid}`, the
`users/{uid}` doc, the Firebase Auth user, and finally the phone's local data.

Web page check (live = `docs/delete-account.html`, HTTP 200, 3 Nov 2026): explains the 3 steps (Hebrew and English),
says deletion is immediate and permanent, lists what is deleted (shifts, roles, settings, payslips, gaps, leave,
champions row, friends card, invite code), what is kept (the who-invited-whom record, IDs only, so an account is
invited once), how to delete part of the data, and a fallback by email (`lybtn48@gmail.com`) with identity check.
It names the app ("Shaati") in the header. See mismatch M2 for small gaps in "nothing else is kept".

---

## 4. The other App content cards

### Ads
**No, my app does not contain ads.** No ad SDK or ad markup in `src/` (search for adsbygoogle/admob/doubleclick/gtag/
sponsor: none); privacy §1 and §3א say no ads. The Plus offer on home is the app's own in-app product, not an ad.

### Advertising ID
**No** (the app does not use the advertising ID). The merged manifest of the 1.32.1 build
(`ShiftPay-Android\twa\app\build\intermediates\merged_manifest\release\processReleaseMainManifest\AndroidManifest.xml:33-60`)
has only `POST_NOTIFICATIONS`, `com.android.vending.BILLING`, `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
`ACCESS_NETWORK_STATE`, `INTERNET`; no `com.google.android.gms.permission.AD_ID`. Dependencies are only
`androidbrowserhelper:2.7.4` and `androidbrowserhelper:billing:1.2.0` (`twa\app\build.gradle:215-217`); no Play
services ads/identifier library. Target SDK 36, min SDK 24.

### Target audience and content
- Age groups: **13-15, 16-17, 18 and over**. Do not tick anything under 13. Matches the terms (§7: minimum age 13,
  under 18 with a parent's consent) and the setup question, which accepts age 13+.
- "Could your app unintentionally appeal to children?" **No** (a pay/shift tool for workers; the games are pay and
  rights quizzes).
- Families implications: Google's Families policy and the "Designed for Families" requirements apply when the target
  audience includes children (under 13; some countries set a higher age). With 13+ only, the Families program does not
  apply. Selecting 13-15 still means: no personalised ads to these users (none anyway), content and interactions must
  suit teens, and Google may review the champions table/friends features as user interaction (nicknames are filtered,
  only nickname + emoji + scores are shown, rows can be removed by an admin, `firestore.rules:132-150, 81`). If the owner
  ever adds an under-13 group, the Families policy (certified ad SDKs only, privacy policy for children, teacher/parent
  approval rules) would apply. See D5.

### News apps
**No**, not a news app. The rights pages are fixed reference information with official sources.

### Government apps
**No.** The app says so in the rights centre: "שעתי היא אפליקציה פרטית, ו**אינה מייצגת** את משרד העבודה, רשות
המסים, המוסד לביטוח לאומי או כל גוף ממשלתי אחר. המידע כאן מבוסס על המקורות הרשמיים:" followed by gov.il links
(`views-rights.js:172-173`). The store listing drafts say it too (`play-store/listing-he.md:22`,
`play-store/listing-en.md:24`, `store/listing.md:24`), and the website's question pages (`site/*.html` "שעתי אינה גוף
ממשלתי ואינה מייצגת גוף ממשלתי").

### Financial features
**My app doesn't provide any financial features.** Shaati calculates estimated pay, tax, pension and rights from what
the user types, and checks payslips. It does not lend money, advance wages (not earned-wage access), hold or move
money, offer banking, payments between users, investing, crypto or insurance. Selling its own Plus subscription
through Google Play is not a financial feature. If the form shows a personal-finance/budgeting option, it is still
not required, because the app provides none of the regulated services.

### Health
**No health features** ("My app does not have any health features"). Sick days are counted only as paid leave days.

### COVID-19 contact tracing and status apps
**My app is not a publicly available COVID-19 contact tracing or status app.**

### Data safety
Section 1.

### Content rating (IARC questionnaire)
Category: **All other app types** / "Utility, Productivity, Communication, or Other" (not "Game": the games are a
small part). Email: the owner's (D6).

| Question area | Answer | Reason |
|---|---|---|
| Violence (incl. cartoon/fantasy, blood) | No | Games: catching coins (`views-games.js:29`), pay quiz, true/false rights quiz, memory pairs, "more or fewer hours" price game. Nothing violent |
| Fear / horror | No | |
| Sexuality, nudity | No | User photos only on the user's own card, filtered on the phone (`plus.js:357-363`) |
| Profanity / crude humour | No | Nicknames are user-entered but limited to 2-16 letters of one script, staff names refused (`firestore.rules:137-150`); covered by the interaction question |
| Controlled substances (drugs, alcohol, tobacco) | No | |
| Gambling: real money | No | |
| **Simulated gambling** | **No** | No betting, wagering, chance-based rewards, loot boxes, slot/roulette/card games. "Higher or lower" asks whether an item costs more or fewer work hours (knowledge, no stake); the only "slot machine" is a code comment about a number count-up animation (`views-games.js:877`). Scores bring medals only |
| Users can interact or exchange content (text, voice, images) | **Yes** | Champions table shows nickname, emoji and scores to all signed-in users; friends' competition shows the same plus optional pay totals to accepted friends. No chat, no free text between users, no images/voice. Support messages are user-to-developer only |
| Shares the user's current physical location with other users | **No** | The chosen town is never on `lb` or `fr` documents (`firestore.rules:151-157, 210-217`) |
| Users can purchase digital goods | **Yes** | Shaati Plus subscription, optional tips (`plus.js:33-40`) |
| Unrestricted internet access (web browser/search engine) | **No** | TWA scope is the app's own site |
| NFTs / blockchain | No | |
| Generative AI content (if asked) | Yes, optional | Rights assistant and payslip/schedule reading with the user's own Anthropic key, text only |

Expected result: **IARC 3+ / PEGI 3 / ESRB Everyone / USK 0**, with interactive elements **"Users Interact"** and
**"In-App Purchases"**.

### Other cards that may appear
- Sensitive permissions, photo/video permissions, foreground service, full-screen intent, exact alarms: **none used**
  (manifest above).
- Financial features / Health / Government: as above.

---

## 5. Privacy policy

URL for the Console: **`https://leelor123.github.io/shifts/privacy.html`**

Checks (3 Nov 2026):
- Loads: HTTP 200; the live file equals `docs/privacy.html` byte for byte (before this change). The website copy
  `https://shaati.web.app/privacy` is also 200 and the same version 1.7.
- Hebrew, version 1.7, effective 3 Nov 2026. Names the developer/controller **לי בטאן** and the contact
  **lybtn48@gmail.com** (`views-legal.js:24-26, 78`), the privacy contact (§13) and a response time of 30 days (§6).
- Matches the data safety answers: data types (§1), storage and access (§2), device-only data (§3), purposes, no ads,
  no sale (§4), third parties and countries (§5: Google, GitHub, Anthropic, MET Norway, CDNs, Google Play, Lemon
  Squeezy), rights and in-app deletion path (§6), retention (§9), minors (§10). Mismatches found are in M1-M8 below.

English version:
- Before this change only an **English summary** at the bottom of `privacy.html` existed (no full English page).
  `privacy.en.html` returned 404.
- The app already has a full English translation of the policy (the `en` catalog translates `views-legal.js`; i18n
  check shows 0 missing). I added it to the generator that makes the Hebrew page, so the build now writes
  **`docs/privacy.en.html`**: the full policy in English, `lang="en" dir="ltr"`, the translation note "This is a
  translation for convenience. The binding version is the Hebrew one" (from the catalog), English footer, and a link
  back to the Hebrew original. The Hebrew page's English summary now starts with a link to it.
- After the owner commits and pushes, the URL is `https://leelor123.github.io/shifts/privacy.en.html` (and
  `https://shaati.web.app/privacy.en` after `node tools/site-pages.js` and a hosting deploy). Either Hebrew or English
  can be given to Play; Hebrew is the binding text, so keep `privacy.html` in the Console.

Files changed for this:
- `tools/legal-pages.js`: `loadDocs(src, lang)` applies the `i18n/<lang>.json` translation; `page()` takes a language
  (lang/dir, skip link, footer labels, app name); `build()` also writes `privacy.en.html`; the English summary links to
  it; header comment updated.
- `docs/privacy.html` (one added line: the link to the English page), `docs/privacy.en.html` (new). Both generated by
  `node tools/build.js`.
- The build also deleted 12 older bundles `docs/app.{ar,en,es,fr,he,ru}.{597979c5,75da1c17}.js` (its normal clean-up:
  it keeps this build, the folder's, HEAD's and the live one, all adcf27c4). The live page uses adcf27c4. Restore them
  with `git checkout -- docs/app.*.597979c5.js docs/app.*.75da1c17.js` if they should stay.
- Tests: `npm test` 283 passed, 0 failed; `node tools/i18n.js check` 0 problems. Nothing committed, pushed or deployed.

### Mismatches between the policy/pages and the code

**All eight fixed in 1.32.3 (3 Nov 2026, commit a471d8d).** M1: tickets send `Support.device()` ("Android 15 · Chrome 140"),
and the policy names exactly that. M2: invitations I accepted are deleted on leaving/deletion (`meta.frAccepted`); the
page names what stays (IDs in former friends' lists, the who-invited-whom record, other phones' anonymous stats up to 13
months). Friends still keep a deleted ID until they remove it: telling "gone" from "not accepted yet" needs a rules
change. M3: every delete button uses `App.deleteAccount` (asks the password). M4-M8: texts as proposed below; the Plus
seller line also reads "לי בטאן (Lee Batan)". Checked by qa/report-test.js. The table below is the original finding.

| # | Mismatch | Evidence | Proposed fix |
|---|---|---|---|
| M1 | Support requests: the policy says "גרסת האפליקציה וסוג המכשיר"; the app sends the full browser User-Agent string (OS version, browser version, device model) | `views-support.js:216`; policy `views-legal.js:88` | Policy: "גרסת האפליקציה, סוג המכשיר ופרטי הדפדפן (User-Agent)"; or send only platform + a short device model |
| M2 | Delete page: "לא נשמר עותק נוסף" / "No copy is retained, except a record of who invited whom". Also left after deletion: this account's stats records from **other** phones (deleted after 13 months, as privacy §9 says), an accepted friend invitation `inv/{code}` holding the deleted UID until the inviter's app opens, and the deleted UID inside former friends' `fr.f` lists | `cloud.js:573-579`; `views-friends.js:98-106, 359-366` (deletes only `from == uid`) | Code: also delete `inv` where `to == uid` (rules allow it, `firestore.rules:106`); friends drop unknown UIDs when a card is gone. Page: add "רשומות סטטיסטיקה אנונימיות של טלפונים אחרים נמחקות עד 13 חודשים" |
| M3 | Settings › Backup "delete everything" calls `deleteAccountData()` without a password; for an email+password account signed in more than 4 minutes ago the re-authentication fails ("האימייל או הסיסמה לא נכונים"). The account path works | `views-settings.js:965-968` vs `views-login.js:317-324`, `cloud.js:563-564` | Ask for the password there too (reuse the account screen's flow) |
| M4 | The consent screen's summary ("בקצרה") tells a guest the data "נשמרים בטלפון ובענן... משויכים לחשבון שלך"; for a guest nothing goes to the cloud | `views-legal.js:216` | "...ואם התחברת, גם בענן של האפליקציה" |
| M5 | Privacy §3 (device-only data) does not list the Plus pay-card photo (kept only on the phone, checked by an on-device model) | `plus.js:48-51, 357-363` | Add "תמונת הרקע לכרטיס השכר (נבדקת בטלפון ונשמרת רק בו)" |
| M6 | Privacy §5 note "בסטטיסטיקת השימוש נרשם רק אם Shaati Plus פעיל..." says "only", but the record also has yes/no flags for a tip, an invite gift, a friend who joined, the tax refund check | `stats.js:58-63`; `views-legal.js:106` | Drop "רק" or list them: "...וגם אם נתת טיפ, קיבלת חודש מתנה מהזמנה או פתחת את בדיקת החזר המס (כן/לא בלבד)" |
| M7 | "Add to Google Calendar" puts the shift title and times in a Google Calendar link (user-initiated); not mentioned in §5 | `export.js:69-72` | One line in §5: "Google Calendar: רק כשבוחרים להוסיף משמרת ליומן, פרטי המשמרת עוברים לחלון של Google" |
| M8 | The policy names the operator only in Hebrew (לי בטאן). The Play developer account name is "Lee Batan" (per the release notes). Reviewers compare the two | `views-legal.js:24` (i18n-keep, so the English page also shows Hebrew) | Add the Latin spelling: "לי בטאן (Lee Batan)" |

Items from the earlier legal audit that are fixed in 1.32.1 (verified): strict deletion order (MUST 3,
`cloud.js:573-584`), stats opt-in (MUST 2, `stats.js:36`), delete page mentions the invite record (MUST 4),
widgets cleared on logout (SHOULD 5, `widgets.js:67-90`), payslip lines redacted before sync (SHOULD 6,
`cloud.js:250-264`), town in §1 (SHOULD 7), birth date purposes (SHOULD 8), sheetjs + tessdata in §5 (SHOULD 9),
14-day invitation wording (SHOULD 10), guest ticket retention (SHOULD 11, `views-support.js:325`), no email in the
users doc (SHOULD 12, `cloud.js:442-444`), legal pages self-host Rubik (SHOULD 13, `legal-pages.js:18-21`).

---

## 6. DECISIONS FOR THE OWNER

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Approximate location: "Shared" with MET Norway? The app sends the chosen town's coordinates (rounded, no ID) plus, like any request, the IP address to a public weather API that is not under contract with you | (a) Shared = Yes, purpose App functionality; (b) Shared = No, treating MET as a service provider / the data as not linked to a user | **(a)**: it is automatic (not user-initiated), and MET is not processing under your instructions. Small cost: the listing shows "may share location" |
| D2 | Photos: declare "Collected" for the schedule photo sent to Anthropic with the user's own key? | (a) Yes, Optional, not shared; (b) No, arguing the user sends it to their own Anthropic account | **(a)** (it does leave the phone, sent by the app) |
| D3 | Required vs Optional for account data (email, user ID, pay data) | Optional (guest mode exists) / Required for signed-in users | **Optional**, as in section 1 |
| D4 | Give Google reviewers a ready test account for the signed-in features | Create an email+password account (for example a new Gmail used only for review) with sample data, and put it in App access; or rely on "any Google account works" | Create one; I may not create accounts or enter passwords |
| D5 | Target ages: keep 13-15? | 13-15 + 16-17 + 18+ / only 16+ | Keep 13+ (it matches the terms). Go 16+ only if you want fewer teen-specific reviews |
| D6 | Email for the IARC questionnaire and for the public store contact | Any address you control | Use lybtn48@gmail.com, the address already in the policy |
| D7 | Is the Plus subscription `shaati_plus_monthly` active in Play Console (needs a payments profile, 18+)? If not, Plus is hidden in the app and "In-app purchases"/"digital purchases" still apply because the build has Play Billing; answer "Yes" anyway | | Answer Yes to digital purchases either way |
| D8 | The terms (§8א) mention buying on the web through Lemon Squeezy. Google Play's payments policy forbids steering Android users to other payment methods; a legal text mention is low risk, but a reviewer could flag it | Leave / show the Lemon Squeezy sentence only outside the Android app | Low priority; consider hiding that sentence when `App.androidApp` |
| D9 | Approve the policy wording fixes M1-M8 (legal texts are yours to approve; bump LEGAL_VERSION only for material changes, which re-asks every user) | | M1, M2, M5, M8 are worth doing before production |
| D10 | Commit and push `tools/legal-pages.js`, `docs/privacy.html`, `docs/privacy.en.html` so the English page goes live (and decide whether the 12 removed old bundles stay removed) | | Commit with the next release |
