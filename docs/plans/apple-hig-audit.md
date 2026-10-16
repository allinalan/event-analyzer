# Event Analyzer: Apple HIG audit (2026-10-15)

Audit of `index.html` at `01c5747` (same as `main` and the live Pages site), measured in the browser at
desktop, 768px and 375px. Method: the `apple-design` skill (WWDC *Designing Fluid Interfaces*, *Details
of UI Typography*, *Principles of Great Design*).

**Status (2026-10-15):** Alan took all four decisions at their defaults. Built on branch
`claude/apple-hig-audit-f0e39f`: P0-1, P0-2, P1-1 to P1-7, and from P2 the phone tab bar, the label colors,
the slower Live pulse and the design-note update. Not built: the loading-state placeholders. Line numbers
below refer to the file as it was before the pass. Verified in a local preview: light, dark, 375px phone,
broken and missing `data.json`, sheet drag-to-dismiss, roster row and keyboard toggles. Not yet seen on a
real iPhone. The current design rules live in `docs/history/event-analyzer-design.md`.

## Critique score: 18 / 50

| Pillar | Score | One line |
| --- | --- | --- |
| Deference & restraint | 5 | Color discipline is excellent; every block is still a bordered, shadowed card with a mono eyebrow on top. |
| Physical motion | 3 | Only 100–160ms color fades. No press state, disclosures pop, the segmented thumb teleports, no reduced-motion. |
| Typography | 3 | 26 size/family combinations on Overview; labels at 8.5–10px tracked-out mono caps. |
| Materials & depth | 4 | Nav is translucent (good), but no dark mode, one elevation for everything, and a transparent sticky bar. |
| Interaction mechanics | 3 | Every control measured 18–33px tall; the roster caret is 13×10px; a failed load shows reps the owner's upload screen. |

### Top 3 structural flaws that make it read as generic

1. **Card-on-gray-canvas with an eyebrow on every block.** Each section is white box + 1px border + shadow +
   mono uppercase eyebrow ("SEASON SHAPE", "FULL GRID", "WHOLE SEASON", "ANALYST READ") + title + subtitle.
   22 panel eyebrows repeat what the title already says. Insight cards are cards inside a card. Structure is
   coming from boxes, not from spacing and alignment. This is the SaaS-template look.
2. **A type system with 26 sizes and 3 families.** Overview alone renders 8.5, 9, 9.5, 9.775, 10, 10.5,
   10.625, 11, 11.5, 11.75, 11.9, 12, 12.5, 12.75, 13, 13.5px (16 sizes inside 5px) across Space Grotesk,
   Inter and IBM Plex Mono. Labels are 8.5–10px uppercase mono at +0.12 to +0.17em tracking: the single
   strongest "AI dashboard" tell, and unreadable on a phone (Apple's floor is 11pt). Hierarchy comes from
   swapping fonts, not from weight.
3. **Nothing answers a finger.** Reps open this on phones. Measured hit sizes: chips 38×26, segmented 50×25,
   inline selects 63×23, Export CSV 90×23, toggle 32×18, tabs 84×28, roster caret 13×10 (the only way to
   open a rep roster). No `:active` press state anywhere except one 1px nudge. Chart tooltips listen to
   `mousemove` only, so tapping a bar on iPhone does nothing. On a 375px phone the sticky top bar is 138px
   (17% of the screen) and the tab row clips "Layers" with "Data & Settings" off-screen and no hint.

### Keep these (they are already Apple-grade)

- One accent with one job: ember marks the primary season only; green/red only mean direction, and every
  delta carries an arrow and sign so color is never the only signal.
- `tabular-nums` on every figure column.
- Real semantics: `<button>` chips, `role="switch"` + `aria-checked` on the toggle, `aria-expanded` on the
  roster caret, `:focus-visible` rings, print styles.
- Charts draw with CSS variables (no hex in the render code), so dark mode is mostly a token swap.

## Decisions for Alan (accept "all defaults")

1. **Fonts: switch to the system font and drop the three web fonts?** Default: yes. On iPhone and Mac that is
   SF Pro with Apple's own optical sizing, and it removes 10 font-file downloads (`index.html:10-12`).
   Alternative: keep Space Grotesk for the big figures only.
2. **Move "Add data" into Data & Settings, and turn that tab into a gear button?** Default: yes. Uploading is an
   owner task; today every rep sees a black "Add data" button as the loudest control in the bar.
3. **On phones, put the five analysis tabs in an iOS-style bottom tab bar?** Default: yes. It replaces the
   138px top bar with a 52px one and ends the clipped tab row.
4. **Add dark mode that follows the phone's setting?** Default: yes. Reps check numbers at night; today it is
   a full white screen.

## Apple Fixes, prioritized

Line numbers are `index.html`.

### P0: broken today

**P0-1. Layers sticky tab row is transparent** (`:1169`). It uses `var(--paper)`, which the stylesheet does
not define (computed `rgba(0,0,0,0)` in the browser), so section content scrolls visibly behind the tabs.
Root cause: `docs/history/event-analyzer-design.md` still describes the old Fraunces/Geist system with a
`--paper` token; the October Layers rebuild followed it. Fix the token and update that doc.

```css
.ly-nav{
  background:color-mix(in srgb, var(--bg) 78%, transparent);
  -webkit-backdrop-filter:saturate(180%) blur(20px);
  backdrop-filter:saturate(180%) blur(20px);
  margin:-8px -24px 8px; padding:8px 24px;   /* bleed to the page gutter so nothing peeks past the sides */
}
```

**P0-2. A failed `data.json` load shows reps the owner's onboarding** (`:2298-2320`, boot `:5745-5763`).
`loadPublishedData` swallows every failure into `console.warn`; with no local copy the spinner disappears and
the rep sees "Your event intelligence starts here / Upload your first XLSX". A silent failure aimed at the
wrong person. Return a status and show a real error state:

```js
// loadPublishedData: report what happened instead of swallowing it
if (!resp.ok) return resp.status === 404 ? 'none' : 'error';
// ... after a successful restore:
return 'loaded';
// } catch (e) { console.warn('No published data loaded:', e); return 'error'; }

// init(): fail loudly, with a way out
p.then(status => {
  if (!loaded && status === 'error') return showLoadError();  // "Couldn't load the latest numbers." + Try again (location.reload())
  bootDone();
});
```

### P1: touch, type, motion, materials

**P1-1. Hit targets: 44pt on touch, 28pt with a mouse** (Apple's iOS and macOS minimums).

```css
@media (pointer:coarse){
  .year-mgr select,.sel-inline,.search-row select,.search-row input[type=text],
  .btn,.upload-btn,.download-btn{min-height:44px;}
  .chip,.yr-chip,.seg button,.tab{min-height:36px;position:relative;}
  .chip::after,.yr-chip::after,.seg button::after,.tab::after{content:"";position:absolute;inset:-4px 0;} /* 36 + 4 + 4 = 44 */
  .chip-row{gap:8px;}
}
@media (pointer:fine){
  .chip,.yr-chip,.seg button,.tab,.sel-inline,.download-btn,.btn{min-height:28px;}
}
* { -webkit-tap-highlight-color:transparent; }
button,.chip,.mcell,.camp-card,.ly-card,.ev-caret{touch-action:manipulation;}
```

Roster caret (`:656-662`, markup `:4397`): make the whole event row the disclosure, as iOS does. Keep the
caret as the visual and the keyboard target, delegate the row click to it, and give the caret itself
`width:44px;height:44px;margin:-14px -10px -14px -16px` so it hits 44×44 without growing the row.

Toggle (`:249-262`): iOS switch geometry, moved with `transform` instead of `left`. Track stays `--ink`
(green is reserved for growth in this palette).

```css
.toggle{width:51px;height:31px;border-radius:16px;background:rgba(120,120,128,.16);transition:background-color .25s ease;}
.toggle::after{top:2px;left:2px;width:27px;height:27px;
  box-shadow:0 3px 8px rgba(0,0,0,.15),0 3px 1px rgba(0,0,0,.06);
  transition:transform var(--spring-fast) var(--spring);}
.toggle.on::after{transform:translateX(20px);left:2px;}
@media (pointer:fine){ .toggle{width:40px;height:24px;} .toggle::after{width:20px;height:20px;} .toggle.on::after{transform:translateX(16px);} }
```

**P1-2. One type scale: 26 combinations down to 8 roles.** System font, SF Pro tracking as Apple ships it on
apple.com (SF Pro Text runs slightly negative; SF Pro Display runs slightly positive from 19 to 32px and only
goes negative past 48px, so the current `-.025em` at 34px is an Inter habit, not an Apple one).

```css
:root{
  --font:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;      /* code only, never labels */
  --disp:var(--font); --sans:var(--font);            /* existing names keep working */
}
body{font:400 14px/20px var(--font);letter-spacing:-.016em;}   /* was 13.5px/1.5 */
```

| Role | Replaces | Size / leading | Tracking | Weight |
| --- | --- | --- | --- | --- |
| Display | `.kpi-hero` 34px | 32 / 36px | `.004em` | 600 |
| Title | `.ptitle` 24px, `.hero-verdict-line` 19px | 28 / 32px | `.007em` | 600 |
| Title 2 | `.fc-val` 26, `.cc-val` 25, `.kpi-val` 22 | 22 / 26px | `.01em` | 600 |
| Headline | `.ptit2` 13.5, `.insight-title` 12.5 | 17 / 22px | `-.022em` | 600 |
| Body | body, `.psub` | 14 / 20px | `-.016em` | 400 |
| Table | `.tbl` 12.5 | 13 / 18px | `-.008em` | 400; figures 500 |
| Footnote | `.kpi-sub`, `.insight-text`, `.cc-sub`, chips | 12 / 16px | `-.01em` | 400 |
| Label | every mono caps label: `.eyebrow`, `.kpi-lbl`, `.tbl th`, `.scope-k`, `.chip-lbl`, `.brand-team`, `.badge`, `.cat-tag` (8.5–10.5px) | 11 / 14px | `.005em` | 600, sentence case, `--mut` |

- Delete `text-transform:uppercase` from labels (27 rules) and the `var(--mono)` on them (40 uses).
- Distinguish with weight, not new sizes: value 600 vs label 400 in the same size where they sit together
  (`.scope-v` vs `.scope-k`, `.kpi-comp-val` vs `.kpi-comp-yr`).
- Overview: make the verdict ("2026 is on pace with 2025 ▼ 1.1%") the page title, fold "2026 season
  performance" into the subtitle, delete the eyebrow. Four heading lines become two.

**P1-3. Motion: one spring, press states, nothing teleports.** A critically damped spring (damping 1.0, no
overshoot: nothing here is flicked, so no bounce) as a CSS `linear()` curve.

```css
:root{
  /* damping 1.0. response 0.30s → 440ms total, 90% there at 186ms; response 0.40s → 590ms, 90% at 248ms */
  --spring:linear(0, .006 1.2%, .044 3.6%, .133 6.9%, .266 10.9%, .421 15.6%, .573 20.8%, .705 26.6%,
                  .808 33%, .882 39.8%, .931 47.1%, .962 54.9%, .98 63.1%, .99 71.7%, .995 80.8%, .998 90.2%, 1);
  --spring-fast:440ms; --spring-slow:590ms; --press:80ms;
}
@supports not (transition-timing-function:linear(0,1)){ :root{ --spring:cubic-bezier(.32,.72,0,1); } }

/* press on pointer-down, spring back on release */
.tab,.chip,.yr-chip,.seg button,.btn,.upload-btn,.download-btn,.mcell,.camp-card,.ly-card{
  transition:transform var(--spring-fast) var(--spring),
             background-color .2s ease, color .2s ease, border-color .2s ease, box-shadow .2s ease;
}
:is(.tab,.chip,.yr-chip,.seg button,.btn,.upload-btn,.download-btn,.mcell):active{transform:scale(.96);transition-duration:var(--press);}
:is(.camp-card,.ly-card):active{transform:scale(.985);transition-duration:var(--press);} /* big surfaces move less */
.camp-card:hover{transform:none;}   /* :870, drop the web hover-lift */
```

- Replace `transition:all` at `:326`, `:368`, `:381` with the explicit list above.
- **Segmented thumb that slides** (`.tabs`, `.seg`): one persistent `<span class="seg-thumb">` per control,
  moved under the active button. Selected-segment shadow from the iOS kit.

```css
.seg,.tabs{position:relative;}
.seg-thumb{position:absolute;top:3px;bottom:3px;left:0;border-radius:7px;background:var(--surface);
  box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04);
  transition:transform var(--spring-fast) var(--spring),width var(--spring-fast) var(--spring);}
.seg button,.tab{position:relative;z-index:1;}
.seg button.active,.tab.active{background:transparent;box-shadow:none;}
```
```js
function moveThumb(seg){
  const a = seg.querySelector('.active'); if (!a) return;
  let t = seg.querySelector(':scope > .seg-thumb');
  if (!t){ t = document.createElement('span'); t.className = 'seg-thumb'; t.setAttribute('aria-hidden','true'); seg.prepend(t); }
  t.style.width = a.offsetWidth + 'px';
  t.style.transform = `translateX(${a.offsetLeft}px)`;
}
```
  The renderers rebuild some `.seg` rows with `innerHTML`; render the buttons into the row without wiping the
  thumb, or the slide becomes a jump again.
- **Disclosures grow instead of popping** (`.ly-fold`, `.ref-details`, `.fc-method`):

```css
:root{interpolate-size:allow-keywords;}
:is(.ly-fold,.ref-details,.fc-method)::details-content{
  block-size:0;overflow:clip;
  transition:block-size var(--spring-slow) var(--spring),content-visibility var(--spring-slow) allow-discrete;
}
:is(.ly-fold,.ref-details,.fc-method)[open]::details-content{block-size:auto;}
.ly-fold > summary::before,.ref-details summary::after{transition:transform var(--spring-fast) var(--spring);}
```
  Browsers without `interpolate-size` open instantly, exactly as today.
- Roster drawer (`.roster-panel`): `animation:rp-in var(--spring-slow) var(--spring) both;`
  `@keyframes rp-in{from{opacity:0;transform:translateY(-6px);}}`; caret uses `--spring` instead of `.12s ease`.
- **Toast** (`:1046-1060`, `:2219-2224`): enters and leaves on the same path, sits above the home indicator,
  and the hide timer no longer kills the next toast early.

```css
.toast{left:50%;right:auto;bottom:calc(20px + env(safe-area-inset-bottom));display:block;visibility:hidden;opacity:0;
  transform:translate(-50%,24px) scale(.96);border:0;border-radius:14px;padding:12px 16px;
  background:rgba(29,29,31,.84);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);
  box-shadow:0 10px 30px rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.10);
  transition:transform var(--spring-slow) var(--spring),opacity .2s ease,visibility 0s linear var(--spring-slow);}
.toast.show{visibility:visible;opacity:1;transform:translate(-50%,0) scale(1);transition-delay:0s;}
```
```js
function showToast(msg, type){
  const t = document.getElementById('toast');
  clearTimeout(t._hide);
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t._hide = setTimeout(() => t.classList.remove('show'), type === 'error' ? 8000 : 4500);
}
```
  Viewport meta (`:5`) needs `viewport-fit=cover` for `env(safe-area-inset-bottom)` to be non-zero.
  Replace the 3px colored left border with a colored leading glyph; a stripe is a web-ism.
- **Tooltips answer a tap** (`:3003-3026`): respond on `pointerdown` for touch, anchored above the bar,
  scaling from the bar.

```js
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const bar = e.target.closest && e.target.closest('.bar-hit');
  if (!bar){ tip.classList.remove('show'); return; }
  tip.innerHTML = decodeURIComponent(bar.dataset.tip || '');
  tip.classList.add('show');
  const r = bar.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transformOrigin = '50% 100%';
  tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px';
  tip.style.top  = Math.max(8, r.top - h - 10) + 'px';
});
```
```css
.chart-tip{background:rgba(29,29,31,.82);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);
  border-radius:10px;transform:scale(.96);transform-origin:0 0;
  transition:opacity .15s ease,transform var(--spring-fast) var(--spring);}
.chart-tip.show{transform:scale(1);}
```
- **Reduced motion, transparency, contrast** (none exist today):

```css
@media (prefers-reduced-motion:reduce){
  :is(.tab,.chip,.yr-chip,.seg button,.btn,.upload-btn,.download-btn,.mcell,.camp-card,.ly-card):active{transform:none;}
  .seg-thumb,.toggle::after,.toast,.chart-tip,.ev-caret{transition:opacity .15s ease!important;}
  .toast,.toast.show{transform:translateX(-50%);}   /* no slide; keep the centering */
  .chart-tip,.chart-tip.show{transform:none;}
  .roster-panel,.cc-live::before{animation:none;}
  :is(.ly-fold,.ref-details,.fc-method)::details-content{transition:none;}
}
@media (prefers-reduced-transparency:reduce){
  nav.topnav,.ly-nav,.chart-tip,.toast{-webkit-backdrop-filter:none;backdrop-filter:none;background:var(--surface);}
  .chart-tip,.toast{background:var(--ink);}
}
@media (prefers-contrast:more){
  :root{--line:rgba(60,60,67,.36);--mut:#3C3C43;}
  .panel,.kpi-tile,.camp-card{outline:1px solid var(--line-strong);outline-offset:-1px;}
}
```
  The boot spinner keeps spinning: Apple keeps activity indicators under reduced motion.

**P1-4. Restraint: flatten the boxes.**

```css
:root{ --bg:#F5F5F7; }                           /* apple.com canvas; was #F2F4F7 */
.panel,.kpi-tile,.camp-card,.scopebar,.help-box{border:0;box-shadow:none;border-radius:16px;}
.panel{padding:20px 24px;margin-bottom:24px;}
.insight-card{background:transparent;border:0;border-radius:0;padding:12px 0;border-bottom:1px solid var(--line);}
.insight-card:hover{background:transparent;}
.camp-card.active{box-shadow:0 0 0 2px var(--ember);}
.delta-chip{border:0;}                            /* tint + arrow + sign already say it */
.fc-panel{border:0;}                              /* violet tag + gradient already mark "forecast" */
```
- Delete the 22 `<span class="ptit2-eyebrow">` lines and the page `.eyebrow` divs; the titles already name
  the section.
- By Event: segmented control + three chip rows + search + sort sit above row 1 (the table starts ~320px
  down at 800px wide). On phones, collapse Campaign / Ranking / Territory into one "Filters" button showing
  the active count, opening a sheet that slides up from the bottom and dismisses back down.

**P1-5. Materials and depth.**

```css
nav.topnav{background:rgba(255,255,255,.72);border-bottom:0;
  -webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);
  box-shadow:0 .5px 0 transparent;transition:box-shadow .2s ease;}
nav.topnav.scrolled{box-shadow:0 .5px 0 rgba(0,0,0,.16);}   /* hairline only once content is underneath */
```
```js
const s = document.createElement('div'); s.style.cssText = 'position:absolute;top:0;width:1px;height:1px';
document.body.prepend(s);
new IntersectionObserver(([e]) => document.querySelector('nav.topnav').classList.toggle('scrolled', !e.isIntersecting)).observe(s);
```
Three elevation levels instead of one shadow on everything: canvas (none), grouped surface (color step only,
no shadow), floating chrome: nav, tooltip, toast, popovers (`0 10px 30px rgba(0,0,0,.18), 0 1px 2px rgba(0,0,0,.10)` + blur).

**P1-6. Dark mode** (decision 4). Same token names, so the rest of the CSS keeps working.

```html
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F5F5F7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
```
```css
:root{ --on-ink:#fff; }
@media (prefers-color-scheme:dark){
  :root{
    --bg:#000; --surface:#1C1C1E; --surface-2:#2C2C2E; --surface-3:rgba(118,118,128,.24);
    --line:rgba(84,84,88,.36); --line-strong:rgba(84,84,88,.65);
    --ink:#F5F5F7; --ink-2:rgba(235,235,245,.86); --mut:rgba(235,235,245,.6); --faded:rgba(235,235,245,.3);
    --on-ink:#000;
    --ember:#FF8A3D; --ember-deep:#FFB27A; --ember-bright:#FF8A3D;     /* 7.3:1 on #1C1C1E */
    --ember-soft:rgba(255,138,61,.16); --ember-line:rgba(255,138,61,.35);
    --pos:#30D158; --pos-soft:rgba(48,209,88,.14);  --pos-line:rgba(48,209,88,.3);  --pos-bar:#30D158;
    --neg:#FF453A; --neg-soft:rgba(255,69,58,.14);  --neg-line:rgba(255,69,58,.3);  --neg-bar:#FF6961;
    --warn:#FF9F0A; --warn-soft:rgba(255,159,10,.14); --warn-line:rgba(255,159,10,.3);
    --fc:#7D7AFF;  --fc-soft:rgba(125,122,255,.14); --fc-line:rgba(125,122,255,.35);
    --info:#409CFF; --series-primary:#FF8A3D; --series-bench:#8E8E93; --series-track:rgba(118,118,128,.24);
  }
  nav.topnav{background:rgba(22,22,23,.72);}
}
```
Required with it: the 8 `color:#fff` on ink-filled controls (`:172`, `:314`, `:371`, `:768`, `:800`, `:848`,
`:1005`, `:1048`) become `color:var(--on-ink)`, or selected chips go white-on-white in dark mode; the hover
`#1D2939` at `:181` and `:372` becomes `color-mix(in srgb, var(--ink) 88%, var(--bg))`; the brand mark's
`fill="#101828"` (`:1231`, `:1267`) stays as is (it is a logo tile, legible on black).

**P1-7. Late data refresh yanks the reader** (`:2316`). When a rep has an older local copy, the newer
`data.json` arrives after first paint and `setActivePage(bootPage())` sends them to Overview and the top of
the page, even if they already tapped By Event. Re-render where they are and say so:

```js
const y = scrollY; refreshAll(); scrollTo(0, y);
showToast('Updated to the latest numbers', 'success');
```

### P2: polish

- **Phone navigation** (decision 3): at ≤640px a 49px bottom tab bar (`position:fixed;bottom:0`, 5 columns,
  `padding-bottom:env(safe-area-inset-bottom)`, same translucent material as the top nav, labels 10px/500
  under 24px glyphs); Data & Settings becomes a gear in a single 52px top row with the brand mark and Season.
  Until then: an edge fade on the scrolling tab row
  (`mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent)`) and
  `active.scrollIntoView({inline:'center',block:'nearest'})` so the current tab is never clipped.
- Loading state (`:1262-1265`): replace "LOADING EVENT INTELLIGENCE…" in tracked mono caps with a sentence-case
  "Loading the latest numbers…" and grey placeholder blocks the shape of the three KPI tiles.
- `livepulse` (`:899-903`): a 2s infinite fade on the "Live" campaign dot; slow the cycle or make it static.
  It stops under reduced motion with the rule above.
- Colors: `--ink:#1D1D1F`, `--ink-2:#424245`, `--mut:#6E6E73` (4.9:1 on white), `--faded:#86868B` reserved for
  placeholders and disabled text, never data (it is 3.5:1 and is used today for 9.5px labels).
- Update `docs/history/event-analyzer-design.md`: it still describes Fraunces / Geist / `--paper`, which is
  how P0-1 happened.
