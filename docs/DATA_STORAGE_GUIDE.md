# Kira Takip Pro — Data Storage Guide
**Version:** 5.1.0

---

## Where Your Data Lives

All user data is stored in **Electron's userData folder** — completely separate from the app installation directory. This means:

✅ App updates **never delete your data**
✅ Uninstalling the app **does not delete your data**
✅ You can move the app to a new computer by copying this folder

### Path
```
Windows: C:\Users\{username}\AppData\Roaming\kira-takip-pro\
         (also accessible as %APPDATA%\kira-takip-pro\)
```

### Contents
```
%APPDATA%\kira-takip-pro\
├── kiratakip-data.json           ← SQLite database (main persistent store)
├── app.log                ← Application log
└── backups\
    ├── backup-2026-05-12T10-00-00-auto-5min.db
    ├── backup-2026-05-12T10-05-00-auto-5min.db
    ├── backup-2026-05-12T10-00-00-shutdown.db
    └── ... (up to 24 auto backups kept)
```

---

## Storage Architecture

### Layer 1: localStorage (Browser)
- **What:** Tenant data, payments, expenses, Alper account, WA log, user PINs
- **Where:** Chromium's localStorage inside the Electron app sandbox
- **Key:** `ktp_v5`
- **Access:** Only from within the Electron renderer process

### Layer 2: SQLite Database (`kiratakip-data.json`)
- **What:** Users table, app settings, audit log, backup records
- **Where:** `%APPDATA%\kira-takip-pro\kiratakip-data.json`
- **Access:** Main process only (via IPC from renderer)
- **Encoding:** UTF-8, WAL journal mode

### Layer 3: Cloud Sync (Optional)
- **What:** Full data snapshot
- **Where:** User-configured REST endpoint
- **Trigger:** Every 5 minutes when enabled, and on manual push

---

## SQLite Database Schema

### `schema_version`
Tracks which migrations have been applied.

### `users`
```sql
id TEXT PRIMARY KEY          -- e.g. "malik", "alper", "u_1715000000000"
name TEXT NOT NULL
avatar TEXT                  -- 1-2 uppercase letters
role TEXT                    -- 'admin', 'manager', or 'viewer'
pin_hash TEXT NOT NULL       -- PIN (plain-text in v5; hashed in v6)
color TEXT                   -- hex color
active INTEGER DEFAULT 1     -- 1 = active, 0 = deactivated
created_at TEXT
updated_at TEXT
```

### `app_settings`
Key-value store for persistent settings:
```
auto_save         → '1' or '0'
cloud_url         → endpoint URL
cloud_enabled     → '1' or '0'
last_sync         → ISO timestamp
selected_month    → e.g. "Nisan 2026"
theme             → 'dark' or 'light'
```

### `audit_log`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
ts TEXT                      -- ISO timestamp
user_name TEXT               -- who made the change
action TEXT                  -- description
details TEXT                 -- optional JSON details
```

### `backup_records`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
filename TEXT
path TEXT
size_bytes INTEGER
created_at TEXT
trigger TEXT                 -- 'manual', 'auto-5min', 'shutdown', 'pre-migration'
```

---

## Viewing Your Data

### In the App
Settings → Hakkında & Veri Konumları shows:
- Database file path
- Backup folder path
- Backup count
- SQLite connection status

### Direct Database Access
```bash
# Install sqlite3 CLI (optional)
# Windows: https://sqlite.org/download.html

sqlite3 "%APPDATA%\kira-takip-pro\kiratakip-data.json"
  .tables
  SELECT * FROM users;
  SELECT * FROM audit_log ORDER BY id DESC LIMIT 20;
  .quit
```

### Log File
```
%APPDATA%\kira-takip-pro\app.log
```
Contains: startup info, migration history, backup events, errors.

---

## Data Lifecycle

| Event | Data Impact |
|-------|-------------|
| App install | Creates userData folder and SQLite DB |
| App launch | Runs pending DB migrations (backup first) |
| Data entry | Saved to localStorage immediately |
| Auto-save (30s) | localStorage → Chromium persistence |
| Electron settings | Saved to SQLite via IPC |
| App shutdown | SQLite backup created |
| Every 5 minutes | SQLite backup created |
| App update | userData folder untouched |
| App uninstall | App files removed; userData preserved |
| Manual "Reset All" | Clears localStorage AND SQLite |

---

## Moving Data to a New Computer

1. On old machine: **Settings → JSON Dışa Aktar** → save to USB
2. Copy `%APPDATA%\kira-takip-pro\` folder to USB (optional, for SQLite data)
3. Install app on new machine
4. **Settings → JSON İçe Aktar** → select file
5. If copying SQLite folder: paste into `%APPDATA%\kira-takip-pro\` on new machine

---

## Data Security

- localStorage is encrypted by the OS user profile (Windows DPAPI)
- SQLite file is in user's AppData (protected by Windows user permissions)
- JSON backup files are **unencrypted** — store securely
- Cloud sync data protection depends on your endpoint configuration
