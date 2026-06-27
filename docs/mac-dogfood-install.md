# KiraTakipPro — Mac Internal Dogfood Install Guide

> **Internal use only. Not for public distribution.**  
> This build is unsigned. A signed/notarized Mac release is a separate future track.

---

## What This Is

An unsigned macOS build produced by GitHub Actions for internal manager-ready dogfooding. It lets you test the app on a Mac before the full public Mac release is ready.

---

## Step 1 — Download the DMG

1. Go to the GitHub repository.
2. Click **Actions** in the top navigation.
3. Find the latest **Mac Dogfood Build** run.
4. Click on it, then scroll to **Artifacts**.
5. Download `mac-dogfood-dmg-<run-number>.zip`.
6. Unzip it — you will find a `.dmg` file.

---

## Step 2 — Install the App

1. Double-click the `.dmg` file.
2. A window opens showing the app icon and an Applications folder shortcut.
3. **Drag** `KiraTakipPro Customer.app` into the `Applications` folder.
4. Eject the DMG (drag it to Trash or press Cmd+E).

---

## Step 3 — First Launch (Gatekeeper Approval)

Because this build is **unsigned**, macOS will block the first launch with a security warning.

**Do this instead of double-clicking:**

1. Open **Finder → Applications**.
2. Find `KiraTakipPro Customer`.
3. **Right-click** (or Ctrl+click) on the app icon.
4. Select **Open** from the context menu.
5. A dialog appears: *"Are you sure you want to open it?"* — click **Open**.
6. The app will launch. Future launches will open normally (no further approval needed).

**Alternative (System Settings):**
- If you already tried to double-click and got blocked:
- Open **System Settings → Privacy & Security**.
- Scroll to the Security section.
- Find `KiraTakipPro Customer` and click **Open Anyway**.

---

## Step 4 — License Activation

The app requires a license file for first use.

- Contact the developer with your Mac's machine fingerprint.
- Run this safe command in Terminal (shows only shape info, not the fingerprint value):

```bash
cd /path/to/KiraTakipPro_v6_customer   # skip if you don't have the repo
# Or use Node directly if it's installed:
node -e "
  var m = require('./src/machine-id');
  var fp = m.getMachineFingerprint();
  console.log('fp exists:', fp !== null);
  console.log('len:', fp ? fp.length : 0);
  console.log('valid:', fp ? /^[0-9a-f]{64}$/.test(fp) : false);
"
```

- **Do not share the fingerprint value in chat or email.** Share it only via a secure channel or generate the license locally.
- The developer will issue a `.ktplicense` file.
- Copy it to: `~/Library/Application Support/KiraTakipPro Customer/license/active.ktplicense`

```bash
mkdir -p ~/Library/Application\ Support/KiraTakipPro\ Customer/license/
cp /path/to/your.ktplicense \
   ~/Library/Application\ Support/KiraTakipPro\ Customer/license/active.ktplicense
```

- Relaunch the app — it should open normally.

---

## Step 5 — Dogfood Testing Rules

> ⚠️ **Use fake/test data only until all tests below pass at least once.**

### What to test first (in order):

1. **Local Backup** — About → Backup → Back Up Now → verify file saved
2. **Local Restore** — restore the backup → verify data is correct
3. **Cloud Login** — Sidebar → Bulut Sync → Sign In (optional if credentials available)
4. **Cloud Backup** — Workspace → Cloud Backup → Back Up Now
5. **Protected Sync** — Enable Sync → two-device turn-based test

### Do NOT yet:

- Enter real tenant names, phone numbers, or financial amounts
- Use WhatsApp reminders with real phone numbers (phone normalization gap exists)
- Enable Sync and edit simultaneously on two devices (use turn-based only)

---

## What Is NOT Included in This Build

- ❌ Apple signing / notarization (future track)
- ❌ Automatic updates (future track)
- ❌ `.ktpbackup` file association in Finder (use in-app file picker)
- ❌ Microsoft Store / App Store distribution

---

## Reporting Issues

If the app crashes or behaves unexpectedly:

1. Note the exact action that caused the issue.
2. Do not include real tenant or financial data in the report.
3. Check `~/Library/Logs/KiraTakipPro Customer/` for log files.
4. Share the log file (check it does not contain sensitive data before sharing).
