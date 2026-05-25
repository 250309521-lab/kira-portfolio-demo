# Kira Takip Pro — Database Migration Plan
**Version:** 5.1

---

## 1. Current Storage Architecture

```
Storage: Browser localStorage
Key:     "ktp_v5"
Format:  JSON (single flat object)
Size:    Typically 200–500 KB
```

There is no traditional relational database. "Migrations" in this context mean:
- Adding new fields to existing entities
- Changing field names or types
- Restructuring the JSON schema between versions
- Moving from localStorage to a server-side database (future)

---

## 2. Schema Versioning Strategy

### Version Key Convention
Each major schema change uses a new localStorage key:

| Version | Key | Changes |
|---------|-----|---------|
| v1–v3 | `ktp_v1`, `ktp_v2`, `ktp_v3` | Early development |
| v4 | `ktp_v4` | Added payments object, multi-user |
| **v5 (current)** | `ktp_v5` | Added `users`, `waLog`, `cloud`, `settings`; renamed alper fields |
| v6 (planned) | `ktp_v6` | Will add PIN hashing, encryption, indexes |

### Migration Flow
```
App starts
  → loadLocal() checks localStorage['ktp_v5']
  → If found: load data
  → If not found: check for ['ktp_v4'] → run migrateV4toV5()
  → If neither: use BASE_* defaults (fresh install)
```

---

## 3. Current Migration Functions

### v4 → v5
```javascript
function migrateV4toV5() {
  const old = JSON.parse(localStorage.getItem('ktp_v4') || 'null');
  if (!old) return;

  // Field renames: alper.net/col/exp were previously net/toplanan/gider
  if (old.alper) {
    Object.keys(old.alper).forEach(mo => {
      const a = old.alper[mo];
      if (a.toplanan !== undefined) {
        old.alper[mo] = { col: a.toplanan, exp: a.gider, net: a.net };
      }
    });
  }

  // New fields with defaults
  old.users = old.users || DEFAULT_USERS;
  old.waLog = old.waLog || [];
  old.cloud = old.cloud || { url:'', key:'', enabled:false, lastSync:'' };
  old.settings = old.settings || { autoSave: true };

  // Remove legacy payment format (paid_apr, paid_apr_date)
  Object.values(old.tenants || {}).flat().forEach(t => {
    delete t.paid_apr;
    delete t.paid_apr_date;
  });

  // Save under new key
  localStorage.setItem('ktp_v5', JSON.stringify(old));
  console.log('[Migration] v4 → v5 complete');
}
```

---

## 4. Planned: v5 → v6 Migration

### Schema Changes (v6 planned)
1. Add `pinHash` + `pinSalt` to `User` (remove plain `pin`)
2. Add `profile.email` to `User`
3. Add `tenant.taxId` (optional)
4. Add `building.address` entity
5. Add `payment.receiptNo` (auto-generated)
6. Move `cloud.key` out of main DATA object

### Migration Script (pseudocode)
```javascript
function migrateV5toV6() {
  const old = JSON.parse(localStorage.getItem('ktp_v5') || 'null');
  if (!old) return;

  // BACKUP FIRST
  const backupKey = 'ktp_v5_pre_v6_migration_' + Date.now();
  localStorage.setItem(backupKey, JSON.stringify(old));
  console.log('[Migration] Backup saved:', backupKey);

  const next = { ...old };

  // 1. Hash PINs
  if (next.users) {
    next.users = next.users.map(u => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      // hashPIN is async — real impl needs Promise.all
      return { ...u, pinHash: hashPINSync(u.pin, salt), pinSalt: salt, pin: undefined };
    });
  }

  // 2. Add new fields with defaults
  if (next.users) {
    next.users = next.users.map(u => ({ profile: { email: '' }, ...u }));
  }

  // 3. Add receiptNo to existing payments
  Object.keys(next.payments || {}).forEach(tid => {
    Object.keys(next.payments[tid]).forEach(mo => {
      if (!next.payments[tid][mo].receiptNo) {
        next.payments[tid][mo].receiptNo = 'KTP-' + Date.now();
      }
    });
  });

  // 4. Move cloud.key to separate secure store
  const cloudKey = next.cloud?.key;
  if (next.cloud) delete next.cloud.key;
  sessionStorage.setItem('ktp_cloud_key', cloudKey || '');

  localStorage.setItem('ktp_v6', JSON.stringify(next));
  console.log('[Migration] v5 → v6 complete');
}
```

---

## 5. Backup Before Migration

**Rule:** Always write a timestamped backup before running any migration.

```javascript
function backupBeforeMigration(fromVersion) {
  const data = localStorage.getItem(`ktp_${fromVersion}`);
  if (!data) return;
  const key = `ktp_${fromVersion}_backup_${new Date().toISOString().replace(/[:.]/g,'-')}`;
  localStorage.setItem(key, data);
  console.log('[Backup]', key, 'saved before migration');
  return key;
}
```

---

## 6. Rollback Strategy

### Within Browser Session
1. Migration writes backup with timestamped key (e.g., `ktp_v5_backup_2026-05-12T10-00`)
2. If migration fails, the backup key is printed to console
3. Admin can manually restore: `localStorage.setItem('ktp_v5', localStorage.getItem('ktp_v5_backup_...'))`

### Via App
Future version should show: "Migration failed. Restore from backup?" confirmation.

### Via JSON Backup File
If user had exported JSON before updating:
1. Open app (blank state after failed migration)
2. Settings → JSON Yükle → select backup file
3. All data restored

---

## 7. Server-Side Migration (Future)

If Kira Takip Pro ever migrates from localStorage to a real database (PostgreSQL, SQLite, MongoDB), the migration plan is:

```
Phase 1 (v6):
  - Export current localStorage data as JSON
  - Spin up Node.js + SQLite backend
  - Write importer: JSON → SQLite tables
  - Validate: row counts, sum checks

Phase 2 (v7):
  - Replace all DATA.xxx reads with API calls
  - Keep localStorage as offline cache with sync
  - Implement conflict resolution (last-write-wins or merge)
```

### Proposed SQLite Schema (v6+)
```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  building_key TEXT NOT NULL,
  unit TEXT NOT NULL,
  name TEXT NOT NULL,
  rent INTEGER DEFAULT 0,
  deposit INTEGER DEFAULT 0,
  contract_start TEXT,
  contract_end TEXT,
  due_day INTEGER DEFAULT 1,
  phone TEXT,
  active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  month_str TEXT NOT NULL,
  paid INTEGER DEFAULT 0,
  payment_date TEXT,
  method TEXT,
  notes TEXT,
  receipt_no TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, month_str)
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_key TEXT NOT NULL,
  month_str TEXT NOT NULL,
  type TEXT NOT NULL,
  meter_no TEXT,
  amount INTEGER DEFAULT 0,
  expense_date TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','viewer')),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  color TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_month ON payments(month_str);
CREATE INDEX idx_expenses_building ON expenses(building_key, month_str);
CREATE INDEX idx_audit_ts ON audit_log(ts);
```

---

## 8. Data Integrity Checks

Run after any migration:

```javascript
function validateDataIntegrity() {
  const errors = [];

  // 1. All payments reference valid tenant IDs
  const allTenantIds = new Set(Object.values(DATA.tenants).flat().map(t => t.id));
  Object.keys(DATA.payments).forEach(tid => {
    if (!allTenantIds.has(tid)) errors.push(`Orphan payment: ${tid}`);
  });

  // 2. No negative rent
  Object.values(DATA.tenants).flat().forEach(t => {
    if (t.rent < 0) errors.push(`Negative rent: ${t.id}`);
  });

  // 3. All month strings are valid
  const validMonths = new Set(ALL_MONTHS);
  Object.values(DATA.expenses).forEach(bldExp => {
    Object.keys(bldExp).forEach(mo => {
      if (!validMonths.has(mo)) errors.push(`Invalid month in expenses: ${mo}`);
    });
  });

  if (errors.length === 0) console.log('[Validation] ✅ Data integrity OK');
  else console.error('[Validation] ❌ Errors:', errors);
  return errors;
}
```
