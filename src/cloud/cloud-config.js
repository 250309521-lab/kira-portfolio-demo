'use strict';

const path = require('path');
const fs   = require('fs');

// Load .env.local for local dev only.
// In a packaged asar the file won't exist, so this block is always skipped in production.
// OS env vars already set take precedence (CI build env wins over .env.local).
const _envLocalPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(_envLocalPath)) {
  try {
    fs.readFileSync(_envLocalPath, 'utf8')
      .split('\n')
      .forEach(function(line) {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        var eq = line.indexOf('=');
        if (eq < 1) return;
        var key = line.slice(0, eq).trim();
        var val = line.slice(eq + 1).trim();
        if (key && !process.env[key]) process.env[key] = val;
      });
  } catch (_) {}
}

// Production fallback — used when .env.local is absent (packaged asar builds).
// The publishable key is not a secret; it is designed to be shipped in client code.
// Local dev: .env.local overrides via process.env (line 21 above).
// CI/CD: OS env vars override (process.env takes precedence per line 21).
var _PROD_URL = 'https://xhyfbkhddcosapkhtoyb.supabase.co';
var _PROD_KEY = 'sb_publishable_o9wp0R_kw36ceoIX1Om6HA_q607ZQV3';

// Test seam — undefined means inactive; any other value (including '') overrides all sources.
var _testUrl = undefined;
var _testKey = undefined;

function _setConfigForTests(url, key) { _testUrl = url; _testKey = key; }
function _resetConfigForTests()       { _testUrl = undefined; _testKey = undefined; }

function getSupabaseUrl() {
  if (_testUrl !== undefined) return _testUrl;
  return process.env.SUPABASE_URL || _PROD_URL;
}

function getSupabaseAnonKey() {
  if (_testKey !== undefined) return _testKey;
  return process.env.SUPABASE_PUBLISHABLE_KEY || _PROD_KEY;
}

// Lazy — must only be called after app.ready (inside IPC handlers, not at module load).
function getCloudAuthPath() {
  return path.join(require('electron').app.getPath('userData'), 'cloud-auth.enc');
}

function getCloudDevicePath() {
  return path.join(require('electron').app.getPath('userData'), 'cloud-device.enc');
}

function isConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

// Safe headers for Supabase REST API. The anon key is publishable — not a secret.
// Authorization bearer header is NOT included here; cloud-auth.js adds it per-request.
function getBaseHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': getSupabaseAnonKey(),
  };
}

module.exports = {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getCloudAuthPath,
  getCloudDevicePath,
  isConfigured,
  getBaseHeaders,
  _setConfigForTests,
  _resetConfigForTests,
};
