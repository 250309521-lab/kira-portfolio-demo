'use strict';
const { execSync } = require('child_process');
const crypto = require('crypto');

function getMachineGuid() {
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

function getMachineFingerprint() {
  const guid = getMachineGuid();
  if (!guid) return null;
  return crypto.createHash('sha256')
    .update(guid + ':KiraTakipPro:v6')
    .digest('hex');
}

module.exports = { getMachineFingerprint };
