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

// The hour row is separate from the day row (T1); `hour` defaults to empty.
function fakeDb(row, hour) {
  return { query: async (sql) => {
    if (/CREATE TABLE|ALTER TABLE/i.test(sql)) return { rows: [] };
    if (/INSERT INTO ebay_quota_hour/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [hour || { calls: 0 }] };
    if (/INSERT INTO ebay_quota\b/i.test(sql) && /RETURNING/i.test(sql)) return { rows: [row] };
    return { rows: [] };
  }};
}
// Records what record() writes, to prove the origin reaches the right column.
function recordingDb() {
  const sqls = [];
  return { sqls, query: async (sql, params) => { sqls.push({ sql, params }); return { rows: [] }; } };
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

  // ══ T1 — THE HOURLY CEILING, TRIPPED ══════════════════════════
  // A ceiling that has never fired is indistinguishable from one that cannot.
  console.log('\nHOURLY CEILING (T1)\n');
  const H = q.HOURLY_LIMIT;
  chk(`hourly ceiling ${H} bounds a runaway to at most a sixth of the day`, H * 6 <= L);
  chk('  and is above the heaviest measured browsing hour (195)', H > 195 * 2);
  chk('  and below the runaway hours it exists for (723, 713)', H < 713);
  r = await q.check(fakeDb({ ...base, calls_made: 100 }, { calls: H - 1 }));
  chk('one under the hourly ceiling — allowed', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: 100 }, { calls: H }));
  chk('hourly ceiling reached, daily nearly untouched — REFUSED', !r.allowed);
  chk('  refusal names the hourly limit', r.limitHit === 'hourly', r.limitHit);
  chk('  reason is a sentence, not a code', /hourly ceiling is 600/.test(r.reason || ''), r.reason);
  chk('  says when it lifts — within the hour', r.liftsInMin >= 1 && r.liftsInMin <= 60, r.liftsInMin);
  chk('  liftsAt is the next UTC hour', /T\d\d:00:00\.000Z$/.test(r.liftsAt || ''), r.liftsAt);
  r = await q.check(fakeDb({ ...base, calls_made: 100 }, { calls: H - 2 }), { pending: 2 });
  chk('calls in flight count toward the hour', !r.allowed && r.limitHit === 'hourly');
  for (const origin of ['user', 'background', 'tooling']) {
    r = await q.check(fakeDb({ ...base }, { calls: H }), { origin });
    chk(`  applies to ${origin} too — a runaway looks like a user`, !r.allowed && r.limitHit === 'hourly');
  }
  const t = new Date('2026-09-30T12:59:30Z');
  chk('hour key is the UTC clock hour', q.hourKey(t) === '2026-09-30T12:00:00.000Z');
  chk('  and rolls at HH:00', q.hourKey(new Date('2026-09-30T13:00:01Z')) === '2026-09-30T13:00:00.000Z');
  chk('  30s before the hour, it lifts in 30s', q.msUntilHourReset(t) === 30e3);

  // ══ T2 — TOOLING ALLOWANCE, TRIPPED ═══════════════════════════
  console.log('\nTOOLING ALLOWANCE (T2)\n');
  const T = q.toolingAllowance();
  chk(`tooling allowance ${T} is inside the daily limit, far below the soft stop`,
      T < L * q.SOFT_STOP - q.RESERVE);
  r = await q.check(fakeDb({ ...base, calls_made: 500, tooling_calls: T - 1 }), { origin: 'tooling' });
  chk('tooling one under its allowance — allowed', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: 500, tooling_calls: T }), { origin: 'tooling' });
  chk('tooling at its allowance — REFUSED', !r.allowed);
  chk('  names the tooling allowance', r.limitHit === 'tooling', r.limitHit);
  chk('  says it does not borrow', /rather than borrow from the user budget/.test(r.reason || ''), r.reason);
  r = await q.check(fakeDb({ ...base, calls_made: 500, tooling_calls: T }), { origin: 'user' });
  chk('the SAME state still serves a user — tooling is spent, the user budget is not', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: 500, tooling_calls: T }), { background: true });
  chk('  and background work', r.allowed);
  r = await q.check(fakeDb({ ...base, calls_made: 500, tooling_calls: T - 1 }),
                    { origin: 'tooling', pendingTooling: 1 });
  chk('tooling calls in flight count toward the allowance', !r.allowed && r.limitHit === 'tooling');
  r = await q.check(fakeDb({ ...base, calls_made: L - 300 }), { origin: 'tooling' });
  chk('tooling yields at the soft stop like background', !r.allowed && r.limitHit === 'soft-stop');
  chk('origin defaults: background flag -> background', q.normOrigin(undefined, true) === 'background');
  chk('origin defaults: nothing -> user', q.normOrigin(undefined, false) === 'user');
  chk('an unknown origin never becomes a column name', q.normOrigin("x; DROP TABLE", false) === 'user');

  console.log('\nRECORD WRITES THE ORIGIN\n');
  for (const origin of ['user', 'background', 'tooling']) {
    const d = recordingDb();
    await q.record(d, { kind: 'search', origin });
    const ins = d.sqls.filter(x => /INSERT INTO ebay_quota/.test(x.sql));
    chk(`${origin}: day row and hour row both written`, ins.length === 2, ins.length);
    chk(`  into ${origin}_calls`, ins.every(x => x.sql.includes(origin + '_calls')));
  }

  console.log('\nWHAT THE APP SHOWS (T3)\n');
  const lv = (used, hour, extra) => q.status(fakeDb({ ...base, calls_made: used, ...(extra || {}) }, { calls: hour || 0 }));
  let s = await lv(Math.floor(L * 0.49));
  chk('49% — quiet', s.level === 'quiet' && !s.visible, s.level);
  s = await lv(Math.floor(L * 0.50));
  chk('50% — visible', s.level === 'notice' && s.visible, s.level);
  s = await lv(100, Math.ceil(H * 0.5));
  chk('50% of the HOUR — visible even when the day is quiet', s.visible, s.level);
  s = await lv(Math.floor(L * 0.75));
  chk('75% — warn', s.level === 'warn', s.level);
  s = await lv(L - q.RESERVE);
  chk('reserve reached — stopped, with a reason and when it lifts',
      s.level === 'stopped' && s.reason && s.liftsAt && s.limitHit === 'daily', JSON.stringify([s.level, s.limitHit]));
  s = await lv(100, H);
  chk('hourly ceiling — stopped, lifting within the hour',
      s.level === 'stopped' && s.limitHit === 'hourly' && s.liftsInMinutes <= 60);
  s = await lv(1200, 0, { user_calls: 700, background_calls: 200, tooling_calls: 300 });
  chk('broken down by origin', s.byOrigin.user === 700 && s.byOrigin.background === 200 && s.byOrigin.tooling === 300);
  chk('  tooling spent shows as spent, while the user is still served', s.tooling.remaining === q.toolingAllowance() - 300 && s.allowed);
chk('a one-day raise lapses by itself: 300 the day after', q.toolingAllowance(new Date('2026-10-05T00:00:01Z')) === 300 && q.toolingAllowance(new Date('2026-10-04T23:59:59Z')) === 700);
  chk('  calls from before origins were counted show as unattributed, not as user', s.unattributed === 0);
  s = await lv(4900, 0, { user_calls: 10 });
  chk('  4,900 used, 10 tagged -> 4,890 unattributed', s.unattributed === 4890, s.unattributed);

  console.log('\nWINDOW\n');
  chk('UTC date key', q.windowKey(new Date('2026-09-06T23:59:00Z')) === '2026-09-06');
  chk('rolls at UTC midnight', q.windowKey(new Date('2026-09-07T00:01:00Z')) === '2026-09-07');
  chk('reset is within 24h', q.msUntilReset(new Date()) <= 24 * 3600e3);
  chk('reset is positive', q.msUntilReset(new Date()) > 0);

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
