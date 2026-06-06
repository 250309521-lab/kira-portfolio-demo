# KiraTakipPro v6 — Project Backlog

_Last updated: 2026-06-01_

---

## RELEASE BLOCKERS

### [HIGH] Import History panel: light-mode override ineffective due to inline style

**File:** `src/renderer.html:4012` (inline), `src/renderer.html:3743` (CSS override)

**Summary:**
`#import-hist-panel` carries `background:#0a1628` as an inline `style` attribute.
The light-theme CSS rule `[data-theme="light"] #import-hist-panel { background:#e4eaf5; ... }`
cannot override an inline style without `!important`. In light mode the panel renders
dark (`#0a1628`) against the white application background.

**Fix:** Add `!important` to the three conflicting declarations in the CSS rule at line 3743
(`background`, `border-color`, `box-shadow`). CSS-only, zero risk of dark-mode regression
because the selector is scoped to `[data-theme="light"]`.

**Status:** Fix required before release.

---

## VISUAL TECH DEBT

### [MEDIUM] Management Account hero stats: class name mismatch (`mgmt-sv` vs `mgmt-stat-val`)

**File:** `src/renderer.html:3086` (CSS), `src/renderer.html:8049-8052` (template)

**Summary:**
CSS defines `.mgmt-stat-val { font-size:16px; font-weight:700 }` and two light-mode overrides
targeting the same class. The hero stat value elements in the template use class `mgmt-sv`,
which has no CSS definition. Stat values therefore render at inherited size (~13px, normal weight)
instead of the intended 16px bold. The `.cp2` companion class (month count cell) is also
undefined in CSS, leaving that value without explicit color in any theme.

**Origin:** Pre-existing in v5.1.9. **Not introduced by the legacy → mgmt rename.**
The rename correctly changed all legacy `*-sv` instances to `mgmt-sv` instances. The CSS/template
mismatch already existed under the old names.

**Fix strategy (when scheduled):**
- Add `.mgmt-sv { font-size:16px; font-weight:700 }` to CSS (additive, no HTML changes).
- Add `.cp2 { color:var(--violet-l) }` plus light-mode override, after auditing that
  the color also works on the EUR column in the monthly debt table (line 8077 also uses `.cp2`).

**Status:** Not release-blocking. Defer to future UI polish phase.

---

## FUTURE PHASES

### [DEFERRED] Legacy Cleanup Phase — audit and remove remaining prototype/personal identifiers

**Summary:**
Certain internal identifiers (e.g. historical personal names used as variable/key names
during prototyping) remain in the codebase. These do not affect the user-facing product
but represent technical debt.

**Scope when scheduled:**
- Audit all internal identifiers, comments, and data keys for prototype-era naming.
- Plan renames with full migration shim coverage (pattern established in v6.1 legacy → mgmt
  migration: shim on all 6 load paths, verified by `ktp_migration_verify.js`).
- Preserve backward compatibility for any existing user data that may carry legacy keys.
- Maintain migration safety — no silent data loss.

**Constraints:**
- Do NOT rename internal identifiers during the current UI stabilization phase unless
  they cause a visible user-facing issue.
- Perform only after: UI stabilization complete, localization QA complete, production freeze.
- Each rename requires its own migration shim and runtime verification script.

**Status:** Deferred. Do not begin during current stabilization cycle.

---

## COMPLETED

### [DONE] `legacy → mgmt` data key migration (v6.1)

- All 6 data load paths shimmed (`loadLocal`, cloud pull, JSON backup, import overwrite,
  import merge, backup restore).
- All function names, STRINGS keys, CSS classes, DOM IDs, route keys renamed.
- 242 tests passing, 0 failed.
- Migration verified by `ktp_migration_verify.js` (47/47 checks pass).
- New saves and exports use `mgmt:` exclusively; legacy payloads are promoted
  transparently on first load.
