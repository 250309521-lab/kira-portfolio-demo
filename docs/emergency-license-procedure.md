# KiraTakipPro — Emergency License Procedure

_Internal use only. Not customer-facing. Do not share externally._

---

## 1. Scope and Warning

This document is for internal developer and support use only. It is not distributed to
customers.

**Emergency licenses are normal signed licenses with a short expiry date.** They are issued
using the same `scripts/license-issuer.js` CLI, signed with the same private key, bound to
the same machine fingerprint, and validated by the same verifier logic as any other license.

**There is no bypass mode.**
**There is no support override switch.**
**There is no config flag, environment variable, or registry value that disables license
checking.**

Emergency license means: a valid, machine-bound, short-lived license issued quickly to
unblock a customer while a permanent resolution is prepared.

This document does not generate real keys, issue real licenses, or contain real customer data.
Command examples use placeholders only. All command examples are text — do not execute them
from this document.

---

## 2. When Emergency Licenses Are Allowed

An emergency license may be issued when a legitimate customer is blocked from app access and
the situation qualifies for rapid intervention:

| # | Situation | Notes |
|---|---|---|
| 1 | **Wrong fingerprint was issued** — correction requires time | Happens when customer provided an outdated fingerprint |
| 2 | **Customer changed computer urgently** — needs access while replacement license is prepared | Standard computer change, unplanned timing |
| 3 | **License expired** — renewal is approved but paperwork is in progress | Approval must exist before issue |
| 4 | **Lost license file** — archive retrieval or reissue is delayed | Identity must be confirmed |
| 5 | **Customer blocked from app access** — cause confirmed, permanent fix is in progress | Root cause known, resolution path defined |
| 6 | **Support continuity** — permanent replacement is being prepared and customer cannot wait | Must have clear resolution timeline |

In all cases, a permanent resolution path must be defined before issuing an emergency license.

---

## 3. When Emergency Licenses Are NOT Allowed

Do not issue an emergency license in any of the following situations:

- Customer has not purchased or renewed and no written approval exists from the owner.
- Customer is requesting multi-device usage outside their plan or policy.
- Customer refuses to provide their machine fingerprint.
- Customer is asking to bypass machine binding or activation entirely.
- Support cannot confirm the customer's identity (name, customer ID).
- Suspected fraud, license sharing, or misuse (see Section 14).
- A private key leak or security incident is in progress — emergency license must not be
  issued until owner approves and the incident scope is understood.
- Customer is attempting to extend an already-running emergency license without escalation.

If in doubt, do not issue. Escalate to owner.

---

## 4. Approval Policy

All emergency licenses require documented approval before issue. The approval level depends
on the duration requested:

| Duration | Approval Required |
|---|---|
| 7 days | Support / developer approval |
| 14 days | Developer approval recommended; owner awareness preferred |
| 30 days | **Owner approval required** |
| > 30 days | **Not allowed.** Issue a normal license instead. |

Approval must be recorded in the issue log (see Section 10) before the license is generated.
"I approved it myself" is not sufficient for 30-day requests.

---

## 5. Duration Policy

Recommended emergency license durations:

| Duration | Use case |
|---|---|
| **7 days** | Default urgent unblock — covers most cases |
| **14 days** | Complex support case with longer resolution timeline |
| **30 days** | Maximum. Owner approval required. Use only when resolution timeline is confirmed long. |

Rules:

- Every emergency license **must** include `--expires <YYYY-MM-DD>`.
- Emergency licenses **must never** be perpetual. Always include `--expires` for emergency licenses; never omit `--expires`.
- The expiry date must be a future calendar date in `YYYY-MM-DD` format.
- Do not chain repeated emergency licenses. One extension may be acceptable with escalation;
  repeated requests without resolution require owner review (see Section 13).

---

## 6. Required Customer Information

Collect all of the following before issuing an emergency license:

| Field | Description |
|---|---|
| **Customer name** | Full name or company name as registered |
| **Customer ID** | Assigned identifier (e.g. `CUSTOMER-001`) |
| **Machine fingerprint** | 64-character lowercase hex string from app activation screen |
| **App version** | Shown in About screen or window title |
| **Screenshot** | Screenshot of the activation screen or error message |
| **Reason** | Why emergency access is needed |
| **Resolution path** | What the permanent fix is and when it is expected |

Do not proceed without the machine fingerprint. If the customer cannot provide it, the
emergency license cannot be issued — guide the customer to the activation screen first.

---

## 7. Security Boundaries

Support must **never** request the following from a customer:

- KiraTakipPro PIN or management account password.
- Raw Windows MachineGuid value from the registry.
- Any Windows registry values or system internal files.
- The full app data backup file — unless investigating a separate data issue.
- Private or internal files not related to licensing.
- Any files not specifically required for the licensing process.

Safe to request:

- 64-character machine fingerprint (shown on app activation screen — safe to transmit).
- Customer name and customer ID.
- App version.
- Screenshot of the error or activation screen.
- Expiry date of current/previous license (shown on license status screen).

---

## 8. Emergency License Issue Workflow

Complete each step in order. Do not skip steps.

### Pre-issue checklist

- [ ] Customer identity confirmed (name and customer ID match records).
- [ ] Reason for emergency qualifies under Section 2.
- [ ] Reason is NOT in the exclusion list under Section 3.
- [ ] Duration determined and approved at the appropriate level (Section 4).
- [ ] Machine fingerprint collected — 64 lowercase hex characters confirmed.
- [ ] Fingerprint validated: matches pattern `/^[0-9a-f]{64}$/`.
- [ ] Resolution path defined and documented.

### Dry-run step (mandatory)

Run the dry-run first. Review the output payload before issuing anything real.

See Section 9 for command templates.

Verify the dry-run output payload contains:

- [ ] `customerId` — matches the customer on file.
- [ ] `customerName` — matches the customer on file.
- [ ] `plan` — correct plan for this customer.
- [ ] `machineFingerprint` — matches the fingerprint provided by the customer.
- [ ] `expiresAt` — correct emergency expiry date.
- [ ] `perpetual: false` — confirm this is false. Emergency licenses must never be perpetual.
- [ ] `licenseId` — present (UUID will be auto-generated).

If any field is wrong in the dry-run, stop. Correct the command and re-run dry-run. Do not
issue the real license until the dry-run payload is correct.

### Issue step

- [ ] Dry-run payload verified and correct.
- [ ] Issue the real license (see Section 9 — real issue command template).
- [ ] Confirm `.ktplicense` file was written to `issued-licenses/`.
- [ ] Send `.ktplicense` file to customer by email or secure transfer.
- [ ] Record in issue log (Section 10).
- [ ] Schedule follow-up reminder before expiry (Section 12).

---

## 9. Command Templates

These are text examples only. Do not execute these commands from this document.
Replace all `<placeholders>` with confirmed customer values.

### Dry-run — emergency license

```
npm run license:issue -- \
  --customer-id <customer-id> \
  --customer-name "<customer-name>" \
  --fingerprint <confirmed-fingerprint> \
  --plan standard \
  --expires <YYYY-MM-DD> \
  --dry-run
```

Review the JSON payload printed to console. Confirm all fields before proceeding.

---

### Real issue — emergency license

```
npm run license:issue -- \
  --customer-id <customer-id> \
  --customer-name "<customer-name>" \
  --fingerprint <confirmed-fingerprint> \
  --plan standard \
  --expires <YYYY-MM-DD> \
  --key-path keys/private.pem
```

The `.ktplicense` file will be written to `issued-licenses/`. Send this file to the customer.

---

### Notes on placeholders

| Placeholder | Description |
|---|---|
| `<customer-id>` | Customer identifier from records (e.g. `CUSTOMER-001`) |
| `<customer-name>` | Full name or company name — quote if it contains spaces |
| `<confirmed-fingerprint>` | 64-char hex string confirmed from customer's activation screen |
| `<YYYY-MM-DD>` | Emergency expiry date — must be a future date |

Do not use real customer data or real fingerprints in documentation or examples.

---

## 10. Issue Log Requirements

Every emergency license issued must be recorded. Use the table template below.

### Issue log — markdown table template

| Field | Value |
|---|---|
| **Date/time** | `YYYY-MM-DD HH:mm` |
| **Customer ID** | |
| **Customer name** | |
| **License ID (UUID)** | Shown in issued filename and dry-run output |
| **Plan** | |
| **Expiry date** | `YYYY-MM-DD` |
| **Fingerprint prefix** | First 8 characters of fingerprint only (e.g. `a3f7b2c1`) |
| **Reason** | Brief description |
| **Approval level** | Support / Developer / Owner |
| **Approved by** | Name of approver |
| **Issued by** | Name of operator |
| **Follow-up date** | `YYYY-MM-DD` — set 3–5 days before expiry |
| **Permanent resolution** | Pending / Issued / Not required |
| **Resolution notes** | |

Keep issue log entries in an internal tracking file or system. Do not store in the repository
or in any customer-accessible location.

---

## 11. Customer Message Templates

### Sending the emergency temporary license

> Hello [Customer Name],
>
> Please find your temporary emergency license attached: **[filename].ktplicense**
>
> To install it:
> 1. Save the file to your Downloads folder or Desktop.
> 2. Open KiraTakipPro. The activation screen will appear.
> 3. Click "Import license" and select the file.
> 4. The app should open normally.
>
> **Important:** This license is valid until **[expiry date]**. We are working on your
> permanent license and will be in touch before this date. Please do not delete this
> file until your permanent license is confirmed working.
>
> Best regards,
> [Support Name]

---

### Explaining the temporary duration

> Hello [Customer Name],
>
> Your temporary license is valid for [duration] days, expiring on [expiry date]. This gives
> us time to resolve [brief reason — e.g. "prepare your replacement permanent license"].
>
> We will contact you before the expiry date to ensure continuity. You do not need to do
> anything right now beyond importing the license file.
>
> Best regards,
> [Support Name]

---

### Requesting fingerprint for emergency issue

> Hello [Customer Name],
>
> To issue your temporary license, we need your machine fingerprint. This is a unique code
> shown by the KiraTakipPro app on the activation screen.
>
> **How to find it:**
> 1. Open KiraTakipPro. If no license is installed, the activation screen opens automatically.
> 2. Find the field labelled "Machine fingerprint."
> 3. Click the Copy button next to it.
> 4. Paste it into your reply to this message.
>
> The fingerprint is safe to send. We only need this code — please do not send any other
> system information.
>
> Best regards,
> [Support Name]

---

### Follow-up before expiry

> Hello [Customer Name],
>
> This is a reminder that your temporary license expires on **[expiry date]**, which is
> [N] days away.
>
> [If permanent license is ready:]
> Your permanent replacement license is attached: **[filename].ktplicense**
> Please import it following the same steps as before. Once confirmed working, your temporary
> license will naturally expire — no action needed on your part.
>
> [If permanent license is not yet ready:]
> We are still working on your permanent license. We will send it to you shortly. If you
> have any urgent questions, please reply to this message.
>
> Best regards,
> [Support Name]

---

### Replacing emergency license with permanent license

> Hello [Customer Name],
>
> Your permanent license is now ready and is attached: **[filename].ktplicense**
>
> Please import it in KiraTakipPro:
> 1. Open KiraTakipPro.
> 2. Go to the license/activation screen (if the app is running normally, use the license
>    menu or settings — this will be shown in the app).
> 3. Click "Import license" and select the new file.
> 4. Confirm the app opens normally.
>
> Your temporary license will expire on [date] — the permanent license replaces it. You do
> not need to do anything with the temporary license file.
>
> Please let us know if you have any issues importing the permanent license.
>
> Best regards,
> [Support Name]

---

## 12. Follow-Up Procedure

After issuing an emergency license, complete the following follow-up steps:

### Follow-up checklist

- [ ] Set a calendar reminder or follow-up date **3–5 days before the emergency license
      expires**.
- [ ] Confirm with the customer that the emergency license was imported successfully.
- [ ] Track the root cause resolution — is the permanent license in progress?
- [ ] When the permanent license is ready, issue it using the standard process and send to
      the customer.
- [ ] Confirm with the customer that the permanent license is working.
- [ ] Mark the emergency license entry in the issue log as resolved.
- [ ] Confirm the customer is no longer relying on the emergency license after its expiry.

Do not allow a customer to reach the expiry date without a confirmed permanent solution or
explicit decision about next steps.

---

## 13. Repeated Emergency Requests

**One emergency license is acceptable** in most cases given a clear reason and resolution path.

If a customer requests a second emergency license:

- Investigate why the root cause was not resolved after the first emergency license.
- Escalate to owner before issuing a second emergency license.
- Document the investigation result in the issue log.
- Do not issue a second emergency license without explicit owner approval.

If a customer requests a third or more emergency licenses, or has a pattern of recurring
emergency requests:

- Do not issue without owner review.
- Investigate possible misuse or license sharing.
- Consider whether a permanent license arrangement is appropriate.
- Do not chain emergency licenses indefinitely as a substitute for proper licensing.

---

## 14. Fraud and Abuse Indicators

Treat the following as red flags requiring escalation before any license is issued:

| Indicator | Risk |
|---|---|
| Different machine fingerprints submitted repeatedly without a clear computer change explanation | Possible multi-device usage or fingerprint fishing |
| Multiple customers or accounts sharing the same fingerprint | License sharing |
| Multiple customer accounts sharing the same `.ktplicense` file | License sharing / policy violation |
| Customer refuses to provide identity details (name, customer ID) | Cannot verify entitlement |
| Screenshots inconsistent with the claimed app version | Possible spoofing |
| Request to activate a large number of machines | Policy violation / unauthorized distribution |
| Customer explicitly asks to "bypass" machine binding or activation | Activation bypass attempt |
| Suspicious or shared email accounts with no business context | Identity risk |
| Repeated claims of "lost fingerprint" or "changed computer" in short intervals | Possible pattern abuse |

If any indicator is present, escalate to owner. Do not issue any license — temporary or
permanent — until the situation is reviewed.

---

## 15. Relationship with CH-4C Boot Gate

The CH-4C verifier treats an emergency license as any other valid signed license:

- It verifies the ECDSA signature against the embedded public key.
- It checks that `machineFingerprint` matches the current machine.
- It checks that `expiresAt` is in the future.
- It checks that `perpetual` matches the expiry logic.

**No special verifier logic is needed for emergency licenses.**
**No bypass code should be added to CH-4C for emergency handling.**
**No environment variable or flag should skip verification.**

Emergency license handling is entirely operational — it is managed by the support/developer
issuing a correctly formed, signed, short-expiry license. The verifier does not know or care
that a license is "emergency"; it only checks that the license is valid.

---

## 16. Out of Scope

This procedure does not cover:

- Online activation or license server infrastructure.
- Payment processing or subscription management.
- Changes to app source code (`src/`, `scripts/`).
- Key generation (`keys/private.pem`, `keys/public.pem`).
- Key rotation — see `docs/key-rotation-procedure.md` (when available).
- Boot gate implementation — see CH-4C implementation plan.
- Activation UI implementation — see CH-4C implementation plan.
- Public key embedding into the app binary.
- App data repair or backup recovery.
- AI-based or automated license approval.

---

_This document is part of the CH-4C-PREP documentation suite. It covers operational
emergency response only. All licensing must be issued through the normal
`scripts/license-issuer.js` CLI with a valid private key._
