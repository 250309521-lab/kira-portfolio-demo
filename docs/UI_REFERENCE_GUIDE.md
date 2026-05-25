# Kira Takip Pro — UI Reference Guide
**Version:** 5.1 | For: Future designers and developers

---

## 1. Current Design Direction

### Core Aesthetic
**Dark enterprise financial dashboard.** The visual language is influenced by:
- **Linear.app** — precision spacing, minimal chrome, sharp data focus
- **Arc Browser** — frosted glass, layered depth
- **Vercel Dashboard** — high-information density without clutter
- **Apple iOS 18** — refined animations, glass materials, spatial hierarchy

### Guiding Principles
1. **Data first** — UI chrome supports data, never competes with it
2. **Density over whitespace** — financial software users prefer more data visible
3. **Dark depth** — layers of transparency create depth without solid colours
4. **Micro-motion** — animations confirm interaction; never decorative loops
5. **No gratuitous elements** — every border, shadow, gradient has a semantic purpose

---

## 2. Recommended Future Inspirations

When iterating the design, reference these sources (but never copy):

| Source | What to Study |
|--------|---------------|
| Linear.app | Data table patterns, command palette, sidebar hierarchy |
| Vercel Dashboard | KPI cards, deployment status indicators, chart styles |
| Arc Browser | Sidebar gradient treatment, tab hover states |
| Raycast | Command palette interaction model, result grouping |
| Notion | Page navigation, breadcrumb patterns |
| Stripe Dashboard | Financial table design, status badge system |
| Apple Finance App | Sparkline charts, gauge meters, colour use for money |
| Figma's own UI | Compact toolbar, panel slide-overs |

---

## 3. Reusable Layout Patterns

### App Shell (Fixed)
```
[Sidebar 248px] [Main Area flex:1]
  ↑               ↑
  fixed           min-width: 0
  overflow-y:auto flex-direction: column
                  [Topbar 52px fixed]
                  [Content area overflow-y:auto]
```

**Key rule:** Sidebar is `flex: 0 0 248px`. Main is `flex: 1 1 0; min-width: 0; width: 0`. No exceptions.

### Page Layout
```
[Month Bar — full width, single row, scrollable]
[KPI Grid — auto-fill, minmax(160px, 1fr)]
[Section Header]
[Table Card]
[Section Header]
[Table Card]
```

### Detail Panel (Slide-over)
```
[Overlay dim: rgba(0,0,0,0.6)]
[Panel: right 0, top 0, bottom 0, width: min(500px, 90vw)]
[Header: name + subtitle + badges]
[Info grid: 2-column]
[Timeline: left-bordered entries]
[Action buttons]
```

### Modal (Centered)
```
[Overlay: position:fixed, inset:0, backdrop-filter:blur(4px)]
[Box: width: min(540px, 94vw), max-height: 90vh, scroll]
[Title]
[Content]
[Footer: cancel | primary action]
```

---

## 4. Dashboard Hierarchy

```
LEVEL 1 — Summary Metrics (KPI cards)
  → Total rent, total collected, overdue, expenses, net
  → Always visible, always current month

LEVEL 2 — Smart Widgets (collection gauge, sparkline, ranking)
  → Collection rate visualization
  → Trend over 6 months
  → Building performance ranking

LEVEL 3 — Building Summary Table
  → Per-building breakdown: tenants, rent, collected, overdue, net

LEVEL 4 — Alerts
  → Overdue payments (red alert cards)
  → Contract expiry warnings (60 days)

LEVEL 5 — Deep Links
  → Each building row clickable → building detail page
```

---

## 5. Sidebar / Navigation Rules

### Structure Rules
1. Sections: GENEL, BİNALAR, ARAÇLAR
2. Each section has a label (`sb-section-label`) — uppercase, spaced
3. Nav items: icon (22px wide) + label text + optional badge
4. Exactly one active state at a time
5. Admin-only items: rendered but actions blocked for non-admins (future: hide)

### Active State Pattern
```
Default:  transparent bg, ink-3 text
Hover:    glass-light bg, ink-1 text
Active:   rgba(blue,0.12) bg, blue-l text, 3px left border, pl-7
Badge:    rose pill, top-right of label
```

### Icon Motion
Every nav icon has a hover animation: `scale(1.25) rotate(-4deg)`. This confirms interactivity without confusion.

---

## 6. Month / Date Selector Rules

### Must-Haves
- Single horizontal row (never wrap to multiple rows)
- Scrollable internally (not page-level)
- Mask gradient on left/right edges (indicates scrollability)
- Arrow buttons flanking the bar
- Active month: blue bg + border
- Auto-scroll active month into view after every render

### Never
- Wrap year+months to new rows
- Cause the page body to scroll horizontally
- Fire month selection during a drag

### Interaction States
```
default  → transparent border, ink-3 text
hover    → glass-mid bg, ink-1 text, border-subtle border
active   → blue-15% bg, blue-l text, blue-30% border, fw-600
focus    → 2px blue outline (keyboard)
drag     → cursor: grabbing on bar, no selection
```

---

## 7. KPI Card Pattern

```
[2px top gradient line (color = kpi-color)]
[Icon emoji — 18px]
[Value — 18–28px, font-weight:700, kpi-color]
[Label — 10.5px, ink-3]
[Optional sub — 10.5px, fw-600]
```

Color assignment:
- Financial positive → emerald
- Financial negative → rose
- Neutral / count → blue
- Expense → amber

Hover: `translateY(-2px)` + `--shadow-md`

---

## 8. Responsive Behavior Standards

### Breakpoints
| Width | Adjustments |
|-------|-------------|
| ≥ 1920px | Full density, 5-column KPI grid possible |
| 1440–1919px | 4-column KPI grid, full sidebar |
| 1366–1439px | 3-column KPI grid, search bar narrower, buttons smaller |
| < 1366px | Not officially supported; best-effort |

### Rules
1. **Never use `width: 100vw` inside a flex/grid child** — causes overflow
2. **All flex children need `min-width: 0`** — prevents blowout
3. **Tables always in `overflow-x: auto` wrapper** — never naked in page
4. **Month bar always `flex-wrap: nowrap; overflow-x: auto`** — single scrollable row
5. **Modals: `width: min(540px, 94vw)`** — fits on any width

---

## 9. Empty States

```
[Icon: 36px, opacity: 0.5]
[Text: "Bu ay için kayıt yok", ink-4, 13px]
[Optional action button]
```

Use for: no tenants, no expenses, no overdue, no history, no WA log.

---

## 10. Admin / Settings Page Patterns

### User Management Table
- Columns: Avatar+Name, Role badge, Permissions desc, PIN dots, Status, Actions
- Actions always in last column, flex row of small buttons
- Edit/Reset/Toggle/Delete
- Inline form expands below clicked row (no navigation)
- Add user: "+ Ekle" button → inline form at top of table

### Settings Page (Modal)
Sections: General settings → Data management → Danger zone (admin only)
- Danger zone: red border-left, clear warning text, confirmation required

---

## 11. Print Layout Rules

When `@media print`:
- Hide: `#sb, #topbar, .btn, .period-bar, #toast, #login-screen, #panel-overlay, #panel, #modal-overlay, FAB`
- `body, html`: `overflow: visible; height: auto`
- Tables: `break-inside: avoid`
- Background colours: browser may print them if user enables (use `print-color-adjust: exact`)
- Font size: reduce to 10–11px for tables

---

## 12. Component Inventory

| Component | Class/ID | Location |
|-----------|----------|----------|
| Month bar outer | `.mbar-outer` | Rendered by `monthBar()` |
| Period bar (scrollable) | `.period-bar` | Inside mbar-outer |
| Arrow button | `.mbar-arrow` | Left/right of period-bar |
| Year tag | `.year-tag` | Inside period-bar |
| Month button | `.mbtn` | Inside period-bar |
| KPI grid | `.kpi-grid` | Dashboard, reports |
| KPI card | `.kpi-card` | Inside kpi-grid |
| Table card | `.table-card` | All data pages |
| Table scroller | `.table-scroller` | Inside table-card |
| Badge | `.badge .b-{color}` | Status columns |
| Panel overlay | `#panel-overlay` | Singleton |
| Panel (slide-over) | `#panel` | Singleton |
| Modal overlay | `#modal-overlay` | Singleton |
| Modal box | `#modal` | Singleton |
| Toast | `#toast` | Singleton, bottom-right |
| FAB | `#fab` | Singleton, bottom-right |
| Command palette | `#cmd-overlay` | Singleton |
| Sync bar | Rendered inline | Cloud-configured pages |
| Timeline | `.timeline` | History page |
| WA reminder card | `.wa-reminder-card` | WA page |
| Analytics tabs | `.analytics-tabs` | Analytics page |
| Overdue card | `.overdue-card` | Dashboard |
| Gauge SVG | Inline SVG | Smart widgets |
| Sparkline SVG | Inline SVG | Smart widgets |
| Rank list | `.rank-list` | Smart widgets |
| Heatmap | `.heatmap` | Analytics heatmap tab |
