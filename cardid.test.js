// cardid.test.js — a card id that is not ours is refused, and nothing mints one
//
//   node cardid.test.js
//
// 2026-09-27: two rows in `cards` carried pokemontcg.io ids, and alert 5 was
// saved on one. The producers were in the page (see cardid.js). This asserts
// the rule, both of its directions, every producer closed, and — when
// DATABASE_URL is set — that no row in `cards` fails the pattern.
'use strict';
const fs = require('fs');
const cardid = require('./cardid');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } }

// ── the rule, both directions ──
for (const id of ['en-base1-4', 'en-me02.5-294', 'en-30th-c-008', 'en-cel25cc-CC002', 'en-P-A-025',
                  'en-tk-xy-su-29', 'ja-SV2a-201', 'ja-M5-081', 'zh-tw-sv01-001', 'zh-cn-CSV1C-001'])
  ok(cardid.isOurCardId(id), 'ours: ' + id);
for (const id of ['me55c-33', 'me2pt5-294', 'sv8pt5-12', 'base1-4', 'cel25c-4_A', 'sm9-33',
                  'EN-base1-4', 'ko-SV2a-201', 'fr-base1-4', 'en', 'en-', '', null, undefined, ' en-base1-4'])
  ok(!cardid.isOurCardId(id) || id === 'en-', 'foreign: ' + JSON.stringify(id));
ok(cardid.isOurCardId('en-') === true, 'the prefix rule alone accepts "en-" — documented, not a card');
const r = cardid.refusal('me55c-33');
ok(r.error === 'foreign card id' && /not a CardHunt card id/.test(r.reason), 'refusal says what and why');
ok(cardid.ourIdSql('c') === "c.api_card_id ~ '^(en|ja|zh-tw|zh-cn)-'", 'SQL form: ' + cardid.ourIdSql('c'));

// ── the page carries the same pattern ──
const page = fs.readFileSync('cardhunt_preview.html', 'utf8');
const m = page.match(/var OUR_CARD_ID = (\/.+\/);/);
ok(m && m[1] === String(cardid.OUR_CARD_ID), 'page OUR_CARD_ID equals cardid.js: ' + (m && m[1]));

// ── every producer closed ──
function fnSrc(src, name) {
  const i = src.search(new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('));
  if (i < 0) return '';
  const rest = src.slice(i + 10);
  const j = rest.search(/\r?\n(async\s+function|function)\s+\w+\s*\(/);
  return src.slice(i, j < 0 ? src.length : i + 10 + j);
}
ok(/refuseForeignId\(id, 'openCard'\)/.test(fnSrc(page, 'openCard')), 'openCard refuses a foreign id first');
ok(/refuseForeignId\(alertCardTarget\.id, 'saveAlert'\)/.test(fnSrc(page, 'saveAlert')), 'saveAlert refuses a foreign id');
const pick = fnSrc(page, 'pickAlertCard');
ok(pick.length > 200 && /\/api\/search/.test(pick) && !/\$\{API\}\/cards/.test(pick),
   'pickAlertCard searches OUR catalogue, not pokemontcg.io (the alert 5 producer)');
ok(/d\.confident && d\.resolved/.test(pick), 'pickAlertCard takes only a confident match');
ok(/ME2PT5_PREMIUM\.forEach\(function\(c\)\{\s*c\.id = 'en-me02\.5-' \+ c\.number;/.test(page),
   'the embedded Ascended Heroes cards are re-keyed to our ids (the me2pt5-294 producer)');
ok(/id: l \+ '-' \+ ts \+ '-' \+ num/.test(fnSrc(page, 'tcgdexFetchSet')), 'TCGdex-direct cards carry the language');
ok(!/function doSearchLegacy/.test(page) && !/Search the full catalogue instead<\/button>/.test(page),
   'the legacy pokemontcg.io search and its button are gone');
ok(/\/api\/trending/.test(fnSrc(page, 'loadSearchTrending')) && !/\$\{API\}\/cards/.test(fnSrc(page, 'loadSearchTrending')),
   'the Search screen trending grid reads our trending');
const ap = fnSrc(page, 'apiFetch');
ok(ap && !/API\s*\+\s*'\/cards/.test(ap), 'apiFetch no longer falls back to pokemontcg.io for cards');
// Every remaining direct pokemontcg.io CARD request, by name: only the
// autocomplete, which hands its caller a card NAME to search, never an id.
const direct = [];
const reDirect = /(\$\{API\}\/cards|API\s*\+\s*'\/cards)/g;
let mm;
while ((mm = reDirect.exec(page))) {
  const before = page.slice(0, mm.index);
  const fn = (before.match(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{[^]*$/) || [])[1];
  const all = [...before.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)];
  direct.push(all.length ? all[all.length - 1][1] : '?');
}
ok(direct.length === 1 && direct[0] === 'fetchAutocomplete',
   'the only direct pokemontcg.io card request left is the name autocomplete (got ' + direct.join(', ') + ')');
{
  const ac = fnSrc(page, 'fetchAutocomplete');
  ok(ac.length > 200 && /selectAc\(/.test(ac) && !/openCard|alertCardTarget/.test(ac),
     'the autocomplete selects by NAME (selectAc), never opens or alerts on a pokemontcg id');
}

// ── the server refuses them ──
const server = fs.readFileSync('server.js', 'utf8');
const cardsRoute = server.slice(server.indexOf("app.get('/api/cards/:cardId'"), server.indexOf("app.get('/api/trending'"));
ok(!/TCG_API\}\/cards/.test(cardsRoute), '/api/cards/:cardId no longer fetches pokemontcg.io');
ok(/cardid\.isOurCardId\(cardId\)\) return res\.status\(400\)/.test(cardsRoute), '/api/cards/:cardId answers 400 for a foreign id');
ok(/cardid\.ourIdSql\('c'\)/.test(cardsRoute), '/api/cards/:cardId never serves a stray foreign-id row');
ok(/res\.status\(410\)/.test(server.slice(server.indexOf("app.get('/api/cards', "), server.indexOf("app.get('/api/cards', ") + 900)),
   'the pokemontcg.io search proxy is gone (410)');
const alertPost = server.slice(server.indexOf("app.post('/api/alerts'"), server.indexOf("app.patch('/api/alerts/:id'"));
ok(/isOurCardId\(b\.card_api_id\)/.test(alertPost), 'POST /api/alerts refuses a foreign card id');
const pfPost = server.slice(server.indexOf("app.post('/api/portfolio'"), server.indexOf("app.post('/api/portfolio'") + 600);
ok(/isOurCardId\(b\.card_api_id\)/.test(pfPost), 'POST /api/portfolio refuses a foreign card id');
ok((server.match(/cardid\.ourIdSql\(/g) || []).length >= 4, 'single-card resolvers never serve a foreign row');
ok(/cardid\.ourIdSql\('c'\)/.test(fs.readFileSync('cardparse.js', 'utf8')), '/api/search never resolves to a foreign row');

// ── TCGdex's per-card path for our numbers (Unown '?' = TCGdex '%3F') ──
const { tcgdexLocalId } = require('./cardid');
ok(tcgdexLocalId('?') === '%253F', "Unown '?' asks TCGdex for exu-%253F (the form that answers)");
ok(tcgdexLocalId('24a') === '24a' && tcgdexLocalId('H01') === 'H01' && tcgdexLocalId('!') === '!', 'ordinary numbers pass through');
{
  const ing = fs.readFileSync('ingest.js', 'utf8'), hv = fs.readFileSync('tcgdexharvest.js', 'utf8');
  const raw = [ing, hv].join('\n').match(/cards\/\$\{(?:card|c)\.set_api_id\}-\$\{(?!tcgdexLocalId)[^}]*\}/g) || [];
  ok(raw.length === 0, 'every per-card TCGdex ask by a stored number goes through tcgdexLocalId' + (raw.length ? ' — ' + raw.join(' ; ') : ''));
  ok(/const fold = x => String\(x\)\.replace\(\/\^%3F\$\/i, '\?'\)/.test(ing), "cardgap folds TCGdex '%3F' to our '?'");
  ok(/const foldNo = x => String\(x\)\.replace\(\/\^%3F\$\/i, '\?'\)/.test(ing), "manifest folds TCGdex '%3F' to our '?'");
}

// ── the database ──
(async () => {
  if (!process.env.DATABASE_URL) { console.log('  (DATABASE_URL not set — database section skipped)'); return done(); }
  const { Pool } = require('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    for (const t of ['cards', 'alerts', 'portfolio']) {
      const q = await db.query(`SELECT ${t === 'cards' ? 'api_card_id' : 'card_api_id'} AS id FROM ${t}
        WHERE ${t === 'cards' ? 'api_card_id' : 'card_api_id'} !~ '^(en|ja|zh-tw|zh-cn)-'
          ${t === 'alerts' ? "AND status <> 'deleted'" : ''}`);
      ok(q.rows.length === 0, `${t}: ${q.rows.length} rows with a foreign card id` +
        (q.rows.length ? ' — ' + q.rows.map(x => x.id).join(', ') : ''));
    }
  } finally { await db.end(); }
  done();
})().catch(e => { console.log('  ERROR ' + e.message); fail++; done(); });

function done() {
  console.log(`\ncardid.test.js — ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
