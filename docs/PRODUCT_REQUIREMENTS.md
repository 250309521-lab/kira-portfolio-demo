# Kira Takip Pro — Product Requirements Document
**Version:** 5.1 | **Last updated:** 2026-05-12

---

## 1. App Purpose

Kira Takip Pro is a **desktop-first property management application** for a private landlord managing three residential buildings in Istanbul. It replaces manual Excel tracking with a structured, role-aware system for:

- Recording monthly rent payments per tenant
- Tracking utility/operating expenses per building per month
- Monitoring overdue payments and sending WhatsApp reminders
- Generating monthly financial reports and PDF receipts
- Synchronising data across multiple users via a REST backend
- Providing a single source of truth for the owner, the building manager (Alper), and a viewer (Hamid Bey)

---

## 2. Target Users

| User | Role | Context |
|------|------|---------|
| **Malik (Owner)** | Admin | Full access. Makes all financial decisions. Primarily uses Dashboard, Reports, Alper Account tab. |
| **Alper** | Editor (Manager) | Manages Karakol building. Records collections, views expenses. Cannot manage users or system settings. |
| **Hamid Bey** | Viewer | Reviews Tan Sokak building. Read-only. Can view dashboard and reports. Cannot edit any data. |

---

## 3. Role Definitions

### 3.1 Admin
- Full CRUD on all data (tenants, payments, expenses, Alper account)
- User management (add/edit/delete/deactivate users, reset PINs)
- App settings, backup/restore, sync configuration
- WhatsApp configuration
- Audit log access

### 3.2 Editor (Manager)
- Add/edit payments and expenses
- Add/edit tenants
- Send WhatsApp reminders
- View all reports and graphs
- Cannot: manage users, change system settings, delete records permanently

### 3.3 Viewer
- Dashboard read-only
- Reports and graphs read-only
- Cannot: edit any data, send reminders, access settings

### 3.4 Permission Matrix

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| View dashboard | ✅ | ✅ | ✅ |
| View reports | ✅ | ✅ | ✅ |
| Add payment | ✅ | ✅ | ❌ |
| Edit payment | ✅ | ✅ | ❌ |
| Add expense | ✅ | ✅ | ❌ |
| Edit expense | ✅ | ✅ | ❌ |
| Add tenant | ✅ | ✅ | ❌ |
| Edit tenant | ✅ | ✅ | ❌ |
| Send WA reminder | ✅ | ✅ | ❌ |
| View WA log | ✅ | ✅ | ❌ |
| Edit Alper account | ✅ | ❌ | ❌ |
| User management | ✅ | ❌ | ❌ |
| App settings | ✅ | ❌ | ❌ |
| Backup/restore | ✅ | ❌ | ❌ |
| Sync config | ✅ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ |

---

## 4. Buildings in Scope

| ID | Name | Units | Notes |
|----|------|-------|-------|
| GAYRETTEPE | Gayrettepe Binası | 25 (D1–D25) | 21 active tenants |
| KARAKOL | Karakol Binası | 9 (D1–D9) | Managed by Alper |
| TAN SOKAK | Tan Sokak Binası | 23 (D1–D23) | 22 active tenants |

---

## 5. Core Workflows

### 5.1 Monthly Payment Cycle
1. Month begins → Admin/Editor opens the relevant building page
2. Selects current month via month bar
3. For each tenant with a due payment, clicks "💳 Ödeme Gir"
4. Enters: amount, date, payment method (Banka/Elden/IBAN/Global/Nakit)
5. System calculates difference from expected rent
6. Dashboard updates collection rate in real time
7. After due date passes without payment: overdue alert shown, WA reminder available

### 5.2 Expense Recording
1. Admin/Editor navigates to building page or Tüm Giderler
2. Selects month
3. Clicks "+ Gider"
4. Enters: utility type, meter/bill number, amount, date
5. System subtracts from gross income to compute net

### 5.3 WhatsApp Reminder Flow
1. System detects unpaid tenants after due date + 1 day
2. WhatsApp page shows overdue list with stats
3. User edits tenant phone if missing
4. User clicks "💬 WhatsApp Gönder" → opens wa.me link with pre-filled message
5. System logs the send with timestamp (prevents duplicates within the same month)
6. If server.js is running with WA_TOKEN: reminders sent automatically every 5 minutes

### 5.4 Report Generation
1. User selects month
2. Opens Raporlar page
3. Three sections shown: per-building payment table + expense table
4. Actions: Print, CSV, Excel, per-payment PDF receipt (🧾)

### 5.5 Cloud Sync
1. Admin configures endpoint URL + API key in Bulut Sync modal
2. Data auto-pushes every 5 minutes if enabled
3. Manual Push (upload) and Pull (download) available
4. server.js provides the sync endpoint with Bearer auth

---

## 6. Feature Scope

### In Scope (v5)
- Multi-building management (Gayrettepe, Karakol, Tan Sokak)
- Per-tenant rent tracking with payment history
- Expense tracking per building per month
- Alper account reconciliation table (Karakol manager)
- Dashboard with KPI cards, collection gauge, sparkline, building ranking
- Analytics: monthly/yearly/comparison/heatmap charts
- WhatsApp reminder management with phone editing
- 3D data visualization (canvas-based bar chart)
- Command palette (Ctrl+K)
- Floating action button (FAB)
- PDF receipt generation (print window)
- CSV and Excel export
- JSON backup/restore
- Cloud sync (REST endpoint)
- Multi-user login with PIN authentication
- Role-based permissions (Admin/Editor/Viewer)
- User management (add/edit/delete/deactivate/reset PIN)
- Audit history timeline with filter
- App settings modal
- Inno Setup Windows installer

### Out of Scope (v5)
- Mobile/PWA version
- OCR bill import
- Automatic TÜFE/ENFE rent increase calculation
- Multi-language support (Turkish only)
- Payment gateway integration
- SMS notifications
- Native desktop app (Electron)

---

## 7. Sidebar / Navigation Behavior

### Structure
```
GENEL
  Dashboard        → page: dash
  Tüm Ödemeler     → page: pay
  Tüm Giderler     → page: exp
  Alper Hesabı     → page: alper
  Grafikler        → page: charts
  Analitik         → page: analytics  (added dynamically)
  WhatsApp         → page: wa
  Raporlar         → page: rep
  Geçmiş           → page: hist
  3D Görünüm       → page: viz

BİNALAR
  Gayrettepe       → page: bld / bld: GAYRETTEPE
  Karakol          → page: bld / bld: KARAKOL
  Tan Sokak        → page: bld / bld: TAN SOKAK

ARAÇLAR
  Bulut Sync       → openModal('cloud')
  Kullanıcılar     → openModal('users')   [Admin only visible]
  Ayarlar          → openModal('settings')
  CSV İndir        → exportCSV()
  Excel İndir      → exportExcel()
  JSON Yedek       → exportJSON()
  Yazdır           → window.print()
```

### Rules
- Exactly one nav item is `.active` at a time
- Active item shows a left blue border + blue text
- Hover: subtle glass background
- Icon animates on hover (scale + slight rotate)
- Badge (red number) on building items counts unpaid tenants for selected month
- No item may be dead/unresponsive. Unknown types show a "not configured" state.
- `openModal()` is the public alias for `openMod()` — always use `openModal` in HTML

---

## 8. Month / Date Selector Behavior

### Visual Structure
```
[‹]  [📅]  [2025] [Oca][Şub][Mar]…[Ara]  [---]  [2026] [Oca]…[Nis★]…  [›]
```
- Arrow buttons (‹ ›) on left and right scroll 160px per click
- Year tags act as visual separators (not clickable)
- Active month: blue background, slightly scaled
- Bar has gradient mask (transparent edges) to indicate scrollability

### Interaction Rules

| Method | Behavior |
|--------|----------|
| **Click month button** | Selects month, updates all pages, auto-scrolls into view |
| **Mouse drag** | Hold and drag left/right to scroll the bar |
| **Mouse wheel** | Vertical wheel → horizontal scroll |
| **Arrow buttons ‹ ›** | Scroll bar 160px per click (smooth) |
| **Keyboard ← →** | When a month button is focused, moves selection |

### Cross-Page Consistency
- Month state is stored in `S.month` (global)
- **All pages** that render data read from `S.month`
- Changing month on Dashboard also changes it on building pages, payments, expenses, reports
- After render, `scrollIntoView({inline:'center'})` is called automatically
- The month bar renders identically on: dash, pay, exp, bld, rep, alper, wa, charts, analytics

### Edge Cases
- Cannot select a future month that has no data (bar shows all months but data will be empty)
- Month bar must not cause page-level horizontal overflow
- Bar is `overflow-x:auto` inside a `flex:1` container; page body does not scroll horizontally
- Drag-to-scroll must not trigger month selection while dragging

---

## 9. Admin / User Management Requirements

### User Fields
- `id`: unique string (system-generated)
- `name`: display name
- `avatar`: 1–2 uppercase letters
- `role`: admin | manager | viewer
- `pin`: 4–6 digit numeric string
- `color`: hex color for avatar background
- `active`: boolean (soft delete)

### Admin Actions
- ✅ View all users in a table
- ✅ Add user (name, role, PIN, color)
- ✅ Edit user (name, avatar, role, color)
- ✅ Reset PIN (prompt with validation)
- ✅ Deactivate/reactivate (cannot deactivate yourself)
- ✅ Delete (cannot delete yourself; confirmation required)

### Security Rules
- PIN must be numeric, min 4 digits
- No two users may share the same PIN
- Admin cannot delete/deactivate their own account
- Deactivated users cannot log in
- All user changes are logged in audit history

---

## 10. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Tenant has no phone | WA button disabled, shows "📵 Telefon girilmedi" |
| Partial payment | Shown as amber "Kısmi" badge |
| Overpayment | Positive difference shown in green |
| Month with no data | Empty state shown, not crash |
| Cloud sync fails | Toast error shown, local data preserved |
| JSON restore with schema mismatch | Partial restore, known fields only |
| Deactivated user tries to login | Blocked at login screen |
| Admin opens unknown modal type | Error state shown, not silent fail |
| Expense tutar = 0 | Still valid, used for tracking purposes |
| Month bar at max scroll | Arrow button disabled (future: visual feedback) |

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Load time** | < 2 seconds cold start on typical Windows laptop |
| **Viewport** | 1366 × 768, 1440 × 900, 1600 × 900, 1920 × 1080 |
| **Browser** | Edge (app-mode, primary), Chrome (fallback) |
| **Offline** | Fully functional without internet (localStorage) |
| **Data persistence** | localStorage, auto-save every 30 seconds |
| **Cloud sync** | Every 5 minutes when configured |
| **Print** | A4 layout, sidebar/buttons hidden |
| **Accessibility** | Keyboard nav for month bar, focus states, form labels |
| **Performance** | Debounced search, paginated history (100 entries shown) |

---

## 12. Future Roadmap

### v6 Candidates
- TÜFE/ENFE automatic rent increase calculator
- OCR bill import (photo → expense)
- Excel/XLSX direct import (parse tenant data from spreadsheet)
- Email notifications as alternative to WhatsApp
- PWA / mobile browser support
- Native Electron packaging

### v7+ Candidates
- Multi-property (different owners/portfolios)
- Accounting module (cash flow, profit/loss statement)
- Tenant portal (tenant self-service payment confirmation)
- Bank statement reconciliation
- Turkish e-Fatura integration
