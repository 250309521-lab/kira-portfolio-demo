# Kira Takip Pro — Backup & Restore Guide
**Version:** 5.1.0

---

## Automatic Backups

The app creates backups automatically — you don't need to do anything:

| Trigger | Filename Pattern | Kept |
|---------|-----------------|------|
| Every 5 minutes | `backup-{datetime}-auto-5min.db` | Last 24 |
| App shutdown | `backup-{datetime}-shutdown.db` | Last 24 |
| Before DB migration | `backup-{datetime}-pre-migration.db` | Last 24 |
| Before restore | `backup-{datetime}-pre-restore.db` | Last 24 |

All backups are in: `%APPDATA%\kira-takip-pro\backups\`

---

## Manual Backup

### Option 1 — In-App (SQLite backup)
1. Click **Hakkında & Veri Konumları** in sidebar
2. Click **💾 Şimdi Yedekle**
3. Backup created in `%APPDATA%\kira-takip-pro\backups\`

### Option 2 — JSON Export (Portable)
1. **Araçlar → JSON Yedek** (or Hakkında page)
2. Choose save location in native file dialog
3. Save as `KiraTakip_Yedek_{date}.json`

JSON export includes: tenants, payments, expenses, Alper data, users, settings, WA log, history

### Option 3 — Manual File Copy
```
Copy: %APPDATA%\kira-takip-pro\kiratakip.db
To:   Any safe location (external drive, cloud storage)
```

---

## Restore from Backup

### Option 1 — In-App Restore (SQLite)
1. Go to **Hakkında & Veri Konumları**
2. Find the backup in the list
3. Click **↩ Yükle** next to the backup
4. Confirm the dialog
5. Restart the app

### Option 2 — JSON Import
1. **Araçlar → Ayarlar → 📥 JSON Yükle**
2. Select the `.json` backup file
3. Data is merged immediately

### Option 3 — Manual File Restore
```cmd
:: Stop the app first
taskkill /IM "Kira Takip Pro.exe" /F

:: Backup current database
copy "%APPDATA%\kira-takip-pro\kiratakip.db" "%APPDATA%\kira-takip-pro\kiratakip_before_restore.db"

:: Restore from backup
copy "D:\MyBackups\backup-2026-05-10.db" "%APPDATA%\kira-takip-pro\kiratakip.db"

:: Restart app
start "" "C:\Program Files\Kira Takip Pro\Kira Takip Pro.exe"
```

---

## Cloud Backup (Optional)

Configure a cloud sync endpoint to maintain an off-site backup:

1. **Araçlar → Bulut Sync**
2. Enter your API endpoint URL and key
3. Click **☁️ Push** to upload immediately
4. Auto-sync runs every 5 minutes

**Recommended free endpoints:**
- [jsonbin.io](https://jsonbin.io) — 10,000 requests/month free
- Your own `server.js` on Render.com (free tier)

---

## Backup Best Practices

### Weekly
- Export JSON backup → save to external USB or cloud storage (OneDrive, Google Drive)

### Before Major Changes
- Before entering a full month's data: manual SQLite backup
- Before app update: JSON export

### After Problems
- If data appears wrong: restore from most recent auto-5min backup
- If app crashes: check shutdown backup

---

## Backup File Comparison

| Format | Contains | Portable | Human-readable | Encrypted |
|--------|----------|----------|----------------|-----------|
| `.db` (SQLite) | SQLite schema + all users/settings | ✅ | ❌ | ❌ |
| `.json` | Tenant/payment data + users | ✅ | ✅ | ❌ |

**Recommendation:** Keep both — `.db` for quick restore, `.json` for portability.

---

## Disaster Recovery

See `DISASTER_RECOVERY_PLAN.md` in the `docs/` folder for full scenarios including:
- Accidental data deletion
- Corrupted database
- Admin PIN lockout
- Machine failure
