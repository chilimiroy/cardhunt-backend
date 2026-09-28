// ══════════════════════════════════════════════════════════════
// searchaudit.js — can /api/search find every card we hold?
//
// "Pikachu Zekrom GX" returned no cards at all while en-sm9-33 sat in the
// database. One report says nothing about how many other cards are
// unreachable, so this walks the whole catalogue of a language through the
// REAL endpoint and counts. Read-only; `listings=0` so no eBay quota is spent.
//
// Three forms per card, because each fails differently:
//   exact     the name exactly as stored            "Pikachu & Zekrom GX"
//   typed     as a person types it: no & - ' . or   "Pikachu Zekrom GX"
//             accents (only where that differs)
//   numbered  name + number/printed total           "Pikachu & Zekrom GX 33/181"
//
// A name-only query for a name held by more cards than the candidate cap
// (25) cannot list every one, so those are judged on "found at least one of
// its own"; the numbered form is where every single card must be found.
//
// Each failure records what the parser DID to the query — words dropped,
// a number or set hint pulled out of the name — so failures group by cause.
//
// TRACKED, like setaudit.js / linkaudit.js: it talks to the public API only.
//
//   node searchaudit.js en                       every English card
//   node searchaudit.js en --set=sm9 --verbose
//   CARDHUNT_API=http://localhost:3001 node searchaudit.js en --json=out.json
// ══════════════════════════════════════════════════════════════

const BASE = process.env.CARDHUNT_API || 'https://cardhunt-backend.onrender.com';

const args    = process.argv.slice(2);
const lang    = (args[0] && !args[0].startsWith('--')) ? args[0] : 'en';
const only    = (args.find(a => a.startsWith('--set=')) || '').replace('--set=', '');
const jsonOut = (args.find(a => a.startsWith('--json=')) || '').replace('--json=', '');
const conc    = parseInt((args.find(a => a.startsWith('--concurrency=')) || '').replace('--concurrency=', '')) || 6;
const verbose = args.includes('--verbose');
const CAP = 25;

async function get(path, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status < 500) return { _status: r.status };
    } catch (e) { if (t === tries - 1) return { _error: e.message }; }
    await new Promise(r => setTimeout(r, 1000 * (t + 1)));
  }
  return { _error: 'gave up' };
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k], k);
      if (++done % 500 === 0) process.stderr.write(`  ${done}/${items.length}\n`);
    }
  });
  await Promise.all(workers);
}

// How a person types a name: punctuation that keyboards make awkward, gone.
function typedForm(name) {
  // Apostrophes and periods are DELETED — "Farfetchd", "Mr Mime" — not spaced.
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '').replace(/[&,:!?◇☆δ]/g, ' ').replace(/-/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Why a failing query failed, as far as the parse shows it.
function diagnose(query, name, parsed, candidates) {
  const tags = [];
  if (!parsed) return ['parse returned null'];
  const want = typedForm(name).toLowerCase().split(' ').filter(Boolean);
  const got  = typedForm(parsed.name || '').toLowerCase().split(' ').filter(Boolean);
  const dropped = want.filter(w => !got.includes(w));
  if (!parsed.name) tags.push('parsed name EMPTY');
  if (dropped.length) tags.push('dropped: ' + dropped.join(' '));
  if (parsed.setHint && !/\d+\/\d+$/.test(query)) tags.push('set hint from name: ' + parsed.setHint);
  if (parsed.number && !/\d+\/\S+$/.test(query)) tags.push('number from name: ' + parsed.number);
  if (parsed.grader) tags.push('grader from name: ' + parsed.grader);
  if (parsed.condition) tags.push('condition from name: ' + parsed.condition);
  if (parsed.rarity) tags.push('rarity from name: ' + parsed.rarity);
  if (parsed.language) tags.push('language from name: ' + parsed.language);
  if (!tags.length) tags.push(candidates.length ? 'parse intact, card not ranked in' : 'parse intact, SQL matched nothing');
  return tags;
}

// Features of the NAME, for grouping — independent of what the parser did.
function nameFeatures(name) {
  const f = [];
  if (/&/.test(name)) f.push('ampersand');
  if (/-/.test(name)) f.push('hyphen');
  if (/['’]/.test(name)) f.push('apostrophe');
  if (/[^\x00-\x7f]/.test(name)) f.push('non-ascii');
  if (/\./.test(name)) f.push('period');
  if (/\d/.test(name)) f.push('digit');
  if (/\b(GX|EX|ex|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|Prime|LEGEND)\b|[◇☆δ]/.test(name)) f.push('mechanic suffix');
  return f.length ? f : ['plain'];
}

(async () => {
  const sl = await get(`/api/sets/lang/${lang}`);
  const sets = (sl.sets || sl.data || sl).filter(s => !only || s.id === only);
  if (!Array.isArray(sets) || !sets.length) { console.error('no sets from', BASE, sl); process.exit(1); }

  const cards = [];
  await pool(sets, 4, async s => {
    const r = await get(`/api/sets/${encodeURIComponent(s.id)}/cards`);
    for (const c of (r.data || r.cards || [])) {
      if (!String(c.id || '').startsWith(lang + '-')) continue;
      cards.push({ id: c.id, name: c.name, number: c.number,
                   total: (c.set && c.set.total) || r.printedTotal || s.total, set: s.id });
    }
  });
  console.error(`${cards.length} ${lang} cards in ${sets.length} sets from ${BASE}`);

  const byName = new Map();
  for (const c of cards) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }

  // Checkpointed. The first full run (2026-09-28) was killed at 11,000 of
  // 21,272 numbered queries and, holding everything in memory until the
  // end, left nothing. With --json the state is written every 250 queries;
  // --resume skips what the file already holds.
  const fs = require('fs');
  let failures = [], errors = [], done = {};
  let counts = { exact: [0, 0], typed: [0, 0], numbered: [0, 0], numberedTop: [0, 0] };
  if (args.includes('--resume') && jsonOut && fs.existsSync(jsonOut)) {
    const s = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    if (s.base !== BASE || s.lang !== lang) { console.error(`--resume: ${jsonOut} is for ${s.base} ${s.lang}`); process.exit(1); }
    ({ counts, failures } = s); errors = s.errors || []; done = s.done || {};
    console.error(`resuming: ${Object.keys(done).length} queries already done`);
  }
  let sinceSave = 0;
  const save = () => { if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ base: BASE, lang, counts, failures, errors, done })); };
  const finish = key => { done[key] = 1; if (++sinceSave >= 250) { sinceSave = 0; save(); } };

  // A query that ERRORED is not a miss. A dead server made every query look
  // like "card not found"; errors are counted apart, never retried as data,
  // and 50 in a row stop the run rather than fill the report with them.
  let errRun = 0;
  const search = async q => {
    const j = await get(`/api/search?q=${encodeURIComponent(q)}&listings=0&limit=${CAP}`);
    const err = j._error || j._status || null;
    if (err) {
      errors.push({ q, err });
      if (++errRun >= 50) { save(); console.error(`\n50 consecutive errors (last: ${err}) — stopping. Checkpoint saved; fix the server and --resume.`); process.exit(2); }
    } else errRun = 0;
    return { parsed: j.parsed || null, cands: (j.candidates || []).map(c => c.cardId), err };
  };

  // Name-only forms, once per distinct name.
  const nameJobs = [];
  for (const [name, own] of byName) {
    nameJobs.push({ form: 'exact', q: name, name, own });
    const t = typedForm(name);
    if (t !== name) nameJobs.push({ form: 'typed', q: t, name, own });
  }
  await pool(nameJobs, conc, async job => {
    const key = job.form + '|' + job.q;
    if (done[key]) return;
    const { parsed, cands, err } = await search(job.q);
    if (err) return;                       // counted in errors, not as a miss
    finish(key);
    const ownIds = job.own.map(c => c.id);
    const found = ownIds.filter(id => cands.includes(id)).length;
    // A name held by more cards than the cap cannot list them all.
    const ok = job.own.length > CAP - 5 ? found > 0 : found === ownIds.length;
    counts[job.form][ok ? 0 : 1] += job.own.length;
    if (!ok) failures.push({ form: job.form, q: job.q, name: job.name, cards: job.own.length,
      found, candidates: cands.length, err, why: diagnose(job.q, job.name, parsed, cands),
      features: nameFeatures(job.name), ids: ownIds.slice(0, 3) });
  });

  // Numbered form, once per card — here every card must be found.
  await pool(cards, conc, async c => {
    const q = c.total ? `${c.name} ${c.number}/${c.total}` : `${c.name} ${c.number}`;
    const key = 'n|' + c.id;
    if (done[key]) return;
    const { parsed, cands, err } = await search(q);
    if (err) return;
    finish(key);
    const ok = cands.includes(c.id);
    counts.numbered[ok ? 0 : 1]++;
    counts.numberedTop[cands[0] === c.id ? 0 : 1]++;
    if (!ok) failures.push({ form: 'numbered', q, name: c.name, cards: 1, found: 0,
      candidates: cands.length, err, why: diagnose(q, c.name, parsed, cands),
      features: nameFeatures(c.name), ids: [c.id] });
  });

  const pct = ([ok, bad]) => `${bad} of ${ok + bad} cards fail (${(100 * bad / Math.max(1, ok + bad)).toFixed(1)}%)`;
  console.log(`\n${lang}: ${cards.length} cards, ${byName.size} distinct names, via ${BASE}\n`);
  console.log(`  exact name     ${pct(counts.exact)}`);
  console.log(`  typed name     ${pct(counts.typed)}   (only names where typing differs)`);
  console.log(`  name + N/T     ${pct(counts.numbered)}`);
  console.log(`  name + N/T     ${counts.numberedTop[1]} not ranked FIRST\n`);

  for (const form of ['exact', 'typed', 'numbered']) {
    const fs = failures.filter(f => f.form === form);
    if (!fs.length) continue;
    const group = (key) => {
      const m = new Map();
      for (const f of fs) for (const k of key(f)) {
        if (!m.has(k)) m.set(k, { cards: 0, ex: [] });
        const g = m.get(k); g.cards += f.cards; if (g.ex.length < 3) g.ex.push(f.q);
      }
      return [...m].sort((a, b) => b[1].cards - a[1].cards);
    };
    console.log(`── ${form}: by what the parser did (cards) ──`);
    // Collapse "dropped: xyz" to the dropped word so the groups are causes.
    for (const [k, g] of group(f => f.why.map(w => w.replace(/^(set hint from name|number from name|rarity from name|condition from name|grader from name): .*/, '$1')))
                           .slice(0, verbose ? 60 : 15))
      console.log(`  ${String(g.cards).padStart(6)}  ${k.padEnd(40)} e.g. ${g.ex.join(' | ')}`);
    console.log(`── ${form}: by name feature (cards; a name can carry several) ──`);
    for (const [k, g] of group(f => f.features))
      console.log(`  ${String(g.cards).padStart(6)}  ${k.padEnd(40)} e.g. ${g.ex.join(' | ')}`);
    console.log('');
  }

  if (errors.length) console.log(`  ${errors.length} queries ERRORED and are not counted above — e.g. ${errors[0].err}. Re-run with --resume.`);
  save();
})();
