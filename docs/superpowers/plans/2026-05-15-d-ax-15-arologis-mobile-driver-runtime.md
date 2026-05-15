# D-AX-15 arologis-mobile driver runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the proven driver dashboard and GPS tracking screens from `clients/mobile-staff` into `clients/arologis-mobile` so the standalone driver app has a real post-login runtime.

**Architecture:** Keep a conservative local boundary for this PR. `arologis-mobile` owns dashboard/GPS screens, driver API helpers, tokens, and utility functions locally; `mobile-staff` remains unchanged except documentation. Signature and photo flows stay for a follow-up PR.

**Tech Stack:** React Native 0.79, Expo SDK 53, TypeScript 5.8, PowerShell, Playwright screenshot generation.

---

## File Structure

- Create: `clients/arologis-mobile/src/screens/driver/DriverDashboardScreen.tsx`  
  Driver dispatch dashboard copied into the standalone app.
- Create: `clients/arologis-mobile/src/screens/driver/DriverLocationTrackingScreen.tsx`  
  Driver foreground GPS reporting screen copied into the standalone app.
- Create: `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`  
  Minimal two-tab dashboard/GPS navigator for D-AX-15.
- Create: `clients/arologis-mobile/src/api/arologis.ts`  
  Arologis driver app API helper using `EXPO_PUBLIC_AROLOGIS_API_BASE`.
- Create: `clients/arologis-mobile/src/utils/userColorHash.ts`  
  User color hash copied locally for RN Metro compatibility.
- Modify: `clients/arologis-mobile/src/theme/tokens.ts`  
  Expand to the full mobile-staff RN token superset and preserve existing `2xl` alias.
- Modify: `clients/arologis-mobile/src/hooks/useGpsPermission.ts`  
  Export `getCurrentPositionAsync` for GPS reporting.
- Modify: `clients/arologis-mobile/src/navigation/RootNavigator.tsx`  
  Route authenticated users to `DriverTabNavigator`.
- Create: `qa/playwright/scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.mjs`
- Create: `scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- Create: `docs/qa/d-ax-15-arologis-mobile-driver-runtime/scenarios.md`
- Create: `docs/dev-reports/d-ax-15-arologis-mobile-driver-runtime.md`
- Modify: `clients/arologis-mobile/README.md`, `clients/mobile-staff/README.md`, `docs/handoff/CURRENT-WORK.md`, `migration/decisions/DECISIONS.md`

---

### Task 1: Add Dashboard/GPS Runtime To arologis-mobile

**Files:**
- Create: `clients/arologis-mobile/src/screens/driver/DriverDashboardScreen.tsx`
- Create: `clients/arologis-mobile/src/screens/driver/DriverLocationTrackingScreen.tsx`
- Create: `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`
- Create: `clients/arologis-mobile/src/api/arologis.ts`
- Create: `clients/arologis-mobile/src/utils/userColorHash.ts`
- Modify: `clients/arologis-mobile/src/theme/tokens.ts`
- Modify: `clients/arologis-mobile/src/hooks/useGpsPermission.ts`

- [ ] **Step 1: Copy dashboard/GPS source files**

Run:

```powershell
New-Item -ItemType Directory -Force clients/arologis-mobile/src/screens/driver,clients/arologis-mobile/src/utils | Out-Null
Copy-Item clients/mobile-staff/src/screens/driver/DriverDashboardScreen.tsx clients/arologis-mobile/src/screens/driver/
Copy-Item clients/mobile-staff/src/screens/driver/DriverLocationTrackingScreen.tsx clients/arologis-mobile/src/screens/driver/
Copy-Item clients/mobile-staff/src/utils/userColorHash.ts clients/arologis-mobile/src/utils/userColorHash.ts
Copy-Item clients/mobile-staff/src/theme/tokens.ts clients/arologis-mobile/src/theme/tokens.ts
```

Expected: files exist under `clients/arologis-mobile/src` and no `mobile-staff` imports are introduced.

- [ ] **Step 2: Add minimal arologis API helper**

Create `clients/arologis-mobile/src/api/arologis.ts` with `fetchTodayDispatches` and `reportLocation` using `apiFetch`.

Expected: no new package dependency is required.

- [ ] **Step 3: Preserve token compatibility**

In `clients/arologis-mobile/src/theme/tokens.ts`, keep the mobile-staff token superset and add:

```ts
'2xl': 22,
```

inside `typography.fontSize` so existing `PhoneLoginScreen` remains valid.

- [ ] **Step 4: Export GPS position helper**

Add `getCurrentPositionAsync()` to `clients/arologis-mobile/src/hooks/useGpsPermission.ts`.

- [ ] **Step 5: Run boundary search**

Run:

```powershell
rg -n "clients/mobile-staff|\\.\\./\\.\\./\\.\\./mobile-staff" clients/arologis-mobile/src
```

Expected: no output.

---

### Task 2: Wire Authenticated Root To Driver Navigator

**Files:**
- Modify: `clients/arologis-mobile/src/navigation/RootNavigator.tsx`
- Create: `clients/arologis-mobile/src/screens/driver/DriverTabNavigator.tsx`

- [ ] **Step 1: Route authenticated users to driver tabs**

Replace the placeholder `DispatchListScreen` render with:

```tsx
return (
  <DriverTabNavigator
    token={auth.accessToken}
    driverCode={auth.driverCode}
    backgroundGranted={gps.backgroundGranted}
  />
);
```

Expected: login success opens the real driver runtime.

- [ ] **Step 2: Add two-tab navigator**

Create `DriverTabNavigator` with only `dashboard` and `tracking` tabs:

```ts
type Tab = 'dashboard' | 'tracking';
```

Render:

```tsx
<DriverDashboardScreen token={token} driverCode={driverCode} />
<DriverLocationTrackingScreen token={token} backgroundGranted={backgroundGranted} />
```

Expected: no signature/photo imports exist in D-AX-15.

- [ ] **Step 3: Keep dispatch placeholder file unused**

Leave `DispatchListScreen.tsx` in place for history, but `RootNavigator` should no longer render it after auth.

---

### Task 3: Typecheck

**Files:**
- All `clients/arologis-mobile/src` files

- [ ] **Step 1: Run typecheck**

Run:

```powershell
cd clients/arologis-mobile
npm run typecheck
```

Expected: `tsc --noEmit` exits 0. No new dependency is needed for the D-AX-15 B scope. If `node_modules` is absent, run `npm install` first to hydrate the existing lockfile.

- [ ] **Step 2: Fix only local compile issues**

If compile errors appear, fix only `clients/arologis-mobile` files. Do not change `clients/mobile-staff` runtime in this PR.

---

### Task 4: QA Screenshots And Docs

**Files:**
- Create: `qa/playwright/scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.mjs`
- Create: `scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- Create: `docs/qa/d-ax-15-arologis-mobile-driver-runtime/scenarios.md`
- Create: `docs/dev-reports/d-ax-15-arologis-mobile-driver-runtime.md`
- Modify: `clients/arologis-mobile/README.md`
- Modify: `clients/mobile-staff/README.md`
- Modify: `docs/handoff/CURRENT-WORK.md`
- Modify: `migration/decisions/DECISIONS.md`

- [ ] **Step 1: Add Playwright mock screenshot script**

Create a script that renders 8 Korean pages at 1200 x 820 and writes:

```text
01-authenticated-driver-tabs.png
02-driver-dashboard.png
03-gps-tracking.png
04-dashboard-empty.png
05-dashboard-error.png
06-gps-permission-block.png
07-typecheck-pass.png
08-import-boundary-pass.png
```

Expected: all text is readable in a GitHub PR body.

- [ ] **Step 2: Add PowerShell wrapper**

Create `scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1` that runs the Node script from `qa/playwright`.

- [ ] **Step 3: Generate screenshots**

Run:

```powershell
.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1
```

Expected: all 8 PNG files exist under `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots`.

- [ ] **Step 4: Update docs**

Document result, validation commands, screenshot list, and follow-up removal of `mobile-staff` driver mode.

---

### Task 5: Final Verification And PR

**Files:**
- All changed files

- [ ] **Step 1: Final commands**

Run:

```powershell
cd clients/arologis-mobile
npm install
npm run typecheck
cd ..\..
rg -n "clients/mobile-staff|\\.\\./\\.\\./\\.\\./mobile-staff" clients/arologis-mobile/src
.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1
git status --short
```

Expected: typecheck passes, boundary search has no output, screenshots regenerate, only intended files are changed plus the pre-existing untracked `.codex/config.toml`.

- [ ] **Step 2: Commit in Korean**

Commit with a Korean message such as:

```powershell
git add clients/arologis-mobile docs/qa/d-ax-15-arologis-mobile-driver-runtime docs/dev-reports/d-ax-15-arologis-mobile-driver-runtime.md qa/playwright/scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.mjs scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1 clients/mobile-staff/README.md docs/handoff/CURRENT-WORK.md migration/decisions/DECISIONS.md docs/superpowers/specs/2026-05-15-d-ax-15-arologis-mobile-driver-runtime-design.md docs/superpowers/plans/2026-05-15-d-ax-15-arologis-mobile-driver-runtime.md
git commit -m "feat(d-ax-15): 아로로지스 모바일 대시보드 GPS 이식"
```

- [ ] **Step 3: Push and open PR**

Push branch `codex/d-ax-15-arologis-mobile-driver-runtime` and create a PR with the 10 screenshots inline.

---

## Self-Review

- Spec coverage: dashboard/GPS copy, route wiring, QA screenshots, docs, final verification are mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or open-ended implementation step remains.
- Type consistency: `DriverTabNavigator` receives `token`, `driverCode`, and `backgroundGranted`; child screens continue to receive their existing props.
