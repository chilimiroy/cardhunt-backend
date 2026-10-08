// priceage.test.js — the card page says WHEN its headline price was recorded
// (T2, 2026-10-02). Rayquaza Gold Star showed $2,500.99 from a 2026-07-27
// row as if it were today's; 12 cards of $20+ sat like that.
//
//   node priceage.test.js
//
// Runs the page's REAL priceAgeHtml (extracted from cardhunt_preview.html),
// and checks the badge is the one place that calls it with _priceDate.
'use strict';
require('./testcount')(11);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
const H = fs.readFileSync(__dirname + '/cardhunt_preview.html', 'utf8').replace(/\r\n/g, '\n');   // CRLF-tolerant
let pass = 0, fail = 0;
const ok = (c, label, d) => { if (c) pass++; else { fail++; console.log('  FAIL ' + label + (d ? '  ' + d : '')); } };

const i = H.indexOf('function priceAgeHtml(');
const j = H.indexOf('\n}\n', i);
ok(i > 0 && j > i, 'priceAgeHtml is defined in the page');
let priceAgeHtml = null;
try {
  priceAgeHtml = new Function(H.slice(H.indexOf('function liveEsc('), H.indexOf('}); }', H.indexOf('function liveEsc(')) + 5)
    + '\n' + H.slice(i, j + 2) + '\nreturn priceAgeHtml;')();
} catch (e) { ok(false, 'priceAgeHtml + liveEsc compile', e.message); }

if (priceAgeHtml) {
  const day = 86400000;
  const old = priceAgeHtml(new Date(Date.now() - 66 * day).toISOString());
  ok(/66 days old/.test(old) && /not re-priced since/.test(old), 'a 66-day-old price SAYS it is old', old);
  ok(/var\(--am\)/.test(old), '...in the warning colour');
  const fresh = priceAgeHtml(new Date(Date.now() - 2 * day).toISOString());
  ok(fresh && !/days old/.test(fresh) && /&middot;/.test(fresh), 'a 2-day-old price is a plain date (KEEP: no warning)', fresh);
  const edge = priceAgeHtml(new Date(Date.now() - 30 * day + 60000).toISOString());
  ok(!/days old/.test(edge), '30 days is not yet old', edge);
  ok(priceAgeHtml(null) === '' && priceAgeHtml(undefined) === '' && priceAgeHtml('not a date') === '',
     'no date held: nothing is claimed');
  ok(!/<script/i.test(priceAgeHtml('2026-07-27T00:00:00Z')), 'output carries no markup from the input');
}

// The badge reads the card's own recorded date, and only on a real price.
const badge = H.slice(H.indexOf('// The badge says where the headline came from'), H.indexOf('function priceAgeHtml('));
ok(/priceAgeHtml\(cc\._priceDate\)/.test(badge), 'the headline badge shows cc._priceDate');
ok(badge.indexOf('priceAgeHtml(') < badge.indexOf("no market data held"), 'the date sits in the real-price branch, not on an estimate');
ok((H.match(/priceAgeHtml\(/g) || []).length === 2, 'one definition, one caller', String((H.match(/priceAgeHtml\(/g) || []).length));
// The server sends the date on the card endpoint the page opens.
const S = fs.readFileSync(__dirname + '/server.js', 'utf8');
ok(/_priceDate: c\.recorded_at/.test(S), 'server /api/cards/:id carries _priceDate');

console.log(`\n  priceage.test.js — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
