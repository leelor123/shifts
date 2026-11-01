# Design: Shaati, "midnight & gold" (from 1.29.0)

Written at the finish of the impeccable new-work run (2026-11-01) from the built world, not a plan. Product truth:
PRODUCT.md. Direction contract: .impeccable/surfaces/src-index-html.md. Source of the look: the opening show (navy
#0d2b6b, gold hairline dial).

## Palette

| Token | Light | Dark | Job |
|---|---|---|---|
| ground `--surface` | #f6f4ee cream | #0e1118 night | the page |
| card `--surface-1` | #ffffff | #161a24 | grouped content on a 1px hairline (`--line`) |
| ink `--brand-strong` | hsl(h s 26%) = #0d2b6b at the default accent | hsl(h 75% 82%) | structure, links, where you are |
| pay card `--grad-hero` | radial navy, from the accent's hue | same | the month's money, the signature dial |
| gold `--gold` | #e9c987 (text #8a6a23 on cream) | #e9c987 | value only: the pay label, the summary title, the second hand |
| go `--go` | #0b6b49 | #0b6b49 | the one daily action (start a shift) |

The accent setting still works: every ink and the pay card take the chosen hue (`--h`, `--s`); "midnight" (221, 78)
is the default. Gold and go-green never change. Games keep their own playful colours (the quiz buttons).

## Type

One family: Rubik (self-hosted, fonts/), weights 400-700, headings tracked -0.025em, money in tabular figures with
-0.045em on the big number. Fredoka remains only inside the games' canvases.

## Shape and depth

Cards 18-28px radius, a hairline instead of a shadow; one neutral offset shadow (`--sh-2`) only on the pay card and
floating things. No coloured glows, no drifting halos, no gradient text.

## Motion

Strong ease-out `cubic-bezier(.23, 1, .32, 1)` for entrances and exits (no overshoot); presses scale to 0.97 in
160ms; the dial's second hand is the only constant motion and keeps its phase across redraws (App.phase). Reduced
motion turns it off. The opening show and the pull-to-refresh coin are fixed and outside this system.

## Signature

The gold hairline dial on the pay card (`.hh-dial`): ring, ticks and second hand in gold over the navy card.

## Components

Tab bar: one frosted material (`color-mix` of the ground + blur), ink pill for the current tab, the add button ink
with a gold plus. Shortcut tiles: ink icon on a soft ink tint; two by two when the row is under 18rem. Notices: one
quiet row each. Icons: drawn SVG (ui.js), never emoji.

## Website

Same world (site/index.html, tools/site-pages.js): cream and ink, gold for the headline's emphasis, features as
icon-and-heading rows, the jobs as still chips, no kicker labels; theme-color per scheme.

## Rasters

Store screenshots: qa/store-shots.js (demo data, clock pinned to 22 Oct 2026 13:00, user named נדב). Website images:
site/img/*.webp from the app's screens. Working pictures: qa/live-shot.js into shots/.
