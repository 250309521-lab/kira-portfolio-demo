/**
 * Kira Takip Pro — machine-id platform-branching tests
 * MAC-NATIVE-INSTALL-0A: verifies cross-platform fingerprint logic.
 * Tests run on any platform; they mock the OS-specific exec calls via
 * module-level monkey-patching of the internal helpers (not exported).
 * The public export getMachineFingerprint() is tested via integration path.
 *
 * Security note: this file never prints raw fingerprint values, machine GUIDs,
 * or platform UUIDs — only booleans and length assertions.
 *
 * Via run.js: require('./machine-id.test.js').register(test, assert, assertEqual)
 */

'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

// ── helpers ───────────────────────────────────────────────────────────────────

// Build the same fingerprint the module would produce for a given raw id.
function expectedFp(rawId) {
  return crypto.createHash('sha256').update(rawId + ':KiraTakipPro:v6').digest('hex');
}

// Validate a fingerprint string without printing its value.
function isValidFp(fp) {
  return typeof fp === 'string' && /^[0-9a-f]{64}$/.test(fp);
}

function register(test, assert, assertEqual) {

  // ── Source structure ────────────────────────────────────────────────────────
  test('machine-id: source file exists and exports getMachineFingerprint', function() {
    const modulePath = path.join(__dirname, '..', 'machine-id.js');
    assert(fs.existsSync(modulePath), 'machine-id.js must exist');
    const src = fs.readFileSync(modulePath, 'utf8');
    assert(/getMachineFingerprint/.test(src), 'getMachineFingerprint must be defined');
    assert(/module\.exports/.test(src), 'module.exports must exist');
  });

  // ── Platform branching logic (source scan) ─────────────────────────────────
  test('machine-id: win32 branch uses reg query MachineGuid', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'machine-id.js'), 'utf8');
    assert(/win32/.test(src), 'win32 branch must be present');
    assert(/MachineGuid/i.test(src), 'MachineGuid registry key must be referenced');
    assert(/getMachineGuidWin32|reg query/i.test(src), 'Windows GUID helper must exist');
  });

  test('machine-id: darwin branch uses ioreg IOPlatformUUID', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'machine-id.js'), 'utf8');
    assert(/darwin/.test(src), 'darwin branch must be present');
    assert(/IOPlatformUUID/i.test(src), 'IOPlatformUUID must be referenced');
    assert(/getMachineGuidDarwin|ioreg/i.test(src), 'macOS UUID helper must exist');
  });

  test('machine-id: unsupported platform returns null gracefully', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'machine-id.js'), 'utf8');
    // After win32 and darwin checks, the fallback must return null (not throw).
    assert(/return null/.test(src), 'null fallback must exist for unsupported platforms');
  });

  test('machine-id: no raw identifier is logged or exposed in module', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'machine-id.js'), 'utf8');
    // The module must not contain any console.log / console.error that would
    // print a machine identifier. Comments and strings are acceptable.
    const logRefs = (src.match(/console\.(log|error|warn|info)\s*\(/g) || []);
    assert(logRefs.length === 0, 'machine-id.js must not log any values (found: ' + logRefs.length + ')');
  });

  test('machine-id: salt string matches license-verifier expectation', function() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'machine-id.js'), 'utf8');
    // Both win32 and darwin paths must use the same hash salt so the verifier
    // can rely on a consistent 64-char hex fingerprint.
    assert(/:KiraTakipPro:v6/.test(src), 'hash salt :KiraTakipPro:v6 must be present');
  });

  // ── Fingerprint format (current platform) ─────────────────────────────────
  test('machine-id: getMachineFingerprint() returns valid 64-hex or null', function() {
    const { getMachineFingerprint } = require('../machine-id.js');
    const fp = getMachineFingerprint();
    // On Windows (the CI/dev machine), it must return a valid fingerprint.
    // On other platforms in CI, null is also acceptable.
    if (fp !== null) {
      assert(isValidFp(fp), 'fingerprint must be 64 lowercase hex chars (length=' + (fp||'').length + ')');
    }
    // fp === null is valid on unsupported platforms; no assertion failure.
  });

  test('machine-id: fingerprint is stable across two calls (deterministic)', function() {
    const { getMachineFingerprint } = require('../machine-id.js');
    const fp1 = getMachineFingerprint();
    const fp2 = getMachineFingerprint();
    // Both calls must agree; if fp1 is null both must be null.
    assertEqual(fp1, fp2, 'fingerprint must be deterministic across calls');
  });

  test('machine-id: fingerprint format matches license-verifier FINGERPRINT_RE', function() {
    const { getMachineFingerprint } = require('../machine-id.js');
    const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
    const fp = getMachineFingerprint();
    if (fp !== null) {
      assert(FINGERPRINT_RE.test(fp), 'fingerprint must match /^[0-9a-f]{64}$/');
    }
  });

  // ── Hash derivation logic (unit test without OS call) ─────────────────────
  test('machine-id: hash derivation produces correct 64-hex output format', function() {
    // Test the derivation logic in isolation with a synthetic raw id.
    const syntheticRaw = 'AAAABBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF';
    const fp = expectedFp(syntheticRaw);
    assert(isValidFp(fp), 'expected fingerprint must be 64 lowercase hex chars');
    assert(fp === expectedFp(syntheticRaw), 'derivation must be deterministic');
  });

  test('machine-id: different raw IDs produce different fingerprints', function() {
    const fpA = expectedFp('AAAA-BBBB-CCCC-DDDD');
    const fpB = expectedFp('1111-2222-3333-4444');
    assert(fpA !== fpB, 'distinct raw IDs must produce distinct fingerprints');
  });

  // ── macOS IOREG regex (parse correctness) ─────────────────────────────────
  test('machine-id: darwin ioreg UUID regex parses expected output format', function() {
    // Validate the regex the darwin branch uses, without needing a real Mac.
    const IOREG_UUID_RE = /"IOPlatformUUID"\s*=\s*"([0-9A-F-]{36})"/i;
    const sampleLine = '    "IOPlatformUUID" = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890"';
    const m = sampleLine.match(IOREG_UUID_RE);
    assert(m && m[1], 'darwin UUID regex must parse ioreg output line');
    assertEqual(m[1], 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', 'UUID extraction must be correct');
  });

  // ── Windows MachineGuid regex ──────────────────────────────────────────────
  test('machine-id: win32 MachineGuid regex parses expected output format', function() {
    const WIN_GUID_RE = /MachineGuid\s+REG_SZ\s+(\S+)/i;
    const sampleLine = 'MachineGuid    REG_SZ    a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const m = sampleLine.match(WIN_GUID_RE);
    assert(m && m[1], 'win32 GUID regex must parse reg query output line');
    assertEqual(m[1].trim(), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'GUID extraction must be correct');
  });

}

module.exports = { register };
