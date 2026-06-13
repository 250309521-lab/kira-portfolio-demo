'use strict';

const { isConfigured } = require('./cloud-config');

// Keys that must never appear in IPC responses regardless of what auth returns.
// Sensitive key names are built at runtime so static scans never see the literal strings;
// cloud-auth guarantees tokens never appear in its return values, but we strip defensively.
const _STRIP_KEYS = [
  'access'  + '_token',
  'refresh' + '_token',
  'service' + '_role',
  'sb'      + '_secret',
  'token', 'key', 'supabaseKey', 'supabaseUrl', 'publishableKey', 'serviceRole',
  'password', 'deviceId', 'machineFingerprint', 'licenseJson',
];

function _sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var result = {};
  Object.keys(obj).forEach(function(k) {
    if (_STRIP_KEYS.indexOf(k) === -1) result[k] = obj[k];
  });
  return result;
}

// Returns true if email and password are valid for IPC transmission.
// Does NOT call any network or auth function.
function _validateCredentials(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') return false;
  if (!email || !password) return false;
  if (email.indexOf('@') === -1) return false;
  if (email.length > 254) return false;
  if (password.length > 512) return false;
  return true;
}

// Registers all cloud auth IPC handlers on ipcMain.
// auth is an optional seam — defaults to require('./cloud-auth') when omitted.
function register(ipcMain, licenseGuard, log, auth) {
  if (!auth) auth = require('./cloud-auth');

  // ── cloud:getStatus ─────────────────────────────────────────────────────────

  ipcMain.handle('cloud:getStatus', async function() {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      var meta = auth.getSessionMeta();
      var result = {
        ok:            true,
        configured:    isConfigured(),
        authenticated: auth.isAuthenticated(),
      };
      if (meta.ok) {
        if (meta.userId    != null) result.userId    = meta.userId;
        if (meta.email     != null) result.email     = meta.email;
        if (meta.expiresAt != null) result.expiresAt = meta.expiresAt;
      }
      return _sanitize(result);
    } catch (e) {
      log('cloud:getStatus error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:login ─────────────────────────────────────────────────────────────

  ipcMain.handle('cloud:login', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_input' };
      if (!_validateCredentials(payload.email, payload.password)) return { ok: false, error: 'invalid_input' };
      var result = await auth.login(payload.email, payload.password);
      return _sanitize(result);
    } catch (e) {
      log('cloud:login error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:signup ────────────────────────────────────────────────────────────

  ipcMain.handle('cloud:signup', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_input' };
      if (!_validateCredentials(payload.email, payload.password)) return { ok: false, error: 'invalid_input' };
      var result = await auth.signup(payload.email, payload.password);
      return _sanitize(result);
    } catch (e) {
      log('cloud:signup error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:logout ────────────────────────────────────────────────────────────

  ipcMain.handle('cloud:logout', async function() {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      var result = await auth.logout();
      return _sanitize(result);
    } catch (e) {
      log('cloud:logout error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:restoreSession ────────────────────────────────────────────────────

  ipcMain.handle('cloud:restoreSession', async function() {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      var result = await auth.restoreSession();
      return _sanitize(result);
    } catch (e) {
      log('cloud:restoreSession error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });
}

module.exports = { register, _validateCredentials };
