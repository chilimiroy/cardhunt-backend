#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * CardHunt Database Ingestion
 *
 * Builds your complete card database across all languages.
 * Resumable, rate-limited, writes straight to Supabase.
 *
 * RUN:
 *   npm install pg
 *   export DATABASE_URL="postgresql://postgres:PASS@db.xxx.supabase.co:5432/postgres"
 *   node ingest.js en          # English sets
 *   node ingest.js ja          # Japanese sets
 *   node ingest.js zh-tw       # Chinese Traditional
 *   node ingest.js all         # everything, sequentially
 *   node ingest.js status      # what's done so far
 *   node ingest.js prices      # refresh prices only (run daily)
 *
 * Safe to Ctrl-C at any point — progress is checkpointed to
 * ingest-progress.json and the next run resumes from there.
 * ══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { tcgdexLocalId } = require('./cardid');
const refreshrun = require('./refreshrun');
let Pool = null;
try { Pool = require('pg').Pool; } catch (e) { /* dry run without pg */ }

// ── CONFIG ────────────────────────────────────────────────────
const TCGDEX   = 'https://api.tcgdex.net/v2';
const TCG_API  = 'https://api.pokemontcg.io/v2';
// The pokemontcg.io key comes from the environment only (POKEMONTCG_KEY, a
// user environment variable on this machine). It was hard-coded here until
// 2026-10-08 and has been rotated. Unset, requests go without a key at
// pokemontcg.io's lower keyless limit. nosecrets.test.js fails on a literal.
const TCG_KEY  = process.env.POKEMONTCG_KEY || null;
const TCG_H    = TCG_KEY ? { 'X-Api-Key': TCG_KEY } : {};

// Rate limits — deliberately conservative. Nothing gets blocked at these speeds.
const DELAY_TCGDEX = 350;    // ~2.8 req/s   (TCGdex is generous, this is polite)
const DELAY_PTCG   = 1200;   // ~0.8 req/s   (pokemontcg.io soft-limits ~20k/day)
const DELAY_SET    = 2000;   // pause between sets

const VERSION = '5.13.2';   // bump when this file changes
const PROGRESS_FILE = path.join(__dirname, 'ingest-progress.json');

// Each language gets its own progress file so two runs in two terminals
// cannot overwrite each other's checkpoints.
function progressFileFor(lang) {
  return lang ? path.join(__dirname, `ingest-progress-${lang}.json`) : PROGRESS_FILE;
}

const db = (Pool && process.env.DATABASE_URL)
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;
if (process.env.DATABASE_URL && !Pool) {
  console.log('\n  WARNING: DATABASE_URL is set but the "pg" module is missing.');
  console.log('  Run: npm install pg\n');
}

// ── HELPERS ───────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadProgress(lang) {
  const file = progressFileFor(lang);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch {
    // Migrate from the old single-file format on first run
    if (lang) {
      try {
        const old = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        if (old.done && old.done[lang]) {
          return { done: { [lang]: old.done[lang] }, cards: 0, started: new Date().toISOString() };
        }
      } catch {}
    }
    return { done: {}, cards: 0, started: new Date().toISOString() };
  }
}
function saveProgress(p, lang) {
  fs.writeFileSync(progressFileFor(lang), JSON.stringify(p, null, 2));
}

// status() needs to see every language at once
function loadAllProgress() {
  const merged = { done: {}, cards: 0 };
  let files = [];
  try { files = fs.readdirSync(__dirname).filter(f => /^ingest-progress.*\.json$/.test(f)); }
  catch { files = []; }
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
      for (const [lang, sets] of Object.entries(p.done || {})) {
        merged.done[lang] = Object.assign({}, merged.done[lang] || {}, sets);
      }
    } catch {}
  }
  return merged;
}

async function get(url, headers, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: headers || {} });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (r.status === 429) {              // rate limited — back off hard
        const wait = 30000 * (i + 1);
        console.log(`   rate limited, waiting ${wait/1000}s...`);
        await sleep(wait);
        continue;
      }
      if (i === retries - 1) return null;
    } catch (e) {
      if (i === retries - 1) { console.log(`   ${e.message}`); return null; }
    }
    await sleep(2000 * (i + 1));
  }
  return null;
}

// ── RARITY + PRICE (same logic as the API server) ─────────────
const RARITY_MAP = {
  'Special illustration rare':'Special Illustration Rare','Illustration rare':'Illustration Rare',
  'Ultra Rare':'Rare Ultra','Ultra rare':'Rare Ultra','Double rare':'Double Rare',
  'Hyper rare':'Hyper Rare','Secret Rare':'Rare Secret','Secret rare':'Rare Secret',
  'Rainbow Rare':'Rare Rainbow','Rainbow rare':'Rare Rainbow','ACE SPEC rare':'ACE SPEC Rare',
  'Holo Rare':'Rare Holo','Rare holo':'Rare Holo','SAR':'Special Illustration Rare',
  'SR':'Rare Ultra','UR':'Hyper Rare','AR':'Illustration Rare','CHR':'Illustration Rare',
  'CSR':'Rare Secret','RRR':'Rare Ultra','RR':'Double Rare','HR':'Hyper Rare',
  'Mega hyper rare':'Hyper Rare','Mega attack rare':'Illustration Rare'
};
function normRarity(r) {
  if (!r) return null;
  if (RARITY_MAP[r]) return RARITY_MAP[r];
  const l = String(r).toLowerCase();
  if (l.includes('special illustration')) return 'Special Illustration Rare';
  if (l.includes('illustration')) return 'Illustration Rare';
  if (l.includes('hyper'))   return 'Hyper Rare';
  if (l.includes('secret'))  return 'Rare Secret';
  if (l.includes('rainbow')) return 'Rare Rainbow';
  if (l.includes('ultra'))   return 'Rare Ultra';
  if (l.includes('double'))  return 'Double Rare';
  if (l.includes('holo'))    return 'Rare Holo';
  if (l.includes('uncommon'))return 'Uncommon';
  if (l.includes('common'))  return 'Common';
  if (l.includes('rare'))    return 'Rare';
  return null;
}
function inferRarity(num, printed, name) {
  const n = parseInt(num), t = parseInt(printed);
  const nm = (name || '').toLowerCase();
  if (n && t && n > t) {
    if (nm.startsWith('mega ') || / vmax\b/.test(nm)) return 'Hyper Rare';
    if (/ ex\b/.test(nm) || / v\b/.test(nm)) return 'Special Illustration Rare';
    return 'Illustration Rare';
  }
  if (/^mega /.test(nm) && / ex\b/.test(nm)) return 'Double Rare';
  if (/ vmax\b/.test(nm))  return 'Rare Holo VMAX';
  if (/ vstar\b/.test(nm)) return 'Rare Holo VSTAR';
  if (/ ex\b/.test(nm))    return 'Double Rare';
  if (/ v\b/.test(nm))     return 'Rare Holo V';
  if (/ gx\b/.test(nm))    return 'Rare Holo GX';
  if (!n || !t) return 'Common';
  if (n > t * 0.93) return 'Rare Ultra';
  if (n > t * 0.86) return 'Illustration Rare';
  if (n > t * 0.72) return 'Rare Holo';
  if (n > t * 0.42) return 'Uncommon';
  return 'Common';
}
// No estimate is written (Roy, 2026-10-09): estimator.js is deleted. Every
// consumer it had either displayed its number or wrote a row that was
// displayed; none ranked, scheduled or ordered anything.

// pokemontcg.io's block, read by the one reader (pokemontcgblock.js, Roy
// 2026-10-10): a market price, else Cardmarket's, else the cheapest listing as
// an ASK — the source name says so (`_low`), since these writers record no
// source_meta. Never the mid listing, never the reverse printing as the base.
function extractPrice(card) {
  const f = require('./pokemontcgblock').liveFigure(card);
  return f ? { price: f.price, source: f.source, basis: f.basis } : null;
}

// ── DB WRITE ──────────────────────────────────────────────────
// opts.insertOnly (cardgap, 2026-10-04): a card already held is left exactly
// as it is — its rarity may be manifest's or Yuyu-tei's, its art may be
// Limitless's, and an upsert from the set listing would overwrite the first
// with positional inference. Only a row that did not exist gets a price row.
async function upsertCards(cards, opts = {}) {
  if (!db || !cards.length) return { written: 0, failed: 0, firstError: null };
  let written = 0, failed = 0, firstError = null;

  for (const c of cards) {
    try {
      if (opts.insertOnly) {
        const ins = await db.query(`
          INSERT INTO cards (api_card_id,name,name_en,number,rarity,supertype,
            image_small,image_large,set_api_id,set_name,set_name_en,set_total,
            tcgplayer_data,cardmarket_data,set_logo,set_series,set_release,image_lang)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (api_card_id) DO NOTHING`,
          [c.api_card_id, c.name, c.name_en || null, c.number, c.rarity, c.supertype,
           c.image_small, c.image_large, c.set_api_id, c.set_name, c.set_name_en || null,
           c.set_total,
           JSON.stringify(c.tcgplayer || null), JSON.stringify(c.cardmarket || null),
           c.set_logo || null, c.set_series || null, c.set_release || null,
           c.image_lang || null]);
        if (ins.rowCount !== 1) continue;
        written++;
        if (c.price > 0) {
          await db.query(
            `INSERT INTO price_history (card_api_id,price_usd,source,condition)
             VALUES ($1,$2,$3,'raw_nm')`,
            [c.api_card_id, c.price, c.price_source]).catch(() => {});
        }
        continue;
      }
      await db.query(`
        INSERT INTO cards (api_card_id,name,name_en,number,rarity,supertype,
          image_small,image_large,set_api_id,set_name,set_name_en,set_total,
          tcgplayer_data,cardmarket_data,set_logo,set_series,set_release,image_lang)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (api_card_id) DO UPDATE SET
          name=EXCLUDED.name,
          name_en=COALESCE(EXCLUDED.name_en, cards.name_en),
          rarity=EXCLUDED.rarity,
          image_small=COALESCE(EXCLUDED.image_small, cards.image_small),
          image_large=COALESCE(EXCLUDED.image_large, cards.image_large),
          image_lang=COALESCE(EXCLUDED.image_lang, cards.image_lang),
          set_name_en=COALESCE(EXCLUDED.set_name_en, cards.set_name_en),
          set_logo=COALESCE(EXCLUDED.set_logo, cards.set_logo),
          set_series=COALESCE(EXCLUDED.set_series, cards.set_series),
          set_release=COALESCE(EXCLUDED.set_release, cards.set_release),
          tcgplayer_data=EXCLUDED.tcgplayer_data,
          cardmarket_data=EXCLUDED.cardmarket_data, updated_at=NOW()`,
        [c.api_card_id, c.name, c.name_en || null, c.number, c.rarity, c.supertype,
         c.image_small, c.image_large, c.set_api_id, c.set_name, c.set_name_en || null,
         c.set_total,
         JSON.stringify(c.tcgplayer || null), JSON.stringify(c.cardmarket || null),
         c.set_logo || null, c.set_series || null, c.set_release || null,
         c.image_lang || null]);
      written++;

      if (c.price > 0) {
        await db.query(
          `INSERT INTO price_history (card_api_id,price_usd,source,condition)
           VALUES ($1,$2,$3,'raw_nm')`,
          [c.api_card_id, c.price, c.price_source]).catch(() => {});
      }
    } catch (e) {
      failed++;
      if (!firstError) firstError = e.message;
    }
  }
  return { written, failed, firstError };
}

// ── INGEST ONE SET ────────────────────────────────────────────
// TCGdex lists a set logo WITHOUT an extension. It usually serves .png, but
// not always: sv01, xy10 and ecard1 answer 404 for .png and 200 for .webp
// (measured 2026-10-04 — the three English logos that never drew). Store the
// first that answers a GET (a HEAD-only probe has lied here before), or
// nothing — never a URL nobody fetched.
async function tcgdexLogo(base) {
  if (!base) return null;
  for (const ext of ['.png', '.webp']) {
    try {
      const r = await fetch(base + ext, { signal: AbortSignal.timeout(15000) });
      if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) return base + ext;
    } catch (e) { /* next extension */ }
  }
  return null;
}

// opts.only (cardgap): write just these TCGdex localIds, insert-only, with the
// set's fields taken from the cards already held (opts.held) so a filled card
// carries the same set name, total and logo as its neighbours, and its number
// follows the set's stored form (Limitless-ingested sets store "78", TCGdex
// lists "078").
async function ingestSet(setId, lang, setName, printedTotal, opts = {}) {
  // 1. English prices + rarity from pokemontcg.io (indexed by number)
  const pIndex = {};
  if (lang === 'en') {
    let page = 1, total = 9999, seen = 0;
    while (seen < total && page <= 10) {
      const d = await get(`${TCG_API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&orderBy=number`, TCG_H);
      await sleep(DELAY_PTCG);
      if (!d || !d.data || !d.data.length) break;
      d.data.forEach(c => {
        const p = extractPrice(c);
        const rec = { price: p ? p.price : null, source: p ? p.source : null,
                      rarity: c.rarity, tcgplayer: c.tcgplayer, cardmarket: c.cardmarket,
                      supertype: c.supertype, images: c.images, name: c.name };
        pIndex[String(c.number)] = rec;
        pIndex[String(c.number).replace(/^0+/, '')] = rec;
      });
      seen += d.data.length;
      total = d.totalCount || seen;
      page++;
    }
  }

  // 2. Catalog + localized names + images from TCGdex
  const td = await get(`${TCGDEX}/${lang}/sets/${setId}`);
  await sleep(DELAY_TCGDEX);
  if (!td || !td.cards || !td.cards.length) return { cards: 0, skipped: true };

  // 2b. For non-English, also pull the English release so we can show
  //     "メガゲンガーex (Mega Gengar ex)" in the UI.
  let enIndex = {}, enImg = {}, enSetName = null;
  if (lang !== 'en') {
    const tdEn = await get(`${TCGDEX}/en/sets/${setId}`);
    await sleep(DELAY_TCGDEX);
    if (tdEn && tdEn.cards && tdEn.cards.length) {
      enSetName = tdEn.name;   // exact id match — safe to use as the English set name
      tdEn.cards.forEach(c => {
        const n = String(c.localId);
        enIndex[n] = c.name;
        enIndex[n.replace(/^0+/, '')] = c.name;
        if (c.image) { enImg[n] = c.image; enImg[n.replace(/^0+/, '')] = c.image; }
      });
    }
    // Fall back to pokemontcg.io names when TCGdex has no English release
    if (!Object.keys(enIndex).length && Object.keys(pIndex).length) {
      for (const [num, rec] of Object.entries(pIndex)) {
        if (rec.name) enIndex[num] = rec.name;
      }
    }
  }

  const printedFromTcgdex = printedTotal ||
    (td.cardCount && (td.cardCount.official || td.cardCount.total)) || td.cards.length;
  const held = opts.held || null;
  const printed = held && held.set_total ? held.set_total : printedFromTcgdex;
  const setLogo = held ? held.set_logo : await tcgdexLogo(td.logo);
  const listed = opts.only ? td.cards.filter(c => opts.only.has(String(c.localId))) : td.cards;

  const rows = listed.map(c => {
    const num = (held && !held.padded) ? String(c.localId).replace(/^0+(?=\d)/, '') : String(c.localId);
    const pi = pIndex[num] || pIndex[num.replace(/^0+/, '')] || {};
    const rarity = normRarity(pi.rarity) || normRarity(c.rarity) || inferRarity(num, printed, c.name);
    const price = (pi.price && pi.price > 0) ? pi.price : null;   // no estimate
    const nameEn = lang === 'en' ? null
      : (enIndex[num] || enIndex[num.replace(/^0+/, '')] || (pi.name || null));
    return {
      api_card_id: `${lang}-${setId}-${num}`,
      name: c.name, name_en: nameEn, number: num, rarity,
      supertype: pi.supertype || null,
      // Native artwork only. Never borrow another language's image —
      // JP cards have Japanese text and CN sets have exclusive illustrations.
      image_small: c.image ? `${c.image}/low.png`
                 : (lang === 'en' && pi.images ? pi.images.small : null),
      image_large: c.image ? `${c.image}/high.png`
                 : (lang === 'en' && pi.images ? pi.images.large : null),
      image_lang: c.image ? lang : (lang === 'en' && pi.images ? 'en' : null),
      set_api_id: setId, set_name: held ? held.set_name : (setName || td.name),
      set_name_en: held ? held.set_name_en : enSetName, set_total: printed,
      set_logo: setLogo,
      set_series: held ? held.set_series : ((td.serie && td.serie.name) || null),
      set_release: held ? held.set_release : (td.releaseDate || null),
      tcgplayer: pi.tcgplayer || null, cardmarket: pi.cardmarket || null,
      price, price_source: (pi.price && pi.price > 0) ? (pi.source || 'tcgplayer') : null
    };
  });

  const res = await upsertCards(rows, { insertOnly: !!opts.only });
  if (res.failed > 0) {
    console.log(`\n     DB WRITE FAILED for ${res.failed}/${rows.length} cards in ${setId}`);
    console.log(`     first error: ${res.firstError}`);
  }
  return {
    cards: rows.length,
    written: res.written,
    failed: res.failed,
    real: rows.filter(r => r.price > 0).length
  };
}

// ── INGEST A WHOLE LANGUAGE ───────────────────────────────────
async function ingestLang(lang) {
  console.log(`\n${'='.repeat(62)}`);
  console.log(`  INGESTING: ${lang.toUpperCase()}`);
  console.log(`${'='.repeat(62)}\n`);

  const progress = loadProgress(lang);
  progress.done[lang] = progress.done[lang] || {};

  const sets = await get(`${TCGDEX}/${lang}/sets`);
  await sleep(DELAY_TCGDEX);
  if (!sets || !sets.length) { console.log(`  No sets for ${lang}`); return; }

  console.log(`  ${sets.length} sets found\n`);

  let totalCards = 0, totalReal = 0, done = 0, skipped = 0;

  for (const s of sets) {
    if (progress.done[lang][s.id]) { done++; continue; }

    const printed = (s.cardCount && (s.cardCount.official || s.cardCount.total)) || 0;
    process.stdout.write(`  [${done + skipped + 1}/${sets.length}] ${s.id.padEnd(12)} ${(s.name||'').slice(0,28).padEnd(30)}`);

    const r = await ingestSet(s.id, lang, s.name, printed);

    if (r.skipped) {
      console.log('no cards');
      skipped++;
    } else {
      const wrote = r.written !== undefined ? r.written : r.cards;
      const flag = (r.failed > 0) ? `  (${r.failed} FAILED)` : '';
      console.log(`${String(wrote).padStart(4)} cards  ${String(r.real).padStart(4)} real prices${flag}`);
      totalCards += (r.written !== undefined ? r.written : r.cards);
      totalReal  += r.real;
      progress.done[lang][s.id] = { cards: (r.written !== undefined ? r.written : r.cards), prepared: r.cards, failed: r.failed || 0, real: r.real, at: new Date().toISOString() };
      done++;
    }

    progress.cards = (progress.cards || 0) + (r.cards || 0);
    saveProgress(progress, lang);
    await sleep(DELAY_SET);
  }

  console.log(`\n  ${lang.toUpperCase()} complete: ${totalCards} cards, ${totalReal} with real prices, ${skipped} sets skipped\n`);
}

// ── STATUS ────────────────────────────────────────────────────
async function status() {
  const p = loadAllProgress();
  console.log('\n  CATALOG (from progress files)\n  ' + '-'.repeat(52));
  let grand = 0;
  for (const [lang, sets] of Object.entries(p.done || {})) {
    const n = Object.keys(sets).length;
    const cards = Object.values(sets).reduce((a, b) => a + (b.cards || 0), 0);
    grand += cards;
    console.log(`  ${lang.padEnd(8)} ${String(n).padStart(4)} sets  ${String(cards).padStart(7)} cards`);
  }
  console.log('  ' + '-'.repeat(52));
  console.log(`  TOTAL    ${String(grand).padStart(18)} cards`);

  if (!db) { console.log('\n  Supabase: DATABASE_URL not set (dry run)\n'); return; }

  try {
    // Real vs estimated, straight from the database
    const rows = await db.query(`
      SELECT split_part(c.api_card_id,'-',1) AS lang,
             COUNT(DISTINCT c.api_card_id) AS cards,
             COUNT(DISTINCT c.api_card_id) FILTER (
               WHERE EXISTS (SELECT 1 FROM price_history ph
                             WHERE ph.card_api_id = c.api_card_id
                               AND ph.grade IS NULL
                               AND ph.source NOT LIKE 'estimate%')
             ) AS with_real
      FROM cards c GROUP BY 1 ORDER BY 2 DESC`);

    console.log('\n  PRICES (from database)\n  ' + '-'.repeat(52));
    console.log('  lang       cards   real prices   coverage');
    let tc = 0, tr = 0;
    rows.rows.forEach(r => {
      const c = parseInt(r.cards), w = parseInt(r.with_real);
      tc += c; tr += w;
      const pct = c ? ((w / c) * 100).toFixed(1) : '0.0';
      console.log(`  ${String(r.lang).padEnd(8)} ${String(c).padStart(7)} ${String(w).padStart(13)} ${String(pct + '%').padStart(10)}`);
    });
    console.log('  ' + '-'.repeat(52));
    console.log(`  TOTAL    ${String(tc).padStart(7)} ${String(tr).padStart(13)} ${String(((tr/tc)*100).toFixed(1) + '%').padStart(10)}`);

    // Where the real prices came from
    const src = await db.query(`
      SELECT source, COUNT(*) AS n FROM price_history
      WHERE source NOT LIKE 'estimate%'
      GROUP BY 1 ORDER BY n DESC LIMIT 8`);
    if (src.rows.length) {
      console.log('\n  Top price sources');
      src.rows.forEach(r => console.log(`    ${String(r.source).padEnd(26)} ${r.n}`));
    }

    // Rarity spread — the canary for a broken rarity chain
    const rar = await db.query(`
      SELECT rarity, COUNT(*) AS n FROM cards
      GROUP BY 1 ORDER BY n DESC LIMIT 8`);
    const total = rar.rows.reduce((a, b) => a + parseInt(b.n), 0);
    console.log('\n  Rarity spread');
    rar.rows.forEach(r => {
      const pct = ((parseInt(r.n) / total) * 100).toFixed(1);
      console.log(`    ${String(r.rarity || '(none)').padEnd(28)} ${String(r.n).padStart(6)}  ${pct}%`);
    });
    const commonPct = rar.rows[0] ? (parseInt(rar.rows[0].n) / total) * 100 : 0;
    if (rar.rows[0] && rar.rows[0].rarity === 'Common' && commonPct > 70) {
      console.log('\n    WARNING: over 70% Common — the rarity chain may be broken');
    }
    console.log('');
  } catch (e) { console.log(`\n  Supabase: ${e.message}\n`); }
}

// ── PRICE REFRESH ─────────────────────────────────────────────
async function refreshPrices() {
  if (!db) { console.log('DATABASE_URL required'); return; }
  console.log('\n  Refreshing prices for English sets...\n');
  const sets = await db.query(
    `SELECT DISTINCT set_api_id FROM cards WHERE api_card_id LIKE 'en-%' ORDER BY set_api_id`);
  let updated = 0;
  for (const row of sets.rows) {
    const sid = row.set_api_id;
    process.stdout.write(`  ${sid.padEnd(14)}`);
    let page = 1, total = 9999, seen = 0, n = 0;
    while (seen < total && page <= 10) {
      const d = await get(`${TCG_API}/cards?q=set.id:${sid}&pageSize=250&page=${page}`, TCG_H);
      await sleep(DELAY_PTCG);
      if (!d || !d.data || !d.data.length) break;
      for (const c of d.data) {
        const p = extractPrice(c);
        if (!p) continue;
        await db.query(
          `INSERT INTO price_history (card_api_id,price_usd,source,condition)
           VALUES ($1,$2,$3,'raw_nm')`,
          [`en-${sid}-${c.number}`, p.price, p.source]).catch(() => {});
        n++;
      }
      seen += d.data.length;
      total = d.totalCount || seen;
      page++;
    }
    console.log(`${String(n).padStart(4)} prices`);
    updated += n;
    await sleep(DELAY_SET);
  }
  console.log(`\n  ${updated} price records written\n`);
}


// ══════════════════════════════════════════════════════════════
// DIGITAL-ONLY SETS — no physical market, so no market price
//
// Pokemon TCG Pocket (the mobile game, launched Oct 2024) cards exist
// only in-app. They cannot be bought, sold or graded, so TCGPlayer and
// every other marketplace has nothing for them. Chasing prices for these
// wastes hours and can never succeed.
// ══════════════════════════════════════════════════════════════
//
// Identified by SERIES (digital.js), never by id shape. The list below is
// only the SEED used when the database cannot be asked; loadDigitalSets()
// replaces it at startup with every set whose set_series says Pocket, so a
// new Pocket set is caught the day it is ingested rather than the day
// someone extends a regex. The server hides the same sets from every read.
const digital = require('./digital');
let digitalSource = 'seed list (database not asked)';

async function loadDigitalSets() {
  if (!db) return;
  try {
    const r = await db.query(
      `SELECT DISTINCT set_api_id FROM cards WHERE NOT ${digital.visibleSql()}`);
    if (!r.rows.length) { digitalSource = 'seed list (no Pocket rows in database)'; return; }
    const seed = [...DIGITAL_SETS];
    DIGITAL_SETS.clear();
    r.rows.forEach(x => DIGITAL_SETS.add(x.set_api_id));
    digitalSource = `set_series, ${DIGITAL_SETS.size} sets`;
    const lost = seed.filter(x => !DIGITAL_SETS.has(x));
    if (lost.length) console.log(`  NOTE: seed digital sets not Pocket by series: ${lost.join(', ')}`);
  } catch (e) {
    digitalSource = 'seed list (series query failed: ' + e.message + ')';
  }
}

const DIGITAL_SETS = new Set([
  // TCG Pocket — A series
  'A1','A1a','A2','A2a','A2b','A3','A3a','A3b','A4','A4a','P-A',
  // TCG Pocket — B series
  'B1','B1a','B2','B2a'
]);

// Card ids are {lang}-{setId}-{number} and BOTH lang and setId may contain
// hyphens: en-P-A-089, en-tk-xy-su-29, zh-tw-sv01-001. `split('-')[1]` yields
// "P" for en-P-A-089, so isDigitalSet never fired on the Pocket promo set and
// its cards were priced against physical TCGPlayer promos -- en-P-A-025 came
// out at $498.88 for a card that cannot be bought. Prefer cards.set_api_id
// when you have it; use this when you only have the id.
function setIdFromCardId(cardId, lang) {
  const str = String(cardId);
  const prefix = lang ? lang + '-' : (str.match(/^(zh-tw|zh-cn|en|ja)-/) || [, ''])[1] + '-';
  const rest = str.startsWith(prefix) ? str.slice(prefix.length) : str;
  return rest.replace(/-[^-]*$/, '');          // drop the trailing number
}

function isDigitalSet(setId) {
  return DIGITAL_SETS.has(setId);
}

// The rarities safeprices / ytest price by default (the name is historical:
// it once chose which cards the deleted eBay sold-page scrape visited).
const SCRAPE_RARITIES = [
  'Hyper Rare','Special Illustration Rare','Illustration Rare',
  'Rare Secret','Rare Rainbow','Rare Ultra','ACE SPEC Rare',
  'Rare Shiny','Amazing Rare','Double Rare'
];

// node ingest.js scrape — DELETED 2026-10-01: scrapeEbaySold (eBay's completed-listings
// HTML, banned since T8 — eBay's terms, and an IP-block risk), scrapeTcgPlayer (TCGplayer's
// internal search, unfiltered, top hit taken) and scrapePrices. Nothing called them but the
// banned command. Sold data has no licensed source; see CLAUDE.md OPEN WORK.


// ══════════════════════════════════════════════════════════════
// SAFE PRICE SOURCES — public JSON APIs, no aggressive scraping
//
// These are endpoints the sites' own front-ends call. Rate-limited
// politely, they behave like normal traffic. Far lower risk than
// parsing eBay's completed-listings HTML.
//
//   node ingest.js safeprices        all languages
//   node ingest.js safeprices ja     Japanese only
// ══════════════════════════════════════════════════════════════

const UA_SAFE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const hostLast = {};
async function hostDelay(host, ms) {
  const wait = Math.max(0, (hostLast[host] || 0) + ms - Date.now());
  if (wait) await sleep(wait);
  hostLast[host] = Date.now();
}

// ── 1. TCGPLAYER — their own search API. English + some JP singles.
// Collector numbers are compared WHOLE (cardnumber.js, TASK-product-matching
// 2026-10-09): a prefix or suffix letter is part of the number. The private
// normNum that lived here reduced "50a" to "50" and "XY177a" to "177".
const { numberKey, tcgHitNumber, RULE: NUMBER_RULE, stampedNotOurs, tcgdexProductIds } = require('./cardnumber');

// \u2500\u2500 Reprints on the PRICING path (TASK T6, 2026-09-28) \u2500\u2500
// cardmatch's REPRINT_OF already told the LISTINGS path that 30th-c #001 is
// printed "4/102"; pricing searched TCGPlayer with our catalogue number
// "001", which never matches, so repeated names (Charizard, Pikachu, Lugia
// ...) were refused and the rest matched on name alone. Worse, "Charizard
// 4/102" is THREE products \u2014 Base Set, 2021 Celebrations: Classic Collection
// ($155) and 2026 ME: 30th Celebration Classic Collection ($206) \u2014 so the
// printed number alone is not enough either. For a reprint card: search
// with the printed number AND accept only a product in TCGPlayer's own set
// for that reprint, by exact set name, measured live.
const cmatch = require('./cardmatch');
const TCG_REPRINT_SET = {
  '30th-c':  'ME: 30th Celebration Classic Collection',
  'cel25cc': 'Celebrations: Classic Collection'
};
// ── TCGplayer's set name for OUR set (TASK T1, 2026-09-29) ──
// tcgPlayerSearch matched the collector number in ANY set. Our set name
// "Expedition Base Set" makes TCGplayer rank Base Set products first, so
// Expedition Alakazam 001 took Base Set 2 001/130 ($55.51) or Base Set
// 001/102 ($69.72) on alternate nights — the stored history swings between
// exactly those two — while the card is $233.32. Butterfree #5 ($180) held
// $0.35: SM Base Set 3/149. Measured on 2,767 English cards: Expedition
// 27 of 59 wrong by >40%, every other era 1-3%. Aquapolis and Skyridge,
// the H-numbered sets, agreed 54 of 54 — H-numbering was not the cause.
//
// A hit now counts only in TCGplayer's own name for our set — see
// tcgsetname.js, which holds the rule and the measured exceptions.
const { sameTcgSet, normTcgSetName, TCG_SET_NAME } = require('./tcgsetname.js');

function reprintPricing(card) {
  const rp = cmatch.reprintOf({ api_card_id: card.api_card_id, number: card.number });
  if (!rp) return null;
  return { number: rp.number, printed: rp.printed, tcgSet: TCG_REPRINT_SET[rp.set] || null };
}

// ── 1a. TCGdex: TCGplayer's price, keyed by TCGplayer's own productId ──
// The English primary since TASK T1 (2026-09-29). Refuses — returns null,
// so the caller falls back — when no full `tcgdexharvest.js en` has recorded
// which products TCGdex maps to two cards: without that list, Trainer
// Gallery TG16 would take the main-set card's $3.62 for an $86.55 card.
const tdxp = require('./tcgdexprice.js');
const fx = require('./fx.js');   // Cardmarket EUR -> USD, the rate recorded on the row
let _tdxConflicts = null, _tdxWarned = false;
// No price says WHY (2026-10-01) — `{ price: null, none: reason }`:
//   'no-tcgplayer'  TCGdex has the card and no TCGplayer price for it
//   'not-on-tcgdex' TCGdex answers 404 for the card
//   'shared'        TCGdex's product is given to two cards, trusted for neither
//   'unreachable'   TCGdex did not answer — say so, retry another night
//   'not-ready'     no harvest has recorded shared products yet
// Only the first three may fall back to TCGplayer's internal search, which
// is kept for exactly the cards TCGdex cannot price (2,025 visible English
// cards on 2026-10-01: promos, 30th, Shiny Vaults, Galarian Gallery,
// Classic Collection). A bare null used to send an unreachable TCGdex's
// every card to the internal API.
const TCGDEX_FALLBACK_OK = new Set(['no-tcgplayer', 'not-on-tcgdex', 'shared']);
// ── The artist rides the call the nightly already makes (Roy, 2026-10-08) ──
// The card page fetched it from TCGdex on every view. TCGdex's card response
// carries it; tcgdexPriceFor has that response for every English card it
// prices, so it is stored here — no extra request. A missing artist never
// blanks a stored one (absent data never overwrites stored data). Needs
// migration-illustrator.sql; until then this says so once and writes nothing.
let _illusCol = null, _illusWarned = false;
async function writeIllustrator(card, illustrator) {
  if (_illusCol === null) _illusCol = (await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cards' AND column_name='illustrator'`)
    .catch(() => ({ rows: [] }))).rows.length > 0;
  if (!_illusCol) {
    if (!_illusWarned) { _illusWarned = true; console.log('\n  cards.illustrator is missing — run migration-illustrator.sql. Artists are not stored until then.\n'); }
    return;
  }
  await db.query(`UPDATE cards SET illustrator = COALESCE($2, illustrator), illustrator_checked_at = NOW() WHERE api_card_id = $1`,
    [card.api_card_id, illustrator ? String(illustrator).slice(0, 200) : null]).catch(e => console.log('  (artist not stored for ' + card.api_card_id + ': ' + e.message + ')'));
}
// ── The regulation mark, from the same response (TASK-tcgdex-fields T2, 2026-10-09) ──
// The printing-era letter. Stored only: no gate, estimator, headline or photo
// check reads it. Same pattern as the artist: no extra request, a response
// without it never erases a stored one, regulation_mark_checked_at tells "none
// known" from "never asked". Needs migration-regulation-mark.sql.
let _regCol = null, _regWarned = false;
async function writeRegulationMark(card, mark) {
  if (_regCol === null) _regCol = (await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cards' AND column_name='regulation_mark'`)
    .catch(() => ({ rows: [] }))).rows.length > 0;
  if (!_regCol) {
    if (!_regWarned) { _regWarned = true; console.log('\n  cards.regulation_mark is missing — run migration-regulation-mark.sql. Marks are not stored until then.\n'); }
    return;
  }
  const m = typeof mark === 'string' && /^[A-Z]{1,2}$/.test(mark.trim()) ? mark.trim() : null;
  await db.query(`UPDATE cards SET regulation_mark = COALESCE($2, regulation_mark), regulation_mark_checked_at = NOW() WHERE api_card_id = $1`,
    [card.api_card_id, m]).catch(e => console.log('  (regulation mark not stored for ' + card.api_card_id + ': ' + e.message + ')'));
}
// ── The national dex number(s), from the same response (TASK-tcgdex-fields T1, Roy 2026-10-09) ──
// TCGdex gives an ARRAY: a TAG TEAM card depicts two Pokémon ([25, 644]),
// so every number is kept in TCGdex's order — keeping the first would be a lie
// about the card. No numbers = '{}', "none known" (Trainers, Energy);
// dex_ids_checked_at NULL = never asked. A response without numbers never
// erases stored ones; an array with anything but a dex number in it is refused
// whole, never stored in part. Needs migration-dex-ids.sql.
let _dexCol = null, _dexWarned = false;
async function writeDexIds(card, dexIds) {
  if (_dexCol === null) _dexCol = (await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cards' AND column_name='dex_ids'`)
    .catch(() => ({ rows: [] }))).rows.length > 0;
  if (!_dexCol) {
    if (!_dexWarned) { _dexWarned = true; console.log('\n  cards.dex_ids is missing — run migration-dex-ids.sql. Dex numbers are not stored until then.\n'); }
    return;
  }
  const ids = dexIds == null ? [] : dexIds;
  if (!Array.isArray(ids) || !ids.every(n => Number.isInteger(n) && n >= 1 && n <= 2000)) {
    console.log('  (dex number not stored for ' + card.api_card_id + ': TCGdex gave ' + JSON.stringify(dexIds).slice(0, 80) + ')');
    return;
  }
  await db.query(`UPDATE cards SET dex_ids = CASE WHEN cardinality($2::int[]) > 0 THEN $2::int[] ELSE COALESCE(dex_ids, '{}') END,
    dex_ids_checked_at = NOW() WHERE api_card_id = $1`,
    [card.api_card_id, ids]).catch(e => console.log('  (dex number not stored for ' + card.api_card_id + ': ' + e.message + ')'));
}
async function tcgdexPriceFor(card) {
  if (!card.set_api_id || !String(card.api_card_id).startsWith('en-')) return { price: null, none: 'not-english' };
  if (!_tdxConflicts) {
    _tdxConflicts = await tdxp.loadProductConflicts(db, 'en').catch(() => ({ ready: false }));
  }
  if (!_tdxConflicts.ready) {
    if (!_tdxWarned) {
      _tdxWarned = true;
      console.log('\n  TCGdex pricing NOT used: no full harvest has recorded shared products.');
      console.log('  Run  node tcgdexharvest.js en  once. Nothing is priced until then.\n');
    }
    return { price: null, none: 'not-ready' };
  }
  await hostDelay('tcgdex', DELAY_TCGDEX);
  const url = `${TCGDEX}/en/cards/${card.set_api_id}-${tcgdexLocalId(card.number)}`;
  let d = null, status = 0;
  for (let i = 0; i < 3 && !d; i++) {
    try {
      const r = await fetch(url);
      status = r.status;
      if (r.status === 404) return { price: null, none: 'not-on-tcgdex' };
      if (r.ok) d = await r.json();
    } catch (e) { status = 'network: ' + e.message; }
    if (!d) await sleep(2000 * (i + 1));
  }
  if (!d) return { price: null, none: 'unreachable', detail: String(status) };
  await writeIllustrator(card, d.illustrator);
  await writeRegulationMark(card, d.regulationMark);
  await writeDexIds(card, d.dexId);
  const p = tdxp.parsePricing(d);
  const b = p.tcgplayerBase;
  // No TCGplayer price: hand back TCGdex's Cardmarket block, which the caller
  // stores as a SECOND READING beside the headline, never as it (printsql).
  if (!b) return { price: null, none: 'no-tcgplayer',
    cardmarket: p.cardmarket && !_tdxConflicts.cardmarket.has(String(p.cardmarket.idProduct)) ? p.cardmarket : null,
    cardmarketShared: !!(p.cardmarket && _tdxConflicts.cardmarket.has(String(p.cardmarket.idProduct))) };
  if (_tdxConflicts.tcgplayer.has(String(b.productId))) return { price: null, none: 'shared' };
  // The 1st Edition price is in the same response. Until 2026-10-02 it was
  // dropped here, and nothing else wrote one: every 1st Edition price on
  // the card page was whatever a harvest had left, frozen (Lugia neo1-9
  // held $164.80 while TCGdex said $1,134.85). Carried out beside the
  // headline and written as its own edition row (writeEditionPrice) —
  // never as the headline, which baseEditionSql keeps Unlimited.
  let firstEdition = null;
  if (!String(b.printing).startsWith('1st-edition')) {
    const fe = tdxp.tcgplayerByEdition(d.pricing && d.pricing.tcgplayer, tdxp.printingsFromTcgdex(d).printings).firstEdition;
    if (fe && fe.price > 0 && !_tdxConflicts.tcgplayer.has(String(fe.productId))) firstEdition = fe;
  }
  return {
    price: b.price, source: `tcgdex_tcgplayer_${b.printing}`, marketplace: 'tcgplayer',
    matched: d.name, matchedBy: 'productId',
    // basis 'ask': TCGdex has listings but no market price — the floor (tcgdexprice.basisPrice).
    meta: { printing: b.printing, productId: b.productId, currency: 'USD', updated: p.tcgplayerUpdated, basis: b.basis },
    firstEdition: firstEdition && { price: firstEdition.price, source: `tcgdex_tcgplayer_${firstEdition.printing}`,
      meta: { printing: firstEdition.printing, productId: firstEdition.productId, currency: 'USD',
              updated: p.tcgplayerUpdated, role: 'edition', basis: firstEdition.basis } }
  };
}

// Is a TCGplayer hit a SEALED product (booster, tin, deck…) rather than a
// card? Whole words (cmatch.boundedTerm), never read off the card's own name
// (CLAUDE.md LESSONS 1). Until 2026-10-09 the list had no boundaries: "tin"
// refused every hit for Dratini, Victini, Giratina and every "Basic Fighting
// Energy", "pack" Clemont's Backpack, and "bundle" / "box" / "collection" the
// cards named Iron Bundle, Secret Box, Aaron's Collection — none of them could
// ever be matched. Plurals are listed, as the unbounded list caught them.
function tcgSealedProduct(productName, cardName) {
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
  const own = fold(cardName).trim();
  let got = fold(productName);
  if (own) got = got.split(own).join(' ~ ');
  const words = ['booster', 'boosters', 'box', 'boxes', 'bundle', 'bundles', 'case', 'cases', 'collection', 'collections',
    'tin', 'tins', 'deck', 'decks', 'pack', 'packs', 'sleeve', 'sleeves', 'binder', 'binders', 'portfolio', 'portfolios', 'elite trainer'];
  return new RegExp(words.map(cmatch.boundedTerm).join('|'), 'i').test(got);
}

async function tcgPlayerSearch(cardName, setName, cardNumber, cardRarity, opts = {}) {
  // TCGPlayer is a US/English marketplace. Japanese names return junk
  // matches from fuzzy search, so don't even ask.
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(cardName)) return null;
  // A reprint with no known TCGPlayer set is refused rather than guessed.
  if (opts.reprint && !opts.reprint.tcgSet) return null;

  // Asked in OUR set name first, as always. Only if that finds no match,
  // once more in TCGplayer's OWN name for the set, where tcgsetname.js has
  // one (2026-10-02): "Turtwig DP Black Star Promos" ranks TCGplayer's
  // "Diamond and Pearl Promos" Turtwig out of the 48 results, "Turtwig
  // Diamond and Pearl Promos" finds it first. The second question can only
  // add a match the first missed — every hit still passes the same set and
  // number checks below — and costs one request, on a miss only.
  if (!opts.reprint && opts.setId && opts.queryAs === undefined) {
    const first = await tcgPlayerSearch(cardName, setName, cardNumber, cardRarity, Object.assign({}, opts, { queryAs: setName || '' }));
    if (first) return first;
    const theirs = (TCG_SET_NAME[opts.setId] || [])[0];
    if (!theirs || normTcgSetName(theirs) === normTcgSetName(setName)) return null;
    const second = await tcgPlayerSearch(cardName, setName, cardNumber, cardRarity, Object.assign({}, opts, { queryAs: theirs }));
    if (second) second.queriedAs = theirs;
    return second;
  }

  const q = `${cardName} ${opts.queryAs !== undefined ? opts.queryAs : (setName || '')}`.trim();
  const wantNum = numberKey(cardNumber);

  try {
    // The ask pass reads the hits the market pass just fetched (opts.memo, one
    // Map per card from safePriceFor): one request per query, never two.
    let hits = opts.memo ? opts.memo.get(q) : null;
    if (!hits) {
    await hostDelay('tcgplayer', 1800);
    const r = await fetch('https://mp-search-api.tcgplayer.com/v1/search/request?q=' +
      encodeURIComponent(q) + '&isList=false', {
      method: 'POST',
      headers: { 'User-Agent': UA_SAFE, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        algorithm: 'sales_dismax', from: 0, size: 48,   // was 5 — too few to find the right variant
        filters: { term: { productLineName: ['pokemon'] }, range: {}, match: {} },
        context: { cart: {}, shippingCountry: 'US' },
        settings: { useFuzzySearch: false, didYouMean: {} }, sort: {}
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    hits = d?.results?.[0]?.results || [];
    if (opts.memo) opts.memo.set(q, hits);
    }
    if (!hits.length) return null;

    const want = cardName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // opts.askOnly (Roy, 2026-10-10): the second pass, asked only when the
    // market pass found nothing — products with listings and NO market price
    // (no recent sales), priced at the cheapest listing and labelled an ask.
    // Charizard ☆ δ: product 84198, no marketPrice, lowestPrice $18,500.
    const priced = h => opts.askOnly
      ? !(h.marketPrice > 0) && h.lowestPrice > 0 && h.lowestPrice <= 50000
      : h.marketPrice > 0 && h.marketPrice <= 50000;
    const priceOf = h => opts.askOnly ? { price: h.lowestPrice, basis: 'ask' } : { price: h.marketPrice, basis: 'market' };
    const usable = hits.filter(h => {
      if (!priced(h)) return false;
      if (opts.reprint && String(h.setName || '').toLowerCase() !== opts.reprint.tcgSet.toLowerCase()) return false;
      if (!opts.reprint && opts.setId && !sameTcgSet(h.setName, opts.setId, setName)) return false;
      const got = String(h.productName || '').toLowerCase();
      if (tcgSealedProduct(h.productName, cardName)) return false;
      // A stamped product ([Staff], (Prerelease)) is another card unless TCGdex
      // maps ours to that very product (cardnumber.stampedNotOurs, 2026-10-09).
      if (stampedNotOurs(h.productName, h.productId, opts.tcgdexIds)) return false;
      const gotClean = got.replace(/[^a-z0-9]/g, '');
      return gotClean.includes(want.slice(0, Math.min(6, want.length)))
          || want.includes(gotClean.slice(0, Math.min(6, gotClean.length)));
    });
    if (!usable.length) return null;

    // ══ Match on the COLLECTOR NUMBER, not just the name ══
    // A chase card's name repeats across several numbers in the same set —
    // "Mega Charizard X ex" appears at #013, #109, #125 and #130 in
    // Phantasmal Flames at wildly different prices. Matching by name alone
    // gave every variant the same wrong price.
    let pool = usable;
    if (wantNum) {
      const exact = usable.filter(h => tcgHitNumber(h) === wantNum);
      if (exact.length) {
        const hit = exact[0];
        return {
          price: priceOf(hit).price, basis: priceOf(hit).basis,
          low: hit.lowestPrice || null,
          source: 'tcgplayer_market',
          matched: hit.productName,
          matchedNumber: tcgHitNumber(hit),
          matchedBy: 'number',
          set: hit.setName,
          productId: hit.productId ?? null, listings: hit.totalListings ?? null
        };
      }
      // The number is known but nothing matched it. A hit that states
      // ANOTHER number is another card, always (TASK-product-matching,
      // 2026-10-09). Until then both fallbacks below could take it: Skyridge
      // Gengar H09 took Gengar (10), Piplup RC6 took Piplup 33, Garchomp
      // 146 / 228 / 247 all took Garchomp 114 — 53 products on 106 cards.
      // Only a hit stating NO readable number is left to them; none, and the
      // card has no product. An unmatched card is honest; a wrong one is a
      // wrong price.
      pool = usable.filter(h => tcgHitNumber(h) === null);
      if (!pool.length) return null;
      // Try rarity as a tiebreaker before giving up — a Rare Secret and a
      // Rare Ultra with the same name are different TCGPlayer products.
      const named = pool.filter(h => {
        const g = String(h.productName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return g.startsWith(want.slice(0, Math.min(8, want.length)));
      });

      if (named.length > 1 && cardRarity) {
        const wantR = String(cardRarity).toLowerCase().replace(/[^a-z]/g, '');
        const byRarity = named.filter(h => {
          const ca = h.customAttributes || {};
          const hr = String(ca.rarityDbName || ca.rarity || ca.Rarity || '')
            .toLowerCase().replace(/[^a-z]/g, '');
          if (!hr) return false;
          return hr === wantR || hr.includes(wantR) || wantR.includes(hr);
        });
        if (byRarity.length === 1) {
          const hit = byRarity[0];
          return {
            price: priceOf(hit).price, basis: priceOf(hit).basis,
            low: hit.lowestPrice || null,
            source: 'tcgplayer_market',
            matched: hit.productName,
            matchedNumber: tcgHitNumber(hit),
            matchedBy: 'rarity',
            set: hit.setName,
            productId: hit.productId ?? null, listings: hit.totalListings ?? null
          };
        }
      }

      // Still ambiguous — refuse. A wrong price is worse than none.
      if (named.length > 1) return null;
    }

    // Only one candidate stating no number, or no number to match on.
    const hit = pool[0];
    return {
      price: priceOf(hit).price, basis: priceOf(hit).basis,
      low: hit.lowestPrice || null,
      source: 'tcgplayer_market',
      matched: hit.productName,
      matchedNumber: tcgHitNumber(hit),
      matchedBy: wantNum ? 'name_unique' : 'name_only',
      set: hit.setName,
      productId: hit.productId ?? null, listings: hit.totalListings ?? null
    };
  } catch (e) { return null; }
}


// ── 2. (Cardmarket name-only scrape deleted 2026-09-29, T9 — see safePriceFor)

// ── 3. YAHOO AUCTIONS JAPAN — the real market for Japanese singles.
//     Far more JP price signal than eBay will ever have.

// -- JP LISTING FILTER ----------------------------------------
// Lives in jpfilter.js so server.js applies exactly the same rules to the
// listings it displays as this file applies to the prices it stores. A lot
// excluded from a median must never surface as a single card for sale.
//
// DO NOT re-inline this. A downloaded ingest.js reverted it once already and
// three nights of `refresh` silently re-contaminated the database with the
// old always-keep filter. If `require('./jpfilter')` is missing from this
// file, the fix is not in place -- run `node ingest.js filtertest` first.
const srank = require('./sourcerank');
// A refresh that prices nothing for a whole set says so (TASK T2, 2026-10-02).
const setyield = require('./setyield');
const {
  usdOfYen, YAHOO_MAX_SPREAD,
  JP_LOT_WORDS, JP_GRADED_WORDS, JP_CARD_CATEGORY, JP_SEALED_CATEGORIES,
  jpTitleIsSingleRaw, jpItemIsCardCategory, jpTitleMentionsCard,
  jpTitleMatchesNumber, jpItemIsSingleCard, yahooItemToListing
} = require('./jpfilter');


// opts.withItems -- also return the surviving listings, cheapest first. The
// listings endpoint needs the items themselves, not just the median; this
// function already computes them and used to throw them away.
// opts.setTotal / opts.setId -- REQUIRED to tell one card from another. See
// jpTitleMatchesNumber: without setTotal, "SM9 105/095" matches card #105 of
// any set.
// The median rule yahooJapanSearch applies to the base printing, for a
// mirror group's yen: >= 3 sales, 1.5 IQR fence, and the spread refusal.
function yahooMedianYen(yenIn) {
  const yen = yenIn.slice().sort((a, b) => a - b);
  if (yen.length < 3) return null;
  const q1 = yen[Math.floor(yen.length * 0.25)];
  const q3 = yen[Math.floor(yen.length * 0.75)];
  const iqr = q3 - q1;
  const clean = yen.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  const use = clean.length >= 3 ? clean : yen;
  const lo = use[0], hi = use[use.length - 1];
  if (lo > 0 && hi / lo > YAHOO_MAX_SPREAD) return null;
  return { medianYen: use[Math.floor(use.length / 2)], lo, hi, use };
}

// The yen rate for Yahoo, LIVE and recorded on every row (Roy, 2026-10-10;
// it was a constant 157). Without a live rate nothing is priced — the run says
// so once — so no row is ever written at fx.js's pinned fallback.
let _yahooRateWarned = false;
async function yahooRate() {
  const jpy = await fx.usdPer('JPY');
  if (jpy.stale) {
    if (!_yahooRateWarned) { _yahooRateWarned = true; console.log('\n  Yahoo NOT priced: no live yen rate (fx.js answered its pinned fallback). Nothing written.\n'); }
    return null;
  }
  return jpy;
}
const fxMetaOf = jpy => ({ currency: 'JPY', fxRate: jpy.rate, fxDate: jpy.date, fxSource: jpy.source });

async function yahooJapanSearch(cardName, cardNumber, opts = {}) {
  const jpy = await yahooRate();
  if (!jpy) { yahooSaw('no live yen rate'); return null; }
  await hostDelay('yahoo', 3000);
  const cardCtx = { name: cardName, number: cardNumber,
                    setTotal: opts.setTotal, setId: opts.setId,
                    setYear: opts.setYear || null, lang: opts.lang || null,
                    nameEn: opts.nameEn || null,
                    printings: opts.printings || null };

  // Yahoo embeds the whole search result as JSON in __NEXT_DATA__.
  // Far more reliable than parsing their (frequently changing) markup.
  //
  // IMPORTANT: do NOT send auccat. Yahoo rejects category-filtered
  // searches from non-Japanese IPs with
  // "検索結果が表示できない条件が含まれています" and returns 0 results.
  // "ポケモンカード" narrows a site-wide OR match down to the card market.
  // Without it, リザードン alone returns 39,269 results across T-shirts,
  // figures and snack-food stickers.
  const q = `ポケモンカード ${cardName} ${cardNumber || ''}`.trim();
  // The LIVE search is PARKED (Roy, 2026-10-10): kept, unreachable. Its page
  // has carried no usable data (no __NEXT_DATA__) on every check — 2026-08-26,
  // 2026-10-02, 2026-10-10 — yet it was asked whenever the closed search gave
  // fewer than 3 usable results: 636 times on the night of 2026-10-10 (plus some
  // of that night's 569 HTTP 404s), ~1.2 s each measured, ~13 minutes of the
  // nightly's 4-hour budget for nothing. Were it ever to answer, its median
  // would be of ACTIVE listings — an asking price (feed 'live', basis 'ask').
  // Turning it back on needs the page to carry data again: probe it first.
  const YAHOO_LIVE_PRICES = false;
  const urls = [
    // sold/closed auctions = real transaction prices
    'https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=' + encodeURIComponent(q) + '&n=50',
    // live listings — parked (above)
    ...(YAHOO_LIVE_PRICES ? ['https://auctions.yahoo.co.jp/search/search?p=' + encodeURIComponent(q) + '&n=50'] : [])
  ];

  // Which feed a median is of, on every row (Roy, 2026-10-10): CLOSED = ended
  // auctions with a winning bid — completed sales, the market price; LIVE =
  // active listings — current bids and buy-now asks, an ASKING price (basis
  // 'ask': marked, fed to nothing). The live page has carried no __NEXT_DATA__
  // since at least 2026-08-26 (re-checked 2026-10-10), so the live branch
  // prices nothing today; if it ever answers again its rows say what they are.
  for (const url of urls) {
    const feed = /closedsearch/.test(url) ? { feed: 'closed' } : { feed: 'live', basis: 'ask' };
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA_SAFE,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3'
        }
      });
      if (!r.ok) { yahooSaw('HTTP ' + r.status); continue; }
      const html = await r.text();

      // Pull the embedded Next.js payload
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) { yahooSaw('200, no __NEXT_DATA__'); continue; }

      let data;
      try { data = JSON.parse(m[1]); } catch { yahooSaw('200, payload not JSON'); continue; }

      const listing = data?.props?.pageProps?.initialState?.search?.items?.listing;
      if (!listing) { yahooSaw('200, no listing block'); continue; }
      yahooSaw('200, answered');

      // Yahoo hands us aggregate statistics directly
      const stats = listing.metadata?.statistics;
      const items = listing.items || [];

      // Keep only listings that look like a single raw card
      // Keep only listings that are a single raw copy OF THIS CARD.
      // Title alone is not enough -- see jpItemIsSingleCard.
      // ...and not a different PRINTING of it. The listings path has run
      // cardmatch.printingConflict on Yahoo since 2026-09-22 (Korean prints
      // share Japanese set codes and numbering); this, the path that STORES
      // a price, never did — T9, 2026-09-29, the T6 shape again. Same options
      // as server.js sourceYahoo: Japanese is written in CJK, so script alone
      // is not language evidence; hangul and 韓国版 are.
      const singles = items.filter(it => jpItemIsSingleCard(it, cardCtx)
        && !cmatch.printingConflict(it.title || '', cardCtx,
             { cjkIsChinese: false, scriptIsLanguageEvidence: false }));
      const rejected = items.length - singles.length;

      const pricedAll = singles
        .map(it => ({ it, yen: parseInt(it.price || it.bidOrBuy || it.currentPrice || 0),
                      claim: cmatch.printingClaim(it.title || '', cardCtx) }))
        .filter(x => x.yen >= 100 && x.yen <= 2000000);

      // ── Printing (TASK T4, 2026-09-29) ──
      // The stored median had no printing, so a Master Ball mirror sale
      // (JP mirrors: $0.51 base against $38.09 Master Ball) landed in the
      // BASE price — the collision the reprint work started from. A title
      // that STATES another printing (a reverse or a mirror pattern) is
      // taken out of the base median and given a median of its own, written
      // with price_history.variant; silence stays in the base, as it does on
      // the listings path. The headline readers already exclude variant
      // rows (printsql.basePrintingSql).
      const isOther = x => x.claim.stated && /^reverse/.test(x.claim.key);
      const priced = pricedAll.filter(x => !isOther(x));
      const otherGroups = {};
      for (const x of pricedAll.filter(isOther)) (otherGroups[x.claim.key] = otherGroups[x.claim.key] || []).push(x.yen);
      const yen = priced.map(x => x.yen);
      const variantPrices = Object.entries(otherGroups).map(([variant, ys]) => {
        const m = yahooMedianYen(ys);
        return m ? { variant, price: usdOfYen(m.medianYen, jpy), priceYen: m.medianYen, fx: Object.assign(fxMetaOf(jpy), feed),
                     count: m.use.length, source: `yahoojp_${m.use.length}` } : null;
      }).filter(Boolean);

      if (yen.length >= 3) {
        yen.sort((a, b) => a - b);
        const q1 = yen[Math.floor(yen.length * 0.25)];
        const q3 = yen[Math.floor(yen.length * 0.75)];
        const iqr = q3 - q1;
        const clean = yen.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
        const use = clean.length >= 3 ? clean : yen;
        const medianYen = use[Math.floor(use.length / 2)];
        const lo = use[0], hi = use[use.length - 1];

        if (opts.explain) {
          console.log(`  survivors (${priced.length}):`);
          for (const x of priced.slice().sort((a,b)=>a.yen-b.yen))
            console.log(`    ¥${String(x.yen).padEnd(8)} ${String(x.it.title).slice(0,60)}`);
        }

        // A surviving sample that still spans two orders of magnitude is not
        // one product. アサナン M2a 084/193 came back as ¥136, ¥90,000 and
        // ¥100,000 -- every one naming the right card in the right set, so no
        // title rule can separate them. The median of that is ¥90,000 for a
        // Common. When the sample disagrees with itself this violently we do
        // not know the price, and saying nothing beats saying $573.
        if (lo > 0 && hi / lo > YAHOO_MAX_SPREAD) {
          if (opts.explain)
            console.log(`  spread ¥${lo}-¥${hi} = ${(hi/lo).toFixed(0)}x -- refusing to guess`);
          continue;
        }

        const out = {
          price: usdOfYen(medianYen, jpy),
          priceYen: medianYen,
          // written to source_meta by the writers: the yen, the count and the rate
          meta: Object.assign({ priceYen: medianYen, count: use.length }, fxMetaOf(jpy), feed),
          count: use.length,
          rejected: rejected,
          source: `yahoojp_${use.length}`,
          currency: 'JPY->USD',
          // The other printings seen, each its own median under the same
          // rules (>= 3 sales, IQR, the spread refusal). Also reported when
          // too thin to price, so a run says what it set aside.
          printingsExcluded: pricedAll.length - priced.length,
          variantPrices
        };
        if (opts.withItems) {
          out.items = priced
            .filter(x => x.yen >= lo && x.yen <= hi)
            .sort((a, b) => a.yen - b.yen)
            .map(x => yahooItemToListing(x.it, x.yen, jpy));
        }
        return out;
      }

      // No base sample, but a mirror has one. Measured 2026-09-29 on
      // ja-SV2a-001 フシギダネ (Common): ALL three surviving sales were Master
      // Ball mirrors at ¥2,750-4,000, which the old median stored as the
      // card's base price (~$22). Now: no base price, and the mirror's own.
      if (variantPrices.length) {
        return { price: null, count: 0, rejected, source: null, currency: 'JPY->USD',
                 printingsExcluded: pricedAll.length - priced.length, variantPrices };
      }

      // Yahoo's own average — only trust it with a real sample behind it.
      // A single ¥56 listing is noise, not a market price.
      // Yahoo's own average includes lots and slabs we cannot filter,
      // so only fall back to it when item detail is unavailable entirely.
      const avail = listing.totalResultsAvailable || 0;
      if (stats && stats.avgPrice >= 300 && avail >= 8 && items.length === 0) {
        return {
          price: usdOfYen(stats.avgPrice, jpy),
          priceYen: stats.avgPrice,
          meta: Object.assign({ priceYen: stats.avgPrice, count: avail }, fxMetaOf(jpy), feed),
          count: avail,
          source: `yahoojp_avg_${avail}`,
          currency: 'JPY->USD'
        };
      }
    } catch (e) { yahooSaw('threw: ' + String(e && (e.cause && e.cause.code || e.message) || e).slice(0, 40)); }
  }
  return null;
}

// What Yahoo actually answered this run, by kind (TASK T2, 2026-10-02).
// Every refusal above is a `continue`, and a card Yahoo refused looked
// exactly like a card nobody sells: on 1 Oct the ja refresh priced 110 of
// the first 1,200 cards and then NOTHING for 1,500 in a row, and the log
// could not say whether Yahoo had stopped answering. Printed at the end
// of each refresh.
const YAHOO_SAW = {};
function yahooSaw(kind) { YAHOO_SAW[kind] = (YAHOO_SAW[kind] || 0) + 1; }
function yahooSawSummary() {
  const e = Object.entries(YAHOO_SAW);
  if (!e.length) return null;
  return e.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} x ${k}`).join(', ');
}


// ── 4. (eBay Browse fallback deleted 2026-09-29, T9 — see safePriceFor)

// ── ONE PRODUCT ANSWERING FOR SEVERAL CARDS (pricedupe.js, Roy 2026-10-09) ──
// Rejects a price when an earlier card in the run got the same price for the
// same product id — the mismatched-product bug — or, with no product id, the
// same exact price from the same source on 5+ cards. It replaced
// looksLikeJunk, whose 1.5%-of-the-last-12 test measured the run's value
// ordering: on 08/10 it discarded 1,285 genuine prices and let through five
// real duplicates (PROGRESS 2026-10-09). One guard per ingest command.
const pricedupe = require('./pricedupe');
const PRICE_GUARD = pricedupe.createGuard();

// Set context for the JP listing filter, derived from a cards row. If
// set_total is missing the filter falls back to demanding the set code in the
// title -- it does NOT wave the check through.
function jpCtx(card) {
  return {
    setTotal: card.set_total || null,
    setId: card.set_api_id || setIdFromCardId(card.api_card_id) || null,
    // The printing gate's two inputs. Absent, cardmatch skips the year and
    // language checks without a word — the dead-year-gate failure.
    setYear: card.set_release ? new Date(card.set_release).getUTCFullYear() : null,
    lang: cmatch.languageFromCardId(card.api_card_id),
    // T4: which printings exist, so printingClaim can read "キラ" on a card
    // with no holo as its reverse. Absent (not yet manifested) is fine: a
    // stated mirror is still kept out of the base median.
    printings: card.variants && Array.isArray(card.variants.printings)
      ? card.variants.printings.map(p => p.key) : null,
    nameEn: card.name_en || null
  };
}


// ==============================================================
// PREFLIGHT -- refuse to price with a filter that is not in place.
//
// On 2026-08-21 a replacement ingest.js silently reverted the JP filter fix
// (no require of ./jpfilter, the old always-keep title default). Three
// nights of `refresh` then rewrote good rows with bad ones -- ja-S12a-105
// went to $1,294.90, worse than the original bug. Nothing complained,
// because a broken filter looks exactly like a working one from outside.
//
// So: before any run that WRITES prices, the filter must pass its own tests.
// ==============================================================
function preflightFilter() {
  let ok = false;
  try {
    ok = require('./jptest').filterTest();
  } catch (e) {
    console.log('\n  FATAL: cannot load ./jptest or ./jpfilter -- ' + e.message);
    console.log('  ingest.js has probably been replaced with a copy that inlines');
    console.log('  the old filter. Do not price until this is restored.\n');
    return false;
  }
  if (!ok) console.log('  Refusing to write prices with a failing filter.\n');
  return ok;
}

// node ingest.js ytest <cardId|cardName> [number]
// One live Yahoo search, showing what survived the filter and why.
async function yahooTest(arg, cardNumber) {
  if (!arg) { console.log('  usage: node ingest.js ytest <cardId|cardName> [number]'); return; }
  let name = arg, number = cardNumber, ctx = {};
  if (/^(en|ja|zh-tw|zh-cn)-/.test(arg) && db) {
    const r = await db.query(
      'SELECT api_card_id, name, name_en, number, set_api_id, set_total, set_release, rarity, variants FROM cards WHERE api_card_id=$1', [arg]);
    if (!r.rows.length) { console.log('  no such card: ' + arg); return; }
    const c = r.rows[0];
    name = c.name; number = c.number;
    ctx = jpCtx(c);
    console.log('\n  ' + arg + '  ' + c.name + '  #' + c.number + '  ' + (c.rarity || '') +
                '  (set total ' + (c.set_total || '?') + ')');
  }
  console.log('\n  YAHOO PROBE -- ' + name + ' ' + (number || '') +
              '  [set ' + (ctx.setId || '-') + ' / total ' + (ctx.setTotal || '-') + ']\n');
  const r = await yahooJapanSearch(name, number, Object.assign({}, ctx, { withItems: true, explain: true }));
  if (!r) { console.log('  no usable result (nothing survived the filter)\n'); return; }
  console.log('  median   ' + (r.price ? '$' + r.price + '  (JPY ' + r.priceYen + ')'
                                     : 'none -- no base-printing sample (see other printings)'));
  console.log('  kept     ' + r.count);
  console.log('  rejected ' + r.rejected);
  console.log('  source   ' + r.source);
  console.log('  other printings set aside  ' + (r.printingsExcluded || 0));
  for (const v of (r.variantPrices || []))
    console.log('    ' + v.variant.padEnd(20) + ' $' + v.price + '  (JPY ' + v.priceYen + ', ' + v.count + ' sales) -- its own row');
  console.log('');
  for (const l of (r.items || []).slice(0, 10))
    console.log('    $' + String(l.price).padEnd(9) + ' ' + String(l.title).slice(0, 54));
  console.log('');
}

// ==============================================================
// node ingest.js jpcheck ja [--n=20] [--set=S12a] [--min=50]
// Re-runs the CURRENT filter over stored prices and shows stored vs
// recomputed. Use it to prove a filter change keeps the good rows, not
// only that it kills the bad ones.
// ==============================================================
// ══════════════════════════════════════════════════════════════
// node ingest.js jpcheck ja [--n=20] [--set=S12a] [--min=50]
//
// Re-derives each stored price FROM THE SOURCE IT CAME FROM and reports
// whether the two agree.
//
// It used to check everything against Yahoo. Yuyu-tei prices are shop
// prices for cards Yahoo does not carry — a ¥30 common has no single-card
// auction — so a perfectly good Yuyu-tei price came back as
// "DROPPED -- no valid comparable". A 25-card sample returned 20 drops and
// 5 checks, and every one of those drops read like a finding. It was not
// one: it was the tool having no path to the data.
//
// Same failure as `pricecheck ja` printing an empty table. A tool that
// cannot check something must say so in those words, and must never let
// "cannot check" render as "dropped".
// ══════════════════════════════════════════════════════════════
async function jpCheck(lang, ...flags) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  if (flags.includes('--both')) return jpCheckBoth(lang || 'ja', ...flags);
  lang = lang || 'ja';
  const n     = parseInt((flags.find(f => f.startsWith('--n=')) || '--n=20').slice(4)) || 20;
  const setId = (flags.find(f => f.startsWith('--set=')) || '').replace('--set=', '') || null;
  const min   = parseFloat((flags.find(f => f.startsWith('--min=')) || '--min=0').slice(6)) || 0;

  const conds = ['c.api_card_id LIKE $1'];
  const params = [lang + '-%'];
  if (setId) { conds.push('c.set_api_id = $' + (params.length + 1)); params.push(setId); }

  const rows = await db.query(
    'SELECT c.api_card_id, c.name, c.number, c.rarity, c.set_api_id, c.set_total, c.set_release, p.price_usd, p.source ' +
    'FROM cards c JOIN LATERAL (SELECT price_usd, source FROM price_history ph ' +
    ' WHERE ph.card_api_id = c.api_card_id AND ph.grade IS NULL ' +
    '   AND ph.source NOT LIKE \'estimate%\' ' +
    ' ORDER BY recorded_at DESC LIMIT 1) p ON true ' +
    'WHERE ' + conds.join(' AND ') + ' AND p.price_usd >= ' + min +
    ' ORDER BY random() LIMIT ' + n, params);

  console.log('\n' + '='.repeat(92));
  console.log('  JP PRICE RECHECK -- ' + lang + (setId ? ' / ' + setId : '') + '   ' + rows.rows.length + ' cards');
  console.log('  Each price is re-derived from the source that produced it.');
  console.log('='.repeat(92) + '\n');
  console.log('  card                  source              stored     rechecked    verdict');
  console.log('  ' + '-'.repeat(90));

  // Yuyu-tei serves a whole set per fetch, so cache by set rather than
  // re-fetching per card.
  const yt = require('./yuyutei');
  let ytIndex = null;
  const ytSetCache = new Map();
  async function ytEntriesFor(setApiId) {
    if (ytSetCache.has(setApiId)) return ytSetCache.get(setApiId);
    if (!ytIndex) { try { ytIndex = await yt.fetchSetIndex(); } catch { ytIndex = new Map(); } }
    const hit = ytIndex.get(String(setApiId).toUpperCase());
    let entries = null;
    if (hit) { try { entries = await yt.fetchSet(hit.code); } catch { entries = null; } }
    ytSetCache.set(setApiId, entries);
    return entries;
  }

  const tally = { agree: 0, differs: 0, gone: 0, nopath: 0 };

  for (const c of rows.rows) {
    const stored = parseFloat(c.price_usd);
    const src = String(c.source || '');
    let rechecked = null, verdict = null, checkedAgainst = null;

    if (/^yahoojp/.test(src)) {
      checkedAgainst = 'Yahoo';
      const r = await yahooJapanSearch(c.name, c.number, jpCtx(c));
      if (r && r.price) rechecked = r.price;   // price null = only another printing had a sample
      // Yahoo genuinely losing a listing is a real signal for a Yahoo price:
      // it means the comparable that justified this number is gone.
      else verdict = 'no Yahoo comparable now — this price is unsupported';
    } else if (src === 'yuyutei_shop') {
      checkedAgainst = 'Yuyu-tei';
      const entries = await ytEntriesFor(c.set_api_id);
      if (!entries) {
        verdict = 'CANNOT CHECK — Yuyu-tei does not carry this set';
      } else {
        const k = String(c.number).replace(/^0+/, '') || '0';
        const cands = entries.filter(e =>
          (String(e.number).replace(/^0+/, '') || '0') === k && yt.matchesOurCard(e, c));
        const pick = yt.pickVariant(cands, c.name);
        if (pick) { const jpy = await yahooRate(); rechecked = jpy ? usdOfYen(pick.yen, jpy) : null; }
        else verdict = 'no longer listed by Yuyu-tei (sold out or delisted)';
      }
    } else {
      // tcgplayer_*, cardmarket_*, ebay_* — no Japanese verification path
      // exists. Say that, rather than running a check that must fail.
      checkedAgainst = '—';
      verdict = 'CANNOT CHECK — no verification path for source "' + src + '"';
      tally.nopath++;
    }

    if (rechecked != null) {
      const ratio = rechecked / stored;
      if (ratio > 0.6 && ratio < 1.67) { verdict = 'agrees'; tally.agree++; }
      else { verdict = 'DIFFERS — now ' + (ratio * 100).toFixed(0) + '% of stored'; tally.differs++; }
    } else if (verdict && verdict.startsWith('CANNOT CHECK')) {
      if (!/no verification path/.test(verdict)) tally.nopath++;
    } else if (verdict) {
      tally.gone++;
    }

    console.log('  ' + String(c.api_card_id).padEnd(22) + String(src).padEnd(20) +
      '$' + String(stored.toFixed(2)).padEnd(10) +
      (rechecked != null ? '$' + rechecked.toFixed(2) : '—').padEnd(13) + verdict);
  }

  console.log('  ' + '-'.repeat(90));
  console.log('\n  ' + rows.rows.length + ' sampled');
  console.log('    ' + String(tally.agree).padStart(4) + '  agree with their own source');
  console.log('    ' + String(tally.differs).padStart(4) + '  differ — worth investigating');
  console.log('    ' + String(tally.gone).padStart(4) + '  comparable has disappeared since');
  console.log('    ' + String(tally.nopath).padStart(4) + '  CANNOT CHECK — no path for that source, not a finding');
  const checkable = tally.agree + tally.differs;
  if (checkable) console.log('\n  Of ' + checkable + ' checkable, ' +
    Math.round(100 * tally.agree / checkable) + '% agree.');
  console.log('');
}

// ══════════════════════════════════════════════════════════════
// node ingest.js jpcheck ja --both [--min-ratio=5] [--json=out.json]
//
// The cards holding BOTH a base Yahoo median and a Yuyu-tei price, where
// the two disagree by more than --min-ratio (either direction). Re-derives
// each side from its source with the CURRENT filter — the T4 printing split
// included, so a stored median that was really Master Ball mirror sales
// shows up as "base none now, mirror $X".
//
// Read-only. It classifies; jppurge / a re-price is a separate decision.
// Measured 2026-09-29: 191 such cards, 148 more than 5x apart, 54 > 20x,
// every Yahoo row written before the printing split (28ea4be).
// ══════════════════════════════════════════════════════════════
async function jpCheckBoth(lang, ...flags) {
  const minRatio = parseFloat((flags.find(f => f.startsWith('--min-ratio=')) || '--min-ratio=5').slice(12)) || 5;
  const jsonOut  = (flags.find(f => f.startsWith('--json=')) || '').slice(7) || null;
  const base = require('./printsql').basePrintingSql;
  const rows = (await db.query(
    `WITH y AS (SELECT DISTINCT ON (card_api_id) card_api_id, price_usd, source, recorded_at FROM price_history
        WHERE card_api_id LIKE $1 AND source LIKE 'yahoojp%' AND grade IS NULL AND COALESCE(variant,'') NOT LIKE 'reverse%'
        ORDER BY card_api_id, recorded_at DESC),
      t AS (SELECT DISTINCT ON (card_api_id) card_api_id, price_usd FROM price_history
        WHERE card_api_id LIKE $1 AND source = 'yuyutei_shop' AND grade IS NULL AND COALESCE(variant,'') NOT LIKE 'reverse%'
        ORDER BY card_api_id, recorded_at DESC),
      h AS (SELECT DISTINCT ON (ph.card_api_id) ph.card_api_id, ph.source FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
        WHERE ph.card_api_id LIKE $1 AND ph.grade IS NULL AND ph.source NOT LIKE 'estimate%' AND ${base('ph', 'c')}
        ORDER BY ph.card_api_id, ph.recorded_at DESC)
     SELECT c.api_card_id, c.name, c.name_en, c.number, c.rarity, c.set_api_id, c.set_total, c.set_release, c.variants,
            y.price_usd AS yp, y.source AS ysrc, y.recorded_at AS yat, t.price_usd AS tp, h.source AS headline
       FROM y JOIN t USING (card_api_id) JOIN cards c ON c.api_card_id = y.card_api_id
       LEFT JOIN h ON h.card_api_id = y.card_api_id`, [lang + '-%'])).rows
    .map(r => Object.assign(r, { yp: +r.yp, tp: +r.tp }))
    .filter(r => Math.max(r.yp / r.tp, r.tp / r.yp) > minRatio)
    .sort((a, b) => (b.yp / b.tp) - (a.yp / a.tp));

  console.log('\n' + '='.repeat(100));
  console.log(`  JP BOTH-SOURCE RECHECK -- ${lang}   ${rows.length} cards whose Yahoo and Yuyu-tei base differ > ${minRatio}x`);
  console.log('  Each side re-derived from its own source, current filter (printing split included). Nothing written.');
  console.log('='.repeat(100) + '\n');

  const yt = require('./yuyutei');
  let ytIndex = null; const ytSetCache = new Map();
  async function ytEntriesFor(setApiId) {
    if (ytSetCache.has(setApiId)) return ytSetCache.get(setApiId);
    if (!ytIndex) { try { ytIndex = await yt.fetchSetIndex(); } catch { ytIndex = new Map(); } }
    const hit = ytIndex.get(String(setApiId).toUpperCase());
    let entries = null;
    if (hit) { try { entries = await yt.fetchSet(hit.code); } catch { entries = null; } }
    ytSetCache.set(setApiId, entries);
    return entries;
  }

  const out = [];
  const tally = {};
  for (const c of rows) {
    const y = await yahooJapanSearch(c.name, c.number, jpCtx(c));
    const yNow = y && y.price ? y.price : null;
    const mirrors = (y && y.variantPrices) || [];
    let tNow = null;
    const entries = await ytEntriesFor(c.set_api_id);
    if (entries) {
      const k = String(c.number).replace(/^0+/, '') || '0';
      const pick = yt.pickVariant(entries.filter(e =>
        (String(e.number).replace(/^0+/, '') || '0') === k && yt.matchesOurCard(e, c)), c.name);
      if (pick) { const jpy = await yahooRate(); tNow = jpy ? usdOfYen(pick.yen, jpy) : null; }
    }
    const near = (a, b) => a && b && a / b > 0.6 && a / b < 1.67;
    let cls;
    if (yNow == null && mirrors.length) cls = 'MIRROR — base none now, only another printing sold';
    else if (yNow == null)             cls = 'GONE — no Yahoo base comparable now';
    // "Agrees" is jpcheck's own 0.6-1.67 band, never "under minRatio": the
    // first run called a 4.99x pair (ja-CP5-38, $114.65 vs $571.97) agreed.
    else if (tNow && near(yNow, tNow)) cls = 'RESOLVED — Yahoo now agrees with Yuyu-tei';
    else if (near(yNow, c.yp) && tNow)  cls = 'HOLDS — Yahoo reproduces, still ' +
                                              Math.max(yNow / tNow, tNow / yNow).toFixed(1) + 'x from Yuyu-tei';
    else if (!near(yNow, c.yp))         cls = 'MOVED — Yahoo now differs from what we stored';
    else                                cls = 'HOLDS — Yahoo reproduces (Yuyu-tei no longer lists it)';
    const key = cls.split(' ')[0];
    tally[key] = (tally[key] || 0) + 1;
    out.push({ id: c.api_card_id, name: c.name, rarity: c.rarity, headline: c.headline,
               storedYahoo: c.yp, storedYahooSrc: c.ysrc, storedYuyutei: c.tp,
               yahooNow: yNow, yahooNowN: y && y.count, mirrorsNow: mirrors, yuyuteiNow: tNow, cls });
    console.log('  ' + c.api_card_id.padEnd(16) + String(c.rarity || '').slice(0, 6).padEnd(7) +
      ('Y $' + c.yp.toFixed(2)).padEnd(12) + ('T $' + c.tp.toFixed(2)).padEnd(11) +
      ('Ynow ' + (yNow != null ? '$' + yNow.toFixed(2) : '—')).padEnd(14) +
      ('Tnow ' + (tNow != null ? '$' + tNow.toFixed(2) : '—')).padEnd(13) +
      (mirrors.length ? '[' + mirrors.map(m => m.variant.replace('reverse-', '') + ' $' + m.price).join(', ') + '] ' : '') + cls);
  }

  console.log('\n  ' + rows.length + ' cards');
  for (const [k, v] of Object.entries(tally)) console.log('    ' + String(v).padStart(4) + '  ' + k);
  console.log('    (' + rows.filter(r => /^yahoojp/.test(r.headline || '')).length +
              ' of them show the Yahoo row as the card\'s headline price)\n');
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1)); console.log('  wrote ' + jsonOut + '\n'); }
}

// ==============================================================
// node ingest.js jppurge [--delete] [--since=YYYY-MM-DD] [--lang=ja]
// Backs up then removes yahoo-sourced prices. Use --since to remove only
// rows written by a run that used a broken filter.
// ==============================================================
async function jpPurge(...flags) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  const doDelete = flags.includes('--delete');
  const since = (flags.find(f => f.startsWith('--since=')) || '').replace('--since=', '') || null;
  const lang  = (flags.find(f => f.startsWith('--lang=')) || '').replace('--lang=', '') || null;

  const conds = ["source LIKE 'yahoojp%'"];
  if (since) conds.push("recorded_at >= '" + since + "'");
  if (lang)  conds.push("card_api_id LIKE '" + lang + "-%'");
  const where = conds.join(' AND ');

  console.log('\n' + '='.repeat(72));
  console.log('  PURGE YAHOO-SOURCED PRICES' + (since ? '  since ' + since : ''));
  console.log('='.repeat(72) + '\n');

  const st = await db.query(
    'SELECT COUNT(*) rows, COUNT(DISTINCT card_api_id) cards, MIN(recorded_at)::date oldest, ' +
    'MAX(recorded_at)::date newest FROM price_history WHERE ' + where);
  const r0 = st.rows[0];
  console.log('  ' + r0.rows + ' rows across ' + r0.cards + ' cards   ' + r0.oldest + ' .. ' + r0.newest);

  if (!doDelete) { console.log('\n  Nothing written. Re-run with --delete to back up and purge.\n'); return; }

  const all = await db.query(
    'SELECT id, card_api_id, price_usd, source, marketplace, condition, recorded_at ' +
    'FROM price_history WHERE ' + where);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const file = 'yahoojp-purged-' + stamp + '.json';
  fs.writeFileSync(file, JSON.stringify(all.rows, null, 1));
  console.log('\n  Backed up ' + all.rows.length + ' rows to ' + file);

  const del = await db.query('DELETE FROM price_history WHERE ' + where);
  console.log('  Deleted ' + del.rowCount + ' rows\n');
}

// ══════════════════════════════════════════════════════════════
// YUYU-TEI SHOP PRICES — node ingest.js yuyutei [--set=SV8a] [--dry]
//                                               [--max=N] [--all]
//
// Yahoo Auctions cannot get Japanese coverage past ~15%: most cheap cards
// never appear as a single-card auction. Yuyu-tei lists a price for
// nearly everything it stocks, which is exactly the missing population.
//
// These are ASKING prices and are stored as `yuyutei_shop`, never
// `yuyutei`, so the difference reaches the UI. Measured against our Yahoo
// medians on 94 overlapping SV8a cards the median ratio is 1.40x.
//
// By default only cards with NO real price are filled, so a genuine
// auction median is never overwritten by a shop asking price. --all
// prices every card in the set.
// ══════════════════════════════════════════════════════════════
async function yuyuteiIngest(...flags) {
  if (!db) { console.log('  DATABASE_URL required'); process.exitCode = 1; return; }
  const yt = require('./yuyutei');

  const dry    = flags.includes('--dry');
  const all    = flags.includes('--all');
  // --force bypasses the source-confidence gate, for a deliberate rebuild
  // (e.g. straight after a jppurge). Never use it in a scheduled run.
  const force  = flags.includes('--force');
  const setArg = (flags.find(f => String(f).startsWith('--set=')) || '').replace('--set=', '') || null;
  const max    = parseInt((flags.find(f => String(f).startsWith('--max=')) || '').replace('--max=', '')) || 0;

  console.log(`\n${'='.repeat(76)}`);
  console.log('  YUYU-TEI SHOP PRICES' + (dry ? '   (dry run — nothing written)' : ''));
  console.log(`${'='.repeat(76)}\n`);
  console.log('  Source: yuyu-tei.jp  ·  1 page / 1.5s  ·  stored as yuyutei_shop');
  console.log('  These are shop ASKING prices, ~1.4x Yahoo auction medians.');
  console.log(all
    ? '  Scope: every card in each set (overwrites nothing — appends)\n'
    : '  Scope: cards with no real price yet\n');

  // The yen rate, LIVE and recorded on every row (Roy, 2026-10-10). Until then
  // every shop price used a constant 157 yen to the dollar from August, no rate on
  // the row. fx.js gives the ECB reference rate with its date; if it can only
  // give its pinned fallback, nothing is written (a dry run still reports).
  const jpy = await fx.usdPer('JPY');
  console.log(`  Rate: 1 JPY = ${jpy.rate} USD (${(1 / jpy.rate).toFixed(2)} JPY/USD), ${jpy.source} ${jpy.date || 'undated'}`
    + (jpy.stale ? '  — NOT LIVE' : ''));
  if (jpy.stale && !dry && !flags.includes('--compare')) {
    console.log('  FATAL: no live yen rate (fx.js answered its pinned fallback). Nothing written.\n');
    process.exitCode = 1;   // a scheduled run that wrote nothing never exits 0 (2026-10-10)
    return;
  }
  const toUsd = yen => +(yen * jpy.rate).toFixed(2);
  const fxMeta = yen => ({ currency: 'JPY', original: yen, fxRate: jpy.rate, fxDate: jpy.date, fxSource: jpy.source,
                           shop: 'yuyu-tei' });

  let index;
  try {
    index = await yt.fetchSetIndex();
    console.log(`  Set index: ${index.size} sets published by yuyu-tei\n`);
  } catch (e) {
    console.log(`  FATAL: could not read the set index — ${e.message}\n`);
    process.exitCode = 1;
    return;
  }

  // Which of our Japanese sets does yuyu-tei carry?
  const setRows = await db.query(`
    SELECT set_api_id, COUNT(*) AS cards
    FROM cards WHERE api_card_id LIKE 'ja-%'
    ${setArg ? 'AND set_api_id = $1' : ''}
    GROUP BY 1 ORDER BY 1`, setArg ? [setArg] : []);

  const todo = [], missing = [];
  for (const r of setRows.rows) {
    const hit = index.get(String(r.set_api_id).toUpperCase());
    (hit ? todo : missing).push({ ...r, yt: hit });
  }
  console.log(`  ${todo.length} of ${setRows.rows.length} of our sets are carried by yuyu-tei`);
  if (missing.length) {
    console.log(`  ${missing.length} not carried (mostly pre-2007): ` +
      missing.slice(0, 12).map(m => m.set_api_id).join(' ') + (missing.length > 12 ? ' …' : ''));
  }
  console.log('');

  // --compare: report where an existing Yahoo price disagrees with the shop
  // price, and write nothing. Yahoo cannot separate parallel printings that
  // share a collector number — master-ball mirrors in the 151 set are the
  // worst case — so a cheap base card can carry a mirror's price.
  const compare = flags.includes('--compare');
  const disagreements = [];

  let pagesDone = 0, matched = 0, written = 0, skippedVariant = 0, noCard = 0, alreadyPriced = 0;
  const t0 = Date.now();

  for (const s of todo) {
    if (max && written >= max) { console.log(`\n  --max=${max} reached\n`); break; }

    let entries;
    try {
      entries = await yt.fetchSet(s.yt.code);
    } catch (e) {
      console.log(`  ${String(s.set_api_id).padEnd(8)} FETCH FAILED — ${e.message}`);
      continue;
    }
    pagesDone++;

    // Our cards for this set, with whether a real price already exists.
    const ours = await db.query(`
      SELECT c.api_card_id, c.name, c.number, c.set_total,
             EXISTS(SELECT 1 FROM price_history p
                    WHERE p.card_api_id = c.api_card_id
                      AND p.grade IS NULL
                      AND p.source NOT LIKE 'estimate%'
                      AND p.source <> 'yuyutei_shop') AS has_real,
             (SELECT price_usd FROM price_history p WHERE p.card_api_id = c.api_card_id
                AND p.grade IS NULL
                AND p.source LIKE 'yahoojp%' ORDER BY recorded_at DESC LIMIT 1) AS yahoo_price
      FROM cards c WHERE c.set_api_id = $1 AND c.api_card_id LIKE 'ja-%'`, [s.set_api_id]);

    // Group shop entries by bare collector number.
    const byNum = new Map();
    for (const e of entries) {
      if (!e.number) continue;
      const k = String(e.number).replace(/^0+/, '') || '0';
      (byNum.get(k) || byNum.set(k, []).get(k)).push(e);
    }

    let setMatched = 0, setWritten = 0;
    for (const card of ours.rows) {
      // --compare never writes: it lines the shop price up against whatever
      // Yahoo already gave us and reports the disagreements.
      if (compare) {
        if (card.yahoo_price == null) continue;
        const ck = String(card.number).replace(/^0+/, '') || '0';
        const cc = (byNum.get(ck) || []).filter(e => yt.matchesOurCard(e, card));
        const cp = yt.pickVariant(cc, card.name);
        if (!cp) continue;
        const shop = toUsd(cp.yen), have = +card.yahoo_price;
        if (have > 0 && shop > 0) {
          matched++;
          const ratio = have / shop;
          if (ratio >= 5 || ratio <= 0.2)
            disagreements.push({ id: card.api_card_id, name: card.name,
                                 set: s.set_api_id, have, shop, ratio });
        }
        continue;
      }
      if (!all && card.has_real) { alreadyPriced++; continue; }
      const k = String(card.number).replace(/^0+/, '') || '0';
      const cands = (byNum.get(k) || []).filter(e => yt.matchesOurCard(e, card));
      if (!cands.length) { noCard++; continue; }

      const pick = yt.pickVariant(cands, card.name);
      if (!pick) { skippedVariant++; continue; }

      matched++; setMatched++;
      if (dry) continue;

      await db.query(
        `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, source_meta)
         VALUES ($1,$2,'yuyutei_shop','yuyutei','raw_nm',$3)`,
        [card.api_card_id, toUsd(pick.yen), JSON.stringify(fxMeta(pick.yen))]).catch(() => {});
      written++; setWritten++;
    }

    const eta = Math.round(((Date.now() - t0) / pagesDone) * (todo.length - pagesDone) / 60000);
    console.log(`  ${String(s.set_api_id).padEnd(8)} ${String(s.yt.code).padEnd(7)} ` +
      `${String(entries.length).padStart(4)} shop rows  ->  ${String(setMatched).padStart(4)} matched` +
      `${dry ? '' : ', ' + String(setWritten).padStart(4) + ' written'}   eta ${eta}m`);
  }

  if (compare) {
    disagreements.sort((x, y) => y.ratio - x.ratio);
    console.log(`\n${'-'.repeat(76)}`);
    console.log(`  ${matched} cards have BOTH a Yahoo price and a shop price`);
    console.log(`  ${disagreements.length} disagree by 5x or more\n`);
    console.log('  card            name              set     yahoo       shop        ratio');
    console.log('  ' + '-'.repeat(74));
    for (const d of disagreements.slice(0, 30))
      console.log('  ' + String(d.id).padEnd(15) + ' ' + String(d.name).slice(0, 15).padEnd(17) +
        String(d.set).padEnd(7) + ' $' + String(d.have.toFixed(2)).padEnd(11) +
        '$' + String(d.shop.toFixed(2)).padEnd(11) + d.ratio.toFixed(0) + 'x');
    if (disagreements.length > 30) console.log(`  ... and ${disagreements.length - 30} more`);
    console.log('');
    return;
  }

  console.log(`\n${'-'.repeat(76)}`);
  console.log(`  pages fetched      ${pagesDone}`);
  console.log(`  matched            ${matched}`);
  if (!dry) console.log(`  written            ${written}`);
  console.log(`  no shop entry      ${noCard}`);
  console.log(`  variant undecided  ${skippedVariant}   (several printings share the number)`);
  if (!all) console.log(`  already priced     ${alreadyPriced}   (--all to price these too)`);
  console.log('');
}

// ══════════════════════════════════════════════════════════════
// ALERT ENGINE — node ingest.js alerts [lang] [--dry]
//
// Runs at the end of every non-dry `refresh`, because a refresh is
// exactly when a price can cross a threshold. An alert that fires records
// WHICH listing fired it: "Charizard hit $400" is not actionable without
// the link to the $400 copy, so triggered_url / _title / _price / _source
// are stored alongside triggered_at.
//
// Alert types, with the synonyms the frontend has used over time:
//   below  / price_below         cheapest landed cost <= target
//   above  / price_above         market price >= target
//   deal   / pct_below_market    a listing >= DEAL_MARGIN under market
//   new_listing                  any listing exists where none was seen
//
// A triggered alert is not re-fired every night: status moves to
// 'triggered' and the user re-arms it. trigger_count keeps the history.
//
// NOTE 2026-08-29: this function and estFix were LOST when a downloaded
// ingest.js overwrote the file on 2026-08-21. The Aug 23 rebuild restored
// the JP filter subsystem but not these two, so the alert engine silently
// stopped running after every refresh for eight days. The server routes
// and the alerts table columns survived (server.js was never reverted),
// so nothing needed re-migrating. See CLAUDE.md.
// ══════════════════════════════════════════════════════════════
const DEAL_MARGIN = 0.25;                 // 25% under market counts as a deal

async function evaluateAlerts(lang, ...flags) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  const dry = flags.includes('--dry');

  const params = [];
  let where = `a.status = 'active'`;
  if (lang && lang !== 'all') { params.push(lang + '-%'); where += ` AND a.card_api_id LIKE $1`; }

  const alerts = await db.query(`
    SELECT a.*, c.name, c.number, c.set_api_id, c.set_total, c.set_release,
           -- A MARKED headline (printsql.markedSql: old, an ask, product
           -- unknown) feeds no alert (Roy, 2026-10-10): the card has no
           -- market price to alert on, said in the run's output.
           CASE WHEN lp.marked THEN NULL ELSE lp.price_usd END AS market_price, lp.marked AS market_marked
    FROM alerts a
    LEFT JOIN cards c ON c.api_card_id = a.card_api_id
    LEFT JOIN LATERAL (
      SELECT p.price_usd, ${require('./printsql').markedSql('p')} AS marked FROM price_history p
       WHERE p.card_api_id = a.card_api_id
         AND p.grade IS NULL
         AND p.source NOT LIKE 'estimate%'
         -- the card page's base-printing rule: an "above" alert must
         -- not fire on a reverse price the card page never shows (T2)
         AND ${require('./printsql').basePrintingSql('p', 'c')}
       ORDER BY p.recorded_at DESC LIMIT 1) lp ON TRUE
    WHERE ${where}`, params);

  if (!alerts.rows.length) { console.log('  Alerts: none active\n'); return; }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ALERTS — ${alerts.rows.length} active${dry ? '   (dry run)' : ''}`);
  console.log(`${'='.repeat(72)}\n`);

  let fired = 0, checked = 0;
  for (const a of alerts.rows) {
    checked++;
    const type   = String(a.alert_type || '').toLowerCase();
    const target = a.target_price != null ? parseFloat(a.target_price) : null;
    const market = a.market_price != null ? parseFloat(a.market_price) : null;
    if (a.market_marked) console.log(`  marked  ${a.card_api_id}: its price may be out of date — not used to evaluate this alert`);
    let hit = null;

    const needsListing = /below|deal|new_listing|pct/.test(type);
    let cheapest = null;
    if (needsListing && a.name && String(a.card_api_id).startsWith('ja-')) {
      const r = await yahooJapanSearch(a.name, a.number,
        Object.assign(jpCtx(Object.assign({}, a, { api_card_id: a.card_api_id })), { withItems: true })).catch(() => null);
      const items = (r && r.items) || [];
      if (items.length) cheapest = items.reduce((m, l) => (l.landed < m.landed ? l : m), items[0]);
    }

    if (type.includes('below') && !type.includes('market') && type !== 'deal') {
      if (cheapest && target != null && cheapest.landed <= target)
        hit = { price: cheapest.landed, source: cheapest.source, url: cheapest.url, title: cheapest.title };
      else if (!cheapest && market != null && target != null && market <= target)
        hit = { price: market, source: 'market', url: null, title: null };
    } else if (type.includes('above')) {
      if (market != null && target != null && market >= target)
        hit = { price: market, source: 'market', url: null, title: null };
    } else if (type === 'deal' || type.includes('pct') || type.includes('market')) {
      const margin = target != null && target > 0 && target < 1 ? target : DEAL_MARGIN;
      if (cheapest && market != null && cheapest.landed <= market * (1 - margin))
        hit = { price: cheapest.landed, source: cheapest.source, url: cheapest.url, title: cheapest.title };
    } else if (type.includes('new_listing') || type.includes('new')) {
      if (cheapest)
        hit = { price: cheapest.landed, source: cheapest.source, url: cheapest.url, title: cheapest.title };
    }

    if (!dry) {
      await db.query(`UPDATE alerts SET last_checked_at = NOW(),
                        current_price = COALESCE($2, current_price) WHERE id = $1`,
        [a.id, cheapest ? cheapest.landed : market]).catch(() => {});
    }

    if (!hit) continue;
    fired++;
    console.log(`  FIRED  ${String(a.card_name || a.name || a.card_api_id).slice(0,26).padEnd(28)}` +
      `${type.padEnd(14)} $${hit.price}  ${hit.url ? hit.url : '(market price, no listing)'}`);

    if (!dry) {
      await db.query(`
        UPDATE alerts SET status='triggered', triggered_at=NOW(),
          trigger_count = COALESCE(trigger_count,0) + 1,
          triggered_price=$2, triggered_source=$3, triggered_url=$4, triggered_title=$5,
          current_price=$2, updated_at=NOW()
        WHERE id=$1`,
        [a.id, hit.price, hit.source, hit.url, hit.title]).catch(e =>
          console.log(`    write failed: ${e.message}`));
    }
  }

  console.log(`\n  ${checked} checked, ${fired} fired${dry ? ' (nothing written)' : ''}\n`);
}


// ══════════════════════════════════════════════════════════════
// RARITY BACKFILL — node ingest.js rarityfill <lang> [--dry] [--set=X]
//                                             [--limit=N]
//
// 5,475 Japanese cards were never found on TCGdex — the Limitless-ingested
// sets — so their rarity is positional inference, and rarity drives the
// price estimate for every card without a market price.
//
// Yuyu-tei carries a rarity code in the SAME alt text as the number, so a
// backfill costs no extra requests beyond the set pages already fetched
// for prices.
//
// ── Provenance, and why this needs a TCGdex call at all ──
// TASK.md says: do not overwrite a rarity that came from TCGdex. Nothing
// recorded where a rarity came from, and set membership is NOT a usable
// proxy — measured 2026-09-02, the 70 "TCGdex sets" still contain plainly
// inferred values: shop code `AR` (Art Rare) sits against a stored
// "Common" 48 times, and AR cards are never Common. TCGdex's SET endpoint
// omits rarity, which is the original defect; only `manifest`'s per-card
// calls ever fixed any of it, and it corrected just 521.
//
// So provenance is established per card, from the authoritative source,
// and only where it matters — the ~1,200 cards where the shop and our
// store disagree. Agreements need no call: two independent sources
// concurring is already the strongest evidence available.
//
//   agree            -> keep, record rarity_source='confirmed'
//   differ / null    -> ask TCGdex for THIS card:
//                         has rarity -> take it,  source='tcgdex'
//                         no rarity  -> take shop, source='yuyutei'
//
// That is the only reading of "do not overwrite TCGdex" that can actually
// be honoured, because it asks TCGdex rather than assuming.
// ══════════════════════════════════════════════════════════════
async function rarityFill(lang, ...flags) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';
  const dry    = flags.includes('--dry');
  const setArg = (flags.find(f => String(f).startsWith('--set=')) || '').replace('--set=', '') || null;
  const limit  = parseInt((flags.find(f => String(f).startsWith('--limit=')) || '').replace('--limit=', '')) || 0;
  const yt = require('./yuyutei');

  console.log(`\n${'='.repeat(78)}`);
  console.log(`  RARITY BACKFILL — ${lang}${setArg ? ' / ' + setArg : ''}${dry ? '   (dry run)' : ''}`);
  console.log(`${'='.repeat(78)}\n`);
  console.log('  Shop rarity is used only where TCGdex has none. Agreements are');
  console.log('  recorded as confirmed and cost no TCGdex call.\n');

  let index;
  try { index = await yt.fetchSetIndex(); }
  catch (e) { console.log(`  FATAL: set index — ${e.message}\n`); return; }

  const setRows = await db.query(`
    SELECT set_api_id FROM cards WHERE api_card_id LIKE $1
    ${setArg ? 'AND set_api_id = $2' : ''}
    GROUP BY 1 ORDER BY 1`, setArg ? [lang + '-%', setArg] : [lang + '-%']);

  const st = { seen: 0, noEntry: 0, notStated: 0, confirmed: 0,
               tcgdex: 0, yuyutei: 0, unchanged: 0, asked: 0 };
  const changes = [];

  for (const s of setRows.rows) {
    if (limit && (st.tcgdex + st.yuyutei) >= limit) break;
    const hit = index.get(String(s.set_api_id).toUpperCase());
    if (!hit) continue;

    let entries;
    try { entries = await yt.fetchSet(hit.code); }
    catch (e) { console.log(`  ${String(s.set_api_id).padEnd(8)} fetch failed — ${e.message}`); continue; }

    const byNum = new Map();
    for (const e of entries) {
      if (!e.number) continue;
      const k = String(e.number).replace(/^0+/, '') || '0';
      if (!byNum.has(k)) byNum.set(k, []);
      byNum.get(k).push(e);
    }

    const ours = await db.query(`
      SELECT api_card_id, name, number, rarity, set_total, set_api_id, rarity_source
      FROM cards WHERE set_api_id = $1 AND api_card_id LIKE $2`, [s.set_api_id, lang + '-%']);

    let setConfirmed = 0, setWritten = 0;

    for (const c of ours.rows) {
      st.seen++;
      const k = String(c.number).replace(/^0+/, '') || '0';
      const cands = (byNum.get(k) || []).filter(e => yt.matchesOurCard(e, c));
      const pick = yt.pickVariant(cands, c.name);
      if (!pick) { st.noEntry++; continue; }

      const shopRarity = yt.ytRarity(pick.rarity);
      if (!shopRarity) { st.notStated++; continue; }

      // Two independent sources agreeing is stronger than either alone.
      if (c.rarity === shopRarity) {
        st.confirmed++; setConfirmed++;
        if (!dry && c.rarity_source !== 'confirmed')
          await db.query(
            `UPDATE cards SET rarity_source='confirmed', rarity_checked_at=NOW() WHERE api_card_id=$1`,
            [c.api_card_id]).catch(() => {});
        continue;
      }

      // Disagreement — ask the authoritative source about THIS card.
      let tcgRarity = null;
      try {
        const d = await get(`${TCGDEX}/${lang}/cards/${c.set_api_id}-${tcgdexLocalId(c.number)}`);
        await sleep(DELAY_TCGDEX);
        st.asked++;
        const raw = d && d.rarity ? d.rarity : null;
        tcgRarity = raw ? (TCGDEX_RARITY[raw] || normRarity(raw)) : null;
      } catch (e) { st.asked++; }

      const chosen = tcgRarity || shopRarity;
      const src    = tcgRarity ? 'tcgdex' : 'yuyutei';

      if (chosen === c.rarity) {
        // TCGdex agrees with what we already hold; the shop is the outlier.
        st.unchanged++;
        if (!dry)
          await db.query(
            `UPDATE cards SET rarity_source=$2, rarity_checked_at=NOW() WHERE api_card_id=$1`,
            [c.api_card_id, src]).catch(() => {});
        continue;
      }

      changes.push({ id: c.api_card_id, name: c.name, from: c.rarity, to: chosen, src, code: pick.rarity });
      if (src === 'tcgdex') st.tcgdex++; else st.yuyutei++;
      setWritten++;

      if (!dry)
        await db.query(
          `UPDATE cards SET rarity=$2, rarity_source=$3, rarity_checked_at=NOW() WHERE api_card_id=$1`,
          [c.api_card_id, chosen, src]).catch(() => {});
    }

    console.log(`  ${String(s.set_api_id).padEnd(8)} ${String(hit.code).padEnd(8)} ` +
      `${String(ours.rows.length).padStart(4)} cards  ` +
      `${String(setConfirmed).padStart(4)} confirmed  ${String(setWritten).padStart(4)} changed`);
  }

  console.log(`\n${'-'.repeat(78)}`);
  console.log(`  cards examined        ${st.seen}`);
  console.log(`  no shop entry         ${st.noEntry}`);
  console.log(`  shop rarity not given ${st.notStated}   ("-" means not stated, never "common")`);
  console.log(`  confirmed by both     ${st.confirmed}`);
  console.log(`  TCGdex asked          ${st.asked}   (only where the two disagreed)`);
  console.log(`  changed -> TCGdex     ${st.tcgdex}`);
  console.log(`  changed -> Yuyu-tei   ${st.yuyutei}   (TCGdex had none)`);
  console.log(`  left as held          ${st.unchanged}   (TCGdex backed what we had)`);

  if (changes.length) {
    console.log('\n  sample changes:');
    for (const c of changes.slice(0, 20))
      console.log(`    ${String(c.id).padEnd(15)} ${String(c.name).slice(0,14).padEnd(16)}` +
        `${String(c.from || 'null').padEnd(24)} -> ${String(c.to).padEnd(24)} [${c.src}, shop said ${c.code}]`);
    if (changes.length > 20) console.log(`    ... and ${changes.length - 20} more`);
  }
  if (dry) console.log('\n  Dry run — nothing written.');
  console.log('');
}

// Other printings' prices that came back with a result (T4: Yahoo mirror
// medians), one row each, tagged in price_history.variant. Written whether
// or not the base price wins the source-rank gate: a mirror is a different
// product, not a competing claim on the base, and nothing else stores a
// Yahoo mirror price. The headline readers never show these as the card's
// price (printsql.basePrintingSql); /api/history charts them as their own
// series.
// Another market's price, stored BESIDE the headline (source_meta.role =
// 'second-reading', which printsql.basePrintingSql keeps out of every
// headline reader). One writer, called wherever writeVariantPrices is.
async function writeSecondReading(card, res) {
  const s = res && res.secondReading;
  if (!db || !s || !(s.price > 0) || s.meta.role !== 'second-reading') return 0;
  const r = await db.query(
    `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, source_meta)
     VALUES ($1,$2,$3,$4,'raw_nm',$5)`,
    [card.api_card_id, s.price, s.source, s.marketplace, JSON.stringify(s.meta)])
    .catch(e => { console.log(`  second-reading write failed ${card.api_card_id}: ${e.message}`); return null; });
  return r ? 1 : 0;
}

// A 1st Edition price, in its own row: edition '1st-edition', so
// printsql.baseEditionSql keeps it out of every headline and the card
// page's editionPrices reads it. Not gated by sourcerank — it never
// competes with the headline.
async function writeEditionPrice(card, res) {
  const e = res && res.firstEdition;
  if (!db || !e || !(e.price > 0)) return 0;
  const r = await db.query(
    `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, edition, source_meta)
     VALUES ($1,$2,$3,'tcgplayer','raw_nm','1st-edition',$4)`,
    [card.api_card_id, e.price, e.source, JSON.stringify(e.meta)])
    .catch(err => { console.log(`  edition write failed ${card.api_card_id}: ${err.message}`); return null; });
  return r ? 1 : 0;
}

async function writeVariantPrices(card, res) {
  if (!db || !res || !Array.isArray(res.variantPrices)) return 0;
  let n = 0;
  for (const v of res.variantPrices) {
    if (!(v.price > 0) || !/^reverse/.test(v.variant)) continue;
    const r = await db.query(
      `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, variant, source_meta)
       VALUES ($1,$2,$3,'yahoojp','raw_nm',$4,$5)`,
      [card.api_card_id, v.price, v.source, v.variant,
       JSON.stringify(Object.assign({ priceYen: v.priceYen, count: v.count }, v.fx))])
      .catch(e => { console.log(`  variant write failed ${card.api_card_id} ${v.variant}: ${e.message}`); return null; });
    if (r) { n++; console.log(`      + ${v.variant} $${v.price} (${v.count} sales) — its own row, never the base`); }
  }
  return n;
}

async function safePriceFor(card) {
  const isJP = /[\u3040-\u30ff\u4e00-\u9faf]/.test(card.name) ||
               String(card.api_card_id).startsWith('ja-');

  // Never let one source's failure abort the whole run
  const attempt = async (fn) => { try { return await fn(); } catch (e) { return null; } };

  let res = null;

  const isCN = /^zh-/.test(String(card.api_card_id).split('-').slice(0,2).join('-'))
            || String(card.api_card_id).startsWith('zh-');

  if (isCN) {
    // Chinese is parked (T5) and has NO price source. This branch used to
    // try an ungated eBay name search, then Yahoo JAPAN by name — a Japanese
    // card's price written onto a Chinese one, which "never substitute
    // across languages" forbids. Nothing, rather than a wrong number.
    return null;
  } else if (isJP) {
    // Yahoo Auctions is the real Japanese market. Nothing else is close.
    res = await attempt(() => yahooJapanSearch(card.name, card.number, jpCtx(card)));
  } else {
    // A reprint (Classic Collection) follows the same order — TCGdex first,
    // the internal search only where TCGdex has no TCGplayer price — and is
    // then asked by its PRINTED number in its own TCGplayer set, nothing
    // else: a name-only question is how an original's price lands on a
    // reprint. (Until 2026-10-01 a reprint went straight to the internal
    // search; TCGdex has no TCGplayer price for 30th-c or cel25cc today.)
    const rp = reprintPricing(card);
    {
      // TCGPlayer by collector number, and nothing else. Two fallbacks
      // followed until 2026-09-29 (T9), both NAME ONLY, which is the
      // Phantasmal Flames failure this file exists to prevent:
      //   ebayBrowseActive — median of an ungated eBay search, stored as
      //     ebay_active_N. eBay's terms forbid storing it, and it bypassed
      //     ebaycall/ebayquota. Latent only because the keys live on Render.
      //   cardmarketSearch — an HTML scrape Cloudflare refuses, converted
      //     at the hardcoded 1.09 CLAUDE.md records as 6.6% wrong.
      // Both deleted. A wrong price is worse than no price.
      // TASK T1 (2026-09-29): TCGdex FIRST — TCGplayer's price keyed by
      // TCGplayer's own productId, 90% within 10% of what we held and right
      // where the two disagreed (Expedition), EXCEPT where TCGdex gives two
      // cards one product (recorded by tcgdexharvest.js; see tcgdexprice.js).
      // The internal search API remains the fallback only, and must now
      // match the set as well as the number.
      // 2026-10-01: the internal search API is the fallback ONLY where TCGdex
      // has no usable TCGplayer price (TCGDEX_FALLBACK_OK). Unreachable or
      // not-ready is reported and nothing is written — never a quiet switch
      // of the whole catalogue to the internal API.
      //
      // WHY it is kept at all (decided 2026-10-01, CLAUDE.md "TCGplayer has no
      // route"): TCGplayer grants no API access to anyone, so for the cards
      // TCGdex cannot price there is no sanctioned source to move to —
      // stopping it moves them to NO source. It runs from the home machine,
      // nightly, never from Render. Every row it writes is LABELLED
      // (source_meta.via) so those cards can be found and re-priced the day
      // TCGdex fills them or TCGplayer reopens access.
      const td = await attempt(() => tcgdexPriceFor(card));
      let second = null;
      if (td && td.price > 0) res = td;
      else if (td && TCGDEX_FALLBACK_OK.has(td.none)) {
        const memo = new Map();   // this card's search answers, shared by its two passes
        const ask = askOnly => attempt(() => rp
          ? tcgPlayerSearch(card.name, rp.tcgSet, rp.number, card.rarity, { reprint: rp, askOnly, memo })
          : tcgPlayerSearch(card.name, card.set_name, card.number, card.rarity, { setId: card.set_api_id, tcgdexIds: tcgdexProductIds(card.variants), askOnly, memo }));
        // A market price first; only where none matched, the listing floor as an ask.
        res = await ask(false);
        if (!res) res = await ask(true);
        if (res) res.meta = Object.assign({}, res.meta || {}, {
          via: 'tcgplayer-internal-search', tcgdexNone: td.none,
          // WHICH product it matched (T2, 2026-10-02): Torchic ☆ alternated
          // $4,500 / $1,200 nightly and no row could say why. TCGplayer's own
          // listing count goes with it: a 'market' on 0 listings is a stale
          // last sale (Torchic ☆: $4,500 on 0; Rayquaza ☆: no market at all).
          matched: res.matched, matchedNumber: res.matchedNumber, matchedBy: res.matchedBy,
          numberRule: NUMBER_RULE,   // written by the whole-number matcher (cardnumber.js)
          tcgSet: res.set, productId: res.productId, listings: res.listings, low: res.low, basis: res.basis,
          recheck: 'last-resort fallback: re-price from TCGdex once it lists a TCGplayer price for this card' });
        // TCGdex's Cardmarket price, where it has one: a SECOND reading,
        // stored beside the headline and never as it — EU retail, ~1.6x,
        // a different market (printsql.notSecondReadingSql keeps it out of
        // every headline reader).
        if (td.cardmarket) {
          const conv = await attempt(() => fx.toUsd(td.cardmarket.price, td.cardmarket.unit));
          if (conv && conv.usd > 0) second = { price: conv.usd, source: 'tcgdex_cardmarket', marketplace: 'cardmarket',
            meta: { role: 'second-reading', why: 'TCGdex has no TCGplayer price for this card; EU retail, not the headline',
                    currency: conv.currency, original: conv.original, fxRate: conv.rate, fxDate: conv.rateDate,
                    fxSource: conv.rateSource, idProduct: td.cardmarket.idProduct, updated: td.cardmarket.updated } };
        }
        if (res) res.secondReading = second;
        else if (second) return { price: null, source: null, secondReading: second };
      } else {
        console.log(`    ${card.api_card_id}: TCGdex ${td ? td.none + (td.detail ? ' (' + td.detail + ')' : '') : 'threw'} — not priced, internal search NOT asked`);
      }
    }
  }

  // A result with only other printings' prices (T4) carries them to
  // writeVariantPrices and no base price.
  if (res && !(res.price > 0) && Array.isArray(res.variantPrices) && res.variantPrices.length)
    return { price: null, source: null, variantPrices: res.variantPrices };
  if (!res || !res.price || res.price <= 0) return null;

  // Reject implausible single-card prices
  if (res.price > 50000) return null;

  // One product answering for several cards (pricedupe.js): refused, named.
  const dup = PRICE_GUARD.check(card.api_card_id, res);
  if (dup) {
    console.log(`\n  REFUSED ${card.api_card_id} (${card.name}): ${res.source} — ${dup}. Not written.\n`);
    return null;
  }

  return res;
}


async function safePrices(langFilter, ...flags) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  if (!preflightFilter()) return;

  const all    = flags.includes('--all');
  const setArg = (flags.find(f => String(f).startsWith('--set=')) || '').replace('--set=', '') || null;
  // Read below by the source-confidence gate but never declared here — it
  // was copied from refresh(), so every safeprices run threw
  // "force is not defined" at the first card it found a price for.
  const force  = flags.includes('--force');

  console.log(`\n${'='.repeat(64)}`);
  console.log('  SAFE PRICE FETCH — public APIs only, no eBay scraping');
  console.log(`${'='.repeat(64)}\n`);

  const hasEbay = !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
  console.log('  Sources:');
  console.log('    Yahoo Auctions JP  1 req / 3.0s   (Japanese and Chinese cards)');
  console.log('    TCGPlayer          1 req / 1.8s   (English)');
  console.log('    Cardmarket         1 req / 2.5s   (European market)');
  console.log(`    eBay Browse API    ${hasEbay ? '1 req / 0.25s  (credentials found)' : 'skipped — no credentials'}`);
  console.log('');
  console.log(all
    ? '  Scope: EVERY rarity (--all)'
    : '  Scope: Illustration Rare and above. Use --all for every card.');
  if (setArg) console.log(`  Set:   ${setArg}`);
  console.log('');

  const conds = [];
  const params = [];
  let i = 1;
  if (langFilter) { conds.push(`c.api_card_id LIKE $${i++}`); params.push(langFilter + '-%'); }
  if (setArg)     { conds.push(`c.set_api_id = $${i++}`);     params.push(setArg); }
  if (!all)       { conds.push(`c.rarity = ANY($${i++})`);    params.push(SCRAPE_RARITIES); }
  const whereSql = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  const rows = await db.query(`
    SELECT c.api_card_id, c.name, c.number, c.rarity, c.set_name, c.set_release,
      c.set_api_id, c.set_total, c.variants, c.name_en,
      COALESCE((SELECT price_usd FROM price_history p
                WHERE p.card_api_id = c.api_card_id
                ORDER BY recorded_at DESC LIMIT 1), 0) AS last_price,
      EXISTS(SELECT 1 FROM price_history p
             WHERE p.card_api_id = c.api_card_id
               AND p.source NOT LIKE 'estimate%'
               AND p.recorded_at > NOW() - INTERVAL '7 days') AS fresh
    FROM cards c
    ${whereSql}
    ORDER BY c.api_card_id
  `, params);

  let todo = rows.rows.filter(r => !r.fresh);

  // Skip digital-only sets unless one was named explicitly
  if (!setArg) {
    const before = todo.length;
    todo = todo.filter(r => !isDigitalSet(r.set_api_id || setIdFromCardId(r.api_card_id)));
    const skipped = before - todo.length;
    if (skipped) console.log(`  Skipping ${skipped} TCG Pocket cards — digital-only, no market price\n`);
  }

  todo.sort((a, b) => parseFloat(b.last_price) - parseFloat(a.last_price));

  console.log(`  ${rows.rows.length} eligible, ${todo.length} need pricing`);
  const mins = Math.round(todo.length * 2.5 / 60);
  console.log(`  Estimated: ~${mins} minutes (${(mins/60).toFixed(1)} hours)\n`);
  if (!todo.length) { console.log('  All fresh within 7 days\n'); return; }

  let done = 0, hit = 0, miss = 0, kept = 0;
  const bySource = {};
  const t0 = Date.now();

  for (const card of todo) {
    const res = await safePriceFor(card);
    await writeVariantPrices(card, res);
    await writeSecondReading(card, res);
    await writeEditionPrice(card, res);
    done++;
    const pct = ((done / todo.length) * 100).toFixed(1);
    const eta = Math.round(((Date.now() - t0) / 60000 / done) * (todo.length - done));

    if (res && res.price > 0) {
      // Same gate as refresh: never let a lower-confidence source replace a
      // higher-confidence one. --force is for a deliberate rebuild, e.g.
      // after a jppurge. See sourcerank.js.
      if (!force && !srank.canOverwrite(res.source, card.held_source)) {
        kept++;
        console.log(`  [${pct}%] ${card.name.slice(0,24).padEnd(26)} keep $${String(card.held_price).padEnd(8)} ` +
          `${String(card.held_source).padEnd(16)} refused ${res.source}`);
        continue;
      }
      await db.query(
        `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, source_meta)
         VALUES ($1,$2,$3,$4,'raw_nm',$5)`,
        [card.api_card_id, res.price, res.source, res.marketplace || res.source.split('_')[0],
         res.meta ? JSON.stringify(res.meta) : null]).catch(() => {});
      hit++;
      bySource[res.source.split('_')[0]] = (bySource[res.source.split('_')[0]] || 0) + 1;
      console.log(`  [${pct}%] ${card.name.slice(0,24).padEnd(26)} $${String(res.price).padEnd(9)} ${res.source.padEnd(18)} eta ${eta}m`);
    } else {
      miss++;
      if (done % 15 === 0) console.log(`  [${pct}%] ${card.name.slice(0,24).padEnd(26)} no data                        eta ${eta}m`);
    }
  }

  console.log(`\n  ${hit} priced, ${miss} without data, ${kept} kept (lower-confidence source refused)`);
  console.log('  By source:', JSON.stringify(bySource), '\n');
}


// ══════════════════════════════════════════════════════════════
// CLEANUP — remove junk prices written by a broken source
//   node ingest.js clean          report what looks wrong
//   node ingest.js clean --delete actually remove it
// ══════════════════════════════════════════════════════════════
async function cleanBadPrices(doDelete) {
  if (!db) { console.log('  DATABASE_URL required'); return; }

  console.log(`\n${'='.repeat(64)}`);
  console.log('  PRICE DATA AUDIT');
  console.log(`${'='.repeat(64)}\n`);

  // Any price repeated across many different cards is a broken match
  const dupes = await db.query(`
    SELECT price_usd, source, COUNT(DISTINCT card_api_id) AS cards
    FROM price_history
    WHERE source NOT LIKE 'estimate%'
    GROUP BY price_usd, source
    HAVING COUNT(DISTINCT card_api_id) > 5
    ORDER BY cards DESC LIMIT 20
  `);

  if (dupes.rows.length) {
    console.log('  Suspicious — same price across many cards:\n');
    console.log('    price        source              cards');
    console.log('    ' + '-'.repeat(46));
    dupes.rows.forEach(r => {
      console.log(`    $${String(r.price_usd).padEnd(11)} ${String(r.source).padEnd(19)} ${r.cards}`);
    });
    console.log('');
  } else {
    console.log('  No repeated-price patterns found.\n');
  }

  // Implausible single-card prices
  const high = await db.query(`
    SELECT COUNT(*) FROM price_history
    WHERE price_usd > 50000 AND source NOT LIKE 'estimate%'
  `);
  console.log(`  Prices over $50,000: ${high.rows[0].count}`);

  const total = await db.query(`
    SELECT source, COUNT(*) AS n FROM price_history
    GROUP BY source ORDER BY n DESC LIMIT 12
  `);
  console.log('\n  Records by source:');
  total.rows.forEach(r => console.log(`    ${String(r.source).padEnd(24)} ${r.n}`));

  if (!doDelete) {
    console.log('\n  Run "node ingest.js clean --delete" to remove the junk.\n');
    return;
  }

  console.log('\n  Deleting...');
  const d1 = await db.query(`
    DELETE FROM price_history WHERE id IN (
      SELECT ph.id FROM price_history ph
      JOIN (
        SELECT price_usd, source FROM price_history
        WHERE source NOT LIKE 'estimate%'
        GROUP BY price_usd, source
        HAVING COUNT(DISTINCT card_api_id) > 5
      ) bad ON bad.price_usd = ph.price_usd AND bad.source = ph.source
    )`);
  const d2 = await db.query(
    `DELETE FROM price_history WHERE price_usd > 50000 AND source NOT LIKE 'estimate%'`);

  console.log(`  Removed ${d1.rowCount} repeated-price rows`);
  console.log(`  Removed ${d2.rowCount} implausible rows\n`);
}


// ══════════════════════════════════════════════════════════════
// TEST — try one card against every source, verbosely
//   node ingest.js test リザードンex
//   node ingest.js test "Charizard ex" "Obsidian Flames"
// ══════════════════════════════════════════════════════════════
async function testSources(arg1, arg2) {
  // Console encoding on Windows mangles Japanese input, so prefer pulling
  // the card straight from the database.
  //   node ingest.js test ja        3 random Japanese cards from the DB
  //   node ingest.js test en        3 random English cards
  //   node ingest.js test card ja-M5-081     one specific card id
  //   node ingest.js test "Charizard ex" "Obsidian Flames"

  let cards = [];

  if (!arg1) {
    console.log('\n  usage:');
    console.log('    node ingest.js test ja                 3 JP cards from DB');
    console.log('    node ingest.js test en                 3 EN cards from DB');
    console.log('    node ingest.js test card <api_card_id> one specific card');
    console.log('    node ingest.js test "Name" "Set"       ad-hoc\n');
    return;
  }

  if (arg1 === 'card' && arg2 && db) {
    const r = await db.query('SELECT * FROM cards WHERE api_card_id=$1', [arg2]);
    cards = r.rows;
    if (!cards.length) { console.log(`  No card with id ${arg2}`); return; }
  } else if (['ja','en','zh-tw','zh-cn'].includes(arg1) && db) {
    const r = await db.query(`
      SELECT * FROM cards
      WHERE api_card_id LIKE $1
        AND rarity = ANY($2)
      ORDER BY random() LIMIT 3`,
      [arg1 + '-%', SCRAPE_RARITIES]);
    cards = r.rows;
    if (!cards.length) { console.log(`  No ${arg1} cards found in DB`); return; }
  } else {
    cards = [{ name: arg1, set_name: arg2 || '', number: '',
               api_card_id: 'adhoc', rarity: 'unknown' }];
  }

  for (const card of cards) {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`  ${card.name}`);
    if (card.set_name) console.log(`  ${card.set_name}  #${card.number || '?'}  ${card.rarity || ''}`);
    console.log(`${'='.repeat(64)}\n`);

    const isJP = /[\u3040-\u30ff\u4e00-\u9faf]/.test(card.name) ||
                 String(card.api_card_id).startsWith('ja-');
    console.log(`  Detected: ${isJP ? 'Japanese' : 'Latin'}\n`);

    if (isJP) {
      process.stdout.write('  Yahoo Auctions JP ... ');
      const y = await yahooJapanSearch(card.name, card.number, jpCtx(card));
      if (y && y.price) {
        console.log('OK');
        console.log(`    median  ¥${y.priceYen.toLocaleString()}  =  $${y.price}`);
        console.log(`    sample  ${y.count} listings   source ${y.source}`);
      } else {
        console.log('no data');
      }
    } else {
      // TCGdex first, as the writer asks; the internal search is shown only
      // by safePriceFor below, and only where TCGdex has no usable price.
      process.stdout.write('  TCGdex (TCGplayer) ');
      const t = await tcgdexPriceFor(card);
      console.log(t && t.price ? `OK  $${t.price}   ${t.source}` : `none — ${t ? t.none : 'threw'}`);

    }

    const agg = await safePriceFor(card);
    console.log(`\n  RESULT: ${agg ? '$' + agg.price + '  via ' + agg.source : 'no price found'}`);
  }
  console.log('');
}

// ══════════════════════════════════════════════════════════════
// DIAGNOSE — why did a set get 0 real prices?
//   node ingest.js diagnose base2
// ══════════════════════════════════════════════════════════════
async function diagnoseSet(setId, lang) {
  lang = lang || 'en';
  if (!setId) { console.log('  usage: node ingest.js diagnose <setId> [lang]'); return; }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  DIAGNOSE: ${setId}  (${lang})`);
  console.log(`${'='.repeat(64)}\n`);

  // What pokemontcg.io has
  const p = await get(`${TCG_API}/cards?q=set.id:${setId}&pageSize=10&orderBy=number`, TCG_H);
  await sleep(DELAY_PTCG);
  if (!p || !p.data || !p.data.length) {
    console.log(`  pokemontcg.io: NO CARDS for set.id:${setId}`);
    console.log('  -> this set is not in pokemontcg.io, so no real prices are possible\n');
  } else {
    console.log(`  pokemontcg.io: ${p.totalCount} cards`);
    console.log('  sample numbers + prices:');
    p.data.slice(0, 6).forEach(c => {
      const pr = extractPrice(c);
      console.log(`    #${String(c.number).padEnd(6)} ${String(c.name).slice(0,22).padEnd(24)} ${pr ? '$' + pr.price : 'no price'}`);
    });
  }

  // What TCGdex has
  const t = await get(`${TCGDEX}/${lang}/sets/${setId}`);
  await sleep(DELAY_TCGDEX);
  if (!t) {
    console.log(`\n  TCGdex ${lang}: set "${setId}" not found (404)`);
  } else if (!t.cards || !t.cards.length) {
    console.log(`\n  TCGdex ${lang}: set exists ("${t.name}") but has NO CARD DATA`);
    console.log(`     cardCount says ${JSON.stringify(t.cardCount || {})}`);
    console.log(`     -> TCGdex has catalogued this set but not populated its cards.`);
    console.log(`     -> Nothing we can do until they add them. Skip this language.`);
  } else {
    console.log(`\n  TCGdex: ${t.cards.length} cards  ("${t.name}")`);
    console.log('  sample localIds:');
    t.cards.slice(0, 6).forEach(c => {
      console.log(`    #${String(c.localId).padEnd(6)} ${String(c.name).slice(0,22)}`);
    });
  }

  // Do the numbers line up?
  if (p?.data?.length && t?.cards?.length) {
    const pNums = new Set(p.data.map(c => String(c.number)));
    const tNums = t.cards.slice(0, 10).map(c => String(c.localId));
    const matched = tNums.filter(n => pNums.has(n) || pNums.has(n.replace(/^0+/, '')));
    console.log(`\n  Number match: ${matched.length}/${tNums.length} of the first 10 TCGdex ids`);
    console.log(`  found in pokemontcg.io`);
    if (matched.length === 0) {
      console.log('\n  -> NUMBERING MISMATCH. TCGdex and pokemontcg.io use different');
      console.log('     card numbers for this set, so the price join fails.');
    }
  }
  console.log('');
}


// ══════════════════════════════════════════════════════════════
// REPRICE — re-run the pokemontcg.io price join for English sets
// that ended up with 0 real prices (usually a transient API failure)
//   node ingest.js reprice
// ══════════════════════════════════════════════════════════════
async function repriceEnglish() {
  if (!db) { console.log('  DATABASE_URL required'); return; }

  const p = loadProgress('en');
  const en = (p.done && p.done.en) || {};
  const zero = Object.entries(en)
    .filter(([, v]) => v.cards > 0 && (v.real || 0) === 0)
    .map(([k]) => k);

  console.log(`\n${'='.repeat(64)}`);
  console.log('  REPRICE — English sets with 0 real prices');
  console.log(`${'='.repeat(64)}\n`);
  console.log(`  ${zero.length} sets to retry\n`);
  if (!zero.length) return;

  let fixed = 0;
  for (const setId of zero) {
    process.stdout.write(`  ${setId.padEnd(14)}`);
    let cards = [], page = 1, total = 9999;
    try {
      while (cards.length < total && page <= 10) {
        const d = await get(`${TCG_API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&orderBy=number`, TCG_H);
        await sleep(DELAY_PTCG);
        if (!d || !d.data || !d.data.length) break;
        cards = cards.concat(d.data);
        total = d.totalCount || cards.length;
        page++;
      }
    } catch (e) { console.log(`error: ${e.message}`); continue; }

    if (!cards.length) { console.log('no cards in pokemontcg.io'); continue; }

    let n = 0;
    for (const c of cards) {
      const pr = extractPrice(c);
      if (!pr) continue;
      const bare = String(c.number).replace(/^0+/, '');
      const candidates = [
        `en-${setId}-${c.number}`,
        `en-${setId}-${bare}`,
        `en-${setId}-${String(c.number).padStart(2,'0')}`,
        `en-${setId}-${String(c.number).padStart(3,'0')}`,
        `en-${setId}-${String(c.number).toUpperCase()}`,
        `en-${setId}-${String(c.number).toLowerCase()}`
      ];
      for (const id of candidates) {
        const r = await db.query(
          `INSERT INTO price_history (card_api_id, price_usd, source, condition)
           SELECT $1,$2,$3,'raw_nm'
           WHERE EXISTS (SELECT 1 FROM cards WHERE api_card_id=$1)`,
          [id, pr.price, pr.source]).catch(() => ({ rowCount: 0 }));
        if (r.rowCount > 0) { n++; break; }
      }
    }
    if (n === 0 && cards.length) {
      const sample = await db.query(
        `SELECT api_card_id FROM cards WHERE set_api_id=$1 LIMIT 3`, [setId]);
      const have = sample.rows.map(r => r.api_card_id).join(', ') || '(no cards in DB)';
      console.log(`   0 written — DB has: ${have}  | tried: en-${setId}-${cards[0].number}`);
    } else {
      console.log(`${String(n).padStart(4)} prices written`);
    }
    if (n > 0) { en[setId].real = n; fixed++; }
    saveProgress(p, 'en');
    await sleep(DELAY_SET);
  }
  console.log(`\n  ${fixed} sets repriced\n`);
}


// ══════════════════════════════════════════════════════════════
// IDS — show the actual card ids stored for a set
//   node ingest.js ids base2
//   node ingest.js ids SV2a ja
// ══════════════════════════════════════════════════════════════
async function showIds(setId, lang) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  if (!setId) { console.log('  usage: node ingest.js ids <setId> [lang]'); return; }
  lang = lang || 'en';

  console.log(`\n  Cards stored for set "${setId}" (${lang})\n  ` + '-'.repeat(58));
  const r = await db.query(
    `SELECT api_card_id, number, name, rarity FROM cards
     WHERE set_api_id = $1 AND api_card_id LIKE $2
     ORDER BY api_card_id LIMIT 12`,
    [setId, lang + '-%']);

  if (!r.rows.length) {
    console.log('  none found with that set_api_id.');
    const alt = await db.query(
      `SELECT api_card_id, set_api_id, number, name FROM cards
       WHERE api_card_id LIKE $1 ORDER BY api_card_id LIMIT 8`,
      [`${lang}-${setId}-%`]);
    if (alt.rows.length) {
      console.log('  but these ids match the pattern:');
      alt.rows.forEach(x => console.log(`    ${x.api_card_id.padEnd(24)} set_api_id="${x.set_api_id}"  #${x.number}`));
    }
    console.log('');
    return;
  }

  r.rows.forEach(x => {
    console.log(`    ${String(x.api_card_id).padEnd(24)} #${String(x.number).padEnd(6)} ${String(x.name).slice(0,22).padEnd(24)} ${x.rarity || ''}`);
  });

  const cnt = await db.query(
    `SELECT COUNT(*) FROM cards WHERE set_api_id=$1 AND api_card_id LIKE $2`,
    [setId, lang + '-%']);
  const withPrice = await db.query(
    `SELECT COUNT(DISTINCT c.api_card_id) FROM cards c
     JOIN price_history p ON p.card_api_id = c.api_card_id
     WHERE c.set_api_id=$1 AND c.api_card_id LIKE $2
       AND p.source NOT LIKE 'estimate%'`,
    [setId, lang + '-%']);
  console.log(`\n  ${cnt.rows[0].count} cards, ${withPrice.rows[0].count} with real prices\n`);
}


// ══════════════════════════════════════════════════════════════
// VERIFY — sets the progress file claims are done but that have
// no rows in the database. These need re-ingesting.
//   node ingest.js verify en
// ══════════════════════════════════════════════════════════════
async function verifySets(lang) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';

  const p = loadProgress(lang);
  const claimed = (p.done && p.done[lang]) || {};
  const ids = Object.keys(claimed);

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  VERIFY: ${lang} — ${ids.length} sets in progress file`);
  console.log(`${'='.repeat(64)}\n`);

  const rows = await db.query(
    `SELECT set_api_id, COUNT(*) AS n FROM cards
     WHERE api_card_id LIKE $1 GROUP BY set_api_id`, [lang + '-%']);
  const inDb = {};
  rows.rows.forEach(r => { inDb[r.set_api_id] = parseInt(r.n); });

  const missing = [], partial = [], ok = [];
  for (const id of ids) {
    const want = claimed[id].prepared || claimed[id].cards || 0;
    const have = inDb[id] || 0;
    if (have === 0 && want > 0) missing.push({ id, want });
    else if (have < want * 0.9) partial.push({ id, want, have });
    else ok.push(id);
  }

  console.log(`  OK       ${ok.length} sets`);
  console.log(`  PARTIAL  ${partial.length} sets`);
  console.log(`  MISSING  ${missing.length} sets\n`);

  if (missing.length) {
    console.log('  Missing entirely from the DB:');
    missing.slice(0, 25).forEach(m => console.log(`    ${m.id.padEnd(16)} expected ${m.want}`));
    if (missing.length > 25) console.log(`    ... and ${missing.length - 25} more`);
    console.log('');
  }
  if (partial.length) {
    console.log('  Partially written:');
    partial.slice(0, 15).forEach(m => console.log(`    ${m.id.padEnd(16)} ${m.have}/${m.want}`));
    console.log('');
  }

  if (missing.length || partial.length) {
    console.log(`  To re-ingest these, clear them from the progress file:`);
    console.log(`    node ingest.js retry ${lang}\n`);
  }
}

// Clear failed sets from the progress file so the next run picks them up
async function retryFailed(lang) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';

  const p = loadProgress(lang);
  const claimed = (p.done && p.done[lang]) || {};
  const rows = await db.query(
    `SELECT set_api_id, COUNT(*) AS n FROM cards
     WHERE api_card_id LIKE $1 GROUP BY set_api_id`, [lang + '-%']);
  const inDb = {};
  rows.rows.forEach(r => { inDb[r.set_api_id] = parseInt(r.n); });

  let cleared = 0;
  for (const id of Object.keys(claimed)) {
    const want = claimed[id].prepared || claimed[id].cards || 0;
    const have = inDb[id] || 0;
    if (want > 0 && have < want * 0.9) { delete claimed[id]; cleared++; }
  }
  saveProgress(p, lang);
  console.log(`\n  Cleared ${cleared} incomplete sets from the ${lang} progress file.`);
  console.log(`  Run "node ingest.js ${lang}" to re-ingest them.\n`);
}



// ══════════════════════════════════════════════════════════════
// JP -> EN CARD NAME TRANSLATION
//
// Japanese-exclusive sets have no English release to match against,
// so we translate structurally instead. Pokemon card names are highly
// regular: [prefix][Pokemon name][suffix], e.g.
//   メガゲンガーex        = メガ + ゲンガー + ex     -> Mega Gengar ex
//   ロケット団のミュウツーex = ロケット団の + ミュウツー + ex -> Team Rocket's Mewtwo ex
//
// The Pokemon dictionary comes from PokeAPI (free, complete, both languages).
//   node ingest.js pokedex        build the dictionary (~1025 species)
//   node ingest.js names ja       then translate
// ══════════════════════════════════════════════════════════════


// Japanese / Chinese set codes -> the equivalent English set on TCGdex.
// Lets us pull real English card names by number where the sets align.
const EQUIV_EN_SET = {
  'SV2a':'sv03.5','SV1S':'sv01','SV1V':'sv01','SV1a':'sv01',
  'SV2D':'sv02','SV2P':'sv02','SV3':'sv03','SV3a':'sv03.5',
  'SV4K':'sv04','SV4M':'sv04','SV4a':'sv04.5',
  'SV5K':'sv05','SV5M':'sv05','SV5a':'sv05',
  'SV6':'sv06','SV6a':'sv06.5','SV7':'sv07','SV7a':'sv07',
  'SV8':'sv08','SV8a':'sv08.5','SV9':'sv09','SV9a':'sv10',
  'SV10':'sv10','SV11B':'sv10','SV11W':'sv10',
  'S12a':'swsh12.5','S12':'swsh12','S11':'swsh11','S10a':'swsh10',
  'S9':'swsh09','S8':'swsh08','S8b':'swsh08','S6H':'swsh06','S6K':'swsh06',
  'S4a':'swsh04','S1W':'swsh01','S1H':'swsh01',
  'SM12a':'sm12','SM12':'sm12','SM11b':'sm11','SM10':'sm10',
  'M1S':'me01','M1L':'me01','M2':'me02','M2a':'me02',
  'M3':'me02.5','M4':'me03','M5':'me04',
  'SC1a':'swsh01','SC1b':'swsh01','SC2a':'swsh02','SC2b':'swsh02',
  'neo1':'neo1','neo4':'neo4','PMCG1':'base1','PMCG2':'base2',
  'PMCG3':'base3','PMCG4':'base4','PMCG5':'base5'
};

const POKEDEX_FILE = path.join(__dirname, 'pokedex-ja-en.json');

// Prefixes that appear before the Pokemon name
const JP_PREFIX = [
  ['ロケット団の',   "Team Rocket's"],
  ['メガ',           'Mega'],
  ['ヒスイ',         'Hisuian'],
  ['ガラル',         'Galarian'],
  ['アローラ',       'Alolan'],
  ['パルデア',       'Paldean'],
  ['オリジンフォルム','Origin Forme'],
  ['ホワイト',       'White'],
  ['ブラック',       'Black'],
  ['かがやく',       'Radiant'],
  ['はくばバドレックス','Ice Rider Calyrex'],
  ['こくばバドレックス','Shadow Rider Calyrex'],
  ['オーガポン',     'Ogerpon'],
  ['テツノ',         'Iron'],
  ['イダイナ',       'Great Tusk'],
  ['サケブ',         'Scream Tail'],
  ['アラブルタケ',   'Brute Bonnet'],
  ['ハバタク',       'Flutter Mane'],
  ['チヲハウ',       'Slither Wing'],
  ['スナノケシ',     'Sandy Shocks'],
  ['トドロク',       'Roaring Moon'],
  ['ウネル',         'Walking Wake'],
  ['タケルライコ',   'Raging Bolt'],
  ['カミッチュ',     'Dipplin'],
  ['ブロロン',       'Varoom']
];

// Trainer-name possessives — "Nの", "リーリエの" etc.
const JP_TRAINER = [
  ['Nの',        "N's"],       ['リーリエの', "Lillie's"],
  ['マリィの',   "Marnie's"],  ['アイリスの', "Iris's"],
  ['シロナの',   "Cynthia's"], ['ワタルの',   "Lance's"],
  ['カスミの',   "Misty's"],   ['タケシの',   "Brock's"],
  ['エリカの',   "Erika's"],   ['ナツメの',   "Sabrina's"],
  ['サカキの',   "Giovanni's"],['グリーンの', "Blue's"],
  ['レッドの',   "Red's"],     ['オーキドの', "Oak's"],
  ['ダイゴの',   "Steven's"],  ['ミツルの',   "Wally's"],
  ['ハルカの',   "May's"],     ['ユウキの',   "Brendan's"],
  ['ヒカリの',   "Dawn's"],    ['コウキの',   "Lucas's"],
  ['セレナの',   "Serena's"],  ['サトシの',   "Ash's"],
  ['カトレアの', "Caitlin's"], ['アデクの',   "Alder's"],
  ['シトロンの', "Clemont's"], ['ザクロの',   "Grant's"],
  ['ボルケニオンの', "Volcanion's"],
  ['イオノの',   "Iono's"],    ['ナンジャモの',"Iono's"],
  ['ペパーの',   "Arven's"],   ['ボタンの',   "Penny's"],
  ['クラベルの', "Clavell's"], ['ハッサクの', "Kofu's"],
  ['チリの',     "Brassius's"],['アオキの',   "Larry's"],
  ['ハイダイの', "Ryme's"],    ['グルーシャの',"Grusha's"],
  ['オモダカの', "Rika's"],    ['ポピーの',   "Poppy's"],
  ['ハッコウの', "Hassel's"],  ['オーリムの', "Sada's"],
  ['フトゥーの', "Turo's"],    ['ゼイユの',   "Carmine's"],
  ['スグリの',   "Kieran's"],  ['ブライアの', "Briar's"],
  ['エーテル財団の', "Aether Foundation's"]
];

// Suffixes / mechanics
const JP_SUFFIX = [
  ['ex', 'ex'], ['EX', 'EX'], ['GX', 'GX'], ['VSTAR', 'VSTAR'],
  ['VMAX', 'VMAX'], ['V-UNION', 'V-UNION'], ['V', 'V'],
  ['LEGEND', 'LEGEND'], ['BREAK', 'BREAK'], ['Lv.X', 'Lv.X'],
  ['δ', 'δ'], ['プライム', 'Prime'], ['☆', 'Star']
];


// Chinese form prefixes (Traditional and Simplified)
const CN_PREFIX = [
  ['超級', 'Mega'], ['超级', 'Mega'],
  ['火箭隊的', "Team Rocket's"], ['火箭队的', "Team Rocket's"],
  ['洗翠', 'Hisuian'],
  ['伽勒爾', 'Galarian'], ['伽勒尔', 'Galarian'],
  ['阿羅拉', 'Alolan'], ['阿罗拉', 'Alolan'],
  ['帕底亞', 'Paldean'], ['帕底亚', 'Paldean'],
  ['起源形態', 'Origin Forme'], ['起源形态', 'Origin Forme'],
  ['閃耀', 'Radiant'], ['闪耀', 'Radiant'],
  ['白馬', 'Ice Rider'], ['白马', 'Ice Rider'],
  ['黑馬', 'Shadow Rider'], ['黑马', 'Shadow Rider'],
  ['鐵', 'Iron'], ['铁', 'Iron'],
  ['太晶', 'Terastal']
];

// Chinese trainer possessives
const CN_TRAINER = [
  ['N的', "N's"],
  ['莉莉艾的', "Lillie's"], ['莉莉艾的', "Lillie's"],
  ['瑪俐的', "Marnie's"], ['玛俐的', "Marnie's"],
  ['艾莉絲的', "Iris's"], ['艾莉丝的', "Iris's"],
  ['竹蘭的', "Cynthia's"], ['竹兰的', "Cynthia's"],
  ['小霞的', "Misty's"], ['小剛的', "Brock's"], ['小刚的', "Brock's"],
  ['莉佳的', "Erika's"], ['娜姿的', "Sabrina's"],
  ['坂木的', "Giovanni's"], ['大吾的', "Steven's"],
  ['奇樹的', "Iono's"], ['奇树的', "Iono's"],
  ['佩伯的', "Arven's"], ['波璐的', "Penny's"],
  ['青綠的', "Blue's"], ['青绿的', "Blue's"],
  ['赤紅的', "Red's"], ['赤红的', "Red's"],
  ['大木博士的', "Oak's"]
];

let POKEDEX = null;
function loadPokedex() {
  if (POKEDEX) return POKEDEX;
  try { POKEDEX = JSON.parse(fs.readFileSync(POKEDEX_FILE, 'utf8')); }
  catch { POKEDEX = null; }
  return POKEDEX;
}

// Build the Japanese -> English dictionary from PokeAPI
async function buildPokedex() {
  console.log(`\n${'='.repeat(64)}`);
  console.log('  BUILDING MULTILINGUAL POKEMON DICTIONARY (PokeAPI)');
  console.log(`${'='.repeat(64)}\n`);

  // Discover which language codes PokeAPI actually uses, rather than assuming
  const probe = await get('https://pokeapi.co/api/v2/pokemon-species/150');
  await sleep(200);
  if (!probe || !probe.names) { console.log('  PokeAPI unreachable'); return; }

  const langs = probe.names.map(n => n.language && n.language.name).filter(Boolean);
  console.log('  Language codes available: ' + langs.join(', ') + '\n');

  // Anything that isn't English is worth indexing — we translate INTO English
  const WANT = langs.filter(L => L !== 'en' && L !== 'roomaji');
  console.log('  Indexing: ' + WANT.join(', ') + '\n');

  const dict = {};
  const perLang = {};
  let id = 1, misses = 0, found = 0;

  while (id <= 1030 && misses < 12) {
    const d = await get(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    await sleep(120);
    if (!d || !d.names) { misses++; id++; continue; }
    misses = 0;

    const byLang = {};
    d.names.forEach(n => { if (n.language) byLang[n.language.name] = n.name; });
    const en = byLang['en'];
    if (en) {
      WANT.forEach(L => {
        if (byLang[L]) {
          dict[byLang[L]] = en;
          perLang[L] = (perLang[L] || 0) + 1;
        }
      });
      found++;
      if (id % 200 === 0) {
        const sample = WANT.slice(0, 3).map(L => byLang[L] || '-').join(' / ');
        console.log(`  ${String(id).padStart(4)}  ${sample} -> ${en}`);
      }
    }
    id++;
  }

  fs.writeFileSync(POKEDEX_FILE, JSON.stringify(dict, null, 0));
  POKEDEX = dict;

  console.log(`\n  ${found} species indexed`);
  console.log('  Names captured per language:');
  Object.entries(perLang).sort((a,b) => b[1]-a[1]).forEach(([L,n]) => {
    console.log(`    ${L.padEnd(12)} ${n}`);
  });
  console.log(`\n  ${Object.keys(dict).length} total name variants -> ${POKEDEX_FILE}\n`);

  const hasCN = Object.keys(perLang).some(L => L.startsWith('zh'));
  if (!hasCN) {
    console.log('  NOTE: no Chinese names available from PokeAPI.');
    console.log('  Chinese cards will rely on English-release matching only.\n');
  }
}

// Translate a localized card name into English.
// Works for Japanese and both Chinese scripts — the structure is the same:
//   [trainer possessive][form prefix][Pokemon][mechanic suffix]
function translateName(name, lang) {
  if (!name) return null;
  const dict = loadPokedex();
  if (!dict) return null;

  const isCN = lang === 'zh-tw' || lang === 'zh-cn';
  const trainers = isCN ? CN_TRAINER.concat(JP_TRAINER) : JP_TRAINER.concat(CN_TRAINER);
  const prefixes = isCN ? CN_PREFIX.concat(JP_PREFIX)  : JP_PREFIX.concat(CN_PREFIX);

  let rest = String(name).trim();
  let prefixEn = '', suffixEn = '';

  // Longest match first so 火箭隊的 beats a shorter overlap
  const sorted = arr => arr.slice().sort((a, b) => b[0].length - a[0].length);

  for (const [src, en] of sorted(trainers)) {
    if (rest.startsWith(src)) { prefixEn = en + ' '; rest = rest.slice(src.length); break; }
  }
  for (const [src, en] of sorted(prefixes)) {
    if (rest.startsWith(src)) { prefixEn += en + ' '; rest = rest.slice(src.length); break; }
  }
  for (const [src, en] of sorted(JP_SUFFIX)) {
    if (rest.endsWith(src)) { suffixEn = ' ' + en; rest = rest.slice(0, -src.length); break; }
  }

  rest = rest.trim();
  const base = dict[rest];
  if (!base) return null;

  return (prefixEn + base + suffixEn).replace(/\s+/g, ' ').trim();
}

// Kept for compatibility
function translateJP(name) { return translateName(name, 'ja'); }


async function backfillNames(lang) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  if (!lang || lang === 'en') { console.log('  usage: node ingest.js names <ja|zh-tw|zh-cn>'); return; }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  BACKFILL ENGLISH NAMES — ${lang}`);
  console.log(`${'='.repeat(64)}\n`);

  const dict = loadPokedex();
  if (dict) console.log(`  Pokedex loaded: ${Object.keys(dict).length} name variants\n`);
  else console.log('  No pokedex found — run "node ingest.js pokedex" first\n');

  const sets = await db.query(
    `SELECT DISTINCT set_api_id FROM cards
     WHERE api_card_id LIKE $1 AND (name_en IS NULL OR set_name_en IS NULL)
     ORDER BY set_api_id`, [lang + '-%']);

  console.log(`  ${sets.rows.length} sets need English names\n`);
  let viaRelease = 0, viaTranslate = 0, unresolved = 0;

  for (const row of sets.rows) {
    const setId = row.set_api_id;
    process.stdout.write(`  ${setId.padEnd(14)}`);

    // 1. Try the English release — same id first, then a known equivalent
    const enIndex = {};
    let enSetName = null;
    for (const cand of [setId, EQUIV_EN_SET[setId]].filter(Boolean)) {
      const tdEn = await get(`${TCGDEX}/en/sets/${cand}`);
      await sleep(DELAY_TCGDEX);
      if (tdEn && tdEn.cards && tdEn.cards.length) {
        enSetName = tdEn.name;
        tdEn.cards.forEach(c => {
          const n = String(c.localId);
          enIndex[n] = c.name;
          enIndex[n.replace(/^0+/, '')] = c.name;
        });
        break;
      }
    }

    // 2. Translate whatever the release didn't cover
    const cards = await db.query(
      `SELECT api_card_id, name, number FROM cards
       WHERE set_api_id=$1 AND api_card_id LIKE $2`,
      [setId, lang + '-%']);

    let matched = 0, translated = 0, missed = 0;
    for (const c of cards.rows) {
      const num = String(c.number), bare = num.replace(/^0+/, '');
      let en = enIndex[num] || enIndex[bare] || null;
      let src = 'release';

      if (!en) { en = translateName(c.name, lang); src = 'translate'; }

      if (!en) { missed++; continue; }

      await db.query(
        `UPDATE cards SET name_en=$2, set_name_en=COALESCE($3, set_name_en), updated_at=NOW()
         WHERE api_card_id=$1`,
        [c.api_card_id, en, enSetName]).catch(() => {});

      if (src === 'release') matched++; else translated++;
    }

    viaRelease += matched; viaTranslate += translated; unresolved += missed;
    const parts = [];
    if (matched)    parts.push(`${matched} from EN release`);
    if (translated) parts.push(`${translated} translated`);
    if (missed)     parts.push(`${missed} unresolved`);
    console.log(parts.length ? parts.join(', ') : 'nothing to do');
    await sleep(300);
  }

  console.log(`\n  ${viaRelease} from English releases`);
  console.log(`  ${viaTranslate} translated from Japanese`);
  console.log(`  ${unresolved} could not be resolved\n`);
}


// ══════════════════════════════════════════════════════════════
// SETMETA — backfill set logo, series and release date
//   node ingest.js setmeta ja
//   node ingest.js setmeta            all languages
// ══════════════════════════════════════════════════════════════
// Our English set id -> pokemontcg.io's, for sets TCGdex has no logo for.
// Verified 2026-09-26 against /v2/sets: me55 "30th Celebration", me55c
// "30th Celebration: Classic Collection", cel25c "Celebrations: Classic
// Collection" — each carries images.logo.
const PTCG_LOGO_SET = { '30th': 'me55', '30th-c': 'me55c', 'cel25cc': 'cel25c' };

async function backfillSetMeta(langArg, flag) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  const langs = (langArg && langArg !== '--force') ? [langArg] : ['en', 'ja', 'zh-tw', 'zh-cn'];
  const force = flag === '--force' || langArg === '--force';

  for (const lang of langs) {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`  SET METADATA — ${lang}`);
    console.log(`${'='.repeat(64)}\n`);

    // The SET LIST carries logo, serie and releaseDate even for sets whose
    // per-set endpoint returns no cards. Sets ingested from Limitless never
    // got this, which is why 138 Japanese sets had no logo.
    const list = await get(`${TCGDEX}/${lang}/sets`);
    await sleep(DELAY_TCGDEX);
    const byId = {};
    (list || []).forEach(s => {
      byId[s.id] = s;
      byId[String(s.id).toUpperCase()] = s;
      byId[String(s.id).toLowerCase()] = s;
    });
    console.log(`  TCGdex set list: ${Object.keys(byId).length ? (list || []).length : 0} entries\n`);

    const cond = force ? '' : 'AND (set_logo IS NULL OR set_series IS NULL)';
    const sets = await db.query(
      `SELECT DISTINCT set_api_id FROM cards
       WHERE api_card_id LIKE $1 ${cond}
       ORDER BY set_api_id`, [lang + '-%']);

    console.log(`  ${sets.rows.length} sets need metadata\n`);
    let ok = 0, fromList = 0, miss = 0;

    for (const row of sets.rows) {
      const setId = row.set_api_id;
      process.stdout.write(`  ${setId.padEnd(14)}`);

      let logo = null, serie = null, rel = null, src = null;

      // 1. Per-set endpoint — richest, but empty for many sets
      const td = await get(`${TCGDEX}/${lang}/sets/${setId}`);
      await sleep(DELAY_TCGDEX);
      if (td) {
        if (td.logo) logo = await tcgdexLogo(td.logo);
        if (td.serie && td.serie.name) serie = td.serie.name;
        if (td.releaseDate) rel = td.releaseDate;
        src = 'set endpoint';
      }

      // 2. Fall back to the set list entry
      const le = byId[setId] || byId[String(setId).toUpperCase()] || byId[String(setId).toLowerCase()];
      if (le) {
        if (!logo && le.logo) { logo = await tcgdexLogo(le.logo); if (logo) src = src || 'set list'; }
        if (!serie && le.serie && le.serie.name) { serie = le.serie.name; src = src || 'set list'; }
        if (!rel && le.releaseDate) { rel = le.releaseDate; src = src || 'set list'; }
        if (src === 'set list') fromList++;
      }

      // 3. English only: pokemontcg.io, for sets TCGdex holds no logo for.
      //    30th Celebration, 30th Classic Collection and Celebrations CC
      //    have none on TCGdex (logo: undefined on both the set and the
      //    list), so --force alone could never give them one. The ids are
      //    an explicit map, not a name search, and the URL is the one the
      //    API returns — never constructed. See "Don't guess URLs".
      if (!logo && lang === 'en' && PTCG_LOGO_SET[setId]) {
        const ps = await get(`${TCG_API}/sets/${PTCG_LOGO_SET[setId]}`, TCG_H);
        await sleep(DELAY_PTCG);
        const pl = ps && ps.data && ps.data.images && ps.data.images.logo;
        if (pl) { logo = pl; src = (src ? src + ' + ' : '') + 'pokemontcg.io logo'; }
      }

      if (!logo && !serie && !rel) { console.log('no metadata anywhere'); miss++; continue; }

      const r = await db.query(
        `UPDATE cards SET
           set_logo    = COALESCE($2, set_logo),
           set_series  = COALESCE($3, set_series),
           set_release = COALESCE($4::date, set_release),
           updated_at  = NOW()
         WHERE set_api_id=$1 AND api_card_id LIKE $5`,
        [setId, logo, serie, rel, lang + '-%']).catch(e => ({ rowCount: 0, err: e.message }));

      const bits = [];
      if (logo)  bits.push('logo');
      if (serie) bits.push(serie);
      if (rel)   bits.push(rel);
      console.log(`${String(r.rowCount).padStart(4)} cards  ${bits.join(' · ')}   [${src}]`);
      ok++;
    }
    console.log(`\n  ${ok} sets updated (${fromList} rescued from the set list), ${miss} with nothing available\n`);
  }
}

// ══════════════════════════════════════════════════════════════
// CARD ARTWORK
//
// A Japanese card is not an English card. Chinese sets carry exclusive
// illustrations that exist in no other language. So we never substitute
// one language's artwork for another — we go and find the real image.
//
//   node ingest.js imgclean          remove any borrowed artwork
//   node ingest.js imgprobe ja       test which sources actually serve JP art
//   node ingest.js imgfetch ja       fetch real artwork using working sources
// ══════════════════════════════════════════════════════════════

// ── Candidate image sources, in preference order ───────────────
// Each builds a URL from (lang, setId, cardNumber, series).
// `probe` reports which ones return HTTP 200 for real cards.
const IMG_SOURCES = [
  {
    name: 'tcgdex_asset_png',
    note: 'TCGdex CDN, serie id read from the API (not guessed)',
    langs: ['ja','zh-tw','zh-cn','en'],
    url: (lang, setId, num, serie) =>
      `https://assets.tcgdex.net/${lang}/${serie}/${setId}/${num}/high.png`
  },
  {
    name: 'tcgdex_asset_webp',
    note: 'TCGdex CDN, webp variant',
    langs: ['ja','zh-tw','zh-cn','en'],
    url: (lang, setId, num, serie) =>
      `https://assets.tcgdex.net/${lang}/${serie}/${setId}/${num}/high.webp`
  },
  {
    name: 'pokecardex_jp',
    note: 'PokeCardex — has a dedicated Japanese sets archive',
    langs: ['ja'],
    url: (lang, setId, num) =>
      `https://www.pokecardex.com/assets/images/sets_jp/${String(setId).toUpperCase()}/HD/${String(num).padStart(3,'0')}.jpg`
  },
  {
    name: 'pokecardex_jp_lower',
    note: 'PokeCardex, lowercase set code',
    langs: ['ja'],
    url: (lang, setId, num) =>
      `https://www.pokecardex.com/assets/images/sets_jp/${String(setId).toLowerCase()}/HD/${String(num).padStart(3,'0')}.jpg`
  },
  {
    name: 'pokecardex_intl',
    note: 'PokeCardex international archive',
    langs: ['en','zh-tw','zh-cn'],
    url: (lang, setId, num) =>
      `https://www.pokecardex.com/assets/images/sets/${String(setId).toUpperCase()}/HD/${String(num).padStart(3,'0')}.jpg`
  },
  {
    name: 'limitless_jp',
    note: 'Limitless TCG CDN, tpc path',
    langs: ['ja'],
    url: (lang, setId, num) =>
      `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${String(setId).toUpperCase()}/${String(setId).toUpperCase()}_${String(num).padStart(3,'0')}_R_JP.png`
  },
  {
    name: 'limitless_intl',
    note: 'Limitless TCG CDN, tpci path',
    langs: ['en'],
    url: (lang, setId, num) =>
      `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${String(setId).toUpperCase()}/${String(setId).toUpperCase()}_${String(num).padStart(3,'0')}_R_EN.png`
  },
  {
    name: 'serebii_jp',
    note: 'Serebii card archive',
    langs: ['ja'],
    url: (lang, setId, num) =>
      `https://www.serebii.net/card/${String(setId).toLowerCase()}/${parseInt(num)}.jpg`
  }
];

// Ask TCGdex what serie a set actually belongs to, rather than guessing.
const SERIE_CACHE = {};
async function serieIdFor(lang, setId) {
  const key = lang + '|' + setId;
  if (SERIE_CACHE[key] !== undefined) return SERIE_CACHE[key];
  const d = await get(`${TCGDEX}/${lang}/sets/${setId}`);
  await sleep(150);
  const id = (d && d.serie && d.serie.id) ? d.serie.id : null;
  SERIE_CACHE[key] = id;
  return id;
}

function serieFor(setId) {
  const s = String(setId).toLowerCase();
  if (/^m\d/.test(s) || s.startsWith('me')) return 'me';
  if (s.startsWith('sv') || s.startsWith('cs')) return 'sv';
  if (s.startsWith('swsh') || /^s\d/.test(s) || s.startsWith('sc')) return 'swsh';
  if (s.startsWith('sm')) return 'sm';
  if (s.startsWith('xy') || s.startsWith('cp')) return 'xy';
  if (s.startsWith('bw')) return 'bw';
  if (s.startsWith('base') || s.startsWith('pmcg')) return 'base';
  if (s.startsWith('neo')) return 'neo';
  if (s.startsWith('pcg') || s.startsWith('ex')) return 'ex';
  return 'other';
}

// Existence check. Many CDNs reject or mishandle HEAD, so fall through
// to a ranged GET and finally a plain GET before declaring a miss.
async function urlExists(url, debug) {
  const attempts = [
    { name: 'HEAD',  opts: { method: 'HEAD' } },
    { name: 'RANGE', opts: { headers: { Range: 'bytes=0-1023' } } },
    { name: 'GET',   opts: {} }
  ];
  for (const a of attempts) {
    try {
      const r = await fetch(url, Object.assign({
        headers: Object.assign({ 'User-Agent': UA_SAFE }, (a.opts.headers || {}))
      }, a.opts));
      if (debug) console.log(`        ${a.name} -> ${r.status} ${r.headers.get('content-type') || ''}`);
      if (r.ok) {
        const ct = String(r.headers.get('content-type') || '');
        // A 200 that returns HTML is a soft-404 page, not an image
        if (ct && ct.indexOf('image') < 0 && ct.indexOf('octet-stream') < 0) continue;
        return true;
      }
      if (r.status === 404) return false;   // definitive, stop trying
    } catch (e) {
      if (debug) console.log(`        ${a.name} -> ${e.message}`);
    }
  }
  return false;
}

// Confirm the checker itself works before trusting any probe result.
async function selfTestChecker(lang) {
  if (!db) return true;
  const known = await db.query(`
    SELECT image_large, image_small, set_api_id, number FROM cards
    WHERE api_card_id LIKE $1 AND image_small IS NOT NULL
    LIMIT 3`, [lang + '-%']);
  if (!known.rows.length) return true;   // nothing to test against

  console.log('  SELF-TEST — checking URLs we know are good:\n');
  let pass = 0;
  for (const row of known.rows) {
    const url = row.image_large || row.image_small;
    console.log(`    ${row.set_api_id}-${row.number}`);
    const ok = await urlExists(url, true);
    console.log(`      ${ok ? 'OK  ' : 'FAIL'} ${url}\n`);
    if (ok) pass++;
    await sleep(200);
  }
  if (pass === 0) {
    console.log('  The checker cannot even confirm URLs that are already in use.');
    console.log('  Every result below would be a false negative — fix this first.');
    console.log('  Likely causes: network filtering, TLS interception, or the CDN');
    console.log('  rejecting this client.\n');
    return false;
  }
  console.log(`  Checker verified (${pass}/${known.rows.length} known-good URLs confirmed)\n`);
  return true;
}


// ── CLEAN — strip artwork borrowed from another language ───────
async function cleanBorrowedImages() {
  if (!db) { console.log('  DATABASE_URL required'); return; }

  console.log(`\n${'='.repeat(64)}`);
  console.log('  REMOVING BORROWED ARTWORK');
  console.log(`${'='.repeat(64)}\n`);

  const before = await db.query(`
    SELECT split_part(api_card_id,'-',1) AS lang, COUNT(*)::int AS n
    FROM cards
    WHERE image_lang IS NOT NULL
      AND image_lang <> split_part(api_card_id,'-',1)
    GROUP BY 1 ORDER BY n DESC`);

  if (!before.rows.length) {
    console.log('  No borrowed artwork found — nothing to clean.\n');
    return;
  }
  before.rows.forEach(r => console.log(`  ${r.lang.padEnd(8)} ${r.n} cards using another language's art`));

  const r = await db.query(`
    UPDATE cards SET image_small=NULL, image_large=NULL, image_lang=NULL, updated_at=NOW()
    WHERE image_lang IS NOT NULL
      AND image_lang <> split_part(api_card_id,'-',1)`);

  console.log(`\n  ${r.rowCount} cards cleared — they will show the rarity tile until`);
  console.log('  real artwork is found. Run "node ingest.js imgprobe <lang>" next.\n');
}

// ── PROBE — which sources actually serve this language? ────────
async function probeImageSources(lang, onlySet) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  PROBING IMAGE SOURCES — ${lang}`);
  console.log(`${'='.repeat(64)}\n`);

  // ── Start from what ALREADY works. If some cards in this language have
  //    artwork, their URL pattern is the answer we're looking for. ──
  const working = await db.query(`
    SELECT DISTINCT ON (set_api_id) set_api_id, number, image_large, image_small
    FROM cards
    WHERE api_card_id LIKE $1 AND image_small IS NOT NULL
    ORDER BY set_api_id LIMIT 8`, [lang + '-%']);

  if (working.rows.length) {
    console.log(`  ${working.rows.length} sets in this language ALREADY have artwork.`);
    console.log('  Their URL pattern is the one to replicate:\n');
    working.rows.forEach(r => {
      console.log(`    ${r.set_api_id}-${r.number}`);
      console.log(`      ${r.image_large || r.image_small}`);
    });
    console.log('');
  } else {
    console.log('  No cards in this language have artwork yet.\n');
  }

  const checkerOk = await selfTestChecker(lang);
  if (!checkerOk) return;

  const sample = await db.query(`
    SELECT DISTINCT ON (set_api_id) api_card_id, set_api_id, number, name, set_release
    FROM cards
    WHERE api_card_id LIKE $1 AND image_small IS NULL
      AND ($2::text IS NULL OR set_api_id = $2)
    ORDER BY set_api_id, number`, [lang + '-%', onlySet || null]);
  // Prefer recent sets. pg returns DATE as a JS Date, so compare timestamps —
  // String(date) gives "Wed Oct 20 2000..." which sorts alphabetically = garbage.
  const ts = v => v ? new Date(v).getTime() : 0;
  sample.rows.sort((a, b) => ts(b.set_release) - ts(a.set_release));
  sample.rows = sample.rows.slice(0, 8);

  if (!sample.rows.length) { console.log(`  No ${lang} cards are missing artwork.\n`); return; }

  console.log(`  Testing ${sample.rows.length} cards that are missing artwork\n`);
  const usable = IMG_SOURCES.filter(s => s.langs.includes(lang));
  const score = {};

  for (const card of sample.rows) {
    // Real serie id from TCGdex, not a guess
    const serie = (await serieIdFor(lang, card.set_api_id)) || serieFor(card.set_api_id);
    console.log(`  ${card.set_api_id}-${card.number}  ${String(card.name).slice(0,18)}   serie=${serie}`);
    for (const src of usable) {
      const url = src.url(lang, card.set_api_id, card.number, serie);
      const ok = await urlExists(url);
      await sleep(250);
      score[src.name] = (score[src.name] || 0) + (ok ? 1 : 0);
      console.log(`      ${ok ? 'HIT ' : ' -  '} ${src.name.padEnd(20)} ${url.slice(0, 74)}`);
    }
    console.log('');
  }

  console.log(`  ${'-'.repeat(56)}`);
  console.log('  RESULTS');
  const ranked = Object.entries(score).sort((a,b) => b[1]-a[1]);
  ranked.forEach(([name, hits]) => {
    const src = IMG_SOURCES.find(s => s.name === name);
    const pct = Math.round((hits / sample.rows.length) * 100);
    console.log(`    ${String(pct + '%').padStart(5)}  ${name.padEnd(20)} ${src.note}`);
  });

  if (ranked.some(([, h]) => h > 0)) {
    console.log(`\n  Working source found. Run:  node ingest.js imgfetch ${lang}\n`);
  } else {
    console.log('\n  NO CANDIDATE WORKS.');
    if (working.rows.length) {
      console.log('  But some cards DO have artwork (listed above) — study those URLs');
      console.log('  and add a matching pattern to IMG_SOURCES.');
    }
    console.log('  Do not substitute another language\'s artwork.\n');
  }
}


// ── FETCH — populate real artwork from whichever source responds ──
async function fetchImages(lang, limitArg) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';
  const limit = parseInt(limitArg) || 100000;

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  FETCHING REAL ARTWORK — ${lang}`);
  console.log(`${'='.repeat(64)}\n`);

  const usable = IMG_SOURCES.filter(s => s.langs.includes(lang));
  console.log('  Sources, in order:');
  usable.forEach(s => console.log(`    ${s.name.padEnd(22)} ${s.note}`));
  console.log('');

  const need = await db.query(`
    SELECT api_card_id, set_api_id, number, name
    FROM cards
    WHERE api_card_id LIKE $1 AND image_small IS NULL
    ORDER BY set_api_id, number
    LIMIT $2`, [lang + '-%', limit]);

  console.log(`  ${need.rows.length} cards without artwork\n`);
  if (!need.rows.length) return;

  let found = 0, missed = 0;
  const bySource = {};
  const deadSets = new Set();
  const t0 = Date.now();

  for (let i = 0; i < need.rows.length; i++) {
    const card = need.rows[i];
    // If a set has failed 12 times running, stop hammering it
    if (deadSets.has(card.set_api_id)) { missed++; continue; }

    const serie = (await serieIdFor(lang, card.set_api_id)) || serieFor(card.set_api_id);
    let hit = null;

    for (const src of usable) {
      const url = src.url(lang, card.set_api_id, card.number, serie);
      if (await urlExists(url)) { hit = { url, src: src.name }; break; }
      await sleep(200);
    }

    if (hit) {
      const low = hit.url.replace('/high.', '/low.');
      await db.query(
        `UPDATE cards SET image_small=$2, image_large=$3, image_lang=$4, updated_at=NOW()
         WHERE api_card_id=$1`,
        [card.api_card_id, low, hit.url, lang]).catch(() => {});
      found++;
      bySource[hit.src] = (bySource[hit.src] || 0) + 1;
    } else {
      missed++;
      // Track consecutive failures per set
      const key = '_fail_' + card.set_api_id;
      bySource[key] = (bySource[key] || 0) + 1;
      if (bySource[key] >= 12) {
        deadSets.add(card.set_api_id);
        console.log(`  ${card.set_api_id}: no source has this set — skipping the rest`);
      }
    }

    if ((i + 1) % 25 === 0 || i === need.rows.length - 1) {
      const pct = (((i + 1) / need.rows.length) * 100).toFixed(1);
      const eta = Math.round(((Date.now() - t0) / 60000 / (i + 1)) * (need.rows.length - i - 1));
      console.log(`  [${pct}%] ${found} found, ${missed} missing   eta ${eta}m`);
    }
  }

  console.log(`\n  ${found} cards given real artwork, ${missed} still without`);
  console.log('  By source:');
  Object.entries(bySource)
    .filter(([k]) => !k.startsWith('_fail_'))
    .sort((a,b) => b[1]-a[1])
    .forEach(([k,v]) => console.log(`    ${k.padEnd(22)} ${v}`));
  console.log('');
}


// ══════════════════════════════════════════════════════════════
// IMGREPORT — the shape of the artwork gap
//   node ingest.js imgreport ja
// ══════════════════════════════════════════════════════════════
async function imageReport(lang) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ARTWORK COVERAGE — ${lang}`);
  console.log(`${'='.repeat(72)}\n`);

  const rows = await db.query(`
    SELECT set_api_id,
           MAX(set_name)    AS set_name,
           MAX(set_series)  AS series,
           MAX(set_release) AS release,
           COUNT(*)::int              AS total,
           COUNT(image_small)::int    AS have
    FROM cards WHERE api_card_id LIKE $1
    GROUP BY set_api_id
    ORDER BY MAX(set_release) DESC NULLS LAST`, [lang + '-%']);

  console.log('  set          series      release     cards   have   missing');
  console.log('  ' + '-'.repeat(66));

  const bySeries = {};
  let tTotal = 0, tHave = 0;

  rows.rows.forEach(r => {
    const miss = r.total - r.have;
    tTotal += r.total; tHave += r.have;
    const s = r.series || '(none)';
    if (!bySeries[s]) bySeries[s] = { total: 0, have: 0, sets: 0 };
    bySeries[s].total += r.total;
    bySeries[s].have  += r.have;
    bySeries[s].sets  += 1;

    const rel = r.release ? new Date(r.release).toISOString().slice(0, 10) : '   -      ';
    const flag = miss === 0 ? '' : (r.have === 0 ? '  ALL MISSING' : '');
    console.log(`  ${String(r.set_api_id).padEnd(12)} ${String(s).slice(0,10).padEnd(11)} ${rel}  `
      + `${String(r.total).padStart(5)}  ${String(r.have).padStart(5)}  ${String(miss).padStart(6)}${flag}`);
  });

  console.log('  ' + '-'.repeat(66));
  console.log(`  TOTAL${' '.repeat(31)}${String(tTotal).padStart(5)}  ${String(tHave).padStart(5)}  `
    + `${String(tTotal - tHave).padStart(6)}\n`);

  console.log('  BY SERIES\n');
  console.log('  series           sets   cards   have   coverage');
  console.log('  ' + '-'.repeat(50));
  Object.entries(bySeries)
    .sort((a, b) => (b[1].total - b[1].have) - (a[1].total - a[1].have))
    .forEach(([s, v]) => {
      const pct = v.total ? Math.round((v.have / v.total) * 100) : 0;
      console.log(`  ${s.slice(0,15).padEnd(16)} ${String(v.sets).padStart(4)} `
        + `${String(v.total).padStart(7)} ${String(v.have).padStart(6)}   ${String(pct + '%').padStart(5)}`);
    });

  console.log('\n  Series at 0% have no artwork on TCGdex at all — those need a');
  console.log('  different source. Series above 0% are partially covered; the');
  console.log('  same pattern should fill the rest.\n');
  console.log('  Probe a specific set with:  node ingest.js imgprobe ' + lang + ' <setId>\n');
}


// ══════════════════════════════════════════════════════════════
// IMAGE SCRAPERS
//
// Guessing URL patterns has repeatedly failed. Instead: fetch the
// page that lists a whole set, and read the real image URLs out of
// the HTML. Whatever the site actually serves is what we store.
//
// Each scraper returns { "1": "https://...", "002": "https://..." }
// mapping card number -> image URL.
// ══════════════════════════════════════════════════════════════

// Pull (cardNumber, imageUrl) pairs out of a set-listing page.
// Handles the common shape: a link ending in the card number wrapping an <img>.
function extractNumberedImages(html, opts) {
  opts = opts || {};
  const out = {};
  const imgFilter = opts.imgFilter || (u => /\.(png|jpe?g|webp)/i.test(u));

  // Pattern A: <a href=".../<num>"> ... <img src="...">
  const reA = /href="[^"]*?\/(\d{1,4})(?:[/"'?][^"]*)?"[^>]*>[\s\S]{0,400}?<img[^>]+src="([^"]+)"/gi;
  let m;
  while ((m = reA.exec(html))) {
    const num = m[1], url = m[2];
    if (!imgFilter(url)) continue;
    if (!out[num]) out[num] = url.startsWith('//') ? 'https:' + url : url;
  }

  // Pattern B: <img src="..._<num>_..."> — number embedded in the filename
  const reB = /<img[^>]+src="([^"]*?[_/](\d{1,4})[_.][^"]*\.(?:png|jpe?g|webp))"/gi;
  while ((m = reB.exec(html))) {
    const url = m[1], num = String(parseInt(m[2]));
    if (!imgFilter(url)) continue;
    if (!out[num]) out[num] = url.startsWith('//') ? 'https:' + url : url;
  }

  // Also index zero-padded forms so lookups match either way
  Object.keys(out).forEach(k => {
    const bare = String(parseInt(k));
    const p3 = bare.padStart(3, '0');
    if (!out[bare]) out[bare] = out[k];
    if (!out[p3])   out[p3]   = out[k];
  });
  return out;
}


// pokemon-card.com puts the collector number in its own element
// ("001/174") and names images with an internal hash, so the generic
// href-based extractor can't pair them.
function extractPokemonCardJP(html) {
  const out = {};
  // <img src="...card_images/large/SET/xxxxx_P_NAME.jpg"> ... 001/174
  const re = /<img[^>]+src="([^"]*card_images[^"]*\.(?:jpg|png))"[\s\S]{0,800}?(\d{1,4})\s*[\/／]\s*\d{1,4}/gi;
  let m;
  while ((m = re.exec(html))) {
    let url = m[1];
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('/')) url = 'https://www.pokemon-card.com' + url;
    const num = String(parseInt(m[2]));
    if (!out[num]) {
      out[num] = url;
      out[num.padStart(3, '0')] = url;
    }
  }
  return out;
}


// Limitless names its files {SET}_{NUM}_R_{LANG}[_SM].png — the collector
// number is in the filename, which is unambiguous. Pairing an <img> with a
// nearby href gets it wrong because their grid markup interleaves the two.
function extractLimitless(html) {
  const out = {};
  const re = /https?:\/\/[^"'\s]*?\/(?:tpc|tpci)\/([A-Za-z0-9.\-]+)\/\1_(\d{1,4})_[A-Z]+_[A-Z]{2}(?:_SM)?\.(?:png|jpe?g|webp)/gi;
  let m;
  while ((m = re.exec(html))) {
    const num = String(parseInt(m[2]));
    let url = m[0];
    // Prefer the full-size scan over the _SM thumbnail
    const full = url.replace(/_SM\.(png|jpe?g|webp)$/i, '.$1');
    if (!out[num] || /_SM\./i.test(out[num])) {
      out[num] = full;
      out[num.padStart(3, '0')] = full;
    }
  }
  return out;
}

const IMG_SCRAPERS = [
  {
    name: 'limitless_jp',
    note: 'limitlesstcg.com Japanese set pages',
    langs: ['ja'],
    pages: setId => [
      `https://limitlesstcg.com/cards/jp/${setId}`,
      `https://limitlesstcg.com/cards/jp/${String(setId).toUpperCase()}`,
      `https://limitlesstcg.com/cards/jp/${String(setId).toLowerCase()}`
    ],
    extract: extractLimitless
  },
  {
    name: 'limitless_intl',
    note: 'limitlesstcg.com international set pages',
    langs: ['en'],
    pages: setId => [
      `https://limitlesstcg.com/cards/${setId}`,
      `https://limitlesstcg.com/cards/${String(setId).toUpperCase()}`
    ],
    extract: extractLimitless
  },
  {
    name: 'pokemon_card_jp',
    note: 'pokemon-card.com — the official Japanese database',
    langs: ['ja'],
    pages: setId => [
      `https://www.pokemon-card.com/card-search/index.php?keyword=&se_ta=&regulation_sidebar_form=all&pg=&illust=&sm_and_keyword=true&expansion_code=${setId}`,
      `https://www.pokemon-card.com/card-search/index.php?expansion_code=${setId}`
    ],
    extract: extractPokemonCardJP
  },
  {
    name: 'pokellector_jp',
    note: 'pokellector.com Japanese set pages',
    langs: ['ja'],
    pages: setId => [
      `https://www.pokellector.com/jp/sets/${setId}`,
      `https://www.pokellector.com/sets/${setId}`
    ],
    extract: html => extractNumberedImages(html, {
      imgFilter: u => /pokellector|den-cards/i.test(u)
    })
  },
  {
    name: 'tcgcollector',
    note: 'tcgcollector.com — carries Japanese and Chinese cards',
    langs: ['ja','zh-tw','zh-cn'],
    pages: setId => [
      `https://www.tcgcollector.com/cards/jp?releaseDateOrder=newToOld&displayAs=images&cardsPerPage=120&setSlugs=${setId}`,
      `https://www.tcgcollector.com/cards?setSlugs=${setId}`
    ],
    extract: html => extractNumberedImages(html, {
      imgFilter: u => /tcgcollector/i.test(u)
    })
  }
];

// Run every scraper against one set and report what each found.
async function testScrapers(lang, setId) {
  if (!setId) { console.log('  usage: node ingest.js imgsrc <lang> <setId>'); return; }
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SCRAPER TEST — ${lang} / ${setId}`);
  console.log(`${'='.repeat(70)}\n`);

  const usable = IMG_SCRAPERS.filter(s => s.langs.includes(lang));
  const results = [];

  for (const sc of usable) {
    console.log(`  ${sc.name}  —  ${sc.note}`);
    let best = { count: 0 };
    for (const url of sc.pages(setId)) {
      process.stdout.write(`    ${url.slice(0, 76)}\n      `);
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': UA_SAFE, 'Accept': 'text/html,application/xhtml+xml' }
        });
        await sleep(1200);
        if (!r.ok) { console.log(`HTTP ${r.status}`); continue; }
        const html = await r.text();
        const found = sc.extract(html);
        const n = Object.keys(found).filter(k => !/^0/.test(k)).length;
        console.log(`HTTP 200, ${html.length} bytes, ${n} card images found`);
        if (n > best.count) best = { count: n, url, sample: found };
      } catch (e) { console.log(`error: ${e.message}`); }
    }
    if (best.count) {
      const keys = Object.keys(best.sample).filter(k => !/^0/.test(k))
        .sort((a,b) => parseInt(a) - parseInt(b)).slice(0, 3);
      console.log(`    BEST: ${best.count} images`);
      keys.forEach(k => console.log(`      #${k}  ${best.sample[k].slice(0, 84)}`));
      results.push({ name: sc.name, count: best.count });
    } else {
      console.log('    nothing found');
    }
    console.log('');
  }

  console.log(`  ${'-'.repeat(60)}`);
  if (results.length) {
    results.sort((a, b) => b.count - a.count);
    console.log('  WORKING SCRAPERS');
    results.forEach(r => console.log(`    ${String(r.count).padStart(4)} images   ${r.name}`));
    console.log(`\n  Fetch the whole language with:  node ingest.js imgscrape ${lang}\n`);
  } else {
    console.log('  No scraper found images for this set.');
    console.log('  Add a source to IMG_SCRAPERS and test again.\n');
  }
}

// Walk every set missing artwork and fill it from whichever scraper responds.
async function scrapeImages(lang, arg1, arg2) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';
  const force = arg1 === '--force' || arg2 === '--force';
  const onlySet = (arg1 && arg1 !== '--force') ? arg1 : null;

  if (force) {
    // Clear anything previously written by a scraper so it can be redone.
    // TCGdex-sourced artwork is left alone — that came from the API and is correct.
    const cleared = await db.query(`
      UPDATE cards SET image_small=NULL, image_large=NULL, image_lang=NULL
      WHERE api_card_id LIKE $1
        AND ($2::text IS NULL OR set_api_id = $2)
        AND image_small IS NOT NULL
        AND image_small NOT LIKE '%assets.tcgdex.net%'`,
      [lang + '-%', onlySet || null]);
    console.log(`  --force: cleared ${cleared.rowCount} scraper-sourced images for re-fetch\n`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SCRAPING ARTWORK — ${lang}`);
  console.log(`${'='.repeat(70)}\n`);

  const usable = IMG_SCRAPERS.filter(s => s.langs.includes(lang));
  console.log('  Sources, in order: ' + usable.map(s => s.name).join(', ') + '\n');

  const sets = await db.query(`
    SELECT set_api_id, MAX(set_name) AS set_name, MAX(set_release) AS release,
           COUNT(*)::int AS total, COUNT(image_small)::int AS have
    FROM cards
    WHERE api_card_id LIKE $1 AND ($2::text IS NULL OR set_api_id = $2)
    GROUP BY set_api_id
    HAVING COUNT(*) > COUNT(image_small)
    ORDER BY MAX(set_release) DESC NULLS LAST`, [lang + '-%', onlySet || null]);

  console.log(`  ${sets.rows.length} sets need artwork\n`);
  let totalFilled = 0;

  for (const row of sets.rows) {
    const setId = row.set_api_id;
    const missing = row.total - row.have;
    process.stdout.write(`  ${setId.padEnd(12)} ${String(missing).padStart(4)} missing  `);

    let images = null, usedSource = null;
    for (const sc of usable) {
      for (const url of sc.pages(setId)) {
        try {
          const r = await fetch(url, {
            headers: { 'User-Agent': UA_SAFE, 'Accept': 'text/html,application/xhtml+xml' }
          });
          await sleep(1500);              // polite — one page per 1.5s
          if (!r.ok) continue;
          const html = await r.text();
          const found = sc.extract(html);
          if (Object.keys(found).length >= 5) { images = found; usedSource = sc.name; break; }
        } catch (e) { /* next */ }
      }
      if (images) break;
    }

    if (!images) { console.log('no source'); continue; }

    const need = await db.query(
      `SELECT api_card_id, number FROM cards
       WHERE set_api_id=$1 AND api_card_id LIKE $2 AND image_small IS NULL`,
      [setId, lang + '-%']);

    let n = 0;
    for (const c of need.rows) {
      const num = String(c.number), bare = String(parseInt(num) || num);
      const url = images[num] || images[bare] || images[bare.padStart(3, '0')];
      if (!url) continue;
      await db.query(
        `UPDATE cards SET image_small=$2, image_large=$2, image_lang=$3, updated_at=NOW()
         WHERE api_card_id=$1`,
        [c.api_card_id, url, lang]).catch(() => {});
      n++;
    }
    console.log(`${String(n).padStart(4)} filled from ${usedSource}`);
    totalFilled += n;
  }

  console.log(`\n  ${totalFilled} cards given real ${lang} artwork\n`);
}


// ══════════════════════════════════════════════════════════════
// SETCOVER — price coverage per set, worst first
//   node ingest.js setcover en
// ══════════════════════════════════════════════════════════════
async function setCoverage(lang) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';

  console.log(`\n${'='.repeat(74)}`);
  console.log(`  PRICE COVERAGE BY SET — ${lang}`);
  console.log(`${'='.repeat(74)}\n`);

  const rows = await db.query(`
    SELECT c.set_api_id,
           MAX(c.set_name)    AS set_name,
           MAX(c.set_release) AS release,
           COUNT(*)::int      AS total,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM price_history p
             WHERE p.card_api_id = c.api_card_id
               AND p.source NOT LIKE 'estimate%'))::int AS priced
    FROM cards c
    WHERE c.api_card_id LIKE $1
    GROUP BY c.set_api_id
    ORDER BY MAX(c.set_release) DESC NULLS LAST`, [lang + '-%']);

  console.log('  set          release      cards  priced   coverage');
  console.log('  ' + '-'.repeat(56));

  const weak = [];
  let digitalCards = 0, digitalSets = 0;
  rows.rows.forEach(r => {
    const pct = r.total ? Math.round((r.priced / r.total) * 100) : 0;
    const rel = r.release ? new Date(r.release).toISOString().slice(0, 10) : '    -     ';
    const digital = isDigitalSet(r.set_api_id);
    const bar = digital ? '  DIGITAL — no market'
              : pct >= 80 ? '' : (pct >= 50 ? '  low' : '  VERY LOW');
    console.log(`  ${String(r.set_api_id).padEnd(12)} ${rel}  ${String(r.total).padStart(6)}  `
      + `${String(r.priced).padStart(6)}   ${String(pct + '%').padStart(5)}${bar}`);
    if (digital) { digitalCards += r.total; digitalSets++; return; }
    if (pct < 80) weak.push({ id: r.set_api_id, pct, missing: r.total - r.priced });
  });

  const phys = rows.rows.filter(r => !isDigitalSet(r.set_api_id));
  const tTotal = phys.reduce((a, r) => a + r.total, 0);
  const tPriced = phys.reduce((a, r) => a + r.priced, 0);
  console.log('  ' + '-'.repeat(56));
  console.log(`  PHYSICAL${' '.repeat(17)}${String(tTotal).padStart(6)}  ${String(tPriced).padStart(6)}   `
    + `${String(Math.round((tPriced/tTotal)*100) + '%').padStart(5)}`);
  if (digitalSets) {
    console.log(`  DIGITAL (excluded)  ${String(digitalSets).padStart(3)} sets  ${String(digitalCards).padStart(6)} cards`);
    console.log('    TCG Pocket cards exist only in-app — they have no market price');
    console.log('    and never will. Not counted above.');
  }
  console.log('');

  if (weak.length) {
    weak.sort((a, b) => b.missing - a.missing);
    console.log('  Sets below 80% — fill them with every rarity included:\n');
    weak.slice(0, 12).forEach(w =>
      console.log(`    node ingest.js safeprices ${lang} --all --set=${w.id}`
        + `${' '.repeat(Math.max(1, 14 - w.id.length))}# ${w.missing} unpriced`));
    console.log('');
  }
}


// ══════════════════════════════════════════════════════════════
// PRICEFIX — clear TCGPlayer prices written before number matching
//
// Before v4.8.0 the TCGPlayer lookup matched on card NAME only. Where a
// name repeats in a set (chase cards almost always do) every variant got
// the same arbitrary price — often off by 100x. Those rows must go.
//
//   node ingest.js pricefix en            report what would be cleared
//   node ingest.js pricefix en --delete   clear it
//   node ingest.js pricefix en --delete --set=me02.5
// ══════════════════════════════════════════════════════════════
async function priceFix(lang, ...flags) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';
  const doIt   = flags.includes('--delete');
  const setArg = (flags.find(f => String(f).startsWith('--set=')) || '').replace('--set=', '') || null;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  PRICEFIX — remove name-matched TCGPlayer prices (${lang})`);
  console.log(`${'='.repeat(70)}\n`);

  // Cards sharing a name inside one set are the ones that got scrambled
  const dupes = await db.query(`
    SELECT c.set_api_id, c.name, COUNT(*)::int AS variants
    FROM cards c
    WHERE c.api_card_id LIKE $1
      AND ($2::text IS NULL OR c.set_api_id = $2)
    GROUP BY c.set_api_id, c.name
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC`, [lang + '-%', setArg]);

  console.log(`  ${dupes.rows.length} card names appear more than once within a set.`);
  console.log('  Those are the ones whose prices could not be trusted.\n');
  dupes.rows.slice(0, 10).forEach(r =>
    console.log(`    ${String(r.set_api_id).padEnd(12)} ${String(r.name).slice(0,28).padEnd(30)} ${r.variants} variants`));
  if (dupes.rows.length > 10) console.log(`    ... and ${dupes.rows.length - 10} more`);

  const affected = await db.query(`
    SELECT COUNT(*)::int AS n FROM price_history p
    WHERE p.source LIKE 'tcgplayer%'
      AND p.card_api_id IN (
        SELECT c.api_card_id FROM cards c
        JOIN (SELECT set_api_id, name FROM cards
              WHERE api_card_id LIKE $1
              GROUP BY set_api_id, name HAVING COUNT(*) > 1) d
          ON d.set_api_id = c.set_api_id AND d.name = c.name
        WHERE c.api_card_id LIKE $1
          AND ($2::text IS NULL OR c.set_api_id = $2))`, [lang + '-%', setArg]);

  console.log(`\n  ${affected.rows[0].n} TCGPlayer price records affected.\n`);

  if (!doIt) {
    console.log('  Add --delete to remove them, then re-run:');
    console.log(`    node ingest.js safeprices ${lang} --all\n`);
    return;
  }

  const del = await db.query(`
    DELETE FROM price_history p
    WHERE p.source LIKE 'tcgplayer%'
      AND p.card_api_id IN (
        SELECT c.api_card_id FROM cards c
        JOIN (SELECT set_api_id, name FROM cards
              WHERE api_card_id LIKE $1
              GROUP BY set_api_id, name HAVING COUNT(*) > 1) d
          ON d.set_api_id = c.set_api_id AND d.name = c.name
        WHERE c.api_card_id LIKE $1
          AND ($2::text IS NULL OR c.set_api_id = $2))`, [lang + '-%', setArg]);

  console.log(`  Removed ${del.rowCount} untrustworthy price records.`);
  console.log(`  Now re-run:  node ingest.js safeprices ${lang} --all\n`);
}

// ══════════════════════════════════════════════════════════════
// PRICECHECK — show our price beside the product TCGPlayer matched
//   node ingest.js pricecheck en me02.5
// ══════════════════════════════════════════════════════════════
async function priceCheck(lang, setId) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';
  if (!setId) { console.log('  usage: node ingest.js pricecheck <lang> <setId>'); return; }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`  PRICE CHECK — ${lang} / ${setId}`);
  console.log(`${'='.repeat(78)}\n`);

  // "ours" is the card page's number: ungraded, base printing, latest real
  // row (/api/cards/:id's LATERAL). It used to be the latest row of ANY
  // grade or printing — a slab or a reverse could be what got checked (T2,
  // 2026-09-30). And the rarity filter below matches no card at all in a
  // pre-2016 set, so Expedition printed an empty table; those sets now
  // check their most valuable cards instead.
  const ours = `(SELECT price_usd FROM price_history p
            WHERE p.card_api_id = c.api_card_id AND p.source NOT LIKE 'estimate%'
              AND p.grade IS NULL AND ${require('./printsql').basePrintingSql('p', 'c')}
            ORDER BY recorded_at DESC LIMIT 1)`;
  const pick = rarityClause => db.query(`
    SELECT c.api_card_id, c.name, c.number, c.rarity, c.set_name, ${ours} AS price
    FROM cards c
    WHERE c.set_api_id = $1 AND c.api_card_id LIKE $2 ${rarityClause}
    ORDER BY 6 DESC NULLS LAST
    LIMIT 12`, [setId, lang + '-%']);
  let rows = await pick(`AND c.rarity IN ('Hyper Rare','Special Illustration Rare','Illustration Rare','Rare Ultra')`);
  if (!rows.rows.length) {
    console.log('  (no HR / SIR / IR / Ultra in this set — checking its 12 most valuable cards)');
    console.log('');
    rows = await pick('');
  }

  // PER EDITION (2026-10-01). "Live" was TCGplayer's internal search, whose
  // top hit on a WOTC holo is often the 1st Edition product — on neo1 it
  // equalled TCGdex's 1st Edition price to the cent on 10 of 12 cards, while
  // ours is (correctly) Unlimited, so it flagged 10 MISMATCHes that meant
  // only "you hold the other edition". Now each edition is compared with the
  // same edition: TCGdex's Unlimited key with our base row, its 1st Edition
  // key with our 1st Edition row. Where TCGdex has no TCGplayer price, the
  // writer's own fallback (the internal search, set-checked) is asked and
  // labelled — the tool asks the writer's question, never a different one.
  const firstEdOurs = await db.query(`
    SELECT DISTINCT ON (p.card_api_id) p.card_api_id, p.price_usd
    FROM price_history p JOIN cards c ON c.api_card_id = p.card_api_id
    WHERE c.set_api_id = $1 AND c.api_card_id LIKE $2 AND p.source NOT LIKE 'estimate%'
      AND p.grade IS NULL AND COALESCE(p.variant, '') NOT LIKE 'reverse%'
      AND ${require('./printsql').editionOfSql('p')} = '1st-edition'
    ORDER BY p.card_api_id, p.recorded_at DESC`, [setId, lang + '-%']);
  const ours1st = new Map(firstEdOurs.rows.map(r => [r.card_api_id, Number(r.price_usd)]));

  const fmt = v => v ? '$' + Number(v).toFixed(2) : '-';
  // >40% apart AND worth >= $0.25 — a ratio alone at the price floor is
  // rounding (LESSONS: a ratio is meaningless at the price floor).
  const off = (a, b) => (a && b && Math.abs(a - b) / b > 0.4 && Math.abs(a - b) >= 0.25);
  let mism = 0, compared = 0, fallback = 0, unreachable = 0;

  console.log('  #     card                     edition      ours        live            source');
  console.log('  ' + '-'.repeat(84));
  const line = (num, name, ed, ours, live, src, bad) =>
    console.log(`  ${String(num).padEnd(5)} ${String(name).slice(0, 23).padEnd(24)} ${ed.padEnd(12)} `
      + `${fmt(ours).padStart(9)}   ${fmt(live).padStart(9)}       ${src}${bad ? '  MISMATCH' : ''}`);

  for (const c of rows.rows) {
    await hostDelay('tcgdex', DELAY_TCGDEX);
    let d = null, none = null;
    try {
      const r = await fetch(`${TCGDEX}/${lang}/cards/${setId}-${tcgdexLocalId(c.number)}`);
      if (r.status === 404) none = 'not-on-tcgdex';
      else if (r.ok) d = await r.json();
      else none = 'unreachable (HTTP ' + r.status + ')';
    } catch (e) { none = 'unreachable (' + e.message + ')'; }
    const ed = d ? tdxp.tcgplayerByEdition(d.pricing && d.pricing.tcgplayer, tdxp.printingsFromTcgdex(d).printings) : { unlimited: null, firstEdition: null };
    if (d && !ed.unlimited && !ed.firstEdition) none = 'no-tcgplayer';

    if (ed.unlimited || ed.firstEdition) {
      // Unlimited (or the card's only printing) against our base row.
      if (ed.unlimited) {
        const bad = off(c.price, ed.unlimited.price); compared++; if (bad) mism++;
        line(c.number, c.name, 'unlimited', c.price, ed.unlimited.price, 'TCGdex ' + ed.unlimited.printing, bad);
      }
      if (ed.firstEdition) {
        // A card TCGdex lists ONLY as 1st Edition: that IS its base row.
        const mine = ed.unlimited ? ours1st.get(c.api_card_id) : (ours1st.get(c.api_card_id) || c.price);
        const bad = off(mine, ed.firstEdition.price); compared++; if (bad) mism++;
        line(ed.unlimited ? '' : c.number, ed.unlimited ? '' : c.name, '1st edition', mine,
             ed.firstEdition.price, 'TCGdex ' + ed.firstEdition.printing, bad);
      }
    } else if (none && TCGDEX_FALLBACK_OK.has(none)) {
      // Not checkable, and said so. The internal search is the WRITER's last
      // resort for these cards (decided 2026-10-01); a checker asking the same
      // source the writer used would only agree with itself. No call.
      fallback++;
      line(c.number, c.name, 'base', c.price, null, `NOT CHECKABLE — TCGdex: ${none}; no second TCGplayer source`, false);
    } else {
      unreachable++;
      line(c.number, c.name, '-', c.price, null, 'NOT CHECKED — TCGdex ' + none, false);
    }
  }
  console.log(`\n  ${compared} comparisons, ${mism} MISMATCH (>40% and >= $0.25), ` +
    `${fallback} not checkable (TCGdex has no TCGplayer price), ${unreachable} not checked (TCGdex unreachable).`);
  console.log('  Each edition is compared with the SAME edition. "-" under ours: we hold no row for it.\n');
}


// ══════════════════════════════════════════════════════════════
// SET MANIFEST — the authoritative card list for a set
//
// Every downstream step depends on knowing, for each card:
//   number + name + rarity + variants
// TCGdex's SET endpoint omits rarity; only the per-CARD endpoint has it.
// Fetching per card is ~350ms, so a 300-card set takes ~2 minutes. That is
// the price of correctness and it is worth paying once.
//
// Without this, a set like Ascended Heroes has "Mega Hawlucha ex" at #268
// (Mega attack rare, $6) and #283 (Special illustration rare, $60) both
// stored as the same rarity — so both get the same wrong price.
//
//   node ingest.js manifest en me02.5     one set
//   node ingest.js manifest en            every set missing rarity detail
//   node ingest.js manifest en --recent   sets from the last 2 years only
// ══════════════════════════════════════════════════════════════

// TCGdex rarity strings, mapped to ours. Mega-era rarities are new and
// were previously collapsed into "Hyper Rare", which is why prices for
// Mega attack rares came out ~10x too high.
const TCGDEX_RARITY = {
  'Common':'Common', 'Uncommon':'Uncommon', 'Rare':'Rare',
  'Rare Holo':'Rare Holo', 'Holo Rare':'Rare Holo',
  'Double rare':'Double Rare', 'Double Rare':'Double Rare',
  'Ultra Rare':'Rare Ultra', 'Ultra rare':'Rare Ultra',
  'Illustration rare':'Illustration Rare', 'Illustration Rare':'Illustration Rare',
  'Special illustration rare':'Special Illustration Rare',
  'Special Illustration Rare':'Special Illustration Rare',
  'Hyper rare':'Hyper Rare', 'Hyper Rare':'Hyper Rare',
  'Mega hyper rare':'Hyper Rare', 'Mega Hyper Rare':'Hyper Rare',
  'Mega attack rare':'Mega Attack Rare', 'Mega Attack Rare':'Mega Attack Rare',
  'ACE SPEC Rare':'ACE SPEC Rare', 'ACE SPEC rare':'ACE SPEC Rare',
  'Shiny rare':'Rare Shiny', 'Shiny Ultra Rare':'Rare Shiny',
  'Radiant Rare':'Radiant Rare', 'Amazing Rare':'Amazing Rare',
  'Secret Rare':'Rare Secret', 'Rainbow Rare':'Rare Rainbow',
  'Trainer Gallery Rare Holo':'Trainer Gallery Rare Holo',
  'Promo':'Promo',
  // TCGdex's own rarity for the 25 Celebrations Classic Collection cards
  // (cel25cc) — probed 2026-09-28. Without an entry normRarity() returned
  // null and manifest skipped them, so they kept an inferred "Common".
  'Classic Collection':'Classic Collection'
  // 'None' USED to map to 'Common' here. "None" is TCGdex saying it has no
  // rarity for the card — absent data, not a rarity — and mapping it wrote
  // Common over whatever we held. That is what stopped the cel25cc fix
  // being run earlier (TASK T5). It now falls through to null and the card
  // is skipped: absent data never overwrites stored data.
};

async function buildManifest(lang, arg1, arg2) {
  if (!db) { console.log('  DATABASE_URL required'); return; }

  if (lang === 'all') {
    for (const L of ['en', 'ja', 'zh-tw', 'zh-cn']) {
      await buildManifest(L, arg1, arg2);
    }
    return;
  }
  lang = lang || 'en';
  const flags  = [arg1, arg2].filter(Boolean);
  const recent = flags.includes('--recent');
  const onlySet = flags.find(f => !String(f).startsWith('--')) || null;

  // TASK.md T1: the per-card TCGdex fetch below already returns a
  // `pricing` block, so harvesting it costs no extra requests.
  //
  // Opt-in, not automatic. `manifest` is run to correct rarity, and a
  // command that silently started writing prices as a side effect would
  // be the /api/market/ shape of mistake — a write nobody asked for,
  // through a path used for something else. See CLAUDE.md.
  let withPrices = flags.includes('--prices');
  const tdx = withPrices ? require('./tcgdexprice.js') : null;
  const srk = withPrices ? require('./sourcerank.js') : null;

  // TCGdex serves the Japanese card's Cardmarket listing on the Chinese
  // locales — same idProduct, localised name. Harvesting it here would
  // price the Chinese catalogue at Japanese values. See tcgdexprice.js.
  if (withPrices) {
    const allowed = tdx.pricingAllowedFor(lang);
    if (!allowed.ok) {
      console.log(`  --prices IGNORED for "${lang}": ${allowed.reason}`);
      console.log('  Rarity will still be corrected; no price will be written.\n');
      withPrices = false;
    }
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  SET MANIFEST — authoritative card data (${lang})`);
  console.log(`${'='.repeat(72)}\n`);
  if (withPrices) {
    console.log('  --prices: also harvesting TCGdex pricing from the same fetch.');
    console.log('  Reverse-holo prices are counted but NOT written — price_history');
    console.log('  cannot distinguish printings. See tcgdexharvest.js.\n');
  }

  const cutoff = recent ? "AND MAX(set_release) > NOW() - INTERVAL '2 years'" : '';
  // TCG Pocket is skipped (2026-10-01): digital-only and hidden at every
  // read the app makes, so correcting its rarity meant TCGdex fetches for
  // 15 English sets, 2,480 cards held, that nobody is shown. The server's
  // own predicate (digital.visibleSql — by SERIES, never by id shape), and
  // the skip is printed, not silent.
  const hiddenQ = await db.query(`
    SELECT COUNT(DISTINCT set_api_id)::int AS sets, COUNT(*)::int AS cards
    FROM cards
    WHERE api_card_id LIKE $1 AND ($2::text IS NULL OR set_api_id = $2)
      AND NOT ${digital.visibleSql()}`, [lang + '-%', onlySet]);
  const hidden = hiddenQ.rows[0] || { sets: 0, cards: 0 };
  const sets = await db.query(`
    SELECT set_api_id, MAX(set_name) AS set_name, MAX(set_release) AS release,
           COUNT(*)::int AS cards
    FROM cards
    WHERE api_card_id LIKE $1 AND ($2::text IS NULL OR set_api_id = $2)
      AND ${digital.visibleSql()}
    GROUP BY set_api_id
    HAVING TRUE ${cutoff}
    ORDER BY MAX(set_release) DESC NULLS LAST`, [lang + '-%', onlySet]);

  if (hidden.sets) {
    console.log(`  Skipping ${hidden.sets} TCG Pocket set${hidden.sets === 1 ? '' : 's'} `
      + `(${hidden.cards} cards) — digital-only, hidden at every read`);
  }
  console.log(`  ${sets.rows.length} sets to verify`);
  const totalCards = sets.rows.reduce((a, r) => a + r.cards, 0);
  console.log(`  ${totalCards} cards — roughly ${Math.round(totalCards * 0.35 / 60)} minutes\n`);

  let checked = 0, changed = 0, failed = 0;
  let pricesWritten = 0, pricesSkipped = 0, reverseSeen = 0;
  let variantsWritten = 0, multiPrinting = 0;
  const tdxv = require('./tcgdexprice.js');

  for (const set of sets.rows) {
    const setId = set.set_api_id;
    process.stdout.write(`  ${setId.padEnd(12)} ${String(set.cards).padStart(4)} cards  `);

    // Only needed for --prices, and only to apply the confidence gate.
    const held = withPrices ? new Map((await db.query(`
      SELECT DISTINCT ON (ph.card_api_id) ph.card_api_id, ph.source
      FROM price_history ph JOIN cards c ON c.api_card_id = ph.card_api_id
      WHERE c.set_api_id=$1 AND c.api_card_id LIKE $2
      ORDER BY ph.card_api_id, (ph.source NOT LIKE 'estimate%') DESC, ph.recorded_at DESC`,
      [setId, lang + '-%'])).rows.map(r => [r.card_api_id, r.source])) : null;

    const cards = await db.query(
      `SELECT api_card_id, number, name, rarity, variants FROM cards
       WHERE set_api_id=$1 AND api_card_id LIKE $2 ORDER BY number`,
      [setId, lang + '-%']);

    let setChanged = 0, setFailed = 0, setVariants = 0;
    const rarityCounts = {};

    // TCGdex's own localId for each of our numbers (2026-10-04). Sets
    // ingested from Limitless store "1" where TCGdex lists "001", and asking
    // TCGdex for "S8-1" answers nothing: on S8, S8b, SM6, SM7, SM8 exactly
    // cards #1-99 were "not found", and every card of SM1M, SM6b, S7D… —
    // so those sets never got manifest's rarity. Fold leading zeros on
    // both sides, ask with TCGdex's form; one listing request a set.
    // Unown '?' is TCGdex localId '%3F'; we store '?' (2026-10-05).
    const foldNo = x => String(x).replace(/^%3F$/i, '?').replace(/^0+(?=\d)/, '');
    const listing = await get(`${TCGDEX}/${lang}/sets/${encodeURIComponent(setId)}`);
    await sleep(DELAY_TCGDEX);
    const localIdOf = new Map(((listing && listing.cards) || []).map(x => [foldNo(x.localId), String(x.localId)]));

    for (const c of cards.rows) {
      const asked = localIdOf.get(foldNo(c.number)) || c.number;
      const d = await get(`${TCGDEX}/${lang}/cards/${setId}-${encodeURIComponent(asked)}`);
      await sleep(DELAY_TCGDEX);
      checked++;

      if (!d || !d.name) { setFailed++; failed++; continue; }

      // ── TASK.md T1: harvest pricing from the fetch we just made ──
      // TCGplayer only. Cardmarket needs an FX conversion whose rate has
      // to be recorded, which belongs in tcgdexharvest.js where that is
      // handled properly rather than bolted onto a rarity pass.
      if (withPrices) {
        const p = tdx.parsePricing(d);
        if (p.tcgplayerReverse) reverseSeen++;
        if (p.tcgplayerBase) {
          const src = `tcgdex_tcgplayer_${p.tcgplayerBase.printing}`;
          if (srk.canOverwrite(src, held.get(c.api_card_id))) {
            // With its product, TCGdex's date and the basis, like every other
            // TCGdex writer (until 2026-10-10 this row carried none of them).
            await db.query(
              `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, source_meta)
               VALUES ($1,$2,$3,'tcgplayer','raw_nm',$4)`,
              [c.api_card_id, p.tcgplayerBase.price, src, JSON.stringify({ printing: p.tcgplayerBase.printing,
                productId: p.tcgplayerBase.productId, currency: 'USD', updated: p.tcgplayerUpdated,
                basis: p.tcgplayerBase.basis, via: 'manifest' })]).catch(() => {});
            pricesWritten++;
          } else pricesSkipped++;
        }
      }

      // ── Printings (TASK T10) — from the fetch we just made ──
      // Stored BEFORE the rarity check below, which `continue`s on a card
      // TCGdex gives no rarity: 2,110 Japanese cards say "None", and their
      // printings are just as real.
      {
        const pv = tdxv.printingsFromTcgdex(d);
        if (pv.from) {
          const next = JSON.stringify(pv);
          if (JSON.stringify(c.variants || null) !== next) {
            await db.query(
              `UPDATE cards SET variants=$2::jsonb, variants_checked_at=NOW() WHERE api_card_id=$1`,
              [c.api_card_id, next]).catch(e => console.log('  variants write failed ' + c.api_card_id + ': ' + e.message));
            setVariants++; variantsWritten++;
          }
          if (pv.printings.length > 1) multiPrinting++;
        }
      }

      // "None" is absent data (see TCGDEX_RARITY). Checked here as well as by
      // leaving it out of the map, because normRarity() would otherwise get a
      // chance at it — and must never be the thing that decides.
      const rawRarity = d.rarity && d.rarity !== 'None' ? d.rarity : null;
      const rarity = rawRarity ? (TCGDEX_RARITY[rawRarity] || normRarity(rawRarity)) : null;
      if (!rarity) continue;

      rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;

      if (rarity !== c.rarity) {
        await db.query(
          `UPDATE cards SET rarity=$2, supertype=COALESCE($3, supertype),
                rarity_source='tcgdex', rarity_checked_at=NOW(), updated_at=NOW()
           WHERE api_card_id=$1`,
          [c.api_card_id, rarity, d.category || null]).catch(() => {});
        setChanged++; changed++;
      }
    }

    const top = Object.entries(rarityCounts).sort((a,b) => b[1]-a[1]).slice(0,3)
      .map(([r,n]) => `${r} ${n}`).join(', ');
    console.log(`${String(setChanged).padStart(4)} rarities corrected, ${String(setVariants).padStart(4)} printings stored`
      + (setFailed ? `, ${setFailed} not found` : '')
      + (top ? `   [${top}]` : ''));
  }

  console.log(`\n  ${checked} cards checked, ${changed} rarities corrected, ${failed} not found on TCGdex`);
  console.log(`  ${variantsWritten} cards' printings stored; ${multiPrinting} exist in more than one printing`);
  if (withPrices) {
    console.log(`  ${pricesWritten} TCGdex TCGplayer prices written, ${pricesSkipped} skipped as lower confidence`);
    console.log(`  ${reverseSeen} reverse-holo prices seen and deliberately NOT written`);
    console.log('  For Cardmarket as well, with the FX rate recorded:');
    console.log(`     node ingest.js tcgdexprices ${lang} --dry`);
  }
  if (changed) {
    console.log('\n  Rarity drives both price estimates and matching, so re-price');
    console.log(`  the affected sets:  node ingest.js safeprices ${lang} --all\n`);
  } else {
    console.log('');
  }
}

// ── Compare what we hold against TCGdex, without changing anything ──
async function verifySetData(lang, setId) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';
  if (!setId) { console.log('  usage: node ingest.js verifyset <lang> <setId>'); return; }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`  SET VERIFY — ${lang} / ${setId}`);
  console.log(`${'='.repeat(78)}\n`);

  const cards = await db.query(
    `SELECT api_card_id, number, name, rarity FROM cards
     WHERE set_api_id=$1 AND api_card_id LIKE $2
     ORDER BY CASE WHEN number ~ '^[0-9]+$' THEN number::int ELSE NULL END NULLS LAST,
               number`,
    [setId, lang + '-%']);

  console.log(`  ${cards.rows.length} cards stored. Sampling 20 against TCGdex.\n`);
  console.log('  #     name                       ours                      TCGdex');
  console.log('  ' + '-'.repeat(74));

  const step = Math.max(1, Math.floor(cards.rows.length / 20));
  let mismatch = 0, missing = 0;

  for (let i = 0; i < cards.rows.length; i += step) {
    const c = cards.rows[i];
    const d = await get(`${TCGDEX}/${lang}/cards/${setId}-${tcgdexLocalId(c.number)}`);
    await sleep(DELAY_TCGDEX);

    if (!d || !d.name) {
      console.log(`  ${String(c.number).padEnd(5)} ${String(c.name).slice(0,25).padEnd(27)} `
        + `${String(c.rarity).slice(0,24).padEnd(26)} NOT ON TCGDEX`);
      missing++; continue;
    }
    const theirs = d.rarity ? (TCGDEX_RARITY[d.rarity] || normRarity(d.rarity)) : '(none)';
    const bad = theirs !== c.rarity;
    if (bad) mismatch++;
    console.log(`  ${String(c.number).padEnd(5)} ${String(c.name).slice(0,25).padEnd(27)} `
      + `${String(c.rarity).slice(0,24).padEnd(26)} ${theirs}${bad ? '   <-- DIFFERS' : ''}`);
  }

  console.log(`\n  ${mismatch} rarity mismatches, ${missing} cards not on TCGdex (of 20 sampled)`);
  if (mismatch) console.log(`  Fix with:  node ingest.js manifest ${lang} ${setId}\n`);
  else console.log('');
}


// ══════════════════════════════════════════════════════════════
// SETGAP — which sets exist upstream but are missing from our DB?
//
// Japanese has ~177 sets on TCGdex; we ingested 70. This finds the
// difference and, for each missing set, says WHY — genuinely empty
// upstream, or skipped in error and recoverable.
//
//   node ingest.js setgap ja
//   node ingest.js setgap ja --fix    re-ingest everything recoverable
// ══════════════════════════════════════════════════════════════
async function setGap(lang, flag) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';
  const doFix = flag === '--fix';

  console.log(`\n${'='.repeat(76)}`);
  console.log(`  SET GAP — ${lang}`);
  console.log(`${'='.repeat(76)}\n`);

  const upstream = await get(`${TCGDEX}/${lang}/sets`);
  await sleep(DELAY_TCGDEX);
  if (!upstream || !upstream.length) { console.log('  TCGdex returned no sets.\n'); return; }

  const have = await db.query(
    `SELECT set_api_id, COUNT(*)::int AS n FROM cards
     WHERE api_card_id LIKE $1 GROUP BY set_api_id`, [lang + '-%']);
  const inDb = {};
  have.rows.forEach(r => { inDb[r.set_api_id] = r.n; });

  console.log(`  TCGdex lists ${upstream.length} sets`);
  console.log(`  We hold      ${Object.keys(inDb).length} sets, ${have.rows.reduce((a,r)=>a+r.n,0)} cards\n`);

  const missing = upstream.filter(s => !inDb[s.id]);
  console.log(`  ${missing.length} sets are missing. Checking each for card data...\n`);

  const recoverable = [], empty = [];
  for (const s of missing) {
    const expected = (s.cardCount && (s.cardCount.official || s.cardCount.total)) || 0;
    process.stdout.write(`  ${String(s.id).padEnd(12)} ${String(s.name || '').slice(0,22).padEnd(24)} `);
    const d = await get(`${TCGDEX}/${lang}/sets/${s.id}`);
    await sleep(DELAY_TCGDEX);
    const n = (d && d.cards) ? d.cards.length : 0;
    if (n > 0) {
      console.log(`${String(n).padStart(4)} cards available  RECOVERABLE`);
      recoverable.push({ id: s.id, name: s.name, cards: n });
    } else {
      console.log(`   no card data upstream  (listed ${expected})`);
      empty.push({ id: s.id, name: s.name });
    }
  }

  console.log(`\n  ${'-'.repeat(66)}`);
  console.log(`  RECOVERABLE  ${recoverable.length} sets, ${recoverable.reduce((a,r)=>a+r.cards,0)} cards`);
  console.log(`  EMPTY        ${empty.length} sets — TCGdex has catalogued them but not populated them\n`);

  if (recoverable.length) {
    console.log('  Recoverable sets:');
    recoverable.forEach(r => console.log(`    ${r.id.padEnd(12)} ${String(r.name).slice(0,28).padEnd(30)} ${r.cards} cards`));
    console.log('');
  }

  if (!doFix) {
    if (recoverable.length) {
      console.log(`  Re-ingest them with:  node ingest.js setgap ${lang} --fix`);
      console.log(`  (clears them from the progress file, then runs the normal ingest)\n`);
    }
    return;
  }

  // Clear the progress file for recoverable sets so the ingest picks them up
  const p = loadProgress(lang);
  p.done = p.done || {};
  p.done[lang] = p.done[lang] || {};
  recoverable.forEach(r => { delete p.done[lang][r.id]; });
  saveProgress(p, lang);
  console.log(`  Cleared ${recoverable.length} sets from the ${lang} progress file.`);
  console.log(`  Now running the ingest...\n`);
  await ingestLang(lang);
}

// ══════════════════════════════════════════════════════════════
// CARD GAP — cards missing INSIDE a set we hold (TASK T3, 2026-10-04)
//
// setgap asks "which sets are missing?" and nothing asked "which cards?".
// A set is ingested once and the progress file marks it done forever, so
// cards TCGdex added afterwards were never fetched: measured 2026-10-04,
// 6 English sets short 104 cards (HS trainer kits held 1 of 30 each, mep
// 60 of 89, tk-sm-r 19 of 30, swshp SWSH299-305) and 36 Japanese sets short
// 440 — nearly all the secret rares above the printed total (SV8 107-138,
// S8b's VMAX climax 278-285, every SM GX tail).
//
//   node ingest.js cardgap <lang>                  measure, write nothing
//   node ingest.js cardgap <lang> --fix [--set=X]  insert the missing cards
//
// --fix is INSERT-ONLY: a held card is never touched. The new card takes
// the set fields of its held neighbours. Rarity is positional until
// `manifest <lang> <set>` runs; price is an estimate until a refresh or
// `tcgdexprices` reaches it — both printed below as the next step.
// ══════════════════════════════════════════════════════════════
async function cardGap(lang, ...rest) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'en';
  const doFix = rest.includes('--fix');
  const only = (rest.find(a => a && a.startsWith('--set=')) || '').slice(6).split(',').filter(Boolean);
  const fold = x => String(x).replace(/^%3F$/i, '?').replace(/^0+(?=\d)/, '');   // Unown '?' = TCGdex '%3F'

  const have = await db.query(`
    SELECT set_api_id, array_agg(number) AS nums,
           max(set_name) AS set_name, max(set_name_en) AS set_name_en, max(set_total) AS set_total,
           max(set_logo) AS set_logo, max(set_series) AS set_series, max(set_release) AS set_release
    FROM cards WHERE api_card_id LIKE $1 GROUP BY set_api_id`, [lang + '-%']);

  console.log(`\n  CARD GAP — ${lang}: ${have.rows.length} sets held${doFix ? '  (--fix: insert-only)' : ''}\n`);
  let short = 0, missingTotal = 0, inserted = 0, unreachable = [];
  const filled = [];
  for (const h of have.rows) {
    if (only.length && !only.includes(h.set_api_id)) continue;
    if (isDigitalSet(h.set_api_id)) continue;
    const td = await get(`${TCGDEX}/${lang}/sets/${encodeURIComponent(h.set_api_id)}`);
    await sleep(DELAY_TCGDEX);
    if (!td || !td.cards) { unreachable.push(h.set_api_id); continue; }
    const heldF = new Set(h.nums.map(fold));
    const miss = td.cards.filter(c => !heldF.has(fold(c.localId)));
    if (!miss.length) continue;
    short++; missingTotal += miss.length;
    console.log(`  ${h.set_api_id.padEnd(12)} held ${String(h.nums.length).padStart(4)} / TCGdex ${String(td.cards.length).padEnd(4)} ` +
      `missing ${String(miss.length).padStart(3)} (${miss.filter(c => c.image).length} with art)  ` +
      miss.slice(0, 4).map(c => c.localId + ' ' + c.name).join('; '));
    if (!doFix) continue;
    const held = { ...h, padded: h.nums.some(n => /^0\d/.test(String(n))) };
    const r = await ingestSet(h.set_api_id, lang, h.set_name, h.set_total,
      { only: new Set(miss.map(c => String(c.localId))), held });
    inserted += r.written || 0;
    if (r.written) filled.push(h.set_api_id);
    console.log(`               inserted ${r.written || 0}${r.failed ? ', FAILED ' + r.failed : ''}`);
  }
  console.log(`\n  ${short} sets short, ${missingTotal} cards missing` +
    (unreachable.length ? `; ${unreachable.length} held sets TCGdex does not list (${unreachable.slice(0, 12).join(' ')}${unreachable.length > 12 ? ' …' : ''})` : ''));
  if (doFix) {
    console.log(`  inserted ${inserted}. Next, per set: node ingest.js manifest ${lang} <set>  (rarity), then tcgdexprices / refresh (prices)`);
    if (filled.length) console.log(`  filled: ${filled.join(' ')}`);
  } else if (missingTotal) console.log(`  Insert them with:  node ingest.js cardgap ${lang} --fix`);
  console.log('');
}


// ══════════════════════════════════════════════════════════════
// LIMITLESS CATALOG — card lists for sets TCGdex never populated
//
// TCGdex lists 177 Japanese sets but holds card data for only 70.
// Limitless has the rest: limitlesstcg.com/cards/jp/{SET} renders the
// full set with numbers, names and images.
//
//   node ingest.js lmset ja S4        dry run — show what was extracted
//   node ingest.js lmingest ja        ingest every set TCGdex lacks
//   node ingest.js lmingest ja S4     one set
// ══════════════════════════════════════════════════════════════

// Pull number + name + image out of a Limitless set page.
// Their grid interleaves anchors and images, so the collector number comes
// from the image FILENAME (unambiguous) and the name from the alt text.
function extractLimitlessCatalog(html, setId) {
  const cards = {};
  const SET = String(setId).toUpperCase();

  // Match every Limitless card image, then keep the ones for this set.
  // Building a regex from the set id invites escaping bugs, so don't.
  const imgRe = /<img[^>]*>/gi;
  const tags = html.match(imgRe) || [];

  const fileRe = /\/(?:tpc|tpci)\/([A-Za-z0-9.\-]+)\/([A-Za-z0-9.\-]+)_(\d{1,4})_[A-Z]+_[A-Z]{2}(?:_SM)?\.(?:png|jpe?g|webp)/i;

  for (const tag of tags) {
    const srcM = tag.match(/src="([^"]+)"/i);
    if (!srcM) continue;
    const src = srcM[1];
    const f = src.match(fileRe);
    if (!f) continue;
    if (String(f[1]).toUpperCase() !== SET) continue;

    const num = String(parseInt(f[3]));
    const full = src.replace(/_SM\.(png|jpe?g|webp)$/i, '.$1');
    const altM = tag.match(/alt="([^"]{1,80})"/i);
    const name = altM ? altM[1].trim() : null;

    if (!cards[num]) {
      cards[num] = { number: num, image: full, name: name || null };
    } else {
      if (/_SM\./i.test(cards[num].image)) cards[num].image = full;
      if (!cards[num].name && name) cards[num].name = name;
    }
  }

  return Object.values(cards).sort((a, b) => parseInt(a.number) - parseInt(b.number));
}

async function fetchLimitlessSet(lang, setId) {
  const paths = lang === 'ja'
    ? [`https://limitlesstcg.com/cards/jp/${setId}`,
       `https://limitlesstcg.com/cards/jp/${String(setId).toUpperCase()}`]
    : [`https://limitlesstcg.com/cards/${setId}`,
       `https://limitlesstcg.com/cards/${String(setId).toUpperCase()}`];

  for (const url of paths) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA_SAFE, 'Accept': 'text/html,application/xhtml+xml' }
      });
      await sleep(1500);
      if (!r.ok) continue;
      const html = await r.text();
      const cards = extractLimitlessCatalog(html, setId);
      if (cards.length >= 3) return { cards, url, bytes: html.length };
    } catch (e) { /* next */ }
  }
  return null;
}

// Dry run — show exactly what would be ingested, write nothing
async function limitlessSetPreview(lang, setId) {
  lang = lang || 'ja';
  if (!setId) { console.log('  usage: node ingest.js lmset <lang> <setId>'); return; }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  LIMITLESS PREVIEW — ${lang} / ${setId}`);
  console.log(`${'='.repeat(72)}\n`);

  const res = await fetchLimitlessSet(lang, setId);
  if (!res) { console.log('  Nothing found on Limitless for this set.\n'); return; }

  console.log(`  ${res.url}`);
  console.log(`  ${res.bytes} bytes, ${res.cards.length} cards extracted\n`);
  console.log('  #      name                            image');
  console.log('  ' + '-'.repeat(66));
  res.cards.slice(0, 12).forEach(c =>
    console.log(`  ${String(c.number).padEnd(6)} ${String(c.name || '(no name)').slice(0,30).padEnd(32)} `
      + `${String(c.image).split('/').pop()}`));
  if (res.cards.length > 12) console.log(`  ... and ${res.cards.length - 12} more`);

  const named = res.cards.filter(c => c.name).length;
  console.log(`\n  ${named}/${res.cards.length} have names, ${res.cards.filter(c=>c.image).length} have images`);
  if (named < res.cards.length * 0.5) {
    console.log('  Names are mostly missing — the alt-text pattern needs adjusting.');
    console.log('  Cards can still be ingested with numbers and images only.');
  }
  console.log(`\n  Ingest with:  node ingest.js lmingest ${lang} ${setId}\n`);
}

// Ingest sets that TCGdex has no card data for
async function limitlessIngest(lang, onlySet) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  LIMITLESS INGEST — ${lang}`);
  console.log(`${'='.repeat(72)}\n`);

  // Which sets does TCGdex list but not populate?
  const upstream = await get(`${TCGDEX}/${lang}/sets`);
  await sleep(DELAY_TCGDEX);
  if (!upstream) { console.log('  Could not read the TCGdex set list.\n'); return; }

  const have = await db.query(
    `SELECT set_api_id, COUNT(*)::int AS n FROM cards
     WHERE api_card_id LIKE $1 GROUP BY set_api_id`, [lang + '-%']);
  const inDb = {};
  have.rows.forEach(r => { inDb[r.set_api_id] = r.n; });

  const targets = upstream
    .filter(s => !inDb[s.id])
    .filter(s => !onlySet || s.id === onlySet);

  console.log(`  ${targets.length} sets to try\n`);
  let totalCards = 0, done = 0, failed = 0;

  for (const s of targets) {
    process.stdout.write(`  ${String(s.id).padEnd(12)} ${String(s.name || '').slice(0,22).padEnd(24)} `);
    const res = await fetchLimitlessSet(lang, s.id);
    if (!res) { console.log('not on Limitless'); failed++; continue; }

    const printed = (s.cardCount && (s.cardCount.official || s.cardCount.total)) || res.cards.length;
    const setLogo = await tcgdexLogo(s.logo);
    const rows = res.cards.map(c => ({
      api_card_id: `${lang}-${s.id}-${c.number}`,
      name: c.name || `#${c.number}`,
      name_en: null,
      number: c.number,
      rarity: inferRarity(c.number, printed, c.name || ''),
      supertype: null,
      image_small: c.image,
      image_large: c.image,
      image_lang: lang,
      set_api_id: s.id,
      set_name: s.name,
      set_name_en: null,
      set_total: printed,
      set_logo: setLogo,
      set_series: (s.serie && s.serie.name) || null,
      set_release: s.releaseDate || null,
      tcgplayer: null, cardmarket: null,
      price: 0, price_source: null
    }));

    const w = await upsertCards(rows);
    console.log(`${String(w.written).padStart(4)} cards written`
      + (w.failed ? `, ${w.failed} failed` : ''));
    totalCards += w.written; done++;

    // Record it so status and verify stay accurate
    const p = loadProgress(lang);
    p.done = p.done || {}; p.done[lang] = p.done[lang] || {};
    p.done[lang][s.id] = { cards: w.written, prepared: rows.length, failed: w.failed,
                           real: 0, at: new Date().toISOString(), source: 'limitless' };
    saveProgress(p, lang);
  }

  console.log(`\n  ${done} sets ingested from Limitless, ${totalCards} cards`);
  console.log(`  ${failed} sets not available there either\n`);
  if (totalCards) {
    console.log('  Rarities were inferred from card position — correct them with:');
    console.log(`    node ingest.js manifest ${lang}`);
    console.log('  (TCGdex may still have per-card data even where the set endpoint is empty)\n');
  }
}


// ══════════════════════════════════════════════════════════════
// NAMEPROBE — where can we get card NAMES for a set?
//
// Limitless's grid gives numbers and images but no names. TCGdex's SET
// endpoint is empty for these sets — but its per-CARD endpoint may not
// be; they are different code paths. Test before assuming.
//
//   node ingest.js nameprobe ja S4
// ══════════════════════════════════════════════════════════════
async function nameProbe(lang, setId) {
  lang = lang || 'ja';
  if (!setId) { console.log('  usage: node ingest.js nameprobe <lang> <setId>'); return; }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  NAME SOURCE PROBE — ${lang} / ${setId}`);
  console.log(`${'='.repeat(72)}\n`);

  const nums = ['1', '2', '10'];
  const results = {};

  // 1. TCGdex per-card endpoint
  console.log('  TCGdex per-card endpoint');
  for (const n of nums) {
    const url = `${TCGDEX}/${lang}/cards/${setId}-${encodeURIComponent(n)}`;
    const d = await get(url);
    await sleep(DELAY_TCGDEX);
    const ok = !!(d && d.name);
    results.tcgdex_card = (results.tcgdex_card || 0) + (ok ? 1 : 0);
    console.log(`    #${n.padEnd(4)} ${ok ? 'OK   ' + d.name + (d.rarity ? '   [' + d.rarity + ']' : '') : 'nothing'}`);
  }
  console.log('');

  // 2. TCGdex zero-padded id
  console.log('  TCGdex per-card, zero-padded');
  for (const n of nums) {
    const d = await get(`${TCGDEX}/${lang}/cards/${setId}-${String(n).padStart(3,'0')}`);
    await sleep(DELAY_TCGDEX);
    const ok = !!(d && d.name);
    results.tcgdex_padded = (results.tcgdex_padded || 0) + (ok ? 1 : 0);
    console.log(`    #${n.padEnd(4)} ${ok ? 'OK   ' + d.name : 'nothing'}`);
  }
  console.log('');

  // 3. Limitless individual card page
  console.log('  Limitless card page');
  for (const n of nums) {
    const url = `https://limitlesstcg.com/cards/jp/${setId}/${n}`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA_SAFE } });
      await sleep(1200);
      if (!r.ok) { console.log(`    #${n.padEnd(4)} HTTP ${r.status}`); continue; }
      const html = await r.text();
      // Name usually sits in <title> or the first heading
      let name = null;
      let m = html.match(/<title>([^<]{2,90})<\/title>/i);
      if (m) name = m[1].replace(/\s*[\|\-]\s*Limitless.*$/i, '').trim();
      if (!name) { m = html.match(/<h1[^>]*>([^<]{2,90})<\/h1>/i); if (m) name = m[1].trim(); }
      const ok = !!name;
      results.limitless_card = (results.limitless_card || 0) + (ok ? 1 : 0);
      console.log(`    #${n.padEnd(4)} ${ok ? 'OK   ' + name : 'no name in page'}   (${html.length} bytes)`);
    } catch (e) { console.log(`    #${n.padEnd(4)} ${e.message}`); }
  }
  console.log('');

  // 4. Limitless list view — names may render in a table
  console.log('  Limitless list view');
  for (const suffix of ['?display=list', '?display=text', '/list']) {
    const url = `https://limitlesstcg.com/cards/jp/${setId}${suffix}`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA_SAFE } });
      await sleep(1200);
      if (!r.ok) { console.log(`    ${suffix.padEnd(16)} HTTP ${r.status}`); continue; }
      const html = await r.text();
      const rows = (html.match(/<tr[^>]*>/gi) || []).length;
      console.log(`    ${suffix.padEnd(16)} HTTP 200, ${html.length} bytes, ${rows} table rows`);
    } catch (e) { console.log(`    ${suffix.padEnd(16)} ${e.message}`); }
  }

  console.log(`\n  ${'-'.repeat(58)}`);
  const best = Object.entries(results).sort((a,b) => b[1]-a[1]);
  if (best.length && best[0][1] > 0) {
    console.log('  WORKING NAME SOURCES');
    best.filter(([,v]) => v > 0).forEach(([k,v]) => console.log(`    ${v}/3   ${k}`));
    console.log('');
  } else {
    console.log('  No name source found. Cards can still be ingested with');
    console.log('  numbers and images; names would need another source.\n');
  }
}


// ══════════════════════════════════════════════════════════════
// CNPROBE — find Chinese card data: set lists, rarity, artwork
//
// What we hold today:
//   zh-tw  83 sets / 7,436 cards — artwork 96% (official_tw), rarity unreliable
//   zh-cn   8 sets /   877 cards — TCGdex lists ~57 but populates 8
//
// The gap is rarity and the missing Simplified sets. The official regional
// sites are the only complete source. This probes them.
//
//   node ingest.js cnprobe zh-tw
//   node ingest.js cnprobe zh-cn
// ══════════════════════════════════════════════════════════════
const CN_SITES = [
  { name: 'asia_official_tw',
    note: 'asia.pokemon-card.com — official Traditional Chinese',
    langs: ['zh-tw'],
    pages: setId => [
      `https://asia.pokemon-card.com/tw/card-search/list/?expansionCodes=${setId}`,
      `https://asia.pokemon-card.com/tw/card-search/list/?pageNo=1&expansionCodes=${setId}`,
      `https://asia.pokemon-card.com/tw/expansion/${setId}/`
    ]},
  { name: 'asia_official_tw_api',
    note: 'asia.pokemon-card.com JSON endpoint',
    langs: ['zh-tw'],
    pages: setId => [
      `https://asia.pokemon-card.com/tw/api/card-search/?expansionCodes=${setId}`,
      `https://asia.pokemon-card.com/hk/card-search/list/?expansionCodes=${setId}`
    ]},
  { name: 'ptcg_cn_official',
    note: 'ptcg.cn — official Simplified Chinese (CITIC)',
    langs: ['zh-cn'],
    pages: setId => [
      `https://www.ptcg.cn/card/list?series=${setId}`,
      `https://www.ptcg.cn/cards?set=${setId}`,
      `https://ptcg.cn/card/${setId}`
    ]},
  { name: 'tcgcollector_cn',
    note: 'tcgcollector.com — blocked us with 403 before',
    langs: ['zh-tw','zh-cn'],
    pages: setId => [
      `https://www.tcgcollector.com/cards?setSlugs=${setId}`
    ]}
];

async function cnProbe(lang, setIdArg) {
  if (!db && !setIdArg) { console.log('  DATABASE_URL required (or pass a set id)'); return; }
  lang = lang || 'zh-tw';

  console.log(`\n${'='.repeat(74)}`);
  console.log(`  CHINESE SOURCE PROBE — ${lang}`);
  console.log(`${'='.repeat(74)}\n`);

  let setId = setIdArg;
  if (!setId) {
    const r = await db.query(
      `SELECT set_api_id, COUNT(*)::int AS n FROM cards
       WHERE api_card_id LIKE $1 GROUP BY set_api_id
       ORDER BY MAX(set_release) DESC NULLS LAST LIMIT 1`, [lang + '-%']);
    setId = r.rows.length ? r.rows[0].set_api_id : 'SV10';
  }
  console.log(`  Testing with set: ${setId}\n`);

  // ── A. Does TCGdex have rarity per card for this language? ──
  console.log('  TCGdex per-card rarity');
  let tcgdexRarity = 0;
  for (const n of ['1','2','3']) {
    const d = await get(`${TCGDEX}/${lang}/cards/${setId}-${encodeURIComponent(n)}`);
    await sleep(DELAY_TCGDEX);
    const has = !!(d && d.rarity);
    if (has) tcgdexRarity++;
    console.log(`    #${n}  ${d && d.name ? d.name : '(no card)'}`
      + `   rarity: ${d && d.rarity ? d.rarity : 'ABSENT'}`);
  }
  console.log(`    -> ${tcgdexRarity}/3 have rarity\n`);

  // ── B. Official and third-party sites ──
  const usable = CN_SITES.filter(s => s.langs.includes(lang));
  for (const site of usable) {
    console.log(`  ${site.name}  —  ${site.note}`);
    for (const url of site.pages(setId)) {
      process.stdout.write(`    ${url.slice(0, 70)}\n      `);
      try {
        const r = await fetch(url, {
          headers: {
            'User-Agent': UA_SAFE,
            'Accept': 'text/html,application/xhtml+xml,application/json',
            'Accept-Language': lang === 'zh-cn' ? 'zh-CN,zh;q=0.9' : 'zh-TW,zh;q=0.9'
          }
        });
        await sleep(1500);
        if (!r.ok) { console.log(`HTTP ${r.status}`); continue; }
        const body = await r.text();
        const imgs = (body.match(/<img[^>]+src="[^"]*card[^"]*"/gi) || []).length;
        const json = body.trim().startsWith('{') || body.trim().startsWith('[');
        const rarityWords = (body.match(/稀有|閃卡|闪卡|rarity/gi) || []).length;
        console.log(`HTTP 200, ${body.length} bytes, ${imgs} card images, `
          + `${rarityWords} rarity mentions${json ? ', JSON' : ''}`);
      } catch (e) { console.log(`error: ${e.message}`); }
    }
    console.log('');
  }

  // ── C. Price sources reachable from here ──
  console.log('  Price sources for Chinese cards');
  const hasEbay = !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
  console.log(`    eBay Browse API      ${hasEbay ? 'configured' : 'NOT configured — this is the main gap'}`);
  console.log('    Yahoo Auctions JP    currently used, but it is a JAPANESE marketplace');
  console.log('                         and carries few Chinese cards — wrong tool');
  console.log('    TCGPlayer            does not list Chinese cards at all');
  console.log('    Xianyu / Taobao      where Chinese cards actually trade;');
  console.log('                         strong anti-bot, would need a headless browser\n');
}


// ══════════════════════════════════════════════════════════════
// AUDIT — is every set complete? What exactly is missing?
//
// Answers, per set: do we hold the whole card list, are there gaps in
// the numbering, how many lack artwork, how many lack a real price, and
// where did the rarity come from.
//
//   node ingest.js audit ja           every Japanese set
//   node ingest.js audit ja --bad     only sets with problems
//   node ingest.js audit ja M2a       one set, card by card
// ══════════════════════════════════════════════════════════════
async function auditSets(lang, arg) {
  if (!db) { console.log('  DATABASE_URL required'); return; }
  lang = lang || 'ja';
  const badOnly = arg === '--bad';
  const oneSet  = (arg && arg !== '--bad') ? arg : null;

  // ── One set, card by card ──
  if (oneSet) {
    console.log(`\n${'='.repeat(78)}`);
    console.log(`  AUDIT — ${lang} / ${oneSet}`);
    console.log(`${'='.repeat(78)}\n`);

    const rows = await db.query(`
      SELECT c.number, c.name, c.name_en, c.rarity, c.image_small,
             (SELECT price_usd FROM price_history p
              WHERE p.card_api_id = c.api_card_id AND p.source NOT LIKE 'estimate%'
              ORDER BY recorded_at DESC LIMIT 1) AS price,
             (SELECT source FROM price_history p
              WHERE p.card_api_id = c.api_card_id AND p.source NOT LIKE 'estimate%'
              ORDER BY recorded_at DESC LIMIT 1) AS src
      FROM cards c
      WHERE c.set_api_id=$1 AND c.api_card_id LIKE $2
      ORDER BY CASE WHEN c.number ~ '^[0-9]+$' THEN c.number::int ELSE NULL END NULLS LAST,
               c.number`,
      [oneSet, lang + '-%']);

    if (!rows.rows.length) { console.log('  No cards stored for this set.\n'); return; }

    // Only plain numeric cards take part in gap detection — promos like
    // "FIG" or "SWSH001" have no place in a 1..N sequence.
    const nums = rows.rows
      .filter(r => /^[0-9]+$/.test(String(r.number)))
      .map(r => parseInt(r.number));
    const nonNumeric = rows.rows.length - nums.length;
    if (!nums.length) {
      console.log(`  ${rows.rows.length} cards, none numerically numbered — skipping gap check\n`);
      return;
    }
    const max = Math.max(...nums);
    const present = new Set(nums);
    const gaps = [];
    for (let i = 1; i <= max; i++) if (!present.has(i)) gaps.push(i);

    console.log(`  ${rows.rows.length} cards stored, highest number ${max}`
      + (nonNumeric ? `, ${nonNumeric} with non-numeric numbers` : ''));
    if (gaps.length) {
      console.log(`  ${gaps.length} MISSING numbers: ${gaps.slice(0,30).join(', ')}`
        + (gaps.length > 30 ? ` ... +${gaps.length-30}` : ''));
    } else {
      console.log('  No gaps in the numbering');
    }
    console.log('');
    console.log('  #     name                      rarity              img  price     source');
    console.log('  ' + '-'.repeat(74));
    rows.rows.slice(0, 40).forEach(r => {
      console.log(`  ${String(r.number).padEnd(5)} ${String(r.name).slice(0,24).padEnd(26)}`
        + `${String(r.rarity || '-').slice(0,18).padEnd(20)}`
        + `${r.image_small ? ' y ' : ' - '} `
        + `${r.price ? ('$' + Number(r.price).toFixed(2)).padStart(8) : '       -'}  `
        + `${String(r.src || '').slice(0,14)}`);
    });
    if (rows.rows.length > 40) console.log(`  ... and ${rows.rows.length - 40} more`);
    console.log('');
    return;
  }

  // ── Every set ──
  console.log(`\n${'='.repeat(88)}`);
  console.log(`  SET COMPLETENESS AUDIT — ${lang}`);
  console.log(`${'='.repeat(88)}\n`);

  const sets = await db.query(`
    SELECT c.set_api_id,
           MAX(c.set_name)    AS set_name,
           MAX(c.set_total)   AS printed,
           MAX(c.set_logo)    AS logo,
           MAX(c.set_series)  AS series,
           MAX(c.set_release) AS release,
           COUNT(*)::int                       AS cards,
           COUNT(c.image_small)::int           AS with_img,
           COUNT(c.name_en)::int               AS with_en,
           MAX(CASE WHEN c.number ~ '^[0-9]+$' THEN c.number::int ELSE NULL END) AS max_num,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM price_history p
             WHERE p.card_api_id = c.api_card_id
               AND p.source NOT LIKE 'estimate%'))::int AS priced
    FROM cards c
    WHERE c.api_card_id LIKE $1
    GROUP BY c.set_api_id
    ORDER BY MAX(c.set_release) DESC NULLS LAST`, [lang + '-%']);

  console.log('  set          release     printed  held  gaps   img%  price%  logo series');
  console.log('  ' + '-'.repeat(84));

  let flagged = 0;
  const problems = { gaps: [], noLogo: [], noSeries: [], noImg: [], noPrice: [] };

  for (const s of sets.rows) {
    const held = s.cards;
    const maxN = s.max_num || 0;
    const gapCount = maxN > held ? maxN - held : 0;
    const imgPct = held ? Math.round((s.with_img / held) * 100) : 0;
    const pricePct = held ? Math.round((s.priced / held) * 100) : 0;
    const hasLogo = !!s.logo;
    const hasSeries = !!s.series;

    const bad = gapCount > 0 || !hasLogo || !hasSeries || imgPct < 90 || pricePct < 50;
    if (bad) flagged++;
    if (badOnly && !bad) continue;

    if (gapCount > 0)  problems.gaps.push(s.set_api_id);
    if (!hasLogo)      problems.noLogo.push(s.set_api_id);
    if (!hasSeries)    problems.noSeries.push(s.set_api_id);
    if (imgPct < 90)   problems.noImg.push(s.set_api_id);
    if (pricePct < 50) problems.noPrice.push(s.set_api_id);

    const rel = s.release ? new Date(s.release).toISOString().slice(0,10) : '    -     ';
    console.log(`  ${String(s.set_api_id).padEnd(12)} ${rel} ${String(s.printed || '-').padStart(7)} `
      + `${String(held).padStart(5)} ${String(gapCount || '').padStart(5)}  `
      + `${String(imgPct + '%').padStart(5)} ${String(pricePct + '%').padStart(6)}  `
      + `${hasLogo ? ' y  ' : ' -  '} ${hasSeries ? String(s.series).slice(0,14) : '(none)'}`);
  }

  console.log('  ' + '-'.repeat(84));
  console.log(`  ${sets.rows.length} sets, ${flagged} with problems\n`);

  const show = (label, arr) => {
    if (!arr.length) return;
    console.log(`  ${label} (${arr.length})`);
    console.log(`    ${arr.slice(0, 18).join(', ')}${arr.length > 18 ? ' ...' : ''}\n`);
  };
  show('Gaps in card numbering — incomplete set list', problems.gaps);
  show('No set logo', problems.noLogo);
  show('No series — these fall into "Other" in the UI', problems.noSeries);
  show('Under 90% artwork', problems.noImg);
  show('Under 50% priced', problems.noPrice);

  console.log('  Inspect one set with:  node ingest.js audit ' + lang + ' <setId>\n');
}


// ══════════════════════════════════════════════════════════════
// REFRESH SCHEDULER
//
// Re-pricing 45,000 cards daily is neither possible nor useful. A $0.12
// common does not move; a $400 chase card can move 10% in a week. So each
// card gets a refresh interval from its value and rarity, and every run
// takes whatever is most overdue first.
//
// Value wins over rarity when they disagree — a Rare Holo Base Set
// Charizard at $700 is a hot card whatever its printed rarity says.
//
//   node ingest.js refresh en           price whatever is due
//   node ingest.js refresh en --dry     show what is due, change nothing
//   node ingest.js refresh en --max=500 cap the run
//   node ingest.js refresh all
// ══════════════════════════════════════════════════════════════

const REFRESH_TIERS = [
  { name: 'hot',      hours: 24,   minPrice: 100, rarities: ['Hyper Rare','Special Illustration Rare'] },
  { name: 'active',   hours: 72,   minPrice: 20,  rarities: ['Illustration Rare','Rare Secret','Rare Rainbow','Rare Ultra','Rare Shiny'] },
  { name: 'steady',   hours: 168,  minPrice: 5,   rarities: ['Double Rare','ACE SPEC Rare','Rare Holo','Amazing Rare','Radiant Rare','Mega Attack Rare'] },
  { name: 'slow',     hours: 336,  minPrice: 1,   rarities: ['Rare','Rare Holo V','Rare Holo VMAX','Rare Holo VSTAR','Rare Holo GX','Rare Holo EX'] },
  { name: 'dormant',  hours: 720,  minPrice: 0,   rarities: ['Uncommon','Common','Promo'] }
];

// Which tier does this card belong to? Price first, then rarity.
function refreshTierFor(price, rarity) {
  const p = parseFloat(price) || 0;
  for (const t of REFRESH_TIERS) {
    if (p >= t.minPrice && t.minPrice > 0) return t;
  }
  for (const t of REFRESH_TIERS) {
    if (rarity && t.rarities.includes(rarity)) return t;
  }
  return REFRESH_TIERS[REFRESH_TIERS.length - 1];
}

// The run: every requested language, then ONE verdict (refreshrun.js, Roy
// 2026-10-08). A language that did not run or did not finish makes the run
// exit 3 with a line naming it; an interrupt prints the same line and exits
// 130; a hard kill is named by the next run's first lines. Before this, the
// 08/10 nightly stopped at 98.8% of English and never started Japanese or
// Chinese, and nothing said so.
async function refreshDue(lang, ...flags) {
  if (!db) { console.log('  DATABASE_URL required'); process.exitCode = refreshrun.EXIT_INCOMPLETE; return; }
  const dry = flags.includes('--dry');
  const requested = lang === 'all' ? refreshrun.LANGS.slice() : [lang || 'en'];
  if (!dry) { const prev = refreshrun.previousUnfinished(); if (prev) console.log('\n' + prev.line + '\n'); }
  const run = refreshrun.createRun(requested, { marker: dry ? false : undefined });
  // ONE budget for the whole run (Roy, 2026-10-10). It was set per language, so
  // `refresh all` — four languages — could run 4 x --hours awake. Now the clock
  // starts here, once, and every language reads it: a language that starts after
  // it has passed stops at card 0 and is named. Wall-clock on purpose: a PC that
  // sleeps through the night wakes past the deadline and the run stops at the next
  // card (2026-10-10: asleep 05:41 -> 13:14, it stopped within a card of waking).
  const budget = refreshBudget(flags);
  const onSignal = sig => {
    const v = refreshrun.verdict(run);
    console.log('\n  REFRESH INTERRUPTED (' + sig + ')' + (run.current ? ' during ' + run.current : '') + '.');
    v.lines.forEach(l => console.log(l));
    refreshrun.close(run);   // said here, so the next run need not repeat it
    process.exit(refreshrun.EXIT_INTERRUPTED);
  };
  const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'];
  SIGNALS.forEach(s => process.on(s, onSignal));
  try {
    for (const L of requested) {
      refreshrun.start(run, L);
      let o;
      try { o = await refreshOne(L, flags, run, budget); }
      catch (e) { o = { state: 'error', why: e.message }; console.log('\n  ' + L + ': refresh threw — ' + e.message); }
      refreshrun.finish(run, L, o);
    }
  } finally { SIGNALS.forEach(s => process.removeListener(s, onSignal)); }
  const v = refreshrun.close(run);
  console.log('');
  if (dry && v.ok) console.log('  REFRESH DRY RUN — nothing was priced; ' + requested.join(', ') + ' listed only');
  else v.lines.forEach(l => console.log(l));
  if (!v.ok) process.exitCode = Math.max(process.exitCode || 0, v.exitCode);
}

// One language. Returns its outcome for refreshrun: complete | stopped | error.
// The --hours budget of one refresh run: its hours and its deadline, made once.
function refreshBudget(flags, now) {
  const hoursArg = parseFloat((flags.find(f => String(f).startsWith('--hours=')) || '').replace('--hours=',''));
  const hours = Number.isFinite(hoursArg) && hoursArg > 0 ? hoursArg : 4;
  return { hours, deadline: (now || Date.now()) + hours * 3600 * 1000 };
}

async function refreshOne(lang, flags, run, budget) {
  const dry = flags.includes('--dry');
  if (!dry && !preflightFilter()) return { state: 'error', why: 'the listing filter failed its preflight' };
  const maxArg = (flags.find(f => String(f).startsWith('--max=')) || '').replace('--max=','');
  const cap = parseInt(maxArg) || 100000;
  // --set narrows a run to one set. Needed to verify the source-confidence
  // gate against a set jpreconcile corrected, without re-pricing 14,000 cards.
  const setArg = (flags.find(f => String(f).startsWith('--set=')) || '').replace('--set=','') || null;
  // Wall-clock budget. Task Scheduler's ExecutionTimeLimit terminates the
  // TASK, which kills the cmd.exe wrapper — but node is a grandchild and
  // survives orphaned. That is how a run with PT6H set carried on for 33
  // hours on Aug 28 (LastTaskResult 267014 = SCHED_S_TASK_TERMINATED: the
  // limit did fire, the process just outlived it). A job that can stop
  // itself does not depend on the scheduler getting that right.
  // The RUN's budget (refreshDue): one deadline across every language.
  const { hours: budgetHours, deadline } = budget || refreshBudget(flags);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  REFRESH — ${lang}${setArg ? ' / ' + setArg : ''}${dry ? '   (dry run)' : ''}`);
  console.log(`${'='.repeat(72)}\n`);

  console.log('  Tier      every      value        rarities');
  console.log('  ' + '-'.repeat(64));
  REFRESH_TIERS.forEach(t => {
    const every = t.hours >= 168 ? (t.hours / 24) + 'd' : t.hours + 'h';
    console.log(`  ${t.name.padEnd(9)} ${String(every).padEnd(10)} `
      + `${t.minPrice ? '>= $' + t.minPrice : 'any'}`.padEnd(12)
      + ` ${t.rarities.slice(0,2).join(', ')}${t.rarities.length > 2 ? ' +' + (t.rarities.length-2) : ''}`);
  });
  console.log('');

  // Latest real HEADLINE price and when it was taken, per card — the card
  // page's own number (ungraded, base printing, not a second reading).
  // It was the latest row of ANY kind until 2026-10-02 (TASK T2): a
  // Cardmarket second reading written while the TCGplayer match was
  // blocked reset the card's clock, so a card that got NO price looked
  // freshly priced for its whole interval — measured on mep, 7 of 7 — and
  // its tier and held_source came from the EU reading or a slab aggregate.
  const rows = await db.query(`
    SELECT c.api_card_id, c.name, c.number, c.rarity, c.set_name, c.set_api_id,
           c.set_total, c.set_release, c.variants, c.name_en,
           lp.price_usd, lp.recorded_at, lp.source AS held_source, lp.source_meta AS held_meta,
           EXTRACT(EPOCH FROM (NOW() - lp.recorded_at)) / 3600 AS age_hours
    FROM cards c
    LEFT JOIN LATERAL (
      SELECT price_usd, recorded_at, source, source_meta FROM price_history p
      WHERE p.card_api_id = c.api_card_id AND p.source NOT LIKE 'estimate%'
        AND p.grade IS NULL AND ${require('./printsql').basePrintingSql('p', 'c')}
      ORDER BY recorded_at DESC LIMIT 1
    ) lp ON TRUE
    WHERE c.api_card_id LIKE $1
      ${setArg ? 'AND c.set_api_id = $2' : ''}
  `, setArg ? [lang + '-%', setArg] : [lang + '-%']);

  const due = [];
  const tierCounts = {};
  let neverPriced = 0;
  // RE-ASKED FIRST, BY VALUE (Roy, 2026-10-09): a headline written by our
  // TCGplayer search before 2 October carries no product and no match label —
  // the fallback that took other cards' products wrote them, and nothing says
  // which. Each such card is asked once more by the fixed matcher ahead of
  // everything else, dearest first, whatever its tier says. Once only: a card
  // the fixed matcher cannot match writes nothing, and would otherwise lead
  // every night. Asked ones are kept in ingest-progress-relabel-<lang>.json.
  const relabelFile = path.join(__dirname, 'ingest-progress-relabel-' + lang + '.json');
  let relabelAsked = {};
  try { relabelAsked = JSON.parse(fs.readFileSync(relabelFile, 'utf8')); } catch (e) { relabelAsked = {}; }
  let relabelDue = 0;

  for (const r of rows.rows) {
    if (isDigitalSet(r.set_api_id)) continue;      // TCG Pocket has no market
    const tier = refreshTierFor(r.price_usd, r.rarity);
    tierCounts[tier.name] = tierCounts[tier.name] || { total: 0, due: 0 };
    tierCounts[tier.name].total++;

    const age = r.age_hours === null ? Infinity : parseFloat(r.age_hours);
    if (age === Infinity) neverPriced++;
    const relabel = r.held_source === 'tcgplayer_market' && !(r.held_meta && r.held_meta.matchedBy) && !relabelAsked[r.api_card_id];
    if (relabel) relabelDue++;
    if (age >= tier.hours || relabel) {
      tierCounts[tier.name].due++;
      due.push({
        api_card_id: r.api_card_id, name: r.name, number: r.number,
        rarity: r.rarity, set_name: r.set_name, set_release: r.set_release,
        // SELECTed above and dropped here until 2026-09-29 (T9): every
        // nightly Yahoo match ran with setTotal null, which jpfilter fails
        // CLOSED on — valid comparables silently lost, every night.
        set_total: r.set_total, set_api_id: r.set_api_id,
        variants: r.variants,   // the search's stamped-product rule reads TCGdex's ids (2026-10-09)
        price: parseFloat(r.price_usd) || 0,
        tier: tier.name,
        neverPriced: age === Infinity,
        // How overdue, relative to this card's own interval, weighted by value.
        // A card that has never been priced is treated as one interval overdue —
        // not infinitely urgent, or 8,500 dormant commons drown out the hot tier.
        relabel,
        urgency: relabel ? 1e6 + (parseFloat(r.price_usd) || 0) : (age === Infinity ? 1.5 : age / tier.hours)
                 * (1 + Math.log10((parseFloat(r.price_usd) || 0) + 1))
                 * ({ hot: 8, active: 4, steady: 2, slow: 1.2, dormant: 1 }[tier.name] || 1)
      });
    }
  }

  console.log('  Tier      cards      due');
  console.log('  ' + '-'.repeat(34));
  REFRESH_TIERS.forEach(t => {
    const c = tierCounts[t.name] || { total: 0, due: 0 };
    console.log(`  ${t.name.padEnd(9)} ${String(c.total).padStart(6)} ${String(c.due).padStart(8)}`);
  });
  console.log('  ' + '-'.repeat(34));
  console.log(`  TOTAL     ${String(rows.rows.length).padStart(6)} ${String(due.length).padStart(8)}`);
  if (neverPriced) console.log(`  ${neverPriced} have never had a real price`);
  if (relabelDue) console.log(`  ${relabelDue} carry a search price from before 2 October (no product recorded): asked first, dearest first`);
  console.log('');

  if (!due.length) { console.log('  Nothing is due.\n'); return { state: 'complete', done: 0, of: 0 }; }

  due.sort((a, b) => b.urgency - a.urgency);
  const batch = due.slice(0, cap);

  const mins = Math.round(batch.length * 2.5 / 60);
  console.log(`  ${batch.length} cards to refresh — roughly ${mins} minutes`
    + (mins > 60 ? ` (${(mins/60).toFixed(1)} hours)` : '') + '\n');

  if (dry) {
    console.log('  Most urgent 15:\n');
    console.log('  tier      card                        set              was      overdue');
    console.log('  ' + '-'.repeat(72));
    batch.slice(0, 15).forEach(c => {
      console.log(`  ${c.tier.padEnd(9)} ${String(c.name).slice(0,26).padEnd(28)}`
        + `${String(c.set_name || '').slice(0,15).padEnd(17)}`
        + `${c.price ? ('$' + c.price.toFixed(2)).padStart(8) : '   never'}  `
        + `${c.urgency.toFixed(1)}`);
    });
    const byTier = {};
    batch.forEach(c => { byTier[c.tier] = (byTier[c.tier] || 0) + 1; });
    console.log('\n  This batch by tier: '
      + Object.entries(byTier).map(([k,v]) => k + ' ' + v).join(', '));
    console.log(`\n  Run without --dry to price them.\n`);
    return { state: 'complete', dry: true, done: 0, of: batch.length };
  }

  let priced = 0, missed = 0, moved = 0, demoted = 0;
  const t0 = Date.now();
  // Per set: asked / priced / refused / nothing. A guard that over-blocks
  // fails invisibly; this is what makes a whole silent set visible.
  const tally = setyield.createTally();

  let ranOut = false, stoppedAt = batch.length;
  for (let i = 0; i < batch.length; i++) {
    refreshrun.progress(run, lang, i, batch.length);
    if (Date.now() > deadline) {
      ranOut = true; stoppedAt = i;
      console.log(`
  TIME BUDGET REACHED — the run's ${budgetHours}h. Stopping after ${i} of ${batch.length}.`);
      console.log('  The rest stays overdue and leads the next run. Use --hours=N to change.');
      break;
    }
    const card = batch[i];
    const res = await safePriceFor(card);
    await writeVariantPrices(card, res);
    await writeSecondReading(card, res);
    await writeEditionPrice(card, res);
    if (card.relabel) {
      relabelAsked[card.api_card_id] = new Date().toISOString().slice(0, 10);
      try { fs.writeFileSync(relabelFile, JSON.stringify(relabelAsked)); } catch (e) { /* the next run asks it again */ }
    }

    if (res && res.price > 0) {
      // A lower-confidence source must never replace a higher-confidence
      // one. Yahoo cannot separate printings that share a collector number
      // (master-ball mirrors), so re-fetching a card that Yuyu-tei
      // corrected would silently put the mirror's price back. See
      // sourcerank.js.
      if (!srank.canOverwrite(res.source, card.held_source)) {
        demoted++;
        tally.add(card, 'kept');
        console.log(`  keep  ${String(card.name).slice(0,22).padEnd(24)}` +
          `$${Number(card.price).toFixed(2)} ${card.held_source}` +
          `  <- refused $${res.price.toFixed(2)} ${res.source}` +
          `   [${srank.rankLabel(srank.sourceRank(res.source))} under ` +
          `${srank.rankLabel(srank.sourceRank(card.held_source))}]`);
        continue;
      }
      await db.query(
        `INSERT INTO price_history (card_api_id, price_usd, source, marketplace, condition, source_meta)
         VALUES ($1,$2,$3,$4,'raw_nm',$5)`,
        [card.api_card_id, res.price, res.source, res.marketplace || res.source.split('_')[0],
         res.meta ? JSON.stringify(res.meta) : null]).catch(() => {});
      priced++;
      tally.add(card, 'priced');
      const delta = card.price ? ((res.price - card.price) / card.price) * 100 : 0;
      if (Math.abs(delta) >= 10) {
        moved++;
        console.log(`  ${delta > 0 ? '+' : ''}${delta.toFixed(0)}%  ${String(card.name).slice(0,24).padEnd(26)}`
          + `$${card.price.toFixed(2)} -> $${res.price.toFixed(2)}   [${card.tier}]`);
      }
    } else { missed++; tally.add(card, 'missed'); }

    if ((i + 1) % 50 === 0) {
      const pct = (((i + 1) / batch.length) * 100).toFixed(1);
      const eta = Math.round(((Date.now() - t0) / 60000 / (i + 1)) * (batch.length - i - 1));
      console.log(`  [${pct}%] ${priced} priced, ${missed} no data, ${moved} moved 10%+   eta ${eta}m`);
    }
  }

  console.log(`\n  ${priced} refreshed, ${missed} without data, ${moved} moved by 10% or more`);
  console.log(`  ${demoted} kept — a lower-confidence source was refused` +
    (demoted ? '  (see "keep" lines above)' : ''));
  console.log('');

  // Whole sets that came back with nothing. A regressed set (its cards HAD
  // prices) exits non-zero, so Task Scheduler's LastTaskResult and
  // task-watch.log carry it — refresh.log alone is where svp hid for two days.
  const yieldRep = tally.report();
  setyield.format(yieldRep, lang).forEach(l => console.log(l));
  const ySaw = yahooSawSummary();
  if (ySaw) console.log(`  Yahoo answered (requests, this process): ${ySaw}\n`);
  const longStreak = yieldRep.streak.length >= setyield.STREAK_MIN;
  if (yieldRep.regressed.length || longStreak) {
    process.exitCode = 2;
    try {
      require('fs').appendFileSync(require('path').join(__dirname, 'refresh-empty-sets.log'),
        JSON.stringify({ at: new Date().toISOString(), lang, sets: yieldRep.regressed,
                         streak: longStreak ? yieldRep.streak : null, yahoo: ySaw }) + '\n');
    } catch (e) { console.log('  (could not append refresh-empty-sets.log: ' + e.message + ')'); }
  } else if (yieldRep.judged) {
    console.log(`  Every set with ${yieldRep.minAsked}+ cards due got at least one answer (${yieldRep.judged} sets judged).`);
  }

  // Prices just moved, so this is the moment alerts become true or false.
  if (!dry) await evaluateAlerts(lang);
  return ranOut ? { state: 'stopped', done: stoppedAt, of: batch.length, why: "the run's " + budgetHours + 'h budget ran out' }
                : { state: 'complete', done: batch.length, of: batch.length };
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  const cmd = process.argv[2] || 'status';

  console.log(`\n  CardHunt Ingestion v${VERSION}`);
  console.log(`  DB: ${db ? 'Supabase connected' : 'DRY RUN (no DATABASE_URL)'}`);
  await loadDigitalSets();
  console.log(`  Digital-only sets: ${digitalSource}`);

  const KNOWN = ['status','prices','scrape','safeprices','clean','test','diagnose',
                 'reprice','ids','verify','retry','names','pokedex','setmeta','imgclean','imgreport','setcover','pricefix','pricecheck','filtertest','ytest','jpcheck','jppurge','yuyutei','rarityfill','alerts','manifest','verifyset','setgap','cardgap','lmset','lmingest','nameprobe','cnprobe','audit','refresh','imgprobe','imgfetch','imgsrc','imgscrape','tcgdexprices','all',
                 'en','ja','zh-tw','zh-cn','fr','de','it','es','pt','ko'];
  if (!KNOWN.includes(cmd)) {
    console.log(`\n  Unknown command: "${cmd}"`);
    console.log('  Available:');
    console.log('    status      coverage per language, sources, rarity spread');
    console.log('    en|ja|zh-tw|zh-cn    ingest a language catalog');
    console.log('    safeprices <lang>    real prices (Yahoo JP / TCGPlayer)');
    console.log('    prices               refresh English prices');
    console.log('    reprice              backfill EN sets with 0 prices');
    console.log('    pokedex              build the JP->EN Pokemon dictionary');
    console.log('    names <lang>         backfill English card names');
    console.log('    verify <lang>        sets claimed done but missing from DB');
    console.log('    retry <lang>         clear incomplete sets for re-ingest');
    console.log('    test <lang|card id>  try one card through every source');
    console.log('    ids <setId> [lang]   card ids stored for a set');
    console.log('    diagnose <setId>     why did a set miss prices?');
    console.log('    clean [--delete]     audit / purge junk prices\n');
    if (db) await db.end();
    return;
  }

  // The two scheduled jobs — the nightly refresh and the weekly Yuyu-tei run —
  // take ONE lock and never run at once (joblock.js, 2026-10-10). A dry run
  // writes nothing and takes none.
  if ((cmd === 'refresh' || cmd === 'yuyutei') && !process.argv.includes('--dry')) {
    const jl = require('./joblock');
    // --wait-lock=N (the weekly passes 6): locked, it tries again every hour for
    // N hours instead of losing its week; a final refusal is written down and
    // printed at the top of every later scheduled run (joblock.noteSkipped).
    const waitH = parseInt((process.argv.find(a => String(a).startsWith('--wait-lock=')) || '').replace('--wait-lock=', ''), 10) || 0;
    const lock = await jl.acquireWaiting(cmd + ' ' + process.argv.slice(3).join(' '), { tries: waitH + 1, intervalMs: 3600e3 });
    if (!lock.ok) {
      console.log('\n  JOB LOCKED — NOT STARTED' + (waitH ? ' after ' + lock.attempts + ' attempts, hourly' : '') + ': ' + lock.why + '\n');
      jl.noteSkipped(cmd, 'not started at ' + new Date().toISOString() + ' after ' + lock.attempts + ' attempt(s): ' + lock.why);
      process.exitCode = jl.EXIT_LOCKED;
      if (db) await db.end();
      return;
    }
    if (lock.took) console.log('\n  ' + lock.took + '\n');
    if (lock.attempts > 1) console.log('  Started on attempt ' + lock.attempts + ' (the job lock was held before).');
    jl.skippedLines().forEach(l => console.log('\n' + l));
    // A scheduled job on a connection that cannot write would price, store
    // nothing and report success (localdb.js, 2026-10-10). It refuses, loudly,
    // exit 5 — before a single request is made.
    const lw = require('./localdb');
    let row = null, err = null;
    try { row = db ? (await db.query(lw.CAPABILITY_SQL)).rows[0] : null; } catch (e) { err = e.message; }
    if (!db || err || !lw.canWrite(row)) {
      console.log('\n  NOT STARTED — ' + (!db ? 'no DATABASE_URL'
        : err ? 'could not ask the database what this connection may do: ' + err
        : 'this connection (' + row.who + ') cannot write') + ': ' + cmd + ' would store nothing.'
        + ' The scheduled jobs write through CARDHUNT_WRITE_DATABASE_URL (refresh-daily.cmd, refresh-weekly.cmd).\n');
      process.exitCode = lw.EXIT_READ_ONLY;
      if (db) await db.end();
      return;
    }
    console.log('  DB role: ' + row.who + ' (can write)');
  }

  if (cmd === 'status')          { await status(); }
  else if (cmd === 'prices')     { await refreshPrices(); }
  else if (cmd === 'scrape')     { console.log('  scrape was DELETED (2026-10-01) — banned since T8; use safeprices or refresh.'); process.exitCode = 1; }
  else if (cmd === 'safeprices') { await safePrices(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'clean')      { await cleanBadPrices(process.argv[3] === '--delete'); }
  else if (cmd === 'test')       { await testSources(process.argv[3], process.argv[4]); }
  else if (cmd === 'diagnose')   { await diagnoseSet(process.argv[3], process.argv[4]); }
  else if (cmd === 'reprice')    { await repriceEnglish(); }
  else if (cmd === 'ids')        { await showIds(process.argv[3], process.argv[4]); }
  else if (cmd === 'verify')     { await verifySets(process.argv[3]); }
  else if (cmd === 'retry')      { await retryFailed(process.argv[3]); }
  else if (cmd === 'names')      { await backfillNames(process.argv[3]); }
  else if (cmd === 'pokedex')    { await buildPokedex(); }
  else if (cmd === 'setmeta')    { await backfillSetMeta(process.argv[3], process.argv[4]); }
  else if (cmd === 'imgclean')   { await cleanBorrowedImages(); }
  else if (cmd === 'imgreport')  { await imageReport(process.argv[3]); }
  else if (cmd === 'setcover')   { await setCoverage(process.argv[3]); }
  else if (cmd === 'pricefix')   { await priceFix(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'pricecheck') { await priceCheck(process.argv[3], process.argv[4]); }
  else if (cmd === 'filtertest') { require('./jptest').filterTest(); }
  else if (cmd === 'ytest')      { await yahooTest(process.argv[3], process.argv[4]); }
  else if (cmd === 'jpcheck')    { await jpCheck(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'jppurge')    { await jpPurge(...process.argv.slice(3)); }
  else if (cmd === 'yuyutei')    {
    await yuyuteiIngest(...process.argv.slice(3));
    // Ran to the end (no FATAL, not a dry run): a skip noted earlier is answered.
    if (!process.exitCode && !process.argv.includes('--dry')) require('./joblock').clearSkipped('yuyutei');
  }
  else if (cmd === 'rarityfill') { await rarityFill(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'alerts')     { await evaluateAlerts(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'manifest')   { await buildManifest(process.argv[3], process.argv[4], process.argv[5]); }
  // TASK.md T1. Delegates to tcgdexharvest.js — the logic is standalone so
  // that a revert of THIS file cannot take it, which has happened twice.
  else if (cmd === 'tcgdexprices') {
    const h = require('./tcgdexharvest.js');
    try { await h.harvest(process.argv[3] || 'en', process.argv.slice(4)); }
    finally { await h.end(); }   // it owns its own pool; node will not exit otherwise
  }
  else if (cmd === 'verifyset')  { await verifySetData(process.argv[3], process.argv[4]); }
  else if (cmd === 'setgap')     { await setGap(process.argv[3], process.argv[4]); }
  else if (cmd === 'cardgap')    { await cardGap(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'lmset')      { await limitlessSetPreview(process.argv[3], process.argv[4]); }
  else if (cmd === 'nameprobe')  { await nameProbe(process.argv[3], process.argv[4]); }
  else if (cmd === 'cnprobe')    { await cnProbe(process.argv[3], process.argv[4]); }
  else if (cmd === 'audit')      { await auditSets(process.argv[3], process.argv[4]); }
  else if (cmd === 'refresh')    { await refreshDue(process.argv[3], ...process.argv.slice(4)); }
  else if (cmd === 'lmingest')   { await limitlessIngest(process.argv[3], process.argv[4]); }
  else if (cmd === 'imgprobe')   { await probeImageSources(process.argv[3], process.argv[4]); }
  else if (cmd === 'imgfetch')   { await fetchImages(process.argv[3], process.argv[4]); }
  else if (cmd === 'imgsrc')     { await testScrapers(process.argv[3], process.argv[4]); }
  else if (cmd === 'imgscrape')  { await scrapeImages(process.argv[3], process.argv[4], process.argv[5]); }
  else if (cmd === 'all') {
    for (const l of ['en','ja','zh-tw','zh-cn']) await ingestLang(l);
    await status();
  }
  else { await ingestLang(cmd); await status(); }

  if (db) await db.end();
}

main().catch(e => {
  console.error('\n  FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
