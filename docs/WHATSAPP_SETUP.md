# Kira Takip Pro — WhatsApp Setup Guide
**Version:** 5.1.0

---

## Overview

Kira Takip Pro supports two WhatsApp reminder modes:

| Mode | Method | Setup |
|------|--------|-------|
| **Manual** | App opens wa.me link | No setup needed |
| **Automated** | WhatsApp Business Cloud API | Requires Meta Developer account |

---

## Mode 1: Manual Reminders (No Setup)

Works immediately with no configuration.

1. Open WhatsApp page in the app
2. Overdue tenants listed automatically
3. Add/edit tenant phone number inline
4. Click "💬 WhatsApp Gönder"
5. WhatsApp opens in browser with pre-filled message
6. Send manually
7. App logs the send (prevents duplicate reminder tracking)

**Message format:**
```
Merhaba [tenant name], [building] [unit] için [month] kira 
ödemeniz (₺[amount]) görünmüyor. 
Rica etsek kontrol edebilir misiniz?
```

---

## Mode 2: Automated Reminders (WhatsApp Business API)

Sends reminders automatically when the server detects overdue payments.

### Prerequisites

- A Facebook/Meta developer account
- A WhatsApp Business account
- A dedicated phone number for WhatsApp Business
- The `server.js` running with correct environment variables

### Step 1: Meta Developer Setup

1. Go to https://developers.facebook.com
2. Create a new app → Business type
3. Add "WhatsApp" product to your app
4. Go to **WhatsApp → API Setup**

### Step 2: Get Credentials

From the WhatsApp API Setup page, copy:
- **Phone Number ID** → used as `WA_PHONE_NUMBER_ID`
- **Access Token** → used as `WA_TOKEN` (temporary for testing)

For production, generate a **Permanent Token**:
1. Go to Business Settings → System Users
2. Create a System User with MANAGE_PAGE permission
3. Generate a permanent token for the WhatsApp app

### Step 3: Configure Server

Add to your `.env` file or environment variables:
```bash
WA_TOKEN=your-permanent-access-token
WA_PHONE_NUMBER_ID=your-phone-number-id
```

### Step 4: Verify Setup

```bash
# Start server with WA credentials
WA_TOKEN=xxx WA_PHONE_NUMBER_ID=yyy KTP_SECRET=zzz node server.js

# Look for: "WA: ✅ Configured"
# in the startup log

# Test endpoint
curl -X POST http://localhost:8787/wa-send \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{"phone":"905321234567","message":"Test mesajı"}'
```

### Step 5: Phone Number Verification

All tenant phone numbers must be:
- In international format: `905XXXXXXXXX` (Turkey)
- Without `+` prefix
- Digits only (app strips non-digits automatically)

**Update tenant phones in the app:**
- WhatsApp page → click phone field → edit inline
- Or: Building page → tenant row → edit

---

## Automated Reminder Logic

When `WA_TOKEN` is set, the server checks every 5 minutes:

```
For each building in DATA.tenants:
  For each active tenant with phone:
    If paid < rent:
      If today > gun+1 day of the month:
        If NOT already sent this month:
          Send WA message
          Log to wa_log table
```

**Duplicate prevention:** Checks `wa_log` for `unit:building:month_str` combo before sending.

---

## Viewing WA Logs

### In the App
WhatsApp page → scroll to "📋 Son Gönderimler"

### Via API
```bash
curl http://server:8787/wa-log \
  -H "Authorization: Bearer {token}"
```

### In SQLite (server)
```sql
SELECT * FROM wa_log ORDER BY id DESC LIMIT 20;
```

---

## WhatsApp Business API Limits

| Plan | Messages/Month | Price |
|------|---------------|-------|
| Free tier | 1,000 | Free |
| Paid | Unlimited | Per message pricing |

For ~57 tenants with monthly reminders, free tier is sufficient.

---

## Troubleshooting

| Problem | Solution |
|---------|---------|
| "WA credentials missing" | Set `WA_TOKEN` and `WA_PHONE_NUMBER_ID` env vars |
| "HTTP 401" in wa_log | Token expired — generate new permanent token |
| "HTTP 400" | Phone number format wrong — use `905XXXXXXXXX` |
| Messages not sending | Check server log for errors |
| Duplicate messages sent | Check wa_log table — should prevent duplicates |
| Tenant missing from list | Ensure `active: true` and `rent > 0` and `phone` set |

---

## Privacy Considerations

- Tenant phone numbers stored in app data (`DATA.tenants[].phone`)
- Numbers sent to Meta's servers when using WhatsApp Business API
- Manual mode: number only appears in the wa.me URL (browser)
- WA log stores: phone, name, building, unit, month, status
- See `DATA_PRIVACY_POLICY.md` for full privacy notes

---

## Phone Number Format Guide

| Input | Cleaned | Valid? |
|-------|---------|--------|
| `+90 532 123 45 67` | `905321234567` | ✅ |
| `0532 123 45 67` | `05321234567` | ⚠️ Missing country code |
| `532-123-45-67` | `5321234567` | ⚠️ Missing country code |
| `+1 555 123 4567` | `15551234567` | ✅ (US number) |

**For Turkish numbers, always use `905XXXXXXXXX` format (12 digits).**
