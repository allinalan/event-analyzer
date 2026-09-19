#!/usr/bin/env node
// Turn the raw pull into the roster.json the site publishes, at the exposure
// level the owner chose. See docs/plans/rep-roster-drilldown.md section 8.
//
//   node tools/build-roster.mjs roster-raw.json --level=names
//
//   off    write nothing at all                            (default)
//   names  rep names only -- cpo/orders/avg keys OMITTED
//   full   names and dollars
//
// Publishing dollars takes two deliberate acts, never one. --level=full writes
// roster.local.json, which is gitignored; it only becomes the published
// roster.json if you also pass --publish. That way no single command, and no
// "git add -A", can put per-rep CPO on a public site by accident.
//
// "names" deletes the keys rather than zeroing or nulling them. That is the
// whole point: a client-side check that hides dollars still ships the dollars,
// and anyone can curl the file. If the numbers are not in the artifact there is
// nothing to leak.
//
// Re-validates every event against data.json rather than trusting the browser
// step's own tie-out, so a hand-edited raw file cannot slip through. The CPO
// compare allows n * $0.50 for per-rep rounding (see the tie-out below); orders
// must match exactly.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const rawPath = args.find(a => !a.startsWith('--'));
const level = (args.find(a => a.startsWith('--level=')) || '--level=off').split('=')[1];
const publish = args.includes('--publish');

if (!rawPath) {
  console.error('usage: node tools/build-roster.mjs <roster-raw.json> --level=off|names|full');
  process.exit(1);
}
if (!['off', 'names', 'full'].includes(level)) {
  console.error(`unknown level "${level}" — expected off, names or full`);
  process.exit(1);
}
if (level === 'off') {
  console.log('level=off — no roster.json written. Nothing is published.');
  process.exit(0);
}

const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const { events: stored } = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));

const byId = new Map();
for (const e of stored) {
  const id = (String(e.eventRaw).match(/^\s*(\d+)\s*[-–—]/) || [])[1];
  if (id) byId.set(id, e);
}

const out = { level, pulledAt: raw.pulledAt || new Date().toISOString(), events: {} };
const problems = [];
let repCount = 0;

for (const [id, roster] of Object.entries(raw.events || {})) {
  const ev = byId.get(id);
  if (!ev) { problems.push(`${id}: not in data.json`); continue; }

  const sumCpo = roster.reduce((a, r) => a + r.cpo, 0);
  const sumOrd = roster.reduce((a, r) => a + r.orders, 0);
  // pull-rosters.js rounds each rep's CPO to a whole dollar, so a roster of n reps
  // sums to a whole dollar too -- while data.json legitimately carries cents
  // ($51,733.50). An exact compare can therefore never match those events, and
  // rejected 29 of them the first time VectorConnect handed back cent-level totals.
  // A rounded rep is off by at most $0.50, so n reps are off by at most n * $0.50;
  // anything inside that is arithmetic, not disagreement. Orders are integers on
  // both sides and still have to match exactly.
  //
  // The tolerance stays tight on purpose. What this guard exists to catch -- a
  // truncated page, a re-ranked event, orders booked to the wrong show -- runs to
  // thousands of dollars (the two Maricopa shows traded $16,797), four orders of
  // magnitude outside it. The alternative root fix is to stop rounding in
  // pull-rosters.js, but that invalidates every roster already pulled.
  const cpoTolerance = roster.length * 0.5 + 1e-9;
  if (Math.abs(sumCpo - ev.total) > cpoTolerance || sumOrd !== ev.orders) {
    problems.push(
      `${id} ${ev.eventDisplay}: rows sum to $${sumCpo}/${sumOrd} ord, ` +
      `data.json says $${ev.total}/${ev.orders} ord`
    );
    continue;                                   // never publish a roster that does not tie out
  }

  out.events[ev.eventRaw] = roster.map(r =>
    level === 'full'
      ? { rep: r.rep, cpo: r.cpo, orders: r.orders, avg: r.avg }
      : { rep: r.rep }                          // dollars absent, not zeroed
  );
  repCount += roster.length;
}

// Dollars land in a gitignored file unless publication is asked for outright.
const name = (level === 'full' && !publish) ? 'roster.local.json' : 'roster.json';
const body = JSON.stringify(out);
writeFileSync(join(root, name), body);
const kb = (Buffer.byteLength(body) / 1024).toFixed(1);

console.log(`${name} written at level=${level}`);
console.log(`  events ${Object.keys(out.events).length}  ·  rep rows ${repCount}  ·  ${kb} KB`);
if (name === 'roster.local.json') {
  console.log('  Gitignored — yours to read, not published. Re-run with --publish to');
  console.log('  write roster.json instead, and read section 8 of the plan first.');
} else if (level === 'full') {
  console.log('  WARNING: per-rep CPO, and world-readable the moment this is pushed.');
}
if (problems.length) {
  console.log(`\n${problems.length} event(s) left out because they did not tie out:`);
  for (const p of problems.slice(0, 20)) console.log('  ' + p);
  if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);
}
