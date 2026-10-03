---
name: event-analyzer-design
description: Design language and conventions for the Event Analyzer dashboard
metadata: 
  node_type: memory
  type: project
  originSessionId: 5a7a8d88-8416-4355-8e1c-a0235a8ffa20
---

The Event Analyzer dashboard uses an intentional editorial/SaaS design system — respect it when editing, don't bulldoze it.

- **Type:** Fraunces (serif, used italic for titles/numbers headlines), Geist (sans, body/UI), Geist Mono (labels, eyebrows, badges). Tabular lining numerals everywhere for figures.
- **Palette:** warm paper neutrals (`--paper #FAFAF7`, `--surface #fff`, hairlines `#E7E5DF`), near-black ink. Single accent `--accent #B45309` (burnt orange) used only for the brand mark, primary-year marker, and focus — never decoration. Semantic colors (pos green / neg red / warn amber) only for data meaning.
- **Logo lockup:** accent rounded-square "EA" monogram + *Event Analyzer* (Fraunces italic) + tiny mono "RSD EVENTS TEAM". Favicon is an inline-SVG data-URI of the same EA monogram.
- **Cards/panels:** `--shadow-card` (subtle, never heavy), 10px radius, hairline border.
- **Top nav:** brand left, tabs (flex:1, horizontal-scroll, contained 2px active underline — NOT a floating `::after`), controls right. Below 860px the tab bar drops to its own full-width scrollable row. This nav was rebuilt 2026-06 because the old one collapsed into 3 overlapping rows on laptops/tablets.
- **Auto Insights:** cards have a left severity border + a tinted monochrome SVG icon badge (trend up/down, alert, info) — no emoji.

Insights intentionally exclude Industry, Realtor (RLT), and team-meeting events (see `isExcludedFromInsights`). See [[event-analyzer-deploy]] for hosting + how to ship changes.

**Layers page (rebuilt 2026-10):** one section on screen at a time, chosen from a `.seg` tab row: Summary, What changed, Sales per shift, Booth vs follow-up, Top events, then one tab per territory and per show series (a picker inside the tab once there is more than one). It was a single 8-screen scroll with about 536 numbers showing; do not go back to stacking panels.
- **Summary** has one card per section (`renderLySummary`); each `render*` function returns its own card, so a new section brings its card with it.
- **Inside a section** only the headline, the tiles and the main chart or table stay open. Everything else goes through `lyFold(key, title, body, hint)`, closed by default, with a short hint beside the title so the answer shows before it is opened. Method notes always go in a last fold titled "How this is counted". Open folds are remembered in `STATE.lyOpen`, so re-renders keep them open.
- **Names are plain words.** Tab, panel heading and Summary card use the same name; no analyst terms (bridge, concentration, productivity).
- **Links:** `#layers/<section>` opens a section directly (`what-changed`, `sales-per-shift`, `booth-vs-follow-up`, `top-events`, a territory id such as `el-paso`, a series id such as `maricopa`). The hash is only present while Layers is on screen.
- **Printing** prints the section on screen with every fold open.
