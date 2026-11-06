# Shaati: Google Play submission prep

Checked on 6 Nov 2026 against the code in this repo (web app `src/`, built to `docs/`) and the Android wrapper in `C:\Users\User\ShiftPay-Android\twa` (AAB 1.32.5, versionCode 13205).

- Package: `io.github.leelor123.shifts`.
- Type: a Trusted Web Activity made with Bubblewrap and androidbrowserhelper 2.7.4, plus Play Billing 1.2.0 and five home-screen widgets.

## Bottom line

Nothing found that blocks review. The things Play rejects most often are covered:

| Area | Status | Where |
|---|---|---|
| Target API | targetSdk 36 meets the current rule | `twa/app/build.gradle:59` |
| Digital purchases | In the Android app Shaati Plus is bought only through Google Play Billing. The Lemon Squeezy checkout, the email code field and the external links are hidden there. | `src/app/plus.js:70`, `:202`, `:443` |
| Account deletion in the app | Yes: the account screen › "מחק את כל הנתונים מהחשבון", and Settings › data › "מחק את כל הנתונים" | `src/app/views-login.js:17`, `src/app/cloud.js:613` |
| Account deletion on the web | Yes, live (HTTP 200) at https://shaati.web.app/delete-account | `site/delete-account.html` |
| AI-generated content | Each AI answer has a "report this answer" button | `src/app/views-assistant.js:119` |
| User-generated content | Leaderboard nicknames have a "report a nickname" button | `src/app/views-leaderboard.js:302` |
| Privacy policy | Yes, Hebrew and English | https://shaati.web.app/privacy, `/privacy.en` |
| Ads and tracking | None. No ad SDK, no analytics SDK, no cookies. | |

## 1. Permissions

From `twa/app/src/main/AndroidManifest.xml`:

| Permission | Sensitive? | Needed? | Why |
|---|---|---|---|
| `android.permission.POST_NOTIFICATIONS` | Runtime permission, not a restricted one | Yes | Weekly and monthly summaries, reminders, and the running-shift notification (1.34.0). It is asked for only when the user turns notifications on. |

That is the only permission the app declares. There is no location, camera, contacts, SMS, storage or background permission, so no Permissions Declaration form is needed.

Other manifest notes:

- **Exported components.** `PaymentService`, `PostMessageService`, `DelegationService` and `WidgetStyleActivity` are exported. That is standard for TWA billing, notifications and widget setup. `PaymentService` checks its caller at runtime.
- **Share target.** It accepts text, images, PDF, CSV and Excel shared into the app, for importing schedules and payslips. This needs no permission.
- **Location.** The web app can ask the browser for location once, to pick the nearest city (`src/app/placepicker.js:273`). The location stays on the phone and only the chosen city is kept. The Android app has no location permission, so in the TWA this request goes through Chrome's own site permission.
- **`allowBackup="true"`.** Android backup copies the widgets' snapshot (pay amounts, the running shift, the savings goal) stored by `WidgetData.java`. The rest of the user's data lives in Chrome's storage for the site. Play does not count Android's own backup as collection, so this does not change the form. The next AAB can exclude that file with backup rules (see the scan section below).

## 2. Data safety answers (draft)

Ground rules for the form:

- A guest sends very little: the chosen city's coordinates go to MET Norway for the weather picture (see below), and a support request sends the reply email and name the guest types. Everything else is optional or only happens after sign-in.
- All traffic is HTTPS, so **"Is all user data encrypted in transit?" = Yes**.
- **"Do you provide a way for users to request deletion?" = Yes**, both in the app and at https://shaati.web.app/delete-account.
- **Sharing.** The app sells no data and has no ads. Most transfers are service providers acting for us (Google Firebase) or ones the user starts and expects: AI with the user's own Anthropic key, "add to Google Calendar". Play does not count those as "sharing".
- **One exception: MET Norway.** The weather request runs on its own, for every user, about once an hour. It sends the chosen city's coordinates, rounded to about 1 km, to a public API (`src/app/sky.js:330`). To be safe, mark **Approximate location: Shared = Yes** (purpose App functionality). Mark **Shared = No** for every other type.

| Data type (Play category) | Collected | Optional? | Purposes | Notes |
|---|---|---|---|---|
| Personal info › Email address | Yes | Optional | Account management, App functionality | Firebase Auth, or the reply address on a support request sent without an account |
| Personal info › Name | Yes | Optional | App functionality, Account management | Google profile name, or a first name the user types (also sent with support requests) |
| Personal info › User IDs | Yes | Optional (sign-in) | Account management, App functionality | Firebase UID |
| Personal info › Other info | Yes | Optional | App functionality | Date of birth and gender, for age-based minimum wage and youth rules |
| Financial info › Other financial info | Yes | Optional (sign-in, cloud sync) | App functionality | Shifts, hourly rates, pay, payslip numbers the user confirmed; the optional numeric summary sent to the AI assistant |
| Financial info › Purchase history | Yes | Optional | App functionality | Whether Plus is active and where it was bought. No card details. |
| Location › Approximate location | Yes, **Shared = Yes** | Not optional (the weather runs for everyone; Tel Aviv when no city is chosen) | App functionality | The chosen city, for Shabbat and holiday times; its coordinates, rounded to about 1 km, go to MET Norway for the sky picture. Device GPS never leaves the phone. |
| Messages › Other in-app messages | Yes | Optional | App functionality (support) | Support tickets |
| Photos and videos › Photos | Yes | Optional | App functionality | Only a work-schedule photo the user chooses to send for AI reading, with their own key |
| Files and docs | Yes | Optional | App functionality | Only payslip text the user approves for AI analysis, with ID, bank, address, phone and email removed first. The files themselves stay on the phone. |
| App activity › App interactions | Yes | Optional (off until the user agrees) | Analytics | Daily anonymous record per device under a random ID, not linked to the account |
| App activity › Other user-generated content | Yes | Optional | App functionality | Leaderboard nickname, emoji and scores; friends' contest card; questions typed to the AI assistant (sent to Anthropic with the user's own key) |
| App info and performance › Crash logs | Yes | Optional (same consent as stats) | Analytics | Error reports with addresses, text and numbers stripped out |
| App info and performance › Diagnostics | Yes | Optional (same consent as stats) | Analytics | App version, system and browser main versions |
| Device or other IDs | Yes | Optional (same consent as stats) | Analytics | Random install ID, not the advertising ID or a hardware ID |

Not collected: precise location, contacts, calendar contents, health, audio, web history, installed apps, advertising ID, payment card data. Google Play handles payment details.

Third-party code inside the AAB is androidbrowserhelper and Play Billing only. The web app also loads libraries on demand from public CDNs: tesseract.js, pdf.js, SheetJS, the Anthropic SDK and nsfwjs. They run on the phone. The only data they send is to Anthropic, with the user's key, as listed above.

**Other forms in App content:**

- **Ads:** No ads.
- **Target audience:** 13 to 15, 16 to 17, and 18+. The app is for working teens and adults, and its youth rules cover minors who work.
  - Do not pick an under-13 group. That would put the app in the Families program.
- **Financial features:** It does not offer loans, banking, payments between users, crypto or investing. It is a personal pay calculator. If asked, choose "My app doesn't provide any financial features".
- **Health apps:** No.
- **Government apps:** No. It links to gov.il pages but does not speak for the government.
  - The store listing must not suggest it is official.
- **News app:** No.
- **AI-generated content:** Yes. Users can report answers in the app.

## 3. Account deletion

- **In the app:** the account screen › "מחק את כל הנתונים מהחשבון" (`src/app/views-login.js:303`), or Settings › data › "מחק את כל הנתונים" (`src/app/views-settings.js:952`). Both call `App.deleteAccount` (`src/app/views-login.js:17`).
  - It deletes the Firestore data, the leaderboard row, the friends card, invites and support tickets, then the Firebase Auth user (`src/app/cloud.js:613-656`).
  - A password user is asked for the password first, as Firebase requires.
- **On the web:** https://shaati.web.app/delete-account. It is live, in Hebrew with an English heading, and explains how to delete in the app or by email.
- **In Play Console:** enter `https://shaati.web.app/delete-account` under App content › Data deletion.

Both exist, so this does not block review.

## 4. App access instructions for reviewers

In App content › App access, choose **"All or some functionality is restricted"**. The core app works as a guest, but cloud sync, the leaderboard, friends and the support history need sign-in.

Paste this, with real test details in place of the placeholders:

> Shaati works without an account: tap "להמשיך כאורח, בלי חשבון" (continue as a guest) at the sign-in step to use shift tracking, pay calculation, reports and payslip checks.
> To review the signed-in features (cloud backup, leaderboard, friends contest, support history), sign in with email and password:
> 1. Open the app and finish the short welcome steps.
> 2. At the sign-in step tap "שמירה עם אימייל וסיסמה" (save with email and password).
> 3. Email: `REVIEWER_EMAIL@example.com`  Password: `REVIEWER_PASSWORD`
> The account has sample shifts already. Shaati Plus can be tested with Google Play's license testing; no purchase is needed to reach the main features.
> The AI assistant needs the user's own Anthropic API key and is optional; all other features work without it.

Create this account yourself with a fresh password, add a few shifts, and keep it working. Play rejects apps whose test account stops working.

## 5. Closed testing and target API (checked in Play Console Help on 6 Nov 2026)

- **Closed testing rule** ([answer 14151465](https://support.google.com/googleplay/android-developer/answer/14151465)):
  - Personal accounts created after 13 November 2023 must run a closed test with **at least 12 testers who stay opted in for 14 days in a row** before they can apply for production.
  - It applies if the developer account is a personal account opened after that date. The page cannot tell me which kind yours is: check Play Console › Settings › Developer account.
  - Your app is already in closed testing, so this looks like it applies. Count 14 days from the day the 12th tester opted in. A tester who leaves and rejoins restarts their count.
- **Target API** ([answer 11926878](https://support.google.com/googleplay/android-developer/answer/11926878)):
  - Since 31 Aug 2026, new apps and updates must target **Android 16 (API 36)** or higher. The extension ran to 1 Nov 2026 and is over.
  - The AAB targets 36, so it passes.

## Still to do by hand (in Play Console)

1. Upload `C:\Users\User\ShiftPay-Android\release\1.32.5\shiftpay-1.32.5.aab` to the closed testing track. It holds the new widgets.
2. Fill in the Data safety form from section 2.
3. Under App content › Data deletion, enter `https://shaati.web.app/delete-account`.
4. Create the reviewer account and paste the App access text from section 4 with the real details.
5. Fill in Target audience (13+), Ads (none), Financial features (none) and AI content (yes, with in-app reporting).
6. Get 12 testers opted in and keep them for 14 days in a row, then apply for production.
7. Check that the developer account is personal or organization, which decides whether step 6 applies.

## Review Ready scan (6 Nov 2026)

Five auditors checked privacy, payments, permissions, metadata and crash risk for Google Play. They found **no blockers and no high-severity issues**.

Fixed in web release 1.34.0 (no new AAB needed):

- **Payments (MEDIUM).** Inside the Play app, a subscription bought on the website no longer gets a "manage or cancel" button that opens Lemon Squeezy's orders page. It now shows a line saying to cancel from the receipt email (`src/app/plus.js:115`). A unit test (`tests/playpay.test.js`) fails if any Lemon Squeezy page in plus.js is not kept out of the Play app.
- **Free-trial wording (LOW).** Under the "try 3 days free" button in the Plus sheet: no payment details, and when the trial ends everything goes back to normal with no charge.
- **Data safety notes (MEDIUM, this file).** MET Norway is marked as shared. Guest support emails, AI questions and the AI summary are now listed.

Left for the next AAB (none is a rejection risk):

- Add `source=twa` to the three launcher shortcut URLs in `twa-manifest.json`. Until the website checkout is configured (`pay-config.js` checkout is empty today), nothing can leak.
- Exclude the `shaati_widgets` preferences from Android backup (data extraction rules).
- Add null guards in `WidgetData.save()` (line 45) and `tap()` (line 117), the same as in `pending()`.
- Optional: a themed (monochrome) launcher icon, a full-square Play Store icon without rounded corners, and turning release lint back on.
- Bump versionCode above 13205 for the next upload.

Not changed, by decision: the Terms shown in the Android app still describe the website purchase as plain text with no link. They are a legal document that must read the same everywhere, and the scan rated this very unlikely to matter.

To confirm in Play Console:

- The second fingerprint in https://leelor123.github.io/.well-known/assetlinks.json (3E:E2:CE:...:23:8E) must equal App integrity › App signing key SHA-256. If it does not, the app opens with a browser address bar.
- 13205 must be higher than every versionCode uploaded so far.
