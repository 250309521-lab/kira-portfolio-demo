# Kira Takip Pro — Security Review
**Version:** 5.1 | **Classification:** Internal

---

## 1. Authentication Model

### Current Implementation
- **Method:** 4–6 digit numeric PIN per user
- **Storage:** Plain-text in `DATA.users[].pin` → `localStorage`
- **Login flow:** PIN compared with `===` in browser JS
- **Session:** `currentUser` variable in memory (cleared on page refresh)

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| PIN stored in plain-text in localStorage | **HIGH** | Anyone with browser DevTools access can read all PINs |
| No session timeout | **MEDIUM** | Leaving the app open on a shared machine is a risk |
| No brute-force protection | **LOW** | Local app only; no network exposure in offline mode |
| Short PIN (4 digits = 10,000 combinations) | **MEDIUM** | Acceptable for a local desktop app; not a web service |

### Recommendations (v6)
- Hash PINs with bcrypt or WebCrypto PBKDF2 before storage
- Add a 30-minute inactivity auto-logout
- Add rate limiting on PIN attempts (3 fails → 30-second lockout)
- Consider replacing PIN with a longer passphrase for admin

---

## 2. Password / PIN Storage

### Current (v5)
```javascript
// Stored as plain text:
DATA.users = [{ id:'malik', pin:'1234', ... }]
localStorage.setItem('ktp_v5', JSON.stringify(DATA))
```

### Recommended (v6)
```javascript
// Use WebCrypto PBKDF2:
async function hashPIN(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
// Store: { pinHash: "...", salt: "..." }
```

---

## 3. Role-Based Access Control

### Enforcement Points
- `canEdit()` — checked before any write operation
- `isAdmin()` — checked for user management, settings
- `openMod()` — non-edit types listed in `noEditTypes`
- HTML buttons hidden for non-editors (via `canEdit()` in templates)
- Sidebar items: Kullanıcılar not rendered for non-admins (no `nb-users` visibility check currently — **TODO**)

### Current Gap
The sidebar "Kullanıcılar" button is always rendered but `tplUsers()` hides admin-only actions. The button itself should also be hidden for non-admin users.

**Fix (v6):**
```javascript
// In initApp():
if (!isAdmin()) {
  document.getElementById('nb-users')?.style.setProperty('display', 'none');
}
```

---

## 4. Local Data Safety

### localStorage Risks
- Anyone with physical access to the machine + browser DevTools can read all data
- Tenants' personal information (names, phone numbers) is stored unencrypted
- Backup JSON files downloaded to disk are unencrypted

### Mitigations in Place
- App runs in Edge/Chrome app-mode (no browser URL bar or DevTools shortcut visible to casual users)
- Data is tenant financial data for a private owner — not publicly accessible

### Recommendations (v6)
- Encrypt localStorage value with a passphrase derived from admin PIN
- Provide option to clear app data from settings

---

## 5. WhatsApp / API Token Safety

### Current Risk
The WhatsApp Business API token (`WA_TOKEN`) is stored as an environment variable in `server.js` runtime — it is **not exposed in the frontend HTML**.

### Frontend
- The HTML never receives or stores `WA_TOKEN`
- The cloud API key (`DATA.cloud.key`) IS stored in localStorage
- When exporting JSON backup, `cloud.key` is included — **this is a risk if backup is shared**

### Recommendations
- Strip `cloud.key` from exported backups
- Consider using a server-side token proxy so the frontend never holds the cloud API key
- WA_TOKEN should be in a `.env` file, never committed to version control

---

## 6. Input Validation

### Current Implementation

| Input | Validation |
|-------|-----------|
| PIN | `length >= 4`, `/^\d+$/.test(pin)` |
| Tenant name | Non-empty check |
| Expense amount | `parseFloat()`, falls back to 0 |
| Phone number | `replace(/\D/g,'')` strips non-digits |
| Modal type | Unknown types show error state (not silently fail) |

### Gaps
- No maximum payment amount check (could enter 999,999,999)
- Tenant name not sanitised for XSS (rendered as `textContent` in most places — safe; `innerHTML` in some — **review needed**)
- Expense `no` (meter number) not validated — could be any string

### XSS Risk
Template literals using `${}` in `innerHTML` can execute scripts if input contains `<script>` tags.

**Current mitigation:** Most user-provided strings are short field values, unlikely to contain script tags.

**Recommended fix (v6):**
```javascript
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Use esc(t.name) instead of ${t.name} in innerHTML templates
```

---

## 7. Excel Import Sanitisation

(Currently not implemented — file reading is JSON only.)

**For future Excel import (v6):**
- Validate column headers match expected schema
- Reject files > 5MB
- Strip formula cells (`=CMD(...)` injection)
- Parse numeric fields with strict type checking
- Show import preview before committing data

---

## 8. Cloud API Key Exposure

- API key stored in `DATA.cloud.key` → localStorage → backup JSON
- Key is sent in Authorization header to the cloud endpoint
- Risk: If backup file is shared or localStorage is read, the key is compromised

**Recommendation:**
- Exclude `cloud.key` from backup exports
- Store cloud key separately (not in the main DATA object)

---

## 9. Privacy Considerations

### Data Stored
- Tenant full names, phone numbers, contract dates, deposit amounts
- Monthly payment amounts and dates
- Building addresses (implicit in building names)

### Who Can Access
- Anyone who opens the app on the same machine
- Anyone with the cloud sync endpoint and key
- Anyone who receives a backup JSON file

### Tenant Rights (KVKK compliance — Turkey)
- Tenants have not been informed their data is stored digitally
- A privacy notice should be added if the app is expanded or shared
- Recommend: add a privacy notice to the README

---

## 10. Backup File Protection

- Backup files are plain JSON, unencrypted
- Server-side backups stored as files in the server directory
- No password protection on backup files

**Recommendations:**
- Use AES-256 encryption for backup files in v6
- Add a download-with-passphrase option in the UI

---

## 11. Summary Risk Matrix

| Risk | Current Severity | Mitigated By | v6 Fix |
|------|-----------------|--------------|--------|
| Plain-text PINs | HIGH | Local-only app | PBKDF2 hashing |
| Unencrypted localStorage | HIGH | Physical access control | Passphrase encryption |
| XSS in templates | MEDIUM | Short inputs | `esc()` sanitiser |
| Cloud key in backup | MEDIUM | Internal use only | Strip from export |
| No inactivity timeout | MEDIUM | Single-user typical use | Auto-logout timer |
| WA token exposure | LOW | Server-side only | Env vars enforced |
| No brute-force protection | LOW | Local app | Rate limiting |
