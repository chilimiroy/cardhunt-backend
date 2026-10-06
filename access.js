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

module.exports = { resolve, refusalFor, isApproved,
                   approved: gate('approved'), master: gate('master') };
