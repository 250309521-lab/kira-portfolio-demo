# CH-4C-PREP — Recovery / Support Procedure Plan

_Created: 2026-06-07_
_Status: Planning only. No implementation. No real keys generated._

---

## Overview

This document records all recovery and support procedures that must be defined before
CH-4C boot-time license verification is implemented. CH-4C will introduce a hard boot gate
that blocks the application if license verification fails. Once that gate exists, every failure
path must have a defined, tested recovery workflow — or a paying customer could be locked out
of their own data.

Real key generation (`keys/private.pem`, `keys/public.pem`) is a **separate, later, explicit
controlled step**. It is not performed as part of CH-4C-PREP documentation.

---

## A. Why CH-4C-PREP Is Required Before CH-4C

Four concrete risks demand pre-planning before the boot gate ships:

**1. Customer lockout.**
A machine fingerprint mismatch — caused by hardware change, Windows reinstall, or registry
accident — will produce a boot failure the customer cannot self-resolve. Without a prepared
reissue workflow, support is flying blind and the customer is stuck.

**2. Machine replacement.**
Customers replace hardware. The fingerprint is bound to
`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`, which changes on a new machine or a
Windows reinstall. There is no in-app mechanism to transfer a license; only the developer
can reissue. This path must be pre-defined before the first paying customer exists.

**3. Key rotation.**
If `keys/private.pem` is lost or leaked, all future license operations are compromised. Key
rotation requires: generating a new keypair, re-issuing all existing customer licenses under
the new key, and shipping a new app build that embeds the new public key. This is an
irreversible, time-critical operation. Planning it in advance — not during a security
incident — is essential.

**4. Support surface.**
Once CH-4C is live, support staff need exact scripts: what to ask the customer, what to send
back, what commands to run, what must never be transmitted. Without this, sensitive data
(raw GUID, private key, passwords) may be inadvertently requested or disclosed.

---

## B. Support Scenarios

### Scenario 1 — Customer installs app for the first time
Customer downloads the installer, runs it, opens the app. No license file is present. The boot
gate blocks startup.
- Customer needs: (a) what a license is, (b) how to obtain their machine fingerprint,
  (c) how to send it to support.
- Requires a pre-purchase activation flow to be documented before CH-4C ships.

### Scenario 2 — Customer provides machine fingerprint
Customer opens a "Get my machine ID" screen that calls `getMachineId()` via the
`license:getMachineId` IPC handler, displays the 64-char hex fingerprint, and lets them copy it.
- The fingerprint is `SHA-256(MachineGuid + ':KiraTakipPro:v6')`. Safe to transmit — one-way
  hash. The raw GUID is never exposed.
- Support receives the fingerprint, validates 64 lowercase hex chars, then runs `npm run license:issue`.

### Scenario 3 — Developer issues a license
Developer runs:
```
npm run license:issue -- \
  --customer-id ... \
  --customer-name "..." \
  --fingerprint ... \
  --plan ... \
  --key-path keys/private.pem
```
- Issuer writes a `.ktplicense` file to `issued-licenses/`.
- Developer sends the file to the customer via email or secure download link.
- The raw private key is never transmitted, never logged, never shown to the customer.

### Scenario 4 — Customer imports / places license file
Customer receives the `.ktplicense` file. They use an in-app import dialog that copies the file
into the app data directory. The customer does not need to know the internal file path.
After import, the boot gate reads and verifies the file on next launch.

### Scenario 5 — Customer changes computer
New machine → new `MachineGuid` → new fingerprint. The old license fails the machine-binding check.
- Customer submits new machine fingerprint.
- Support issues a new license with the new fingerprint.
- Old license on old machine remains valid there but cannot be transferred (by design).
- No limit policy on reissues must be decided before CH-4C (recommendation: allow reissues,
  log them, monitor for abuse).

### Scenario 6 — Windows MachineGuid changes or fingerprint changes unexpectedly
`MachineGuid` can change after: Windows reinstall over existing hardware, certain hardware changes
(especially motherboard), third-party sysprep tools, Windows image deployment or clone.
- Symptom: previously working license suddenly fails with "wrong machine" error.
- Resolution: identical to Scenario 5 (reissue with new fingerprint).
- Support must ask for both the old license ID (from the old `.ktplicense`) and the new
  fingerprint, so the reissue can be logged against the same customer record.

### Scenario 7 — Customer loses license file
Customer deleted the file, reformatted, or lost access.
- If the original `.ktplicense` is archived in `issued-licenses/` on the developer machine,
  it can be re-sent.
- If the developer machine was also lost, issue a new license (new `licenseId` UUID assigned;
  this is acceptable).
- Developer machine backup strategy for `issued-licenses/` must be documented.

### Scenario 8 — License expires
Customer is on a time-limited plan (`perpetual: false`). After `expiresAt`, the boot gate
blocks startup.
- Renewal: customer contacts support, new license with updated `--expires` is issued.
- The app should display the expiry date so customers are not surprised.
- A pre-expiry warning banner (14 days before) is strongly recommended.

### Scenario 9 — Wrong machine fingerprint was used
Support issued a license with a typo or wrong fingerprint. Customer gets "wrong machine" on first run.
- Resolution: support reissues with the correct fingerprint. Incorrect license is logged as voided.
- Immediately recoverable — no urgency beyond normal turnaround.

### Scenario 10 — Private key is lost
`keys/private.pem` is deleted, corrupted, or the machine holding it is lost without backup.
- **Critical, irreversible event.** No new licenses can be issued under the current key.
- All existing customer licenses remain valid (the public key in the app still verifies them).
- Required actions: generate a new keypair, re-issue all existing customer licenses under the
  new key, ship a new app build that embeds the new public key.
- Requires a full CH-4C re-deployment cycle.
- Prevention: the private key must be backed up to at least two offline, encrypted locations
  immediately after generation.

### Scenario 11 — Private key is leaked
Someone obtains `keys/private.pem` (e.g. accidentally committed to git, posted publicly, sent
by mistake).
- An attacker can generate unlimited valid-looking licenses for any machine fingerprint.
- Required actions (all urgent): rotate the keypair immediately, ship a new app build with
  new public key, re-issue all customer licenses under new key, treat old key as fully
  compromised.
- The old public key must be removed from all future builds; licenses signed with the old key
  must be rejected by new app builds.

### Scenario 12 — Public key must be rotated (planned)
Planned rotation (not emergency). Steps are identical to Scenario 11 but with a defined timeline.
- A version of the app embedding the new public key must ship before the old key is revoked.
- Existing customers must be migrated: issued new licenses, notified, given time to update.
- This is a major support event. Rotation should be rare — ideally only Scenarios 10 or 11
  trigger it.

### Scenario 13 — Customer needs emergency temporary license
Customer is blocked and needs to work immediately; the full reissue cycle takes time.
- Issue a short-expiry license (7–30 days) to unblock immediately.
- A permanent replacement license is issued in parallel and sent when ready.
- Uses the same `--customer-id` and new fingerprint, standard `--expires` flag.
- No special code path needed. An emergency license is just a short-expiry license.

### Scenario 14 — Customer is offline
The v6_customer app is entirely offline — no activation server, no call-home.
- A customer on an air-gapped machine can receive their `.ktplicense` via USB or email
  on another device.
- The verifier reads only local state (the file and the machine fingerprint). No connectivity needed.
- License import must function without internet access.

### Scenario 15 — Customer accidentally deletes app data / backups
If the license file shares the same directory as app data, the customer could lose both
simultaneously. The app data backup (`backup:create`) should **not** include the license
file — it is machine-bound and restoring it to a different machine would fail.
- The license is always re-issuable if the developer's `issued-licenses/` archive is intact.
- License recovery is independent of app data recovery.

---

## C. Recovery Workflow Reference

| Scenario | Who Acts | Required Information | Tool / Command | Must Never Expose |
|---|---|---|---|---|
| 1. First install | Dev | Name, ID, fingerprint, plan | `npm run license:issue` | Private key, raw GUID |
| 2. Fingerprint submission | Customer → Support | 64-char hex fingerprint | Copy from app UI | Raw MachineGuid |
| 3. Issue license | Dev | customer-id, name, fingerprint, plan, optional expires | `npm run license:issue` | private.pem path, key content |
| 4. Customer imports | Customer | `.ktplicense` file | In-app import dialog | Nothing — customer handles own file |
| 5. Machine replacement | Customer → Dev | New fingerprint, old license ID | Re-run `license:issue` | Raw GUID |
| 6. Unexpected fingerprint change | Customer → Dev | New fingerprint, old license ID, app version | Re-run `license:issue` | Raw GUID |
| 7. Lost license file | Dev | Customer ID; re-send or re-issue | Retrieve from archive or re-run | Nothing sensitive |
| 8. License expired | Customer → Dev | Customer ID, fingerprint confirmation | Re-run `license:issue` with new `--expires` | Private key |
| 9. Wrong fingerprint | Dev | Correct fingerprint (re-confirmed) | Re-run `license:issue` | Private key |
| 10. Private key lost | Dev (urgent) | Full customer list from `issued-licenses/` archive | New keypair + re-issue all + new build | New private key location |
| 11. Private key leaked | Dev (urgent) | Same as Scenario 10 | Rotate immediately, rebuild, re-issue all | Source of leak (internal investigation only) |
| 12. Planned rotation | Dev | Customer list, migration timeline | Rotate, re-issue, ship new build with overlap window | Schedule |
| 13. Emergency temp license | Dev → Customer | New fingerprint, short window | `npm run license:issue -- ... --expires YYYY-MM-DD` | Private key |
| 14. Offline customer | Dev / Customer | `.ktplicense` file, physical delivery | Standard issue + USB/email delivery | Nothing |
| 15. App data wiped | Dev | Confirm customer identity; re-send or re-issue | Re-send from archive or re-issue | Nothing |

---

## D. Required Support Documentation

The following documents must be created and committed before CH-4C implementation begins:

| File | Audience | Contents |
|---|---|---|
| `docs/ch4c-prep-recovery-plan.md` | Developer (this file) | All planning, scenarios, policies |
| `docs/customer-license-installation.md` | Customer-facing | Plain-language activation guide: what a license is, how to get fingerprint, how to import |
| `docs/licensing-support.md` | Internal developer/support | All 15 scenarios in checklist form, exact CLI commands, what to collect, what never to ask |
| `docs/emergency-license-procedure.md` | Internal developer/support | When to issue emergency license, max duration, tracking, follow-up |
| `docs/key-rotation-procedure.md` | Developer only | When to rotate, exact step-by-step, rollback, customer migration |

---

## E. CH-4C Prerequisites

All of the following must be completed and confirmed before CH-4C implementation begins:

1. **Support documentation committed** — minimum: this file, plus the four docs listed in Section D.
2. **Real key generation** — production `keys/private.pem` and `keys/public.pem` generated in a
   separate, explicit, controlled step (not as part of documentation commits). Private key
   backed up to at least two offline encrypted locations. `git status --ignored --short keys/`
   must confirm both files show `!!`, not `??`.
3. **Public key embedding strategy decided** — exactly one of: hardcoded string in source,
   asar-packed asset, or build-time injection. Decision recorded before any verifier code is written.
4. **License file location confirmed** — where the app looks for the `.ktplicense` file fixed
   before the verifier is written (see Section F for recommendation).
5. **Failure behavior policy approved** — Section G behaviors reviewed and confirmed.
6. **Grace / emergency mode policy approved** — Section H recommendation reviewed and confirmed.
7. **Emergency license policy confirmed** — format, maximum duration, and tracking process agreed.
8. **Backup / re-issue policy confirmed** — whether issued licenses are archived, re-issue rate
   policy, and whether `issued-licenses/` is separately backed up.
9. **Expiry warning policy confirmed** — whether the app shows a warning N days before expiry
   (recommendation: 14 days) and what the warning UI looks like.
10. **Test suite passing** — `node src/tests/run.js` passes 0 failures on HEAD immediately
    before CH-4C implementation begins.

---

## F. License File Location Strategy

### Options

**Option 1 — App data directory (`app.getPath('userData')`)**
File lives alongside `electron-store` data in the OS-managed user data folder.
- Pro: automatic, consistent, no user path knowledge needed.
- Con: same failure domain as app data — wiping app data also removes the license.
  Backup restores may overwrite a valid license with an old one.

**Option 2 — User-selected import, copied into app data (one-time import dialog)**
Customer receives the file, opens an in-app import dialog, app copies it to `{userData}/license/`
and holds it permanently.
- Pro: explicit, auditable import event; customer needs no path knowledge; survives normal
  operation cleanly.
- Con: same failure domain as Option 1 once copied; if `userData` is wiped, re-import needed.

**Option 3 — Same directory as app executable**
License file sits next to the `.exe`.
- Pro: obvious location; survives app data wipes; portable.
- Con: write-protected in `Program Files` for standard users on NSIS installs. Inconsistent
  across NSIS and portable build types.

**Option 4 — Portable-mode local folder (sibling to exe)**
A `licenses/` folder next to the portable executable.
- Pro: self-contained; good for portable deployments.
- Con: only viable for portable builds; incompatible with NSIS installer layout.

### Recommendation: Option 2

For v6_customer with both NSIS and portable targets, **Option 2 is recommended**:
- The import dialog provides an explicit, logged activation event.
- The file is copied to `{userData}/license/active.ktplicense` — app owns the path, no user
  needs to know it.
- Recovery: if the file is lost, support re-sends the `.ktplicense` and the customer re-imports.
- `{userData}` is isolated from `Program Files` — no elevation required.
- The main app data backup (`backup:create`) must **exclude** the license file. The license is
  a machine-bound credential, not app data. It should be treated as re-issuable, not backed up.

**Resolved path:** `{app.getPath('userData')}/license/active.ktplicense`

---

## G. Failure Behavior Policy

Defines intended app behavior for each verification failure. Not yet implemented.

| Failure Condition | Intended Behavior |
|---|---|
| **License file missing** | Show activation screen. Block app data. Show "Import license" button and "Get machine fingerprint" display. |
| **Invalid JSON / parse error** | Show: "License file is damaged. Please contact support." Offer re-import. Do not silently delete the file. |
| **Signature verification fails** | Show: "License signature is invalid. This license was not issued by KiraTakipPro." Block app. Offer support contact. |
| **Wrong machine fingerprint** | Show: "This license is registered to a different machine." Display first 8 chars of licensed fingerprint and current fingerprint for comparison. Offer support contact. |
| **License expired** | Show: "Your license expired on [date]." Block app. Offer renewal contact. If within grace warning window, show banner but allow launch. |
| **Unsupported schema version** | Show: "This license format is not supported by this version of KiraTakipPro. Please update the app or contact support." Block app. |
| **Public key missing or corrupt** | Show: "Application integrity error. Please reinstall KiraTakipPro." Log internally. Block app. (This is an app build failure, not a customer issue.) |
| **System clock detectably wrong** | Show warning: "Your system clock may be incorrect. License expiry checks require an accurate clock." Allow launch with warning. |
| **Machine fingerprint unavailable** (null from `getMachineFingerprint()`) | Show warning: "Machine identity could not be determined." If in grace period: allow with warning. Otherwise: block and offer support contact. |

---

## H. Grace Mode / Emergency Mode Recommendation

### Recommendation: Two-layer approach

**Layer 1 — Pre-expiry warning banner (14 days before `expiresAt`):**
From 14 days before expiry, show a persistent dismissible banner: "Your license expires on [date].
Contact support to renew." App operates normally. No grace period at the expiry boundary —
expiry is expiry.

**Layer 2 — Emergency support override license:**
For lockout scenarios (wrong machine, expired, lost file), support issues a short-expiry
emergency license (7–30 days) using the standard `--expires` flag. This is a normal license,
not a special bypass. No additional code path in the verifier is needed.

**Layer 3 — Backup-only fallback (optional, deferred):**
If a valid license cannot be produced within the emergency window, a read-only mode that allows
backup creation but blocks all write operations. Prevents data loss even in a complete licensing
failure. Defer to a later UI phase.

### Do not implement:
- Auto-extending grace timers that reset on each run.
- Any license bypass via config file or environment variable.
- Soft warnings that allow indefinite continued use without a valid license.

---

## I. Security Boundaries

### What support must NEVER ask a customer to send:
- `keys/private.pem` (the private signing key) — support never needs it; customer does not
  have it; if they somehow do, that is a security incident.
- The raw `MachineGuid` value from the Windows registry — only the hashed 64-char fingerprint
  is needed.
- Their PIN or management account password.
- Their full data backup file, unless diagnosing a data-specific issue unrelated to licensing.
- Any file from `%APPDATA%\KiraTakipPro` beyond the `.ktplicense` file itself.
- Contents of `electron-store` config files.

### What support can safely ask for:
- The 64-char hex **machine fingerprint** (SHA-256 hash — raw GUID is not recoverable from it).
- The **customer ID** (assigned by developer, not a secret).
- The **license ID** (`licenseId` UUID from inside the `.ktplicense` — safe to read, not a secret).
- The **app version** (from About screen or window title).
- A **screenshot of the activation error message** (no private data if error UI is properly designed).
- The `issuedAt` and `expiresAt` values from the license (safe — visible in the JSON file).
- An **exported diagnostic text** if added in a future phase, provided it is audited to contain
  no private data.

### Design constraint for CH-4C error UI:
Error messages shown to the customer must display only: first 8–16 chars of fingerprint (enough
for comparison, not enough to be sensitive), the license ID, and the failure reason. Must never
display: full fingerprint, signature, raw GUID, internal file paths, or stack traces.

---

## J. CH-4C Implementation Scope Preview

High-level outline only. No code. Decisions not yet finalized.

**Verifier module (`src/license-verifier.js` or similar):**
Pure Node.js module, main-process only. Reads the license file, parses JSON, verifies signature,
checks machine binding, checks expiry, returns a structured result object. No side effects.
Testable in isolation.

**License file read:**
Reads from `{userData}/license/active.ktplicense` (resolved via `app.getPath('userData')` in
main process). Returns parse error if file is missing, unreadable, or not valid JSON. Path is
never passed from renderer.

**Signature verification:**
`crypto.verify('sha256', Buffer.from(canonicalJson), embeddedPublicKey, sigBuffer)`.
The embedded public key is loaded from a hardcoded string or asar-packed asset (embedding
strategy decided in prerequisites).

**Machine binding check:**
Calls `getMachineFingerprint()`, compares against `payload.machineFingerprint`. Exact match
required. Null return from `getMachineFingerprint()` triggers the unavailability policy
(Section G).

**Expiry check:**
If `payload.perpetual === false`, compare `Date.now()` against
`new Date(payload.expiresAt).getTime()`. If expired, return failure. If within 14 days of
`expiresAt`, return success with a pre-expiry warning flag.

**Boot gate:**
Called from `main.js` before creating the `BrowserWindow`. If verifier returns failure, the
main window is not created. A minimal error window is shown with the failure message and support
contact information.

**Safe error UI:**
Minimal HTML window shown when boot gate blocks. Contains: plain-language error message,
machine fingerprint (first 16 chars), license ID if available, support contact, and an
"Export data backup" button.

**Recovery / export fallback:**
The "Export data backup" button on the error UI must invoke the backup handler without
launching the main application. This requires the backup IPC handler to be available before
the main window is created. This is an architectural implication for CH-4C that must be
resolved during implementation planning.

---

## K. Out of Scope

Explicitly excluded from CH-4C and from this planning document:

- Online activation or license server — the app is entirely offline; no call-home.
- Server-side license database or revocation list — no server infrastructure.
- Payment enforcement — licensing is a delivery mechanism, not a payment gateway.
- Code obfuscation, Electron fuses, or code signing — separate concern, deferred or out of scope.
- Multi-device seat enforcement — `seats` field exists in the payload but enforcement requires
  a server; not in scope for offline v6_customer.
- Automatic key rotation — rotation is a manual, developer-initiated operation.
- AI-assisted license generation or verification — no AI involvement in the licensing pipeline.
- Direct database mutation to bypass the boot gate — this is a threat model item, not a feature.

---

## L. Recommended Documentation Commits (CH-4C-PREP)

In suggested order, documentation commits only:

1. `docs: add CH-4C-PREP recovery and support procedure plan` — this file (`docs/ch4c-prep-recovery-plan.md`)
2. `docs: add customer license installation guide` — `docs/customer-license-installation.md`
3. `docs: add licensing support runbook` — `docs/licensing-support.md`
4. `docs: add emergency license procedure` — `docs/emergency-license-procedure.md`
5. `docs: add key rotation procedure` — `docs/key-rotation-procedure.md`
6. Real key generation — a separate, explicit, controlled step performed outside of this
   documentation commit sequence, with its own verification checklist.

No source code is touched in any of these commits.

---

## M. Sign-Off Criteria for CH-4C-PREP

CH-4C implementation may not begin until all of the following are confirmed:

- [ ] `docs/ch4c-prep-recovery-plan.md` committed (this file)
- [ ] `docs/customer-license-installation.md` committed
- [ ] `docs/licensing-support.md` committed
- [ ] `docs/emergency-license-procedure.md` committed
- [ ] `docs/key-rotation-procedure.md` committed
- [ ] Real keypair generated in a separate, explicit controlled step — `keys/private.pem` and
      `keys/public.pem` exist on the developer machine, private key backed up to at least two
      offline encrypted locations, and `git status --ignored --short keys/` confirms both files
      show `!!` (not `??`)
- [ ] Public key embedding strategy decided and recorded
- [ ] License file location confirmed (`{userData}/license/active.ktplicense` or alternative)
- [ ] Failure behavior policy (Section G) approved
- [ ] Grace / emergency mode policy (Section H) approved
- [ ] Security boundary rules (Section I) confirmed
- [ ] `node src/tests/run.js` passes 0 failures on HEAD immediately before CH-4C begins
- [ ] `node src/tests/integrity.js` passes on HEAD immediately before CH-4C begins
- [ ] No uncommitted changes to source app files at CH-4C start
