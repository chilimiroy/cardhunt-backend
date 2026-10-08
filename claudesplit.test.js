// claudesplit.test.js — CLAUDE.md was split on 2026-10-01: history to
// CLAUDE_ARCHIVE.md, every lesson kept here as a rule. The 31 August
// rewrite had silently dropped "Sources are not interchangeable" and brought
// back a stale tasks section, so the split is checked mechanically:
//
//   1. every heading in the archive (outside code blocks) is still a heading
//      in CLAUDE.md or is CITED from it — nothing vanishes unreferenced;
//   2. the lessons lost in earlier rewrites, restored from the .bak files,
//      are present;
//   3. the rules a newcomer most needs are in CLAUDE.md itself, not only in
//      the archive: a gate never reached, a duplicated definition, a silent
//      fallback, an escape mangled on its way to disk.
//
//   4. CLAUDE.md stays under its BUDGET (60,000 characters). It was split on
//      2026-10-01 and grew back from ~1,290 lines to 163k in three days,
//      because nothing prevented regrowth. The budget and the rule saying
//      what belongs there are written at the top of the file itself.
//
//   node claudesplit.test.js
require('./testcount')(25);   // assertions in a plain run — fewer fails the file (testcount.js)
const fs = require('fs');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } }

const read = f => { try { return fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return null; } };
const cur = read('CLAUDE.md'), arc = read('CLAUDE_ARCHIVE.md');
console.log('\n  claudesplit.test.js\n');
ok(cur && arc, 'CLAUDE.md and CLAUDE_ARCHIVE.md both exist');
if (!cur || !arc) { console.log(`\n  ${pass} passed, ${fail} failed\n`); process.exit(1); }

function headings(md) {
  const out = []; let fence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (m) out.push(m[2]);
  }
  return out;
}
// A citation quotes the heading; a quote inside it may be written \" .
const norm = s => s.replace(/\\"/g, '"');
const curText = norm(cur);

// ── 1. nothing vanished ──
const arcH = headings(arc), curH = new Set(headings(cur));
const missing = arcH.filter(h => !curH.has(h) && !curText.includes(h));
ok(arcH.length > 100, 'archive headings read (' + arcH.length + ')');
ok(missing.length === 0, 'every archive heading kept or cited — missing:\n      ' + missing.join('\n      '));

// ── 2. lessons dropped by earlier rewrites, restored ──
for (const h of ['Sources are not interchangeable — rank them', 'Silent failures are the recurring theme',
                 '"Nothing happened" is not proof a guard works', 'Never assume external API shapes — probe them',
                 'Verify the tool before trusting its output', 'Yahoo Auctions rejects category filters from foreign IPs',
                 'Set ids differ between sources', 'English marketplaces can\'t match Japanese names']) {
  ok(curText.includes(h), 'restored lesson cited: ' + h);
}

// ── 3. the rules themselves, here and not only in the archive ──
const lessons = cur.slice(cur.indexOf('\n# LESSONS'));
ok(cur.indexOf('\n# LESSONS') > 0, 'CLAUDE.md has a LESSONS section');
for (const [what, re] of [
  ['a gate that is never reached', /A gate that is right and never reached is not a gate/],
  ['every path that needs a fix / shared table', /shared table must be reached by\s+every path/],
  ['one definition per thing', /One definition per thing/],
  ['a fallback must announce itself', /A fallback must announce itself/],
  ['escapes mangled by a heredoc + the byte check', /heredoc[\s\S]{0,200}byte check/],
  ['a filter must be tested on what it keeps', /needs a test proving what it KEEPS/],
  ['make a guard fire before believing it', /Make it fire before believing it/],
  ['sources are ranked, not interchangeable', /Sources are not interchangeable — rank them\.\*\*/],
  ['silent failures first / run the file', /RUN a file after editing/],
]) ok(re.test(lessons), 'LESSONS states: ' + what);
ok(/node -e "for\(const f of \[/.test(cur.slice(cur.indexOf('# COMMANDS'), cur.indexOf('# LESSONS'))),
   'the 0x08 byte-check one-liner is in COMMANDS, not only inside a story');

// ── 4. the budget ──
const BUDGET = 60000;
ok(cur.length <= BUDGET, 'CLAUDE.md is within its budget: ' + cur.length + ' of ' + BUDGET +
   ' characters — move measurements to PROGRESS.md and narratives to the archive, one line and a pointer here');
ok(/60,000-character budget/.test(cur.slice(0, 3000)) && /claudesplit.test.js/.test(cur.slice(0, 3000)),
   'the budget is stated at the top of CLAUDE.md, naming this test');

// ── the archive is a frozen record, not a working copy ──
ok(arc.length > cur.length, 'the archive is the larger file');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
