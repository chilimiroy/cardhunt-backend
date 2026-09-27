// ══════════════════════════════════════════════════════════════
// digital.js — which sets exist only inside the mobile game
//
// Pokémon TCG Pocket cards cannot be bought, held or graded. They have no
// market, so a price tracker must not show them: not in a set list, not in
// Browse, not in search, not in trending. Their rows STAY in `cards` — a
// re-ingest is expensive if the decision is ever revisited, and the rows
// cost nothing sitting there. They are hidden at the read layer, here.
//
// ── Identified by SERIES, never by id shape ──
// This used to be `/^[AB]\d+[a-z]?$/` plus a hand list of 15 ids. An id
// shape is a guess about what a future set will be called; the series is
// the source saying what the set IS. Measured 2026-09-27:
//
//   cards.set_series = 'Pokémon TCG Pocket'   15 sets, 2,480 cards, all en
//   TCGdex /v2/en/series/tcgp                  the same 15 ids, same counts
//   TCGdex ja / zh-tw / zh-cn series/tcgp      404 — no Pocket outside en
//
// TCGdex's own series id is `tcgp`; `set_series` stores its NAME, which is
// what the ingested rows carry. Both are listed so either form is caught.
// ══════════════════════════════════════════════════════════════

const POCKET_SERIES_IDS   = ['tcgp'];
const POCKET_SERIES_NAMES = ['Pokémon TCG Pocket'];

const REASON = 'Pokémon TCG Pocket — a digital-only set from the mobile game. ' +
               'Its cards cannot be bought, sold or graded, so it is not tracked.';

function norm(s) { return String(s == null ? '' : s).normalize('NFC').trim().toLowerCase(); }

const NAMES = new Set(POCKET_SERIES_NAMES.map(norm));
const IDS   = new Set(POCKET_SERIES_IDS.map(norm));

// A series name ('Pokémon TCG Pocket'), a series id ('tcgp'), or a TCGdex
// serie object ({ id, name }). Absent series is NOT digital: hiding a
// physical set because a field was empty is the looksLikeJunk mistake.
function isDigitalSeries(serie) {
  if (serie == null) return false;
  if (typeof serie === 'object') return isDigitalSeries(serie.id) || isDigitalSeries(serie.name);
  const n = norm(serie);
  return NAMES.has(n) || IDS.has(n);
}

// SQL fragment: true for a card row we may SHOW. `alias` is the cards alias.
// Written as literals, not parameters, so it can be dropped into any query
// without renumbering its $n placeholders. The names are constants above,
// never caller input; the quote-doubling is belt and braces.
function visibleSql(alias) {
  const col = (alias ? alias + '.' : '') + 'set_series';
  const list = POCKET_SERIES_NAMES.map(n => `'${n.replace(/'/g, "''")}'`).join(', ');
  return `(${col} IS NULL OR ${col} NOT IN (${list}))`;
}

module.exports = { POCKET_SERIES_IDS, POCKET_SERIES_NAMES, REASON,
                   isDigitalSeries, visibleSql };
