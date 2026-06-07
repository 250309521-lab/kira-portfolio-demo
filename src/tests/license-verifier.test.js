'use strict';

/**
 * CH-4C License Verifier Tests
 *
 * Standalone:  node src/tests/license-verifier.test.js
 * Via run.js:  require('./license-verifier.test.js').register(test, assert, assertEqual)
 *
 * Uses an ephemeral in-memory ECDSA P-256 keypair.
 * Never reads keys/private.pem or keys/public.pem.
 * Never writes files. Never creates .ktplicense files.
 */

const crypto   = require('crypto');
const path     = require('path');
const verifier = require(path.join(__dirname, '..', 'license-verifier.js'));

// ── Ephemeral test keypair ─────────────────────────────────────────────────────
// Generated in-memory on module load. Discarded when process exits.
// Provides test isolation from production keys.

const { privateKey: _TEST_PRIV, publicKey: _TEST_PUB } = crypto.generateKeyPairSync('ec', {
  namedCurve:          'prime256v1',
  publicKeyEncoding:   { type: 'spki',  format: 'pem' },
  privateKeyEncoding:  { type: 'pkcs8', format: 'pem' },
});

// ── Test fixtures ──────────────────────────────────────────────────────────────

const _FP  = 'a3f7b2c1'.repeat(8);  // 64-char lowercase hex — "current" machine
const _FP2 = 'deadbeef'.repeat(8);  // 64-char lowercase hex — different machine

// Override embedded key with ephemeral test public key for all verifier calls.
const _OPTS = { publicKeyPem: _TEST_PUB };

// ── Payload builder ────────────────────────────────────────────────────────────
// Shape mirrors scripts/license-issuer.js buildPayload exactly.
// product is 'KiraTakipPro' — matches issuer (not 'KiraTakipPro Customer').

function _buildPayload(overrides) {
  return Object.assign({
    schemaVersion:      '1',
    appId:              'com.kiratakippro.customer',
    product:            'KiraTakipPro',
    keyId:              'ktp-prod-2026-06',
    appVersion:         '6.0.0',
    plan:               'standard',
    customerName:       'Test Customer',
    customerId:         'TEST-001',
    machineFingerprint: _FP,
    issuedAt:           '2026-06-07T00:00:00.000Z',
    expiresAt:          '2099-12-31T23:59:59.999Z',
    perpetual:          false,
    features:           ['excel-export'],
    seats:              1,
    licenseId:          'test-license-id-001',
  }, overrides || {});
}

// Sign payload with ephemeral test private key.
// Mirrors scripts/license-issuer.js signPayload exactly.
function _sign(payload) {
  const canonical = verifier.canonicalizePayload(payload);
  return crypto.sign('sha256', Buffer.from(canonical, 'utf8'), _TEST_PRIV).toString('base64url');
}

// Build a complete { payload, signature } object with optional overrides.
// signatureOverride skips signing (use 'abc' for tests that fail before sig check).
function _makeLicense(payloadOverrides, signatureOverride) {
  const payload   = _buildPayload(payloadOverrides);
  const signature = signatureOverride !== undefined ? signatureOverride : _sign(payload);
  return { payload, signature };
}

// ── register ───────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {
  console.log('\nLicense Verifier (CH-4C):');

  // ── A. canonicalizePayload ────────────────────────────────────────────────────

  test('CH-4C: canonicalizePayload sorts keys alphabetically', function() {
    var canon  = verifier.canonicalizePayload({ z: 1, a: 2, m: 3 });
    assertEqual(canon, JSON.stringify({ a: 2, m: 3, z: 1 }), 'keys must be in alphabetical order');
  });

  test('CH-4C: canonicalizePayload output matches manual issuer logic', function() {
    var payload = _buildPayload();
    var canon   = verifier.canonicalizePayload(payload);
    var sorted  = {};
    Object.keys(payload).sort().forEach(function(k) { sorted[k] = payload[k]; });
    assertEqual(canon, JSON.stringify(sorted), 'canonical must match sorted JSON.stringify');
  });

  // ── B. Valid expiring license ─────────────────────────────────────────────────

  test('CH-4C: valid expiring license returns ok:true reason valid', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), _FP, _OPTS);
    assert(r.ok, 'expected ok:true, got reason: ' + r.reason);
    assertEqual(r.reason, 'valid', 'reason must be "valid"');
    assert(typeof r.license === 'object' && r.license !== null, 'license object must be present');
    assertEqual(r.license.plan, 'standard', 'plan must match');
    assertEqual(r.license.perpetual, false, 'perpetual must be false');
    assertEqual(r.license.expiresAt, '2099-12-31T23:59:59.999Z', 'expiresAt must match');
  });

  // ── C. Valid perpetual license ────────────────────────────────────────────────

  test('CH-4C: valid perpetual license (expiresAt:null) returns ok:true', function() {
    var r = verifier.verifyLicenseObject(_makeLicense({ perpetual: true, expiresAt: null }), _FP, _OPTS);
    assert(r.ok, 'expected ok:true, got reason: ' + r.reason);
    assertEqual(r.license.perpetual, true, 'perpetual must be true');
    assert(r.license.expiresAt === null, 'expiresAt must be null in result');
  });

  // ── D. Tampered payload ───────────────────────────────────────────────────────

  test('CH-4C: tampered payload (seats changed after sign) returns ok:false reason invalid_signature', function() {
    var obj         = _makeLicense();
    obj.payload.seats = 999;   // mutate after signature was computed
    var r = verifier.verifyLicenseObject(obj, _FP, _OPTS);
    assert(!r.ok, 'tampered payload must not verify');
    assertEqual(r.reason, 'invalid_signature', 'reason must be invalid_signature');
  });

  test('CH-4C: tampered payload (plan changed after sign) returns ok:false reason invalid_signature', function() {
    var obj       = _makeLicense();
    obj.payload.plan = 'pro';  // mutate after signature was computed
    var r = verifier.verifyLicenseObject(obj, _FP, _OPTS);
    assert(!r.ok, 'tampered payload must not verify');
    assertEqual(r.reason, 'invalid_signature', 'reason must be invalid_signature');
  });

  // ── E. Invalid/random signature ───────────────────────────────────────────────

  test('CH-4C: random base64url signature returns ok:false reason invalid_signature', function() {
    var obj = _makeLicense({}, 'cmFuZG9tc2lnbmF0dXJl');  // random base64url bytes
    var r   = verifier.verifyLicenseObject(obj, _FP, _OPTS);
    assert(!r.ok, 'random signature must not verify');
    assertEqual(r.reason, 'invalid_signature', 'reason must be invalid_signature');
  });

  // ── F. Wrong current fingerprint ──────────────────────────────────────────────

  test('CH-4C: wrong current fingerprint returns ok:false reason wrong_machine', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), _FP2, _OPTS);
    assert(!r.ok, 'wrong fingerprint must fail');
    assertEqual(r.reason, 'wrong_machine', 'reason must be wrong_machine');
  });

  // ── G. Unavailable fingerprint ────────────────────────────────────────────────

  test('CH-4C: null current fingerprint returns ok:false reason fingerprint_unavailable', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), null, _OPTS);
    assert(!r.ok, 'null fingerprint must fail');
    assertEqual(r.reason, 'fingerprint_unavailable', 'reason must be fingerprint_unavailable');
  });

  test('CH-4C: empty string fingerprint returns ok:false reason fingerprint_unavailable', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), '', _OPTS);
    assert(!r.ok, 'empty fingerprint must fail');
    assertEqual(r.reason, 'fingerprint_unavailable', 'reason must be fingerprint_unavailable');
  });

  // ── H. Expired license ────────────────────────────────────────────────────────
  // Expiry check is after signature — must use signed license object.

  test('CH-4C: expired license returns ok:false reason expired', function() {
    var obj = _makeLicense({ perpetual: false, expiresAt: '2020-01-01T23:59:59.999Z' });
    var r   = verifier.verifyLicenseObject(obj, _FP, _OPTS);
    assert(!r.ok, 'expired license must fail');
    assertEqual(r.reason, 'expired', 'reason must be expired');
  });

  test('CH-4C: options.now override — license not yet expired relative to past "now" is valid', function() {
    var futureExpiry = new Date(Date.now() + 86400000).toISOString();
    var obj          = _makeLicense({ perpetual: false, expiresAt: futureExpiry });
    var pastNow      = new Date(Date.now() - 86400000);
    var r = verifier.verifyLicenseObject(obj, _FP, Object.assign({}, _OPTS, { now: pastNow }));
    assert(r.ok, 'license should be valid when now is in the past, got reason: ' + r.reason);
  });

  // ── I. Malformed JSON ─────────────────────────────────────────────────────────

  test('CH-4C: malformed JSON string returns ok:false reason invalid_json', function() {
    var r = verifier.verifyLicenseJson('not json {{{', _FP, _OPTS);
    assert(!r.ok, 'malformed JSON must fail');
    assertEqual(r.reason, 'invalid_json', 'reason must be invalid_json');
  });

  test('CH-4C: empty string returns ok:false reason invalid_json', function() {
    var r = verifier.verifyLicenseJson('', _FP, _OPTS);
    assert(!r.ok, 'empty string must fail');
    assertEqual(r.reason, 'invalid_json', 'reason must be invalid_json');
  });

  // ── J. Root missing payload or signature ──────────────────────────────────────

  test('CH-4C: root missing payload field returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'missing payload must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: root missing signature field returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload() }, _FP, _OPTS);
    assert(!r.ok, 'missing signature must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: array root returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject([1, 2, 3], _FP, _OPTS);
    assert(!r.ok, 'array root must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: null root returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject(null, _FP, _OPTS);
    assert(!r.ok, 'null root must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  // ── K. Unsupported schemaVersion ──────────────────────────────────────────────
  // schemaVersion is checked before fingerprint and signature — 'abc' sig is fine.

  test('CH-4C: unsupported schemaVersion returns ok:false reason unsupported_schema', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ schemaVersion: '99' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'unsupported schema must fail');
    assertEqual(r.reason, 'unsupported_schema', 'reason must be unsupported_schema');
  });

  test('CH-4C: missing schemaVersion returns ok:false reason unsupported_schema', function() {
    var p = _buildPayload(); delete p.schemaVersion;
    var r = verifier.verifyLicenseObject({ payload: p, signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'missing schemaVersion must fail');
    assertEqual(r.reason, 'unsupported_schema', 'reason must be unsupported_schema');
  });

  // ── L. Wrong appId ────────────────────────────────────────────────────────────
  // appId is checked before fingerprint and signature.

  test('CH-4C: wrong appId returns ok:false reason invalid_app', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ appId: 'com.other.app' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'wrong appId must fail');
    assertEqual(r.reason, 'invalid_app', 'reason must be invalid_app');
  });

  // ── M. Wrong product ──────────────────────────────────────────────────────────
  // product is checked before fingerprint and signature.

  test('CH-4C: wrong product returns ok:false reason invalid_app', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ product: 'OtherProduct' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'wrong product must fail');
    assertEqual(r.reason, 'invalid_app', 'reason must be invalid_app');
  });

  // ── M2. keyId checks ──────────────────────────────────────────────────────────
  // keyId is checked in step 3 (app binding), before fingerprint and signature.

  test('CH-4C: valid license result includes keyId and returns ktp-prod-2026-06', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), _FP, _OPTS);
    assert(r.ok, 'expected ok:true, got reason: ' + r.reason);
    assertEqual(r.license.keyId, 'ktp-prod-2026-06', 'keyId must be ktp-prod-2026-06');
  });

  test('CH-4C: missing keyId returns ok:false reason invalid_app', function() {
    var p = _buildPayload(); delete p.keyId;
    var r = verifier.verifyLicenseObject({ payload: p, signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'missing keyId must fail');
    assertEqual(r.reason, 'invalid_app', 'reason must be invalid_app');
  });

  test('CH-4C: wrong keyId returns ok:false reason invalid_app', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ keyId: 'ktp-prod-9999-99' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'wrong keyId must fail');
    assertEqual(r.reason, 'invalid_app', 'reason must be invalid_app');
  });

  // ── N. Invalid plan ───────────────────────────────────────────────────────────
  // plan is checked in required fields (step 4), before fingerprint and signature.

  test('CH-4C: invalid plan returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ plan: 'enterprise' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'invalid plan must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  // ── O. Seats <= 0 ─────────────────────────────────────────────────────────────
  // seats is checked in required fields (step 4), before fingerprint and signature.

  test('CH-4C: seats 0 returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ seats: 0 }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'seats 0 must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: seats -1 returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ seats: -1 }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'seats -1 must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: seats 1.5 (non-integer) returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ seats: 1.5 }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'fractional seats must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  // ── P. Features not array ─────────────────────────────────────────────────────
  // features is checked in required fields (step 4), before fingerprint and signature.

  test('CH-4C: features as string returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ features: 'excel-export' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'features as string must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: features as null returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ features: null }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'features as null must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  // ── Q. Perpetual false with missing/invalid expiresAt ─────────────────────────
  // expiresAt format check is in step 7 (expiry), AFTER signature — must sign.

  test('CH-4C: perpetual false with missing expiresAt returns ok:false reason invalid_format', function() {
    var payload = _buildPayload({ perpetual: false });
    delete payload.expiresAt;
    var sig = _sign(payload);
    var r   = verifier.verifyLicenseObject({ payload: payload, signature: sig }, _FP, _OPTS);
    assert(!r.ok, 'missing expiresAt on non-perpetual must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  test('CH-4C: perpetual false with invalid expiresAt string returns ok:false reason invalid_format', function() {
    var payload = _buildPayload({ perpetual: false, expiresAt: 'not-a-date' });
    var sig     = _sign(payload);
    var r       = verifier.verifyLicenseObject({ payload: payload, signature: sig }, _FP, _OPTS);
    assert(!r.ok, 'invalid expiresAt on non-perpetual must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  // ── R. Invalid issuedAt ───────────────────────────────────────────────────────
  // issuedAt is checked in required fields (step 4), before fingerprint and signature.

  test('CH-4C: invalid issuedAt returns ok:false reason invalid_format', function() {
    var r = verifier.verifyLicenseObject({ payload: _buildPayload({ issuedAt: 'not-a-date' }), signature: 'abc' }, _FP, _OPTS);
    assert(!r.ok, 'invalid issuedAt must fail');
    assertEqual(r.reason, 'invalid_format', 'reason must be invalid_format');
  });

  // ── S. Features array is copied (not same reference) ─────────────────────────

  test('CH-4C: valid license result features is a copied array, not same reference', function() {
    var features = ['excel-export', 'cloud-sync'];
    var obj      = _makeLicense({ features: features });
    var r        = verifier.verifyLicenseObject(obj, _FP, _OPTS);
    assert(r.ok, 'expected ok:true, got reason: ' + r.reason);
    assert(Array.isArray(r.license.features), 'features must be an array');
    assertEqual(r.license.features.length, 2, 'features length must match');
    assertEqual(r.license.features[0], 'excel-export', 'first feature must match');
    assert(r.license.features !== obj.payload.features, 'features must be a new array (copied, not same reference)');
  });

  // ── Additional: verifyLicenseJson round-trip ──────────────────────────────────

  test('CH-4C: verifyLicenseJson round-trip with valid license JSON string', function() {
    var obj  = _makeLicense();
    var json = JSON.stringify(obj);
    var r    = verifier.verifyLicenseJson(json, _FP, _OPTS);
    assert(r.ok, 'JSON round-trip must succeed, got reason: ' + r.reason);
    assertEqual(r.reason, 'valid', 'reason must be valid');
    assertEqual(r.license.customerId, 'TEST-001', 'customerId must survive round-trip');
  });

  // ── Additional: verifySignature standalone ────────────────────────────────────

  test('CH-4C: verifySignature returns true for correctly signed payload', function() {
    var payload = _buildPayload();
    var sig     = _sign(payload);
    assert(verifier.verifySignature(payload, sig, _TEST_PUB), 'verifySignature must return true');
  });

  test('CH-4C: verifySignature returns false for tampered payload', function() {
    var payload  = _buildPayload();
    var sig      = _sign(payload);
    var tampered = Object.assign({}, payload, { seats: 999 });
    assert(!verifier.verifySignature(tampered, sig, _TEST_PUB), 'verifySignature must return false for tampered payload');
  });

  test('CH-4C: verifySignature returns false for random signature bytes', function() {
    var payload = _buildPayload();
    assert(!verifier.verifySignature(payload, 'YWJjZGVm', _TEST_PUB), 'verifySignature must return false for random signature');
  });

  // ── Additional: license result field completeness ─────────────────────────────

  test('CH-4C: valid license result contains all required fields', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), _FP, _OPTS);
    assert(r.ok, 'must be ok:true');
    var required = ['schemaVersion','appId','product','keyId','appVersion','plan','customerName',
                    'customerId','machineFingerprint','issuedAt','expiresAt','perpetual',
                    'features','seats','licenseId'];
    required.forEach(function(field) {
      assert(field in r.license, 'license result must contain field: ' + field);
    });
  });

  test('CH-4C: valid license machineFingerprint matches input fingerprint', function() {
    var r = verifier.verifyLicenseObject(_makeLicense(), _FP, _OPTS);
    assert(r.ok, 'must be ok:true');
    assertEqual(r.license.machineFingerprint, _FP, 'machineFingerprint in result must match input');
  });
}

// ── Standalone runner ──────────────────────────────────────────────────────────

if (require.main === module) {
  var _passed = 0, _failed = 0;

  function test(name, fn) {
    try   { fn(); console.log('  ✅ ' + name); _passed++; }
    catch (e) { console.error('  ❌ ' + name + ': ' + e.message); _failed++; }
  }
  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }
  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error((msg || 'assertEqual') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }

  console.log('\n═══ CH-4C License Verifier Tests (standalone) ═══');
  register(test, assert, assertEqual);
  console.log('\n═══ Results: ' + _passed + ' passed, ' + _failed + ' failed ═══\n');
  if (_failed > 0) {
    console.error('❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

module.exports = { register };
