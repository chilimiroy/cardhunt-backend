// ══════════════════════════════════════════════════════════════
// sitecheck.js — what did each eBay site ADD, and did anything wrong get in?
//
// T1 (2026-09-30): "after adding each marketplace, verify in both
// directions — how many correct listings it added, and that zero
// non-English cards got in. 50 added with 3 German-language cards is a
// failure, not a 94% success."
//
// Reads the REAL /api/listings view to completion (pressing "Search all
// marketplaces" then "Load more" until nothing is owed — T2), then:
//
//   ADDED   rows per marketplace. A row seen on two sites keeps its US copy,
//           so a row labelled EBAY_GB is one the US search did not keep.
//   WRONG   every row scanned by an INDEPENDENT language reader — not
//           cardmatch.languageOf, which is the gate under test. It knows the
//           words a German, French, Italian or Spanish seller uses for a
//           language, and CJK / hangul script. Every hit is printed for a
//           person to read: a hit is a suspect, not a verdict ("English"
//           in German is "Englisch" and is not a hit).
//
// Read-only over the public API; spends quota only through /api/listings,
// exactly as a visitor would (and a warm cache spends nothing).
//
//   node sitecheck.js                         the default 10 cards, Raw NM
//   node sitecheck.js en-base1-4 --grade="PSA 10"
//   node sitecheck.js --grade=all             Raw NM and PSA 10
//   node sitecheck.js --json=out.json
// ══════════════════════════════════════════════════════════════
'use strict';
const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';
const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const DEFAULT_CARDS = ['en-base1-4', 'en-ecard2-149', 'en-swsh11-186', 'en-swsh7-215', 'en-sm9-33',
                       'en-swsh3.5-74', 'en-neo1-9', 'en-sv10-1', 'en-base1-2', 'en-sv03.5-199'];
const cards = args.filter(a => !a.startsWith('--'));
const gradeArg = flag('grade', 'Raw NM');
const grades = gradeArg === 'all' ? ['Raw NM', 'PSA 10'] : [gradeArg];
const jsonOut = flag('json', null);
const WAIT_MS = parseInt(flag('wait', '600000'), 10);

// ── The independent reader ─────────────────────────────────────
// Words that say a CARD is in a language other than English, in the
// languages eBay's sites are written in. Deliberately wider than the gate:
// a suspect costs a person a glance, a miss costs a buyer a wrong card.
const NOT_ENGLISH = [
  ['ja', /\b(japanese|japan|jpn|jp|japanisch|japonais|giapponese|japon[eé]s|japonesa)\b|日本語|[぀-ゟ゠-ヿ]/i],
  ['ko', /\b(korean|korea|kor|koreanisch|cor[eé]en|coreano|coreana)\b|[가-힯]/i],
  ['zh', /\b(chinese|china|chinesisch|chinois|cinese|chino|china)\b|中文|简体|繁體|繁体/i],
  ['de', /\b(german|deutsch|deutsche|deutsches|ger|allemand|tedesco|tedesca|alem[aá]n|alemana)\b|🇩🇪/i],
  ['fr', /\b(french|fran[cç]ais|fran[cç]aise|vf|franz[öo]sisch|francese|franc[eé]s|francesa)\b|🇫🇷/i],
  ['it', /\b(italian|italiano|italiana|ita|italienisch|italien|italienne)\b|🇮🇹/i],
  ['es', /\b(spanish|espa[nñ]ol|espa[nñ]ola|esp|spanisch|espagnol|spagnolo|spagnola)\b|🇪🇸/i],
  ['pt', /\b(portuguese|portugu[eê]s|portugiesisch|portugais|portoghese)\b|🇧🇷|🇵🇹/i],
  ['th', /\b(thai)\b|[฀-๿]/i],
  ['id', /\b(indonesian|indonesia)\b/i]
];
// Any language but the card's own: on a Japanese card "Japanese" is the
// right answer and Korean is the trap.
function suspectLanguage(title, cardLang) {
  const t = String(title || '');
  for (const [code, re] of NOT_ENGLISH) {
    if (code === cardLang) continue;
    const m = t.match(re); if (m) return { code, word: m[0] };
  }
  // Uppercase language codes, case-sensitive: eBay DE sellers mark a German
  // card "… Holo DE 33/181". This reader missed it on its first live run.
  // Deliberately looser than the gate — any uppercase DE/FR/ITA/ESP is a
  // suspect for a person to read, preposition or not.
  for (const [code, re] of [['de', /(?<![A-Za-z])DE(?![A-Za-z])/], ['fr', /(?<![A-Za-z])FR(?![A-Za-z])/]]) {
    if (code === cardLang) continue;
    const m = t.match(re); if (m) return { code, word: m[0] };
  }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// T2 (2026-09-30): these requests are TOOLING — sent X-CardHunt-Origin, so the
// server counts them against the 300/day tooling allowance, never the user
// budget. When the allowance (or any quota limit) refuses, the tool stops and
// says why rather than recording a column of empty cards.
function quotaStop(d) {
  const e = d && d.sources && d.sources.ebay;
  if (e && e.status === 'quota') {
    console.error('  STOP — eBay quota refused (' + (e.limitHit || 'quota') + '): ' + e.reason);
    process.exit(3);
  }
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: { Accept: 'application/json', 'X-CardHunt-Origin': 'tooling' } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 160)}`);
  const d = JSON.parse(txt); quotaStop(d);
  return d;
}

// The page's own path, pressing every button (T2, 2026-09-30: nothing loads
// by itself any more): open, "Search all marketplaces", then "Load more"
// until nothing is owed. `--pages=N` caps the Load-more presses — each is
// one call per site with more, so a busy card to exhaustion is expensive.
const MAX_MORE = parseInt(flag('pages', '50'), 10);
async function fullView(cardId, grade) {
  const q = `/api/listings/${encodeURIComponent(cardId)}?grade=${encodeURIComponent(grade)}`;
  const t0 = Date.now();
  let d = await get(q + '&sites=all'), presses = 0;
  while (d.progress && d.progress.actions && d.progress.actions.loadMore && presses < MAX_MORE && Date.now() - t0 < WAIT_MS) {
    d = await get(q + '&more=1');
    presses++;
  }
  d._waitedMs = Date.now() - t0; d._polls = presses;
  return d;
}

(async () => {
  const list = cards.length ? cards : DEFAULT_CARDS;
  const out = [];
  const tot = { rows: 0, bySite: {}, suspects: 0, suspectsBySite: {}, calls: 0, incomplete: 0 };
  console.log(`\n  SITECHECK — ${BASE}\n  ${list.length} cards × ${grades.join(', ')}\n`);
  for (const id of list) {
    for (const grade of grades) {
      let d;
      try { d = await fullView(id, grade); }
      catch (e) { console.log(`  ${id} ${grade}: ${e.message}`); continue; }
      const rows = d.listings || [];
      const bySite = {};
      const suspects = [];
      for (const l of rows) {
        const mp = l.marketplace || l.source;
        bySite[mp] = (bySite[mp] || 0) + 1;
        const s = suspectLanguage(l.title, id.split('-')[0]);
        if (s) suspects.push({ mp, code: s.code, word: s.word, price: l.price, title: l.title, url: l.url });
      }
      const pg = d.progress || {};
      const eb = (d.sources && d.sources.ebay) || {};
      const sites = eb.sites || {};
      tot.rows += rows.length; tot.calls += pg.calls || 0;
      if (!pg.complete) tot.incomplete++;
      for (const [m, n] of Object.entries(bySite)) tot.bySite[m] = (tot.bySite[m] || 0) + n;
      for (const s of suspects) { tot.suspects++; tot.suspectsBySite[s.mp] = (tot.suspectsBySite[s.mp] || 0) + 1; }
      console.log(`  ${id.padEnd(18)} ${grade.padEnd(7)} ${String(rows.length).padStart(4)} rows  ` +
        Object.entries(bySite).map(([m, n]) => m.replace('EBAY_', '') + ' ' + n).join(' · ') +
        `   calls ${pg.calls}  ${pg.complete ? 'complete' : 'INCOMPLETE: ' + (pg.note || '')}` +
        `  (${Math.round(d._waitedMs / 1000)}s${d.cached ? ', cached' : ''})`);
      for (const [m, s] of Object.entries(sites)) {
        if (s.status !== 'ok') { console.log(`      ${m}: ${s.status} ${s.reason || ''}`); continue; }
        console.log(`      ${m.padEnd(8)} kept ${String(s.kept).padStart(4)} of ${String(s.scanned).padStart(4)} scanned` +
          ` (eBay total ${s.ebayTotal}), ${s.pagesFetched} pages, ${s.duplicates} already kept on an earlier site` +
          (s.overturned ? `, ${s.overturned} refused elsewhere` : '') + (s.incompleteReason ? `  ! ${s.incompleteReason}` : ''));
      }
      for (const s of suspects) console.log(`      ? ${s.mp} [${s.code}: "${s.word}"] $${s.price}  ${s.title}`);
      out.push({ cardId: id, grade, rows: rows.length, bySite, sites, calls: pg.calls, complete: pg.complete,
                 note: pg.note, suspects });
    }
  }
  console.log('\n  ── TOTAL ──');
  console.log(`  rows ${tot.rows}: ` + Object.entries(tot.bySite).map(([m, n]) => `${m} ${n}`).join(' · '));
  const us = tot.bySite.EBAY_US || 0;
  for (const [m, n] of Object.entries(tot.bySite)) if (m !== 'EBAY_US' && us)
    console.log(`    ${m} added ${n} (+${Math.round(100 * n / us)}% over US)`);
  console.log(`  language suspects: ${tot.suspects}` +
    (tot.suspects ? ' — ' + Object.entries(tot.suspectsBySite).map(([m, n]) => `${m} ${n}`).join(' · ') + '  (read each one above)' : ''));
  console.log(`  eBay calls: ${tot.calls} over ${out.length} views = ${out.length ? (tot.calls / out.length).toFixed(1) : '-'} per uncached view` +
    `   · incomplete views: ${tot.incomplete}\n`);
  if (jsonOut) require('fs').writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), base: BASE, grades, out, tot }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
