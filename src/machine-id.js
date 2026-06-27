'use strict';
const { execSync } = require('child_process');
const crypto = require('crypto');

// ── Windows: MachineGuid from Registry ────────────────────────────────────────
function getMachineGuidWin32() {
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { timeout: 3000, encoding: 'utf8', windowsHide: true }
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// ── macOS: IOPlatformUUID via ioreg ───────────────────────────────────────────
// The IOPlatformUUID is tied to the hardware board; stable across reboots/
// OS upgrades; available without root; supported by Apple since macOS 10.x.
// Command output example:
//   "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
function getMachineGuidDarwin() {
  try {
    const out = execSync(
      'ioreg -rd1 -c IOPlatformExpertDevice',
      { timeout: 4000, encoding: 'utf8', windowsHide: true }
    );
    const m = out.match(/"IOPlatformUUID"\s*=\s*"([0-9A-F-]{36})"/i);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// ── Cross-platform entry point ─────────────────────────────────────────────────
// Returns the raw OS identifier for the current platform (or null on failure).
// Never logged or exposed outside this module.
function _getRawMachineId() {
  const platform = process.platform;
  if (platform === 'win32')  return getMachineGuidWin32();
  if (platform === 'darwin') return getMachineGuidDarwin();
  // Other platforms (linux, freebsd, …): unsupported for dogfood scope.
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────
// Returns a 64-char lowercase hex fingerprint, or null when the OS identifier
// is unavailable (licenseGuard will return fingerprint_unavailable).
// The salt ':KiraTakipPro:v6' is kept the same across platforms so the hash
// algorithm is consistent; but because each platform's raw ID is different, a
// macOS fingerprint and a Windows fingerprint issued for the same machine GUID
// value would differ — licenses are always per-device anyway.

function getMachineFingerprint() {
  const id = _getRawMachineId();
  if (!id) return null;
  return crypto.createHash('sha256')
    .update(id + ':KiraTakipPro:v6')
    .digest('hex');
}

module.exports = { getMachineFingerprint };
