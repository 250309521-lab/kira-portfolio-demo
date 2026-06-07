# KiraTakipPro — Key Rotation Procedure

_Internal developer/owner documentation only. Do not distribute to customers._

---

## 1. Scope and Warning

This document is for the internal developer and owner only. It must not be sent to customers
or referenced in customer-facing communications.

**Key rotation is a high-risk, owner-approved operation.** It affects every active customer
license and every app build in the field. A rotation performed incorrectly can lock customers
out of the app until a corrective build and new license can be delivered.

This document:

- Defines when rotation is required and when it is not.
- Defines procedures for key loss, key leak, and planned rotation.
- Defines customer migration, app build migration, and communication policy.
- Does **not** perform any key generation, rotation, or implementation.
- Does **not** implement CH-4C.

A real key rotation requires:
1. Separate explicit owner approval.
2. A controlled execution checklist derived from this document.
3. A dedicated session with no other concurrent changes.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Private key** | The ECDSA P-256 secret key used to sign license files. Held only by the license issuer machine. Never leaves the issuing environment. |
| **Public key** | The ECDSA P-256 public key embedded in the app binary. Used by the verifier to confirm a license was signed by the holder of the private key. |
| **Production signing key** | The currently active private key used to issue licenses to real customers. |
| **Old key** | The keypair in use before a rotation event. May be compromised (leak) or simply superseded (planned rotation). |
| **New key** | The freshly generated keypair that will replace the old key after rotation. |
| **Active app build** | The version of KiraTakipPro currently installed by customers. Contains the embedded public key it trusts. |
| **Migration window** | The period during which both old and new app builds may coexist in the field and customers are being migrated to the new build. |
| **Reissued license** | A new license file for an existing customer, signed by the new private key, with a new license ID. Replaces the customer's existing license. |
| **Cutover date** | The date after which the old key is considered fully retired and no old-key licenses will be accepted by the new app build. |
| **Emergency rotation** | A rotation triggered by a security event (leak or suspected leak). Requires immediate action; timeline is compressed. |
| **Planned rotation** | A scheduled rotation with a defined migration window. No active security event; triggered by policy or upgrade. |

---

## 3. When Key Rotation Is Required

Key rotation is required in these situations:

- **Private key leaked or suspected leaked** — any exposure to an untrusted party, including
  accidental paste, screenshot, email, or cloud storage.
- **Private key accidentally committed to git** — even if the commit is removed from HEAD,
  git history retains it and must be treated as compromised.
- **Private key accidentally shared** — sent via chat, email, shared drive, or any channel.
- **Private key lost with no recoverable backup** — future licenses cannot be issued; a new
  keypair is required.
- **Public key embedding strategy changed** — if the embedded public key format or location
  changes in a way that requires a new app build anyway, the rotation can be combined.
- **Planned security upgrade** — periodic rotation as a security hygiene policy.
- **Signing identity migration** — moving from one issuing machine or environment to another.

---

## 4. When Key Rotation Is NOT Required

The following situations do not require key rotation. Each has an existing workflow:

| Situation | Correct workflow |
|---|---|
| Customer changes computer | Issue replacement license for new fingerprint — normal license issue |
| Wrong fingerprint was issued | Issue corrected license for correct fingerprint — normal license issue |
| License expired | Issue renewed license with updated expiry — normal license issue |
| License file lost | Resend or reissue license for same fingerprint — normal license issue |
| Customer asks for renewal | Issue renewed license with updated expiry — normal license issue |
| Normal emergency temporary license needed | Issue short-expiry license — see `docs/emergency-license-procedure.md` |

The private key is unchanged in all of these cases. Do not conflate license management
operations with key rotation.

---

## 5. Private Key Lost Procedure

Use this procedure when `keys/private.pem` is no longer accessible and cannot be
reconstructed.

### Immediate actions

- [ ] Stop issuing any new licenses. The missing key cannot be used and no replacement
      should be issued under an unknown or reconstructed key.
- [ ] Do not delete the `keys/public.pem` file — existing licenses still validate against
      the old public key in the current app build.
- [ ] Existing licenses held by customers remain valid for the lifetime of the current
      app build. Customers are not immediately locked out.

### Recovery assessment

- [ ] Determine whether the private key is recoverable from an offline encrypted backup.
- [ ] If a backup exists: restore the key securely to the issuing machine. Verify the
      restored key produces a valid signature against the known public key before resuming
      license issuance. Update and verify the backup chain.
- [ ] If no backup exists: proceed to new keypair generation (a separate controlled step
      requiring explicit approval). The existing app build and existing licenses remain
      operational during the transition period.

### New keypair path (if backup does not exist)

- [ ] Generate a new keypair — this is a separate, explicit, owner-approved step, not
      performed here.
- [ ] Build a new app version embedding the new public key.
- [ ] Reissue all active customer licenses under the new private key (see Section 11).
- [ ] Distribute the new app build and new licenses to all active customers.
- [ ] Define a cutover date after which the old app build is no longer supported.
- [ ] Record the incident in the rotation log (see Section 14).

---

## 6. Private Key Leaked Procedure

Use this procedure when the private key has been exposed or is suspected to have been exposed
to any untrusted party. Treat all suspected leaks as confirmed leaks until disproven.

### Immediate actions

- [ ] Stop using the compromised key immediately. Do not issue any further licenses with it.
- [ ] Do not delete the compromised key yet — preserve it for incident investigation and
      evidence.
- [ ] Isolate the compromised key file. Remove it from any active issuing environment after
      preserving a copy for evidence.

### Incident investigation

- [ ] Identify the leak source. Check all of:
  - git log and git history for accidental commits
  - Email sent and received
  - Chat logs (Slack, WhatsApp, email)
  - Shared drives and cloud storage
  - Screen share recordings or screenshots
  - CI/CD logs or build output
  - Any file-sharing services
- [ ] Determine exposure scope: who may have received the key, when, and in what form.
- [ ] Preserve internal evidence — do not destroy records until the incident is closed.
- [ ] Do not notify customers about cryptographic details. Use customer-safe language
      (see Section 12).

### Rotation actions

- [ ] Generate a new keypair — a separate, explicit, owner-approved step.
- [ ] Build a new app version embedding the new public key.
- [ ] Reissue all active customer licenses under the new private key (see Section 11).
- [ ] Define a cutover date. After the cutover date, the old public key must be rejected
      by the new app build.
- [ ] Notify customers of the required update — use customer-safe language (see Section 12).
- [ ] Record the incident and full remediation in the rotation log (see Section 14).

### Trust revocation

After all customers have migrated to the new app build:

- [ ] Remove any trust in the old public key from the app.
- [ ] Confirm no new licenses can be issued under the old key.
- [ ] Archive the old public key for audit purposes only.

---

## 7. Planned Rotation Procedure

Use this procedure for a scheduled, non-emergency rotation.

### Pre-rotation

- [ ] Owner approval documented.
- [ ] Migration window chosen — sufficient lead time for all customers to update.
- [ ] Communicate plan internally before any execution.

### Execution

- [ ] Generate new keypair — a separate, explicit, owner-approved step not performed here.
- [ ] Decide dual-key strategy: will the new app build temporarily accept both old and new
      public keys during the migration window, or only the new key?
  - Accepting both: lower customer disruption, higher implementation complexity, migration
    window has defined end date.
  - Accepting only new key: simpler verifier, requires coordinated same-day cutover for all
    customers.
- [ ] Build and test the new app version.
- [ ] Reissue all active customer licenses under the new private key (see Section 11).
- [ ] Notify customers (see Section 12 and 13).

### Close-out

- [ ] Confirm all active customers have migrated.
- [ ] Set and enforce cutover date.
- [ ] Remove old public key trust from app after cutover.
- [ ] Record completed rotation in rotation log.

---

## 8. Key Generation Policy

Key generation is a separate, explicit, controlled step that requires owner approval before
execution. It is not performed as part of this document.

The following rules apply whenever key generation is carried out:

- Use Node.js `crypto` module to generate an ECDSA P-256 keypair, consistent with the
  algorithm used in CH-4B (`prime256v1`).
- Write the private key to `keys/private.pem` on the issuing machine only.
- Write the public key to `keys/public.pem` on the issuing machine.
- Confirm `keys/*.pem` is listed in `.gitignore` before writing any key file.
- Verify `git status --ignored --short keys/` shows `keys/*.pem` files as ignored (`!!`), not untracked (`??`) or staged/tracked.
- Back up the private key to **at least two offline encrypted locations** immediately after
  generation. Examples: encrypted USB drive, encrypted archive on a separate machine.
- Never paste the private key into any chat, email, ticket, log file, documentation, or
  screenshot.
- Never commit the private key to git.
- The public key may be embedded in the app build only through the CH-4C implementation
  plan — not directly or manually.

**Future controlled command template — do not run now:**

The following is a reference for what key generation will look like when carried out as a
separate approved step. It is shown here for planning purposes only.

```
# Future controlled step — requires explicit owner approval before running
node -e "
const { generateKeyPairSync } = require('crypto');
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
require('fs').writeFileSync('keys/private.pem', privateKey, { mode: 0o600 });
require('fs').writeFileSync('keys/public.pem', publicKey);
console.log('Keys written. Verify gitignore immediately.');
"
```

This command must not be run until the owner explicitly authorizes key generation as a
named, documented step separate from this documentation.

---

## 9. Public Key Embedding Strategy Considerations

The public key must be embedded in the app binary for the CH-4C verifier to validate
licenses without any external call. The final embedding strategy is a CH-4C implementation
planning decision. The following options are presented for planning purposes only.

### Option A — Hardcoded public key string

The PEM string (or a derived form) is included directly in `src/license-verifier.js` as a
JavaScript string constant.

| | |
|---|---|
| **Pros** | Simple. No additional file read. Cannot be replaced by swapping an asset file. Easy to audit in source. |
| **Cons** | Requires source change and new build to rotate. PEM string is visible in plain text in source. |

---

### Option B — Asar-packed asset

The public key is stored as a file (e.g. `assets/public.pem`) bundled inside the Electron
`.asar` archive. The verifier reads it at startup.

| | |
|---|---|
| **Pros** | No source change required to rotate — only the asset file changes. Separation of key material from logic. |
| **Cons** | `.asar` can be extracted; key is accessible to a determined user. Slightly more complex read path. Must ensure the asset read is main-process-only. |

---

### Option C — Build-time injection

A build script reads `keys/public.pem` and injects its content into the source or a build
artifact before packaging. The verifier uses the injected value.

| | |
|---|---|
| **Pros** | Clean separation: source code never contains the key literal. Easy to rotate by re-running the build. |
| **Cons** | Build pipeline is more complex. Requires the build environment to have access to `keys/public.pem`. Injection point must be carefully secured. |

---

### Recommendation for v6_customer

Option A (hardcoded string) is the most auditable and simplest choice for a small-team,
single-product deployment with infrequent rotation. The rotation cost (source change + new
build) is low given the expected customer base size and the operational nature of key
rotation.

**Final choice belongs to CH-4C implementation planning.** This recommendation is a starting
point, not a decision.

---

## 10. App Build Migration Strategy

When a rotation produces a new key, the active app build in the field trusts the old public
key. A new app build trusting the new public key must reach all customers.

### Migration models

**Model 1 — Immediate cutover (new key only)**

The new app build trusts only the new public key. All customers must update to the new build
and import their new license before the cutover date. After the cutover date, old licenses
and old builds are no longer supported.

- Risk: customers who do not update before cutover are locked out until they update.
- Benefit: simpler verifier — no dual-key logic.
- Suitable for: small, managed customer base where support can contact each customer
  directly.

**Model 2 — Migration window (dual key, time-limited)**

The new app build temporarily accepts both old and new public keys. Customers can update at
their own pace within the migration window. After the migration window closes, the old key
trust is removed.

- Risk: dual-key logic must be implemented and tested carefully. Migration window creates
  temporary complexity.
- Benefit: lower customer disruption. Customers can migrate without a hard deadline.
- Suitable for: larger or less-managed customer bases.

### Recommendation for v6_customer

For the current early-customer v6 deployment, Model 1 (immediate cutover) is appropriate.
The customer base is small and manageable; support can contact each customer individually.
A short but well-communicated transition period (7–14 days) is sufficient.

### Cutover criteria

Cutover may be declared complete when:

- [ ] All active customers have confirmed successful activation with new license and new build.
- [ ] No open support tickets reference the old key or old licenses.
- [ ] Old key is retired from the issuing environment.
- [ ] Rotation log is complete and owner has signed off.

---

## 11. License Reissue Workflow During Rotation

After a new keypair is generated, all active customer licenses must be reissued.

### Reissue checklist

- [ ] Identify the complete active customer list. Include all customers with valid
      non-expired licenses.
- [ ] For each customer: confirm the current machine fingerprint is on file and correct.
      If the fingerprint may have changed, request a fresh one from the customer before
      reissuing.
- [ ] Issue a new license for each customer under the new private key using
      `scripts/license-issuer.js`.
- [ ] Do not use the old compromised or lost key for any reissue.
- [ ] Record the new license ID for each customer.
- [ ] Map old license ID to new license ID in the rotation log.
- [ ] Bundle the new app installer/build and the new license file together for delivery.
- [ ] Send to each customer individually — do not broadcast a single license to multiple
      customers.
- [ ] Confirm each customer has successfully activated with the new license and new build.
- [ ] Mark each customer's migration status in the rotation log.

---

## 12. Customer Communication Policy

When communicating with customers about a key rotation event:

**Do not mention:**
- Private key, public key, ECDSA, cryptographic algorithm.
- Key rotation, signing identity, or any internal technical terminology.
- Details of a security incident beyond what is legally required.
- Source file names, CLI tools, or internal workflows.

**Use customer-safe language such as:**
- "A security update requires a license refresh."
- "Your license file needs to be updated to continue working with the new version of the app."
- "Please install the new version of KiraTakipPro and import the new license file we have
  attached."

**Always include:**
- Clear, numbered installation steps (same as `docs/customer-license-installation.md`).
- The new app installer or a download link placeholder.
- The new `.ktplicense` file as an attachment.
- Support contact details for questions.
- A deadline if one applies (keep it reasonable — minimum 7 days).

**Tone:**
- Do not use alarming language unless legally required.
- Frame it as a routine update, not a security failure, unless legal obligations require
  otherwise.

---

## 13. Customer Message Templates

### Planned security update / license refresh

> Hello [Customer Name],
>
> We are releasing an important security update for KiraTakipPro. As part of this update,
> your license file needs to be refreshed.
>
> **What you need to do:**
> 1. Download and install the new version of KiraTakipPro: **[installer download link]**
> 2. When the activation screen appears, click "Import license."
> 3. Select the new license file attached to this email: **[filename].ktplicense**
> 4. The app will open normally.
>
> **Please complete this update by [cutover date].**
>
> If you have any questions or need assistance, contact us at [support contact].
>
> Best regards,
> [Support Name]

---

### Urgent security update

> Hello [Customer Name],
>
> An urgent update is required for your KiraTakipPro installation. Please install the new
> version and import the attached license file as soon as possible.
>
> **Steps:**
> 1. Install the new version: **[installer download link]**
> 2. Open the app. When the activation screen appears, click "Import license."
> 3. Select the attached file: **[filename].ktplicense**
>
> **This update is required by [cutover date].** After this date, the previous version will
> no longer be supported.
>
> Please contact us immediately if you have any difficulty: [support contact]
>
> Best regards,
> [Support Name]

---

### New app build plus new license

> Hello [Customer Name],
>
> Attached is your updated license file: **[filename].ktplicense**
>
> You will also need to install the latest version of KiraTakipPro:
> **[installer download link]**
>
> **Installation steps:**
> 1. Install the new version using the link above.
> 2. Open the app. The activation screen will appear.
> 3. Click "Import license" and select the attached file.
> 4. The app will open normally.
>
> Your rental data and records are not affected by this update.
>
> If you need help, contact us at [support contact].
>
> Best regards,
> [Support Name]

---

### Follow-up reminder before cutover

> Hello [Customer Name],
>
> This is a reminder that your KiraTakipPro license update is due by **[cutover date]**,
> which is [N] days away.
>
> If you have already updated, thank you — no further action is needed.
>
> If you have not yet updated, please install the new version and import your new license
> file (sent in our previous email) before the deadline.
>
> If you need the license file resent or have questions, reply to this message or contact
> us at [support contact].
>
> Best regards,
> [Support Name]

---

### Confirmation after successful migration

> Hello [Customer Name],
>
> Thank you for updating KiraTakipPro. Your license is active and your account is fully
> migrated.
>
> No further action is required. Your rental records and data are unchanged.
>
> If you notice any issues, contact us at [support contact].
>
> Best regards,
> [Support Name]

---

## 14. Rotation Issue Log Template

Keep rotation log entries in a secure internal tracking file. Do not store in the repository
or any customer-accessible system.

### Rotation event header

| Field | Value |
|---|---|
| **Rotation event date** | `YYYY-MM-DD` |
| **Rotation type** | Lost / Leaked / Planned |
| **Old key identifier** | Public key fingerprint or description if available |
| **New key identifier** | Public key fingerprint or description |
| **Approved by** | Owner name |
| **Migration window start** | `YYYY-MM-DD` |
| **Cutover date** | `YYYY-MM-DD` |
| **Operator** | Name of person executing rotation |
| **Incident summary** | Brief description of trigger |

### Per-customer migration log

| Date/time | Customer ID | Customer name | Old license ID | New license ID | App version sent | License sent | Customer confirmed | Operator | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `YYYY-MM-DD HH:mm` | | | | | | Yes / No | Yes / No | | |

Add one row per customer. Mark "Customer confirmed" only after the customer has reported
successful activation with the new build and new license.

---

## 15. Testing and Verification Checklist

Before releasing any build produced during a key rotation:

### Key safety

- [ ] Confirm `keys/private.pem` and `keys/public.pem` are listed in `.gitignore`.
- [ ] Run `git status` — confirm no `keys/*.pem` files appear as tracked or untracked.
- [ ] Run `git log --all -- keys/private.pem` — confirm no commits contain the private key.
- [ ] Confirm no private key material appears in any log file, build output, or screenshot.

### Build verification

- [ ] Confirm new public key is embedded only in the intended new app build.
- [ ] Confirm old app build still trusts old public key (if migration window applies).
- [ ] Confirm new app build trusts new public key.

### License verification

- [ ] Verify: a license signed by the new private key passes the new app build verifier.
- [ ] Verify: a license signed by the old private key fails the new app build verifier
      (after cutover — not during dual-key migration window if applicable).
- [ ] Verify: a license with a wrong machine fingerprint fails.
- [ ] Verify: an expired license fails.
- [ ] Verify: a license with an invalid signature fails.

### Operational verification

- [ ] Verify the customer import flow works end to end in the new build.
- [ ] Run all project tests (`npm test`) before release.
- [ ] Confirm no real private key appears in any test output, log, or screenshot.

---

## 16. Rollback Strategy

Key rotation is difficult to reverse once customers have migrated. Plan accordingly.

| Phase | Rollback option |
|---|---|
| **Before any customer migrates** | Pause rollout. Investigate new build issue. Old build and old licenses remain in use. No rollback needed. |
| **During migration window** | Pause rollout. Do not proceed with further customer migrations until issue resolved. Customers who have not yet migrated remain on old build. |
| **After all customers migrated** | Rollback is not practical. An emergency patch build may be required if a critical defect is found. |

Rules:
- Do not delete old issued license records until all customers are confirmed migrated and
  rotation is closed.
- Keep a secure archive of all old license files issued under the old key for audit.
- Do not restore a confirmed-compromised private key to active use under any circumstances.
- If a new build defect is discovered after cutover, issue an emergency patch and communicate
  clearly with affected customers.

---

## 17. Final Cutover Criteria

Rotation is complete and the cutover may be declared when all of the following are satisfied:

- [ ] All active customers have successfully migrated to the new app build.
- [ ] All active customers have successfully imported and activated their new license.
- [ ] New licenses under new key are confirmed working for all migrated customers.
- [ ] No open support tickets remain related to the old key, old build, or old licenses.
- [ ] Old private key is confirmed retired and not in use for any further issuance.
- [ ] Old public key trust removed from app after migration window closes.
- [ ] Per-customer rotation log is complete with "Customer confirmed: Yes" for all entries.
- [ ] Rotation event log is complete with incident summary and remediation notes.
- [ ] Owner has reviewed and signed off on the completed rotation.

---

## 18. Out of Scope

This procedure does not cover:

- Real key generation — this is a separate explicit controlled step requiring owner approval.
- Source code changes to `src/` or `scripts/`.
- Public key embedding implementation — deferred to CH-4C implementation plan.
- Boot gate implementation — deferred to CH-4C implementation plan.
- Activation UI implementation — deferred to CH-4C implementation plan.
- Online license server or remote license validation.
- Payment processing or subscription management.
- AI-assisted license approval or issuance.
- Direct customer data repair or backup recovery.

---

_This document is part of the CH-4C-PREP documentation suite. Key rotation must be
owner-approved and executed as a separate, controlled operation. All license signing
uses `scripts/license-issuer.js` with a valid private key held only on the issuing machine._
