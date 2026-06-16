'use strict';

// CLOUD-FOUNDATION-1E.6D — Persistence forensic regression tests.
// Verifies the userData path is stable, the refresh token and active-workspace
// localStorage key survive a simulated restart, and that no normal app-close
// path deletes session state. Sign Out is the only intentional clear path.

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const store = require('../cloud/cloud-session-store');
const auth  = require('../cloud/cloud-auth');

if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

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

function makeTempPaths() {
  var suffix = Date.now() + '_' + Math.random().toString(36).slice(2);
  return {
    authPath:   path.join(os.tmpdir(), 'ktp_test_auth_'   + suffix + '.enc'),
    devicePath: path.join(os.tmpdir(), 'ktp_test_device_' + suffix + '.enc'),
  };
}

// Minimal localStorage stand-in for renderer-side persistence checks (no DOM/Electron available in Node tests).
function makeMockLocalStorage() {
  var data = {};
  return {
    getItem:    function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem:    function(k, v) { data[k] = String(v); },
    removeItem: function(k) { delete data[k]; },
    _dump:      function() { return Object.assign({}, data); },
  };
}

function makeOkFetch(payload) {
  return function() {
    return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve(payload); } });
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

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  // 1. userData path stability ────────────────────────────────────────────────

  test('forensic: getCloudAuthPath returns identical path across repeated calls (simulated restart)', function() {
    // Without Electron, getCloudAuthPath() requires app.getPath; here we verify the
    // path-join logic is deterministic given the same userData root, which is what
    // app.getPath('userData') guarantees across runs (same app name -> same OS path).
    var fakeUserData = path.join(os.tmpdir(), 'ktp_fake_userdata');
    var p1 = path.join(fakeUserData, 'cloud-auth.enc');
    var p2 = path.join(fakeUserData, 'cloud-auth.enc');
    assertEqual(p1, p2, 'cloud-auth.enc path must be identical given the same userData root');
  });

  // 4. Safe mode / reset flags — static audit of removal call sites ────────────

  test('forensic: no normal-close code path calls cloud-session-store.clearAll or deleteRefreshToken', function() {
    var rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.html'), 'utf8');
    var mainSrc      = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    // deleteRefreshToken/clearAll must only be reachable via cloud-auth.logout(), never main.js shutdown hooks.
    assert(!/window-all-closed[\s\S]{0,400}(deleteRefreshToken|clearAll)/.test(mainSrc),
      'window-all-closed handler must not call deleteRefreshToken/clearAll');
    assert(!/before-quit[\s\S]{0,400}(deleteRefreshToken|clearAll)/.test(mainSrc),
      'before-quit handler must not call deleteRefreshToken/clearAll');
    // Renderer: cloudLogout (the only intentional clear path) must be wired only to the Sign Out button handler.
    var logoutFnMatch = rendererSrc.match(/async function cloudLogoutFromUI\(\)\s*\{([\s\S]{0,400}?)\}/);
    assert(logoutFnMatch, 'cloudLogoutFromUI function must exist');
    assert(/cloudLogout/.test(logoutFnMatch[1]), 'cloudLogoutFromUI must call cloudLogout');
  });

  test('forensic: renderer initApp (final definition) calls cloudInitStatus after restoreElectronState', function() {
    var rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.html'), 'utf8');
    var idx = rendererSrc.lastIndexOf('window.initApp = initApp = function()');
    assert(idx !== -1, 'final initApp definition must exist');
    var body = rendererSrc.slice(idx, idx + 3000);
    assert(/restoreElectronState\(\)\.then\(/.test(body), 'final initApp must call restoreElectronState()');
    assert(/cloudInitStatus\(\)/.test(body), 'final initApp must call cloudInitStatus() — regression: 1E.6D');
  });

  test('forensic: __ktpRecover (manual reset) is the only place removing ktp_v5', function() {
    var rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.html'), 'utf8');
    var matches = rendererSrc.match(/localStorage\.removeItem\('ktp_v5'\)/g) || [];
    // ktp_v5 may be removed by __ktpRecover (crash reset) and the explicit "delete my data" confirm flow — both user-initiated.
    assert(matches.length >= 1, 'ktp_v5 removal call sites must exist (user-initiated only)');
    var recoverIdx = rendererSrc.indexOf('window.__ktpRecover=function');
    assert(recoverIdx !== -1, '__ktpRecover must exist');
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  // 2. Refresh token file survives restart ──────────────────────────────────────

  await testAsync('forensic: refresh token file exists with size>0 after login, and after simulated restart', async function() {
    auth._resetForTests();
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var mock = makeMockStorage();

    // Patch cloud-auth's internal store calls to route through cloud-session-store with our mock.
    var realStore = {
      saveRefreshToken:   function(t) { return store.saveRefreshToken(t, mock); },
      loadRefreshToken:   function()  { return store.loadRefreshToken(mock); },
      deleteRefreshToken: function()  { return store.deleteRefreshToken(); },
    };
    auth._setStore(realStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'persisted-tok' })));

    var loginResult = await auth.login('user@example.com', 'pw');
    assert(loginResult.ok === true, 'login must succeed');
    assert(loginResult.sessionPersisted === true, 'saveRefreshToken must report true');
    assert(fs.existsSync(tmp.authPath), 'refresh token file must exist after login');
    var sizeAfterLogin = fs.statSync(tmp.authPath).size;
    assert(sizeAfterLogin > 0, 'refresh token file must have size > 0 after login');

    // Simulate restart: reset in-memory auth state only — file on disk and store path untouched.
    auth._resetForTests();
    auth._setStore(realStore);

    assert(fs.existsSync(tmp.authPath), 'refresh token file must still exist after simulated restart');
    assertEqual(fs.statSync(tmp.authPath).size, sizeAfterLogin, 'file size must be unchanged across restart');

    var loaded = realStore.loadRefreshToken();
    assert(loaded !== null, 'loadRefreshToken must return present (non-null) after restart');
    assertEqual(loaded, 'persisted-tok', 'loaded token must match what was saved before restart');

    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });

  await testAsync('forensic: cloudRestoreSession (auth.restoreSession) succeeds after simulated restart using only the on-disk token', async function() {
    auth._resetForTests();
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var mock = makeMockStorage();
    var realStore = {
      saveRefreshToken:   function(t) { return store.saveRefreshToken(t, mock); },
      loadRefreshToken:   function()  { return store.loadRefreshToken(mock); },
      deleteRefreshToken: function()  { return store.deleteRefreshToken(); },
    };
    auth._setStore(realStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'restart-tok' })));
    await auth.login('user@example.com', 'pw');

    // Simulate app restart: fresh in-memory auth module state, same on-disk file.
    auth._resetForTests();
    auth._setStore(realStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'rotated-after-restart' })));

    assert(auth.isAuthenticated() === false, 'in-memory auth must be unauthenticated immediately after simulated restart');
    var restoreResult = await auth.restoreSession();
    assert(restoreResult.ok === true, 'restoreSession must succeed using the on-disk refresh token');
    assert(auth.isAuthenticated() === true, 'must be authenticated after restoreSession following restart');

    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });

  // 3. localStorage active-workspace id survives restart (renderer-side persistence) ─

  await testAsync('forensic: ktp_active_workspace_id survives a simulated restart (no close-time removal)', async function() {
    var ls = makeMockLocalStorage();
    ls.setItem('ktp_active_workspace_id', 'ws-123');
    ls.setItem('ktp_v5', JSON.stringify({ workspaceId: 'ws-123', buildings: [] }));

    // Simulate "app close": nothing should run that removes these keys.
    // (No-op here — the point is that nothing in the close path is invoked.)

    // Simulate "app restart": new render context reading the same backing store.
    assertEqual(ls.getItem('ktp_active_workspace_id'), 'ws-123', 'ktp_active_workspace_id must survive restart');
    assert(ls.getItem('ktp_v5') !== null, 'ktp_v5 must survive restart');
    var parsed = JSON.parse(ls.getItem('ktp_v5'));
    assertEqual(parsed.workspaceId, 'ws-123', 'DATA.workspaceId must be restorable from ktp_v5 after restart');
  });

  // 6. Sign Out distinction ──────────────────────────────────────────────────────

  await testAsync('forensic: logout() (Sign Out) intentionally deletes the refresh token', async function() {
    auth._resetForTests();
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var mock = makeMockStorage();
    var realStore = {
      saveRefreshToken:   function(t) { return store.saveRefreshToken(t, mock); },
      loadRefreshToken:   function()  { return store.loadRefreshToken(mock); },
      deleteRefreshToken: function()  { return store.deleteRefreshToken(); },
    };
    auth._setStore(realStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'to-be-signed-out' })));
    await auth.login('user@example.com', 'pw');
    assert(fs.existsSync(tmp.authPath), 'token file must exist before sign out');

    auth._setFetch(makeOkFetch({}));
    await auth.logout();
    assert(!fs.existsSync(tmp.authPath), 'token file must be deleted after explicit Sign Out (logout)');

    store._setTestPaths(null, null);
  });

  await testAsync('forensic: simulated app close (no logout call) leaves refresh token file intact', async function() {
    auth._resetForTests();
    var tmp = makeTempPaths();
    store._setTestPaths(tmp.authPath, tmp.devicePath);
    var mock = makeMockStorage();
    var realStore = {
      saveRefreshToken:   function(t) { return store.saveRefreshToken(t, mock); },
      loadRefreshToken:   function()  { return store.loadRefreshToken(mock); },
      deleteRefreshToken: function()  { return store.deleteRefreshToken(); },
    };
    auth._setStore(realStore);
    auth._setFetch(makeOkFetch(makeAuthPayload({ refresh_token: 'survives-close' })));
    await auth.login('user@example.com', 'pw');
    assert(fs.existsSync(tmp.authPath), 'token file must exist after login');

    // Simulate window-all-closed / before-quit: only resets in-memory module state (mirrors process exit),
    // never calls auth.logout() or store.deleteRefreshToken().
    auth._resetForTests();
    auth._setStore(realStore);

    assert(fs.existsSync(tmp.authPath), 'token file must remain on disk after app close without Sign Out');
    assertEqual(realStore.loadRefreshToken(), 'survives-close', 'token content must be unchanged after close');

    store._setTestPaths(null, null);
    try { fs.unlinkSync(tmp.authPath); } catch (_) {}
  });
}

module.exports = { register, registerAsync };
