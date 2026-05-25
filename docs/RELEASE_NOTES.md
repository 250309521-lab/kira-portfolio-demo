# Kira Takip Pro — Release Notes

---

## v5.1.0 — 2026-05-12 (Current)

### 🚀 New: Electron Desktop App
- Native Windows desktop application (no browser required)
- Windows NSIS installer with desktop + Start Menu shortcuts
- Portable .exe version also available
- App icon support (replace `build/icon.ico` for custom branding)
- Window title: "Kira Takip Pro"

### 🗄 New: Persistent SQLite Storage
- SQLite database (`kiratakip.db`) in `%APPDATA%\kira-takip-pro\`
- Stores: users, app settings, audit log, backup records
- Database migrations with automatic pre-migration backup
- All tenant/payment/expense data in localStorage (persisted by Electron)
- Data survives app updates and reinstalls

### 💾 New: Backup System
- Automatic SQLite backup every 5 minutes
- Backup on app shutdown
- Backup before any database migration
- Backup before restore operations
- Last 24 auto-backups kept (1 hour window at 5-min intervals)
- Backup list shown in About/Status page

### ℹ️ New: About & Status Page
- App version, database path, backup folder path
- SQLite connection status
- Cloud sync status and last sync time
- Current logged-in user and role
- Backup list with one-click restore
- "Open Data Folder" and "Open Backup Folder" buttons
- Native file dialogs for JSON import/export

### 🔑 New: Enhanced User Management
- Full user CRUD (add/edit/delete/deactivate)
- Inline edit form (no page navigation)
- PIN reset with validation
- Cannot delete or deactivate yourself
- All changes logged in audit history

### 📅 Improved: Month Bar
- Drag-to-scroll (click + drag left/right)
- Mouse wheel scroll
- Arrow buttons (‹ ›) flanking the bar
- Keyboard ArrowLeft/ArrowRight when focused
- Active month auto-scrolls into view after render
- Gradient mask shows bar is scrollable

### 🔧 Fixed: Sidebar Navigation
- `openModal()` function was missing (HTML called it but JS only had `openMod()`)
- All sidebar items now functional: Kullanıcılar, Bulut Sync, Ayarlar, CSV, Excel, Yazdır
- Unknown modal types show "not configured" state instead of silently failing
- Settings modal added with backup/restore controls

### 🧪 New: Unit Tests
- 35 tests covering: month strings, payment calculations, overdue detection,
  net income, collection rate, user validation, Alper calculations, phone numbers
- Run: `npm test`

### 📚 Documentation
- `docs/INSTALLATION_GUIDE.md`
- `docs/DATA_STORAGE_GUIDE.md`
- `docs/BACKUP_RESTORE_GUIDE.md`
- `docs/RELEASE_NOTES.md`
- Plus 10 architecture docs in `kira_v5/docs/`

---

## v5.0.0 — 2026-05-11

### New Features
- Premium glassmorphism UI (DM Sans + JetBrains Mono fonts)
- Multi-user login system with PIN authentication
- Role-based permissions: Admin / Editor (Manager) / Viewer
- Command Palette (Ctrl+K) with tenant/building search
- Floating Action Button (FAB) for quick actions
- Smart Dashboard: collection gauge, sparkline trend, building ranking
- Analytics page: monthly/yearly/comparison charts + heatmap
- PDF receipt generation (print window with professional layout)
- Excel export (.xls format)
- Enhanced WhatsApp management with phone editing
- Timeline-style audit history with filter
- Cloud sync status bar
- 3D visualization page (canvas-based interactive chart)
- Fixed layout: no more content overflow on any resolution

### Technical
- Fixed app shell: `html/body: 100vw/100vh`, `sidebar: flex:0 0 256px`, `main: flex:1 1 0; min-width:0`
- Single-row month bar with proper `overflow-x:auto`
- Panel hidden by default (`.open` class only)
- All tables in `overflow-x:auto` wrappers
- 3 Git commits with proper history

---

## v4.x — Previous (Browser-only)

- Excel data imported from 3 buildings
- Payment and expense tracking
- Alper account reconciliation
- WhatsApp reminder log
- Chart.js graphs
- JSON backup/restore
- localStorage persistence

---

## Upgrade Notes

### v4 → v5
- localStorage key changed from `ktp_v4` to `ktp_v5`
- `alper` field names changed: `toplanan→col`, `gider→exp`
- Run app once to auto-migrate (backup is created first)

### v5.0 → v5.1 (Browser → Electron)
- Same localStorage data, same `ktp_v5` key
- SQLite database created fresh on first launch
- No data migration required for tenant/payment data
- User management now has full CRUD (users previously stored in localStorage only)

---

## Known Issues

- PIN stored as plain-text (will be hashed with PBKDF2 in v6)
- No light theme yet (dark only)
- No mobile/PWA version
- Excel import is manual (no direct .xlsx file parsing)
