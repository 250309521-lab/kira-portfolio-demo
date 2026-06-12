'use strict';

const path = require('path');
const fs   = require('fs');
const { getCloudAuthPath, getCloudDevicePath } = require('./cloud-config');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Test seam — unit tests call _setTestPaths() to avoid touching real userData.
let _testAuthPath   = null;
let _testDevicePath = null;

function _getAuthPath()   { return _testAuthPath   || getCloudAuthPath(); }
function _getDevicePath() { return _testDevicePath || getCloudDevicePath(); }

// Lazy — avoid requiring electron at module load so tests can require this file safely.
function _defaultStorage() {
  return require('electron').safeStorage;
}

function _safeUnlink(p) {
  try { fs.unlinkSync(p); } catch (_) {}
}

function _isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

function _log(level, msg) {
  // Writes to Electron app.log when running in Electron; silent in Node test environment.
  try {
    var p = path.join(require('electron').app.getPath('userData'), 'app.log');
    fs.appendFileSync(p, '[' + new Date().toISOString() + '] [' + level + '] ' + msg + '\n');
  } catch (_) {}
}

// ── Encryption availability ────────────────────────────────────────────────────

function isEncryptionAvailable(storage) {
  return (storage || _defaultStorage()).isEncryptionAvailable();
}

// ── Refresh token ──────────────────────────────────────────────────────────────

function saveRefreshToken(token, storage) {
  var s = storage || _defaultStorage();
  if (!s.isEncryptionAvailable()) {
    _log('WARN', 'cloud-session-store: safeStorage unavailable — refresh token not persisted');
    return false;
  }
  try {
    var encrypted = s.encryptString(token);
    fs.writeFileSync(_getAuthPath(), encrypted);
    return true;
  } catch (err) {
    _log('ERROR', 'cloud-session-store: saveRefreshToken failed — ' + err.message);
    return false;
  }
}

function loadRefreshToken(storage) {
  var p = _getAuthPath();
  if (!fs.existsSync(p)) return null;
  var s = storage || _defaultStorage();
  if (!s.isEncryptionAvailable()) return null;
  try {
    var buf = fs.readFileSync(p);
    return s.decryptString(buf);
  } catch (_) {
    _safeUnlink(p);
    _log('WARN', 'cloud-session-store: cloud-auth.enc corrupt — deleted');
    return null;
  }
}

function deleteRefreshToken() {
  _safeUnlink(_getAuthPath());
}

// ── Device ID ──────────────────────────────────────────────────────────────────

function saveDeviceId(uuid, storage) {
  if (!_isValidUUID(uuid)) {
    _log('WARN', 'cloud-session-store: saveDeviceId rejected non-UUID input');
    return false;
  }
  var s = storage || _defaultStorage();
  if (!s.isEncryptionAvailable()) {
    _log('WARN', 'cloud-session-store: safeStorage unavailable — deviceId not persisted');
    return false;
  }
  try {
    var encrypted = s.encryptString(uuid);
    fs.writeFileSync(_getDevicePath(), encrypted);
    return true;
  } catch (err) {
    _log('ERROR', 'cloud-session-store: saveDeviceId failed — ' + err.message);
    return false;
  }
}

function loadDeviceId(storage) {
  var p = _getDevicePath();
  if (!fs.existsSync(p)) return null;
  var s = storage || _defaultStorage();
  if (!s.isEncryptionAvailable()) return null;
  try {
    var buf = fs.readFileSync(p);
    var uuid = s.decryptString(buf);
    if (!_isValidUUID(uuid)) {
      _safeUnlink(p);
      _log('WARN', 'cloud-session-store: cloud-device.enc contained non-UUID — deleted');
      return null;
    }
    return uuid;
  } catch (_) {
    _safeUnlink(p);
    _log('WARN', 'cloud-session-store: cloud-device.enc corrupt — deleted');
    return null;
  }
}

function deleteDeviceId() {
  _safeUnlink(_getDevicePath());
}

// ── Logout helper ──────────────────────────────────────────────────────────────

function clearAll() {
  deleteRefreshToken();
  deleteDeviceId();
}

// ── Test seam ─────────────────────────────────────────────────────────────────

function _setTestPaths(authPath, devicePath) {
  _testAuthPath   = authPath   || null;
  _testDevicePath = devicePath || null;
}

module.exports = {
  isEncryptionAvailable,
  saveRefreshToken,
  loadRefreshToken,
  deleteRefreshToken,
  saveDeviceId,
  loadDeviceId,
  deleteDeviceId,
  clearAll,
  _setTestPaths,
};
