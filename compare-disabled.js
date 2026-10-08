// ══════════════════════════════════════════════════════════════
// compare-disabled.js — the card-compare overlay, PRESERVED and DISABLED.
//
// NOT LOADED BY ANY PAGE. NOT SERVED. Do not add a <script> tag for it.
//
// What it was: a "⚖️ Compare" button on the card page and on the search
// results, opening an overlay that showed the current card beside a dashed
// "Choose card to compare" slot. The slot sent the visitor to the search
// screen and nothing ever came back: a second card could not be chosen, so
// the comparison never had two sides.
//
// Why disabled (Roy, 2026-10-08, TASK-reports-and-pages T1): out of reach
// until it is built for real — keep the code, make it unreachable, the way
// checkout-disabled.js was parked. It had no server endpoint (the
// POST /api/listings/:id/compare route is the PHOTO comparison, unrelated).
//
// Why kept: the overlay layout is the reusable part if a real two-card
// compare is built. nofabricated.test.js fails if a Compare button, the
// overlay or openCompare reappears in the served page, or if the server
// serves or requires this file.
// ══════════════════════════════════════════════════════════════

'use strict';

// The overlay markup the page carried (was before #add-alert-overlay).
const COMPARE_HTML = "<!-- ══ COMPARE ══\n     openCompare() has existed and referenced #compare-grid and\n     #compare-overlay for a long time, and NEITHER ELEMENT WAS IN THE PAGE.\n     Clicking the Compare button on the card page threw\n     \"Cannot set properties of null\" and did nothing - code addressing\n     markup that is not there, which is the v36 shape exactly. Found by\n     clicking the button. -->\n<div id=\"compare-overlay\" class=\"ovl\" style=\"display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:600;align-items:center;justify-content:center;backdrop-filter:blur(4px)\">\n  <div style=\"background:var(--w);border-radius:20px;padding:28px;width:92%;max-width:760px;position:relative;box-shadow:var(--sh3);max-height:88vh;overflow:auto\">\n    <button onclick=\"closeM(&quot;compare-overlay&quot;)\" style=\"position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;background:var(--bg);border:none;font-size:16px;cursor:pointer\">&#10005;</button>\n    <div style=\"font-size:18px;font-weight:800;margin-bottom:4px\">&#9878;&#65039; Compare cards</div>\n    <div style=\"font-size:13px;color:var(--mu);margin-bottom:20px\">Side by side, at the grade each one is currently showing.</div>\n    <div id=\"compare-grid\" style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px\"></div>\n  </div>\n</div>\n";

// The buttons that opened it: the card page's nav (price-only) and the
// search results header (price-only).
const COMPARE_BUTTON = '<button class="btn price-only" onclick="openCompare()">⚖️ Compare</button>';

// The i18n entries it had (removed from LANG_JA / LANG_ZH_TW / LANG_ZH_CN,
// which may only hold text the page carries).
const COMPARE_I18N = {
  ja:    { '⚖️ Compare': '⚖️ 比較', '⚖️ Compare cards': '⚖️ カードを比較', 'Side by side, at the grade each one is currently showing.': '各カードの現在のグレードで並べて比較。' },
  zhTW:  { '⚖️ Compare': '⚖️ 比較', '⚖️ Compare cards': '⚖️ 比較卡牌', 'Side by side, at the grade each one is currently showing.': '並排比較，各自以目前顯示的評級呈現。' },
  zhCN:  { '⚖️ Compare': '⚖️ 比较', '⚖️ Compare cards': '⚖️ 比较卡牌', 'Side by side, at the grade each one is currently showing.': '并排比较，各自按当前显示的评级呈现。' },
};

// The function, as it was in the page.
function openCompare(){
  const c=S.currentCard;if(!c){openM('compare-overlay');return;}
  const base=S.activeGradeBase;
  document.getElementById('compare-grid').innerHTML=`
    <div style="border:2px solid var(--t);border-radius:var(--r);padding:20px;text-align:center;background:var(--tl)">
      <img src="${c.images?.small||''}" style="height:140px;object-fit:contain;margin:0 auto 12px;border-radius:8px;box-shadow:var(--sh2)">
      <div style="font-size:15px;font-weight:700">${c.name}</div>
      <div style="font-size:12px;color:var(--mu);margin-top:2px">${c.set?.name||''} · #${c.number}</div>
      <div style="font-size:22px;font-weight:800;margin-top:10px;color:var(--t)">$${base.toFixed(2)}</div>
      <div style="font-size:12px;color:var(--mu)">${S.activeGrade}</div>
      <div style="font-size:11px;margin-top:8px;padding:6px;background:var(--w);border-radius:8px">Rarity: ${c.rarity||'—'} · HP: ${c.hp||'—'}</div>
    </div>
    <div onclick="doSearch('');SS('search')" style="border:2px dashed var(--bd);border-radius:var(--r);padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:280px;background:var(--bg);cursor:pointer;gap:12px">
      <div style="font-size:40px">+</div>
      <div style="font-size:14px;font-weight:600;color:var(--mu)">Choose card to compare</div>
      <div style="font-size:12px;color:var(--fa)">Search and select any card</div>
    </div>`;
  openM('compare-overlay');
}

module.exports = { COMPARE_HTML, COMPARE_BUTTON, COMPARE_I18N, openCompare };
