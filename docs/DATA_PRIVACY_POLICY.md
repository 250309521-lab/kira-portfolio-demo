# Kira Takip Pro — Data Privacy Policy
**Version:** 5.1 | **Jurisdiction:** Republic of Turkey (KVKK)

---

## 1. Data Controller

The data controller is the building owner (Malik) who operates this application for the purpose of managing rental properties in Istanbul, Turkey.

---

## 2. What Data Is Stored

### 2.1 Tenant Data
| Field | Example | Purpose |
|-------|---------|---------|
| Full name | "Emir Can İpek" | Identification |
| Unit number | "D1" | Assignment |
| Phone number | "905312345678" | WhatsApp reminders |
| Monthly rent | 30,000 TRY | Financial tracking |
| Deposit amount | 30,000 TRY | Financial tracking |
| Contract dates | "2025-09-20" | Lease management |
| Payment history | Amount, date, method | Accounting |
| Notes | Free text | Context |

### 2.2 Financial Data
| Type | Details |
|------|---------|
| Rent payments | Amount, date, method per tenant per month |
| Expenses | Utility bills, maintenance costs per building per month |
| Net income | Derived calculations per month |
| Exchange rates | EUR/TRY rates recorded at time of entry |

### 2.3 User Account Data
| Field | Notes |
|-------|-------|
| Name | Display name only |
| PIN | 4–6 digit numeric (currently plain-text — see Security Review) |
| Role | admin / manager / viewer |
| Avatar | Initial letter |
| Color | UI preference |
| Active status | Whether account can log in |

### 2.4 Operational Logs
| Type | Content |
|------|---------|
| Audit history | Action descriptions, timestamps, user names |
| WhatsApp log | Building, unit, name, month of reminders sent |
| Cloud sync timestamps | Last successful sync time |

---

## 3. Where Data Is Stored

### Primary Storage
```
Location:    Browser localStorage (on the operator's Windows machine)
Key:         "ktp_v5"
Format:      JSON
Encryption:  None (v5)
Access:      Anyone with physical or remote access to the machine
```

### Secondary Storage (if cloud sync configured)
```
Location:    REST API endpoint (configured by admin)
Format:      JSON over HTTPS
Access:      Anyone with the API key
Retention:   As configured by endpoint provider
```

### Backup Files
```
Location:    Windows Downloads folder (manual exports)
             USB drive / cloud storage (if admin uses this)
             server.js directory (automated server backups)
Format:      Unencrypted JSON
Access:      Anyone with file system access
```

---

## 4. Who Can Access the Data

| Person | Access Level | Conditions |
|--------|-------------|------------|
| **Malik (Admin)** | Full | Has machine access + admin PIN |
| **Alper (Editor)** | Full read + edit | Has editor PIN |
| **Hamid Bey (Viewer)** | Read-only dashboard/reports | Has viewer PIN |
| **IT/Technical staff** | Full (via DevTools) | Physical machine access |
| **Cloud endpoint operator** | Full data if key known | Not applicable for jsonbin.io |

---

## 5. Tenant Privacy

### What Tenants Are Not Told
Currently, tenants are not informed that:
- Their personal data (name, phone) is stored in this system
- Their payment history is recorded
- Their phone numbers may be used to send WhatsApp messages

### KVKK Obligations (Turkey)
Under Turkish Personal Data Protection Law (KVKK No. 6698):
- Tenants should be informed about data collection
- A written disclosure (Aydınlatma Metni) should be provided
- Data should not be kept longer than necessary
- Data subjects have the right to request access and deletion

**Recommendation:** Add a KVKK notice to tenant contracts and the app interface.

---

## 6. Phone Numbers

### How They Are Used
- Stored in `tenant.phone` field (format: `905xxxxxxxxx`)
- Used only to construct `wa.me` links for rent reminders
- Not shared with any third party
- Not used for marketing

### WhatsApp Risks
- When "WhatsApp Gönder" is clicked, `window.open()` is called
- The phone number and message text appear in the wa.me URL in the browser address bar
- WhatsApp may log the message on its servers

### Automated Reminders (server.js)
- Uses WhatsApp Business Cloud API
- Phone numbers are sent to Meta's servers as part of the API request
- Meta's own privacy policy applies to this transmission

---

## 7. User Account Protection

### Current State (v5)
- PINs stored as plain text in localStorage
- No encryption of user data
- No session management

### Recommended Improvements (v6)
- Hash PINs with PBKDF2 before storage
- Add inactivity timeout (30 minutes)
- Encrypt the entire localStorage value with a passphrase

---

## 8. Backup & Export Privacy

### Risk
- Exported JSON files contain all tenant names, phone numbers, payment history
- These files are unencrypted and can be read by anyone
- If shared accidentally (e.g., via email), all tenant data is exposed

### Recommendations
- Store backup files in a password-protected folder
- Add optional passphrase encryption for exports in v6
- Never share backup files via unencrypted channels

---

## 9. Data Retention

| Data Type | Retention | Deletion Method |
|-----------|-----------|-----------------|
| Tenant records | Until manually removed | Admin deletes tenant |
| Payment history | Indefinite | No automatic deletion |
| Expense records | Indefinite | No automatic deletion |
| Audit history | Last 500 entries (FIFO) | Automatic |
| WA log | All (no automatic deletion) | Manual via DevTools |
| Server backups | Last 12 files (1 hour) | Automatic |

---

## 10. Data Subject Rights

Under KVKK, tenants have the right to:
- Be informed about their data (✗ not yet implemented)
- Access their personal data (✗ no tenant-facing portal)
- Request correction of inaccurate data (✗ manual only via admin)
- Request deletion of their data (partial ✓ — admin can remove tenant record)
- Object to processing (✗ no mechanism)

**Action required:** Add a KVKK disclosure notice and process for data subject requests.

---

## 11. Contact for Data Requests

Data requests from tenants or authorities should be directed to the building owner (Malik). No automated process exists in v5 — admin must handle requests manually.
