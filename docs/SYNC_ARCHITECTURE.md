# Kira Takip Pro — Sync Architecture
**Version:** 2.0

---

## Design Principles

1. **Local-first:** App works 100% offline. Server is optional.
2. **Versioned pushes:** Every push increments a server version counter.
3. **Conflict detection:** If server version is ahead of client's known version, push is rejected with HTTP 409.
4. **No silent overwrites:** Stale pushes never silently overwrite newer server data.
5. **Preserve local on failure:** If server is unreachable, local data is untouched.
6. **Role-gated writes:** Only `admin` and `editor` roles can push data.

---

## Data Flow

### Push (Client → Server)

```
Client                              Server
  │                                    │
  │  POST /sync                        │
  │  { payload, clientVersion: N }     │
  ├──────────────────────────────────→ │
  │                                    │ serverVersion > clientVersion+1?
  │                                    │   YES → return 409 Conflict
  │                                    │   NO  → save, increment version
  │  200 { version: N+1, bytes }      │
  │ ←────────────────────────────────  │
  │                                    │
  Save DATA.cloud.serverVersion = N+1  │
```

### Pull (Server → Client)

```
Client                              Server
  │                                    │
  │  GET /sync                         │
  ├──────────────────────────────────→ │
  │                                    │
  │  200 { payload, version: N, ... } │
  │ ←────────────────────────────────  │
  │                                    │
  Merge payload into DATA              │
  Update DATA.cloud.serverVersion = N  │
  autoRecalc() → render()              │
```

---

## Conflict Resolution

### Detection
```
Server version (sv) vs Client's known version (cv)

sv = 0  → no data on server yet      → allow push
cv = 0  → client doesn't know version → allow push (first sync)
sv > cv+1 → server has newer data    → REJECT with 409
sv ≤ cv+1 → server is up to date    → allow push
```

### 409 Response
```json
{
  "ok": false,
  "conflict": true,
  "error": "Conflict: server is at version 8, client sent version 5",
  "serverVersion": 8,
  "clientVersion": 5,
  "hint": "Pull server data first, merge locally, then push again with force:true"
}
```

### Resolution Steps
1. Client receives 409
2. Toast: "⚠️ Çakışma: sunucu daha yeni. Pull ile güncelle."
3. User clicks Pull
4. Client downloads server data (newer)
5. Client reviews and completes any pending local changes
6. Client pushes with `force: true` to override

### Force Override
```json
POST /sync
{ "payload": {...}, "clientVersion": 5, "force": true }
```
Force bypasses version check. Use only when intentionally overriding.

---

## Sync Lifecycle States

| State | UI Indicator | Meaning |
|-------|-------------|---------|
| Disconnected | 🔴 red dot | No server URL configured |
| Connected | 🟢 green dot | Token valid, last sync shown |
| Syncing | 🟡 spinner | Request in flight |
| Conflict | ⚠️ toast | 409 received |
| Offline | 🔴 | Server unreachable |

---

## Auto-Sync Schedule

```
Every 5 minutes (300,000ms):
  if DATA.cloud.enabled AND DATA.cloud.token:
    cloudSync('push')
    → on conflict: log it, don't crash
    → on network error: skip, try next cycle
```

On app startup: no auto-sync (user must push manually or wait for interval)

On page navigation: no sync triggered (sync is time-based only)

---

## Sync Payload

### Push body
```typescript
interface SyncPushBody {
  payload: {
    tenants:  Record<BuildingKey, Tenant[]>;
    payments: Record<TenantId, Record<MonthStr, Payment>>;
    expenses: Record<BuildingKey, Record<MonthStr, Expense[]>>;
    alper:    Record<MonthStr, AlperEntry>;
    history:  HistoryEntry[];
    waLog:    WALogEntry[];
    users:    User[];          // local users (not synced to server auth)
    settings: AppSettings;
  };
  clientVersion: number;       // last known server version
  force?: boolean;             // bypass conflict check
}
```

### Pull response
```typescript
interface SyncPullResponse {
  ok: boolean;
  payload: SyncPayload | null;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
```

---

## What Does NOT Sync

| Data | Reason |
|------|--------|
| Server user passwords | Managed separately via `/users` endpoints |
| Server auth tokens | Ephemeral, per-session |
| Local SQLite schema | Per-device |
| App settings (Electron) | Per-device (window size, paths, etc.) |

---

## Sync Logs

Every sync attempt is logged:

```sql
-- Server side
SELECT * FROM sync_log ORDER BY id DESC LIMIT 20;
-- direction: 'push' | 'pull'
-- status:    'ok' | 'conflict' | 'error'
-- bytes:     payload size
-- msg:       version transition e.g. "v3→v4"
```

Access via: `GET /logs` (admin only) or from Hakkında page in the Electron app.

---

## Network Resilience

### Retry Logic
```javascript
async function fetchWithRetry(url, opts, retries=1) {
  try { return await fetch(url, opts); }
  catch(e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, 1500)); // 1.5s wait
    return fetchWithRetry(url, opts, retries - 1);
  }
}
```
- 1 automatic retry on network failure
- AbortSignal.timeout(5000) on health check
- No retry on 4xx errors (auth failures, conflicts)

### Offline Behavior
- All data operations continue using localStorage
- Sync button shows error toast
- No data loss on server outage
- Changes queue up locally, pushed on next successful connection

---

## Server-Side Backup During Sync

```
Every 5 minutes:
  autoBackup() → ./backups/server-backup-{datetime}.db (or .json)
  Keep last 24 files (2 hours of history)

On server restart (SIGTERM):
  autoBackup() before db.close()
```
