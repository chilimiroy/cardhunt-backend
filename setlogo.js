// setlogo.js — attach a set logo WE made to a set's rows (Roy, 2026-10-08,
// TASK-reports-and-pages T4). Local tooling: writes cards.set_logo and
// cards.set_logo_source (migration-logo-source.sql), the ccfill.js pattern.
//
//   node setlogo.js            dry run: what would change, per set
//   node setlogo.js --write    write it
//
// The URL is the server's /set-logos/<set id>.png (SET_LOGOS in server.js,
// one file per set by name). Only English rows of the named set are touched;
// a set that already HAS a logo is reported and left alone unless the set
// is listed with replace: true — nothing here overwrites silently.
// 0 eBay calls.
'use strict';
const HOST = 'https://cardhunt-backend.onrender.com';
const PLAN = [
  { set: 'ex5.5', name: 'Poké Card Creator Pack', file: 'set-pokecard.png' },
  { set: 'mfb',   name: 'My First Battle',        file: 'set-myfirst.png' },
];
async function main() {
  const WRITE = process.argv.includes('--write');
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    for (const p of PLAN) {
      const url = HOST + '/set-logos/' + p.set + '.png';
      const r = (await db.query(`SELECT set_name, count(*)::int AS n, count(set_logo)::int AS with_logo, max(set_logo) AS logo
        FROM cards WHERE set_api_id = $1 AND api_card_id LIKE 'en-%' GROUP BY set_name`, [p.set])).rows;
      if (r.length !== 1) { console.log(`${p.set}: expected one set row-group, found ${r.length} — NOT TOUCHED`); continue; }
      const s = r[0];
      if (s.set_name !== p.name) { console.log(`${p.set}: the database calls it "${s.set_name}", not "${p.name}" — NOT TOUCHED`); continue; }
      if (s.with_logo && !p.replace) { console.log(`${p.set} "${s.set_name}": already has a logo (${s.logo}) — NOT TOUCHED`); continue; }
      console.log(`${p.set} "${s.set_name}": ${s.n} cards, logo -> ${url}  (source cardzon:${p.file})`);
      if (WRITE) {
        const u = await db.query(`UPDATE cards SET set_logo = $2, set_logo_source = $3, updated_at = NOW()
          WHERE set_api_id = $1 AND api_card_id LIKE 'en-%'`, [p.set, url, 'cardzon:' + p.file]);
        console.log(`   wrote ${u.rowCount} rows`);
      }
    }
    if (!WRITE) console.log('(dry run — --write to apply)');
  } finally { await db.end(); }
}
main().catch(e => { console.error('setlogo failed: ' + e.message); process.exit(1); });
