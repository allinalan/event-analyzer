# Rep roster drill-down — build plan

**Goal:** on the **By Event** tab, clicking an event row expands a panel showing the reps who
worked it, how many shifts each took, and (once Phase C lands) each rep's orders and CPO at that
event.

**Status:** planned, not built. Written to be executed locally on the Mac mini, where both
VectorConnect (Chrome session) and the Google Sheets API are reachable.

---

## 1. Why this can't be built from the data we have

`data.json` holds 1,067 events. Every one carries:

- a VectorConnect event ID in `eventRaw` (`00090355 - Tyson Wells Rock & Gem Show`) — a clean
  join key to anything pulled from VC
- `total` (CPO dollars), `orders`, and `shifts`

and **no rep names anywhere**. `shifts` is the ghost of the data we want: the automation that
produced it read names off the Show Shift Schedule, counted them, and discarded the names.

### Coverage ceiling — decide the empty state before building

| Season | Events | With shift data | Coverage |
|---|---|---|---|
| 2025 | 296 | 134 | 45% |
| 2026 | 170 | 71 | 42% |

Service, realtor and industry events are rarely on the shift schedule. **More than half of rows
will have no roster.** Phase A step 1 may lift this — the current numbers come from an automation
that may only have read one of the three workbooks.

### It's a crew, not a rep

2025 averages **3.9 rep-days per event**, 2026 averages **4.9**. Multi-day shows rotate people.
The drill-down is a roster table with a row per rep, not a single name.

---

## 2. Step 0 — the Details probe (blocks Phase C, nothing else)

Per the `vectorconnect-eventalytics-report` skill, each **Event Sales** row begins with a
**Details icon**, and nothing documents what's behind it.

On the Mac, in Chrome: `vectorconnect.com/event/reports` → expand **Event Sales** → set any
campaign period + Division 75 → **Get Data** → click the **Details** icon on one row.

Report back: does the panel break the event down **by rep**? If yes, capture the column headers
and one sample row, and check whether it loads into an ExtJS store (`Ext.getCmp`, or a network
call in DevTools) that a script can walk for every row in a loop.

| Outcome | Consequence |
|---|---|
| Details lists reps | **Phase C1.** One report per campaign. The 513-query plan is dead. |
| Details is product/item detail, or no rep breakdown | **Phase C2.** Day-grain Team Sales join. |

Phases A and B do not wait on this.

---

## 3. Data model — the `roster` field

One optional `roster` array per event object in `data.json`. Absent = never staffed from the
schedule; present-but-empty = block found, no names in it.

```json
{
  "eventRaw": "00090355 - Tyson Wells Rock & Gem Show",
  "eventNorm": "tyson wells rock & gem show",
  "shifts": 14,
  "roster": [
    {
      "rep": "Adam C",           // canonical name, post-alias-map
      "raw": ["Adam C", "Adam c"], // every spelling seen, for auditing
      "days": ["2026-01-02", "2026-01-03", "2026-01-04"],
      "shifts": 3,               // = days.length, raw rep-days
      "trainees": ["Arianna"],   // from "(FT- Ann)" annotations; [] when none
      "orders": null,            // Phase C
      "cpo": null                // Phase C
    }
  ],
  "rosterSource": "Jan-May Show Shift Schedule / 2026 tab",
  "rosterPulledAt": "2026-09-18T00:00:00.000Z"
}
```

**`shifts` vs roster `shifts`.** The Mesa counter applies half-shift rules (Fri/Sun with 2 people
= 0.5 each). That's a *pay* rule, not a *presence* rule. `roster[].shifts` is raw rep-days —
one rep, one day, one shift. Keep the two definitions separate and labelled, or the roster totals
won't tie to the Mesa counter and someone will spend an afternoon on it.

**Size:** roughly 200 events × ~5 reps. Well under 100 KB added to a 622 KB `data.json` — inline is
fine. If it ever becomes a page-load problem, split to a lazy-loaded `roster.json` keyed by
`eventRaw`.

---

## 4. Phase A — roster from the Show Shift Schedule

Runs locally. No VectorConnect needed.

### 4.1 Sources

Three rolling workbooks, all reachable from Alan's Drive:

| Workbook | File ID | Last modified |
|---|---|---|
| Jan-May Show Shift Schedule | `1Z8SN4FVBPzZrxe3F4FbmwjsSLRPH9GWJZratALVK0vk` | 2026-09-13 |
| May-Sep Show Shift Schedule | `17gPzz1g5JHIiou5BbMmUZQd2RvlMdvhqHr91l0E7Sgo` | 2026-08-30 |
| Sept-Feb Show Shift Schedule | `10p5Ro2WpeJ7mMOyS92OWIT3w3Nl-KGX4vBMkXJoOCTs` | 2026-09-17 |

**Step 1 — enumerate tabs before parsing anything.** These are rolling sheets; the Jan-May
workbook currently shows 2027 dates on its front tab. Date cells across it span 2015–2018 and
2023–2027, so old seasons appear to be retained as separate tabs — but confirm the tab list and
map each tab to a season before trusting it. Use the **Sheets API** (`spreadsheets.get` →
`sheets[].properties.title`), not a Drive export: the Drive export flattens every tab into one
blob with no tab markers and truncates around 285 K characters.

### 4.2 Column geometry — fixed, verified

Columns are stable across the workbook. Zero-indexed, after splitting each row to cells:

| Col | Contents |
|---|---|
| 1–11 | Weekend header row, merged: `Weekend 1/1` (month/day, **no year** — take the year from the tab) |
| 2 | Status — `Booked` / `Prospective` / `Cancelled` |
| 3 | BEST CPO |
| **4** | **Discriminator: event name on an event row, `Shift N` on a shift row** |
| 5–11 | Day columns. Event row holds day-of-week labels (`Friday`…`Monday`, or `Fri`/`Sat`/`Sun`); shift rows hold **rep names in the same positions** |
| 12 | Cost |
| 13 / 14 | Start Date / End Date — `1/1/2027`. **Often blank** (Mesa rows have none) |
| 15 | City, State |
| 16 | Location |
| 18–22 | Promoter, Contact, Phone, Email, Website |

Worked example — a 3-day event and its shift row:

```
col: 2:Booked  4:Mesa Market Place Swapmeet A ROW  5:Fri  6:Sat  7:Sun  12:$2,089.00  15:Mesa
col:           4:Shift 1                           5:Adam C  6:Adam c  7:Adam C
col:           4:Shift 2
```

### 4.3 Parse algorithm

1. Walk rows in order, carrying `current_weekend` (from the last `Weekend M/D` header) and
   `current_event`.
2. Col 4 matches `^Shift\s*\d+$` → shift row, belongs to `current_event`. Otherwise non-empty
   col 4 → new event row; capture name, status, dates, city, and the **day labels in cols 5–11**.
3. For each shift row, zip cols 5–11 against the parent event's day labels. A non-ignored cell at
   position *i* means that rep worked the day labelled at position *i*.
4. **Resolve each day column to a real date:** prefer cols 13/14 (Start/End Date) when present;
   otherwise take the weekend header's `M/D` + the tab's year as the anchor and walk forward to
   the day-of-week in the label. Emit both and assert they agree when both exist — a mismatch is
   a sheet error worth surfacing, not silently picking one.
5. Ignore cells that are empty, `x`, `X`, `-`, or `TBD`.
6. Multiple `Shift N` rows under one event are all that event's roster — union them.

Reference implementation for the walk-and-flush shape:
`~/.claude/skills/.../count-mesa-shifts/scripts/count_shifts.py`. Note it hardcodes 3 day columns
for Mesa; **the general parser must handle 2–7 day columns** driven by the event row's labels.

### 4.4 Name normalization

49 distinct name strings across the sample; 43 after lowercasing and stripping trailing periods.
Roughly 25 real people. Every messiness class found, with the rule:

| Class | Examples | Rule |
|---|---|---|
| Case | `Matt A` / `Matt a`, `Adam C` / `Adam c`, `jerry` / `Jerry`, `kendall`, `cam` | Case-insensitive match, canonical form from the alias map |
| Trailing period | `Adam C.` vs `Adam C` | Strip trailing `.` |
| Nickname | `Cam` → `Cameron`, `JP` → `J. Parker` | Alias map |
| Surname only | `Foss` → Matt Foss | Alias map |
| Field trainee | `Alan (FT-Arianna)`, `Zach (FT- Ann)`, `Alan (ft-elizabeth)`, `Alan (Ft-David` *(unclosed paren)* | Rep = text before `(`; trainee name → `trainees[]`. Match `\(\s*ft\s*[-–]\s*([^)]*)` case-insensitive, tolerate the missing `)` |
| Two people, one cell | `John and Roman` | Split on ` and ` / `&` / `/` → two roster entries, each a full shift |
| Junk | `m` | Length-1 non-initial cells → drop, log for review |

**Deliverable: `tools/rep-aliases.json`** — a hand-reviewed map from every raw spelling to a
canonical rep. Generate the first draft by frequency, have Alan confirm it once, then treat it as
the standing source of truth. The parser **fails loudly on an unknown spelling** rather than
inventing a new rep — that's what keeps a typo from becoming a phantom teammate.

### 4.5 Join to events

Key on `normalizeEventName()` (`index.html:1523` — strips the leading VC ID, lowercases, collapses
dashes/whitespace) plus date overlap. This is the same key `schedule.years[]` entries already use
via their `norm` field, and that join already lands 281 bookings for 2025 and 169 for 2026 — so
reuse it rather than writing a second matcher.

Ambiguity rule: if one sheet event maps to two `data.json` events, or vice versa, **report it, do
not guess.** Same discipline as `tools/rerank.js`.

### 4.6 Validation before writing

- `sum(roster[].shifts)` per event vs the existing `shifts` field. Report every mismatch —
  differences are expected where the old automation read fewer workbooks, and each one is either a
  coverage win or a parser bug.
- Event count with a roster vs the 134 / 71 baseline. **Higher is the hoped-for outcome**, lower
  means the parser is dropping blocks.
- Every raw name string resolved through the alias map, zero unknowns.

---

## 5. Phase B — the drill-down UI (`index.html`)

Independent of Phase C. Build it so the orders/CPO columns are additive.

**Where:** `renderEvent()` at `index.html:3920`; the table HTML is assembled from `4086` and written to
`#evTable` at `4128`. Rows currently render flat into a `<tbody>`.

**Interaction**
- A caret in the Event cell on rows where `roster` is present and non-empty. Rows without one are
  not clickable and show no caret — no dead affordance on 55% of rows.
- Click toggles a `<tr class="roster-row"><td colspan="N">` immediately after the row.
- Expansion state in `STATE` keyed by `eventRaw`, so a re-render (sort, filter, chip) doesn't
  collapse what's open.
- Keyboard: `role="button"`, `tabindex="0"`, Enter/Space toggles, `aria-expanded` on the trigger.

**Panel contents**
| Rep | Shifts | Days | Orders | CPO | CPO/shift |

Orders, CPO and CPO/shift render as `—` until Phase C lands — the same em-dash-not-`$0` rule the
RSD dashboard uses. Trainees show as a small note under the rep name (`+ Arianna (FT)`).

**Design system** — see `docs/history/event-analyzer-design.md`, don't bulldoze it:
- Fraunces for the panel heading, Geist for the table, Geist Mono for labels/eyebrows
- tabular lining numerals on every figure
- accent `#B45309` for the caret only; semantic colors only where a number means something
- reuse the existing `.tbl` / `.tbl-wrap` classes rather than new table styling
- no emoji

**Empty states**
- No roster → row not expandable.
- Roster present, Phase C not run → table renders with dollar columns dashed and a one-line note.

---

## 6. Phase C — per-rep orders and CPO from VectorConnect

### 6.1 Why the obvious approach is wrong

The intuitive move is to query Team Sales with the date window set to each event's dates. The
numbers kill it:

| Season | Events | Sit alone on their dates | Overlap ≥1 other | Worst case |
|---|---|---|---|---|
| 2025 | 296 | 24 (8%) | **272 (92%)** | overlaps 43 others |
| 2026 | 170 | 10 (6%) | **160 (94%)** | overlaps 47 others |

An event-length window returns pooled CPO for up to 44 concurrent shows with no way to split it.

### 6.2 Path C1 — Details drill-down (if Step 0 says yes)

Export Event Sales per campaign, walk the Details store for every row, join to `data.json` on the
**VC event ID already in `eventRaw`**. One report per campaign, no date reasoning at all.

### 6.3 Path C2 — day-grain Team Sales join (if Step 0 says no)

The constraint that makes this work: **a rep can only be at one show on a given day.**

1. Query Team Sales one **day** at a time → rep × day CPO and orders.
2. The Phase A roster says which event that rep was standing at that day.
3. Join on rep + day → per-rep CPO and orders **per event**.

Sizing: **513 distinct selling days** across 2025 + 2026 (305 + 208). Scripted and unattended.
Drive the ExtJS components directly with the `__slice` runner pattern in
`vectorconnect-coordinator-pay` — resolve components by `itemId`, never by remembered id, and echo
the applied filter values back with every slice so a silently-unapplied filter can't produce
plausible wrong numbers. Event type valueField is the code (`FAIR`, `IND`, `SERV`, `MALL`, `REAL`,
`FDRL`, `TEAM`), division is the bare `'75'`.

**Validate before the full run.** 24 days in 2025 had exactly one show running. Pick one, query
that single day, and check the rep CPOs sum to that event's Event Sales total. If it ties, the
method is proven for the cost of one query. If it doesn't, the likely cause is that Team Sales
filters on *order-written* date rather than event date — diagnose that before spending an hour.

**Known gaps to handle, not paper over:**
- A rep at two shows in one day (rare, but the roster will show it) → flag, don't split evenly.
- A rep with sales on a day the roster doesn't place them → unattributed bucket, reported.
- Cross-division reps (Alan, Foss, Eli, Sean, Jeremy, Roman) work outside Rising Sun. For a
  per-event join scoped to RSD shows, Division 75 is correct — but their day totals may include
  outside sales, which is exactly why the single-show-day validation matters.

---

## 7. Run order

| # | Step | Where | Blocks |
|---|---|---|---|
| 0 | Details probe | Chrome, Mac | C only |
| 1 | Enumerate tabs, map to seasons | Sheets API, Mac | A |
| 2 | Build parser + alias map, Alan confirms map | Mac | A |
| 3 | Parse → `roster` on 2025 + 2026, validate vs `shifts` | Mac | B |
| 4 | Drill-down UI, dollar columns dashed | repo | — |
| 5 | Ship: commit `data.json` + `index.html`, push | repo | — |
| 6 | Phase C per Step 0's answer, backfill `orders`/`cpo` | Mac | — |
| 7 | Re-publish `data.json` | repo | — |

Steps 1–5 deliver a working "who worked this event" drill-down without VectorConnect at all.

## 8. Open decisions

- **2023/2024 backfill?** Scoped to 2025 + 2026. The parser is season-agnostic, so adding them
  later is a re-run, not a rewrite — if those tabs still exist.
- **Do reps see each other's numbers?** The published `data.json` is world-readable to anyone with
  the site. Per-rep CPO next to a rep's name is a different disclosure than a team total. Decide
  before step 7, not after.
- **Half-shift rules in the UI?** Roster shows raw rep-days. If the Mesa half-shift convention
  should appear anywhere, it needs its own labelled column.
