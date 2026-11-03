# Google Play Console checklist: Shaati 1.32.1 (versionCode 13201)

App: io.github.leelor123.shifts · Play app id 4975962257211357892 · developer 9008976356462415230.
State as of 3 Nov 2026. "Saved" = saved in Console, waiting in Publishing overview until "Send for review".

## Requirements checked online (3 Nov 2026)
| Requirement | Ours | Status |
|---|---|---|
| Target API 36 for new apps and updates from 31 Aug 2026 | targetSdk 36, minSdk 24 | OK |
| Icon 512x512 32-bit PNG ≤1 MB | 512x512 RGBA, 21 KB | OK |
| Feature graphic 1024x500 JPEG/24-bit PNG, no alpha | 1024x500 RGB | OK |
| 4+ phone screenshots 1080x1920 (for recommendations), 2-8 allowed | 8 he + 8 en, 1080x1920 RGB | OK |
| New personal account: 12 testers opted in to CLOSED testing for 14 days, then Apply for production | 0 opted in | USER |

## Build
| Item | Status |
|---|---|
| AAB 1.32.1 (13201) signed with the upload key, R8 on, adaptive icon, splash, name שעתי on Hebrew phones | Done (`ShiftPay-Android/release/1.32.1`) |
| bundletool 1.18.1 validate | Passed |
| Installed on the Galaxy (Android 17), opens full-screen without an address bar (assetlinks OK for both keys), 5 widgets registered | Done |
| Permissions: INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, BILLING (+ system receiver permission) | All used, none removed |

## Dashboard sections
| Console section | Status |
|---|---|
| Policy status | Rejected 25 Oct 2026 (Misleading Claims: no link to the source of government information). Fixed in the listing: official gov.il / btl.gov.il links + "private app, not a government body" in the first lines. Needs a new review |
| Store listing he (default) | Saved: name "שעתי: משמרות, שכר ותלוש", short, full (3492), new icon, feature graphic, 8 screenshots in order |
| Store listing en-US | Saved: "Shaati: Shift & Pay Tracker", short, full (3697), 8 English screenshots (feature graphic inherited, Hebrew) |
| Store settings | Productivity, contact lybtn48@gmail.com. Website empty: add https://shaati.web.app (the dialog's button is "Save and publish": waits for the owner's OK) |
| Privacy policy | https://leelor123.github.io/shifts/privacy.html (+ privacy.en.html, live) |
| App access | Saved: guest-mode steps for reviewers (4 steps, exact button texts) |
| Ads | No |
| Content rating | Done in Oct (expected Everyone/3+, Users interact, In-app purchases) |
| Target audience | 13+ |
| Data safety | Saved: + username/password accounts, Photos, Other actions, Diagnostics; approximate location now also Shared (MET Norway weather). See APP-CONTENT.md |
| Government / Financial features / Health / News / Advertising ID | Done (No / none / none / No / No) |
| Account deletion | delete-account.html (+ #data for partial deletion) |
| Internal testing | Draft release 13201 with notes: ready, waits for the owner's OK ("Save and publish" makes it live for the internal list at once) |
| Closed testing (Alpha) | New draft release 13201 with notes (replaces the rejected 12100); goes out with "Send for review" |
| Publishing overview | All of the above waits for "Send N changes for review": owner's OK |
| Subscriptions (Plus) | Blocked: no Google Payments merchant account. The owner (18+) sets it up; then create `shaati_plus_monthly` ₪6.90 and put the Plus paragraph back in the listings |
| Pre-launch report | Runs after the first review/rollout of 13201; check then |

## Waiting for the owner
1. OK to publish the internal test release 13201.
2. OK to "Send changes for review" (closed test release, listing, data safety, app access and the old October changes).
3. OK for the website field in Store settings.
4. Merchant account (identity, bank, tax: only the owner types these).
5. 12 testers opted in to the closed test for 14 days, then Apply for production (owner fills the form).
