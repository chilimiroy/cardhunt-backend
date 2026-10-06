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

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS card_reference_scans (
  card_id text PRIMARY KEY,
  scan_url text NOT NULL,
  state text NOT NULL,              -- 'built' | 'unbuildable'
  reason text,                      -- why unbuildable
  tw int, w int, h int,             -- tw: the matcher width it was built for
  rgb bytea,
  built_at timestamptz NOT NULL DEFAULT now())`;
// Catalogue bookkeeping, like listing_photo_verdicts (migration-rls.sql):
// RLS on with no policy, so the public anon key reads and writes nothing;
// the server and the tools run as postgres and bypass it.
const RLS_SQL = [
  'ALTER TABLE card_reference_scans ENABLE ROW LEVEL SECURITY',
  'REVOKE TRUNCATE ON card_reference_scans FROM anon, authenticated'];

let _ready = null;
function ensureTable(db) {
  return _ready || (_ready = (async () => {
    await db.query(TABLE_SQL);
    for (const s of RLS_SQL) await db.query(s).catch(() => {});   // roles absent outside Supabase
  })().catch(e => { _ready = null; throw e; }));
}

// The scan a reference is built from — the same rule wholeTemplateOf used:
// TCGdex serves a .jpg beside each .png; anything else is fetched as given
// and must decode as a JPEG.
function scanUrlOf(row) {
  const src = String((row && (row.image_large || row.image_small)) || '');
  return /^https:\/\/assets\.tcgdex\.net\/.+\.png$/.test(src) ? src.replace(/\.png$/, '.jpg') : src;
}

// JPEG bytes -> the stored template, or { reason } when it cannot be one.
function templateFromScan(buf) {
  if (!(buf && buf[0] === 0xff && buf[1] === 0xd8)) return { reason: 'scan is not a JPEG' };
  const img = stampcheck.decodeJpeg(buf);
  const t96 = stampcheck.resize(img, 96, 96 * img.h / img.w);
  const t = stampcheck.resize(t96, stampcheck.WHOLE_TW, stampcheck.WHOLE_TW * t96.h / t96.w);
  return { tw: stampcheck.WHOLE_TW, w: t.w, h: t.h, rgb: Buffer.from(t.data) };
}

// A stored row -> the `wholes` entry stampcheck reads, or null. A row built
// for another matcher width is not this matcher's template.
function entryOf(row) {
  if (!row || row.state !== 'built' || row.tw !== stampcheck.WHOLE_TW || !row.rgb) return null;
  return { scan: row.scan_url, w: row.w, h: row.h, rgb: Buffer.from(row.rgb).toString('base64') };
}

module.exports = { TABLE_SQL, RLS_SQL, ensureTable, scanUrlOf, templateFromScan, entryOf };
