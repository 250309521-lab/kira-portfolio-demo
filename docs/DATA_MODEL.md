# Kira Takip Pro — Data Model
**Version:** 5.1 | **Storage:** Browser localStorage (key: `ktp_v5`)

---

## 1. Overview

All data lives in a single JSON object (`DATA`) stored in `localStorage`. There is no relational database; relationships are maintained through ID references.

```
DATA
├── tenants      { [buildingKey]: Tenant[] }
├── payments     { [tenantId]: { [monthStr]: Payment } }
├── expenses     { [buildingKey]: { [monthStr]: Expense[] } }
├── alper        { [monthStr]: AlperEntry }
├── tanNet       { [monthStr]: NetEntry }
├── gayNet       { [monthStr]: NetEntry }
├── history      HistoryEntry[]
├── waLog        WALogEntry[]
├── users        User[]
├── cloud        CloudConfig
└── settings     AppSettings
```

---

## 2. Entity Definitions

### 2.1 Building (Static Constants)

Buildings are not stored as entities — they are defined as constants:

```typescript
type BuildingKey = 'GAYRETTEPE' | 'KARAKOL' | 'TAN SOKAK';

const BL: Record<BuildingKey, string> = {
  GAYRETTEPE: 'Gayrettepe',
  KARAKOL: 'Karakol',
  'TAN SOKAK': 'Tan Sokak',
};
```

**Properties (implicit):**
- Key: string identifier used across all data structures
- Label: human-readable Turkish name
- Units: derived from tenants array

---

### 2.2 Tenant

```typescript
interface Tenant {
  id:     string;    // e.g. "G1", "K3", "T12"
  unit:   string;    // e.g. "D1", "D14"
  fl:     string;    // floor label e.g. "1.KAT", "ÇATI", "BODRUM"
  name:   string;    // full tenant name
  rent:   number;    // monthly rent in TRY (0 if vacant)
  dep:    number;    // deposit amount in TRY
  bas:    string;    // contract start (ISO date "YYYY-MM-DD")
  bit:    string;    // contract end (ISO date, empty if open-ended)
  gun:    number;    // payment due day of month (1–31)
  sekil:  string;    // preferred payment method
  active: boolean;   // false = vacated or removed
  notes:  string;    // free text notes
  phone:  string;    // WhatsApp number format "905xxxxxxxxx"
}
```

**ID Convention:**
- `G` prefix = Gayrettepe
- `K` prefix = Karakol
- `T` prefix = Tan Sokak
- Number = unit sequence

**Constraints:**
- `rent = 0` and `active = false` for vacant units
- `phone` may be empty; required for automated WA reminders
- `gun` used to determine overdue status (after `gun + 1` day has passed)

---

### 2.3 Payment

```typescript
interface Payment {
  paid:  number;   // amount paid in TRY
  date:  string;   // payment date "YYYY-MM-DD"
  sekil: string;   // payment method
  notes: string;   // free text
}

// Storage structure:
// DATA.payments[tenantId][monthStr] = Payment
// monthStr format: "Nisan 2026"
```

**Derived values (computed, not stored):**
- `diff = paid - tenant.rent` (positive = overpayment, negative = shortfall)
- `status` = Ödendi | Kısmi | Ödenmedi | BOŞ

**Constraints:**
- One payment record per tenant per month
- Partial payment (`0 < paid < rent`) is valid
- Overpayment (`paid > rent`) is valid
- Missing record = not paid (treated same as `paid: 0`)

---

### 2.4 Expense

```typescript
interface Expense {
  tur:    string;   // expense type e.g. "ELEKTRİK 1", "DOĞALGAZ"
  no:     string;   // meter number or bill reference
  tutar:  number;   // amount in TRY
  tarih:  string;   // payment date "YYYY-MM-DD"
  notlar: string;   // notes
}

// Storage structure:
// DATA.expenses[buildingKey][monthStr] = Expense[]
```

**Expense Types (GKAT constant):**
Elektrik, Doğalgaz, Su (İSKİ), İnternet, Merdiven Temizlik, Asansör Servis, DASK, Depozito İade, Tamirat, Diğer

**Constraint:** Multiple expenses of same type allowed per month (e.g., 3 separate electric meters)

---

### 2.5 AlperEntry

Tracks Karakol manager's monthly collections and obligations:

```typescript
interface AlperEntry {
  col: number;   // total collected from tenants (TRY)
  exp: number;   // expenses paid on behalf of building (TRY)
  net: number;   // net owed to owner = col - exp
}

// Storage: DATA.alper[monthStr] = AlperEntry
// net is auto-recalculated: net = col - exp
```

**Source:** Manually entered or recalculated from actual payment/expense data.

---

### 2.6 NetEntry (TanNet / GayNet)

Monthly net income summary for Tan Sokak and Gayrettepe:

```typescript
interface NetEntry {
  col: number;   // total collected (TRY)
  exp: number;   // total expenses (TRY)
  net: number;   // net income = col - exp
  kur: number;   // USD/EUR exchange rate at time of recording
  eur: number;   // net / kur (EUR equivalent)
}

// Storage: DATA.tanNet[monthStr] = NetEntry
//          DATA.gayNet[monthStr] = NetEntry
```

---

### 2.7 User

```typescript
interface User {
  id:     string;    // unique e.g. "malik", "alper", "u_1715000000000"
  name:   string;    // display name
  avatar: string;    // 1-2 uppercase letters
  role:   'admin' | 'manager' | 'viewer';
  pin:    string;    // 4-6 digit numeric string (stored plain-text — see Security Review)
  color:  string;    // hex color for avatar background
  active: boolean;   // false = deactivated (cannot login)
}

// Storage: DATA.users = User[]
```

**Default Users:**
```javascript
{ id: 'malik', name: 'Malik (Sahip)',  role: 'admin',   pin: '1234', color: '#3b82f6' }
{ id: 'alper', name: 'Alper',          role: 'manager', pin: '5678', color: '#8b5cf6' }
{ id: 'hamid', name: 'Hamid Bey',      role: 'viewer',  pin: '9999', color: '#06d6a0' }
```

---

### 2.8 HistoryEntry (Audit Log)

```typescript
interface HistoryEntry {
  t:    string;   // ISO timestamp (toLocaleString)
  desc: string;   // human-readable description of change
  user: string;   // display name of user who made the change
}

// Storage: DATA.history = HistoryEntry[]  (max 500 entries, FIFO)
```

**Event types recorded:**
- Payment added/modified
- Expense added/modified/deleted
- Tenant added/modified/removed
- User added/edited/deleted/deactivated
- PIN reset
- WA reminder sent
- Cloud sync completed
- JSON backup restored
- Login

---

### 2.9 WALogEntry

```typescript
interface WALogEntry {
  t:    string;   // timestamp
  bina: string;   // building label e.g. "Gayrettepe"
  unit: string;   // unit e.g. "D6"
  name: string;   // tenant name
  mo:   string;   // month string e.g. "Nisan 2026"
}

// Storage: DATA.waLog = WALogEntry[]
// Used for: duplicate prevention, last sent tracking
```

---

### 2.10 CloudConfig

```typescript
interface CloudConfig {
  url:      string;    // REST endpoint URL
  key:      string;    // Bearer token / API key
  enabled:  boolean;   // true after first successful sync
  lastSync: string;    // ISO timestamp of last sync
}

// Storage: DATA.cloud = CloudConfig
```

---

### 2.11 AppSettings

```typescript
interface AppSettings {
  autoSave: boolean;   // save to localStorage every 30s
}
```

---

## 3. Relationships (ERD-style)

```
Building (implicit)
  │
  ├── has many ──► Tenant
  │                  │
  │                  └── has many (by month) ──► Payment
  │
  └── has many (by month) ──► Expense[]

AlperEntry (by month, Karakol only)
  └── derived from Karakol Payments + Expenses

NetEntry (by month, TanSokak + Gayrettepe)
  └── derived from respective Payments + Expenses

User
  └── role ──► Permission set (enforced in canEdit(), isAdmin())

HistoryEntry
  └── created by ──► User (name stored, not ID)

WALogEntry
  └── references ──► Tenant (by building + unit + name, not ID)
```

---

## 4. Month String Format

**Format:** `"Nisan 2026"` (Turkish month name + 4-digit year)

```typescript
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const YEARS  = ['2025','2026','2027'];
const ALL_MONTHS = MONTHS.flatMap(m => YEARS.map(y => `${m} ${y}`));
// → ["Ocak 2025", "Şubat 2025", ..., "Aralık 2027"] (36 entries)
```

---

## 5. Computed / Derived Values

These are never stored; always recalculated:

| Value | Formula |
|-------|---------|
| `paidTotal(bld, mo)` | Sum of `payment.paid` for active tenants |
| `expTotal(bld, mo)` | Sum of `expense.tutar` for building+month |
| `rentTotal(bld)` | Sum of active tenant `rent` values |
| `net(bld, mo)` | `paidTotal - expTotal` |
| `collectionRate` | `paidTotal / rentTotal × 100` |
| `tenantStatus` | Ödendi / Kısmi / Ödenmedi / BOŞ |
| `isDue(tenant, mo)` | `now > (month.gun + 1)` and not fully paid |
| `alper.net` | `alper.col - alper.exp` |

---

## 6. localStorage Schema Version

Current version key: `ktp_v5`

If the schema changes in v6, a new key (`ktp_v6`) will be used, and a migration function will read from `ktp_v5` and transform data.

---

## 7. Backup Structure

JSON backup contains the full `DATA` object minus `cloud.key` (for security):

```json
{
  "tenants":  { ... },
  "payments": { ... },
  "expenses": { ... },
  "alper":    { ... },
  "tanNet":   { ... },
  "gayNet":   { ... },
  "history":  [ ... ],
  "waLog":    [ ... ],
  "users":    [ ... ],
  "settings": { ... }
}
```

Server-side backups are stored as timestamped JSON files: `backup_2026-05-12T10-00.json`

---

## 8. Sync Payload

Cloud sync sends the same structure as backup, plus:
```json
{
  "serverSavedAt": "2026-05-12T10:05:00.000Z"
}
```

The server retains the last 12 backup files (1 hour at 5-minute intervals).
