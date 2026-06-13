'use strict';

const ipc_module = require('../cloud/cloud-ipc');

// Set env vars required by cloud-config.isConfigured() for all tests.
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockIpcMain() {
  var _handlers = {};
  return {
    handle: function(channel, fn) { _handlers[channel] = fn; },
    _invoke: function(channel, event, payload) {
      var h = _handlers[channel];
      if (!h) throw new Error('No handler registered for channel: ' + channel);
      return h(event, payload);
    },
    _hasChannel: function(channel) { return Object.prototype.hasOwnProperty.call(_handlers, channel); },
  };
}

function makeMockAuth(overrides) {
  var _calls = {};
  function _track(name, args) {
    if (!_calls[name]) _calls[name] = [];
    _calls[name].push(args);
  }
  var base = {
    login: function(e, p) {
      _track('login', [e, p]);
      return Promise.resolve({ ok: true, userId: 'uid-1', email: e, expiresAt: 9999999 });
    },
    signup: function(e, p) {
      _track('signup', [e, p]);
      return Promise.resolve({ ok: true, userId: 'uid-1', email: e, expiresAt: 9999999 });
    },
    logout: function() {
      _track('logout', []);
      return Promise.resolve({ ok: true });
    },
    restoreSession: function() {
      _track('restoreSession', []);
      return Promise.resolve({ ok: true, userId: 'uid-1', email: 'u@test.com', expiresAt: 9999999 });
    },
    isAuthenticated: function() { return false; },
    getSessionMeta:  function() { return { ok: false }; },
  };
  var auth = Object.assign({}, base, overrides || {});
  auth._calls = _calls;
  return auth;
}

function makeGuard(ok) {
  return function() {
    return Promise.resolve(ok ? { ok: true } : { ok: false, reason: 'license_required' });
  };
}

function makeLog() {
  var _lines = [];
  var fn = function(msg) { _lines.push(String(msg)); };
  fn._lines = _lines;
  return fn;
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  test('cloud-ipc: _validateCredentials accepts valid email and password', function() {
    assert(ipc_module._validateCredentials('user@example.com', 'pass1234') === true,
      'valid email and password must return true');
  });

  test('cloud-ipc: _validateCredentials rejects null inputs', function() {
    assert(ipc_module._validateCredentials(null, 'password') === false,
      'null email must return false');
    assert(ipc_module._validateCredentials('user@example.com', null) === false,
      'null password must return false');
    assert(ipc_module._validateCredentials(null, null) === false,
      'null email and password must return false');
  });

  test('cloud-ipc: _validateCredentials rejects empty email', function() {
    assert(ipc_module._validateCredentials('', 'password') === false,
      'empty email must return false');
  });

  test('cloud-ipc: _validateCredentials rejects email without @', function() {
    assert(ipc_module._validateCredentials('notanemail', 'password') === false,
      'email without @ must return false');
  });

  test('cloud-ipc: _validateCredentials rejects empty password', function() {
    assert(ipc_module._validateCredentials('user@example.com', '') === false,
      'empty password must return false');
  });

  test('cloud-ipc: _validateCredentials rejects email longer than 254 chars', function() {
    var longEmail = 'a'.repeat(244) + '@example.com'; // 256 chars
    assert(ipc_module._validateCredentials(longEmail, 'password') === false,
      'email longer than 254 chars must return false');
  });

  test('cloud-ipc: _validateCredentials rejects password longer than 512 chars', function() {
    var longPass = 'x'.repeat(513);
    assert(ipc_module._validateCredentials('user@example.com', longPass) === false,
      'password longer than 512 chars must return false');
  });

  test('cloud-ipc: register creates all five required channels', function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockAuth());
    assert(ipc._hasChannel('cloud:getStatus'),      'cloud:getStatus must be registered');
    assert(ipc._hasChannel('cloud:login'),          'cloud:login must be registered');
    assert(ipc._hasChannel('cloud:signup'),         'cloud:signup must be registered');
    assert(ipc._hasChannel('cloud:logout'),         'cloud:logout must be registered');
    assert(ipc._hasChannel('cloud:restoreSession'), 'cloud:restoreSession must be registered');
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  // ── License guard blocks ───────────────────────────────────────────────────

  await testAsync('cloud-ipc: cloud:getStatus license block returns license_required', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(false), makeLog(), makeMockAuth());
    var r = await ipc._invoke('cloud:getStatus');
    assert(r.ok === false,                     'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',   'error must be license_required');
  });

  await testAsync('cloud-ipc: cloud:login license block returns license_required and does not call auth.login', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:login', {}, { email: 'u@x.com', password: 'pass' });
    assert(r.ok === false,                     'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',   'error must be license_required');
    assert(!mockAuth._calls.login,             'auth.login must not be called when license blocked');
  });

  await testAsync('cloud-ipc: cloud:signup license block returns license_required and does not call auth.signup', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:signup', {}, { email: 'u@x.com', password: 'pass' });
    assert(r.ok === false,                     'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',   'error must be license_required');
    assert(!mockAuth._calls.signup,            'auth.signup must not be called when license blocked');
  });

  await testAsync('cloud-ipc: cloud:logout license block returns license_required and does not call auth.logout', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:logout');
    assert(r.ok === false,                     'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',   'error must be license_required');
    assert(!mockAuth._calls.logout,            'auth.logout must not be called when license blocked');
  });

  await testAsync('cloud-ipc: cloud:restoreSession license block returns license_required and does not call auth.restoreSession', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:restoreSession');
    assert(r.ok === false,                     'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',   'error must be license_required');
    assert(!mockAuth._calls.restoreSession,    'auth.restoreSession must not be called when license blocked');
  });

  // ── Input validation ───────────────────────────────────────────────────────

  await testAsync('cloud-ipc: cloud:login invalid input returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockAuth());
    var r1 = await ipc._invoke('cloud:login', {}, null);
    assertEqual(r1.error, 'invalid_input', 'null payload must return invalid_input');
    var r2 = await ipc._invoke('cloud:login', {}, { email: '', password: 'pass' });
    assertEqual(r2.error, 'invalid_input', 'empty email must return invalid_input');
    var r3 = await ipc._invoke('cloud:login', {}, { email: 'notemail', password: 'pass' });
    assertEqual(r3.error, 'invalid_input', 'email without @ must return invalid_input');
  });

  await testAsync('cloud-ipc: cloud:signup invalid input returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockAuth());
    var r1 = await ipc._invoke('cloud:signup', {}, null);
    assertEqual(r1.error, 'invalid_input', 'null payload must return invalid_input');
    var r2 = await ipc._invoke('cloud:signup', {}, { email: 'u@x.com', password: '' });
    assertEqual(r2.error, 'invalid_input', 'empty password must return invalid_input');
  });

  // ── Auth delegation ────────────────────────────────────────────────────────

  await testAsync('cloud-ipc: cloud:login valid input calls auth.login with email and password', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    await ipc._invoke('cloud:login', {}, { email: 'user@example.com', password: 'mypassword' });
    assert(mockAuth._calls.login && mockAuth._calls.login.length === 1, 'auth.login must be called once');
    assertEqual(mockAuth._calls.login[0][0], 'user@example.com', 'auth.login must receive the email');
    assertEqual(mockAuth._calls.login[0][1], 'mypassword',       'auth.login must receive the password');
  });

  await testAsync('cloud-ipc: cloud:signup valid input calls auth.signup with email and password', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    await ipc._invoke('cloud:signup', {}, { email: 'new@example.com', password: 'newpass' });
    assert(mockAuth._calls.signup && mockAuth._calls.signup.length === 1, 'auth.signup must be called once');
    assertEqual(mockAuth._calls.signup[0][0], 'new@example.com', 'auth.signup must receive the email');
    assertEqual(mockAuth._calls.signup[0][1], 'newpass',         'auth.signup must receive the password');
  });

  await testAsync('cloud-ipc: cloud:logout calls auth.logout', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    await ipc._invoke('cloud:logout');
    assert(mockAuth._calls.logout && mockAuth._calls.logout.length === 1, 'auth.logout must be called once');
  });

  await testAsync('cloud-ipc: cloud:restoreSession calls auth.restoreSession', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    await ipc._invoke('cloud:restoreSession');
    assert(mockAuth._calls.restoreSession && mockAuth._calls.restoreSession.length === 1,
      'auth.restoreSession must be called once');
  });

  // ── cloud:getStatus payload ────────────────────────────────────────────────

  await testAsync('cloud-ipc: cloud:getStatus returns configured authenticated state and session metadata', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      isAuthenticated: function() { return true; },
      getSessionMeta:  function() {
        return { ok: true, userId: 'uid-42', email: 'admin@test.com', expiresAt: 9999999 };
      },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:getStatus');
    assert(r.ok === true,                      'ok must be true');
    assert(typeof r.configured === 'boolean',  'must include configured flag');
    assert(r.authenticated === true,           'must reflect isAuthenticated()');
    assertEqual(r.userId,    'uid-42',         'must include userId from session meta');
    assertEqual(r.email,     'admin@test.com', 'must include email from session meta');
    assertEqual(r.expiresAt, 9999999,          'must include expiresAt from session meta');
  });

  // ── Sanitization ───────────────────────────────────────────────────────────

  await testAsync('cloud-ipc: IPC response strips access_token', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      login: function() {
        return Promise.resolve({ ok: true, userId: 'u', email: 'e@x.com', expiresAt: 9999, access_token: 'SECRET' });
      },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:login', {}, { email: 'e@x.com', password: 'pass123' });
    assert(!('access_token' in r), 'access_token must be stripped from IPC response');
  });

  await testAsync('cloud-ipc: IPC response strips refresh_token', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      login: function() {
        return Promise.resolve({ ok: true, userId: 'u', email: 'e@x.com', expiresAt: 9999, refresh_token: 'SECRET' });
      },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:login', {}, { email: 'e@x.com', password: 'pass123' });
    assert(!('refresh_token' in r), 'refresh_token must be stripped from IPC response');
  });

  await testAsync('cloud-ipc: IPC response strips token key supabaseKey password and deviceId', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      login: function() {
        return Promise.resolve({
          ok: true, userId: 'u', email: 'e@x.com', expiresAt: 9999,
          token: 'tok', key: 'k', supabaseKey: 'sk', password: 'pw', deviceId: 'did',
        });
      },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:login', {}, { email: 'e@x.com', password: 'pass123' });
    assert(!('token'       in r), 'token must be stripped');
    assert(!('key'         in r), 'key must be stripped');
    assert(!('supabaseKey' in r), 'supabaseKey must be stripped');
    assert(!('password'    in r), 'password must be stripped');
    assert(!('deviceId'    in r), 'deviceId must be stripped');
  });

  await testAsync('cloud-ipc: IPC response strips service_role sb_secret serviceRole publishableKey machineFingerprint licenseJson', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      login: function() {
        return Promise.resolve({
          ok: true, userId: 'u', email: 'e@x.com', expiresAt: 9999,
          service_role: 'sr', sb_secret: 'sbs', serviceRole: 'sR',
          publishableKey: 'pk', machineFingerprint: 'mfp', licenseJson: 'lj',
        });
      },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:login', {}, { email: 'e@x.com', password: 'pass123' });
    assert(!('service_role'      in r), 'service_role must be stripped');
    assert(!('sb_secret'         in r), 'sb_secret must be stripped');
    assert(!('serviceRole'       in r), 'serviceRole must be stripped');
    assert(!('publishableKey'    in r), 'publishableKey must be stripped');
    assert(!('machineFingerprint' in r), 'machineFingerprint must be stripped');
    assert(!('licenseJson'       in r), 'licenseJson must be stripped');
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  await testAsync('cloud-ipc: auth throw returns unknown_error', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      logout: function() { throw new Error('unexpected internal error'); },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:logout');
    assert(r.ok === false,                 'ok must be false on auth throw');
    assertEqual(r.error, 'unknown_error',  'error must be unknown_error');
  });

  await testAsync('cloud-ipc: thrown error does not leak token or password in IPC response', async function() {
    var ipc = makeMockIpcMain();
    var mockAuth = makeMockAuth({
      login: function() { throw new Error('Token: secret-access-token password: hunter2'); },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockAuth);
    var r = await ipc._invoke('cloud:login', {}, { email: 'e@x.com', password: 'pass123' });
    assert(r.ok === false,                 'ok must be false on throw');
    assertEqual(r.error, 'unknown_error',  'error must be unknown_error on throw');
    var rStr = JSON.stringify(r);
    assert(!rStr.includes('secret-access-token'), 'response must not contain the thrown error message');
    assert(!rStr.includes('hunter2'),              'response must not leak any password from the error');
  });
}

module.exports = { register, registerAsync };
