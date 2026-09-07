// ══════════════════════════════════════════════════════════════
// listingparse.js — read a seller's title into structured card data
//
// The inverse of cardparse.js. That one reads what a BUYER types;
// this reads what a SELLER wrote, which is a different dialect:
//
//   "2020 Pokemon Champion's Path Card 74/73 Charizard Rainbow Vmax
//    Graded PSA 10 Gem"
//
//   -> { year:2020, setName:"Champion's Path", name:'Charizard Vmax',
//        number:'74', printedTotal:'73', rarity:'Rare Rainbow',
//        grader:'PSA', grade:'10', edition:null, language:'en' }
//
// Why this matters beyond accept/reject: it lets us say what a listing
// IS, not merely whether it might be what we asked for. Two listings
// both reading "4/102 PSA 10" can be a 1st Edition and an Unlimited —
// different products at very different prices.
//
//   const lp = require('./listingparse');
//   const parsed = lp.parseListingTitle(title);
//   const cmp    = lp.compare(parsed, card, grade);
// ══════════════════════════════════════════════════════════════

// ── Edition and print run ─────────────────────────────────────
// The single biggest price differentiator on vintage cards.
const EDITIONS = [
  [/\b1st\s*ed(ition)?\b/i,        '1st Edition'],
  [/\bfirst\s*ed(ition)?\b/i,      '1st Edition'],
  [/\bshadowless\b/i,              'Shadowless'],
  [/\bunlimited\b/i,               'Unlimited'],
  [/\b4th\s*print\b/i,             '4th Print'],
  [/\bstaff\s*(promo|prerelease)?\b/i, 'Staff'],
  [/\bprerelease\b/i,              'Prerelease'],
  [/\bpre-?release\b/i,            'Prerelease']
];

// ── Print variant — same card number, different product ───────
const VARIANTS = [
  [/\bmaster\s*ball\b/i,           'Master Ball'],
  [/\bpoke\s*ball\b/i,             'Poke Ball'],
  [/\breverse\s*(holo|foil)?\b/i,  'Reverse Holo'],
  [/\bcosmos\s*(holo|foil)?\b/i,   'Cosmos Holo'],
  [/\bconfetti\b/i,                'Confetti Holo'],
  [/\bnon-?\s*holo\b/i,            'Non-Holo'],
  [/\bholo(foil|graphic)?\b/i,     'Holo']
];

// ── Rarity as sellers write it ────────────────────────────────
const RARITY_WORDS = [
  [/\bspecial\s+illustration\s+rare\b|\bsir\b/i,  'Special Illustration Rare'],
  [/\billustration\s+rare\b|\bir\b(?!\w)/i,       'Illustration Rare'],
  [/\brainbow\s+(rare|secret)?\b/i,               'Rare Rainbow'],
  [/\bsecret\s+rare\b/i,                          'Rare Secret'],
  [/\bhyper\s+rare\b/i,                           'Hyper Rare'],
  [/\bgold\s+(card|rare|secret)\b/i,              'Hyper Rare'],
  [/\bultra\s+rare\b/i,                           'Rare Ultra'],
  [/\bdouble\s+rare\b/i,                          'Double Rare'],
  [/\bfull\s*art\b|\bfa\b(?!\w)/i,                'Rare Ultra'],
  [/\balt(ernate)?\s*art\b|\baa\b(?!\w)/i,        'Illustration Rare'],
  [/\btrainer\s+gallery\b/i,                      'Trainer Gallery Rare Holo'],
  [/\bamazing\s+rare\b/i,                         'Amazing Rare'],
  [/\bradiant\b/i,                                'Radiant Rare'],
  [/\bace\s*spec\b/i,                             'ACE SPEC Rare'],
  [/\bshiny\s+(rare|vault)?\b/i,                  'Rare Shiny'],
  [/\bholo\s+rare\b/i,                            'Rare Holo']
];

// ── Grading ───────────────────────────────────────────────────
const GRADERS = ['PSA','BGS','CGC','SGC','TAG','ACE','AGS','ARS','GMA','HGA'];

// Marketing noise carrying no identifying value
const NOISE = /\b(pokemon|pokémon|tcg|card|cards|game|nintendo|genuine|authentic|mint|near|nm|lp|excellent|rare|holo|foil|graded|slab|slabbed|gem|gemmint|pristine|beautiful|stunning|investment|invest|rare!|wow|look|l@@k|htf|hard to find|vintage|collectible|collection|lot|free\s*ship\w*|fast\s*ship\w*|us\s*seller|new|sealed|psa\s*ready|pack\s*fresh|centered|centering|swirl|no\s*swirl|error)\b/gi;

function normNum(n) {
  if (n === null || n === undefined) return null;
  const s = String(n).trim().split(/[\/／]/)[0].trim();
  const pre = s.match(/^([A-Za-z]{1,4})0*(\d{1,4})$/);
  if (pre) return pre[1].toUpperCase() + String(parseInt(pre[2], 10));
  const d = s.replace(/[^0-9]/g, '');
  return d ? String(parseInt(d, 10)) : (s.toUpperCase() || null);
}

function parseListingTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return null;

  const out = {
    raw, year: null, language: 'en', setName: null, name: null,
    number: null, printedTotal: null, rarity: null,
    grader: null, grade: null, gradeLabel: null,
    edition: null, variant: null, condition: null,
    isLot: false, isSealed: false, isCustom: false
  };

  let t = ' ' + raw + ' ';

  // ── Disqualifiers, checked before anything else ──
  if (/\b(lot|lots|bundle|set of \d+|\d+\s*cards?\b|collection of)\b/i.test(t)) out.isLot = true;
  if (/\b(booster|box|pack|packs|tin|etb|elite trainer|sealed|case)\b/i.test(t)) out.isSealed = true;
  if (/\b(custom|proxy|proxies|orica|replica|fake|metal card|jumbo|oversized)\b/i.test(t)) out.isCustom = true;

  // ── Year, usually a prefix: "1999 Pokemon Base Set..." ──
  let m = t.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (m) { out.year = parseInt(m[1]); t = t.replace(m[0], ' '); }

  // ── Language ──
  if (/\b(japanese|japan|jpn|jp)\b/i.test(t)) { out.language = 'ja'; t = t.replace(/\b(japanese|japan|jpn|jp)\b/gi, ' '); }
  else if (/\b(chinese|traditional chinese|simplified chinese)\b/i.test(t)) { out.language = 'zh'; }
  else if (/\b(korean|kor)\b/i.test(t)) { out.language = 'ko'; }
  else if (/\b(german|french|italian|spanish|portuguese)\b/i.test(t)) { out.language = 'eu'; }
  if (/[\u3040-\u30ff]/.test(raw)) out.language = 'ja';

  // ── Grader + grade ──
  for (const co of GRADERS) {
    const re = new RegExp('\\b' + co + '\\s*[-:]?\\s*(10|[1-9](?:\\.5)?)(?![\\d.])', 'i');
    const hit = t.match(re);
    if (hit) { out.grader = co; out.grade = hit[1]; t = t.replace(hit[0], ' '); break; }
    const bare = new RegExp('\\b' + co + '\\b', 'i');
    if (!out.grader && bare.test(t)) { out.grader = co; t = t.replace(bare, ' '); }
  }
  // Grade words, meaningful only alongside a grader
  if (out.grader) {
    const lm = t.match(/\b(gem\s*mint|gem\s*mt|black\s*label|pristine|perfect)\b/i);
    if (lm) { out.gradeLabel = lm[1].toUpperCase().replace(/\s+/g, ' '); t = t.replace(lm[0], ' '); }
  } else {
    const cm = t.match(/\b(near\s*mint|mint|lightly\s*played|moderately\s*played|heavily\s*played|damaged|nm\/?m?|lp|mp|hp)\b/i);
    if (cm) out.condition = cm[1].toUpperCase().replace(/\s+/g, ' ');
  }

  // ── Collector number ──
  m = t.match(/\b([A-Za-z]{0,4}\d{1,4})\s*\/\s*([A-Za-z]{0,4}\d{1,4})\b/);
  if (m) {
    out.number = normNum(m[1]);
    out.printedTotal = normNum(m[2]);
    t = t.replace(m[0], ' ');
  } else {
    m = t.match(/#\s*([A-Za-z]{0,4}\d{1,4})\b/);
    if (m) { out.number = normNum(m[1]); t = t.replace(m[0], ' '); }
  }

  // ── Edition and variant, before rarity strips the holo words ──
  for (const [re, label] of EDITIONS) {
    if (re.test(t)) { out.edition = label; t = t.replace(re, ' '); break; }
  }
  for (const [re, label] of VARIANTS) {
    if (re.test(t)) { out.variant = label; t = t.replace(re, ' '); break; }
  }
  for (const [re, canon] of RARITY_WORDS) {
    if (re.test(t)) { out.rarity = canon; t = t.replace(re, ' '); break; }
  }

  // ── What survives is the card name, and possibly the set ──
  t = t.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();

  // Mechanic suffixes anchor the card name
  const mech = t.match(/\b(vmax|vstar|v-?union|ex|gx|v|break|prime|star|lv\.?\s*x)\b/i);
  if (mech) {
    const idx = t.toLowerCase().indexOf(mech[0].toLowerCase());
    const before = t.slice(0, idx + mech[0].length).trim();
    const after  = t.slice(idx + mech[0].length).trim();
    // The Pokémon name is the last words before the suffix
    const words = before.split(/\s+/);
    out.name = words.slice(Math.max(0, words.length - 3)).join(' ');
    const setGuess = words.slice(0, Math.max(0, words.length - 3)).join(' ') + ' ' + after;
    out.setName = setGuess.trim() || null;
  } else {
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length) {
      out.name = words[words.length - 1];
      out.setName = words.slice(0, -1).join(' ') || null;
    }
  }
  if (out.setName) out.setName = out.setName.replace(/\s+/g, ' ').trim() || null;
  if (out.name)    out.name    = out.name.replace(/\s+/g, ' ').trim() || null;

  return out;
}

// ── Compare a parsed listing against the card we asked for ────
// Returns every point of agreement and disagreement, so a caller can
// decide rather than being handed a bare boolean.
function compare(parsed, card, grade) {
  if (!parsed) return { match: false, reasons: ['unparseable title'] };

  const agree = [], disagree = [];

  if (parsed.isLot)    disagree.push('listing is a lot, not one card');
  if (parsed.isSealed) disagree.push('listing is sealed product');
  if (parsed.isCustom) disagree.push('listing is a custom or proxy');

  const wantNum = normNum(card.number);
  const wantTot = card.setTotal ? normNum(card.setTotal) : null;

  if (parsed.number) {
    if (parsed.number === wantNum) {
      agree.push('number ' + wantNum);
      if (wantTot && parsed.printedTotal) {
        if (parsed.printedTotal === wantTot) agree.push('set size ' + wantTot);
        else disagree.push(`set size ${parsed.printedTotal} but wanted ${wantTot} — a different set`);
      }
    } else {
      disagree.push(`number ${parsed.number} but wanted ${wantNum}`);
    }
  }

  const g = String(grade || '').trim();
  const gm = g.match(/^([A-Za-z]+)\s*([\d.]+)$/);
  if (gm) {
    const [, wg, wn] = gm;
    if (!parsed.grader) disagree.push(`wanted ${wg} ${wn}, title states no grade`);
    else if (parsed.grader !== wg.toUpperCase()) disagree.push(`graded by ${parsed.grader}, wanted ${wg}`);
    else if (parsed.grade !== wn) disagree.push(`${parsed.grader} ${parsed.grade}, wanted ${wn}`);
    else agree.push(`${wg} ${wn}`);
  } else if (/^raw|^ungraded/i.test(g)) {
    if (parsed.grader) disagree.push(`wanted raw, title is a ${parsed.grader} slab`);
    else agree.push('ungraded');
  }

  return {
    match: disagree.length === 0 && agree.length > 0,
    agree, disagree,
    // Surfaced, never used to reject — a variant is information, not a mismatch
    edition: parsed.edition,
    variant: parsed.variant,
    reasons: disagree
  };
}

module.exports = { parseListingTitle, compare, normNum,
                   EDITIONS, VARIANTS, RARITY_WORDS };
