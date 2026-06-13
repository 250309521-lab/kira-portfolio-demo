'use strict';

const auth = require('../cloud/cloud-auth');

// Set env vars required by cloud-config.isConfigured() for all tests.
// Only sets them if not already present — CI env takes precedence.
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockStore(initialRefreshToken) {
  var _saved = initialRefreshToken !== undefined ? initialRefreshToken : null;
  return {
    saveRefreshToken:   function(t) { _saved = t; return true; },
    loadRefreshToken:   function()  { return _saved; },
    deleteRefreshToken: function()  { _saved = null; },
    _getToken:          function()  { return _saved; }, // test inspection only
  };
}

function makeAuthPayload(overrides) {
  return Object.assign({
    access_token:  'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type:    'bearer',
    expires_in:    3600,
    expires_at:    Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'test-user-id', email: 'test@example.com' },
  }, overrides || {});
}

function makeOkFetch(payload) {
  return function() {
    return Promise.resolve({
      ok:     true,
      status: 200,
      json:   function() { return Promise.resolve(payload); },
    });
  };
}

function makeErrorFetch(status, body) {
  return function() {
    return Promise.resolve({
      ok:     false,
      status: status || 400,
      json:   function() { return Promise.resolve(body || {}); },
    });
  };
}

function makeThrowFetch() {
  return function() { return Promise.reject(new TypeError('fetch failed')); };
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {
  test('cloud-auth: isAuthenticated returns false on fresh module', function() {
    auth._resetForTests();
    assert(auth.isAuthenticated() === false, 'must be false when not logged in');
  });

  test('cloud-auth: getSessionMeta returns ok:false when unauthenticated', function() {
    auth._resetForTests();
    var meta = auth.getSessionMeta();
    assert(meta.ok === false, 'ok must be false when not authenticated');
  });

  test('cloud-auth: getSessionMeta contains no access_token key', function() {
    auth._resetForTests();
    var meta = auth.getSessionMeta();
    assert(!('access_token' in meta), 'access_token must not appear in getSessionMeta result');
  });

  test('cloud-auth: getSessionMeta contains no refresh_token key', function() {
    auth._resetForTests();
    var meta = auth.getSessionMeta();
    assert(!('refresh_token' in meta), 'refresh_token must not appear in getSessionMeta result');
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  // ── login ──────────────────────────────────────────────────────────────────

  await testAsync('cloud-auth: login success returns ok:true and safe metadata', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    var r = await auth.login('test@example.com', 'password');
    assert(r.ok === true,                       'login must return ok:true');
    assert(typeof r.userId    === 'string',     'must include userId');
    assert(typeof r.email     === 'string',     'must include email');
    assert(typeof r.expiresAt === 'number',     'must include expiresAt (ms)');
    assert(typeof r.sessionPersisted === 'boolean', 'must include sessionPersisted');
  });

  await testAsync('cloud-auth: login success sets authenticated state in memory', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    await auth.login('test@example.com', 'password');
    assert(auth.isAuthenticated() === true, 'must be authenticated after successful login');
  });

  await testAsync('cloud-auth: login success saves refresh token via session store', async function() {
    auth._resetForTests();
    var mockStore = makeMockStore();
    auth._setStore(mockStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'saved-refresh-tok' })));
    await auth.login('test@example.com', 'password');
    assertEqual(mockStore._getToken(), 'saved-refresh-tok', 'refresh token must be persisted in store');
  });

  await testAsync('cloud-auth: login failure maps to auth_failed', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeErrorFetch(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }));
    var r = await auth.login('test@example.com', 'wrong-password');
    assert(r.ok === false,                'must return ok:false');
    assertEqual(r.error, 'auth_failed',   'error code must be auth_failed');
  });

  await testAsync('cloud-auth: email_not_confirmed maps to email_not_confirmed', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeErrorFetch(400, { error: 'email_not_confirmed', error_description: 'Email not confirmed' }));
    var r = await auth.login('unconfirmed@example.com', 'pass');
    assert(r.ok === false,                          'must return ok:false');
    assertEqual(r.error, 'email_not_confirmed',     'error code must be email_not_confirmed');
  });

  // ── signup ─────────────────────────────────────────────────────────────────

  await testAsync('cloud-auth: signup success returns safe metadata', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    var r = await auth.signup('new@example.com', 'password123');
    assert(r.ok === true,                       'signup must return ok:true');
    assert(typeof r.userId    === 'string',     'must include userId');
    assert(typeof r.email     === 'string',     'must include email');
    assert(typeof r.sessionPersisted === 'boolean', 'must include sessionPersisted');
  });

  await testAsync('cloud-auth: signup requiring email confirmation returns email_not_confirmed', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    // Supabase returns 200 + user object but no access_token when confirmation is required
    auth._setFetch(makeOkFetch({ user: { id: 'uid', email: 'new@example.com' } }));
    var r = await auth.signup('new@example.com', 'password123');
    assert(r.ok === false,                      'must return ok:false when confirmation required');
    assertEqual(r.error, 'email_not_confirmed', 'error code must be email_not_confirmed');
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  await testAsync('cloud-auth: logout clears memory session', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    await auth.login('test@example.com', 'pass');
    assert(auth.isAuthenticated() === true, 'must be authenticated before logout');
    auth._setFetch(makeOkFetch({}));
    await auth.logout();
    assert(auth.isAuthenticated() === false, 'must not be authenticated after logout');
  });

  await testAsync('cloud-auth: logout deletes persisted refresh token', async function() {
    auth._resetForTests();
    var mockStore = makeMockStore();
    auth._setStore(mockStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'to-be-deleted' })));
    await auth.login('test@example.com', 'pass');
    auth._setFetch(makeOkFetch({}));
    await auth.logout();
    assertEqual(mockStore._getToken(), null, 'refresh token must be deleted from store after logout');
  });

  await testAsync('cloud-auth: logout sends Authorization header (Bearer token) in fetch call', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload({ access_token: 'my-access-tok' })));
    await auth.login('test@example.com', 'pass');
    var capturedHeaders = null;
    auth._setFetch(function(url, opts) {
      capturedHeaders = opts && opts.headers ? opts.headers : {};
      return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve({}); } });
    });
    await auth.logout();
    assert(capturedHeaders !== null, 'fetch must be called during logout');
    assertEqual(capturedHeaders['Authorization'], 'Bearer my-access-tok',
      'Authorization header must carry the access token inside cloud-auth only');
  });

  // ── restoreSession ─────────────────────────────────────────────────────────

  await testAsync('cloud-auth: restoreSession with no stored token returns session_expired', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore(null)); // no stored refresh token
    var r = await auth.restoreSession();
    assert(r.ok === false,                  'must return ok:false');
    assertEqual(r.error, 'session_expired', 'error code must be session_expired');
  });

  await testAsync('cloud-auth: restoreSession success refreshes and authenticates', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore('stored-refresh-token'));
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'new-refresh-token' })));
    var r = await auth.restoreSession();
    assert(r.ok === true,                   'must return ok:true when refresh token exists');
    assert(auth.isAuthenticated() === true,  'must be authenticated after restoreSession');
  });

  // ── refreshSession ─────────────────────────────────────────────────────────

  await testAsync('cloud-auth: refreshSession rotates refresh token in store', async function() {
    auth._resetForTests();
    var mockStore = makeMockStore('old-refresh-token');
    auth._setStore(mockStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'rotated-refresh-token' })));
    await auth.refreshSession();
    assertEqual(mockStore._getToken(), 'rotated-refresh-token',
      'new refresh token must replace old one in store');
  });

  // ── getAccessToken ─────────────────────────────────────────────────────────

  await testAsync('cloud-auth: getAccessToken triggers refresh when token near expiry', async function() {
    auth._resetForTests();
    var fixedNow = 1_000_000_000; // fixed ms timestamp
    auth._setNow(function() { return fixedNow; });
    var mockStore = makeMockStore();
    auth._setStore(mockStore);
    // Login: token expires 30 s from fixedNow (well within the 60 s refresh window)
    var nearExpiry = Math.floor((fixedNow + 30_000) / 1000); // Unix seconds
    auth._setFetch(makeOkFetch(makeAuthPayload({ access_token: 'tok-1', refresh_token: 'ref-1', expires_at: nearExpiry })));
    await auth.login('test@example.com', 'pass');
    // Now set up the refresh response
    var farExpiry = Math.floor((fixedNow + 3_600_000) / 1000);
    auth._setFetch(makeOkFetch(makeAuthPayload({ access_token: 'tok-2', refresh_token: 'ref-2', expires_at: farExpiry })));
    var token = await auth.getAccessToken();
    assertEqual(token, 'tok-2', 'must return the refreshed token when near expiry');
  });

  await testAsync('cloud-auth: getAccessToken returns null when refresh fails', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore('some-refresh-token'));
    auth._setFetch(makeErrorFetch(401, { error: 'invalid_grant' }));
    var token = await auth.getAccessToken();
    assertEqual(token, null, 'must return null when refresh fails');
  });

  // ── token exposure ─────────────────────────────────────────────────────────

  await testAsync('cloud-auth: login result contains no access_token key', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    var r = await auth.login('test@example.com', 'pass');
    assert(!('access_token'  in r), 'access_token must not appear in login result');
  });

  await testAsync('cloud-auth: login result contains no refresh_token key', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    var r = await auth.login('test@example.com', 'pass');
    assert(!('refresh_token' in r), 'refresh_token must not appear in login result');
  });

  await testAsync('cloud-auth: signup result contains no access_token or refresh_token keys', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    var r = await auth.signup('new@example.com', 'password');
    assert(!('access_token'  in r), 'access_token must not appear in signup result');
    assert(!('refresh_token' in r), 'refresh_token must not appear in signup result');
  });

  await testAsync('cloud-auth: restoreSession result contains no access_token or refresh_token keys', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore('stored-token'));
    auth._setFetch(makeOkFetch(makeAuthPayload()));
    var r = await auth.restoreSession();
    assert(!('access_token'  in r), 'access_token must not appear in restoreSession result');
    assert(!('refresh_token' in r), 'refresh_token must not appear in restoreSession result');
  });

  // ── error mapping ──────────────────────────────────────────────────────────

  await testAsync('cloud-auth: network failure maps to offline', async function() {
    auth._resetForTests();
    auth._setStore(makeMockStore());
    auth._setFetch(makeThrowFetch());
    var r = await auth.login('test@example.com', 'pass');
    assert(r.ok === false,           'must return ok:false on network failure');
    assertEqual(r.error, 'offline',  'error code must be offline');
  });

  await testAsync('cloud-auth: not_configured when SUPABASE_URL missing', async function() {
    auth._resetForTests();
    var origUrl = process.env.SUPABASE_URL;
    var origKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    try {
      var r = await auth.login('test@example.com', 'pass');
      assert(r.ok === false,                  'must return ok:false when not configured');
      assertEqual(r.error, 'not_configured',  'error code must be not_configured');
    } finally {
      process.env.SUPABASE_URL            = origUrl;
      process.env.SUPABASE_PUBLISHABLE_KEY = origKey;
    }
  });
}

module.exports = { register, registerAsync };
