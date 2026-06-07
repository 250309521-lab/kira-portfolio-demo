'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_PLANS    = ['standard', 'pro', 'trial'];
const FINGERPRINT_RE   = /^[0-9a-f]{64}$/;
const DATE_RE          = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOMER_ID_RE   = /^[A-Za-z0-9_.-]+$/;
const SEATS_RE         = /^\d+$/;
const KEY_ID           = 'ktp-prod-2026-06';

// ── Helpers ────────────────────────────────────────────────────────────────────

function camelize(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function loadPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function printHelp() {
  console.log([
    'KiraTakipPro License Issuer',
    '',
    'Usage:',
    '  node scripts/license-issuer.js [options]',
    '',
    'Required:',
    '  --customer-id    <string>      Short customer identifier, e.g. AYE-001',
    '  --customer-name  <string>      Full customer name, e.g. "Ahmet Yilmaz Emlak"',
    '  --fingerprint    <hex64>       64-char lowercase hex machine fingerprint',
    '  --plan           <string>      License plan: standard | pro | trial',
    '',
    'Optional:',
    '  --expires        <YYYY-MM-DD>  Expiry date (normalizes to T23:59:59.999Z)',
    '                                 Omit for a perpetual license',
    '  --features       <list>        Comma-separated feature flags',
    '  --seats          <n>           Number of seats (default: 1)',
    '  --out-dir        <path>        Output directory (default: issued-licenses/)',
    '  --key-path       <path>        Path to private key (default: keys/private.pem)',
    '  --dry-run                      Print license JSON, do not write file',
    '',
    'Example:',
    '  node scripts/license-issuer.js \\',
    '    --customer-id AYE-001 \\',
    '    --customer-name "Ahmet Yilmaz Emlak" \\',
    '    --fingerprint a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1 \\',
    '    --plan standard \\',
    '    --expires 2027-06-01 \\',
    '    --features cloud-sync,excel-export',
  ].join('\n'));
}

// ── parseArgs ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  const raw  = argv.slice(2);

  if (raw.includes('--help') || raw.includes('-h')) {
    args.help = true;
    return args;
  }

  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i];
    if (!tok.startsWith('--')) continue;
    const key  = tok.slice(2);
    const next = raw[i + 1];

    if (key === 'dry-run') {
      args.dryRun = true;
    } else if (next !== undefined && !next.startsWith('--')) {
      args[camelize(key)] = next;
      i++;
    } else {
      args[camelize(key)] = true;
    }
  }

  return args;
}

// ── validatePayloadInput ───────────────────────────────────────────────────────

function validatePayloadInput(args) {
  const errors = [];

  if (!args.customerId)   errors.push('--customer-id is required');
  if (!args.customerName) errors.push('--customer-name is required');
  if (!args.fingerprint)  errors.push('--fingerprint is required');
  if (!args.plan)         errors.push('--plan is required');

  if (args.customerId && !CUSTOMER_ID_RE.test(args.customerId)) {
    errors.push('--customer-id may only contain letters, numbers, underscore, hyphen, and dot');
  }

  if (args.fingerprint && !FINGERPRINT_RE.test(args.fingerprint)) {
    errors.push('--fingerprint must be exactly 64 lowercase hex characters');
  }

  if (args.plan && !ALLOWED_PLANS.includes(args.plan)) {
    errors.push(`--plan must be one of: ${ALLOWED_PLANS.join(', ')}`);
  }

  let seats = 1;
  if (args.seats !== undefined && args.seats !== null && args.seats !== true) {
    const raw = String(args.seats);
    if (!SEATS_RE.test(raw) || parseInt(raw, 10) < 1) {
      errors.push('--seats must be a positive integer >= 1');
    } else {
      seats = parseInt(raw, 10);
    }
  }

  let expiresAt = null;
  if (args.expires) {
    if (!DATE_RE.test(args.expires)) {
      errors.push('--expires must be in YYYY-MM-DD format');
    } else {
      const [y, m, d] = args.expires.split('-').map(Number);
      const utc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      if (utc.getUTCFullYear() !== y || utc.getUTCMonth() + 1 !== m || utc.getUTCDate() !== d) {
        errors.push('--expires is not a valid calendar date');
      } else if (utc.getTime() <= Date.now()) {
        errors.push('--expires must be a future date');
      } else {
        expiresAt = `${args.expires}T23:59:59.999Z`;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, expiresAt, seats };
}

// ── buildPayload ───────────────────────────────────────────────────────────────

function buildPayload(args, expiresAt, seats) {
  const pkg        = loadPackageJson();
  const appId      = (pkg.build && pkg.build.appId) || 'com.kiratakippro.customer';
  const appVersion = pkg.version || '0.0.0';
  const features   = args.features
    ? args.features.split(',').map(f => f.trim()).filter(Boolean)
    : [];
  if (seats === undefined) seats = args.seats ? parseInt(String(args.seats), 10) : 1;

  return {
    schemaVersion:      '1',
    appId,
    product:            'KiraTakipPro',
    appVersion,
    plan:               args.plan,
    customerName:       args.customerName,
    customerId:         args.customerId,
    keyId:              KEY_ID,
    machineFingerprint: args.fingerprint,
    issuedAt:           new Date().toISOString(),
    expiresAt,
    perpetual:          expiresAt === null,
    features,
    seats,
    licenseId:          crypto.randomUUID(),
  };
}

// ── canonicalizePayload ────────────────────────────────────────────────────────

function canonicalizePayload(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
  return JSON.stringify(sorted);
}

// ── signPayload ────────────────────────────────────────────────────────────────

function signPayload(canonicalJson, privateKeyPem) {
  const sig = crypto.sign('sha256', Buffer.from(canonicalJson, 'utf8'), privateKeyPem);
  return sig.toString('base64url');
}

// ── issueLicense ───────────────────────────────────────────────────────────────

function issueLicense(args) {
  const validation = validatePayloadInput(args);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const keyPath = path.resolve(args.keyPath || path.join('keys', 'private.pem'));
  let privateKeyPem;
  try {
    privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  } catch {
    return { ok: false, errors: [
      `Private key not found: ${keyPath}`,
      'Run the key generation command in keys/README.md first.',
    ]};
  }

  let keyObj;
  try {
    keyObj = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
  } catch {
    return { ok: false, errors: [`Invalid private key at: ${keyPath}`] };
  }
  if (keyObj.asymmetricKeyType !== 'ec') {
    return { ok: false, errors: [`Private key must be an EC key (ECDSA P-256), got: ${keyObj.asymmetricKeyType}`] };
  }
  const curve = keyObj.asymmetricKeyDetails && keyObj.asymmetricKeyDetails.namedCurve;
  if (curve !== 'prime256v1') {
    return { ok: false, errors: [`Private key curve must be P-256 (prime256v1), got: ${curve}`] };
  }

  let payload, canonical, signature;
  try {
    payload   = buildPayload(args, validation.expiresAt, validation.seats);
    canonical = canonicalizePayload(payload);
    signature = signPayload(canonical, privateKeyPem);
  } catch (e) {
    return { ok: false, errors: [`Signing failed: ${e.message}`] };
  }

  const licenseJson = JSON.stringify({ payload, signature }, null, 2);
  const filename    = `${payload.customerId}-${payload.licenseId.slice(0, 8)}.ktplicense`;

  if (args.dryRun) {
    return { ok: true, dryRun: true, licenseJson, filename, payload };
  }

  const outDir = path.resolve(args.outDir || 'issued-licenses');
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, licenseJson, 'utf8');
    return { ok: true, dryRun: false, outPath, filename, payload };
  } catch (e) {
    return { ok: false, errors: [`Failed to write license file: ${e.message}`] };
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const result = issueLicense(args);

  if (!result.ok) {
    for (const err of result.errors) console.error(`❌ ${err}`);
    process.exit(1);
  }

  if (result.dryRun) {
    console.log('--- DRY RUN — no file written ---');
    console.log(result.licenseJson);
    console.log(`--- Filename would be: ${result.filename} ---`);
  } else {
    const p = result.payload;
    console.log('✅ License issued');
    console.log(`   License ID:   ${p.licenseId}`);
    console.log(`   Customer:     ${p.customerName} (${p.customerId})`);
    console.log(`   Plan:         ${p.plan}`);
    console.log(`   Machine:      ${p.machineFingerprint}`);
    console.log(`   Issued:       ${p.issuedAt}`);
    console.log(`   Expires:      ${p.expiresAt ?? 'perpetual'}`);
    console.log(`   Features:     ${p.features.length ? p.features.join(', ') : '(none)'}`);
    console.log(`   Output:       ${result.outPath}`);
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = { parseArgs, buildPayload, canonicalizePayload, signPayload, issueLicense, validatePayloadInput };
