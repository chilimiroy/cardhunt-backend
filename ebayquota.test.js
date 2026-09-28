// ══════════════════════════════════════════════════════════════
// ebayquota.test.js — run with: node ebayquota.test.js
//
// Standalone by design. Tests living inside a file that gets replaced
// disappear exactly when they are needed; ingest.js has lost functions
// to reverts three times.
//
// Asserts what the gate ALLOWS as well as what it blocks. A gate tested
// only on refusals passes by refusing everything.
// ══════════════════════════════════════════════════════════════

const q = require('./ebayquota');
let pass = 0, fail = 0;
const chk = (l, c) => { c ? pass++ : fail++;
  console.log('  ' + (c ? 'PASS' : 'FAIL') + '  ' + l); };

function fakeDb(row) {
  return { query: async (sql) => {
    if (/CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/INSERT INTO ebay_quota/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [row] };
    return { rows: [] };
  }};
}
const base = { calls_made: 0, token_calls: 0, ebay_limit: null,
               ebay_remaining: null, ebay_reset: null };
const L = q.DAILY_LIMIT;

(async () => {
  console.log('\nCONFIGURATION\n');
  console.log(`  limit ${L}, reserve ${q.RESERVE}, ` +
              `soft stop ${q.SOFT_STOP * 100}%, warn ${q.WARN_AT * 100}%`);
  const softLeaves = L * (1 - q.SOFT_STOP);
  chk(`soft stop leaves ${Math.round(softLeaves)} — above the ${q.RESERVE} reserve`,
      softLeaves > q.RESERVE);
  chk(`  a ${Math.round(softLeaves - q.RESERVE)}-call band exists between them`,
      softLeaves - q.RESERVE >= 100);
  chk('warn fires before the soft stop', q.WARN_AT < q.SOFT_STOP);

  console.log('\nWHAT IT ALLOWS\n');
  let r = await q.check(fakeDb({ ...base, calls_made: 0 }));
  chk('fresh window — allowed', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: 0 }), { background: true });
  chk('fresh window, background — allowed', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: Math.floor(L * 0.5) }));
  chk('half used — allowed', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: Math.floor(L * 0.5) }), { background: true });
  chk('half used, background — allowed', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: L - q.RESERVE - 200 }));
  chk('just above the reserve — user request allowed', r.allowed);

  console.log('\nWHAT IT BLOCKS\n');
  r = await q.check(fakeDb({ ...base, calls_made: L - Math.floor(softLeaves) + 10 }), { background: true });
  chk('past the soft stop, background — blocked', !r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: L - q.RESERVE }));
  chk('reserve reached — blocked for everything', !r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: L + 500 }));
  chk('over the limit — blocked', !r.allowed);

  console.log('\nTOKEN EXCHANGES COUNT\n');
  r = await q.check(fakeDb({ ...base, calls_made: 100, token_calls: L - 150 }));
  chk('quota spent almost entirely on tokens — blocked', !r.allowed);
  chk('  (the missing expires_in bug burned quota exactly this way)', true);

  console.log("\nEBAY'S HEADERS OVERRIDE THE LOCAL COUNT\n");
  const future = new Date(Date.now() + 3600e3).toISOString();
  const past   = new Date(Date.now() - 3600e3).toISOString();
  r = await q.check(fakeDb({ ...base, calls_made: L - 50,
                             ebay_limit: L, ebay_remaining: 4000, ebay_reset: future }));
  chk('local says empty, eBay says plenty — allowed', r.allowed);
  chk('  counted by eBay', r.source === 'ebay-headers');
  r = await q.check(fakeDb({ ...base, calls_made: 10,
                             ebay_limit: L, ebay_remaining: 20, ebay_reset: future }));
  chk('local says plenty, eBay says 20 — blocked', !r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: 100,
                             ebay_limit: L, ebay_remaining: 5, ebay_reset: past }));
  chk('expired eBay figure ignored', r.source === 'local-count');

  console.log('\nFAILURE MODES NEVER OPEN THE GATE\n');
  r = await q.check({ query: async () => { throw new Error('connection lost'); } });
  chk('database unreachable — refuses', !r.allowed);
  chk('  and says why: ' + String(r.reason).slice(0, 40), /unreadable/.test(r.reason || ''));

  console.log('\nEVERY REFUSAL EXPLAINS ITSELF\n');
  for (const [label, used, bg] of [
    ['reserve reached', L - q.RESERVE, false],
    ['soft stop',       L - Math.floor(softLeaves) + 10, true]
  ]) {
    const g = await q.check(fakeDb({ ...base, calls_made: used }), { background: bg });
    chk(`${label} — reason given, not an empty result`,
        !g.allowed && typeof g.reason === 'string' && g.reason.length > 20);
  }

  console.log('\nWINDOW\n');
  chk('UTC date key', q.windowKey(new Date('2026-09-06T23:59:00Z')) === '2026-09-06');
  chk('rolls at UTC midnight', q.windowKey(new Date('2026-09-07T00:01:00Z')) === '2026-09-07');
  chk('reset is within 24h', q.msUntilReset(new Date()) <= 24 * 3600e3);
  chk('reset is positive', q.msUntilReset(new Date()) > 0);

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
