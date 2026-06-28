# KiraTakipPro v6 — First Paid Beta Scope Lock (BETA-SCOPE-LOCK-0A)

> **Scope authority:** This document freezes the approved first closed paid beta scope based on the approved commercial roadmap. It is not a product-design decision document. All scope inclusions below have been pre-approved in the `COMMERCIAL-LAUNCH-0A` and `BETA-SCOPE-LOCK-0A-AUDIT` phases.
>
> **Last updated:** 2026-06-28  
> **Baseline commit:** `ce64efe8ef3f956a1180255abd0fb6d26050d70e`

---

## 1. Purpose

This document is the frozen scope contract for the first closed paid beta of KiraTakipPro Customer (Windows desktop app). It prevents feature creep, establishes clear Basic vs Pro boundaries, and sets the must-pass gates before the first paying user can be onboarded.

Any scope change after this document is committed requires an explicit decision, a new document revision, and re-confirmation of all affected blockers.

---

## 2. Product Model

### 2.1 Paid Basic License

A **one-time paid desktop license** that unlocks local app use on one Windows PC (per-device fingerprint binding). The app is **not free**; there is no freemium or free-forever tier.

Basic must continue working after Pro subscription expires, cancels, or is revoked. Local data, local backup, and local restore must always be accessible to any valid Basic license holder.

### 2.2 Optional Pro Subscription

A **recurring monthly or annual subscription** that unlocks cloud features layered on top of Basic. Pro does not replace Basic; it extends it.

### 2.3 No portfolio/agency tiers in first beta

Portfolio and Business tiers are planned but out of scope for the first closed paid beta. A `pro` plan license is the highest tier for beta.

---

## 3. First Closed Paid Beta Target

| Parameter | Target |
|---|---|
| Platform | Windows (x64) — primary |
| Mac | Internal dogfood only (unsigned; not offered to paying customers) |
| Users | ≤30 invited testers |
| Onboarding | Manual — license issued via CLI tool per customer |
| Billing | Manual for beta — payment via invoice, manual license issuance |
| Billing automation | Out of scope for first beta |
| Account portal | Out of scope for first beta |

---

## 4. Basic Paid License Scope

All features below must work correctly with a valid `standard` plan license. They must remain accessible after Pro subscription expires.

| Feature | Status in repo | Notes |
|---|---|---|
| Property / building management | ✅ Implemented | Multi-building; archive supported |
| Unit / tenant management | ✅ Implemented | Active/inactive; role-based edit |
| Rent / payment tracking | ✅ Implemented | Monthly; partial payments; history |
| Expense tracking | ✅ Implemented | Per-building |
| Dashboard / KPI cards | ✅ Implemented | Occupancy, overdue, revenue summary |
| Charts / analytics | ✅ Implemented | Chart.js bundled locally (offline-safe) |
| Local users / PIN (optional) | ✅ Implemented | Admin/manager/viewer roles; PIN optional |
| Onboarding wizard | ✅ Implemented | Skip PIN supported; building setup |
| License gate (boot) | ✅ Implemented | ECDSA-signed, per-device fingerprint |
| Local Backup create | ✅ Implemented | SHA-256 validated; atomic write |
| Local Backup restore | ✅ Implemented | Mandatory pre-restore safety backup |
| Import / export | ✅ Implemented | JSON import; Excel/CSV-style export |
| Settings / About | ✅ Implemented | Language toggle; license status display |
| Recovery / safe-mode | ✅ Implemented | `__KTP_SAFE_MODE__` boot flag |

---

## 5. Pro Subscription Scope

All features below must be hidden and non-functional for `standard` plan users after `PRO-FEATURE-GATING-0A` is complete. They require an active `pro` (or higher) plan subscription.

| Feature | Status in repo | Notes |
|---|---|---|
| Cloud Account login / logout | ✅ Implemented | Session persists; auto-restore on relaunch |
| Cloud Workspace create / activate | ✅ Implemented | Owner/admin/editor roles; viewer read-only |
| Cloud Backup (manual) | ✅ Implemented | Preflight + hash-verified upload |
| Cloud Backup (automatic) | ✅ Implemented | Debounced; boot-gate prevents early trigger |
| Cloud Backup history | ✅ Implemented | List, date, size, trigger label |
| Cloud Backup download / export | ✅ Implemented | File saved to local disk |
| Cloud Backup apply / restore | ✅ Implemented | Owner-only; dual-confirm; mandatory safety backup |
| Protected Cloud Sync V1 (opt-in) | ✅ Implemented | Explicit Enable Sync; readiness + backup + baseline before activation |
| Protected Cloud Sync V1 (push/pull) | ✅ Implemented | CAS-based; whole-workspace snapshot |
| Protected Cloud Sync V1 (conflict UI) | ✅ Implemented | "Use cloud version" / "Keep my version" — explicit only |
| Sync safety backups | ✅ Implemented | pre-sync-pull / pre-keep-mine / pre-sync-enable |
| Sync status UI | ✅ Implemented | Synced / pending / cloud_newer / conflict / paused |
| Sync emergency disable / turn-off | ✅ Implemented | "Turn off Sync" clears marker; immediate gate-off |
| WhatsApp tools | ⚠️ Implemented but gated | Pro feature — ships only after WHATSAPP-BETA-0A (phone normalization fix) |

---

## 6. Internal / Dogfood-Only Scope

The following exist in the codebase but are limited to controlled internal use. They are **not offered to paying customers** in the first beta.

| Item | Reason |
|---|---|
| macOS universal DMG build | Unsigned; requires Gatekeeper bypass; not suitable for paying users |
| `trial` plan licenses | Controlled issuance only; limited to internal testing |
| Two-device sync (dogfood test) | Controlled known-users only; full SYNC-SAFETY-V1-0A required first |
| WhatsApp "Send to All" batch | Phone normalization broken; may trigger multi-popup confusion |
| WhatsApp single-recipient reminders | Turkish 05xx → wa.me fails silently; deferred to WHATSAPP-BETA-0A |

---

## 7. Must-Hide / Deferred Scope

The following must be hidden from users or completely absent in first beta. If they appear in the UI, they must be gated or removed before CLOSED-PAID-BETA-0A.

| Item | Action | Gate |
|---|---|---|
| WhatsApp page and all WA buttons | Hide behind Pro gate + deferred flag | WHATSAPP-BETA-0A |
| Cloud features on `standard` plan | Gate behind `isProUser()` | PRO-FEATURE-GATING-0A |
| Sync opt-in for `standard` plan | Gate behind Pro | PRO-FEATURE-GATING-0A |
| Record-Level Sync V2 | Not started; deferred | SYNC-ARCHITECTURE-V2-0A + RECORD-SYNC-V2-0A |
| Mac public distribution | Mac is internal dogfood only; signing/notarization not configured | Separate future decision |
| Billing / account portal | Manual for beta | WEBSITE-BETA-MVP-0A |
| Portfolio / Business tiers | Not implemented | Future |
| Auto-update | Not configured | CODE-SIGNING-0A or later |
| KVKK / ToS / Refund policy pages | Not started | LEGAL-SUPPORT-0A |

---

## 8. Explicitly Out of Scope for First Closed Paid Beta

- Freemium / free tier
- Record-Level Sync V2
- Mac signed/notarized distribution
- Billing automation (Stripe / iyzico webhooks)
- Account portal (password reset, device management, invoice download)
- Portfolio / Agency / Business tiers
- Multi-user collaborative editing (Sync V1 is turn-based, not simultaneous)
- WhatsApp bulk messaging or WA Business API integration
- WhatsApp in any form until WHATSAPP-BETA-0A is complete
- Public website (beyond a minimal landing/pricing page)
- Microsoft Store distribution
- Mobile app

---

## 9. Must-Pass Gates Before CLOSED-PAID-BETA-0A

All gates below must be PASS before the first paying user is onboarded.

| # | Gate | Roadmap phase |
|---|---|---|
| G1 | Windows code signing configured and NSIS installer signed | CODE-SIGNING-0A |
| G2 | `isProUser()` and `canUse*()` central entitlement helpers implemented | LICENSE-ENTITLEMENT-0A |
| G3 | Cloud, Sync, WhatsApp UI and action handlers gated by plan | PRO-FEATURE-GATING-0A |
| G4 | Graceful downgrade: expired Pro → Basic features still work; cloud locked | LICENSE-FOUNDATION-0A (subset) |
| G5 | No revocation exploit: issued license cannot trivially remain valid after refund | LICENSE-FOUNDATION-0A |
| G6 | Cloud Backup restore UX shows record-count / safety backup notice | CLOUD-BACKUP-RELIABILITY-0A |
| G7 | Sync conflict UX notes "your local changes will be backed up first" | SYNC-SAFETY-V1-0A |
| G8 | WhatsApp Turkish phone normalization (05xx → +905xx) | WHATSAPP-BETA-0A |
| G9 | Minimal website with pricing, purchase link, ToS, privacy notice | WEBSITE-BETA-MVP-0A + LEGAL-SUPPORT-0A |
| G10 | Signed Windows installer successfully installs without SmartScreen block | DISTRIBUTION-0A |

---

## 10. Known Blockers (from BETA-SCOPE-LOCK-0A-AUDIT)

| # | Blocker | Phase |
|---|---|---|
| B1 | Plan-aware entitlement missing — any licensed user sees all Pro features | LICENSE-ENTITLEMENT-0A |
| B2 | Pro feature UI and action gates missing | PRO-FEATURE-GATING-0A |
| B3 | Windows code signing not configured — SmartScreen blocks install | CODE-SIGNING-0A |
| B4 | License expiry hard-blocks all features including Local Backup | LICENSE-FOUNDATION-0A |
| B5 | No license revocation / refund mechanism | LICENSE-FOUNDATION-0A |
| B6 | WhatsApp phone normalization broken (Turkish 05xx fails on wa.me) | WHATSAPP-BETA-0A |
| B7 | No auto-update channel | CODE-SIGNING-0A or separate |

---

## 11. Known Non-Blockers (acceptable for closed beta with docs/workaround)

- Local restore uses a bare browser `confirm()` dialog (no record-count summary) — safety backup exists; acceptable with a note in user docs
- WA "Log as Sent" may log before user actually sends in WhatsApp — cosmetic; WA is deferred anyway
- Cloud Backup "Apply Backup" label is developer terminology; "Restore from Cloud" would be clearer — P2 polish
- Mac support requires Gatekeeper bypass — internal dogfood only; not offered to paying users
- Manual license issuance (CLI) — acceptable for ≤30 beta users
- No auto-update — acceptable for closed beta with briefed users

---

## 12. Data Safety Rules (non-negotiable for all tiers)

1. **No silent overwrite.** Every destructive operation (restore, cloud apply, sync take-cloud/keep-mine) must create a mandatory safety backup before any mutation.
2. **Conflict must be explicit.** Sync conflicts must always require user choice; never auto-resolved.
3. **Basic data is always accessible.** Even after Pro subscription expiry, local data, Local Backup, and Local Restore must work.
4. **Fake data for dogfood.** All dogfood testing must use fake buildings/tenants/amounts. No real tenant data until the first PASS is recorded.
5. **License is per-device.** A license file cannot be transferred between machines without issuance of a new license.

---

## 13. Approved Roadmap Order After This Document

| Step | Phase | Description |
|---|---|---|
| 1 | `CODE-SIGNING-0A` | Windows code signing + auto-update foundation |
| 2 | `LICENSE-ENTITLEMENT-0A` | Plan-aware `isProUser()` + `canUse*()` central helpers |
| 3 | `PRO-FEATURE-GATING-0A` | Gate Cloud / Sync / WA at UI + action level behind Pro |
| 4 | `CLOUD-BACKUP-RELIABILITY-0A` | Retry, restore UX, safety notice improvements |
| 5 | `SYNC-SAFETY-V1-0A` | Conflict UX improvement, turn-based user notes |
| 6 | `SYNC-ARCHITECTURE-V2-0A` | Design only — record-level sync architecture |
| 7 | `RECORD-SYNC-V2-0A` | Implementation of record-level sync |
| 8 | `WHATSAPP-BETA-0A` | Phone normalization + EN message template |
| 9 | `WEBSITE-BETA-MVP-0A` | Minimal commercial website: pricing, purchase, download |
| 10 | `LEGAL-SUPPORT-0A` | ToS, Privacy/KVKK, Refund policy |
| 11 | `DISTRIBUTION-0A` | Signed installer pipeline, download page |
| 12 | `CLOSED-PAID-BETA-0A` | First 30 paying users onboarded |

---

## 14. Scope Change Protocol

Any request to add a feature to the first beta scope, change a Basic/Pro classification, or defer a current blocker requires:

1. A written justification referencing this document
2. An updated risk assessment
3. An explicit decision recorded in a new `BETA-SCOPE-LOCK-0B` or `BETA-SCOPE-CHANGE-*` document
4. Re-confirmation that all must-pass gates (Section 9) are still satisfied

No scope change may be implemented directly without this protocol.
