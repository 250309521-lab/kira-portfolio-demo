'use strict';

const { getSupabaseUrl, getSupabaseAnonKey, isConfigured } = require('./cloud-config');
const _defaultStore = require('./cloud-session-store');

// ── In-memory session state ───────────────────────────────────────────────────
let _accessToken          = null;
let _accessTokenExpiresAt = 0;    // Unix ms; 0 = unset
let _userId               = null;
let _userEmail            = null;
let _refreshPromise       = null; // in-flight refresh guard
let _restoring            = false; // restoreSession re-entrancy guard
let _lastError            = null;

// ── Test seams ────────────────────────────────────────────────────────────────
let _fetchImpl = null;
let _nowImpl   = null;
let _storeImpl = null;

function _setFetch(fn)  { _fetchImpl = fn  || null; }
function _setNow(fn)    { _nowImpl   = fn  || null; }
function _setStore(s)   { _storeImpl = s   || null; }

function _resetForTests() {
  _accessToken          = null;
  _accessTokenExpiresAt = 0;
  _userId               = null;
  _userEmail            = null;
  _refreshPromise       = null;
  _restoring            = false;
  _lastError            = null;
  _fetchImpl            = null;
  _nowImpl              = null;
  _storeImpl            = null;
}

function _doFetch(url, opts) { return (_fetchImpl || global.fetch)(url, opts); }
function _now()              { return _nowImpl ? _nowImpl() : Date.now(); }
function _store()            { return _storeImpl || _defaultStore; }

// ── Internal helpers ──────────────────────────────────────────────────────────

function _parseError(status, body) {
  if (!body) return 'unknown_error';
  var code = String(body.error || body.error_code || '').toLowerCase();
  var desc = String(body.error_description || body.msg || body.message || '').toLowerCase();
  if (code === 'email_not_confirmed' || desc.includes('email not confirmed')) return 'email_not_confirmed';
  if (code === 'invalid_grant' || status === 400 || status === 401 || status === 422) return 'auth_failed';
  return 'unknown_error';
}

function _storeSession(data) {
  if (!data || !data.access_token) return { hasToken: false };
  _accessToken          = data.access_token;
  _accessTokenExpiresAt = data.expires_at
    ? data.expires_at * 1000
    : _now() + (data.expires_in || 3600) * 1000;
  _userId   = (data.user && data.user.id)    || null;
  _userEmail = (data.user && data.user.email) || null;
  var sessionPersisted = false;
  try { sessionPersisted = _store().saveRefreshToken(data.refresh_token) === true; } catch (_) {}
  return { hasToken: true, sessionPersisted };
}

function _clearSession() {
  _accessToken          = null;
  _accessTokenExpiresAt = 0;
  _userId               = null;
  _userEmail            = null;
  _refreshPromise       = null;
  _lastError            = null;
  try { _store().deleteRefreshToken(); } catch (_) {}
}

function _safeMeta(extra) {
  return Object.assign({ ok: true, userId: _userId, email: _userEmail, expiresAt: _accessTokenExpiresAt }, extra || {});
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(email, password) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/auth/v1/token?grant_type=password', {
      method:  'POST',
      headers: { 'apikey': getSupabaseAnonKey(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    body = await res.json();
  } catch (_) {
    _lastError = 'offline';
    return { ok: false, error: 'offline' };
  }
  if (!res.ok) {
    _lastError = _parseError(res.status, body);
    return { ok: false, error: _lastError };
  }
  var stored = _storeSession(body);
  if (!stored.hasToken) { _lastError = 'auth_failed'; return { ok: false, error: 'auth_failed' }; }
  return _safeMeta({ sessionPersisted: stored.sessionPersisted });
}

// ── Signup ────────────────────────────────────────────────────────────────────

async function signup(email, password) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/auth/v1/signup', {
      method:  'POST',
      headers: { 'apikey': getSupabaseAnonKey(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    body = await res.json();
  } catch (_) {
    _lastError = 'offline';
    return { ok: false, error: 'offline' };
  }
  if (!res.ok) {
    _lastError = _parseError(res.status, body);
    return { ok: false, error: _lastError };
  }
  // Supabase returns 200 with user but no access_token when email confirmation is required
  if (!body.access_token) return { ok: false, error: 'email_not_confirmed' };
  var stored = _storeSession(body);
  if (!stored.hasToken) return { ok: false, error: 'email_not_confirmed' };
  return _safeMeta({ sessionPersisted: stored.sessionPersisted });
}

// ── Refresh (internal) ────────────────────────────────────────────────────────

async function _doRefresh(refreshToken) {
  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/auth/v1/token?grant_type=refresh_token', {
      method:  'POST',
      headers: { 'apikey': getSupabaseAnonKey(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });
    body = await res.json();
  } catch (_) {
    _clearSession();
    return { ok: false, error: 'offline' };
  }
  if (!res.ok) { _clearSession(); return { ok: false, error: 'session_expired' }; }
  var stored = _storeSession(body);
  if (!stored.hasToken) { _clearSession(); return { ok: false, error: 'session_expired' }; }
  return _safeMeta({ sessionPersisted: stored.sessionPersisted });
}

// ── refreshSession ────────────────────────────────────────────────────────────

async function refreshSession() {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  // Return the in-flight promise to prevent concurrent refresh races
  if (_refreshPromise) return _refreshPromise;
  var refreshToken;
  try { refreshToken = _store().loadRefreshToken(); } catch (_) { refreshToken = null; }
  if (!refreshToken) { _clearSession(); return { ok: false, error: 'session_expired' }; }
  _refreshPromise = _doRefresh(refreshToken);
  try   { return await _refreshPromise; }
  finally { _refreshPromise = null; }
}

// ── restoreSession ────────────────────────────────────────────────────────────

async function restoreSession() {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (_restoring) return { ok: false, error: 'session_expired' };
  _restoring = true;
  try   { return await refreshSession(); }
  finally { _restoring = false; }
}

// ── logout ────────────────────────────────────────────────────────────────────

async function logout() {
  var token = _accessToken;
  if (token && isConfigured()) {
    try {
      await _doFetch(getSupabaseUrl() + '/auth/v1/logout', {
        method:  'POST',
        headers: {
          'apikey':         getSupabaseAnonKey(),
          'Content-Type':   'application/json',
          'Authorization':  'Bearer ' + token,
        },
        body: JSON.stringify({}),
      });
    } catch (_) {
      // Network failure — still clear locally
    }
  }
  _clearSession();
  return { ok: true };
}

// ── getAccessToken ────────────────────────────────────────────────────────────

async function getAccessToken() {
  if (!isConfigured()) return null;
  // Fast path: valid token not near expiry
  if (_accessToken && (_accessTokenExpiresAt - _now()) > 60000) return _accessToken;
  // No token in memory — check whether a stored refresh token exists before attempting refresh
  if (!_accessToken) {
    var hasStored = false;
    try { hasStored = _store().loadRefreshToken() !== null; } catch (_) {}
    if (!hasStored) return null;
  }
  // Expiring token or refresh token exists — try refresh
  var result = await refreshSession();
  return result.ok ? _accessToken : null;
}

// ── Public read-only state ────────────────────────────────────────────────────

function getSessionMeta() {
  if (!_accessToken) return { ok: false };
  return { ok: true, userId: _userId, email: _userEmail, expiresAt: _accessTokenExpiresAt };
}

function isAuthenticated() {
  return _accessToken !== null;
}

// Clears memory only — does not touch storage. Use logout() for full sign-out.
function clearMemorySession() {
  _accessToken          = null;
  _accessTokenExpiresAt = 0;
  _userId               = null;
  _userEmail            = null;
  _refreshPromise       = null;
  _lastError            = null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  login,
  signup,
  logout,
  restoreSession,
  refreshSession,
  getAccessToken,
  getSessionMeta,
  isAuthenticated,
  clearMemorySession,
  // Test seams — not for use in production code
  _setFetch,
  _setNow,
  _setStore,
  _resetForTests,
};
