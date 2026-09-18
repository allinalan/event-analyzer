#!/usr/bin/env node
// Build the target list for the roster pull.
//
// Every event in data.json carries its VectorConnect id in eventRaw
// ("00081320 - Maricopa County Home & Garden Show"), so the pull never needs to
// run the Event Sales report or scope a grid -- it reads the ids from here and
// asks VectorConnect about each one directly.
//
// The stored total/orders travel with each target so the browser step can tie
// each roster out the moment it lands, rather than discovering a bad pull later.
//
//   node tools/roster-targets.mjs 2025 2026 > /tmp/roster-targets.json
//
// Events with no orders are skipped: VectorConnect has no rep summary for an
// event nobody sold at, and asking is 79 wasted round trips on 2025+2026.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const years = process.argv.slice(2).map(Number).filter(Boolean);
if (!years.length) {
  console.error('usage: node tools/roster-targets.mjs <year> [year...]');
  process.exit(1);
}

const { events } = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));
const targets = [];
const skipped = { noOrders: 0, noId: 0 };

for (const e of events) {
  if (!years.includes(e.year)) continue;
  const id = (String(e.eventRaw).match(/^\s*(\d+)\s*[-–—]/) || [])[1];
  if (!id) { skipped.noId++; continue; }
  if (!(e.orders > 0)) { skipped.noOrders++; continue; }
  targets.push({ id, name: e.eventDisplay, year: e.year, total: e.total, orders: e.orders });
}

console.log(JSON.stringify(targets, null, 2));
console.error(
  `${targets.length} targets for ${years.join(', ')} ` +
  `(skipped ${skipped.noOrders} with no orders, ${skipped.noId} with no parseable id)`
);
