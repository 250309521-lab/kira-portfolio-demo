# Kira Takip Pro — QA Test Matrix
**Version:** 5.1 | Format: Manual + Automated

---

## Legend
- **P** = Pass | **F** = Fail | **N/A** = Not applicable | **TODO** = Not yet tested
- **Priority:** 🔴 Critical | 🟡 High | 🟢 Medium | ⚪ Low

---

## 1. Layout & Responsiveness

| ID | Test | Viewport | Priority | Expected | Result |
|----|------|----------|----------|----------|--------|
| L-01 | App fills full viewport width | 1366×768 | 🔴 | No horizontal scrollbar on body | TODO |
| L-02 | App fills full viewport width | 1440×900 | 🔴 | No horizontal scrollbar on body | TODO |
| L-03 | App fills full viewport width | 1600×900 | 🔴 | No horizontal scrollbar on body | TODO |
| L-04 | App fills full viewport width | 1920×1080 | 🔴 | No horizontal scrollbar on body | TODO |
| L-05 | Sidebar fixed at 248px | All | 🔴 | Sidebar width does not change | TODO |
| L-06 | Main content uses remaining width | All | 🔴 | No gap / dark empty area on right | TODO |
| L-07 | KPI cards wrap cleanly | 1366px | 🟡 | Cards wrap to 2 rows, not clipped | TODO |
| L-08 | Tables scroll horizontally inside wrapper | All | 🔴 | Table scroll, page does not | TODO |
| L-09 | Panel (slide-over) is position:fixed | All | 🔴 | Opening panel does not shift layout | TODO |
| L-10 | Modal is position:fixed | All | 🔴 | Opening modal does not shift layout | TODO |
| L-11 | FAB visible and not clipped | All | 🟡 | FAB shows in bottom-right corner | TODO |
| L-12 | Topbar buttons visible | 1366px | 🟡 | "+ Ödeme" etc. not clipped by sidebar | TODO |

---

## 2. Sidebar Navigation

| ID | Test | Priority | Expected | Result |
|----|------|----------|----------|--------|
| N-01 | Dashboard link | 🔴 | Dashboard page renders | TODO |
| N-02 | Tüm Ödemeler link | 🔴 | Payment table renders | TODO |
| N-03 | Tüm Giderler link | 🔴 | Expense table renders | TODO |
| N-04 | Alper Hesabı link | 🔴 | Alper page renders | TODO |
| N-05 | Grafikler link | 🔴 | Charts page renders | TODO |
| N-06 | WhatsApp link | 🔴 | WA page renders | TODO |
| N-07 | Raporlar link | 🔴 | Reports page renders | TODO |
| N-08 | Geçmiş link | 🔴 | History timeline renders | TODO |
| N-09 | 3D Görünüm link | 🔴 | 3D canvas renders | TODO |
| N-10 | Gayrettepe building link | 🔴 | Building page renders | TODO |
| N-11 | Karakol building link | 🔴 | Building page renders | TODO |
| N-12 | Tan Sokak building link | 🔴 | Building page renders | TODO |
| N-13 | Bulut Sync opens modal | 🔴 | Cloud config modal opens | TODO |
| N-14 | Kullanıcılar opens modal (Admin) | 🔴 | User management modal opens | TODO |
| N-15 | Ayarlar opens modal | 🔴 | Settings modal opens | TODO |
| N-16 | CSV İndir triggers download | 🔴 | .csv file downloaded | TODO |
| N-17 | Excel İndir triggers download | 🔴 | .xls file downloaded | TODO |
| N-18 | JSON Yedek triggers download | 🔴 | .json file downloaded | TODO |
| N-19 | Yazdır opens print dialog | 🔴 | Browser print dialog opens | TODO |
| N-20 | Active state correct | 🟡 | Only clicked item shows active | TODO |
| N-21 | Building badge counts unpaid | 🟡 | Red badge shows count | TODO |
| N-22 | Kullanıcılar hidden from viewer | 🟡 | Viewer cannot see user mgmt | TODO |

---

## 3. Month / Date Selector

### 3.1 Click Selection
| ID | Test | Priority | Expected |
|----|------|----------|----------|
| M-01 | Click "Nis" in 2026 | 🔴 | S.month = "Nisan 2026", data updates |
| M-02 | Active month highlighted | 🔴 | Blue border on active month button |
| M-03 | Selected month auto-scrolls into view | 🟡 | Active button visible without manual scroll |
| M-04 | Month change updates dashboard KPIs | 🔴 | Cards show new month data |
| M-05 | Month change updates building page | 🔴 | Tenant table reflects new month |
| M-06 | Month change updates reports | 🔴 | Report shows new month |

### 3.2 Drag-to-Scroll
| ID | Test | Priority | Expected |
|----|------|----------|----------|
| M-10 | Mousedown + move left scrolls bar left | 🔴 | Bar scrolls smoothly |
| M-11 | Mousedown + move right scrolls bar right | 🔴 | Bar scrolls smoothly |
| M-12 | Release mouse ends drag | 🔴 | No further scroll |
| M-13 | Small drag does not select month | 🟡 | Month unchanged after micro-drag |
| M-14 | Cursor changes to grabbing during drag | ⚪ | Cursor: grabbing |
| M-15 | Mouse leave cancels drag | 🟡 | No stuck drag after leaving bar |

### 3.3 Wheel Scroll
| ID | Test | Priority | Expected |
|----|------|----------|----------|
| M-20 | Mouse wheel down scrolls bar right | 🔴 | Bar scrolls horizontally |
| M-21 | Mouse wheel does not scroll page | 🔴 | Page stays at top |
| M-22 | Trackpad horizontal swipe scrolls bar | 🟡 | Bar scrolls |

### 3.4 Arrow Buttons
| ID | Test | Priority | Expected |
|----|------|----------|----------|
| M-30 | [‹] button scrolls bar left 160px | 🔴 | Smooth scroll left |
| M-31 | [›] button scrolls bar right 160px | 🔴 | Smooth scroll right |
| M-32 | Clicking arrow does not change selected month | 🟡 | S.month unchanged |

### 3.5 Keyboard Navigation
| ID | Test | Priority | Expected |
|----|------|----------|----------|
| M-40 | Tab focuses month button | 🟡 | Focus visible |
| M-41 | ArrowRight selects next month | 🟡 | S.month advances one |
| M-42 | ArrowLeft selects previous month | 🟡 | S.month goes back one |
| M-43 | ArrowRight at last month does nothing | ⚪ | No error |

### 3.6 Cross-Page Consistency
| ID | Test | Priority | Expected |
|----|------|----------|----------|
| M-50 | Change month on Dashboard → navigate to Raporlar | 🔴 | Same month selected |
| M-51 | Change month on building page → navigate to Dashboard | 🔴 | Same month selected |
| M-52 | Month bar identical on all pages | 🟡 | Same HTML structure |

---

## 4. User Management (Kullanıcılar)

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| U-01 | Admin opens Kullanıcılar | 🔴 | User table shown with 3 default users |
| U-02 | Add user - all fields filled | 🔴 | User added, appears in table |
| U-03 | Add user - missing name | 🔴 | Error: "İsim zorunlu" |
| U-04 | Add user - PIN < 4 digits | 🔴 | Error: "PIN en az 4 haneli" |
| U-05 | Add user - non-numeric PIN | 🔴 | Error: "PIN sadece rakam" |
| U-06 | Add user - duplicate PIN | 🟡 | Error toast shown |
| U-07 | Edit user name | 🔴 | Name updated in table |
| U-08 | Edit user role | 🔴 | Role badge updated |
| U-09 | Reset PIN - valid 4-digit | 🔴 | PIN updated, audit logged |
| U-10 | Reset PIN - non-numeric | 🔴 | Error shown |
| U-11 | Deactivate user | 🔴 | Status shows "Pasif", logged |
| U-12 | Reactivate user | 🔴 | Status shows "Aktif" |
| U-13 | Deactivate yourself | 🔴 | Error: "Kendini devre dışı bırakamazsın" |
| U-14 | Delete user - confirm | 🔴 | User removed |
| U-15 | Delete user - cancel | 🔴 | No change |
| U-16 | Delete yourself | 🔴 | Error: "Kendinizi silemezsiniz" |
| U-17 | Viewer cannot see Add/Edit/Delete | 🔴 | Buttons hidden |
| U-18 | Changes logged in Geçmiş | 🟡 | Audit entry created |

---

## 5. Payments

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| P-01 | Add full payment | 🔴 | Status → Ödendi, KPI updates |
| P-02 | Add partial payment | 🔴 | Status → Kısmi (amber) |
| P-03 | Add zero payment | 🔴 | Status → Ödenmedi |
| P-04 | Overpayment | 🟡 | Positive diff shown in green |
| P-05 | Payment for different month | 🔴 | Correct month updated |
| P-06 | Edit existing payment | 🔴 | Values overwritten |
| P-07 | Collection rate updates | 🔴 | Dashboard gauge updates |
| P-08 | Audit log entry created | 🟡 | Entry in Geçmiş |
| P-09 | Cloud push triggered | ⚪ | If cloud enabled, push fires |
| P-10 | Viewer cannot add payment | 🔴 | "+ Ödeme" button hidden |

---

## 6. Expenses

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| E-01 | Add expense | 🔴 | Appears in building expense table |
| E-02 | Net income recalculates | 🔴 | Net = paid - expenses updated |
| E-03 | Edit expense inline (double-click) | 🟡 | Value updated on blur |
| E-04 | Delete expense | 🔴 | Removed, net recalculates |
| E-05 | Add expense with meter number | 🟡 | No stored |
| E-06 | Expense total shown in footer | 🟡 | Sum matches individual rows |
| E-07 | Viewer cannot add/edit/delete | 🔴 | Buttons hidden |

---

## 7. Reports & Export

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| R-01 | Report shows all 3 buildings | 🔴 | All sections rendered |
| R-02 | Print hides sidebar/buttons | 🟡 | Clean print layout |
| R-03 | CSV download | 🔴 | File downloaded, valid format |
| R-04 | Excel download | 🔴 | .xls file, opens in Excel |
| R-05 | PDF receipt generated | 🔴 | Print window opens |
| R-06 | Receipt shows correct data | 🔴 | Tenant name, amount, date correct |

---

## 8. WhatsApp Reminders

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| WA-01 | Overdue tenants listed | 🔴 | Shows all unpaid after due date |
| WA-02 | Tenant with no phone | 🔴 | "📵 Telefon girilmedi" shown |
| WA-03 | Add phone number inline | 🔴 | Phone saved, WA button active |
| WA-04 | Send WA opens wa.me link | 🔴 | New tab opens with correct URL |
| WA-05 | Log entry created after send | 🔴 | WALogEntry added |
| WA-06 | Already sent badge shown | 🟡 | "✓ Gönderildi" badge visible |
| WA-07 | Stats bar shows correct counts | 🟡 | Numbers match list |
| WA-08 | Send all button works | 🟡 | Opens wa.me for each with phone |

---

## 9. Cloud Sync

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| S-01 | Configure valid URL + key | 🔴 | Saved, green dot shown |
| S-02 | Push sends correct data | 🔴 | Server receives DATA |
| S-03 | Pull receives and applies data | 🔴 | Local data updated |
| S-04 | Sync failure shows toast | 🔴 | Error toast, local data intact |
| S-05 | Auto-sync fires every 5min | 🟡 | Server log shows periodic saves |
| S-06 | Last sync time shown | 🟡 | Timestamp in sidebar |

---

## 10. Backup / Restore

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| B-01 | JSON backup downloads | 🔴 | File downloaded |
| B-02 | JSON restore works | 🔴 | Data visible after restore |
| B-03 | Restore with corrupted JSON | 🔴 | Error toast, no crash |
| B-04 | Data persists after browser refresh | 🔴 | localStorage retains data |
| B-05 | Auto-save every 30 seconds | 🟡 | localStorage updated |

---

## 11. Command Palette

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| CMD-01 | Ctrl+K opens palette | 🔴 | Overlay visible |
| CMD-02 | Typing filters results | 🔴 | Relevant items shown |
| CMD-03 | Arrow keys navigate | 🟡 | Selected item highlighted |
| CMD-04 | Enter executes action | 🟡 | Action fires, palette closes |
| CMD-05 | Esc closes palette | 🔴 | Overlay hidden |
| CMD-06 | Tenant search by name | 🔴 | Matching tenants shown |

---

## 12. Installer (Windows)

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| I-01 | KiraTakip_Ac.bat opens app | 🔴 | Edge/Chrome app-mode opens |
| I-02 | Inno Setup compiles without errors | 🟡 | .exe created |
| I-03 | Installer runs on clean Windows | 🟡 | No errors, desktop shortcut created |
| I-04 | App opens from desktop shortcut | 🟡 | App loads correctly |
| I-05 | App opens at correct window size | ⚪ | 1600×950 window |

---

## 13. Role Permissions (Integration)

| ID | Test | Priority | Expected |
|----|------|----------|----------|
| RP-01 | Admin can do everything | 🔴 | All actions available |
| RP-02 | Editor cannot manage users | 🔴 | User modal: no edit/delete |
| RP-03 | Editor cannot access settings danger zone | 🔴 | Reset button hidden |
| RP-04 | Viewer cannot add/edit any data | 🔴 | All write buttons hidden |
| RP-05 | Viewer sees dashboard + reports | 🔴 | Read-only pages accessible |
| RP-06 | Deactivated user cannot login | 🔴 | PIN rejected |
