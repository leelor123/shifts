# Google Play listing: English (en-US)

App 1.37.4. Rewritten on 14 Nov 2026 around the payslip check, the one thing no competing app does, to match the
Hebrew listing (see its note of the same day). For English-speaking workers in Israel (Play shows this page to anyone
whose phone is set to English, and many Israelis keep their phone in English). Every claim was checked against src/.
Counts printed by node on the exact strings inside the blocks (`[...s].length`, characters, not bytes). Paste in Play
Console › Main store listing › Manage translations › English (United States).

---

**App name** (max 30 characters: 29)
```
Shaati: Payslip & Shift Check
```

**Short description** (max 80 characters: 80)
```
Payslip check by Israeli labour law and your shifts. No ads, files stay on phone
```

**Full description** (max 4000 characters: 3983)
```
Shaati checks your payslip. Upload it, and the app reads it on your phone, compares it with the shifts you logged and with Israel's labour law rules, and explains every line that does not add up.

Important: Shaati is a private app. It is not affiliated with and does not represent any government body, including the Ministry of Labor, the Israel Tax Authority and the National Insurance Institute. The official sources are linked at the end and in the app.

Payslip check
• Upload a payslip (PDF or photo). It is read on your phone, and the file never leaves it
• Start with the payslip before you log a single shift: minimum wage, pension, National Insurance, income tax and deductions
• With your shifts logged: missing hours, Shabbat and holiday premiums, overtime and travel that were not paid
• The estimated gap and a plain explanation of each finding, in your language
• A pay inquiry report (PDF) and a polite letter for your employer

Israel's labour law math
• Shabbat and holiday premiums by your town's Shabbat times
• Overtime (125% and 150%), night premium, rounding and a minimum shift
• Minimum wage by age and date, with an alert if your rate is below it
• Estimated net: income tax, credit points, National Insurance, health tax, pension

Time clock and shifts
• Tap to start and tap to finish, breaks included, or add a past shift
• Import your schedule from a photo or a WhatsApp message
• Import an hours report (Excel, CSV, PDF or a photo) and compare it with your shifts before payday
• Forgot to end a shift? The app asks and suggests your usual finishing time
• Several workplaces and roles, each with its own rate; travel, tips, bonuses and shift reminders
• On Android: start and end a shift from a home-screen widget, and an optional notification with the pay so far

Workers' rights
• An offline rights guide: minimum wage, overtime, Shabbat, travel, sick pay, vacation, recuperation pay, pension
• Holiday pay: which holidays you may be owed pay for, and how much
• Working teens: night hours, day and week length and breaks under the Youth Employment Law
• Tax refund check for employees: an estimate from your shifts, payslips or Form 106

Reports and goals
• Weekly, monthly and yearly summaries, charts, a Hebrew and Gregorian calendar
• Export hours to PDF, Excel and your calendar
• A monthly goal and a savings goal, medals, five short games and a contest with friends

Privacy, no ads
• No ads. Usage statistics without your name, email or amounts, only if you agree
• Payslip files stay on your phone. Use it as a guest and all your data stays on the phone
• With an account (Google or email), your data is also saved in your account. Other users cannot see it, except what you share with friends, and we do not sell it
• Works offline; code or fingerprint lock; export or delete your data and account at any time
• In English, Hebrew, Russian, Arabic, French, Spanish and Amharic

Official sources (in Hebrew)
Ministry of Labor:
• Minimum wage: https://www.gov.il/he/pages/minimum-wage
• Hours and overtime: https://www.gov.il/he/pages/overtime-and-extra-hours
• Weekly rest and holidays: https://www.gov.il/he/pages/weekends-and-holidays
• Working youth: https://www.gov.il/he/pages/rights-of-working-youth
• Annual leave: https://www.gov.il/he/pages/annual-vacations
• Recuperation pay: https://www.gov.il/he/pages/convalescence-pay
• Sick pay: https://www.gov.il/he/pages/paid-sick-leave
• Travel: https://www.gov.il/he/pages/travel-allowance
• Pension: https://www.gov.il/he/pages/pension-insurance
Israel Tax Authority:
• Income tax: https://www.gov.il/he/departments/israel_tax_authority/govil-landing-page
• Tax refund for employees: https://www.gov.il/he/service/simulator-employee
National Insurance Institute:
• National Insurance and health tax: https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx

The calculations are estimates, not legal, accounting or tax advice. When in doubt, check with your employer or an accountant.
```

---

## How this answers Google Play's rejection (25 Oct 2026, missing source link for government information)
1. Official sources: the "Official sources" block at the end, 12 links to government sites only (gov.il of the
   Ministry of Labor and the Israel Tax Authority, btl.gov.il of the National Insurance Institute), the same pages as
   the Hebrew listing. Each one opened in a browser on 3 Nov 2026 and showed the right page.
2. Disclaimer high up: the second paragraph, "Important: Shaati is a private app. It is not affiliated with and does
   not represent any government body...", which also points to the links.
3. No precision promise: "see an estimate of their pay"; no "exactly", "to the shekel" or "by law" as a promise.

## Notes
- Search words placed for English-language searches from Israel: payslip, payslip check, shift, labour law, overtime,
  Shabbat, minimum wage, tax refund, time clock, Israel. The old name "Shaati: Shift & Pay Tracker" became
  "Shaati: Payslip & Shift Check"; "shift tracker" and "pay tracker" drop out of the name (watch the search terms report).
- No price, "free", "best", "#1", emoji or "download now" (Google Play rules). The Plus paragraph stays out until
  the subscription exists (see the note in listing-he.md).
- New claims checked in src/ and the in-app changelog (src/app/views-guide.js): widget start/end (1.32.5,
  android/widgets), hours report against shifts and per-line payslip explanations (1.33.0), the running-shift
  notification under Settings › Notifications (1.34.0, run-note.js), seven languages (i18n/).
- The Hebrew listing (listing-he.md) now carries the same additions (14 Nov 2026).
- Fitting under 4000: the 14 Nov rewrite leaves out "Your month as a short story", the alerts line, the champions table
  and the AI assistant paragraph (all still true, the Hebrew listing keeps the AI paragraph).
