// Pull the per-rep roster for every event, from inside a logged-in VectorConnect tab.
//
// The blue person icon on an Event Sales row is a plain GET against an ExtJS
// pivot endpoint:
//
//   /event/reports/orderSummary?_dc=<ms>&event=<id>&repNumber=&type=repName
//                              &page=1&start=0&limit=25
//
//   -> { "rows": [ { summaryField: "Matt Foss", cpo: 23939.0, orders: 19,
//                    average: 1259.94736, orderDate: "1969-12-31", id: 7 } ] }
//
// It needs no headers and no token: running it here inherits the session
// cookie, which is why nothing about the login ever has to be copied anywhere.
//
// HOW TO RUN (one VectorConnect tab, already logged in -- a second tab kills
// the session and dumps every tab back to login):
//   1. node tools/roster-targets.mjs 2025 2026 > roster-targets.json
//   2. In the tab's console:  window.__TARGETS = <paste that file's contents>
//   3. Paste this file, then:  await pullRosters()
//   4. It downloads roster-raw.json when it finishes.
//
// Re-running is safe -- it is all reads.

(() => {
  'use strict';

  // VectorConnect defaults this endpoint to limit=25. A show with 26+ selling
  // reps would come back quietly truncated and look perfectly plausible, so ask
  // for far more than any event could have and shout if we ever hit the ceiling.
  const LIMIT = 500;

  // Small gap between calls. 387 events at 150ms is under a minute and stays
  // well inside the 2-hour session window, while not hammering their server.
  const DELAY_MS = 150;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const round = n => Math.round(Number(n) || 0);

  async function fetchRoster(eventId) {
    const url = `/event/reports/orderSummary?_dc=${Date.now()}` +
                `&event=${encodeURIComponent(eventId)}` +
                `&repNumber=&type=repName&page=1&start=0&limit=${LIMIT}`;
    const resp = await fetch(url, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // A bounced session answers with the login page, not JSON. Catch it by
    // content type rather than by letting JSON.parse throw something cryptic.
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('not JSON — session may have bounced to login');

    const body = await resp.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length >= LIMIT) throw new Error(`hit limit=${LIMIT} — roster truncated`);

    return rows.map(r => ({
      rep: String(r.summaryField || '').trim(),
      cpo: round(r.cpo),
      orders: round(r.orders),
      avg: round(r.average),
    }));
  }

  async function pullRosters(targets = window.__TARGETS) {
    if (!Array.isArray(targets) || !targets.length) {
      console.error('Set window.__TARGETS first — see the header of this file.');
      return;
    }
    if (typeof Ext === 'undefined') {
      console.warn('Ext is undefined — if this is the login page, log in and re-run.');
    }

    const out = { pulledAt: new Date().toISOString(), events: {}, tieOut: {} };
    const failed = [];
    const mismatched = [];
    const t0 = Date.now();

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const roster = await fetchRoster(t.id);
        out.events[t.id] = roster;

        // The rep rows must sum to the totals the Analyzer already stores for
        // this event. This is what catches a truncated page, a re-ranked event,
        // or a filter that silently did not apply -- all of which otherwise
        // produce numbers that look fine.
        const sumCpo = roster.reduce((a, r) => a + r.cpo, 0);
        const sumOrd = roster.reduce((a, r) => a + r.orders, 0);
        const ok = sumCpo === round(t.total) && sumOrd === round(t.orders);
        out.tieOut[t.id] = ok;
        if (!ok) mismatched.push({ ...t, sumCpo, sumOrd, reps: roster.length });
      } catch (err) {
        failed.push({ ...t, error: String(err.message || err) });
        if (/session may have bounced/.test(String(err.message))) {
          console.error(`Stopped at ${i + 1}/${targets.length} — log back in and re-run.`);
          break;
        }
      }
      if ((i + 1) % 25 === 0 || i + 1 === targets.length) {
        console.log(`${i + 1}/${targets.length} · ${failed.length} failed · ${mismatched.length} off`);
      }
      await sleep(DELAY_MS);
    }

    out.failed = failed;
    out.mismatched = mismatched;

    const pulled = Object.keys(out.events).length;
    const tied = Object.values(out.tieOut).filter(Boolean).length;
    console.log(
      `\nDone in ${Math.round((Date.now() - t0) / 1000)}s\n` +
      `  pulled     ${pulled}/${targets.length}\n` +
      `  tied out   ${tied}/${pulled}\n` +
      `  mismatched ${mismatched.length}\n` +
      `  failed     ${failed.length}`
    );
    if (mismatched.length) console.table(mismatched.slice(0, 20));
    if (failed.length) console.table(failed.slice(0, 20));

    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'roster-raw.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);

    return out;
  }

  window.pullRosters = pullRosters;
  console.log('pullRosters() ready — set window.__TARGETS, then: await pullRosters()');
})();
