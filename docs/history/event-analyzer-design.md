---
name: event-analyzer-design
description: Design language and conventions for the Event Analyzer dashboard
metadata: 
  node_type: memory
  type: project
  originSessionId: 5a7a8d88-8416-4355-8e1c-a0235a8ffa20
---

The Event Analyzer follows Apple's Human Interface Guidelines (pass of 2026-10-15; the audit, its reasoning and the exact values are in `docs/plans/apple-hig-audit.md`). Respect it when editing. **Use only the tokens in `:root` of `index.html`; a token this note names that is not there is a bug** (the old `--paper` from an earlier version of this note left the Layers tab row transparent for a month).

- **Type:** the system font (`--font`: SF Pro on iPhone and Mac, Segoe UI / Roboto elsewhere); no web fonts. One scale of eight roles, each with its own leading and tracking: Display 32/36 `.004em` (KPI figures), Title 28/32 `.007em` (page titles), Title 2 22/26 `.01em` (secondary figures), Headline 17/22 `-.022em` semibold (panel titles), Body 14/20 `-.016em`, Table 13/18 `-.008em`, Footnote 12/16 `-.01em`, Label 11/14 `.005em` semibold (tags, badges). Labels are sentence case: no uppercase, no letter-spaced monospace. Hierarchy comes from weight before size. `--mono` is for `<code>` only. Tabular numerals on every figure column.
- **Palette:** grouped canvas `--bg #F5F5F7`, borderless white surfaces; ink `#1D1D1F`, secondary `#6E6E73`; `--faded` only for placeholders and decoration, never data. Lines are translucent (`rgba(60,60,67,…)`) so they work on any surface. One accent, ember, only for the primary season (and focus). Green/red/amber/violet only for growth/decline/watch/forecast; the Like-for-like switch is ink, not green, for that reason. Text on an ink fill uses `--on-ink`, never `#fff`.
- **Dark mode** follows the device (`@media screen and (prefers-color-scheme:dark)` redefines the same token names; paper always prints light). Surfaces `#000 / #1C1C1E / #2C2C2E`, ember `#FF8A3D`.
- **Surfaces:** panels and tiles have no border and no shadow (`--shadow-panel:none`), 16px radius; structure comes from spacing. Shadow and blur belong to floating chrome only: top bar, phone tab bar, Layers tab row (`--material`, blur 20px, saturate 180%), tooltip and toast (`--material-hud`, dark in both modes). The top bar's hairline appears only once content scrolls under it.
- **Logo lockup:** the bar-chart monogram tile + *Event Analyzer* + "Rising Sun Events Team" on a second line. Favicon is an inline-SVG data-URI of the same tile.
- **Top nav:** brand left, the five analysis tabs as a segmented control with a thumb that slides between them, Season and a gear (Data & Settings, which holds Add data) right. At 640px and below the tabs become an iOS bottom tab bar with icons, and the top bar is one 52px row.
- **Motion:** one critically damped spring, `--spring` (a CSS `linear()` curve), `--spring-fast` 440ms for controls and `--spring-slow` 590ms for sheets, folds and toasts. Controls press to 96% on pointer-down (cards 98.5%). Segmented thumbs slide (`placeThumb`), folds grow, an opened roster grows in, the By Event filter sheet (phones) slides up, drags 1:1 and dismisses on projected velocity. Reduced motion swaps movement for cross-fades; reduced transparency and increased contrast are honoured.
- **Touch:** 44pt hit areas on touch (chips and segments are 36px with invisible padding), 28pt with a mouse; fields are 16px on touch so iPhone does not zoom. A whole event row opens its roster. Chart tooltips open on touch-down above the finger.
- **States:** a failed `data.json` load shows "Couldn't load the latest numbers" with Try again, never the owner's upload screen; newer published numbers arriving after first paint redraw in place with a toast.
- **Auto Insights:** rows on the panel (not cards in a card), each with a tinted monochrome SVG icon badge (trend up/down, alert, info), no emoji.

Insights intentionally exclude Industry, Realtor (RLT), and team-meeting events (see `isExcludedFromInsights`). See [[event-analyzer-deploy]] for hosting + how to ship changes.

**Layers page (rebuilt 2026-10):** one section on screen at a time, chosen from a `.seg` tab row: Summary, What changed, Sales per shift, Booth vs follow-up, Top events, then one tab per territory and per show series (a picker inside the tab once there is more than one). It was a single 8-screen scroll with about 536 numbers showing; do not go back to stacking panels.
- **Summary** has one card per section (`renderLySummary`); each `render*` function returns its own card, so a new section brings its card with it.
- **Inside a section** only the headline, the tiles and the main chart or table stay open. Everything else goes through `lyFold(key, title, body, hint)`, closed by default, with a short hint beside the title so the answer shows before it is opened. Method notes always go in a last fold titled "How this is counted". Open folds are remembered in `STATE.lyOpen`, so re-renders keep them open.
- **Names are plain words.** Tab, panel heading and Summary card use the same name; no analyst terms (bridge, concentration, productivity).
- **Links:** `#layers/<section>` opens a section directly (`what-changed`, `sales-per-shift`, `booth-vs-follow-up`, `top-events`, a territory id such as `el-paso`, a series id such as `maricopa`). The hash is only present while Layers is on screen.
- **Printing** prints the section on screen with every fold open.
