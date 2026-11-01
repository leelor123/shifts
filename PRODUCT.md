# Product

Shaati (שעתי): shift tracking and pay checking for hourly workers in Israel. Written with impeccable `init` on
2026-11-01 from the project's own records (CLAUDE.md, store/listing.md, the app) and confirmed by the user.

## Platform

web (an installable PWA; on Android it ships as a Trusted Web Activity in Google Play)

## Stack

Plain HTML, CSS and JavaScript (no framework), one page per language built by tools/build.js into docs/ (GitHub
Pages); Firebase Auth and Firestore for sign-in and sync; IndexedDB on the phone; the website is static in site/
(Firebase Hosting, shaati.web.app).

## Users

Hourly workers in Israel: waiters, cashiers, couriers, ushers, babysitters, instructors, call-centre staff, students
and teens (many under 18, about half of Israeli teens on iPhone). Hebrew first, also Arabic, Russian, English, French,
Spanish. They open it on a phone, often standing, at the start or end of a shift, sometimes at night, often with
little attention and a weak connection.

## Product Purpose

Know exactly what each shift paid (Shabbat, holidays, nights, overtime, travel, youth minimum wage) and check that
the payslip matches; know your rights (recuperation, vacation, sick pay, tax refund) without reading the law.

## Positioning

A private personal tool, not an employer system and not a government body. Free, no ads; Shaati Plus adds designs
and the full tax-refund report.

## Operating Context

Operate mode for the app (start/stop a shift, add a shift, check a payslip, read a report); Persuade mode for the
website home page; Read mode for the website's question pages (overtime, minimum wage, tax refund...).

## Capabilities and Constraints

Works offline; data stays on the phone and in the user's own Google account; text size setting 80-130%; light and
dark; RTL and LTR languages; a CSP that runs only the app's own scripts; no layout jump or flicker is tolerated (the
user checks frame by frame); the opening show and the pull-to-refresh coin animation are fixed and not changed.

## Brand Commitments

Name Shaati / שעתי; the logo (two strokes forming a clock-like mark) and the premium opening show: navy #0d2b6b with a
gold hairline dial, the visual source of the app's look from 1.29.0. Font: Rubik (self-hosted). Tone (confirmed by the
user): warm and direct, not childish; it speaks to teens like a trusted money app would.

## Evidence on Hand

Real app screens with demo data (qa/live-shot.js, qa/store-shots.js), Lighthouse and the impeccable detector results
(shaati-handoff/impeccable-app.json, impeccable-site.json), store screenshots in store/screenshots/.

## Product Principles

Accuracy above all (pay and law numbers come from the engine and official sources); one tap for the daily action;
never hide money that is owed; privacy by default; no word broken in the middle and no short label on two lines.

## Accessibility & Inclusion

Israeli standard IS 5568 (WCAG 2.0 AA) as the floor, WCAG 2.1 beyond it; screen readers in Hebrew; reduced motion
respected; minimum 16px inputs; touch targets 44px or more; six languages, two directions.
