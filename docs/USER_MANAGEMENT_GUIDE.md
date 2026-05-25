# Kira Takip Pro — User Management Guide
**Version:** 2.0

---

## Two User Systems

Kira Takip Pro has two separate user systems:

| System | Where | Purpose |
|--------|-------|---------|
| **Local Users** | localStorage → `DATA.users` | Quick PIN login on device |
| **Server Users** | SQLite `users` table | API authentication for sync |

These are independent. A user can have different credentials on each system.

---

## Local User Management (In-App)

### Access
Araçlar → Kullanıcılar (Admin only)

### Add User
1. Click **+ Ekle**
2. Fill: Name, Username, PIN (4-6 digits), Role, Color
3. Click **✅ Ekle**

### Edit User
- Click **✏️ Düzenle** → inline form → edit name/avatar/role/color → **💾 Kaydet**

### Reset Local PIN
- Click **🔑 PIN** → enter new 4-6 digit numeric PIN

### Deactivate
- Click **⏸** → user account suspended
- Deactivated users appear at login but PIN is rejected

### Delete
- Click **🗑** → confirm → removed from `DATA.users`
- Cannot delete yourself

### PIN Constraints
- 4-6 digits only
- Numeric (`0-9`)
- No two users may share the same PIN
- No minimum strength requirements (PINs are for local convenience only)

---

## Server User Management

### Via the App (Admin)
1. Araçlar → Bulut Sync → connect to server
2. Click **👥 Sunucu Kullanıcıları**
3. Use Add/Edit/Reset Password/Toggle Active buttons

### Via API

All endpoints require `Authorization: Bearer {token}` from `/auth/login`.

#### Login
```bash
curl -X POST http://server:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"malik","password":"your-password"}'

# Response:
{
  "ok": true,
  "token": "eyJ...",
  "user": { "id":"...", "username":"malik", "name":"Malik (Sahip)", "role":"admin" }
}
```

Save the token — use it in all subsequent requests.

#### List Users
```bash
curl http://server:8787/users \
  -H "Authorization: Bearer {token}"
```

#### Create User
```bash
curl -X POST http://server:8787/users \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alper",
    "name": "Alper Bey",
    "password": "secure-password",
    "role": "editor",
    "color": "#8b5cf6",
    "avatar": "A"
  }'
```

#### Edit User
```bash
# Change role or deactivate
curl -X PUT http://server:8787/users/{id} \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"role":"viewer","active":false}'
```

#### Reset Password (Admin)
```bash
curl -X POST http://server:8787/users/{id}/reset-password \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"newPassword":"new-secure-password"}'
```

#### Deactivate User (Soft Delete)
```bash
curl -X DELETE http://server:8787/users/{id} \
  -H "Authorization: Bearer {token}"
```

---

## Changing Your Own Password

```bash
# User changes their own password
curl -X POST http://server:8787/auth/change-password \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "old-password",
    "newPassword": "new-secure-password"
  }'
```

**Rules:**
- Must provide correct current password
- New password min 6 characters
- Action logged in audit trail

---

## Password Security

### Hashing Algorithm
```
PBKDF2-SHA256
  password:   plain text
  salt:       random 16 bytes (hex), unique per user
  iterations: 100,000
  keylen:     64 bytes
  digest:     sha256
  output:     hex string (128 chars)
```

### Token Format
- HMAC-SHA256 signed JSON payload (JWT-compatible format)
- Payload: `{ sub: userId, role, exp: timestamp, iat: timestamp }`
- Expires: 24 hours from issue
- Revocation: deactivate user (`active=0`)

### No token storage on server
The server does not store active tokens in a sessions table (v2.0).
Tokens are stateless — verified by HMAC signature + expiry.

To revoke access: deactivate the user account. Their tokens will be rejected at the `active=1` check.

---

## Role Permission Matrix

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| Login | ✅ | ✅ | ✅ |
| GET /auth/me | ✅ | ✅ | ✅ |
| POST /auth/change-password | ✅ | ✅ | ✅ |
| GET /sync (pull) | ✅ | ✅ | ✅ |
| POST /sync (push) | ✅ | ✅ | ❌ |
| GET /sync/status | ✅ | ✅ | ✅ |
| GET /users | ✅ | ❌ | ❌ |
| POST /users | ✅ | ❌ | ❌ |
| PUT /users/:id | ✅ | ❌ | ❌ |
| DELETE /users/:id | ✅ | ❌ | ❌ |
| POST /users/:id/reset-password | ✅ | ❌ | ❌ |
| GET /audit | ✅ | ❌ | ❌ |
| GET /logs | ✅ | ❌ | ❌ |
| GET /backups | ✅ | ❌ | ❌ |
| POST /wa-send | ✅ | ✅ | ❌ |
| GET /wa-log | ✅ | ✅ | ❌ |
| GET /health | ✅ | ✅ | ✅ (public) |

---

## Audit Log Events

Every security-relevant action is logged in `audit_log`:

| Event | Trigger |
|-------|---------|
| `LOGIN_SUCCESS` | Successful login |
| `LOGIN_FAILED` | Wrong password attempt |
| `PASSWORD_CHANGED` | User changed own password |
| `USER_CREATED` | Admin created a new user |
| `USER_UPDATED` | Admin edited user fields |
| `USER_DEACTIVATED` | Admin deactivated user |
| `USER_PASSWORD_RESET` | Admin reset user's password |
| `DATA_PUSH` | Sync push completed |
| `WA_MANUAL_SEND` | Manual WhatsApp message sent |

### View audit log
```bash
curl http://server:8787/audit?limit=50 \
  -H "Authorization: Bearer {admin-token}"
```

---

## Troubleshooting

| Problem | Solution |
|---------|---------|
| "Invalid credentials" | Check username + password; user may be deactivated |
| "Authentication required" | Token expired (24h); re-login |
| "Admin required" | Your token has editor/viewer role |
| Forgot admin password | See DISASTER_RECOVERY_PLAN.md admin recovery section |
| Token rejected after server restart | `KTP_SECRET` not set → secret changed on restart; set it in env |
