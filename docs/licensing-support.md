# KiraTakipPro — Internal Licensing Support Runbook

_Audience: Developer / internal support staff only._
_Last updated: 2026-06-07_

---

## 1. Scope and Warning

**This document is internal.** Do not send it to customers as-is. Customer-facing guidance
is in `docs/customer-license-installation.md`.

**Assumptions:**
- The CH-4B license issuer CLI exists at `scripts/license-issuer.js` and is accessible via
  `npm run license:issue`.
- A production `keys/private.pem` exists on the issuing machine (generated in a separate,
  explicit controlled step — not as part of this documentation).
- CH-4C boot-time verification is not yet implemented. This runbook covers the support
  workflow for when it is live.

**This document does not:**
- Generate real keys.
- Implement CH-4C.
- Modify any source code.

---

## 2. Safe Information to Request from Customer

These items are safe to ask the customer to provide:

| Item | Notes |
|---|---|
| **Customer name** | Full name or business name as registered |
| **Customer ID** | Short identifier assigned at issue time (e.g. `AYE-001`) |
| **App version** | From the About screen or window title bar |
| **Machine fingerprint** | 64-char lowercase hex string from the app activation screen |
| **License ID** | UUID shown on the activation/license status screen, or inside the `.ktplicense` file |
| **Screenshot of activation error** | Plain screenshot — no sensitive data if the error UI is correct |
| **Expiry date** | If visible on the license status screen |
| **What changed** | e.g. "new computer", "Windows reinstall", "moved to laptop" |

---

## 3. Information Support Must Never Request

- Customer PIN or management account password — support never needs these.
- Raw Windows registry values or the raw `MachineGuid` value — only the hashed machine
  fingerprint shown by the app is needed.
- Private or internal app files (e.g. `electron-store` config, app data directory contents).
- Full app data backup (`.ktpbackup`) — only request this if diagnosing a separate, explicit
  data-recovery issue unrelated to licensing.
- Any file not specifically required to resolve the ticket.

If a customer volunteers any of the above, do not store or process it. Acknowledge receipt,
discard it, and explain what is actually needed.

---

## 4. Standard License Request Workflow

### Checklist

- [ ] Confirm customer identity: name and customer ID (or collect name if first issue).
- [ ] Ask customer to open the app, navigate to the activation screen, and copy the
      **machine fingerprint** (64-char hex string).
- [ ] Validate fingerprint format: must be exactly 64 characters, lowercase `a–f` and `0–9`.
      If wrong length or non-hex chars present, ask the customer to copy again carefully.
- [ ] Confirm plan: `standard`, `pro`, or `trial`.
- [ ] Confirm expiry decision: perpetual, or specify an end date (`YYYY-MM-DD` format,
      must be a future date).
- [ ] **Run dry-run first** and verify the JSON output looks correct before writing a file.
- [ ] Run the real issue command only after the dry-run output is confirmed.
- [ ] Send the `.ktplicense` file to the customer by email or secure link.
- [ ] Record the issue in the license issue log (Section 16).

### Command templates

**Dry-run (verify before issuing):**
```
npm run license:issue -- \
  --customer-id AYE-001 \
  --customer-name "Ahmet Yilmaz Emlak" \
  --fingerprint a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1 \
  --plan standard \
  --dry-run
```
Inspect the printed JSON. Confirm `customerId`, `machineFingerprint`, `plan`, `expiresAt`,
and `perpetual` are all correct before proceeding.

**Perpetual license:**
```
npm run license:issue -- \
  --customer-id AYE-001 \
  --customer-name "Ahmet Yilmaz Emlak" \
  --fingerprint a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1 \
  --plan standard \
  --key-path keys/private.pem
```
Omitting `--expires` produces a perpetual license (`perpetual: true`, `expiresAt: null`).

**Time-limited (expiring) license:**
```
npm run license:issue -- \
  --customer-id AYE-001 \
  --customer-name "Ahmet Yilmaz Emlak" \
  --fingerprint a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1a3f7b2c1 \
  --plan standard \
  --expires 2027-06-01 \
  --key-path keys/private.pem
```
The expiry date normalises to `T23:59:59.999Z` automatically.

---

## 5. First Install / New Customer Workflow

### Checklist

- [ ] Collect: customer name, assigned customer ID, plan, perpetual vs. expiry decision.
- [ ] Ask customer to open the app and send their machine fingerprint from the activation screen.
- [ ] Validate fingerprint: 64 lowercase hex chars.
- [ ] Run dry-run. Review output.
- [ ] Issue license (real command).
- [ ] Send `.ktplicense` file to customer with a brief note directing them to the
      `customer-license-installation.md` guide (or its published equivalent).
- [ ] Record in issue log.
- [ ] Follow up after 24–48 hours to confirm successful import.

---

## 6. Replacement License Workflow — New Computer

### Checklist

- [ ] Ask customer for the **new machine fingerprint** from the activation screen of the
      new computer.
- [ ] Ask for old customer ID and, if available, old license ID.
- [ ] Confirm whether the old computer is still in use (information only — does not affect
      issuance, since the old license is machine-bound and cannot be used on the new machine
      anyway).
- [ ] Run dry-run with new fingerprint.
- [ ] Issue replacement license with new fingerprint.
- [ ] Send replacement `.ktplicense` to customer.
- [ ] In the issue log: record the new license, set `Action = reissued`, add a note
      referencing the old license ID, and mark the old license record `Action = voided`.
- [ ] Confirm with customer that the new license imports successfully.

---

## 7. Wrong Fingerprint Issued Workflow

### Checklist

- [ ] Identify the incorrect license from the issue log (by license ID or customer ID).
- [ ] Ask the customer to carefully copy the machine fingerprint again from the activation
      screen. Ask them to copy using the in-app Copy button, not by typing.
- [ ] Compare newly provided fingerprint against the one used in the incorrect license.
- [ ] Run dry-run with corrected fingerprint.
- [ ] Issue corrected license.
- [ ] Send corrected `.ktplicense` to customer.
- [ ] In the issue log: record the corrected license, set `Action = reissued`, add a note
      with the incorrect fingerprint prefix, and mark the wrong license `Action = voided`.
- [ ] Customer communication: frame this as "here is your updated license" — do not expose
      the internal error or use language that implies fault.

---

## 8. Lost License File Workflow

### Checklist

- [ ] Check the `issued-licenses/` archive for the customer's original `.ktplicense` file
      (match by customer ID or license ID).
- [ ] If found and the machine fingerprint has not changed: re-send the original file.
      Record `Action = reissued (resend)` in the log.
- [ ] If the archive is unavailable, or the customer's machine fingerprint has changed:
      issue a new license using the current fingerprint.
      Record `Action = reissued (new)` in the log.
- [ ] Send the file to the customer with instructions to import (reference the customer guide).
- [ ] Confirm import success.

---

## 9. Expired License / Renewal Workflow

### Checklist

- [ ] If payment/renewal eligibility depends on an external process, confirm that first
      before issuing a new license.
- [ ] Ask customer to confirm their customer ID and machine fingerprint (fingerprint may
      have changed if machine was replaced since last issue).
- [ ] Decide: new expiry date or upgrade to perpetual.
- [ ] Run dry-run with updated expiry / perpetual settings.
- [ ] Issue renewal license.
- [ ] Send `.ktplicense` to customer.
- [ ] In the issue log: record `Action = renewed`, note old license ID if known, record
      new expiry or perpetual flag.
- [ ] Confirm import success.

> The app shows a 14-day pre-expiry warning banner. If a customer contacts support after
> that warning appears, treat as a standard renewal — not an emergency.

---

## 10. Emergency Temporary License Workflow

Use only when a customer is blocked from using the app and normal resolution (waiting for
correct fingerprint, pending renewal payment, etc.) may take more than a few hours.

### Checklist

- [ ] Confirm the customer is genuinely blocked (activation screen / cannot open app).
- [ ] Decide duration: 7 days (minimum), 14 days (standard), 30 days (maximum recommended).
- [ ] Use the standard `--expires` flag. No bypass mode exists or is needed.
- [ ] Run dry-run first.
- [ ] Issue emergency license.
- [ ] Send to customer with explicit note: "This is a temporary license valid until [date].
      We will send your permanent replacement shortly."
- [ ] In the issue log: record `Action = emergency`, note planned follow-up date.
- [ ] **Schedule follow-up** to issue the permanent license before the emergency one expires.
- [ ] Issue permanent replacement and send before emergency license expires.

### Emergency command template

```
npm run license:issue -- \
  --customer-id AYE-001 \
  --customer-name "Ahmet Yilmaz Emlak" \
  --fingerprint <confirmed-fingerprint> \
  --plan standard \
  --expires YYYY-MM-DD \
  --key-path keys/private.pem
```
Replace `YYYY-MM-DD` with a date 7–30 days from today.

---

## 11. Offline Customer Workflow

### Checklist

- [ ] Customer can open the app on the offline computer and read the machine fingerprint
      from the activation screen. If the offline computer has no display, they can
      photograph the screen.
- [ ] Customer sends the fingerprint to support from another device (phone, another
      computer, email on a connected device).
- [ ] Issue license using the standard workflow (Section 4).
- [ ] Deliver the `.ktplicense` file:
  - By email: customer downloads on a connected device and transfers by USB.
  - By USB directly: copy file to USB, hand to customer.
- [ ] Customer imports the file following the standard flow (Section 3 of customer guide).
- [ ] No internet connection is required by the app at any point during import or verification.

---

## 12. Machine Identity Unavailable Workflow

This occurs when the app cannot read the computer's unique identifier and displays
"Machine identity could not be determined."

### Checklist

- [ ] Ask customer to restart the computer and reopen KiraTakipPro.
- [ ] Ask for a screenshot of the exact error message.
- [ ] If the problem persists after a restart: escalate to the developer.
- [ ] Do **not** ask the customer to open the Windows Registry or any system tools.
- [ ] Do not attempt to issue a license until the fingerprint is available and confirmed
      from the app's activation screen.
- [ ] If the app cannot display a fingerprint after escalation: treat as a developer-level
      bug. Do not issue a license until a fingerprint is confirmed working.

---

## 13. Private Key Lost — Escalation Procedure

> This section documents the escalation path only. Real key generation is a separate,
> explicit controlled step performed by the developer/owner with its own checklist.
> Do not generate keys based on this section alone.

### Immediate actions

- [ ] Stop issuing new licenses under the missing key. Do not attempt to issue licenses
      without a confirmed working private key.
- [ ] Confirm: all existing customer licenses remain valid. The app's embedded public key
      has not changed; issued licenses will still verify correctly until a new build ships.
- [ ] Escalate to developer/owner immediately.

### Resolution path (developer-level)

- A new keypair must be generated in a separate, controlled step.
- A new app build embedding the new public key must be prepared.
- All existing customer licenses must be re-issued under the new key.
- Customers must be notified and given the new app build before the migration cutover.
- See `docs/key-rotation-procedure.md` for the full rotation checklist.

---

## 14. Private Key Leaked — Security Incident Procedure

> Treat this as a critical security incident.

### Immediate actions

- [ ] Stop using the compromised key immediately. Do not issue any further licenses with it.
- [ ] Identify the source of the leak (git history, email, accidental log, etc.).
  - Check `git log --all --full-diff -- keys/private.pem` to confirm key was never committed.
  - Check email sent items, shared drives, messaging apps.
- [ ] Escalate to developer/owner immediately.
- [ ] Do not attempt to suppress or minimise the incident internally.

### Resolution path (developer-level)

- Rotate the keypair: generate a new private/public keypair in a separate, controlled step.
- Build a new version of the app that embeds the new public key and rejects signatures from
  the old key.
- Re-issue all existing customer licenses signed with the new key.
- Notify customers that an app update is required and send replacement licenses.
- Set a cutover date after which the old app build is unsupported.
- See `docs/key-rotation-procedure.md` for the full rotation checklist.

### After resolution

- Document how the leak occurred and what controls were added to prevent recurrence.
- The private key must never be committed to git. Confirm `.gitignore` is correct:
  `keys/*.pem` must be listed.

---

## 15. Public Key Rotation — Support Workflow

This applies to both emergency (key leak/loss) and planned rotation scenarios.
The developer-level procedure is in `docs/key-rotation-procedure.md`.

### Support role during rotation

- [ ] Prepare the customer communication: explain that an app update is required and that
      a new license file will accompany it. Do not explain cryptographic reasons; say
      "a security update requires a license refresh."
- [ ] Coordinate with developer on the migration window: the period during which both the
      old and new app builds are in circulation.
- [ ] For each customer on record: issue a new license under the new key and send with
      the new app installer.
- [ ] Track which customers have received the new license and confirmed the update.
- [ ] After the cutover date, stop supporting the old app build.
- [ ] Close rotation tickets only after every active customer is confirmed on the new build
      with a working new license.

---

## 16. License Issue Log Template

Maintain a record of all license operations. Store securely — this log contains customer
identifiers and partial fingerprints.

```markdown
| Date/Time (UTC)      | Customer ID | Customer Name         | License ID (UUID)                    | Plan     | Perpetual / Expiry | Fingerprint prefix | Action    | Operator | Notes                          |
|----------------------|-------------|-----------------------|--------------------------------------|----------|--------------------|--------------------|-----------|----------|--------------------------------|
| 2026-06-07 10:00:00  | AYE-001     | Ahmet Yilmaz Emlak    | 3f2a1b4c-...                         | standard | perpetual          | a3f7b2c1           | issued    | dev      | First issue                    |
| 2026-06-08 14:30:00  | AYE-001     | Ahmet Yilmaz Emlak    | 9d1e5f7a-...                         | standard | perpetual          | c9d4e2f1           | reissued  | dev      | New computer; old 3f2a1b4c voided |
| 2026-06-10 09:15:00  | AYE-001     | Ahmet Yilmaz Emlak    | 3f2a1b4c-...                         | —        | —                  | a3f7b2c1           | voided    | dev      | Replaced by 9d1e5f7a           |
```

**Column definitions:**

| Column | Notes |
|---|---|
| Date/Time | UTC timestamp of the operation |
| Customer ID | Short identifier (e.g. `AYE-001`) |
| Customer Name | Full customer name |
| License ID | Full UUID from the issued `.ktplicense` payload |
| Plan | `standard`, `pro`, or `trial` |
| Perpetual / Expiry | `perpetual` or the `expiresAt` date string |
| Fingerprint prefix | First 8 characters of `machineFingerprint` only — enough to identify without storing the full value |
| Action | `issued`, `reissued`, `renewed`, `emergency`, `voided` |
| Operator | Name or initials of the support/developer who performed the action |
| Notes | Free text: reason, cross-references to replaced license ID, follow-up required |

---

## 17. Customer Response Templates

Use these as starting points. Adjust for the specific customer and situation.

---

### Asking for machine fingerprint

> Hello [Customer Name],
>
> To issue your license, I need your machine fingerprint — a unique identifier for your
> computer generated by KiraTakipPro itself.
>
> To get it:
> 1. Open KiraTakipPro. The activation screen will appear automatically.
> 2. Find the "Machine fingerprint" field and click the Copy button next to it.
> 3. Paste it in your reply to this message.
>
> This code is safe to send and does not expose any personal or system data.
>
> Thank you.

---

### Sending a new license

> Hello [Customer Name],
>
> Please find your KiraTakipPro license file attached: **[filename].ktplicense**
>
> To install it:
> 1. Save the attached file to your Downloads folder or Desktop.
> 2. Open KiraTakipPro. The activation screen will appear.
> 3. Click "Import license" and select the file.
> 4. The app will open normally if the license is valid.
>
> Please keep this email as a backup in case you ever need to reinstall.
> If you have any trouble, reply to this message and I will help.
>
> Best regards,
> [Support Name]

---

### Explaining wrong-machine error

> Hello [Customer Name],
>
> Your license is currently registered to a different computer. This can happen if you
> installed the app on a new machine, or if Windows was reinstalled on your computer.
>
> To issue a replacement license for your current machine, I need the machine fingerprint
> shown by the app on your current computer. Please open KiraTakipPro, copy the
> fingerprint from the activation screen, and send it to me.
>
> Once I have it, I will send a replacement license promptly.
>
> Best regards,
> [Support Name]

---

### Explaining expired license

> Hello [Customer Name],
>
> Your KiraTakipPro license expired on [expiry date]. To continue using the app, your
> license needs to be renewed.
>
> Please reply to confirm your customer ID and the machine fingerprint shown on the
> activation screen. Once confirmed, I will issue your renewal license and send it to you.
>
> Best regards,
> [Support Name]

---

### Confirming replacement license after computer change

> Hello [Customer Name],
>
> Your replacement license for your new computer is attached: **[filename].ktplicense**
>
> Please import it following the same steps as your original license:
> 1. Save the file to your Downloads folder or Desktop.
> 2. Open KiraTakipPro — the activation screen will appear.
> 3. Click "Import license" and select the new file.
> 4. The app will open normally.
>
> Please use the new license file for your new computer. Your previous license was registered to your old computer and will not work on this new machine.
>
> Best regards,
> [Support Name]

---

### Emergency temporary license message

> Hello [Customer Name],
>
> I am sending you a temporary license valid until **[date]** so you can resume working
> immediately. Please import it following the standard steps (save → open app → Import license).
>
> We are preparing your permanent license and will send it before the temporary one expires.
> You will not need to do anything on your end when the permanent license arrives — simply
> import the new file in the same way.
>
> If you have any issues with the temporary license, please reply immediately.
>
> Best regards,
> [Support Name]

---

## 18. Support Checklist Before Closing a Ticket

Before marking a license support ticket as resolved:

- [ ] Customer confirmed the app opens normally after importing the license.
- [ ] License ID recorded in the issue log.
- [ ] Issue log `Action` field updated correctly (`issued`, `reissued`, `renewed`,
      `emergency`, or `voided` as appropriate).
- [ ] Any temporary / emergency license has a follow-up date scheduled in the log notes.
- [ ] No sensitive data (PIN, password, raw MachineGuid, backup files) was received or
      stored during the ticket. If any was received inadvertently, confirm it has been discarded.
- [ ] Customer has the original email or copy of their license as a backup.
- [ ] If machine replacement: old license record marked as voided in the log.
- [ ] If key rotation was involved: confirm the customer is on the new app build and new license.

---

## 19. Out of Scope

The following are explicitly outside the scope of this runbook and must not be attempted
through the support workflow:

- **Online activation or server-side license verification** — the app is fully offline.
- **Payment processing** — handled outside this system.
- **Source code changes** — all changes require a developer build cycle.
- **Real key generation** — a separate, explicit, controlled developer step with its own checklist.
- **Public key embedding** — part of the CH-4C implementation phase, not support.
- **Boot gate implementation or modification** — developer-only, requires a new build.
- **App UI implementation** — developer-only.
- **Direct data repair** — editing `electron-store` data or backup files directly.
- **AI-based support automation** — no automated license issuance.
- **Bypassing or disabling the boot gate** — not possible and must not be attempted.
