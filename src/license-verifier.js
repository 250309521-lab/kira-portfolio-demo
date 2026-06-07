'use strict';

const crypto = require('crypto');

// ── Constants ──────────────────────────────────────────────────────────────────

const SUPPORTED_SCHEMA_VERSION = '1';
const EXPECTED_APP_ID          = 'com.kiratakippro.customer';
// Mirrors scripts/license-issuer.js buildPayload line 159: product: 'KiraTakipPro'
const EXPECTED_PRODUCT         = 'KiraTakipPro';
const EXPECTED_KEY_ID          = 'ktp-prod-2026-06';
const ALLOWED_PLANS            = ['standard', 'pro', 'trial'];
const FINGERPRINT_RE           = /^[0-9a-f]{64}$/;

// Production public key — ECDSA P-256 SPKI PEM
// Generated: 2026-06-07. Paired with keys/private.pem (gitignored, never committed).
const EMBEDDED_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5pxtP7webMwLNZAuxytNSiRIwufI
sKSAfj7lkA5YjLfgIJkJbswhKwNxENf5aYqeIazfK2VqdVDW9MR1+2N59Q==
-----END PUBLIC KEY-----
`;

// ── canonicalizePayload ────────────────────────────────────────────────────────
// Mirrors scripts/license-issuer.js canonicalizePayload exactly.
// Alphabetical key sort + JSON.stringify — no trailing newline.

function canonicalizePayload(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
  return JSON.stringify(sorted);
}

// ── verifySignature ────────────────────────────────────────────────────────────
// Exported for tests: pass a test keypair via publicKeyPem to avoid using production key.
// Returns boolean — never throws.

function verifySignature(payload, signature, publicKeyPem = EMBEDDED_PUBLIC_KEY_PEM) {
  try {
    const canonical = canonicalizePayload(payload);
    return crypto.verify(
      'sha256',
      Buffer.from(canonical, 'utf8'),
      publicKeyPem,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

// ── verifyLicenseObject ────────────────────────────────────────────────────────
// Validates a parsed license object (already JSON-parsed).
// currentFingerprint: 64-char lowercase hex from getMachineFingerprint().
// options.now:          Date or timestamp — overrides current time (for tests).
// options.publicKeyPem: PEM string — overrides embedded key (for tests).

function verifyLicenseObject(licenseObject, currentFingerprint, options = {}) {
  const now          = options.now        ? new Date(options.now)      : new Date();
  const publicKeyPem = options.publicKeyPem || EMBEDDED_PUBLIC_KEY_PEM;

  try {
    // ── 1. Root structure ─────────────────────────────────────────────────────
    if (typeof licenseObject !== 'object' || licenseObject === null || Array.isArray(licenseObject)) {
      return { ok: false, reason: 'invalid_format', message: 'License root must be an object' };
    }

    const { payload, signature } = licenseObject;

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return { ok: false, reason: 'invalid_format', message: 'License payload must be an object' };
    }
    if (typeof signature !== 'string' || signature.length === 0) {
      return { ok: false, reason: 'invalid_format', message: 'License signature must be a non-empty string' };
    }

    // ── 2. Schema version ─────────────────────────────────────────────────────
    if (payload.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      return {
        ok:      false,
        reason:  'unsupported_schema',
        message: `Unsupported schemaVersion: ${String(payload.schemaVersion)}`,
      };
    }

    // ── 3. App binding ────────────────────────────────────────────────────────
    if (payload.appId !== EXPECTED_APP_ID) {
      return { ok: false, reason: 'invalid_app', message: 'License is not for this application' };
    }
    if (payload.product !== EXPECTED_PRODUCT) {
      return { ok: false, reason: 'invalid_app', message: 'License product mismatch' };
    }
    if (typeof payload.keyId !== 'string' || payload.keyId.length === 0) {
      return { ok: false, reason: 'invalid_app', message: 'keyId must be a non-empty string' };
    }
    if (payload.keyId !== EXPECTED_KEY_ID) {
      return { ok: false, reason: 'invalid_app', message: `License keyId is not recognised: ${payload.keyId}` };
    }

    // ── 4. Required field types ───────────────────────────────────────────────
    if (typeof payload.machineFingerprint !== 'string' || !FINGERPRINT_RE.test(payload.machineFingerprint)) {
      return { ok: false, reason: 'invalid_format', message: 'machineFingerprint must be a 64-character lowercase hex string' };
    }
    if (typeof payload.perpetual !== 'boolean') {
      return { ok: false, reason: 'invalid_format', message: 'perpetual must be a boolean' };
    }
    if (!ALLOWED_PLANS.includes(payload.plan)) {
      return { ok: false, reason: 'invalid_format', message: `plan must be one of: ${ALLOWED_PLANS.join(', ')}` };
    }
    if (typeof payload.seats !== 'number' || !Number.isInteger(payload.seats) || payload.seats < 1) {
      return { ok: false, reason: 'invalid_format', message: 'seats must be a positive integer >= 1' };
    }
    if (!Array.isArray(payload.features)) {
      return { ok: false, reason: 'invalid_format', message: 'features must be an array' };
    }
    if (typeof payload.licenseId !== 'string' || payload.licenseId.length === 0) {
      return { ok: false, reason: 'invalid_format', message: 'licenseId must be a non-empty string' };
    }
    if (typeof payload.issuedAt !== 'string' || isNaN(Date.parse(payload.issuedAt))) {
      return { ok: false, reason: 'invalid_format', message: 'issuedAt must be a valid ISO date string' };
    }

    // ── 5. Machine fingerprint ────────────────────────────────────────────────
    if (!currentFingerprint || !FINGERPRINT_RE.test(currentFingerprint)) {
      return { ok: false, reason: 'fingerprint_unavailable', message: 'Current machine fingerprint is unavailable or invalid' };
    }
    if (payload.machineFingerprint !== currentFingerprint) {
      return { ok: false, reason: 'wrong_machine', message: 'License is bound to a different machine' };
    }

    // ── 6. Signature ──────────────────────────────────────────────────────────
    const canonical = canonicalizePayload(payload);
    let sigValid;
    try {
      sigValid = crypto.verify(
        'sha256',
        Buffer.from(canonical, 'utf8'),
        publicKeyPem,
        Buffer.from(signature, 'base64url'),
      );
    } catch {
      return { ok: false, reason: 'invalid_signature', message: 'Signature verification error' };
    }
    if (!sigValid) {
      return { ok: false, reason: 'invalid_signature', message: 'Signature is not valid for this license' };
    }

    // ── 7. Expiry ─────────────────────────────────────────────────────────────
    if (!payload.perpetual) {
      if (typeof payload.expiresAt !== 'string' || isNaN(Date.parse(payload.expiresAt))) {
        return { ok: false, reason: 'invalid_format', message: 'expiresAt must be a valid ISO date string for non-perpetual licenses' };
      }
      if (new Date(payload.expiresAt) <= now) {
        return { ok: false, reason: 'expired', message: `License expired at ${payload.expiresAt}` };
      }
    }

    // ── 8. All checks passed ──────────────────────────────────────────────────
    return {
      ok:     true,
      reason: 'valid',
      license: {
        schemaVersion:      payload.schemaVersion,
        appId:              payload.appId,
        product:            payload.product,
        keyId:              payload.keyId,
        appVersion:         payload.appVersion     ?? null,
        plan:               payload.plan,
        customerName:       payload.customerName   ?? null,
        customerId:         payload.customerId     ?? null,
        machineFingerprint: payload.machineFingerprint,
        issuedAt:           payload.issuedAt,
        expiresAt:          payload.expiresAt      ?? null,
        perpetual:          payload.perpetual,
        features:           payload.features.slice(),
        seats:              payload.seats,
        licenseId:          payload.licenseId,
      },
    };
  } catch (e) {
    return { ok: false, reason: 'verifier_error', message: `Internal verifier error: ${e.message}` };
  }
}

// ── verifyLicenseJson ──────────────────────────────────────────────────────────
// Top-level entry point for a raw JSON string from disk.

function verifyLicenseJson(licenseJson, currentFingerprint, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(licenseJson);
  } catch {
    return { ok: false, reason: 'invalid_json', message: 'License file is not valid JSON' };
  }
  return verifyLicenseObject(parsed, currentFingerprint, options);
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  EMBEDDED_PUBLIC_KEY_PEM,
  canonicalizePayload,
  verifySignature,
  verifyLicenseObject,
  verifyLicenseJson,
};
