# Kira Takip Pro — Installation Guide
**Version:** 5.1.0

---

## Option A — Windows Installer (Recommended for end users)

### Requirements
- Windows 10 64-bit or later
- 200 MB free disk space

### Steps
1. Download `KiraTakipPro-Setup-5.1.0.exe`
2. Double-click the installer
3. Accept the license agreement
4. Choose installation folder (default: `C:\Program Files\Kira Takip Pro`)
5. Click **Install**
6. Click **Finish** — the app launches automatically
7. A desktop shortcut and Start Menu entry are created

### Silent Install (IT deployment)
```cmd
KiraTakipPro-Setup-5.1.0.exe /S /D=C:\Program Files\KiraTakipPro
```

### Uninstall
- Control Panel → Programs → Kira Takip Pro → Uninstall
- **Your data is NOT deleted** — only app files are removed
- Data remains in `%APPDATA%\kira-takip-pro\`

---

## Option B — Portable Version

1. Download `KiraTakipPro-5.1.0-portable.exe`
2. Run directly — no installation needed
3. Data saved in `%APPDATA%\kira-takip-pro\` (same location as installer version)

---

## Option C — Development / Source Build

### Prerequisites
- Node.js 18+ (`node --version`)
- npm 8+ (`npm --version`)
- Git
- Windows: Visual Studio Build Tools is no longer required for the default local JSON storage build
  → Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/

### Setup
```bash
git clone <repo-url>
cd kira-takip-pro

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build Windows installer
npm run build
```

### Build Output
```
dist/
  KiraTakipPro-Setup-5.1.0.exe    ← NSIS installer
  KiraTakipPro-5.1.0-portable.exe ← Portable
```

---

## App Icon Setup

If you want custom branding, replace `build/icon.ico` before building:

```
build/icon.ico   ← Replace with your 256x256 multi-size ICO file
build/icon.svg   ← Source SVG provided (for reference)
```

See `build/ICON_INSTRUCTIONS.txt` for conversion steps.

---

## First Launch

1. App opens with login screen
2. Default users:
   - **Malik (Admin)** → PIN: `1234`
   - **Alper (Editor)** → PIN: `5678`
   - **Hamid Bey (Viewer)** → PIN: `9999`
3. **Change PINs immediately** → Araçlar → Kullanıcılar → 🔑 PIN
4. Configure cloud sync if needed → Araçlar → Bulut Sync

---

## Troubleshooting

| Problem | Solution |
|---------|---------|
| App doesn't start | Right-click → Run as administrator |
| "VCRUNTIME140.dll missing" | Install Visual C++ Redistributable from Microsoft |
| Blank white screen | Check `%APPDATA%\kira-takip-pro\app.log` for errors |
| Data missing after update | Data is in `%APPDATA%\kira-takip-pro\kiratakip-data.json` — never deleted by installer |
| Icon not showing | Log out and log back in to Windows, or restart Explorer |
