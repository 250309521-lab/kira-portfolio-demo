'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const store = require('../cloud/cloud-session-store');

// Mock safeStorage — AES-256-CBC with a single key/IV per test-file load.
// encryptString and decryptString are strict inverses within the same run.
const MOCK_KEY = crypto.randomBytes(32);
const MOCK_IV  = crypto.randomBytes(16);

function makeMockStorage(available) {
  return {
    isEncryptionAvailable: function() { return available !== false; },
    encryptString: function(str) {
      var c = crypto.createCipheriv('aes-256-cbc', MOCK_KEY, MOCK_IV);
      return Buffer.concat([c.update(Buffer.from(str, 'utf8')), c.final()]);
    },
    decryptString: function(buf) {
      var d = crypto.createDecipheriv('aes-256-cbc', MOCK_KEY, MOCK_IV);
      return Buffer.concat([d.update(buf), d.final()]).toString('utf8');
    },
  };
}

// Storage whose decryptString always throws — simulates corrupt ciphertext.
function makeThrowingStorage() {
  return {
    isEncryptionAvailable: function() { return true; },
    encryptString: function() { return Buffer.alloc(0); },
    decryptString: function() { throw new Error('decrypt error'); },
  };
}

// Storage whose decryptString always returns a fixed value — tests post-decrypt validation.
function makeForcedDecryptStorage(value) {
  return {
    isEncryptionAvailable: function() { return true; },
    encryptString: function() { return Buffer.alloc(0); },
    decryptString: function() { return value; },
  };
}

function makeTempPaths() {
  var suffix = Date.now() + '_' + Math.random().toString(36).slice(2);
  return {
    authPath:   path.join(os.tmpdir(), 'ktp_test_auth_'   + suffix + '.enc'),
    devicePath: path.join(os.tmpdir(), 'ktp_test_device_' + suffix + '.enc'),
  };
}

function register(test, assert, assertEqual) {
  var mock = makeMockStorage();

  // ── Refresh token ────────────────────────────────────────────────────────────

  test('cloud-session-store: save + load refresh token roundtrip', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var ok = store.saveRefreshToken('my-refresh-token', mock);
    assert(ok === true, 'saveRefreshToken must return true on success');
    var loaded = store.loadRefreshToken(mock);
    assertEqual(loaded, 'my-refresh-token', 'loaded token must equal saved token');
    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });

  test('cloud-session-store: saveRefreshToken returns true on success', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var result = store.saveRefreshToken('any-token', mock);
    assert(result === true, 'must return true');
    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });

  test('cloud-session-store: saveRefreshToken returns false when encryption unavailable', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var result = store.saveRefreshToken('any-token', makeMockStorage(false));
    assert(result === false, 'must return false when encryption unavailable');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: encryption unavailable writes no file', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    store.saveRefreshToken('any-token', makeMockStorage(false));
    assert(!fs.existsSync(tmp.authPath), 'no file must be written when encryption unavailable');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: no plaintext token in encrypted file', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var secretToken = 'super-secret-refresh-token-12345';
    store.saveRefreshToken(secretToken, mock);
    var raw = fs.readFileSync(tmp.authPath).toString('latin1');
    assert(!raw.includes(secretToken), 'plaintext token must not appear in file bytes');
    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });

  test('cloud-session-store: loadRefreshToken returns null when file missing', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var result = store.loadRefreshToken(mock);
    assert(result === null, 'must return null when file does not exist');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: loadRefreshToken returns null when encryption unavailable', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    store.saveRefreshToken('any-token', mock);
    var result = store.loadRefreshToken(makeMockStorage(false));
    assert(result === null, 'must return null when encryption unavailable even with file present');
    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });

  test('cloud-session-store: corrupt refresh token file returns null and deletes file', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    fs.writeFileSync(tmp.authPath, Buffer.from('not-valid-ciphertext-garbage'));
    var result = store.loadRefreshToken(makeThrowingStorage());
    assert(result === null, 'must return null for corrupt file');
    assert(!fs.existsSync(tmp.authPath), 'corrupt file must be deleted');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: deleteRefreshToken removes file', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    store.saveRefreshToken('tok', mock);
    assert(fs.existsSync(tmp.authPath), 'file must exist before delete');
    store.deleteRefreshToken();
    assert(!fs.existsSync(tmp.authPath), 'file must be absent after deleteRefreshToken');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: deleteRefreshToken is idempotent when file missing', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    store.deleteRefreshToken();
    store.deleteRefreshToken();
    assert(!fs.existsSync(tmp.authPath), 'repeated delete must not throw and file stays absent');
    store._setTestPaths(null, null);
  });

  // ── Device ID ─────────────────────────────────────────────────────────────────

  test('cloud-session-store: save + load deviceId roundtrip', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var uuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    var ok = store.saveDeviceId(uuid, mock);
    assert(ok === true, 'saveDeviceId must return true');
    var loaded = store.loadDeviceId(mock);
    assertEqual(loaded, uuid, 'loaded deviceId must equal saved UUID');
    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.devicePath); } catch (_) {}
  });

  test('cloud-session-store: saveDeviceId rejects non-UUID string', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var result = store.saveDeviceId('not-a-valid-uuid', mock);
    assert(result === false, 'must return false for non-UUID input');
    assert(!fs.existsSync(tmp.devicePath), 'no file must be written for rejected input');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: saveDeviceId rejects empty string', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var result = store.saveDeviceId('', mock);
    assert(result === false, 'must return false for empty string');
    assert(!fs.existsSync(tmp.devicePath), 'no file must be written for empty string');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: invalid decrypted deviceId returns null and deletes file', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    store.saveDeviceId('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', mock);
    var result = store.loadDeviceId(makeForcedDecryptStorage('not-a-uuid'));
    assert(result === null, 'must return null when decrypted value is not a UUID');
    assert(!fs.existsSync(tmp.devicePath), 'file must be deleted when decrypted value fails UUID check');
    store._setTestPaths(null, null);
  });

  test('cloud-session-store: clearAll removes both auth and device files', function() {
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    store.saveRefreshToken('tok', mock);
    store.saveDeviceId('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', mock);
    assert(fs.existsSync(tmp.authPath),   'auth file must exist before clearAll');
    assert(fs.existsSync(tmp.devicePath), 'device file must exist before clearAll');
    store.clearAll();
    assert(!fs.existsSync(tmp.authPath),   'auth file must be absent after clearAll');
    assert(!fs.existsSync(tmp.devicePath), 'device file must be absent after clearAll');
    store._setTestPaths(null, null);
  });
}

module.exports = { register };
