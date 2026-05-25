# Kira Takip Pro — Environment Variables
**Version:** 2.0 | File: `server.js`

---

## Quick Start (.env file)

Create a `.env` file next to `server.js`:

```bash
# .env — DO NOT COMMIT TO GIT

# Required in production
KTP_SECRET=replace-with-64-char-random-string-here
KTP_ADMIN_PASS=choose-strong-admin-password

# Optional
PORT=8787
NODE_ENV=production
KTP_DB_PATH=./ktp_server.db
KTP_BACKUP_DIR=./backups
KTP_CORS_ORIGIN=*

# WhatsApp (optional)
WA_TOKEN=
WA_PHONE_NUMBER_ID=
```

Load with:
```bash
# Linux/Mac
source .env && node server.js

# Windows PowerShell
Get-Content .env | ForEach-Object { $k,$v=$_.Split('=',2); [System.Environment]::SetEnvironmentVariable($k,$v) }
node server.js

# With dotenv (install: npm install dotenv)
node -r dotenv/config server.js
```

---

## Variable Reference

### KTP_SECRET

| Property | Value |
|----------|-------|
| **Required** | Yes (in production) |
| **Default** | Auto-generated (random, changes on restart) |
| **Purpose** | Signs HMAC-SHA256 authentication tokens |

⚠️ **CRITICAL:** If not set, a new secret is generated each restart.
This invalidates all existing tokens — users must re-login after every restart.

**Generate a secure secret:**
```bash
# Linux/Mac:
openssl rand -hex 32

# Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example output:
# a8f3b2c1d4e5f6071891a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1
```

---

### KTP_ADMIN_PASS

| Property | Value |
|----------|-------|
| **Required** | Recommended |
| **Default** | `admin1234` |
| **Purpose** | Password for the initial admin account (`malik`) |

⚠️ Only used on first startup when no users exist in the database.
Once the admin user is created, changing this variable has no effect.
Change the password via the app or `/auth/change-password`.

---

### PORT

| Property | Value |
|----------|-------|
| **Required** | No |
| **Default** | `8787` |
| **Purpose** | HTTP port the server listens on |

Note: Render.com sets `PORT` automatically (usually 10000).

---

### NODE_ENV

| Property | Value |
|----------|-------|
| **Required** | No |
| **Default** | `development` |
| **Values** | `production` \| `development` |
| **Purpose** | Controls logging verbosity and error detail |

In `production`:
- SQLite verbose logging disabled
- Stack traces not sent in API error responses

---

### KTP_DB_PATH

| Property | Value |
|----------|-------|
| **Required** | No |
| **Default** | `./ktp_server.db` (next to server.js) |
| **Purpose** | Absolute or relative path to the SQLite database file |

**Examples:**
```bash
KTP_DB_PATH=/var/data/kiratakip/server.db       # Linux absolute
KTP_DB_PATH=C:\KiraTakip\server.db              # Windows absolute
KTP_DB_PATH=./data/ktp.db                        # Relative
```

Note: On Render.com, the disk is ephemeral on free tier. Use a persistent disk or flat-file fallback.

---

### KTP_BACKUP_DIR

| Property | Value |
|----------|-------|
| **Required** | No |
| **Default** | `./backups` (next to server.js) |
| **Purpose** | Directory for automatic SQLite backups |

Directory is created automatically if it doesn't exist.
Backups are taken every 5 minutes and on server shutdown.
Last 24 backups are kept (older ones are deleted).

---

### KTP_CORS_ORIGIN

| Property | Value |
|----------|-------|
| **Required** | No |
| **Default** | `*` (allow all) |
| **Purpose** | `Access-Control-Allow-Origin` header value |

**For production security:**
```bash
# Allow only your Electron app's local origin
KTP_CORS_ORIGIN=http://localhost

# Allow a specific domain
KTP_CORS_ORIGIN=https://your-domain.com
```

---

### WA_TOKEN

| Property | Value |
|----------|-------|
| **Required** | No |
| **Default** | (empty — WA disabled) |
| **Purpose** | WhatsApp Business Cloud API access token |

Obtain from: https://developers.facebook.com → Meta for Developers → WhatsApp → API Setup

⚠️ This token grants access to send WhatsApp messages from your number.
Never commit it to Git. Never expose it in the Electron frontend.

---

### WA_PHONE_NUMBER_ID

| Property | Value |
|----------|-------|
| **Required** | Only if WA_TOKEN is set |
| **Default** | (empty) |
| **Purpose** | The phone number ID from Meta WhatsApp Business API |

Found in: Facebook Developer Console → WhatsApp → API Setup → Phone Number ID

---

## Security Notes

### Never store secrets in source code
```bash
# BAD — never do this:
const SECRET = 'my-hardcoded-secret';

# GOOD:
const SECRET = process.env.KTP_SECRET || generateDefaultSecret();
```

### .gitignore
```gitignore
.env
*.db
*.log
backups/
ktp_store.json
```

### Environment variable validation (add to server.js for v6)
```javascript
const required = ['KTP_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length && process.env.NODE_ENV === 'production') {
  console.error('Missing required env vars:', missing);
  process.exit(1);
}
```

---

## Platform-Specific Notes

### Render.com
- Set all env vars in the Render dashboard (not .env file)
- `PORT` is set automatically by Render — don't override
- Free tier: no persistent disk → SQLite data lost on restart
  → Set `KTP_DB_PATH` to a Render persistent disk path

### Railway.app
```bash
railway variables set KTP_SECRET=...
railway variables set KTP_ADMIN_PASS=...
```

### Windows with PM2
```bash
# Create ecosystem.config.js
module.exports = {
  apps: [{
    name: 'kira-server',
    script: 'server.js',
    env: {
      PORT: 8787,
      KTP_SECRET: 'your-secret-here',
      KTP_ADMIN_PASS: 'your-admin-pass',
      NODE_ENV: 'production'
    }
  }]
};
pm2 start ecosystem.config.js
```
