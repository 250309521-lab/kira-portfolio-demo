# KiraTakipPro v6 — Windows Code Signing Plan (CODE-SIGNING-0A)

> **Scope:** Windows-first closed paid beta signing only.  
> **Baseline:** `1a6f674522181533535918d54b0d0b119aba886c`  
> **Status:** PLANNING — blocked on certificate procurement.

---

## 1. Purpose

This document freezes the Windows code signing strategy for the first closed paid beta. Signed installers eliminate the Windows SmartScreen "Windows protected your PC" block that users would see on every new machine with the current unsigned build.

---

## 2. Scope

**Included in this phase:**
- Windows NSIS installer signing (x64)
- Windows portable EXE signing (x64)
- GitHub Actions signing workflow (Windows release build, `workflow_dispatch` only)
- Signing verification gate

**Explicitly excluded from this phase:**
- Mac public signing or notarization — Mac remains internal dogfood only and must not be expanded here
- Apple Developer Program enrollment
- Hardened runtime or notarization for Mac
- Auto-update / Squirrel / electron-updater configuration
- GitHub Releases publishing
- Linux signing

---

## 3. Current Windows Build Config

```
Targets:    nsis (x64) + portable (x64)
Publisher:  "Kira Takip Pro"
Artifacts:  KiraTakipPro-Customer-Setup-*.exe (NSIS)
            KiraTakipPro-Customer-*-portable.exe (portable)
```

| Config item | Current state |
|---|---|
| `sign` | **NOT SET** |
| `certificateFile` | **NOT SET** |
| `certificatePassword` | **NOT SET** |
| `signingHashAlgorithms` | NOT SET (electron-builder default: SHA-256) |
| `timeStampServer` | NOT SET (electron-builder default: DigiCert TSA) |
| GitHub Actions Windows workflow | **DOES NOT EXIST** |
| `publish` config | **NOT SET** |
| Auto-update | **NOT CONFIGURED** |

---

## 4. Recommended Beta Signing Strategy

### Phase 1 (First closed beta): OV Code Signing Certificate

An **Organization Validation (OV)** certificate is the minimum viable approach for the first closed paid beta.

| Property | OV Certificate |
|---|---|
| Cost | ~$200–400/year |
| Procurement | Online from Sectigo, DigiCert, Certum, etc. |
| SmartScreen trust | Builds over time (~100–1000 downloads) |
| EV hardware token required | **No** — stored as a `.pfx` file |
| CI-compatible | **Yes** — upload PFX as GitHub Actions secret |
| Timeline | 1–5 business days after identity verification |
| First-run warning for beta users | "More info → Run anyway" is still required initially |

**Beta user communication:** Brief all beta testers that the first run shows a SmartScreen dialog and that "More info → Run anyway" is safe. This is acceptable for a controlled closed beta of ≤30 users.

### Phase 2 (Before public launch): EV Code Signing Certificate

An **Extended Validation (EV)** certificate gives instant SmartScreen trust from the first install, but requires a hardware security token (USB key) and additional CI setup.

| Property | EV Certificate |
|---|---|
| Cost | ~$350–600/year |
| Hardware token | Required (USB token or cloud HSM) |
| CI-compatible | Requires Azure Key Vault or DigiCert KeyLocker integration |
| SmartScreen trust | **Instant** — no warmup period |
| Timeline | 3–10 business days |

EV is the target before public launch (DISTRIBUTION-0A) but is not required for the closed paid beta.

---

## 5. Required GitHub Actions Secret Names

The following secrets must be added to the GitHub repository → Settings → Secrets before the signing workflow can be created. **Secret values must never be committed to the repository.**

| Secret name | Contents |
|---|---|
| `WIN_CSC_LINK` | Base64-encoded `.pfx` certificate file content |
| `WIN_CSC_KEY_PASSWORD` | Password for the `.pfx` certificate |
| `SIGNTOOL_PATH` | *(Optional)* Full path to `signtool.exe` if not on PATH in the CI runner |

**electron-builder reads `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` automatically** from environment variables in `winPackager.js`. No additional configuration is needed in `package.json` for these.

---

## 6. Certificate Security Rules (Non-Negotiable)

- The `.pfx` certificate file and its password **must never be committed** to the repository or any Git history.
- The certificate must not appear in build logs, `echo` output, or GitHub Actions step summaries.
- The Base64-encoded certificate in `WIN_CSC_LINK` should be treated with the same secrecy as a private key.
- If a certificate is accidentally leaked: revoke it immediately with the issuing CA and issue a new one.
- Local `.pfx` files used for testing must be added to `.gitignore` before any Git operations.
- The `.gitignore` entry to add (before implementation): `*.pfx`, `*.p12`, `*.cer`, `*.spc`

---

## 7. Future Implementation Plan

When a certificate is available and secrets are configured, the implementation involves only three targeted changes:

### 7.1 `package.json` (minimal additions to `build.win`)

```json
"win": {
  // ... existing config unchanged ...
  "signingHashAlgorithms": ["sha256"],
  "timeStampServer": "http://timestamp.digicert.com"
},
"nsis": {
  // ... existing config unchanged ...
  "artifactName": "KiraTakipPro-Customer-Setup-${version}.exe"  // explicit name
}
```

No other `package.json` changes. No `publish` config. No auto-update config.

### 7.2 New GitHub Actions workflow: `.github/workflows/build-win-release.yml`

Key requirements:
- Trigger: `workflow_dispatch` only — **not** push, not PR, not tag
- Runner: `windows-latest`
- Steps: checkout → Node 20 → `npm ci` → `npm run prebuild` → `node src/tests/run.js` → `npm run build -- --publish never`
- Signing env vars from GitHub secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`
- No `GH_TOKEN`, no GitHub release publishing, no artifact registry push
- Upload signed NSIS installer and portable EXE as GitHub Actions artifacts
- `--publish never` flag on the build command (belt-and-suspenders)
- Signing verification step after build (see §8)

### 7.3 No other file changes

No modifications to `src/main.js`, `src/renderer.html`, `src/preload.js`, `src/cloud/*`, test files, or the Mac dogfood workflow.

---

## 8. Signing Verification Gate

After `npm run build` completes on the CI runner, run:

```powershell
# Windows runner — verify the NSIS installer is validly signed
signtool verify /pa /v "dist/KiraTakipPro-Customer-Setup-6.0.0.exe"
```

Expected output: `Number of files successfully Verified: 1`

If this step fails, the workflow must exit with an error and **must not upload the artifact**. An unsigned installer must never be silently shipped as a "signed" artifact.

---

## 9. Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| OV certificate → SmartScreen still warns on first ~100 installs | Certain | Medium | Brief beta users; EV for public launch |
| `.pfx` accidentally committed | Low (if discipline maintained) | **Critical** | Add `*.pfx` to `.gitignore` before any local work; CI secret only |
| `WIN_CSC_KEY_PASSWORD` leaked in CI logs | Low | **Critical** | Never echo secrets; use `${{ secrets.* }}` only |
| Unsigned installer shipped as "signed" | Low | High | Signing verification gate (§8) exits on failure |
| Accidental GitHub Release publish | Low | Medium | `--publish never` + no `publish` config + no `GH_TOKEN` |
| Certificate expires mid-beta | Medium | High | Set calendar reminder 30 days before expiry; renewal is fast |
| SmartScreen reputation resets on new app version | Low | Low | Reputation is built per publisher name + hash; signing with same OV cert helps |

---

## 10. Blocker

**CODE-SIGNING-0A implementation cannot proceed until all of the following are complete:**

1. An OV (or EV) code signing certificate `.pfx` file is procured from a CA
2. The certificate password is known and stored securely (not in the repo)
3. `WIN_CSC_LINK` (Base64 PFX) is added to GitHub Actions repo secrets
4. `WIN_CSC_KEY_PASSWORD` is added to GitHub Actions repo secrets

Until these prerequisites are met, the implementation steps in §7 cannot be executed. The planning and documentation phases (this document) are complete.

---

## 11. Allowed Parallel Work While Certificate Is Pending

While waiting for certificate procurement, the following roadmap phase may begin in audit/planning mode:

- **`LICENSE-ENTITLEMENT-0A` — audit and design only** — plan the `isProUser()` / `canUse*()` central entitlement helpers and identify the exact files that need changes. Do not change code-signing scope during this parallel work.

Code changes for `LICENSE-ENTITLEMENT-0A` implementation may begin before the certificate arrives since they do not depend on signing.

---

## 12. Completion Criteria for CODE-SIGNING-0A

This phase is COMPLETE when:

1. Certificate procured and secrets configured in GitHub
2. `package.json` `signingHashAlgorithms` and explicit NSIS `artifactName` added
3. `build-win-release.yml` workflow created and passing
4. Signed NSIS installer and portable EXE produced by CI
5. `signtool verify` step confirms valid signature
6. Signed installer installs on a clean Windows machine without SmartScreen hard-block (may still show "More info" for OV)
7. No certificate, password, or PFX content appears in any Git commit, artifact, or log
