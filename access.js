// ══════════════════════════════════════════════════════════════
// access.js — THE gate for user data and writes (T6 step 2, 2026-10-06)
//
// One helper resolves a request to { userId, email, role } from the
// verified token (auth.verify) and the role (roles.roleFor). Every route
// that writes, or reads anything user-specific, names one of the two
// middlewares below IN ITS app.METHOD(...) LINE — access.test.js reads the
// route table from server.js and fails on a route that is neither gated
// nor listed as public with a reason.
//
// Three refusals, distinct so the page can react:
//   401  no valid token                         { error: 'sign-in required' }
//   403  signed in, not approved (pending or    { error: 'approval pending',
//        rejected) — the closed door              state: 'pending' | 'rejected' }
//   403  approved, but the action needs a       { error: 'masters only' }
//        master
//   503  the approval state could not be read — closed, never assumed
//
// Nothing the page sends decides any of this: not a user id in the URL or
// body, not a role field. The user id a route uses is req.account.userId.
// ══════════════════════════════════════════════════════════════
'use strict';
const auth = require('./auth');
const roles = require('./roles');
const pricegate = require('./pricegate');
const toolingKey = require('./toolingkey');

async function resolve(req) {
  const token = auth.bearer(req);
  if (!token) return { ok: false, status: 401, body: { error: 'sign-in required', reason: 'no token' } };
  const v = await auth.verify(token);
  if (!v.ok) return { ok: false, status: 401, body: { error: 'sign-in required', reason: v.reason } };
  let r;
  try { r = await roles.roleFor(v.user); }
  catch (e) { return { ok: false, status: 503, body: { error: 'approval state unavailable', reason: e.message } }; }
  return { ok: true, account: { userId: v.user.id, email: v.user.email, role: r.role } };
}

const isApproved = role => role === 'master' || role === 'approved';

function refusalFor(account, need) {
  if (!isApproved(account.role)) {
    return { status: 403, body: { error: 'approval pending', state: account.role,
      message: account.role === 'rejected' ? 'This account was not approved.'
                                           : 'This account is awaiting approval.' } };
  }
  if (need === 'master' && account.role !== 'master')
    return { status: 403, body: { error: 'masters only', state: 'approved' } };
  return null;
}

function gate(need) {
  return async function (req, res, next) {
    res.set('Cache-Control', 'no-store');
    const r = await resolve(req);
    if (!r.ok) return res.status(r.status).json(r.body);
    const no = refusalFor(r.account, need);
    if (no) return res.status(no.status).json(no.body);
    req.account = r.account;
    next();
  };
}

// Prices and listings (door task T1, 2026-10-07): an approved account, as
// gate('approved') — or the tooling key (toolingkey.js, the shared secret
// on Render), so the audit scripts that read /api/listings keep working
// without a person's token. The key never stands in for a USER:
// req.account.userId stays undefined, and the routes that act on a user
// (alerts, portfolio) are on gate('approved'), which does not accept it.
const approvedGate = gate('approved');
function priced(req, res, next) {
  if (req.get(toolingKey.HEADER) && toolingKey.check(req).ok) {
    res.set('Cache-Control', 'no-store');
    req.account = { tooling: true, role: 'tooling' };
    return next();
  }
  return approvedGate(req, res, next);
}

// The catalogue routes (door task T1, 2026-10-07): public, never a refusal.
// An approved or master token gets the full body. Anyone else — no token,
// a bad token, pending, rejected, or a state that cannot be read — gets the
// body through pricegate.strip(): no price, listing or link leaves the
// server. Never cached by anything between us and the caller, because the
// same URL answers differently by who asks.
async function optional(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  let account = null;
  if (req.get(toolingKey.HEADER) && toolingKey.check(req).ok) account = { tooling: true, role: 'tooling' };
  else if (auth.bearer(req)) {
    const r = await resolve(req);
    if (r.ok) account = r.account;
  }
  req.account = account;
  req.seesPrices = !!account && (account.tooling || isApproved(account.role));
  if (!req.seesPrices) {
    const json = res.json.bind(res);
    res.json = body => {
      const out = pricegate.strip(body);
      if (out && typeof out === 'object' && !Array.isArray(out)) out.pricesWithheld = pricegate.WITHHELD;
      return json(out);
    };
  }
  next();
}

module.exports = { resolve, refusalFor, isApproved, optional, priced,
                   approved: gate('approved'), master: gate('master') };
