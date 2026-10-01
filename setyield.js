// setyield.js — a refresh that prices nothing for a whole set says so
//
// The 29 September set-name check (tcgsetname.js) silently stopped svp,
// xyp, bwp, mep, sve and mee refreshing for two days. Every card in those
// sets came back "no data", the run ended "N refreshed, M without data",
// and the M hid six whole sets inside a number nobody reads. It was found
// by accident (CLAUDE.md, LESSONS §3: "A tightened check can also stop a
// source silently").
//
// A guard can fail by OVER-blocking, and over-blocking is invisible: no
// error, no wrong price, just nothing. So the refresh tallies every card
// it asked about by set, and at the end names each set where it asked
// about several cards and got NOTHING back — no price written, none
// refused by sourcerank either.
//
// Two kinds, because they mean different things:
//   regressed — those cards HAD a real price before this run. Something
//               that used to answer for this set has stopped: a source, a
//               guard, a mapping. This is the svp case. The refresh exits
//               non-zero so Task Scheduler's LastTaskResult (and
//               task-watch.log) carries it, not only refresh.log.
//   never     — none of the cards asked has ever been priced. A known
//               gap (Chinese, the 222 English cards no source prices),
//               reported so it is visible, not as a failure.
//
// A set with fewer than MIN_ASKED cards due is not judged: one Common
// with no data is noise, and judging it would bury the signal.
//
// The same failure without a set boundary: a SOURCE that stops answering
// part-way through. The 1 Oct ja refresh priced 110 of its first 1,200
// cards and then nothing for 1,500 in a row — cards are ordered by urgency,
// so every set kept an early answer and no set looked empty. The longest
// run of consecutive "nothing" is reported when it reaches STREAK_MIN.
'use strict';

const MIN_ASKED = 3;
const STREAK_MIN = 200;

function createTally() {
  const sets = new Map();
  let n = 0, cur = 0, curFrom = 0, longest = { length: 0, from: null, to: null };
  return {
    // outcome: 'priced' (a price written), 'kept' (a price found and refused
    // by sourcerank — the source answered), 'missed' (nothing came back).
    add(card, outcome) {
      const id = card.set_api_id || '(no set)';
      let s = sets.get(id);
      if (!s) sets.set(id, s = { set: id, setName: card.set_name || null,
                                 asked: 0, priced: 0, kept: 0, missed: 0, heldBefore: 0 });
      s.asked++;
      if (outcome === 'priced') s.priced++;
      else if (outcome === 'kept') s.kept++;
      else s.missed++;
      // "Had a real price before": the refresh SELECT reads the newest
      // non-estimate row, so price > 0 here means a real price existed.
      if (Number(card.price) > 0) s.heldBefore++;
      n++;
      if (outcome === 'missed') {
        if (!cur) curFrom = n;
        cur++;
        if (cur > longest.length) longest = { length: cur, from: curFrom, to: n };
      } else cur = 0;
    },
    sets() { return [...sets.values()]; },
    // The longest run of consecutive cards that got nothing, 1-based
    // positions in the run, and whether it ran to the END (a source that
    // stopped and never came back, or the budget ran out inside it).
    streak() { return Object.assign({}, longest, { of: n, toEnd: longest.length > 0 && longest.to === n }); },
    report(opts) { return Object.assign(report(this.sets(), opts), { streak: this.streak() }); }
  };
}

function report(sets, opts) {
  const min = (opts && opts.minAsked) || MIN_ASKED;
  const empty = sets.filter(s => s.asked >= min && s.priced === 0 && s.kept === 0);
  const unjudged = sets.filter(s => s.asked < min && s.priced === 0 && s.kept === 0).length;
  const byMissed = (a, b) => b.missed - a.missed || a.set.localeCompare(b.set);
  return {
    minAsked: min,
    judged: sets.filter(s => s.asked >= min).length,
    regressed: empty.filter(s => s.heldBefore > 0).sort(byMissed),
    never: empty.filter(s => s.heldBefore === 0).sort(byMissed),
    unjudged
  };
}

// Printed lines, for the refresh log. Empty array when there is nothing to say.
function format(rep, lang) {
  const out = [];
  const st = rep.streak;
  if (st && st.length >= STREAK_MIN) {
    out.push('', '  ' + '!'.repeat(70),
      `  ${st.length} CARDS IN A ROW GOT NOTHING (${lang}) — cards ${st.from}-${st.to} of ${st.of}${st.toEnd ? ', to the end of the run' : ''}`,
      '  Cards run in urgency order across every set, so a source that stops',
      '  answering part-way looks like many sets with a few gaps. Read what',
      '  the source answered (below) before believing these cards have no market.',
      '  ' + '!'.repeat(70));
  }
  if (!rep.regressed.length && !rep.never.length) return out.length ? out.concat(['']) : out;
  const row = s => `    ${String(s.set).padEnd(14)} ${String(s.setName || '').slice(0, 30).padEnd(32)}`
    + `${String(s.asked).padStart(4)} asked   ${String(s.heldBefore).padStart(4)} had a price`;
  if (rep.regressed.length) {
    out.push('', '  ' + '!'.repeat(70),
      `  SETS THAT PRICED NOTHING THIS RUN — ${rep.regressed.length} (${lang})`,
      '  Every card asked came back with no data, and these cards HAD real',
      '  prices before. Something that answered for this set has stopped:',
      '  a source, a guard, a set-name mapping (the 29 Sept svp/xyp/bwp case).');
    rep.regressed.forEach(s => out.push(row(s)));
    out.push(`  Diagnose one:  node ingest.js refresh ${lang} --set=<set>  and read the per-card lines.`,
      '  ' + '!'.repeat(70));
  }
  if (rep.never.length) {
    out.push('', `  Sets with no price from any source (never priced before either) — ${rep.never.length}:`);
    rep.never.forEach(s => out.push(row(s)));
  }
  out.push('');
  return out;
}

module.exports = { createTally, report, format, MIN_ASKED, STREAK_MIN };
