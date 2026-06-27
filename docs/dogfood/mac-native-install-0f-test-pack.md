# KiraTakipPro — Mac Native Install Test Pack (0F)

> **INTERNAL DOGFOOD ONLY.**  
> Do not distribute this app publicly.  
> Do not use real tenant, property, or payment data until this test pack returns PASS.  
> Do not share the DMG link beyond the one designated test recipient.

---

## Artifact

```
KiraTakipPro-Customer-6.0.0-mac-universal.dmg
```

This is a **universal binary** — it works on both Apple Silicon (M1/M2/M3/M4) and Intel Macs. You do not need to know your Mac chip in advance.

---

## Message Masoumeh Can Send With the Link

> Hi! I am sharing an internal test build of KiraTakipPro for Mac.
> This is an unofficial preview — please install it on a personal/test Mac, not a work Mac.
> Use only fake/test data for now.
> Follow the install steps in this message carefully because the app is not yet App Store signed.
> Please let me know if it launches and runs correctly, and send me the PASS/FAIL form at the end.

---

## Mac Install Steps

### 1. Download

Download the file:
```
KiraTakipPro-Customer-6.0.0-mac-universal.dmg
```
from the link provided.

### 2. Open the DMG

Double-click the `.dmg` file. A window opens showing the app icon and an Applications shortcut.

### 3. Install the App

Drag `KiraTakipPro Customer.app` into the `Applications` folder shortcut.

Eject the DMG (drag to Trash or press Cmd+E).

### 4. First Launch — Gatekeeper Approval (Required)

Because this build is not yet signed by Apple, macOS will block a normal double-click.

**Do this instead:**

1. Open **Finder → Applications**.
2. Find `KiraTakipPro Customer`.
3. **Right-click** (or hold Control and click) the app icon.
4. Select **Open** from the menu that appears.
5. A dialog says *"Apple cannot check this app for malicious software"* — click **Open**.
6. The app will launch. This approval is saved; future launches open normally.

### If You See "App Cannot Be Opened" After Double-Clicking

If you already double-clicked and got a blocked message:

1. Open **System Settings** (Apple menu → System Settings).
2. Go to **Privacy & Security**.
3. Scroll down to the **Security** section.
4. Find `KiraTakipPro Customer` and click **Open Anyway**.
5. Confirm again with **Open**.

---

## Smoke Test Checklist

Use **fake/test data only** throughout. Do not enter real tenant names, real phone numbers, real payment amounts, or real addresses.

### A. App Launch

- [ ] App opens without crashing.
- [ ] Splash screen appears briefly (dark blue, animated).
- [ ] Main window opens after splash.

### B. License / First Run

- [ ] License screen appears (expected on first install — no license file yet).
- [ ] Note that a license must be activated separately. **Do not attempt to create or paste a license file yourself.** Contact Masoumeh for a license file.
- [ ] Once a license file is provided and placed, relaunch the app.
- [ ] App opens to onboarding or main screen without the license block.

> **License activation note for Masoumeh:**  
> To issue a license for the tester's Mac, you need their machine fingerprint.  
> Ask the tester to run this command in Terminal (safe — shows only shape, not the raw value):
> ```bash
> node -e "
>   var m = require('/Applications/KiraTakipPro Customer.app/Contents/Resources/app/src/machine-id');
>   var fp = m.getMachineFingerprint();
>   console.log('fp exists:', fp !== null);
>   console.log('len:', fp ? fp.length : 0);
>   console.log('valid:', fp ? /^[0-9a-f]{64}$/.test(fp) : false);
> "
> ```
> If `fp exists: true` and `len: 64` — fingerprint is available.  
> Have the tester share the fingerprint value with you **privately** (not in a group chat or public channel).  
> Use `npm run license:issue` locally to generate a `.ktplicense` file for their machine.  
> Send them the `.ktplicense` file and these placement instructions:
> ```
> mkdir -p ~/Library/Application\ Support/KiraTakipPro\ Customer/license/
> cp /path/to/your.ktplicense ~/Library/Application\ Support/KiraTakipPro\ Customer/license/active.ktplicense
> ```
> Relaunch the app after placing the file.

### C. Onboarding / First Use

- [ ] Onboarding wizard appears (or app opens directly if data exists).
- [ ] **Skip PIN** or enter a test PIN — do not use a real PIN you use elsewhere.
- [ ] Create a test building: name it `"Test Bina"`.
- [ ] App proceeds to the main dashboard.

### D. Basic Data Entry (Fake Data Only)

- [ ] Add a test tenant: name `"Test Kiracı"`, unit `"101"`, rent `1000`.
- [ ] Add a test payment for the current month.
- [ ] Add a test expense.
- [ ] Dashboard shows the test building and data.

### E. Persistence — Relaunch

- [ ] Close the app fully (Cmd+Q or right-click Dock icon → Quit).
- [ ] Reopen the app.
- [ ] Confirm the test building, tenant, and payment are still there.

### F. Local Backup / Restore

- [ ] Go to About / Settings → Backup.
- [ ] Click **Back Up Now** (or equivalent).
- [ ] A file picker opens — save the backup to your Desktop as `test-mac-backup.ktpbackup`.
- [ ] Confirm the backup file appears on the Desktop.
- [ ] Add a second fake tenant: `"Silme Testi"`, unit `"102"`.
- [ ] Restore the backup: About → Backup History → select `test-mac-backup.ktpbackup` → confirm.
- [ ] App reloads.
- [ ] Confirm `"Silme Testi"` is **gone** (it was added after the backup).
- [ ] Confirm `"Test Kiracı"` is **still there**.

### G. Cloud Login (Optional — only if cloud credentials are available)

- [ ] Sidebar → Bulut Sync → Sign In.
- [ ] Enter cloud credentials.
- [ ] Confirm login succeeds and workspace card appears.
- [ ] **Do not enable sync** or create a cloud workspace during this test. Cloud features are tested separately.

### H. Cloud Backup (Optional — only if logged in)

- [ ] Workspace → Cloud Backup → Back Up Now.
- [ ] Confirm upload completes (success toast appears).
- [ ] Cloud Backup History shows at least one entry.

---

## PASS / FAIL Reporting Template

Please fill this out and send to Masoumeh after completing the checklist:

```
=== KiraTakipPro Mac Dogfood 0F — Test Report ===

Tester:                 [first name or initials only]
Mac model/chip:         [e.g. MacBook Pro M3, MacBook Air Intel — if known]
macOS version:          [e.g. macOS 14.5 — if known]
Date of test:           [YYYY-MM-DD]

A. Launch:              [ PASS / FAIL / PARTIAL ]
   Notes:

B. License:             [ PASS / FAIL / NOT TESTED ]
   Notes:

C. Onboarding/data:     [ PASS / FAIL / PARTIAL ]
   Notes:

D. Persistence:         [ PASS / FAIL ]
   Notes:

E. Local Backup:        [ PASS / FAIL / NOT TESTED ]
   Notes:

F. Local Restore:       [ PASS / FAIL / NOT TESTED ]
   Notes:

G. Cloud Login:         [ PASS / FAIL / NOT TESTED ]
   Notes:

H. Cloud Backup:        [ PASS / FAIL / NOT TESTED ]
   Notes:

Screenshots attached:   [ YES / NO ]

Overall result:         [ PASS / FAIL / PARTIAL ]

Blocker notes:
[Any crash, error message, or blocked step — describe exactly what happened]

=== End of Report ===
```

---

## Rules

- **Do not send the app to anyone else until this test returns PASS or PARTIAL (with acceptable blockers).**
- **Do not use real tenant data, real phone numbers, or real payment data during dogfood.**
- **Do not share the license file publicly** — it is tied to a specific Mac and cannot be reused.
- **Do not attempt to enable Cloud Sync** during the 0F smoke test. Cloud Sync safety testing is a separate planned phase.

---

## What Happens After This Test

| Result | Next step |
|---|---|
| **PASS** | Proceed to DOGFOOD-UX-SAFETY-0B and cloud sync testing |
| **PARTIAL** | Address specific blockers, re-run affected checklist items |
| **FAIL** | Diagnose crash/error, fix in a new patch phase before proceeding |
