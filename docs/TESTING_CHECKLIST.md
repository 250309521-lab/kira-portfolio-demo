# Kira Takip Pro — Testing Checklist
**Version:** 5.1.0 | Use before every release

---

## Pre-Release Checklist

Run before creating any release build:
```bash
npm test              # 35 unit tests
npm run test:integrity # 63 integrity tests
```
Both must pass with 0 failures.

---

## 1. Build & Packaging ☐

- [ ] `npm run build:dir` completes without errors
- [ ] `dist/win-unpacked/Kira Takip Pro.exe` exists
- [ ] `npm run build` creates `dist/KiraTakipPro-Setup-5.1.0.exe`
- [ ] `dist/KiraTakipPro-5.1.0-portable.exe` exists
- [ ] App icon appears on installer (not default Electron icon)
- [ ] App launches from installer shortcut
- [ ] App version shows `5.1.0` in About page
- [ ] Uninstall does NOT delete `%APPDATA%\kira-takip-pro\`

---

## 2. First Launch ☐

- [ ] Login screen appears on first launch
- [ ] Default users present: Malik/Alper/Hamid Bey
- [ ] PIN `1234` logs in as Admin
- [ ] PIN `5678` logs in as Editor
- [ ] PIN `9999` logs in as Viewer
- [ ] Wrong PIN shows error message
- [ ] Deactivated user PIN is rejected
- [ ] Dashboard loads with building data after login

---

## 3. Layout at All Resolutions ☐

Test at each viewport:

### 1366 × 768
- [ ] No horizontal scrollbar on body
- [ ] Sidebar visible at ~236px
- [ ] Content area fills remaining width
- [ ] KPI cards wrap cleanly (3-column)
- [ ] Topbar buttons visible
- [ ] Month bar single row, scrollable

### 1440 × 900
- [ ] Same as above, 4-column KPI grid
- [ ] Tables scroll horizontally (not page)

### 1600 × 900
- [ ] 4-5 column KPI grid
- [ ] All dashboard sections visible

### 1920 × 1080
- [ ] 5+ column KPI grid
- [ ] No empty/wasted space

---

## 4. Sidebar Navigation ☐

Every item must work — click each one:
- [ ] Dashboard → dashboard page
- [ ] Tüm Ödemeler → payment table
- [ ] Tüm Giderler → expense table
- [ ] Alper Hesabı → Alper reconciliation page
- [ ] Grafikler → charts page (Chart.js renders)
- [ ] Analitik → analytics page (if added)
- [ ] WhatsApp → WA reminder page
- [ ] Raporlar → reports page
- [ ] Geçmiş → history timeline
- [ ] 3D Görünüm → 3D canvas renders
- [ ] Gayrettepe → building detail page
- [ ] Karakol → building detail page
- [ ] Tan Sokak → building detail page
- [ ] Bulut Sync → modal opens
- [ ] Kullanıcılar → modal opens (Admin only)
- [ ] Ayarlar → modal opens
- [ ] CSV İndir → file downloads
- [ ] Excel İndir → .xls file downloads
- [ ] JSON Yedek → .json file downloads
- [ ] Yazdır → print dialog opens
- [ ] Hakkında / Veriler → About page shows (if added)

---

## 5. Month / Date Selector ☐

- [ ] Month bar single row (never wraps)
- [ ] Drag left → bar scrolls right (towards future)
- [ ] Drag right → bar scrolls left (towards past)
- [ ] Mouse wheel scrolls bar horizontally
- [ ] ‹ button scrolls 160px left
- [ ] › button scrolls 160px right
- [ ] Clicking a month button changes data
- [ ] Active month highlighted in blue
- [ ] Active month visible after page navigation
- [ ] Month state preserved across pages (Dashboard → Reports → same month)
- [ ] Keyboard ← → works when month is focused
- [ ] Bar never causes page-level horizontal scroll

---

## 6. Payments ☐

- [ ] "+ Ödeme" opens modal
- [ ] Building dropdown pre-selected from context
- [ ] Tenant dropdown filters by building
- [ ] Month defaults to current S.month
- [ ] Amount pre-fills tenant rent
- [ ] Save updates dashboard KPIs
- [ ] Partial payment shows amber "Kısmi" badge
- [ ] Full payment shows green "Ödendi" badge
- [ ] Zero/no payment shows "Ödenmedi"
- [ ] Payment appears in tenant row
- [ ] Audit history entry created
- [ ] Editor role can add payments
- [ ] Viewer role cannot add payments (button hidden)

---

## 7. Expenses ☐

- [ ] "+ Gider" opens modal
- [ ] Expense appears in building expense table
- [ ] Net income updates after adding expense
- [ ] Delete expense requires confirmation
- [ ] Inline double-click edit works
- [ ] Expense total shown in table footer
- [ ] Viewer cannot add/edit/delete expenses

---

## 8. Tenant Management ☐

- [ ] "+ Kiracı" opens modal
- [ ] Required fields validated (name, unit, rent)
- [ ] Tenant appears in building page
- [ ] Edit tenant (pencil icon) updates fields
- [ ] Remove tenant shows confirmation
- [ ] Vacant units show rent ₺0 and gray status

---

## 9. User Management (Kullanıcılar) ☐

- [ ] User table shows 3 default users
- [ ] Add user: all fields required validated
- [ ] Add user: PIN minimum 4 digits enforced
- [ ] Add user: duplicate PIN rejected
- [ ] Edit user: name/role/color updates
- [ ] Reset PIN: minimum 4 digits validated
- [ ] Reset PIN: numeric-only validated
- [ ] Deactivate user: status changes to "Pasif"
- [ ] Reactivate user: status changes to "Aktif"
- [ ] Cannot deactivate yourself
- [ ] Delete user: confirmation required
- [ ] Cannot delete yourself
- [ ] All changes appear in Geçmiş

---

## 10. Admin Settings ☐

- [ ] Auto-save toggle saves to settings
- [ ] JSON Import works with valid file
- [ ] JSON Import validates file format
- [ ] JSON Import shows warning for missing sections
- [ ] Reset all data requires confirmation
- [ ] Danger zone only visible to Admin

---

## 11. WhatsApp ☐

- [ ] Overdue tenants listed correctly
- [ ] Tenant without phone shows "📵 Telefon girilmedi"
- [ ] Phone number editable inline
- [ ] Phone save toast shown
- [ ] WA button opens wa.me in new tab
- [ ] Already-sent badge shown for logged reminders
- [ ] WA stats bar counts correct
- [ ] Send all button sends to pending tenants only

---

## 12. Reports & Export ☐

- [ ] Report shows all 3 buildings
- [ ] Report data matches dashboard
- [ ] 🧾 Makbuz button opens print window
- [ ] Receipt shows correct tenant/amount/date
- [ ] Print: sidebar hidden, clean layout
- [ ] CSV downloads with correct data
- [ ] Excel downloads and opens in Excel
- [ ] PDF receipt renders in print window

---

## 13. Graphs & Analytics ☐

- [ ] Charts page: 4+ charts render
- [ ] Charts use correct data for selected month
- [ ] Analytics heatmap renders
- [ ] Analytics yearly chart renders
- [ ] Smart widgets show correct values
- [ ] Collection gauge shows correct %
- [ ] Sparkline trend shows last 6 months

---

## 14. Cloud Sync ☐

- [ ] Bulut Sync modal opens with two tabs
- [ ] "Kira Takip Sunucu" tab shows login form
- [ ] Server URL + username + password → Bağlan works
- [ ] "✅ Bağlandı" message after successful login
- [ ] Pull downloads server data
- [ ] Push sends local data to server
- [ ] 409 Conflict shows toast with guidance
- [ ] Server unreachable shows error toast
- [ ] Local data unchanged on server failure
- [ ] Last sync time updates after sync
- [ ] Auto-sync fires every 5 minutes (check server log)

---

## 15. Data Persistence (Electron) ☐

- [ ] Close app → reopen → all data present
- [ ] SQLite DB at `%APPDATA%\kira-takip-pro\kiratakip.db`
- [ ] Backup created on shutdown (`backup-*-shutdown.db`)
- [ ] Backup created every 5 minutes
- [ ] About page shows correct DB path
- [ ] About page shows correct backup folder
- [ ] "Şimdi Yedekle" creates backup file
- [ ] "Yedek Klasörü" opens correct folder

---

## 16. Role Permissions ☐

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| Add payment | ✅ | ✅ | ❌ |
| Add expense | ✅ | ✅ | ❌ |
| Edit tenant | ✅ | ✅ | ❌ |
| Send WA | ✅ | ✅ | ❌ |
| User management | ✅ | ❌ | ❌ |
| App settings | ✅ | ❌ | ❌ |
| View reports | ✅ | ✅ | ✅ |
| View dashboard | ✅ | ✅ | ✅ |

---

## 17. Safety Confirmations ☐

- [ ] Delete tenant → confirm()
- [ ] Delete expense → confirm()
- [ ] Delete user → confirm()
- [ ] Deactivate user → toggle (no confirm needed, reversible)
- [ ] Reset all data → confirm() with warning text
- [ ] JSON import with missing sections → confirm()
- [ ] Restore backup → confirm()

---

## 18. Audit & Logs ☐

- [ ] Login creates history entry
- [ ] Payment added → history entry with tenant name
- [ ] Expense added → history entry
- [ ] User added/edited/deleted → history entry
- [ ] WA sent → WA log entry
- [ ] Cloud push → history entry with version
- [ ] All entries have timestamp
- [ ] All entries have user attribution
- [ ] History shows in timeline with icons

---

## 19. Error Handling ☐

- [ ] Wrong PIN → clear error message
- [ ] Empty form fields → validation message
- [ ] Invalid JSON import → error toast
- [ ] Server unreachable → error toast
- [ ] Sync conflict → descriptive toast with version numbers
- [ ] All errors logged (check `%APPDATA%\kira-takip-pro\app.log`)

---

## 20. Print Layout ☐

- [ ] Ctrl+P or Yazdır → sidebar hidden
- [ ] Topbar hidden
- [ ] Buttons hidden
- [ ] Month bar hidden
- [ ] Tables visible with borders
- [ ] KPI cards visible
- [ ] No cut-off content

---

## Sign-off

| Area | Tester | Date | Status |
|------|--------|------|--------|
| Build & Packaging | | | |
| Layout (1366/1440/1600/1920) | | | |
| Sidebar Navigation (19 items) | | | |
| Month Bar (drag/wheel/arrow) | | | |
| Payments | | | |
| Expenses | | | |
| User Management | | | |
| Reports & Export | | | |
| Cloud Sync | | | |
| Data Persistence | | | |
| Role Permissions | | | |
| Safety Confirmations | | | |
| **Overall** | | | |
