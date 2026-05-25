# Kira Takip Pro — Design System
**Version:** 5.1

---

## 1. Design Philosophy

**Direction:** Premium dark enterprise SaaS — Apple iOS 18 × Linear × Vercel  
**Tone:** Refined, precise, high-information-density without feeling cluttered  
**Key rule:** Every element must earn its place. No decorative chrome without purpose.

---

## 2. Color Palette

### Base Layers
```css
--bg-base:     #060d1a   /* body background — deepest navy */
--bg-elevated: #0a1628   /* sidebar, modals */
--bg-overlay:  #0f1e38   /* dropdowns, tooltips */
--bg-subtle:   #132040   /* hover states, secondary sections */
--bg-muted:    #192a52   /* borders, dividers */
```

### Glass System
```css
--glass-light: rgba(255,255,255,0.04)   /* card backgrounds */
--glass-mid:   rgba(255,255,255,0.07)   /* hover states */
--glass-heavy: rgba(255,255,255,0.11)   /* active states */
```

### Border System
```css
--border-subtle: rgba(255,255,255,0.06)   /* default borders */
--border-normal: rgba(255,255,255,0.10)   /* modal borders */
--border-strong: rgba(255,255,255,0.18)   /* login box */
```

### Accent Colors
```css
--blue:    #3b82f6    /* primary actions, active states */
--blue-l:  #60a5fa    /* text on dark, active labels */
--blue-d:  #2563eb    /* button hover */
--blue-glow: rgba(59,130,246,0.25)

--violet:  #8b5cf6    /* secondary accent, Alper section */
--violet-l:#a78bfa
--teal:    #14b8a6    /* tertiary accent */
--teal-l:  #2dd4bf

--emerald: #10b981    /* success / paid */
--emerald-l:#34d399
--amber:   #f59e0b    /* warning / partial payment */
--amber-l: #fbbf24
--rose:    #f43f5e    /* danger / overdue / delete */
--rose-l:  #fb7185
```

### Ink (Text) Scale
```css
--ink-0: #ffffff    /* primary headings, values */
--ink-1: #e8edf8    /* body text */
--ink-2: #a8b8d8    /* secondary text, table headers */
--ink-3: #637594    /* labels, placeholders */
--ink-4: #3d4f6e    /* muted text, timestamps */
--ink-5: #1e2d45    /* borders used as text (rare) */
```

### Semantic Colors
```css
--success:        var(--emerald)
--success-bg:     rgba(16,185,129,0.10)
--success-border: rgba(16,185,129,0.20)

--warning:        var(--amber)
--warning-bg:     rgba(245,158,11,0.10)
--warning-border: rgba(245,158,11,0.20)

--danger:         var(--rose)
--danger-bg:      rgba(244,63,94,0.10)
--danger-border:  rgba(244,63,94,0.20)

--info:           var(--blue)
--info-bg:        rgba(59,130,246,0.10)
--info-border:    rgba(59,130,246,0.20)
```

---

## 3. Typography

### Fonts
```css
--font-sans: 'DM Sans', system-ui, -apple-system, sans-serif;
/* Clean, slightly geometric. Better than Inter for financial data. */

--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
/* For: numbers, PINs, meter numbers, amounts in tables */
```

### Scale
```css
--font-size-xs:  11px   /* timestamps, muted labels */
--font-size-sm:  12px   /* table cells, secondary text */
--font-size-md:  13px   /* body, default, form inputs */
--font-size-lg:  15px   /* page titles, modal headers */
--font-size-xl:  18px   /* KPI values (small) */
--font-size-2xl: 22px   /* login title */
--font-size-3xl: 28px   /* large KPI values */
```

### Weights
- **400** — body text, descriptions
- **500** — nav items, default labels
- **600** — `.fw-600` — table headers, section labels
- **700** — `.fw-700` — KPI values, names, prices

### Usage Rules
- Use `font-family: var(--font-mono)` for all financial amounts when they need to align in columns
- Never use `font-weight: 900` — too heavy against dark backgrounds
- Letter spacing: `-0.3px` to `-0.5px` for large numbers only

---

## 4. Spacing System

Based on 4px grid:

| Token | Value | Use |
|-------|-------|-----|
| `--r-sm` | 8px | Badges, small buttons |
| `--r-md` | 12px | Form inputs, cards |
| `--r-lg` | 16px | Main cards, panels |
| `--r-xl` | 20px | Login box, modals |

### Padding Guidelines
- Table cells: `8px 11px` (compact, data-dense)
- KPI cards: `16px` all sides
- Modals: `28px`
- Sidebar sections: `12px 8px`
- Page content: `20px`

---

## 5. Shadow System

```css
--shadow-sm: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5);
--shadow-md: 0 4px 16px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4);
--shadow-lg: 0 12px 40px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.5);
--shadow-xl: 0 24px 64px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.5);
--shadow-glow-blue: 0 0 0 1px rgba(59,130,246,0.3), 0 0 24px rgba(59,130,246,0.15);
```

**Rules:**
- Cards use `--shadow-md` on hover only (not default state)
- Modals use `--shadow-xl` always
- Sidebar uses no shadow (border instead)
- Floating elements (FAB, toast) use `--shadow-lg`

---

## 6. Glassmorphism Rules

```css
/* Standard glass card */
background: var(--glass-light);
border: 1px solid var(--border-subtle);
border-radius: var(--r-lg);

/* Premium glass (login, modals) */
background: rgba(10,22,40,0.85);
backdrop-filter: blur(40px) saturate(180%);
-webkit-backdrop-filter: blur(40px) saturate(180%);
border: 1px solid var(--border-normal);
```

**Rules:**
- Only use `backdrop-filter` on elements that float above other content (modals, panels, login)
- Regular cards: `glass-light` background + `border-subtle` border (no blur — performance)
- Table rows: `rgba(255,255,255,0.03)` on hover (not glass — too heavy for many rows)
- Limit blur value: login=40px, modal=20px, topbar=20px, panel=30px

---

## 7. Button Hierarchy

### Primary (`.btn-primary`)
```css
background: var(--blue);
color: #fff;
box-shadow: 0 2px 8px rgba(59,130,246,0.3);
/* Hover: background: --blue-d, box-shadow increases */
```
Use for: Save, Add, Primary action (one per view)

### Secondary (`.btn-secondary`)
```css
background: var(--glass-mid);
color: var(--ink-2);
border: 1px solid var(--border-subtle);
```
Use for: Secondary actions (CSV, Excel, alternative)

### Ghost (`.btn-ghost`)
```css
background: transparent;
color: var(--ink-3);
border: 1px solid var(--border-subtle);
```
Use for: Cancel, Print, tertiary actions

### Danger (`.btn-danger`)
```css
background: var(--danger-bg);
color: var(--rose-l);
border: 1px solid var(--danger-border);
```
Use for: Delete, destructive actions

### Success (`.btn-success`)
```css
background: var(--success-bg);
color: var(--emerald-l);
border: 1px solid var(--success-border);
```
Use for: WhatsApp send, payment confirmation

### Size Variants
- Default: `padding: 7px 14px; font-size: 12px`
- `.btn-sm`: `padding: 5px 10px; font-size: 11.5px`
- `.btn-xs`: `padding: 3px 8px; font-size: 11px; border-radius: 6px`

---

## 8. Badge / Status System

All badges follow this structure:
```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 600;
}
.badge::before { content: '●'; font-size: 8px; }
```

| Class | Color | Use Case |
|-------|-------|----------|
| `.b-green` | Emerald | Ödendi (Paid) |
| `.b-orange` | Amber | Kısmi (Partial) |
| `.b-red` | Rose | Ödenmedi (Overdue) |
| `.b-blue` | Blue | Info, navigate |
| `.b-gray` | Muted | Vacant, inactive |
| `.b-violet` | Violet | Special, Alper |

---

## 9. Sidebar States

### Item States
```css
/* Default */
.nav { color: var(--ink-3); background: transparent; }

/* Hover */
.nav:hover { background: var(--glass-light); color: var(--ink-1); }

/* Active */
.nav.active {
  background: rgba(59,130,246,0.12);
  color: var(--blue-l);
  font-weight: 600;
  border-left: 3px solid var(--blue);
  padding-left: 7px; /* compensates for border */
}
```

### Icon Animation (`.nav .ni`)
```css
transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1);

.nav:hover .ni  { transform: scale(1.25) rotate(-4deg); }
.nav.active .ni { transform: scale(1.1); }
```

### Badge (unread count)
```css
.nbadge {
  background: var(--rose);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 20px;
}
```

---

## 10. Month / Date Selector Design

### Container
```css
.mbar-outer { display: flex; align-items: center; gap: 4px; }
.period-bar {
  flex: 1; overflow-x: auto; flex-wrap: nowrap;
  padding: 6px 12px; gap: 4px;
  background: var(--glass-light);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  /* Fade edges to show scrollability */
  -webkit-mask: linear-gradient(90deg, transparent, #000 32px, #000 calc(100% - 32px), transparent);
}
```

### Arrow Buttons
```css
.mbar-arrow {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--glass-light);
  border: 1px solid var(--border-subtle);
  color: var(--ink-2);
}
.mbar-arrow:hover { background: var(--glass-mid); border-color: rgba(59,130,246,0.3); }
```

### Month Button States
```css
/* Default */
.mbtn { color: var(--ink-3); border-color: transparent; background: transparent; }

/* Hover */
.mbtn:hover { background: var(--glass-mid); color: var(--ink-1); border-color: var(--border-subtle); }

/* Active */
.mbtn.active {
  background: rgba(59,130,246,0.15);
  color: var(--blue-l);
  border-color: rgba(59,130,246,0.3);
  font-weight: 600;
}

/* Focus (keyboard) */
.mbtn:focus { outline: 2px solid var(--blue); outline-offset: 2px; }

/* Drag cursor */
.period-bar.dragging { cursor: grabbing; }
```

---

## 11. Table Design

### Table Card Structure
```html
<div class="table-card">
  <div class="table-card-header">
    <div class="table-card-title">...</div>
    <!-- optional actions -->
  </div>
  <div class="table-scroller">
    <table>...</table>
  </div>
</div>
```

### Header Row
```css
thead th {
  background: rgba(255,255,255,0.03);
  color: var(--ink-4);
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  position: sticky; top: 0;
}
```

### Row States
```css
tbody tr:hover     { background: rgba(74,138,244,0.05); }  /* subtle blue tint */
tbody tr.clickable { cursor: pointer; }
.tfoot-row td      { background: rgba(255,255,255,0.03); font-weight: 600; }
```

---

## 12. Animation Rules

### Entry Animation
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
.page-enter { animation: fadeInUp 0.25s cubic-bezier(0.16,1,0.3,1); }
```

### Hover Interactions
```css
.btn:hover { transform: translateY(-1px) scale(1.03); }
.btn:active { transform: scale(0.97); }
.kpi-card:hover { transform: translateY(-2px); }
.login-user-btn:hover { transform: translateX(6px); }
```

### Modal / Panel Entry
```css
@keyframes modalIn  { from { transform: scale(0.92); opacity: 0; } }
@keyframes slideInRight { from { transform: translateX(100%); } }
```

### Easing Curve
For bounce effects: `cubic-bezier(0.34, 1.56, 0.64, 1)` — slight overshoot  
For smooth slides: `cubic-bezier(0.16, 1, 0.3, 1)` — ease-out expo

### Rules
- No animation longer than 300ms for interactive elements
- Modal: 200–250ms
- Page transitions: 220ms
- Hover: 150–180ms
- Never animate layout (width/height) on large elements — use opacity/transform only

---

## 13. Dark / Light Theme

**Current:** Dark only (v5)

**CSS Variable approach for v6:**
```css
:root { /* dark mode default */ }
[data-theme="light"] {
  --bg-base: #f0f4f8;
  --bg-elevated: #ffffff;
  --ink-0: #0a1628;
  --ink-1: #1e2d45;
  /* ... inverted scale */
}
```

Toggle in `<html data-theme="dark|light">` with `localStorage.setItem('theme', value)`.
