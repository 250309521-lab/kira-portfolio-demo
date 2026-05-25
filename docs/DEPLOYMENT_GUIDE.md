# Kira Takip Pro — Deployment Guide
**Version:** 5.1.0

---

## Deployment Options

| Option | Best for | Effort |
|--------|---------|--------|
| A. Windows Installer | End users, permanent install | Low |
| B. Portable EXE | Temporary use, USB | Low |
| C. Dev mode | Development, testing | Medium |
| D. Server only | Cloud sync, multi-user | Medium |

---

## Option A: Windows Installer Deployment

### Prerequisites
```
Windows 10/11 64-bit
Node.js 18+ (build machine only)
No Visual Studio Build Tools required
  → https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

### Build Steps

```bash
# 1. Clone / extract project
cd kira-takip-pro

# 2. Install dependencies
npm install

# 3. (Optional) Replace icon
# → See build/ICON_INSTRUCTIONS.txt
# → Replace build/icon.ico with your 256x256 multi-size ICO

# 4. Build Windows installer
npm run build

# Output:
# dist/KiraTakipPro-Setup-5.1.0.exe   ← NSIS installer (~120MB)
# dist/KiraTakipPro-5.1.0-portable.exe ← Portable (~120MB)
```

### Distributing

1. Send `KiraTakipPro-Setup-5.1.0.exe` to each user
2. User double-clicks → wizard installs
3. Desktop + Start Menu shortcuts created
4. Data goes to `%APPDATA%\kira-takip-pro\` (never deleted by uninstaller)

### Silent Install
```cmd
KiraTakipPro-Setup-5.1.0.exe /S
```

---

## Option B: Portable Deployment

1. Build: `npm run build`
2. Distribute: `dist/KiraTakipPro-5.1.0-portable.exe`
3. User runs directly — no installation needed
4. Data still saved to `%APPDATA%\kira-takip-pro\`

---

## Option C: Development Mode

```bash
npm install
npm run dev     # Opens with DevTools attached

# Run tests first
npm test                    # 35 unit tests
npm run test:integrity      # 63 integrity tests
```

---

## Option D: Server Deployment

See `docs/SERVER_SETUP_GUIDE.md` for full details.

### Quick Start (local server)

```bash
# Set environment variables
set KTP_SECRET=your-32-char-random-secret
set KTP_ADMIN_PASS=your-admin-password

# Start server
node server.js
# → Running on http://localhost:8787
```

### Production Server (Render.com)

1. Push `server.js` to GitHub
2. Create new Web Service on Render
3. Environment variables:
   ```
   KTP_SECRET=<random 32+ chars>
   KTP_ADMIN_PASS=<strong password>
   NODE_ENV=production
   ```
4. Start command: `node server.js`
5. URL: `https://your-app.onrender.com`

### Connect Electron App to Server

1. Open app → Araçlar → Bulut Sync
2. Enter server URL
3. Enter username + password → Bağlan
4. ⬇ Pull to get server data
5. ⬆ Push to send local data

---

## App Update Procedure

### Safe Update Steps

1. **Backup first**: Araçlar → JSON Yedek (save file)
2. **Close the app**
3. Run new installer: `KiraTakipPro-Setup-5.2.0.exe`
4. Installer overwrites app files
5. **User data is NEVER touched** (stored in `%APPDATA%`)
6. Reopen app → data is intact

### Database Migration

On first launch after update:
- App checks `schema_version` table
- Runs any pending migrations automatically
- Creates backup before migration (`backup-*-pre-migration.db`)
- If migration fails: app falls back gracefully

### Rollback

If new version has issues:
1. Close app
2. Run previous installer (`KiraTakipPro-Setup-5.0.0.exe`)
3. Data unchanged

---

## Post-Deployment Checklist

After deploying to a new machine:

- [ ] App launches without errors
- [ ] Login screen shows default users
- [ ] Change default PINs (Settings → Kullanıcılar)
- [ ] Configure cloud sync if using multi-user setup
- [ ] Test JSON backup export
- [ ] Verify `%APPDATA%\kira-takip-pro\` folder exists
- [ ] Verify backup files being created
- [ ] Check app.log for any startup errors

---

## Troubleshooting

| Problem | Solution |
|---------|---------|
| `better-sqlite3` build fails | Install Visual Studio Build Tools |
| App won't start (white screen) | Check `%APPDATA%\kira-takip-pro\app.log` |
| Data missing after update | Data is in `%APPDATA%` — never deleted |
| Server connection fails | Check `KTP_SECRET` is set in env |
| Build fails: `icon.ico` | See `build/ICON_INSTRUCTIONS.txt` |
| `electron-builder` error | Delete `node_modules` and `npm install` again |

---

## File Locations Reference

```
Project:
  kira-takip-pro/
  ├── src/main.js           Electron main process
  ├── src/preload.js        Secure IPC bridge
  ├── src/renderer.html     Full app UI + JS
  ├── src/tests/            Test suites
  ├── build/                Packaging resources
  ├── docs/                 Documentation
  ├── server.js             Cloud sync server
  └── package.json          Build config

Runtime (per machine):
  %APPDATA%\kira-takip-pro\
  ├── kiratakip-data.json          SQLite database
  ├── app.log               Application log
  └── backups\              Auto-backup files

Build output:
  dist/
  ├── KiraTakipPro-Setup-5.1.0.exe
  └── KiraTakipPro-5.1.0-portable.exe
```
