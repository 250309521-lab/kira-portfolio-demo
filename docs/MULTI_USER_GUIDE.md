# Kira Takip Pro — Multi-User Guide
**Version:** 2.0

---

## Overview

Kira Takip Pro supports multiple users connecting from different laptops via a central server. Each user has:
- A **server account** (username + hashed password) for API authentication
- A **local PIN** in the Electron app for quick on-device login
- A **role** that controls what they can see and do

---

## User Roles

### Admin
- Full access to all features
- Can manage other server users (add/edit/delete/deactivate/reset password)
- Can view audit logs and sync logs
- Can push and pull sync data
- Can configure server settings

### Editor (formerly "Manager")
- Can add/edit payments, expenses, tenants
- Can send WhatsApp reminders
- Can push and pull sync data
- Cannot manage other users

### Viewer
- Dashboard and reports read-only
- Cannot edit any data
- Cannot push to server (read/pull only)
- Cannot manage users

---

## Setting Up Multiple Users

### Step 1: Start the server (admin does this once)
```bash
KTP_ADMIN_PASS=strong-password node server.js
```

### Step 2: Admin logs in to the app
- Open app → Araçlar → Bulut Sync
- Enter server URL + username (`malik`) + password
- Click **Bağlan**

### Step 3: Admin creates accounts for other users
- In the Bulut Sync modal, click **👥 Sunucu Kullanıcıları**
- Click **+ Kullanıcı Ekle**
- Fill: username, full name, password (min 6 chars), role

```bash
# Or via curl:
curl -X POST http://server:8787/users \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{"username":"alper","name":"Alper Bey","password":"secure123","role":"editor"}'
```

### Step 4: Other users connect from their laptops
- Each user opens the Electron app on their own laptop
- Araçlar → Bulut Sync → enter server URL + their username + password
- Click **Bağlan** → token is saved locally
- Click **⬇ Pull** to download latest data

---

## Typical Session Flow

### Alper (Editor) starts work:
```
1. Opens Electron app on his laptop
2. Enters local PIN (5678) → local data loads
3. Bulut Sync → Pull → gets latest data from server
4. Enters payments for Karakol for the month
5. Every 5min: auto-push to server
6. Before closing: manual Push to make sure everything saved
```

### Malik (Admin) reviews:
```
1. Opens Electron app
2. Bulut Sync → Pull → gets Alper's entries
3. Reviews Dashboard for the month
4. Exports report if needed
```

---

## Conflict Scenario

```
Monday 9:00 — Alper pulls (gets version 5)
Monday 9:00 — Malik pulls (gets version 5)

Monday 10:00 — Alper pushes (version 5→6) ✅

Monday 10:30 — Malik tries to push (has version 5)
              → Server is at version 6
              → 409 Conflict!
              → Malik clicks Pull → gets version 6
              → Malik sees Alper's entries merged in
              → Malik pushes (version 6→7) ✅
```

**Rule:** Always Pull before starting work if others may have edited data.

---

## Password Security

### Server passwords
- Hashed with PBKDF2 (100,000 iterations, SHA-256, 64-byte key)
- Salt randomly generated per user (16 bytes)
- Plain-text password **never stored** anywhere
- Tokens are HMAC-SHA256 signed, expire after 24 hours

### Local PINs
- Stored in localStorage (plain text in v5)
- Used only for quick on-device access
- Separate from server passwords
- Admin should change default PINs: Araçlar → Kullanıcılar

---

## User Management API

All endpoints require `Authorization: Bearer {token}` from `/auth/login`.

```
GET  /users                   → list all users (admin)
POST /users                   → create user (admin)
PUT  /users/{id}              → edit name/role/color/active (admin)
POST /users/{id}/reset-password → set new password (admin)
DELETE /users/{id}            → deactivate (admin; soft delete)
```

### POST /users body
```json
{
  "username": "hamid",
  "name": "Hamid Bey",
  "password": "secure123",
  "role": "viewer",
  "color": "#06d6a0",
  "avatar": "H"
}
```

### PUT /users/{id} body (any combination)
```json
{
  "name": "New Name",
  "role": "editor",
  "active": false
}
```

---

## Revoking Access

To revoke a user's access immediately:

```bash
# Deactivate (soft delete — user cannot login)
curl -X DELETE http://server:8787/users/{userId} \
  -H "Authorization: Bearer {admin-token}"

# Or via the app: Bulut Sync → Sunucu Kullanıcıları → ⏸ button
```

The user's data contributions remain in the database — only login is blocked.

---

## Audit Trail

All user management actions are logged:

```bash
# View audit log
curl http://server:8787/audit \
  -H "Authorization: Bearer {admin-token}"

# Events logged:
# LOGIN_SUCCESS, LOGIN_FAILED
# PASSWORD_CHANGED, USER_CREATED, USER_UPDATED
# USER_DEACTIVATED, USER_PASSWORD_RESET
# DATA_PUSH, WA_MANUAL_SEND
```

---

## Recommended Setup Per Use Case

### Solo (owner only)
- No server needed
- Use localStorage + auto-backup
- Optional: JSON backup to cloud storage

### Small team (2-3 users, same office)
- Server on one Windows PC in the office
- LAN access: `http://192.168.1.x:8787`
- No cloud hosting needed

### Remote team (different cities)
- Deploy server on Render.com or Railway (free)
- All users connect via public URL
- HTTPS automatic on these platforms

### High availability (business-critical)
- VPS with nginx + Let's Encrypt HTTPS
- PM2 process manager with auto-restart
- Daily database backup to cloud storage (rclone)
- Monitoring with UptimeRobot
