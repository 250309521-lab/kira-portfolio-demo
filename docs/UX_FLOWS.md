# Kira Takip Pro — UX Flows
**Version:** 5.1

---

## 1. Login Flow

```
App opens → Login Screen shown
  → User clicks their name card
  → PIN input appears (4–6 digit, numeric)
  → User types PIN
  → Correct PIN → App loads, sidebar user bar shows name + role
  → Wrong PIN  → Error shown 2 seconds, input cleared
  → Deactivated user → Cannot select (should show "Pasif" state)
```

**Edge cases:**
- If user was deactivated since last login, they can still select but PIN will fail (active check)
- Login screen does not reveal which PINs belong to which users

---

## 2. Month / Year Selection

### 2.1 Normal Click
```
User sees month bar: [‹] [2025: Oca Şub Mar ... Ara] [---] [2026: Oca Şub Mar Nis★ ...] [›]
  → Clicks "Haz" in 2026
  → S.month = "Haziran 2026"
  → render() called → all data refreshed for that month
  → Active month scrolls into view (scrollIntoView, inline: center)
```

### 2.2 Drag-to-Scroll
```
User presses and holds mouse on month bar
  → _mbar.dragging = true, records startX + scrollLeft
  → User moves mouse left (towards past months)
  → Bar scrolls right (towards newer months)  
  → User releases mouse
  → _mbar.dragging = false
  → No month selection triggered if moved > threshold
```
> Note: clicking without moving always selects month.

### 2.3 Mouse Wheel Scroll
```
User hovers over month bar
  → Scrolls mouse wheel down/up
  → mbarWheel() calls e.preventDefault() to stop page scroll
  → bar.scrollLeft += e.deltaY
  → Bar scrolls horizontally
```

### 2.4 Arrow Button Navigation
```
User clicks [‹] (left arrow)
  → mbarScroll(barId, -160)
  → bar.scrollBy({left: -160, behavior: 'smooth'})
  
User clicks [›] (right arrow)
  → mbarScroll(barId, 160)
  → bar.scrollBy({left: 160, behavior: 'smooth'})
```

### 2.5 Keyboard Navigation
```
User tabs to a month button
  → Presses ArrowRight → setMo(nextMonth)
  → Presses ArrowLeft  → setMo(prevMonth)
  → Presses Enter      → same as click
```

### 2.6 Cross-Page Consistency
```
User is on Dashboard, month = "Mart 2026"
  → Navigates to Tüm Ödemeler
  → Month bar still shows "Mart 2026" selected
  → Data shown for Mart 2026
  
User changes month on building page
  → Navigates to Raporlar
  → Same month is active
```

---

## 3. Adding a Payment

```
Any page: Click "+ Ödeme" in topbar (or FAB → Ödeme Ekle, or 💳 button in table)
  → openModal('pay-add') called
  → Modal opens with:
      Bina dropdown (pre-selected if from building page)
      Kiracı dropdown (filtered by selected building)
      Dönem dropdown (pre-selected to S.month)
      Tutar field (pre-filled with tenant rent)
      Tarih (today's date)
      Ödeme Şekli (Banka default)
      Not (free text)
  → User adjusts as needed
  → Clicks "💾 Kaydet"
  → setP(tenantId, month, {paid, date, sekil, notes})
  → autoRecalc() → dashboard updates
  → addHist() → audit log entry
  → toast "✅ Ödeme kaydedildi"
  → If cloud enabled: cloudSync('push')
```

**Editing an existing payment:**
Same flow — if a payment already exists for that tenant+month, it is overwritten.

---

## 4. Adding an Expense

```
Building page or Tüm Giderler: Click "+ Gider"
  → openModal('exp-add') called with building pre-selected
  → Modal: Bina, Dönem, Gider Türü (with datalist), Sayaç No, Tutar, Tarih, Not
  → User fills in (Tutar is required)
  → Saves → expense pushed to DATA.expenses[bld][month]
  → autoRecalc() called → net figures updated
  → addHist() → audit log
  → toast "✅ Gider kaydedildi"
```

**Editing inline (double-click):**
```
User double-clicks expense Tutar cell in table
  → Cell becomes contentEditable
  → User types new value, presses Enter or clicks away
  → blur() handler fires → value parsed → expense updated
  → autoRecalc() → render()
```

---

## 5. Overdue Detection Flow

```
render() called for any page
  → isDue(tenant, month) checked for each active tenant
  → isDue: now > (month's due date + 1 day) AND paid < rent
  → Overdue tenants shown with 🔴 blink indicator in tables
  → Dashboard: "Gecikmiş Ödemeler" section with red alert cards
  → WA button shown inline
```

---

## 6. WhatsApp Reminder Flow

### Manual Send
```
WhatsApp page opened (goto('wa'))
  → Overdue list built from all buildings
  → Stats shown: total debtors / not sent / sent / no phone
  
For each overdue tenant:
  → Phone field shown (editable inline)
  → Pre-built message shown in green box
  → User clicks "💬 WhatsApp Gönder"
    → waSendAndLog(bname, tid, month, phone, msg) called
    → window.open('https://wa.me/{phone}?text={encodedMsg}', '_blank')
    → logWA() called → WALogEntry added
    → toast "💬 WhatsApp açıldı"
  → Next time page loads: "✓ Gönderildi" badge shown for that tenant
```

### Phone Number Update
```
User sees "📵 Telefon girilmedi" for a tenant
  → Edits the phone input inline on WA page
  → onblur/onchange fires → updateTenantPhone(bname, tid, value)
  → tenant.phone updated → saveLocal()
  → toast "📱 Telefon kaydedildi"
  → WA button becomes active
```

### Automated (server.js)
```
server.js starts with WA_TOKEN + WA_PHONE_NUMBER_ID env vars
  → reminderWorker() runs every 5 minutes
  → For each active tenant with phone, unpaid, gun+1 passed:
    → Check sent_reminders.json for current month key
    → If not sent: POST to WhatsApp Cloud API
    → Log to sent_reminders.json
    → Console: "✅ Sent to {name}"
```

---

## 7. Report Export Flow

### Print
```
User on Raporlar page → clicks "🖨️ Yazdır"
  → window.print() called
  → Print CSS hides: sidebar, topbar, buttons, FAB, toasts, modals
  → Tables and cards render in A4-friendly layout
```

### CSV Export
```
exportCSV() called
  → Iterates all buildings + tenants for S.month
  → Appends expenses section
  → UTF-8 BOM prefix added
  → Blob → downloadlink → click
  → Filename: KiraTakip_Nisan_2026.csv
```

### Excel Export
```
exportExcel() called  
  → Same as CSV but MIME type: application/vnd.ms-excel
  → Extension: .xls (Excel opens natively)
  → Includes: tenants, payments, expenses, Alper table
  → addHist() logs the export
```

### PDF Receipt
```
User on Raporlar page, finds tenant with payment
  → Clicks "🧾 Makbuz"
  → generateReceipt(bname, tid, month) called
  → New window.open() with full HTML receipt
  → window.onload → window.print() auto-triggers
  → Receipt includes: tenant name, unit, month, amount, date, method, receipt number
```

---

## 8. Backup / Restore Flow

### JSON Backup
```
exportJSON() called (sidebar or settings modal)
  → JSON.stringify(DATA) → Blob
  → Download as KiraTakip_Yedek_2026-05-12.json
  → addHist() logged
```

### JSON Restore
```
Settings modal → "📥 JSON Yükle" → file input
  → importJSON(fileInput) called
  → FileReader reads file
  → JSON.parse(content)
  → Known fields merged into DATA
  → autoRecalc() → saveLocal() → render()
  → toast "✅ Veri yüklendi"
```

---

## 9. Cloud Sync Flow

### Configure
```
Bulut Sync modal → enter API URL + API Key → Save
  → DATA.cloud.url + DATA.cloud.key saved
  → updateCloudUI() → shows green dot if previously connected
```

### Push
```
cloudSync('push') called (manual or auto every 5min)
  → S.syncing = true → cloud dot shows spinner
  → fetch(url, {method:'POST', body: JSON.stringify(DATA), Authorization: Bearer key})
  → Success → DATA.cloud.lastSync updated → toast
  → Failure → toast with error message → local data untouched
```

### Pull
```
cloudSync('pull') called
  → fetch(url, {method:'GET', Authorization: Bearer key})
  → Remote data merged into DATA
  → saveLocal() → render() → updateBadges()
  → toast "☁️ Senkron tamam"
```

---

## 10. User Management Flow

```
Admin clicks "Kullanıcılar" in sidebar
  → openModal('users') called
  → tplUsers() renders user table
  → Each row: avatar, name, role badge, PIN dots, status, actions

Add User:
  Admin → "+ Ekle" → showAddUserForm() → inline form appears
  → Name*, role, PIN* (4-6 numeric), color
  → saveNewUser() → validates → pushes to DATA.users → refreshes table

Edit User:
  → "✏️ Düzenle" → editUserInline(i) → inline form with pre-filled values
  → saveEditUser2(i) → updates user → refreshes

Reset PIN:
  → "🔑 PIN" → prompt dialog → validates numeric 4+ digits
  → resetUserPIN(i) → updates → audit log

Deactivate:
  → "⏸" button → toggleUserActive(i)
  → Confirmation not needed (simple toggle)
  → Cannot deactivate yourself

Delete:
  → "🗑" button → delUserConfirm(i)
  → confirm() dialog: "Bu işlem geri alınamaz"
  → Cannot delete yourself
  → Splice from array → audit log
```

---

## 11. Sidebar Navigation Flow

```
User clicks any nav item
  → goto(page, bld?) called
  → S.page = page, S.bld = bld
  → S.search = '' (reset search)
  → document.querySelectorAll('.nav').forEach → remove .active
  → Add .active to correct element
  → Update topbar h2 title
  → render() called → content area updates
  → updateBadges() → refresh building unread counts
  → Month bar renders in new page with same S.month
  → Auto-scroll active month into view (30ms timeout)
```

---

## 12. Command Palette Flow (Ctrl+K)

```
User presses Ctrl+K (or Cmd+K on Mac)
  → openCMD() called
  → Overlay + box visible
  → Input focused
  → cmdSearch('') → shows default 6 actions
  
User types "gay"
  → Filters tenants matching "gay" + buildings matching "Gayrettepe"
  → Shows tenant matches with status badge
  → Shows building "Gayrettepe" match

User presses ↓↑
  → Selected index changes, item highlighted

User presses Enter or clicks item
  → cmdRun(idx) → action executed
  → Overlay closes
  
User presses Esc
  → closeKbd() → overlay closes
```

---

## 13. Admin Settings Flow

```
User (admin) clicks "Ayarlar" in sidebar
  → openModal('settings') called
  → tplSettings() renders:
      Auto-save toggle
      Data management buttons (JSON, CSV, Excel, import)
      Danger zone (only admin): Reset all data

Non-admin users: settings modal shows limited view (no danger zone)
```
