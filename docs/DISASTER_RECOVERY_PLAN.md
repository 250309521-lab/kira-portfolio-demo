# Kira Takip Pro — Disaster Recovery Plan
**Version:** 5.1

---

## 1. Overview

This document defines recovery procedures for data loss, corruption, or system failure scenarios for Kira Takip Pro.

**RTO (Recovery Time Objective):** < 30 minutes for all scenarios  
**RPO (Recovery Point Objective):** < 5 minutes if cloud sync is active; last manual backup otherwise

---

## 2. Backup Strategy

### 2.1 Automatic Backups

| Type | Frequency | Location | Retention |
|------|-----------|----------|-----------|
| Auto-save (localStorage) | Every 30 seconds | Browser localStorage | Last 1 version |
| Cloud sync push | Every 5 minutes | Cloud endpoint | Depends on provider |
| Server-side timestamped | Every 5 minutes | server.js directory | Last 12 files (1 hour) |

### 2.2 Manual Backups

| Method | Trigger | Format | Location |
|--------|---------|--------|----------|
| JSON Yedek | Sidebar or Settings | .json | Downloads folder |
| Excel Export | Reports page | .xls | Downloads folder |
| CSV Export | Reports page | .csv | Downloads folder |

**Best Practice:** Export JSON backup before:
- Major data entry sessions
- App updates
- Windows updates
- Sharing the machine with others

---

## 3. Failure Scenarios & Recovery Steps

### 3.1 Accidental Data Deletion

**Scenario:** User deletes a tenant or resets all data.

**Recovery:**
1. Check if JSON backup file exists on disk
2. Go to **Ayarlar → 📥 JSON Yükle**
3. Select the most recent `.json` backup
4. Click to confirm restore
5. Verify data in dashboard

**If no backup file:** Pull from cloud sync (if configured):
1. **Araçlar → Bulut Sync → ⬇ Pull**
2. Confirm data restored

**If neither:** Accept data loss and re-enter from source (Excel files).

---

### 3.2 Corrupted localStorage

**Scenario:** `localStorage.getItem('ktp_v5')` returns unparseable JSON.

**Symptoms:** App loads blank or shows default data (empty tenant lists, no payments).

**Recovery:**
```javascript
// Step 1: Open browser DevTools (F12)
// Step 2: Console tab, run:
JSON.parse(localStorage.getItem('ktp_v5'))
// If error: data is corrupted

// Step 3: Try to extract partial data
const raw = localStorage.getItem('ktp_v5');
// Copy raw string to text editor, manually fix JSON

// Step 4: If unrecoverable, clear:
localStorage.removeItem('ktp_v5');
location.reload();

// Step 5: Restore from JSON backup file via Settings
```

---

### 3.3 Browser Cache / Storage Cleared

**Scenario:** User or IT department clears browser data.

**Symptoms:** App opens with default (empty) state.

**Recovery:**
1. If cloud sync was configured: **Bulut Sync → Pull**
2. If JSON backup exists: **Settings → Import JSON**
3. If server-side backup exists: download `backup_*.json` from server directory, import via Settings

---

### 3.4 Server Outage (Cloud Sync Unavailable)

**Scenario:** sync endpoint is down or unreachable.

**Impact:** No cloud sync. App continues to work fully offline using localStorage.

**Recovery:**
- No recovery needed — app is fully offline-capable
- Once server is back: **Bulut Sync → Push** to upload accumulated local changes
- If server data is outdated: local data is assumed authoritative

**Conflict resolution (current):** Last-write-wins. Server data overwrites local on Pull; local data overwrites server on Push.

---

### 3.5 App Update Breaks Schema

**Scenario:** New app version uses different localStorage key or incompatible structure.

**Symptoms:** Data appears missing after update; new fields show as undefined.

**Recovery:**
1. App should auto-run migration (check `ktp_v4`, `ktp_v5` etc.)
2. If migration fails, old key is preserved
3. Open DevTools → Application → Local Storage → find old key
4. Copy value → restore manually
5. Run `importJSON()` if old structure is compatible

**Prevention:**
- Each version uses a new key (`ktp_v6`, `ktp_v7`)
- Migration always writes a timestamped backup first

---

### 3.6 Windows Machine Failure / Disk Corruption

**Scenario:** Machine fails to boot or drive is corrupted.

**Recovery:**
1. If cloud sync was active: open app on any machine → configure same endpoint → Pull
2. If JSON backup was on external drive: import on new machine
3. If only Excel source files exist: re-import from Excel (manual process in v5)

**Lessons:**
- Always use cloud sync if data changes frequently
- Keep JSON backup on a separate drive or cloud storage (OneDrive, Google Drive)

---

### 3.7 Admin Account Locked Out

**Scenario:** Admin forgets PIN; or admin user was accidentally deleted.

**Recovery:**
```javascript
// Open browser DevTools → Console
const data = JSON.parse(localStorage.getItem('ktp_v5'));
// Find admin user:
data.users.find(u => u.role === 'admin')
// Reset PIN directly:
data.users.find(u => u.id === 'malik').pin = '1234';
localStorage.setItem('ktp_v5', JSON.stringify(data));
location.reload();
```

**If all admin users deleted:**
```javascript
const data = JSON.parse(localStorage.getItem('ktp_v5'));
data.users.push({ id:'recovery', name:'Recovery Admin', avatar:'R', role:'admin', pin:'0000', color:'#ef4444', active:true });
localStorage.setItem('ktp_v5', JSON.stringify(data));
location.reload();
// Login as "Recovery Admin" PIN: 0000
// Immediately reset PIN and delete recovery account
```

---

## 4. Server-Side Backup Recovery (server.js)

### Location
Backup files are stored in the same directory as `server.js`:
```
server/
  store.json                           ← current live data
  backup_2026-05-12T10-00.json
  backup_2026-05-12T10-05.json
  ...
  backup_2026-05-12T10-55.json         ← last 12 files
```

### Restore from Server Backup
```bash
# On the server:
# 1. Stop server
pm2 stop kira-server   # or Ctrl+C

# 2. Identify correct backup
ls -la backup_*.json

# 3. Restore
cp backup_2026-05-12T10-00.json store.json

# 4. Restart
pm2 start server.js --name kira-server
```

---

## 5. User Data Protection

- Tenant personal data (names, phones) is stored locally on the user's machine
- Cloud sync transmits data over HTTPS (depends on endpoint configuration)
- Backup JSON files on disk are unencrypted — keep in a private folder
- Never share backup files via public channels (email, Slack) without encryption

---

## 6. Recovery Checklist

```
□ Cloud sync configured and tested?
□ JSON backup exported this week?
□ Backup file stored outside the machine (USB / cloud storage)?
□ Server backup directory has recent files?
□ Admin PIN documented in a secure location (password manager)?
□ server.js environment variables documented (WA_TOKEN, KTP_KEY)?
```
