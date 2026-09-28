// ══════════════════════════════════════════════════════════════
// checkout-disabled.js — the in-page checkout, PRESERVED and DISABLED.
//
// NOT LOADED BY ANY PAGE. NOT SERVED. Do not add a <script> tag for it.
//
// What it was: a four-step "checkout" on the card page (Delivery, Account,
// Payment, Confirm), reached from the Photos viewer's Buy button. It asked
// for the buyer's eBay (or "Store") PASSWORD and a CARD NUMBER, expiry and
// CVV - prefilled with invented values ("Alex Cohen", 4532 1234 5678 9012) -
// and then showed "Order confirmed!" with a fabricated "Order #CH-" + a
// random number, for an order that was never placed anywhere. Shipping
// $4.99 and "Protection" $0.89 were invented too. It was live on a public
// URL.
//
// Why disabled (2026-09-28, TASK T7): a form that collects a card number
// and a marketplace password must not ship to browsers at all, and a
// confirmation for an order that does not exist is the worst kind of
// invented data. Unreachable-but-present was not enough: this project has
// already found dead code in the page still able to write a live element
// (renderRealListings).
//
// Why kept: Roy may rebuild checkout for other marketplaces. The layout and
// the step flow are the reusable part.
//
// MUST NOT RETURN WITHOUT A REAL PAYMENT FLOW BEHIND IT. That means: no
// password for a third-party marketplace is ever collected (use the
// marketplace's own OAuth or send the buyer to its checkout); card details
// go only to a PCI-compliant processor's hosted field, never to our DOM or
// our server; and "Order confirmed" appears only after the marketplace or
// processor says so, carrying ITS order id. `checkout.test`-style asserts in
// nofabricated.test.js fail if any of this reappears in the served page.
// ══════════════════════════════════════════════════════════════

'use strict';

// The CSS the page carried for it (was in cardhunt_preview.html <style>).
const CHECKOUT_CSS = `
.co-hdr{background:var(--w);border-bottom:1px solid var(--bd);padding:18px 24px;display:flex;align-items:center;gap:16px}
.step-bar{display:flex;align-items:center;max-width:520px;margin:28px auto 36px}
.si2{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
.si2:not(:last-child)::after{content:'';position:absolute;top:16px;left:50%;width:100%;height:2px;background:var(--bd);z-index:0}
.si2.done::after,.si2.active::after{background:var(--t)}
.sc3{width:32px;height:32px;border-radius:50%;background:var(--bd);border:2px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--mu);position:relative;z-index:1;transition:all .2s}
.si2.done .sc3{background:var(--t);border-color:var(--t);color:#fff}.si2.active .sc3{background:#fff;border-color:var(--t);color:var(--t);box-shadow:0 0 0 4px rgba(0,184,160,.15)}
.slbl{font-size:11px;font-weight:500;color:var(--mu);margin-top:6px;text-align:center}.si2.active .slbl{color:var(--t);font-weight:700}.si2.done .slbl{color:var(--td)}
.co-body{max-width:560px;margin:0 auto;padding:0 24px 60px}
.co-card{background:var(--w);border:1px solid var(--bd);border-radius:var(--r);padding:28px;margin-bottom:20px;box-shadow:var(--sh)}
.co-card h3{font-size:17px;font-weight:700;margin-bottom:20px;letter-spacing:-.3px}
.ff{margin-bottom:16px}.ff label{display:block;font-size:11px;font-weight:700;color:var(--mu);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.ff input,.ff select{width:100%;padding:11px 14px;border:1.5px solid var(--bd);border-radius:10px;font-size:14px;color:var(--tx);outline:none;transition:all .2s;background:var(--w)}
.ff input:focus,.ff select:focus{border-color:var(--t);box-shadow:0 0 0 3px var(--accent-soft)}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.osum{background:var(--bg);border:1px solid var(--bd);border-radius:var(--rs);padding:18px 20px;margin-top:8px}
.orow{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--bd)}.orow:last-child{border-bottom:none;font-weight:700;font-size:15px;margin-top:6px;padding-top:12px}
.pay-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.pm{padding:14px;border:2px solid var(--bd);border-radius:var(--rs);cursor:pointer;text-align:center;transition:all .15s}.pm:hover,.pm.on{border-color:var(--t);background:var(--tl)}
.pm-i{font-size:24px;margin-bottom:4px}.pm-n{font-size:12px;font-weight:600;color:var(--mu)}
.cni{letter-spacing:3px;font-size:18px;font-weight:600}
.suc{text-align:center;padding:48px 20px}
.suc-i{width:80px;height:80px;background:linear-gradient(135deg,var(--t),var(--td));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 24px;box-shadow:0 8px 24px rgba(0,184,160,.3)}
.suc h2{font-size:26px;font-weight:800;letter-spacing:-.5px;margin-bottom:8px}.suc p{font-size:14px;color:var(--mu);max-width:340px;margin:0 auto 28px;line-height:1.6}
`;

// The functions, verbatim. They expect the page's S, SS() and a #screen-
// checkout holding #co-steps and #co-body - markup that had already gone
// missing from the page before this was moved (preserve.test.js KNOWN).
// CHECKOUT
function startCheckout(card,price,source){
  S.coStep=1;S.coListing={card,price,source};SS('checkout');renderCoStep(1);
}
const CO_STEPS=['Delivery','Account','Payment','Confirm'];
function renderCoStep(step){
  S.coStep=step;const {card,price,source}=S.coListing||{};
  document.getElementById('co-steps').innerHTML=CO_STEPS.map((s,i)=>{
    const cls=i+1<step?'done':i+1===step?'active':'';
    return`<div class="si2 ${cls}"><div class="sc3">${i+1<step?'✓':i+1}</div><div class="slbl">${s}</div></div>`;
  }).join('');
  const sum=`<div class="osum"><div style="font-size:13px;font-weight:700;margin-bottom:12px">Order summary</div>
    <div class="orow"><span>${card?.name||'Card'} — ${S.activeGrade}</span><span>$${(+price||0).toFixed(2)}</span></div>
    <div class="orow"><span style="color:var(--mu)">Shipping</span><span style="color:var(--mu)">$4.99</span></div>
    <div class="orow"><span style="color:var(--mu)">Protection</span><span style="color:var(--mu)">$0.89</span></div>
    <div class="orow"><span>Total</span><span style="color:var(--t);font-weight:700">$${((+price||0)+5.88).toFixed(2)}</span></div>
  </div>`;
  let body='';
  if(step===1){body=`<div class="co-card"><h3>📦 Delivery details</h3>
    <div class="frow"><div class="ff"><label>First name</label><input value="Alex"></div><div class="ff"><label>Last name</label><input value="Cohen"></div></div>
    <div class="ff"><label>Street address</label><input value="123 Dizengoff St"></div>
    <div class="frow"><div class="ff"><label>City</label><input value="Tel Aviv"></div><div class="ff"><label>Country</label><select><option>Israel</option><option>United States</option><option>Japan</option><option>United Kingdom</option></select></div></div>
    <div class="frow"><div class="ff"><label>Phone</label><input type="tel" value="+972 50 123 4567"></div><div class="ff"><label>Email</label><input type="email" value="collector@example.com"></div></div>
    ${sum}</div>
    <button class="btn p" style="width:100%;padding:14px;font-size:15px;justify-content:center" onclick="renderCoStep(2)">Continue to account →</button>`;}
  else if(step===2){body=`<div class="co-card"><h3>👤 ${source?.toLowerCase().includes('ebay')?'eBay':'Store'} account</h3>
    <div style="font-size:13px;color:var(--mu);margin-bottom:20px;line-height:1.6">Sign in to complete your purchase. Your order will be placed directly through ${source} with full buyer protection.</div>
    <div class="ff"><label>Email / Username</label><input value="collector@example.com"></div>
    <div class="ff"><label>Password</label><input type="password" value="password"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px;color:var(--mu)"><input type="checkbox" checked style="accent-color:var(--t)"> Remember this account</div>
    ${sum}</div>
    <div style="display:flex;gap:12px"><button class="btn" style="padding:14px 24px;font-size:15px" onclick="renderCoStep(1)">← Back</button>
    <button class="btn p" style="flex:1;padding:14px;font-size:15px;justify-content:center" onclick="renderCoStep(3)">Continue to payment →</button></div>`;}
  else if(step===3){body=`<div class="co-card"><h3>💳 Payment</h3>
    <div class="pay-methods"><div class="pm on" onclick="selPM(this)"><div class="pm-i">💳</div><div class="pm-n">Card</div></div><div class="pm" onclick="selPM(this)"><div class="pm-i">🍎</div><div class="pm-n">Apple Pay</div></div><div class="pm" onclick="selPM(this)"><div class="pm-i">🅿️</div><div class="pm-n">PayPal</div></div></div>
    <div class="ff"><label>Card number</label><input class="cni" placeholder="1234  5678  9012  3456" value="4532 1234 5678 9012" maxlength="19"></div>
    <div class="frow"><div class="ff"><label>Expiry</label><input placeholder="MM/YY" value="08/27" maxlength="5"></div><div class="ff"><label>CVV</label><input placeholder="•••" value="123" type="password" maxlength="4"></div></div>
    <div class="ff"><label>Name on card</label><input value="Alex Cohen"></div>${sum}</div>
    <div style="display:flex;gap:12px"><button class="btn" style="padding:14px 24px;font-size:15px" onclick="renderCoStep(2)">← Back</button>
    <button class="btn p" style="flex:1;padding:14px;font-size:15px;justify-content:center" onclick="renderCoStep(4)">Review order →</button></div>`;}
  else if(step===4){body=`<div class="co-card"><h3>✅ Review & confirm</h3>
    <div style="display:flex;align-items:center;gap:16px;padding:20px;background:var(--bg);border-radius:12px;margin-bottom:20px">
      <img src="${card?.images?.large||card?.images?.small||''}" style="width:80px;object-fit:contain;border-radius:8px;box-shadow:var(--sh2)" onerror="this.style.display='none'">
      <div><div style="font-size:16px;font-weight:700">${card?.name||'Card'}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">${card?.set?.name||''} · ${S.activeGrade}</div><div style="font-size:20px;font-weight:800;color:var(--t);margin-top:6px">$${((+price||0)+5.88).toFixed(2)}</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--mu)">
      <div style="display:flex;justify-content:space-between"><span>📦 Ship to</span><span style="color:var(--tx);font-weight:500">123 Dizengoff St, Tel Aviv, Israel</span></div>
      <div style="display:flex;justify-content:space-between"><span>🏪 Seller</span><span style="color:var(--tx);font-weight:500">${source}</span></div>
      <div style="display:flex;justify-content:space-between"><span>💳 Payment</span><span style="color:var(--tx);font-weight:500">•••• •••• •••• 9012</span></div>
      <div style="display:flex;justify-content:space-between"><span>📬 Estimated delivery</span><span style="color:var(--tx);font-weight:500">3–7 business days</span></div>
    </div>
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;margin-top:16px;font-size:12px;color:#92400E;line-height:1.6">⚡ You will be redirected to <strong>${source}</strong> to complete final payment. CardHunt does not process payments directly.</div>
    </div>
    <div style="display:flex;gap:12px"><button class="btn" style="padding:14px 24px;font-size:15px" onclick="renderCoStep(3)">← Back</button>
    <button class="btn p" style="flex:1;padding:14px;font-size:16px;font-weight:700;justify-content:center" onclick="renderCoStep(5)">🔒 Place order — $${((+price||0)+5.88).toFixed(2)} →</button></div>`;}
  else if(step===5){body=`<div class="suc"><div class="suc-i">✅</div><h2>Order confirmed!</h2>
    <p>Your order for <strong>${card?.name||'your card'}</strong> (${S.activeGrade}) has been placed. You'll receive a confirmation email and can track shipping from your account.</p>
    <div style="background:var(--w);border:1px solid var(--bd);border-radius:var(--r);padding:20px;margin-bottom:24px;text-align:left;font-size:13px">
      <div style="font-weight:700;margin-bottom:12px">Order #CH-${Math.floor(Math.random()*900000+100000)}</div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bd)"><span style="color:var(--mu)">Card</span><span>${card?.name||'—'} · ${S.activeGrade}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bd)"><span style="color:var(--mu)">Total paid</span><span style="color:var(--t);font-weight:700">$${((+price||0)+5.88).toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--mu)">Estimated arrival</span><span>3–7 business days</span></div>
    </div>
    <button class="btn p" style="padding:14px 32px;font-size:15px;margin:0 auto;display:flex" onclick="SS('home')">← Back to CardHunt</button></div>`;}
  document.getElementById('co-body').innerHTML=body;window.scrollTo(0,0);
}
function selPM(el){document.querySelectorAll('.pm').forEach(m=>m.classList.remove('on'));el.classList.add('on');}
