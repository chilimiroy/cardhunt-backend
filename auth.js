// ══════════════════════════════════════════════════════════════
// auth.js — who is signed in, decided by the SERVER (T6 step 1, 2026-10-06)
//
// Sign-in happens at Supabase Auth (Google, or an emailed one-time link).
// The page holds the session Supabase gave it and sends the access token
// as "Authorization: Bearer <jwt>". Nothing here trusts the page: the token
// is verified against the project's signing key, its issuer, audience and
// expiry, and only then is a user returned.
//
// The key, measured 2026-10-06: this project signs user tokens with ES256
// (an asymmetric key published at <SUPABASE_URL>/auth/v1/.well-known/
// jwks.json). SUPABASE_JWT_SECRET is the LEGACY HS256 secret — it verifies
// only tokens signed before the switch, so a server that checked the secret
// alone would refuse every real sign-in. Both are accepted, each for its
// own algorithm; "none" and anything else is refused.
//
// Credentials are read at call time (the "read credentials at call time"
// lesson): a value set on Render after boot is honoured.
//
// Emails and password hashes never enter our tables — they live in
// Supabase Auth's own `auth` schema (decided 2026-10-06). This returns the
// user id (the token's `sub`) and the email the token carries, nothing more.
// ══════════════════════════════════════════════════════════════
'use strict';
const crypto = require('crypto');

const JWKS_TTL_MS = 10 * 60 * 1000;
let _jwks = { at: 0, url: null, keys: [] };
let _fetch = (...a) => fetch(...a);

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '');
  const secret = String(process.env.SUPABASE_JWT_SECRET || '');
  const missing = [!url && 'SUPABASE_URL', !anonKey && 'SUPABASE_ANON_KEY'].filter(Boolean);
  return { url, anonKey, secret, enabled: missing.length === 0, missing };
}

// What the page needs to start a sign-in. The anon (publishable) key is
// public by design — it is shipped to every browser of a Supabase app. The
// JWT secret is NEVER returned.
function publicConfig() {
  const c = config();
  return c.enabled ? { enabled: true, url: c.url, anonKey: c.anonKey }
                   : { enabled: false, reason: 'sign-in not configured: ' + c.missing.join(', ') + ' not set' };
}

const b64urlJson = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function jwksKeys(url, force) {
  const jwksUrl = url + '/auth/v1/.well-known/jwks.json';
  if (!force && _jwks.url === jwksUrl && Date.now() - _jwks.at < JWKS_TTL_MS) return _jwks.keys;
  const r = await _fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('signing keys unavailable: HTTP ' + r.status);
  const j = await r.json();
  _jwks = { at: Date.now(), url: jwksUrl, keys: Array.isArray(j.keys) ? j.keys : [] };
  return _jwks.keys;
}

// verify(token) -> { ok: true, user: { id, email, provider } }
//               |  { ok: false, reason }   (a reason is always given)
async function verify(token, opts) {
  opts = opts || {};
  const c = config();
  if (!c.enabled) return { ok: false, reason: 'sign-in not configured' };
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'not a token' };
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch (e) { return { ok: false, reason: 'token unreadable' }; }
  const signed = Buffer.from(parts[0] + '.' + parts[1]), sig = Buffer.from(parts[2], 'base64url');

  let good = false;
  if (header.alg === 'ES256') {
    let keys;
    try { keys = await jwksKeys(c.url); } catch (e) { return { ok: false, reason: e.message }; }
    let jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) {   // a key rotated in since the cache was filled: ask once more
      try { keys = await jwksKeys(c.url, true); } catch (e) { return { ok: false, reason: e.message }; }
      jwk = keys.find(k => k.kid === header.kid);
    }
    if (!jwk || jwk.kty !== 'EC') return { ok: false, reason: 'unknown signing key' };
    try {
      const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      good = crypto.verify('sha256', signed, { key, dsaEncoding: 'ieee-p1363' }, sig);
    } catch (e) { return { ok: false, reason: 'signing key unusable' }; }
  } else if (header.alg === 'HS256') {
    if (!c.secret) return { ok: false, reason: 'legacy token and no SUPABASE_JWT_SECRET' };
    const want = crypto.createHmac('sha256', c.secret).update(signed).digest();
    good = want.length === sig.length && crypto.timingSafeEqual(want, sig);
  } else {
    return { ok: false, reason: 'algorithm not accepted: ' + header.alg };
  }
  if (!good) return { ok: false, reason: 'signature does not verify' };

  const now = Math.floor((opts.now || Date.now()) / 1000);
  if (!(payload.exp > now)) return { ok: false, reason: 'expired' };
  if (payload.iss !== c.url + '/auth/v1') return { ok: false, reason: 'issued by another project' };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes('authenticated')) return { ok: false, reason: 'not a signed-in user token' };
  if (!payload.sub) return { ok: false, reason: 'no user id' };
  return { ok: true, user: { id: payload.sub, email: payload.email || null,
                             provider: (payload.app_metadata && payload.app_metadata.provider) || null } };
}

function bearer(req) {
  const h = String((req && req.headers && req.headers.authorization) || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

module.exports = { config, publicConfig, verify, bearer, JWKS_TTL_MS,
                   _setFetch: f => { _fetch = f; }, _reset: () => { _jwks = { at: 0, url: null, keys: [] }; } };
