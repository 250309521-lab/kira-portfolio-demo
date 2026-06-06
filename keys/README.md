# keys/ — License Signing Keys

This directory holds the ECDSA P-256 keypair used to sign KiraTakipPro customer licenses.

---

## What is gitignored

```
keys/*.pem          — private and public key files
issued-licenses/    — all issued .ktplicense files
*.ktplicense        — any stray license files
```

`keys/README.md` (this file) is the only file in this directory that is committed.

---

## What CH-4B does and does not do

**CH-4B** adds the license issuer CLI (`scripts/license-issuer.js`) and supporting tests only.
It does **not** embed the public key in the application or add any boot-time license check.

**CH-4C** (a future phase) will embed the public key in the app and add the boot gate.
Until CH-4C is implemented, the app runs without any license enforcement.

---

## One-time key generation

Run this command once, from the project root, **after** CH-4B implementation and tests are
complete and passing. Do not generate real keys before that point.

```
node -e "
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
fs.mkdirSync('keys', { recursive: true });
if (fs.existsSync('keys/private.pem')) {
  console.error('ABORT: keys/private.pem already exists. Delete it manually if you intend to rotate.');
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
});
fs.writeFileSync('keys/private.pem', privateKey, { mode: 0o600 });
fs.writeFileSync('keys/public.pem',  publicKey);
console.log('Keys written to keys/private.pem and keys/public.pem');
console.log('IMPORTANT: Back up keys/private.pem securely now.');
"
```

After running, confirm both files are ignored (not untracked):

```
git status --ignored --short keys/
```

Expected output — both lines must show `!!`, not `??`:

```
!! keys/private.pem
!! keys/public.pem
```

If either shows `??`, stop immediately and review .gitignore before proceeding.

---

## Warnings

**Losing `private.pem` is unrecoverable.**
If the private key is lost, no further licenses can be issued under the same signing identity.
All existing customer licenses remain valid (the public key in the app still verifies them),
but issuing new or replacement licenses requires generating a new keypair and shipping a new
app build that embeds the new public key. Back up `private.pem` to an encrypted, offline
location immediately after generation.

**Leaking `private.pem` is a critical security incident.**
Anyone who obtains the private key can generate unlimited valid-looking licenses for any
machine fingerprint. If leakage is suspected, rotate the keypair immediately: generate a new
pair, re-issue all customer licenses, and ship a new app build with the new public key. Treat
the private key with the same care as a production signing certificate or API master secret.

---

## Public key embedding (deferred to CH-4C)

The public key (`keys/public.pem`) is not committed here. Its embedding strategy —
hardcoded string, asar-packed asset, or build-time injection — will be decided during
CH-4C planning. Do not embed the public key in the app before CH-4C begins.
