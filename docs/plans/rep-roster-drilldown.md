# Rep roster drill-down — build plan

**Goal:** on the **By Event** tab, clicking an event row expands a panel showing the reps who
worked it, their orders, their CPO, and their average order.

**Status:** planned, not built. Runs locally on the Mac mini, where VectorConnect is reachable
through Chrome.

> **Revised 2026-09-18.** The Details probe came back positive and inverted the plan. VectorConnect
> serves the whole roster — names, orders and CPO — in one modal per event. The Show Shift Schedule
> is no longer the primary source; it becomes an overlay. The 513-query day-grain join that the
> first draft specced is **deleted** — it is not needed.

---

## 1. The source: "Summary by Rep"

Eventalytics → **Event Sales** → the **blue person icon** in the Details column of any event row
opens `Summary by Rep for <event id> - <event name>`:

| Rep | CPO | Orders | Average |
|---|---|---|---|
| Adam Conroy | $6,626 | 14 | $473 |
| Alan Hernandez | $10,167 | 18 | $565 |
| Alec Luyendyk | $17,668 | 15 | $1,178 |
| Jason Jeffrey | $11,942 | 17 | $702 |
| Jeremy Katen | $1,207 | 1 | $1,207 |
| Luke Mills | $15,512 | 18 | $862 |
| Matt Foss | $23,939 | 19 | $1,260 |
| | **$87,061** | **102** | **$854** |

The modal has its own **Export** button.

**It ties out exactly.** `data.json` already holds `00081320 - Maricopa County Home & Garden Show`
at `total: 87061, orders: 102`. The rep rows sum to the dollar and to the order. This is not an
inferred attribution — it is the same number the Analyzer already displays, broken apart by the
system that owns it.

**It gives full names.** `Matt Foss`, not `Foss`. `Adam Conroy`, not `Adam C`. That makes
VectorConnect the naming authority and collapses most of the alias problem the first draft agonised
over.

**It crosses divisions.** Jeremy Katen appears with a single order. Anyone who wrote an order at the
event shows up, regardless of division.

The other four Details icons (green `$`, orange flag, red calendar, red tag) are unexplored. Not
chasing them now, but worth one click each sometime — one of them may be items-sold detail.

---

## 2. Coverage — this is the part that changed most

Any event with orders has a rep summary. The shift schedule only ever covered the events someone
remembered to staff on a spreadsheet.

| Season | Events | Roster from shift schedule | Roster from VC | Gain |
|---|---|---|---|---|
| 2025 | 296 | 134 | **249** | +115 |
| 2026 | 170 | 71 | **138** | +67 |
| 2024 | 315 | 40 | **264** | +224 |
| 2023 | 286 | 51 | **253** | +202 |

**2025 + 2026: 387 of 466 events get a roster, up from 205.** 44% → 83%. The remaining 79 have zero
orders, so there is genuinely nothing to show.

And 2023/2024 are now cheap. The first draft dropped them because the shift schedule barely covered
them; VC covers them at 84% and 89%. Including them is a longer script run, not extra work.

The Maricopa event above makes the point on its own: `shifts: null` in `data.json` — the shift
schedule never had it — and VC hands over seven named reps with dollars attached.

---

## 3. Data model — the `roster` field

```json
{
  "eventRaw": "00081320 - Maricopa County Home & Garden Show",
  "total": 87061,
  "orders": 102,
  "roster": [
    {
      "rep": "Adam Conroy",   // full name, from VectorConnect
      "cpo": 6626,
      "orders": 14,
      "avg": 473,
      "shifts": null,         // Phase C overlay; null = not on the shift schedule
      "days": null,           // Phase C overlay
      "scheduled": null       // Phase C overlay: true/false once the sheet is parsed
    }
  ],
  "rosterPulledAt": "2026-09-18T00:00:00.000Z",
  "rosterTieOut": true        // rep rows summed to `total` and `orders`
}
```

`rosterTieOut` is the cheap integrity flag — set it per event at parse time. A `false` means VC's
own numbers disagreed with each other and the row needs eyes, not that the join is wrong.

**Size:** 387 events × ~6 reps ≈ 2,300 entries, well under 200 KB on a 622 KB `data.json`. Inline is
fine. If it ever bites, split to a lazy-loaded `roster.json` keyed on `eventRaw`.

---

## 4. Phase A — pull the rosters (Mac mini, Chrome)

### 4.1 Don't click 387 times

The modal is ExtJS, like the rest of VectorConnect. Open DevTools → Network, click the blue person
icon once, and capture the request it fires. It will carry the event id (`00081320`). Then loop that
request over every event id in the Event Sales grid store rather than driving the UI.

Fallbacks, in order of preference:
1. The captured endpoint, looped over event ids — one small call per event, fast and unattended.
2. The modal's store, resolved by `itemId` through `Ext.getCmp` / `cascade`, opened and read per row
   (same pattern as the `__slice` runner in `vectorconnect-coordinator-pay`).
3. Click + modal Export, 387 times. Last resort. The export filenames will not identify the event,
   so record the id → filename mapping as each lands.

### 4.2 Rules that carry over from the existing VC skills

- **One tab. Only ever one tab.** A second VectorConnect tab kills the session and dumps every tab
  to login, mid-run. Navigate the existing tab; never `tabs_create` against vectorconnect.com.
- Resolve components by `itemId`, never by a remembered auto-generated id.
- `Ext` being `undefined` means the page bounced to login — check `location.href` and say so.
- Echo the applied filters back with each pull. A silently-unapplied filter is the one failure mode
  that produces plausible wrong numbers.

### 4.3 Scope the grid before pulling

Event Sales, period by campaign preset, **all seven event types**, Division 75. Per campaign:
C1 (Jan–Apr), C2 (May–Aug), C3 (Sep–Dec). Six runs covers 2025 + 2026; twelve covers 2023–2026.

Sanity-check the grid's `Totals for N Events` against `data.json`'s count for that window before
pulling any rosters. If the count is off, a filter didn't apply.

### 4.4 Join and validate

Join on the **VC event id**, parsed from the leading digits of `eventRaw` (`00081320`). Every one of
the 1,067 events has one. No name matching, no date matching, no fuzzy anything.

Per event, assert `sum(roster[].cpo) == total` and `sum(roster[].orders) == orders`. Report every
mismatch rather than writing it silently — a mismatch means either the grid was filtered differently
than the Analyzer's stored figure, or the event was re-ranked since the last upload.

Report before writing: events pulled, events tied out, events that didn't, distinct rep names found.

---

## 5. Phase B — the drill-down UI (`index.html`)

**Where:** `renderEvent()` at `index.html:3920`; table HTML assembled from `4086` and written to
`#evTable` at `4128`. Rows currently render flat into a `<tbody>`.

**Interaction**
- Caret in the Event cell, only on rows with a non-empty `roster`. No dead affordance on the rest.
- Click toggles a `<tr class="roster-row"><td colspan="N">` immediately after the row.
- Expansion state in `STATE`, keyed on `eventRaw`, so sorting or filtering doesn't collapse it.
- Keyboard: `role="button"`, `tabindex="0"`, Enter/Space toggles, `aria-expanded` on the trigger.

**Panel contents** — sorted by CPO descending:

| Rep | Orders | CPO | Avg order | Shifts | CPO/shift |

Shifts and CPO/shift render as `—` until Phase C. Em-dash, never `$0` — same rule as the RSD
dashboard.

**Design system** — `docs/history/event-analyzer-design.md`, don't bulldoze it: Fraunces for the
panel heading, Geist for the table, Geist Mono for labels; tabular lining numerals on every figure;
accent `#B45309` on the caret only; semantic colors only where a number means something; reuse
`.tbl` / `.tbl-wrap`; no emoji.

---

## 6. Phase C — shift schedule overlay (optional, and now the interesting half)

VC answers *who sold*. The shift schedule answers *who stood there*. **The gap between them is the
coaching data.** A rep who worked three shifts and doesn't appear in Summary by Rep sold nothing —
and nothing in the Analyzer can surface that today.

So the overlay adds two things VC cannot know:
1. `shifts` and `days` per rep — enabling **CPO per shift per rep**, which is the real productivity
   number.
2. Reps who were **scheduled but wrote no orders** — appended to the roster with `cpo: 0`,
   `orders: 0`, `scheduled: true`, `sold: false`.

### 6.1 Sources

| Workbook | File ID | Last modified |
|---|---|---|
| Jan-May Show Shift Schedule | `1Z8SN4FVBPzZrxe3F4FbmwjsSLRPH9GWJZratALVK0vk` | 2026-09-13 |
| May-Sep Show Shift Schedule | `17gPzz1g5JHIiou5BbMmUZQd2RvlMdvhqHr91l0E7Sgo` | 2026-08-30 |
| Sept-Feb Show Shift Schedule | `10p5Ro2WpeJ7mMOyS92OWIT3w3Nl-KGX4vBMkXJoOCTs` | 2026-09-17 |

Enumerate tabs with the **Sheets API** (`spreadsheets.get` → `sheets[].properties.title`) and map
each to a season first. A Drive export flattens every tab into one blob with no markers and
truncates around 285 K characters.

### 6.2 Column geometry — fixed, verified

| Col | Contents |
|---|---|
| 1–11 | Weekend header, merged: `Weekend 1/1` (month/day, **no year** — year comes from the tab) |
| 2 | Status — `Booked` / `Prospective` / `Cancelled` |
| 3 | BEST CPO |
| **4** | **Discriminator: event name on an event row, `Shift N` on a shift row** |
| 5–11 | Day columns. Event row holds day-of-week labels; shift rows hold rep names in the same positions |
| 12 | Cost |
| 13 / 14 | Start Date / End Date — often blank |
| 15 / 16 | City, State / Location |
| 18–22 | Promoter, Contact, Phone, Email, Website |

```
col: 2:Booked  4:Mesa Market Place Swapmeet A ROW  5:Fri  6:Sat  7:Sun  12:$2,089.00  15:Mesa
col:           4:Shift 1                           5:Adam C  6:Adam c  7:Adam C
col:           4:Shift 2
```

Walk rows carrying `current_weekend` and `current_event`. Zip each shift row's cols 5–11 against the
parent event row's day labels. Resolve day columns to dates from cols 13/14 when present, else the
weekend header + tab year walked forward to the labelled weekday. Ignore empty, `x`, `X`, `-`,
`TBD`. Multiple `Shift N` rows under one event union into that event's roster.

Reference shape: `~/.claude/skills/.../count-mesa-shifts/scripts/count_shifts.py` — but it hardcodes
3 day columns for Mesa; **the general parser must handle 2–7**, driven by the event row's labels.

### 6.3 Name matching is now easy — match into the VC roster

This is the part Phase A rescued. Rather than resolving `Foss` against a global alias table, resolve
it **against the handful of reps VC already placed at that event**. `Foss` → `Matt Foss`,
`Adam C` → `Adam Conroy`, `Alec` → `Alec Luyendyk`, all unambiguous within a 7-name set.

Rules, applied in order: strip a trailing `.`; case-insensitive; match on first name, or on surname,
or on `First L` against `First Last`. Then the cases the sheet actually contains:

| Class | Examples | Rule |
|---|---|---|
| Field trainee | `Alan (FT-Arianna)`, `Zach (FT- Ann)`, `Alan (Ft-David` *(unclosed paren)* | Rep = text before `(`; trainee → `trainees[]`. Match `\(\s*ft\s*[-–]\s*([^)]*)`, case-insensitive, tolerate the missing `)` |
| Two in one cell | `John and Roman` | Split on ` and ` / `&` / `/` → two entries, each a full shift |
| Nickname | `Cam` → Cameron, `JP` → J. Parker | Only if no VC match; keep a small alias file for these |
| Junk | `m` | Length-1 non-initial → drop, log |

**Ambiguous or unmatched against that event's VC roster → report it, don't guess.** An unmatched name
is either a rep who sold nothing (the signal we're after) or a typo, and those two must not be
silently merged.

### 6.4 `shifts` means two different things — keep them apart

The Mesa counter applies half-shift rules (Fri/Sun with 2 people = 0.5 each). That is a **pay** rule.
`roster[].shifts` is raw rep-days — one rep, one day, one shift. Label them distinctly or someone
will lose an afternoon reconciling numbers that were never meant to match.

---

## 7. Run order

| # | Step | Where | Blocks |
|---|---|---|---|
| ~~0~~ | ~~Details probe~~ | — | **Done — Summary by Rep confirmed** |
| 1 | Capture the modal's network request | Chrome, Mac | 2 |
| 2 | Loop it over event ids, per campaign; tie out each event | Mac | 3 |
| 3 | Write `roster` into `data.json` for 2025 + 2026 | Mac | 4 |
| 4 | Drill-down UI, shift columns dashed | repo | 5 |
| 5 | Ship: commit `data.json` + `index.html`, push | repo | — |
| 6 | Backfill 2023 + 2024 (same script, wider window) | Mac | — |
| 7 | Phase C overlay: shifts, CPO/shift, scheduled-but-sold-nothing | Mac | — |

**Steps 1–5 deliver the feature as asked.** Everything after is upside.

---

## 8. Decide before step 5

**Do reps see each other's numbers?** This is now the live question, not a footnote. The published
`data.json` is readable by anyone with the site URL, and step 3 puts every rep's per-event CPO and
order count into it. Adam Conroy's $473 average sitting next to Matt Foss's $1,260 at the same show
is a different thing to publish than a team total. Options: publish as-is; publish rosters only to a
gated build; show names to everyone but dollars only to the owner; or aggregate below a threshold.
**Pick one before pushing, not after** — this is far easier to not-publish than to un-publish.

**The other four Details icons.** One click each, sometime. Cheap to check, and one may be
items-sold detail worth having.

**2023/2024 now nearly free.** The original reason to skip them was shift-schedule coverage. VC
covers them at 89% and 84%. Say the word and step 6 folds them in.
