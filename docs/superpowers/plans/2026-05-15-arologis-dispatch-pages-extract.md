# D-AX-11 Arologis Dispatch Pages Extract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the working Arologis dispatch admin pages from Samhan Public desktop into `clients/arologis-desktop`.

**Architecture:** Keep Samhan Public desktop intact for this PR. Copy and adapt only the dispatch pages, API clients, and realtime helper that the new Arologis desktop app needs, then replace the placeholder route with a nested dispatch route shell.

**Tech Stack:** Electron Vite, React 18, React Router 6, TanStack Query 5, Axios, TypeScript.

---

## File Structure

| Path | Responsibility |
|---|---|
| `clients/arologis-desktop/src/renderer/api/arologisManual.ts` | Manual dispatch preview/create API |
| `clients/arologis-desktop/src/renderer/api/arologisDispatch.ts` | Pre-classify, regional, unassigned API |
| `clients/arologis-desktop/src/renderer/api/dispatchReconcile.ts` | Dispatch reconcile API copied from Samhan Public if page requires it |
| `clients/arologis-desktop/src/renderer/realtime/createRealtimeClient.ts` | Minimal SSE helper used by Arologis dispatch realtime |
| `clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts` | Dispatch-specific SSE client |
| `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx` | Nested dispatch page nav |
| `clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx` | Manual dispatch page |
| `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx` | Pre-classify page |
| `clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx` | Unassigned slips page |
| `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx` | Reconcile page |
| `clients/arologis-desktop/src/renderer/routes/index.tsx` | Replace placeholder with nested child routes |
| `docs/qa/arologis-dispatch-pages-extract/scenarios.md` | QA scenarios and capture checklist |

## Task 1: API And Realtime Extraction

**Files:**
- Create: `clients/arologis-desktop/src/renderer/api/arologisManual.ts`
- Create: `clients/arologis-desktop/src/renderer/api/arologisDispatch.ts`
- Create: `clients/arologis-desktop/src/renderer/api/dispatchReconcile.ts`
- Create: `clients/arologis-desktop/src/renderer/realtime/createRealtimeClient.ts`
- Create: `clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts`

- [ ] **Step 1: Copy the existing API clients**

Copy the bodies from:

```text
clients/desktop/src/renderer/api/arologisManualApi.ts
clients/desktop/src/renderer/api/arologisDispatchApi.ts
clients/desktop/src/renderer/api/dispatchReconcileApi.ts
```

Use these destination names:

```text
clients/arologis-desktop/src/renderer/api/arologisManual.ts
clients/arologis-desktop/src/renderer/api/arologisDispatch.ts
clients/arologis-desktop/src/renderer/api/dispatchReconcile.ts
```

- [ ] **Step 2: Fix imports in copied API clients**

Each copied file must import the Arologis desktop API client:

```ts
import { apiClient, type ApiEnvelope } from './client'
```

No import may point back to `clients/desktop`.

- [ ] **Step 3: Copy realtime helper**

Copy:

```text
clients/desktop/src/renderer/realtime/createRealtimeClient.ts
clients/desktop/src/renderer/realtime/ArologisRealtimeClient.ts
```

to:

```text
clients/arologis-desktop/src/renderer/realtime/createRealtimeClient.ts
clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts
```

Keep this import in `ArologisRealtimeClient.ts`:

```ts
import { createRealtimeClient } from './createRealtimeClient'
```

- [ ] **Step 4: Typecheck extracted API files**

Run:

```powershell
cd clients/arologis-desktop
npm run typecheck
```

Expected before route/page copy: failures are allowed only for unused exports if the project linter enforces them. There must be no unresolved import to `clients/desktop`.

- [ ] **Step 5: Commit**

```powershell
git add clients/arologis-desktop/src/renderer/api/arologisManual.ts `
        clients/arologis-desktop/src/renderer/api/arologisDispatch.ts `
        clients/arologis-desktop/src/renderer/api/dispatchReconcile.ts `
        clients/arologis-desktop/src/renderer/realtime/createRealtimeClient.ts `
        clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts
git commit -m "feat(arologis): 배차 API와 realtime client 이전"
```

## Task 2: Dispatch Route Shell

**Files:**
- Create: `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx`
- Modify: `clients/arologis-desktop/src/renderer/routes/index.tsx`
- Delete after replacement: `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesPlaceholderPage.tsx`

- [ ] **Step 1: Create dispatch layout**

Create `DispatchesLayout.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/dispatches/manual', label: '수동 배차' },
  { to: '/dispatches/pre-classify', label: '가배차 분류' },
  { to: '/dispatches/unassigned', label: '미배차' },
  { to: '/dispatches/reconcile', label: '실배차 비교' },
]

export function DispatchesLayout(): JSX.Element {
  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', margin: 0 }}>배차</h1>
        <nav style={{ display: 'flex', gap: 8, marginTop: 12 }} aria-label="배차 메뉴">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              style={({ isActive }) => ({
                padding: '6px 10px',
                borderRadius: 4,
                textDecoration: 'none',
                border: '1px solid var(--color-border)',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                background: isActive ? 'var(--color-surface)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </section>
  )
}
```

- [ ] **Step 2: Add temporary route targets**

Before copying pages, use simple components inside `index.tsx` imports only if needed:

```tsx
function PendingPage({ title }: { title: string }): JSX.Element {
  return <p>{title} 이전 작업 중입니다.</p>
}
```

This temporary function must be removed in Task 3 after real pages are wired.

- [ ] **Step 3: Replace placeholder route**

Update `clients/arologis-desktop/src/renderer/routes/index.tsx` so `/dispatches` nests children:

```tsx
import { DispatchesLayout } from './dispatches/DispatchesLayout'

// inside children
{
  path: 'dispatches',
  element: <DispatchesLayout />,
  children: [
    { index: true, element: <Navigate to="/dispatches/manual" replace /> },
    { path: 'manual', element: <PendingPage title="수동 배차" /> },
    { path: 'pre-classify', element: <PendingPage title="가배차 분류" /> },
    { path: 'unassigned', element: <PendingPage title="미배차" /> },
    { path: 'reconcile', element: <PendingPage title="실배차 비교" /> },
  ],
}
```

- [ ] **Step 4: Remove placeholder import and file**

Delete `DispatchesPlaceholderPage.tsx` only after `index.tsx` no longer imports it.

- [ ] **Step 5: Commit**

```powershell
git add clients/arologis-desktop/src/renderer/routes/index.tsx `
        clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx
git rm clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesPlaceholderPage.tsx
git commit -m "feat(arologis): 배차 하위 라우트 shell 추가"
```

## Task 3: Page Copy And Import Alignment

**Files:**
- Create: `clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx`
- Create: `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx`
- Create: `clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx`
- Create: `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx`
- Modify: `clients/arologis-desktop/src/renderer/routes/index.tsx`

- [ ] **Step 1: Copy the four page files**

Copy and rename:

```text
clients/desktop/src/renderer/routes/ArologisManualDispatchPage.tsx -> clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx -> clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx
clients/desktop/src/renderer/routes/ArologisUnassignedPage.tsx -> clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx
clients/desktop/src/renderer/routes/ArologisDispatchReconcilePage.tsx -> clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx
```

- [ ] **Step 2: Fix API imports**

Use these import mappings:

```ts
// ManualDispatchPage.tsx
import {
  createManualDispatch,
  previewManualDispatch,
  DISPATCH_TYPE_LABEL,
  DISPATCH_TYPE_OPTIONS,
  TONNAGE_LABEL,
  TONNAGE_OPTIONS,
  type ArologisDispatchType,
  type ArologisVehicleTonnage,
  type ManualDispatchPreviewResponse,
  type ManualDispatchRequest,
} from '../../api/arologisManual'

// PreClassifyPage.tsx and UnassignedPage.tsx
import {
  getPreClassify,
  getRegional,
  getUnassigned,
} from '../../api/arologisDispatch'

// DispatchReconcilePage.tsx
import { ... } from '../../api/dispatchReconcile'
```

- [ ] **Step 3: Remove Samhan Public-only dependencies**

If a copied page imports these modules, replace or remove them:

```text
../hooks/usePageTitle
@samhan/design-system
../components/RoleGuard
```

For `usePageTitle`, replace with a plain `document.title` effect:

```tsx
import { useEffect } from 'react'

function useArologisPageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} - 아로로지스`
  }, [title])
}
```

Place the helper in each copied page only if needed. Do not introduce a shared helper unless at least two pages need it after copy.

- [ ] **Step 4: Wire real pages in router**

Replace Task 2 temporary route elements:

```tsx
import { ManualDispatchPage } from './dispatches/ManualDispatchPage'
import { PreClassifyPage } from './dispatches/PreClassifyPage'
import { UnassignedPage } from './dispatches/UnassignedPage'
import { DispatchReconcilePage } from './dispatches/DispatchReconcilePage'

{ path: 'manual', element: <ManualDispatchPage /> },
{ path: 'pre-classify', element: <PreClassifyPage /> },
{ path: 'unassigned', element: <UnassignedPage /> },
{ path: 'reconcile', element: <DispatchReconcilePage /> },
```

- [ ] **Step 5: Typecheck**

Run:

```powershell
cd clients/arologis-desktop
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add clients/arologis-desktop/src/renderer/routes/index.tsx `
        clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx `
        clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx `
        clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx `
        clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx
git commit -m "feat(arologis): 배차 운영 화면 4종 이전"
```

## Task 4: QA Document And Build Verification

**Files:**
- Create: `docs/qa/arologis-dispatch-pages-extract/scenarios.md`

- [ ] **Step 1: Create QA scenarios**

Create `docs/qa/arologis-dispatch-pages-extract/scenarios.md`:

```markdown
# D-AX-11 아로로지스 배차 페이지 이전 QA

## 시나리오 1: 수동 배차
- 경로: `#/dispatches/manual`
- 기대: 카톡 텍스트 입력, 미리보기, 차량/정차 폼, 저장 버튼 표시
- UUID 노출: 없음
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png`

## 시나리오 2: 가배차 분류
- 경로: `#/dispatches/pre-classify`
- 기대: 권역/시도 분류 탭과 결과 표 표시
- UUID 노출: 없음
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png`

## 시나리오 3: 미배차
- 경로: `#/dispatches/unassigned`
- 기대: 미배차 목록과 수동 배차 이동 링크 표시
- UUID 노출: 없음
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png`

## 시나리오 4: 실배차 비교
- 경로: `#/dispatches/reconcile`
- 기대: 운송사 실배차 비교 화면 표시
- UUID 노출: 없음
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png`

## 로컬 검증
- `cd clients/arologis-desktop && npm run typecheck`
- `cd clients/arologis-desktop && npm run build`
```

- [ ] **Step 2: Run typecheck and build**

Run:

```powershell
cd clients/arologis-desktop
npm run typecheck
npm run build
```

Expected: both commands PASS.

- [ ] **Step 3: Commit**

```powershell
git add docs/qa/arologis-dispatch-pages-extract/scenarios.md
git commit -m "test(arologis): D-AX-11 배차 페이지 이전 QA 시나리오 추가"
```

## Self Review

- Spec coverage: D-AX-11 page/API/realtime extraction is covered by Tasks 1-4.
- Scope control: `DispatchSmsPage`, D-AX-12, D-AX-13 are excluded and remain follow-up work.
- Type consistency: API destination imports use `./client`; route pages use `../../api/*`.
- Placeholder scan: No `TBD` or open-ended implementation steps remain.
