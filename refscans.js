// refscans.js — our own reference scans, built ahead of time (speed T2, 2026-10-06)
//
// The rule: a visitor's request never waits on a third-party host. The
// same-name sibling check compares a seller's photo with OUR catalogue scan
// of each card of that name in the set. Those scans used to be fetched and
// decoded inside the listings request (server.js wholeTemplateOf), so every
// cold card page waited on the image host and on a synchronous JPEG decode
// before it could answer. Now `refbuild.js` builds each card's reference
// once, ahead of time, and the server only reads the stored row.
//
// What is stored is the template the matcher actually compares: the scan at
// 96 px wide, then resized to WHOLE_TW (24 px) exactly as wholeScore resizes
// it. Measured 2026-10-06: 600 of 600 wholeScore comparisons identical
// between the 96-px and the stored 24-px template (photo widths 150-1000),
// so no verdict changes. 2,376 bytes a card; ~19 MB for every English card
// with a same-name sibling (7,943 on 2026-10-06), where the 96-px template
// would have been ~300 MB.
//
// Our own immutable catalogue scans only. Listing photos are what is for
// sale now and are never stored here.
//
// A card with no row (not built yet), or a row that could not be built
// ('unbuildable', with its reason), is NOT a clean card: the server leaves
// its sibling comparison out of the check AND reports it as not run.

const stampcheck = require('./stampcheck');

// How a stored reference was derived. Like VERDICT_VERSION: change it when
// the derivation changes (the resize, the matcher width, the source rule)
// and every older row stops being used and is rebuilt by refbuild.js,
// instead of two generations being compared side by side unnoticed.
//   ref-1-w24: the scan area-resized to 96 px wide, then to WHOLE_TW (24).
const REF_VERSION = 'ref-1-w' + stampcheck.WHOLE_TW;

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS card_reference_scans (
  card_id text PRIMARY KEY,
  scan_url text NOT NULL,
  state text NOT NULL,              -- 'built' | 'unbuildable'
  reason text,                      -- why unbuildable
  version text,                     -- REF_VERSION of a built row
  tw int, w int, h int,             -- tw: the matcher width it was built for
  rgb bytea,
  built_at timestamptz NOT NULL DEFAULT now())`;
// A table made before the version column gains it (rows without one are
// not used until rebuilt; migration-reference-scans.sql stamped the first
// generation, built by exactly this derivation, as ref-1-w24).
const MIGRATE_SQL = [
  'ALTER TABLE card_reference_scans ADD COLUMN IF NOT EXISTS version text'];
// Catalogue bookkeeping, like listing_photo_verdicts (migration-rls.sql):
// RLS on with no policy, so the public anon key reads and writes nothing;
// the server and the tools run as postgres and bypass it.
const RLS_SQL = [
  'ALTER TABLE card_reference_scans ENABLE ROW LEVEL SECURITY',
  'REVOKE TRUNCATE ON card_reference_scans FROM anon, authenticated'];

// First use: create / migrate a table — only on an unguarded pool
// (schemaguard.js, as roles.pgStore). A guarded pool (a test booting the
// server against the real database) never sends DDL: it CHECKS the table has
// every column this code reads and refuses, naming what is missing.
function ensurer(spec) {
  let ready = null;
  return db => {
    const migrate = !require('./schemaguard').isGuarded(db);
    return ready || (ready = (async () => {
      if (!migrate) {
        const r = await db.query(`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`, [spec.name]);
        const have = new Set(r.rows.map(x => x.column_name)), missing = spec.columns.filter(c => !have.has(c));
        if (missing.length) throw new Error(spec.name + ' is missing ' + missing.join(', ')
          + ' — the server\'s first-use migration or ' + spec.migration + ' adds it; a guarded pool does not');
        return;
      }
      await db.query(spec.sql);
      for (const s of spec.migrate || []) await db.query(s);
      for (const s of spec.rls) await db.query(s).catch(() => {});   // roles absent outside Supabase
    })().catch(e => { ready = null; throw e; }));
  };
}
const COLUMNS = ['card_id', 'scan_url', 'state', 'reason', 'version', 'tw', 'w', 'h', 'rgb', 'built_at'];
const ensureTable = ensurer({ name: 'card_reference_scans', sql: TABLE_SQL, migrate: MIGRATE_SQL, rls: RLS_SQL,
  columns: COLUMNS, migration: 'migration-reference-scans.sql' });

// ── The colour reference: our scan's gold/black profile (2026-10-07) ──
// The novelty check (stampcheck.materialJudge) compares a seller's photo
// with OUR scan's colour. That profile was computed inside the request
// (server.js materialRefOf: fetch the scan, decode, colourProfile), bounded
// at 1.5 s — a visitor's request waiting on a third-party host, the same as
// the sibling scans. Now refbuild.js --colour stores it ahead of time; the
// server reads it and keeps the old path only as a live fallback. Two
// numbers a card. version = stampcheck.MATERIAL_VERSION: a change to how
// colour is measured retires every stored profile. scan_url is the scan it
// was measured from: a card whose image changed is measured again.
const COLOUR_TABLE_SQL = `CREATE TABLE IF NOT EXISTS card_colour_refs (
  card_id text PRIMARY KEY,
  scan_url text NOT NULL,
  state text NOT NULL,              -- 'built' | 'unbuildable'
  reason text,
  version text,                     -- stampcheck.MATERIAL_VERSION of a built row
  gold double precision, black double precision,
  built_at timestamptz NOT NULL DEFAULT now())`;
const COLOUR_RLS_SQL = [
  'ALTER TABLE card_colour_refs ENABLE ROW LEVEL SECURITY',
  'REVOKE TRUNCATE ON card_colour_refs FROM anon, authenticated'];
const COLOUR_COLUMNS = ['card_id', 'scan_url', 'state', 'reason', 'version', 'gold', 'black', 'built_at'];
const ensureColourTable = ensurer({ name: 'card_colour_refs', sql: COLOUR_TABLE_SQL, rls: COLOUR_RLS_SQL,
  columns: COLOUR_COLUMNS, migration: 'migration-colour-refs.sql' });

// The scan the colour is measured from — the rule server.js materialScanUrl
// had (moved here: the builder and the server must agree). English cards
// with a TCGdex scan (the .jpg beside the .png) or pokemontcg.io PNG art.
function colourScanUrlOf(card) {
  const src = String((card && (card.image_small || card.image_large)) || '');
  if (/^https:\/\/assets\.tcgdex\.net\/.+\.(?:png|jpg)$/.test(src)) return src.replace(/\.png$/, '.jpg');
  return stampcheck.PNG_SCAN_HOST.test(src) ? src : null;
}
// Scan bytes -> { version, gold, black } or { reason }: the decode and
// colourProfile the worker runs on a scan (stampcheck checkMaterialScan).
function colourFromScan(buf) {
  const png = buf && buf[0] === 0x89 && buf[1] === 0x50, jpeg = buf && buf[0] === 0xff && buf[1] === 0xd8;
  if (!png && !jpeg) return { reason: 'scan is neither a JPEG nor a PNG' };
  const p = stampcheck.colourProfile(stampcheck.decodeImage(buf));
  return { version: stampcheck.MATERIAL_VERSION, gold: p.gold, black: p.black };
}
// A stored row -> { gold, black } for this card's CURRENT scan, or null.
function colourOf(row, scanUrl) {
  if (!row || row.state !== 'built' || row.version !== stampcheck.MATERIAL_VERSION) return null;
  if (!scanUrl || row.scan_url !== scanUrl || row.gold == null || row.black == null) return null;
  return { gold: row.gold, black: row.black };
}

// The scan a reference is built from — the same rule wholeTemplateOf used:
// TCGdex serves a .jpg beside each .png; anything else is fetched as given
// and must decode as a JPEG or a PNG.
function scanUrlOf(row) {
  const src = String((row && (row.image_large || row.image_small)) || '');
  return /^https:\/\/assets\.tcgdex\.net\/.+\.png$/.test(src) ? src.replace(/\.png$/, '.jpg') : src;
}

// Scan bytes -> the stored template, or { reason } when it cannot be one.
// JPEG (TCGdex) or PNG (pokemontcg.io, scrydex: 86 sibling cards on
// 2026-10-06 have only a PNG) through stampcheck.decodeImage, the one
// decoder, which flattens PNG transparency onto white as a printed card
// shows. Measured 2026-10-06 on the Alakazam EX fixture (18 photos, both
// ways): PNG references keep every genuine photo and find every swap the
// JPEG ones find, with margins ~1.2x wider in BOTH directions — real seller
// photos under PNG references are not yet measured.
function templateFromScan(buf) {
  const png = buf && buf[0] === 0x89 && buf[1] === 0x50, jpeg = buf && buf[0] === 0xff && buf[1] === 0xd8;
  if (!png && !jpeg) return { reason: 'scan is neither a JPEG nor a PNG' };
  const img = stampcheck.decodeImage(buf);
  const t96 = stampcheck.resize(img, 96, 96 * img.h / img.w);
  const t = stampcheck.resize(t96, stampcheck.WHOLE_TW, stampcheck.WHOLE_TW * t96.h / t96.w);
  return { version: REF_VERSION, tw: stampcheck.WHOLE_TW, w: t.w, h: t.h, rgb: Buffer.from(t.data) };
}

// A stored row -> the `wholes` entry stampcheck reads, or null. A row of
// another REF_VERSION is not this matcher's template.
function entryOf(row) {
  if (!row || row.state !== 'built' || row.version !== REF_VERSION || !row.rgb) return null;
  return { scan: row.scan_url, w: row.w, h: row.h, rgb: Buffer.from(row.rgb).toString('base64') };
}

module.exports = { REF_VERSION, TABLE_SQL, MIGRATE_SQL, RLS_SQL, ensureTable, scanUrlOf, templateFromScan, entryOf,
  COLOUR_TABLE_SQL, COLOUR_RLS_SQL, ensureColourTable, colourScanUrlOf, colourFromScan, colourOf };
