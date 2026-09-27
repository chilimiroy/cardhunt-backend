// ══════════════════════════════════════════════════════════════
// cardid.js — is this one of OUR card ids?
//
// Card ids are {lang}-{setId}-{number}, lang one of en / ja / zh-tw / zh-cn.
// Anything else is a bug, not a card: it was handed out by a path that
// resolved a card in another source's id space. Refuse it loudly.
//
// Found 2026-09-27. Two rows in `cards` carried pokemontcg.io ids:
//   me2pt5-294  (2026-09-20)  twin of en-me02.5-294
//   me55c-33    (2026-09-24)  twin of en-30th-c-008
// The producers, both in the page:
//   me55c-33   the Add Alert card picker (pickAlertCard) searched
//              pokemontcg.io DIRECTLY, newest set first, and took the first
//              result. "Pikachu & Zekrom-GX" -> me55c-33, set name "30th
//              Celebration: Classic Collection" — alert 5's fields exactly.
//              A card fetch 0.75s later INSERTed it (INSERT removed, 2fd8549).
//   me2pt5-294 the embedded ME2PT5_PREMIUM list: 45 Ascended Heroes cards under
//              me2pt5-* ids, spliced into our set page for missing numbers.
// Also found and closed: the Search screen's "Trending" grid (pokemontcg.io
// sv8pt5-* tiles), the set page's pokemontcg-direct fallback, and TCGdex-
// direct cards minted as {set}-{num} with no language.
// And once a stray row existed, our own /api/search resolved "Pikachu &
// Zekrom-GX" to it, confidently, because it spelled the name pokemontcg's way.
//
// The page carries a copy of OUR_CARD_ID (it cannot require this file);
// cardid.test.js asserts the two are the same pattern.
// ══════════════════════════════════════════════════════════════
const OUR_CARD_ID = /^(en|ja|zh-tw|zh-cn)-/;

function isOurCardId(id) { return OUR_CARD_ID.test(String(id == null ? '' : id)); }

// SQL: true for a row whose id is ours. Literal, no $n, like visibleSql.
function ourIdSql(alias) {
  return `${alias ? alias + '.' : ''}api_card_id ~ '^(en|ja|zh-tw|zh-cn)-'`;
}

function refusal(id) {
  return { error: 'foreign card id',
           cardId: String(id),
           reason: `"${id}" is not a CardHunt card id — ids are {en|ja|zh-tw|zh-cn}-{set}-{number}. ` +
                   'Something resolved this card in another source\'s id space; that is a bug, not a card.' };
}

module.exports = { OUR_CARD_ID, isOurCardId, ourIdSql, refusal };
