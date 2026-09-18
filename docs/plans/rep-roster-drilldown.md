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

## 3. Data model — the roster entry

One entry per rep who wrote an order at the event, at `level: "full"`:

```json
{
  "rep": "Adam Conroy",   // full name, from VectorConnect
  "cpo": 6626,
  "orders": 14,
  "avg": 473,
  "shifts": null,         // Phase C overlay; null = not on the shift schedule
  "days": null,           // Phase C overlay
  "scheduled": null       // Phase C overlay: true/false once the sheet is parsed
}
```

Per event, alongside its entries: `tieOut` — the cheap integrity flag, set at parse time when the
rep rows summed to the event's stored `total` and `orders`. A `false` means VC's own numbers
disagreed with each other and the row needs eyes; it does not mean the join is wrong.

**Where it lives:** a separate `roster.json`, keyed on `eventRaw`, lazy-loaded when a row first
expands — **not** inline in `data.json`. The first draft had it inline; §8 moves it out, because a
separate file is what lets the published artifact carry names without dollars, or nothing at all.
Size is incidental (387 events × ~6 reps ≈ 2,300 entries, under 200 KB) — the split is about
exposure control, not bytes.

```json
// roster.json
{
  "level": "names",                 // off | names | full — what this file was built at
  "pulledAt": "2026-09-18T00:00:00.000Z",
  "events": {
    "00081320 - Maricopa County Home & Garden Show": [ /* entries as above */ ]
  }
}
```

At `level: "names"` the `cpo`, `orders` and `avg` keys are **omitted entirely**, not zeroed or
nulled. The UI reads `level` and renders the dollar columns as `—` when they are absent.

---

## 4. Phase A — pull the rosters (Mac mini, Chrome) — **scripted, ready to run**

### 4.1 The endpoint

The blue person icon is a plain GET against an ExtJS pivot endpoint. No token, no POST body:

```
GET /event/reports/orderSummary
      ?_dc=1789771445778      // ExtJS cache-buster — pass Date.now()
      &event=00081320         // the VC event id
      &repNumber=             // empty: the pivot's other axis
      &type=repName           // pivot by rep
      &page=1&start=0&limit=25
```

```json
{ "rows": [ { "summaryField": "Matt Foss", "cpo": 23939.0, "orders": 19,
              "average": 1259.94736, "orderDate": "1969-12-31", "id": 7 } ] }
```

Run from inside the logged-in tab it inherits the session cookie, which is why no credential ever
has to be copied anywhere.

### 4.2 `limit=25` is a live truncation trap

The endpoint defaults to 25 rows and the response carries **no total count**. A show with 26+
selling reps would come back silently short and look entirely plausible. `tools/pull-rosters.js`
requests `limit=500` and **throws if the row count ever reaches the ceiling** rather than trusting
it. The per-event tie-out (§4.4) catches it a second time.

### 4.3 The Event Sales grid is not needed

All 1,067 events in `data.json` carry an 8-digit zero-padded VC id in `eventRaw`, all unique, all
parseable — the exact format the `event=` param takes. So the pull reads its targets from
`data.json` and asks about each id directly. No campaign presets, no division filter, no event-type
multi-select, no `Totals for N Events` sanity check. Every filter that could silently fail to apply
is simply absent from this path.

### 4.4 The three steps

```sh
# 1. targets: 387 events for 2025+2026 (events with no orders are skipped)
node tools/roster-targets.mjs 2025 2026 > roster-targets.json

# 2. in the one logged-in VectorConnect tab's console:
#    window.__TARGETS = <paste roster-targets.json>
#    <paste tools/pull-rosters.js>
#    await pullRosters()          -> downloads roster-raw.json, ~1 min

# 3. build at the chosen exposure level (§8)
node tools/build-roster.mjs roster-raw.json --level=names
```

Step 2 ties each event out as it lands: the rep rows must sum to the `total` and `orders` already
stored for that event. Step 3 re-validates against `data.json` independently and **refuses to
publish any event that does not tie out**, so a truncated or hand-edited pull cannot reach the site.

Verified end to end against the real Maricopa response: the seven reps tie to $87,061 / 102 orders
and publish; a deliberately truncated roster and an unknown event id are both rejected; and at
`--level=names` neither the string `"cpo"` nor the value `6626` appears anywhere in the output file.

### 4.5 Two things worth knowing

**No rep number comes back.** The response `id` is a row ordinal (1..7), not a rep id — even though
`repNumber` is an accepted request param. `vectorconnect-coordinator-pay` warns to key reps on
`repNumber` because names repeat across divisions. Within one event the names are unique so the
roster is safe, but **anything that later aggregates reps across events must not key on name alone.**

**`type=repName` implies sibling pivots.** The `orderDate` field comes back as `1969-12-31` (epoch
zero) here because this pivot is by rep, not date — which strongly suggests `type=orderDate` and
friends exist behind the other four Details icons, on the same endpoint. `repNumber` + a date pivot
would give rep × day × event. Worth one probe; not needed for this build.

### 4.6 Rules that carry over

- **One tab. Only ever one tab.** A second VectorConnect tab kills the session and dumps every tab
  to login, mid-run. The scripts only read, so a re-run after re-login is always safe.
- A response that is not JSON means the session bounced to login — `pull-rosters.js` detects this by
  content type and stops rather than logging 300 cryptic parse errors.
- Never *Copy as cURL* and never copy the Request Headers block: both embed the live session cookie,
  and nothing in this pipeline needs them. Applies to buyers too.

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
| ~~1~~ | ~~Capture the modal's network request~~ | — | **Done — endpoint documented in §4.1** |
| 2 | `roster-targets.mjs` → paste `pull-rosters.js` → `await pullRosters()` | Mac | 3 |
| 3 | `build-roster.mjs roster-raw.json --level=…` (§8) | Mac | 4 |
| 4 | Drill-down UI, shift columns dashed | repo | 5 |
| 5 | Ship: commit `index.html` (+ `roster.json` if level ≠ `off`), push | repo | — |
| 6 | Backfill 2023 + 2024 — `roster-targets.mjs 2023 2024`, same two steps | Mac | — |
| 7 | Phase C overlay: shifts, CPO/shift, scheduled-but-sold-nothing | Mac | — |

**Steps 2–5 deliver the feature as asked.** Everything after is upside.

Set the exposure level (§8) before step 3 — it decides what step 3 writes. `off` is the default and
still gives the owner the full roster locally.

---

## 8. Exposure model — decided, and built for resale

The roster puts every rep's per-event CPO and order count into a file served from a public URL.
This section is a build requirement, not a footnote.

### 8.1 Client-side gating is not gating

"Render names to everyone, dollars only to the owner" was in the first draft of this plan and is
**wrong**. On static hosting, if the dollars are in the published JSON then `curl` returns them
whatever the interface draws. A client-side role check is a curtain, not a wall. Do not ship it and
do not describe it to a buyer as privacy.

### 8.2 Split the file, gate at build time

| File | Contents | Published |
|---|---|---|
| `data.json` | events + totals (as today) | always |
| `roster.json` | per-rep names, orders, CPO, keyed on `eventRaw` | only at the configured level |

One config value, read by the **pull script**, never by the browser:

| Level | Emits | Use |
|---|---|---|
| **`off`** | no `roster.json` | **ship default** |
| `names` | names + shifts; **dollar fields never written** | team transparency, low risk |
| `full` | names + dollars | owner-only, or behind real auth |

At `names` the dollars are physically absent from the artifact — there is nothing to curl. That is
the difference between this and 8.1.

The owner keeps full detail locally regardless: the app already holds the owner's working data in
`localStorage` and publishes a separate `data.json` for reps (`index.html:2098`, `2113`). The roster
extends that existing split rather than inventing a new one.

**Default to `off`.** A default is the decision most buyers never revisit.

### 8.3 If a buyer wants the full roster visible to their team

That needs server-side auth, not a flag. Put the site behind something like Cloudflare Access
(free tier for small teams — verify current limits) rather than writing a backend. Document it as
the upgrade path so there is an answer ready instead of one invented during a sale.

---

## 9. Selling this to other coordinators

### 9.1 The buyer runs their own pull

Every coordinator has their own VectorConnect login and their own division. There is no version
where the seller pulls data for customers — that means holding other teams' sales data under their
credentials, and owning every support call and every breach.

The product is therefore a **template repo + pull script + setup guide**, run by the buyer against
their own session.

Lead with this. "Your data lives on your machine, in your repo, on your site — I never see it" is a
stronger answer than "trust my server", and it is the only architecture that works anyway. It also
means zero multi-tenancy: no shared store, no tenant isolation, no per-customer infrastructure. A
sale is a repo clone and a config file.

### 9.2 What must become a parameter

- `<title>` (`index.html:6`) and the `.brand-team` span (`1117`) — the only hardcoded "Rising Sun"
- **Division `75`** — currently baked into the VC skills
- The **cross-division rep list** in `vectorconnect-team-sales-export` — team-specific, cannot ship
- Any **name alias file** — per-tenant by definition; generated during the buyer's setup, never bundled

### 9.3 Open question to resolve upstream

Publishing rep-level sales data to a public URL is one coordinator's own call. A package that leads
twenty coordinators to do it is a different risk profile, and Vector/Cutco corporate may have a
position. Worth asking rather than assuming — `off` as the shipped default means the answer does not
block the build either way.

---

## 10. Still open

- **The other four Details icons.** Green `$`, orange flag, red calendar, red tag. Likely the same
  `orderSummary` endpoint at other `type=` values (§4.5). One probe each,
  sometime — one may be items-sold detail worth having.
- **2023/2024 backfill.** The original reason to skip them was shift-schedule coverage. VC covers
  them at 89% and 84%, so they are now a longer script run rather than extra work.
