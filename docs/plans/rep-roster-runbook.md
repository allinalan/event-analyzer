# Rep roster drill-down — execution runbook

**You are running this on Alan's Mac mini. This file assumes no prior context.**

You are adding a feature to the Event Analyzer (`allinalan/event-analyzer`, served by GitHub
Pages): on the **By Event** tab, clicking an event row expands a panel showing the reps who worked
it and their numbers.

The design reasoning, the data model and the exposure rules live in
**`docs/plans/rep-roster-drilldown.md`** in this repo. Read it before step 4 and before step 5.
This file is the order of operations; that file is the why.

**Two hard rules, both already cost something once:**

1. **One VectorConnect tab. Only ever one.** Opening a second kills the session and dumps every
   tab back to login. Navigate the existing tab; never open a new one against vectorconnect.com.
2. **Never publish per-rep dollars without Alan saying so** (step 4). The guardrails make that
   take a deliberate act — do not route around them.

---

## Step 0 — orient

```sh
cd <the event-analyzer clone>          # ask Alan where it is if it is not obvious
git fetch origin claude/wonderful-fermi-kqgde8
git checkout claude/wonderful-fermi-kqgde8
git pull
node --version                         # need v18+
ls tools/                              # expect roster-targets.mjs, pull-rosters.js, build-roster.mjs
```

If `node` is missing, say so and stop — do not install anything without asking.

## Step 1 — build the target list

```sh
node tools/roster-targets.mjs 2025 2026 > roster-targets.json
```

Expect on stderr: `387 targets for 2025, 2026 (skipped 79 with no orders, 0 with no parseable id)`.

A wildly different number means `data.json` changed since this was written — report it and stop
rather than pulling against a list you do not recognise.

## Step 2 — pull the rosters from VectorConnect

Needs Chrome connected and **already logged in** to VectorConnect. You cannot perform the login.
If the login screen appears, ask Alan to log in and wait.

Load the Chrome tools in one call:

```
ToolSearch select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text
```

If several browsers are connected, **ask which one** — the other may not hold the session.

1. Navigate the existing tab to `https://www.vectorconnect.com/event/reports`.
   Confirm you are logged in: `typeof Ext !== 'undefined'` and `location.href` is not the login page.
2. Inject the targets: read `roster-targets.json` and set `window.__TARGETS` to its contents.
   If one injection is too large, set it in chunks (`window.__TARGETS = (window.__TARGETS||[]).concat([...])`).
3. Inject `tools/pull-rosters.js` verbatim.
4. Run `await pullRosters()`. Takes about a minute for 387 events.
5. Move the download into the repo:

```sh
mv ~/Downloads/roster-raw.json ./roster-raw.json
```

**Report to Alan before continuing:** events pulled, how many tied out, how many mismatched, how
many failed. Do not quietly proceed past a large failure count.

The pull is resumable — results accumulate on `window.__ROSTER_OUT` and anything already fetched is
skipped. If the session bounces mid-run, have Alan log back in and call `await pullRosters()` again
with the same targets; it picks up what it missed. `dumpRosters()` downloads whatever is held so far.

## Step 3 — STOP. Ask Alan the exposure level.

**Do not skip this and do not pick for him.** `roster.json` is served from a public URL, so this
decides who can read every rep's per-event CPO.

Ask him to choose:

| Level | What gets published | |
|---|---|---|
| `off` | nothing — roster stays local to his browser | the shipped default |
| `names` | rep names only; **the dollar keys are not written to the file** | |
| `full` | names **and** per-rep CPO and orders, readable by anyone with the site URL | |

Read `docs/plans/rep-roster-drilldown.md` §8 and give him the tradeoff in a sentence or two. If he
wants the full roster visible to his team but not the public, that needs real auth in front of the
site (§8.3) — not a code change here.

## Step 4 — build the published file

```sh
node tools/build-roster.mjs roster-raw.json --level=<his answer>
```

`--level=full` writes `roster.local.json`, which is gitignored. It only becomes the published
`roster.json` if you also pass `--publish` — **and you only pass that if Alan explicitly chose to
publish dollars.**

The script refuses to publish any event whose rep rows do not sum to the `total` and `orders`
already stored in `data.json`. Report any event it left out; do not try to force one through.

## Step 5 — build the drill-down UI

Spec is `docs/plans/rep-roster-drilldown.md` §5. Summary:

- `renderEvent()` is at `index.html:3920`; the table HTML is assembled from `4086` and written to
  `#evTable` at `4128`.
- Lazy-load `roster.json` when a row first expands; a missing file is not an error (level `off`).
- Caret in the Event cell **only** on rows that have a roster — no dead affordance on the rest.
- Click toggles a `<tr class="roster-row"><td colspan="N">` right after the row. Keep expansion
  state in `STATE` keyed on `eventRaw` so sorting or filtering does not collapse it.
- Keyboard: `role="button"`, `tabindex="0"`, Enter/Space toggles, `aria-expanded` on the trigger.
- Columns: Rep · Orders · CPO · Avg order · Shifts · CPO/shift, sorted by CPO descending.
  Read `level` from `roster.json`; at `names` the dollar keys are absent, so render them as `—`.
  Em-dash, never `$0`.

**Respect the design system** — `docs/history/event-analyzer-design.md`. Fraunces for the panel
heading, Geist for the table, Geist Mono for labels, tabular lining numerals on every figure,
accent `#B45309` on the caret only, reuse `.tbl` / `.tbl-wrap`, no emoji.

Check it in a browser at phone width before shipping.

## Step 6 — ship

```sh
git add index.html            # plus roster.json ONLY if level is names, or full with Alan's yes
git status                    # confirm roster-raw.json and roster-targets.json are NOT staged
git commit
git push -u origin claude/wonderful-fermi-kqgde8
```

`roster-raw.json`, `roster-targets.json` and `roster.local.json` are gitignored — if any of them
shows up in `git status`, stop and work out why before pushing.

Do **not** open a pull request unless Alan asks.

---

## Failure modes

| Symptom | What it means | Do |
|---|---|---|
| Response is not JSON | session bounced to login | Ask Alan to log in, re-run — the pull resumes |
| `hit limit=500 — roster truncated` | an event has 500+ selling reps | Almost certainly a bug, not a real show. Report it |
| Many events "did not tie out" | `data.json` is stale vs VectorConnect, or events were re-ranked | Report the list. Do not publish them |
| `Ext is undefined` | not on a VectorConnect page, or logged out | Check `location.href` |
| Every event fails | wrong tab, or wrong browser | Re-check with `tabs_context_mcp` |

## Done means

- `roster.json` built at the level **Alan chose out loud**, every published event tying out
- Rows with a roster expand; rows without show no caret
- Dollar columns render `—` at level `names`, never `$0`
- `roster-raw.json` is not in git
- Branch pushed, no PR opened
- Alan told: how many events got a roster, how many did not, and anything that failed
