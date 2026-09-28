// ══════════════════════════════════════════════════════════════
// login-disabled.js — the page's "Login", PRESERVED and DISABLED.
//
// NOT LOADED BY ANY PAGE. NOT SERVED. Do not add a <script> tag for it.
//
// What it was: a sign-in modal (email, PASSWORD, Google, Apple, "Create one
// free") behind a "Login" button on four screens. There is no account
// system: doLogin() accepted anything - an empty password included - closed
// the modal and relabelled every Login button "Alex". The fields came
// prefilled with collector@example.com / "password". A round "A" avatar for
// the same invented Alex sat on six other screens and is gone too.
//
// Why disabled (2026-09-28, TASK T7): it collected a password and sent it
// nowhere, and it told people they were signed in when nothing had
// happened. Alerts already key on an anonymous per-browser id
// (localStorage ch_user), which is honest about what it is.
//
// MUST NOT RETURN WITHOUT A REAL AUTH BACKEND: a server that verifies the
// credential (or a hosted identity provider), a session the API honours,
// and a signed-in state that comes from that session - never from the
// button having been pressed.
// ══════════════════════════════════════════════════════════════

'use strict';

const LOGIN_CSS = `
#login-modal-overlay{display:none}
`;

const LOGIN_MARKUP = `
<!-- ══ LOGIN MODAL ══ -->
<div id="login-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(6px)">
  <div style="background:linear-gradient(145deg,#0D0D18,#141428 50%,#0A1A14);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:48px 44px;width:100%;max-width:440px;position:relative;box-shadow:0 24px 64px rgba(0,0,0,.6)">
    <button onclick="closeLoginModal()" style="position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px;justify-content:center">
      <div style="width:48px;height:48px;background:var(--t);border-radius:13px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px">⚡</div>
      <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-.5px">Card<em style="color:var(--t);font-style:normal">Hunt</em></div>
    </div>
    <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:5px;text-align:center;letter-spacing:-.4px">Welcome back</div>
    <div style="font-size:13px;color:rgba(255,255,255,.45);text-align:center;margin-bottom:28px;line-height:1.6">Sign in to track prices, set alerts and buy smarter.</div>
    <div style="margin-bottom:13px">
      <label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.4);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Email</label>
      <input id="modal-email" type="email" value="collector@example.com" placeholder="you@example.com" style="width:100%;padding:12px 15px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;font-size:14px;color:#fff;outline:none;transition:all .2s" onfocus="this.style.borderColor='var(--t)'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
    </div>
    <div style="margin-bottom:16px">
      <label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.4);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Password</label>
      <input id="modal-pass" type="password" value="password" placeholder="••••••••" style="width:100%;padding:12px 15px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;font-size:14px;color:#fff;outline:none;transition:all .2s" onfocus="this.style.borderColor='var(--t)'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;font-size:12px">
      <label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:rgba(255,255,255,.4)"><input type="checkbox" checked style="accent-color:var(--t)"> Keep me signed in</label>
      <a style="color:var(--t);cursor:pointer">Forgot password?</a>
    </div>
    <button onclick="doLogin()" style="width:100%;padding:14px;background:var(--t);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:-.2px" onmouseover="this.style.background='var(--td)';this.style.transform='translateY(-1px)'" onmouseout="this.style.background='var(--t)';this.style.transform=''">Sign in to CardHunt →</button>
    <div style="display:flex;align-items:center;gap:14px;margin:22px 0;color:rgba(255,255,255,.2);font-size:12px">
      <div style="flex:1;height:1px;background:rgba(255,255,255,.08)"></div>or continue with<div style="flex:1;height:1px;background:rgba(255,255,255,.08)"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
      <button onclick="doLogin()" style="padding:11px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px" onmouseover="this.style.background='rgba(255,255,255,.1)'" onmouseout="this.style.background='rgba(255,255,255,.06)'">🌐 Google</button>
      <button onclick="doLogin()" style="padding:11px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px" onmouseover="this.style.background='rgba(255,255,255,.1)'" onmouseout="this.style.background='rgba(255,255,255,.06)'">🍎 Apple</button>
    </div>
    <div style="text-align:center;font-size:12px;color:rgba(255,255,255,.3)">No account? <a onclick="doLogin()" style="color:var(--t);cursor:pointer">Create one free →</a></div>
  </div>
</div>

`;

// The functions and listeners, verbatim.
function openLoginModal(){
  const overlay=document.getElementById('login-modal-overlay');
  overlay.style.display='flex';
  setTimeout(()=>overlay.style.opacity='1',10);
}
function closeLoginModal(){
  document.getElementById('login-modal-overlay').style.display='none';
}
function doLogin(){
  closeLoginModal();
  // Update all nav login buttons to show logged-in state
  document.querySelectorAll('.login-nav-btn').forEach(b=>{
    b.textContent='👤 Alex';
    b.style.background='var(--tl)';
    b.style.color='var(--t)';
    b.style.borderColor='var(--t)';
  });
}

// Close on backdrop click
document.getElementById('login-modal-overlay').addEventListener('click',function(e){
  if(e.target===this) closeLoginModal();
});
// Close on Escape key
document.addEventListener('keydown',function(e){
  if(e.key==='Escape') closeLoginModal();
});
