#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// ebayratecheck.js — ask eBay what our real rate limit is
//
//   EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... node ebayratecheck.js
//
// TASK.md T1: "confirm their reported limit matches the assumed 5,000. If
// the real figure differs, DAILY_LIMIT is wrong and everything above is
// calibrated to the wrong number."
//
// This exists as a standalone script so the check does NOT depend on a
// deploy. /api/ebay/quota?probe=1 does the same thing on the server, but
// the credentials live on Render and a deploy can be slow or stuck —
// blocking a calibration check on a deploy pipeline is the wrong
// dependency. Run it here with the keys inline and get the answer now.
//
// Costs two eBay calls: one token exchange, one rate_limit lookup. Both
// are recorded against the quota ledger like any other call, because they
// are.
// ══════════════════════════════════════════════════════════════

'use strict';

const quota = require('./ebayquota');
const ebay = require('./ebaycall');

const { Pool } = require('pg');
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function main() {
  const id = process.env.EBAY_CLIENT_ID || '';
  const secret = process.env.EBAY_CLIENT_SECRET || '';

  console.log('\n' + '='.repeat(72));
  console.log('  EBAY RATE LIMIT CHECK');
  console.log('='.repeat(72) + '\n');

  if (!id || !secret) {
    // A tool that cannot check something must say so.
    console.log('  CANNOT CHECK — EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not in this');
    console.log('  environment. They are set on Render, not locally.\n');
    console.log('  Either run with them inline:');
    console.log('    EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... node ebayratecheck.js\n');
    console.log('  or, once deployed, hit:');
    console.log('    https://cardhunt-backend.onrender.com/api/ebay/quota?probe=1\n');
    console.log('  This is a MISSING PATH, not a finding. DAILY_LIMIT remains unverified.\n');
    return;
  }
  if (!db) { console.log('  DATABASE_URL required (the quota ledger lives in Supabase).\n'); return; }

  console.log(`  assumed DAILY_LIMIT in ebayquota.js : ${quota.DAILY_LIMIT}`);
  console.log(`  kill switch                          : ${ebay.ebayEnabled() ? 'ON (calls allowed)' : 'OFF — EBAY_ENABLED=false'}\n`);
  if (!ebay.ebayEnabled()) { console.log('  Nothing to do while the kill switch is off.\n'); return; }

  // Token, through the same guarded path everything else uses.
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const tok = await ebay.fetchEbay(db, {
    url: 'https://api.ebay.com/identity/v1/oauth2/token',
    method: 'POST', basic: auth,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' +
          encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
    kind: 'token', meta: { cardId: 'ratecheck' }
  });

  if (tok.blocked) { console.log(`\n  BLOCKED (${tok.blocked}): ${tok.reason}\n`); return; }
  if (!tok.ok || !tok.data || !tok.data.access_token) {
    console.log(`\n  Token failed: ${tok.reason || 'no access_token'}\n`);
    return;
  }
  console.log('  token acquired\n');

  const rl = await quota.fetchRateLimits(db, tok.data.access_token);
  if (!rl.ok) { console.log(`  rate_limit lookup failed: ${rl.reason}\n`); return; }
  if (!Number.isFinite(rl.limit)) {
    console.log('  eBay returned no rate figure for Browse:');
    console.log('  ' + JSON.stringify(rl).slice(0, 400));
    console.log('\n  CANNOT CONFIRM the limit — treat DAILY_LIMIT as unverified.\n');
    return;
  }

  console.log('  eBay reports:');
  console.log(`    limit      ${rl.limit}`);
  console.log(`    remaining  ${rl.remaining}`);
  console.log(`    window     ${rl.timeWindow || '?'}`);
  console.log(`    resets     ${rl.reset || '?'}\n`);

  if (rl.limit === quota.DAILY_LIMIT) {
    console.log(`  MATCHES the assumed ${quota.DAILY_LIMIT}. Every threshold is calibrated`);
    console.log('  to the right number.\n');
  } else {
    console.log('  ' + '!'.repeat(66));
    console.log(`  MISMATCH — eBay says ${rl.limit}, ebayquota.js assumes ${quota.DAILY_LIMIT}.`);
    console.log('  Every threshold is calibrated to the wrong number:');
    const softLeaves = rl.limit * (1 - quota.SOFT_STOP);
    console.log(`    soft stop would leave ${Math.round(softLeaves)} calls`);
    console.log(`    reserve is ${quota.RESERVE}`);
    if (softLeaves <= quota.RESERVE) {
      console.log('    and the soft stop would fire AT OR BELOW the reserve, so the hard');
      console.log('    stop always wins and background jobs never yield early — the exact');
      console.log('    bug TASK.md says must not be reintroduced.');
    }
    console.log(`  Set DAILY_LIMIT = ${rl.limit} in ebayquota.js, then re-run`);
    console.log('  node ebayquota.test.js — it asserts the thresholds stay coherent.');
    console.log('  ' + '!'.repeat(66) + '\n');
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { if (db) await db.end().catch(() => {}); });
