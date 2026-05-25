# Kira Takip Pro — Server Setup Guide
**Version:** 2.0 | Server: `server.js`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Laptop A (Malik - Admin)                               │
│  Electron App → localStorage + SQLite                   │
│         ↕ HTTPS                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Kira Takip Server v2.0 (Node.js)                │   │
│  │  server.js on Render.com / VPS / local           │   │
│  │  ├── Auth: PBKDF2 hashed passwords + HMAC tokens │   │
│  │  ├── Data: SQLite (ktp_server.db) or flat JSON   │   │
│  │  ├── Sync: versioned conflict detection           │   │
│  │  └── Backups: every 5min → ./backups/            │   │
│  └──────────────────────────────────────────────────┘   │
│         ↕ HTTPS                                         │
│  Laptop B (Alper - Editor)                              │
│  Electron App → localStorage + SQLite                   │
└─────────────────────────────────────────────────────────┘
```

---

## Option 1 — Render.com (Free, recommended for small teams)

### Steps
1. Create account at https://render.com
2. New → Web Service → Connect GitHub (or upload manually)
3. Settings:
   - **Name:** kira-takip-pro
   - **Runtime:** Node
   - **Start Command:** `node server.js`
   - **Instance Type:** Free (512MB RAM)
4. Environment Variables (in Render dashboard):
   ```
   KTP_SECRET=your-very-long-random-secret-here
   KTP_ADMIN_PASS=strong-admin-password
   NODE_ENV=production
   PORT=10000
   ```
5. Click **Deploy** → wait 2-3 minutes
6. Server URL: `https://kira-takip-pro.onrender.com`

### Free tier note
Render free tier sleeps after 15 minutes of inactivity.
The first request after sleep takes ~30 seconds to respond.
Use a paid plan ($7/month) for always-on service.

---

## Option 2 — Railway.app

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables
railway variables set KTP_SECRET=your-secret
railway variables set KTP_ADMIN_PASS=your-admin-pass
railway variables set NODE_ENV=production
```

---

## Option 3 — Local Network Server (Same office WiFi)

Good for small teams in the same physical location.

```bash
# On the server machine (Windows/Mac/Linux):
cd path/to/kira_electron

# Set environment and start
set KTP_SECRET=long-random-string
set KTP_ADMIN_PASS=your-admin-password
node server.js

# Server runs on: http://192.168.1.X:8787
# (find IP: ipconfig on Windows, ifconfig on Linux/Mac)
```

**Windows — run as service with pm2:**
```bash
npm install -g pm2
pm2 start server.js --name kira-server
pm2 save
pm2 startup
```

---

## Option 4 — VPS (DigitalOcean / Contabo / Hetzner)

```bash
# On Ubuntu 22.04 VPS:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone/upload project
git clone <your-repo> kira-server && cd kira-server

# Create .env file
cat > .env << 'EOF'
KTP_SECRET=your-very-long-random-secret
KTP_ADMIN_PASS=strong-admin-password
NODE_ENV=production
PORT=8787
KTP_DB_PATH=/var/data/ktp_server.db
KTP_BACKUP_DIR=/var/data/backups
EOF

# Install pm2
npm install -g pm2
pm2 start server.js --name kira-server --env production
pm2 save && pm2 startup

# Optional: nginx reverse proxy for HTTPS
sudo apt-get install -y nginx certbot
# ... configure nginx + Let's Encrypt
```

---

## First-Run Setup

1. Start server
2. Default admin user is created automatically:
   - **Username:** `malik`
   - **Password:** value of `KTP_ADMIN_PASS` environment variable
3. Connect from the Electron app:
   - Araçlar → Bulut Sync
   - Enter server URL + username + password
   - Click **Bağlan**
4. Change admin password immediately:
   - `POST /auth/change-password`

---

## Verifying the Server

```bash
# Health check (no auth required)
curl http://your-server:8787/health

# Expected response:
{
  "ok": true,
  "version": "2.0.0",
  "uptime": 123,
  "db": "sqlite",
  "syncVersion": 0,
  "waEnabled": false
}
```

---

## Security Checklist

- [ ] `KTP_SECRET` set to a random 32+ character string
- [ ] `KTP_ADMIN_PASS` changed from default
- [ ] HTTPS enabled (Render does this automatically)
- [ ] `NODE_ENV=production` set
- [ ] Default admin password changed after first login
- [ ] Backup directory is writable
- [ ] Server log file checked for errors
- [ ] WA_TOKEN kept secret (not in source code)
