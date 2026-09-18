---
name: event-analyzer-deploy
description: "How the Event Analyzer dashboard is hosted, authed, and how to publish data updates for reps"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5a7a8d88-8416-4355-8e1c-a0235a8ffa20
---

The Event Analyzer dashboard (`event_dashboard.html` in the Stats folder) is deployed to GitHub Pages as repo **allinalan/event-analyzer** — live at **https://allinalan.github.io/event-analyzer/**. Public repo (required for free Pages). This is a SEPARATE project from the rep HUB / "Rep Analyzer" work — do not conflate.

**Auth:** there is no `gh` CLI installed. Use the GitHub token in the macOS keychain: `TOKEN=$(security find-internet-password -s github.com -w)`. GitHub username is `allinalan`. Push without storing the token in the remote: `git push "https://x-access-token:$<email>/allinalan/event-analyzer.git" main`. Repo create / Pages enable via the REST API with `Authorization: token $TOKEN`.

**Architecture — owner edits, reps view (like Google Sheets sharing):** the HTML contains NO data. Data lives in the browser's localStorage (key `cutco_event_dashboard_v2`). A published `data.json` in the repo is auto-fetched on startup (`loadPublishedData`) so reps see the owner's numbers with no upload; local data wins only when newer. To update what reps see: owner uploads spreadsheet in the dashboard → **Data & Settings → ⬇ Download data.json** → drop it in the Stats folder → commit + push `data.json`. `index.html` is the source of truth — Pages serves it, and it is the file that has actually been maintained. `event_dashboard.html` is a byte-identical copy of it for the Stats folder: edit `index.html`, then `cp index.html event_dashboard.html` before committing. (The two had drifted 742 lines apart under the old "index is a copy of event_dashboard" wording; re-synced 2026-09-18.)

**Local preview:** `python -m http.server` is blocked by the sandbox (getcwd PermissionError). Use the node static server `server.js` on port 8766 via `.claude/launch.json` + the Claude_Preview MCP. Both are gitignored. Note `window.STATE` is NOT exposed (IIFE) — screenshot to verify, don't introspect `window.STATE`.

See [[event-analyzer-design]] for design decisions.
