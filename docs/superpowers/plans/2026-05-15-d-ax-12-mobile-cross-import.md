# D-AX-12 Mobile Cross-Import Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the direct `DriverTabNavigator -> ../SlipDetailScreen` cross-import in `clients/mobile-staff` and leave a clear guard boundary before moving driver screens to `clients/arologis-mobile`.

**Architecture:** Add a driver-local `DriverSlipDetailEntry` component that owns slip-detail entry behavior. `DriverTabNavigator` renders this boundary instead of importing the Samhan Public slip screen directly. QA evidence uses large Korean Playwright mock screenshots so PR readers can inspect the change clearly on GitHub mobile and desktop.

**Tech Stack:** React Native 0.79, Expo SDK 53, TypeScript 5.8, Jest, Playwright, PowerShell wrapper, Markdown docs.

---

## File Structure

- Create: `clients/mobile-staff/src/screens/driver/DriverSlipDetailEntry.tsx`  
  Driver-local guard screen for slip detail entry. Shows a Korean readiness message while dispatch API does not provide real slip ids.
- Modify: `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx`  
  Replace direct `SlipDetailScreen` import with `DriverSlipDetailEntry`.
- Modify: `clients/mobile-staff/src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx`  
  Update mocks and add driver slip guard regression.
- Create: `qa/playwright/scripts/generate-d-ax-12-mobile-cross-import-screenshots.mjs`  
  Render large Korean mock QA screenshots.
- Create: `scripts/generate-d-ax-12-mobile-cross-import-screenshots.ps1`  
  PowerShell wrapper used by QA and PR authors.
- Create: `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`  
  QA steps and screenshot criteria.
- Create: `docs/dev-reports/d-ax-12-mobile-cross-import.md`  
  Dev report and validation log.
- Modify: `clients/mobile-staff/README.md`  
  Document the driver slip boundary.
- Modify: `clients/arologis-mobile/README.md`  
  Document the next migration step.
- Modify: `migration/decisions/DECISIONS.md`  
  Add D-AX-12 decision.
- Modify: `docs/handoff/CURRENT-WORK.md`  
  Update current handoff state.

---

### Task 1: Driver Slip Entry Boundary

**Files:**
- Create: `clients/mobile-staff/src/screens/driver/DriverSlipDetailEntry.tsx`
- Modify: `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx`

- [ ] **Step 1: Create the driver-local guard component**

Create `DriverSlipDetailEntry.tsx` with this shape:

```tsx
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  token: string | null;
  slipId: string;
  slipNo?: string;
  partnerName?: string | null;
  onBack: () => void;
}

export default function DriverSlipDetailEntry({
  slipId,
  slipNo,
  partnerName,
  onBack,
}: Props): JSX.Element {
  const displaySlipNo = slipNo ?? '전표 미연결';
  const displayPartnerName = partnerName ?? '거래처 정보 대기';
  const isPlaceholder = slipId.startsWith('vehicle-') || slipId.length === 0;

  return (
    <View style={styles.container} testID="driver-slip-detail-entry-mobile">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>D-AX-12</Text>
        <Text style={styles.title}>전표 상세 연결 준비 중</Text>
        <Text style={styles.body}>
          현재 기사 배차 응답에는 실제 전표 식별자가 포함되지 않아 Samhan Public 전표 상세를
          직접 열지 않습니다. 배차 데이터에 전표 번호가 연결되면 이 화면에서 아로로지스 전용
          상세로 이어집니다.
        </Text>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>선택 항목</Text>
          <Text style={styles.metaValue}>{displaySlipNo}</Text>
          <Text style={styles.metaSub}>{displayPartnerName}</Text>
          {isPlaceholder ? (
            <Text style={styles.placeholderBadge}>배차 vehicle 기준 임시 항목</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          testID="driver-slip-detail-entry-back-mobile"
        >
          <Text style={styles.backLabel}>배차 목록으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Replace the import in DriverTabNavigator**

In `DriverTabNavigator.tsx`, replace:

```tsx
import SlipDetailScreen from '../SlipDetailScreen';
```

with:

```tsx
import DriverSlipDetailEntry from './DriverSlipDetailEntry';
```

Then replace the render block with:

```tsx
if (slipDetailRoute) {
  return (
    <DriverSlipDetailEntry
      token={token}
      slipId={slipDetailRoute.slipId}
      slipNo={slipDetailRoute.slipNo}
      partnerName={slipDetailRoute.partnerName}
      onBack={() => setSlipDetailRoute(null)}
    />
  );
}
```

- [ ] **Step 3: Add component styles**

Use the existing mobile-staff token pattern:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.app,
    padding: spacing[4],
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[5],
    gap: spacing[3],
  },
  eyebrow: {
    fontSize: typography.fontSize.xs,
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  title: {
    fontSize: typography.fontSize.xl,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.sans,
  },
  body: {
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    lineHeight: typography.fontSize.base * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
  metaBox: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[1],
  },
  metaLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  metaValue: {
    fontSize: typography.fontSize.lg,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  metaSub: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  placeholderBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.button,
    backgroundColor: colors.state.infoBg,
    color: colors.state.info,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.semibold,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  backLabel: {
    color: colors.ink.onPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
});
```

- [ ] **Step 4: Commit boundary change**

Run:

```powershell
git add clients/mobile-staff/src/screens/driver/DriverSlipDetailEntry.tsx clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx
git commit -m "refactor(d-ax-12): driver tab 전표 상세 경계 분리"
```

Expected: commit succeeds with no unrelated files.

---

### Task 2: Jest Regression

**Files:**
- Modify: `clients/mobile-staff/src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx`

- [ ] **Step 1: Replace obsolete SlipDetailScreen mock**

Remove:

```tsx
jest.mock('../../SlipDetailScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'slip-detail-screen-mock' }),
  };
}, { virtual: true });
```

Add:

```tsx
jest.mock('../../../screens/driver/DriverSlipDetailEntry', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ onBack }: { onBack: () => void }) =>
      ReactActual.createElement(
        RN.View,
        { testID: 'driver-slip-detail-entry-mock' },
        ReactActual.createElement(
          RN.TouchableOpacity,
          { testID: 'driver-slip-detail-entry-back-mock', onPress: onBack },
          ReactActual.createElement(RN.Text, null, 'mock back'),
        ),
      ),
  };
});
```

- [ ] **Step 2: Extend DriverDashboardScreen mock to open slip detail**

Replace the current dashboard mock with:

```tsx
jest.mock('../../../screens/driver/DriverDashboardScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ onOpenSlipDetail }: { onOpenSlipDetail?: (params: { slipId: string; slipNo?: string }) => void }) =>
      ReactActual.createElement(
        RN.View,
        { testID: 'driver-dashboard-screen-mock' },
        ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: 'mock-open-slip-detail',
            onPress: () => onOpenSlipDetail?.({ slipId: 'vehicle-1', slipNo: '차량 #1' }),
          },
          ReactActual.createElement(RN.Text, null, 'mock slip detail'),
        ),
      ),
  };
});
```

- [ ] **Step 3: Add regression test**

Add this test before the signature chain test:

```tsx
it('배차 탭의 전표 보기는 driver-local entry 경계로 진입한다', async () => {
  const utils = render(<DriverTabNavigator token="jwt-x" />);

  fireEvent.press(utils.getByTestId('mock-open-slip-detail'));

  await waitFor(() => {
    expect(utils.getByTestId('driver-slip-detail-entry-mock')).toBeTruthy();
  });
  expect(utils.queryByTestId('driver-dashboard-screen-mock')).toBeNull();

  fireEvent.press(utils.getByTestId('driver-slip-detail-entry-back-mock'));
  await waitFor(() => {
    expect(utils.getByTestId('driver-dashboard-screen-mock')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run focused Jest**

Run:

```powershell
cd clients/mobile-staff
npm test -- SignaturePhotoScreenChain --runInBand
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit test change**

Run:

```powershell
git add clients/mobile-staff/src/__tests__/screens/driver/SignaturePhotoScreenChain.test.tsx
git commit -m "test(d-ax-12): driver 전표 상세 경계 회귀 추가"
```

---

### Task 3: QA Screenshots

**Files:**
- Create: `qa/playwright/scripts/generate-d-ax-12-mobile-cross-import-screenshots.mjs`
- Create: `scripts/generate-d-ax-12-mobile-cross-import-screenshots.ps1`
- Create screenshots under `docs/qa/d-ax-12-mobile-cross-import/screenshots/`

- [ ] **Step 1: Add Playwright screenshot script**

Create a Playwright script that renders two large Korean mock pages at `1000x760`.

Script requirements:

```js
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const outDir = path.join(repoRoot, 'docs', 'qa', 'd-ax-12-mobile-cross-import', 'screenshots');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });

async function capture(name, title, bodyHtml) {
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body { margin:0; font-family: Arial, sans-serif; background:#eef3f5; color:#102024; }
    .frame { width:1000px; height:760px; display:flex; align-items:center; justify-content:center; }
    .phone { width:430px; min-height:680px; background:#f8faf9; border:1px solid #bfd7d1; border-radius:28px; box-shadow:0 22px 50px rgba(0,0,0,.14); padding:28px; }
    .badge { display:inline-flex; padding:6px 12px; border-radius:999px; background:#dff5ef; color:#14715f; font-size:16px; font-weight:700; }
    h1 { margin:18px 0 12px; font-size:32px; line-height:1.18; letter-spacing:0; }
    p { font-size:19px; line-height:1.62; color:#40535a; }
    .panel { margin-top:22px; padding:18px; border-radius:14px; background:white; border:1px solid #d8e4e1; }
    .label { font-size:15px; color:#6a7d83; }
    .value { margin-top:5px; font-size:24px; font-weight:800; color:#142328; }
    .button { margin-top:24px; display:inline-flex; padding:16px 20px; border-radius:10px; background:#2A9D8F; color:white; font-size:18px; font-weight:800; }
    .tabs { display:flex; gap:8px; margin-top:22px; }
    .tab { flex:1; text-align:center; padding:11px 8px; border-radius:9px; border:1px solid #d3dfdc; font-size:15px; color:#52666c; }
    .tab.active { background:#dff5ef; color:#14715f; font-weight:800; border-color:#9ed8cc; }
  </style></head><body><main class="frame"><section class="phone">${bodyHtml}</section></main></body></html>`);
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
}

await capture('01-driver-slip-guard.png', '전표 상세 연결 준비 중', `...`);
await capture('02-signature-chain-regression.png', '배송사진에서 서명으로 연결', `...`);
await browser.close();
```

Fill each `bodyHtml` with visible Korean copy matching the implemented state.

- [ ] **Step 2: Add PowerShell wrapper**

Create:

```powershell
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
Push-Location (Join-Path $RepoRoot "qa\playwright")
try {
  node .\scripts\generate-d-ax-12-mobile-cross-import-screenshots.mjs
} finally {
  Pop-Location
}
```

- [ ] **Step 3: Run screenshot script**

Run:

```powershell
.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1
```

Expected:
- `01-driver-slip-guard.png`
- `02-signature-chain-regression.png`

Both images must be readable at PR size and must not crop important Korean text.

- [ ] **Step 4: Commit QA screenshot tooling**

Run:

```powershell
git add qa/playwright/scripts/generate-d-ax-12-mobile-cross-import-screenshots.mjs scripts/generate-d-ax-12-mobile-cross-import-screenshots.ps1 docs/qa/d-ax-12-mobile-cross-import/screenshots
git commit -m "docs(d-ax-12): PR용 한국어 QA 캡처 추가"
```

---

### Task 4: Docs and Decisions

**Files:**
- Create: `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`
- Create: `docs/dev-reports/d-ax-12-mobile-cross-import.md`
- Modify: `clients/mobile-staff/README.md`
- Modify: `clients/arologis-mobile/README.md`
- Modify: `migration/decisions/DECISIONS.md`
- Modify: `docs/handoff/CURRENT-WORK.md`

- [ ] **Step 1: Write QA scenarios**

Create a concise QA doc with:

```md
# D-AX-12 mobile cross-import QA

## Scenarios

| ID | Case | Expected |
|---|---|---|
| Q1 | driver dashboard 전표 보기 | `DriverSlipDetailEntry` 안내 화면 표시, Samhan Public `SlipDetailScreen` 직접 진입 없음 |
| Q2 | 배송사진 업로드 완료 | 기존처럼 서명 탭으로 자동 이동 |
| Q3 | PR 캡처 가독성 | 1000px 폭 PNG 2장, 한국어 문구 잘림 없음 |

## Screenshots

![driver slip guard](screenshots/01-driver-slip-guard.png)
![signature chain regression](screenshots/02-signature-chain-regression.png)
```

- [ ] **Step 2: Write dev report**

Create a dev report with:

```md
# D-AX-12 mobile-staff driver cross-import 분리 Dev Report

## Result

`DriverTabNavigator` no longer imports `../SlipDetailScreen` directly.

## Validation

- `clients/mobile-staff npm run typecheck`
- `clients/mobile-staff npm test -- SignaturePhotoScreenChain --runInBand`
- QA screenshots generated by Playwright mock render

## Follow-up

- Move driver dashboard / GPS / signature / photo screens to `clients/arologis-mobile`.
- Connect real slipId when dispatch response provides it.
```

- [ ] **Step 3: Update READMEs**

In `clients/mobile-staff/README.md`, add a D-AX-12 note under driver tab:

```md
### D-AX-12 driver slip boundary

`DriverTabNavigator` no longer imports `SlipDetailScreen` directly. Driver slip entry goes through
`screens/driver/DriverSlipDetailEntry.tsx`, which shows a guarded Korean readiness screen until
the dispatch API provides real slip ids.
```

In `clients/arologis-mobile/README.md`, update the follow-up list:

```md
- D-AX-12 완료 후 driver dashboard / GPS / signature / photo 화면을 본 앱으로 이식.
- Samhan Public `SlipDetailScreen` 은 직접 가져오지 않고, 실 slipId 연결이 확정된 뒤 아로로지스 전용 상세를 설계.
```

- [ ] **Step 4: Add DECISIONS entry**

Append D-AX-12 near the D-AX decisions:

```md
### D-AX-12. mobile-staff driver tab cross-import 분리 (2026-05-15)

`DriverTabNavigator` 가 Samhan Public `SlipDetailScreen` 을 직접 import 하던 구조를 driver-local
`DriverSlipDetailEntry` 경계로 분리한다. 현 배차 응답에는 실 slipId 가 없으므로 전표 상세는 준비 안내를
보여주고, 실제 아로로지스 모바일 이식은 후속 PR 로 진행한다. PR 캡처는 1000px 폭 한국어 Playwright mock
PNG 2장을 인라인 첨부한다.
```

- [ ] **Step 5: Update handoff**

Add a top section to `docs/handoff/CURRENT-WORK.md`:

```md
## 2026-05-15 Codex Update — D-AX-12 진행

- Branch: `codex/d-ax-12-mobile-cross-import`
- Scope: mobile-staff driver tab cross-import cleanup.
- QA gate: PR 캡처 2장 large Korean Playwright mock render 필수.
```

- [ ] **Step 6: Commit docs**

Run:

```powershell
git add docs/qa/d-ax-12-mobile-cross-import/scenarios.md docs/dev-reports/d-ax-12-mobile-cross-import.md clients/mobile-staff/README.md clients/arologis-mobile/README.md migration/decisions/DECISIONS.md docs/handoff/CURRENT-WORK.md
git commit -m "docs(d-ax-12): cross-import 분리 산출물 동기화"
```

---

### Task 5: Final Verification

**Files:**
- All changed files

- [ ] **Step 1: Run typecheck**

Run:

```powershell
cd clients/mobile-staff
npm run typecheck
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 2: Run focused Jest**

Run:

```powershell
cd clients/mobile-staff
npm test -- SignaturePhotoScreenChain --runInBand
```

Expected: 2 tests PASS.

- [ ] **Step 3: Regenerate screenshots**

Run:

```powershell
.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1
```

Expected: 2 PNG files updated and readable.

- [ ] **Step 4: Inspect diff**

Run:

```powershell
git status --short
git diff --stat HEAD
rg -n "from '../SlipDetailScreen'|SlipDetailScreen from" clients/mobile-staff/src/screens/driver
```

Expected:
- only intended files changed.
- `rg` returns no direct driver import of `SlipDetailScreen`.

- [ ] **Step 5: Commit any verification-only doc updates**

If validation outputs changed docs, commit:

```powershell
git add docs/dev-reports/d-ax-12-mobile-cross-import.md docs/qa/d-ax-12-mobile-cross-import/scenarios.md
git commit -m "docs(d-ax-12): 검증 결과 반영"
```

---

## Self-Review

- Spec coverage: driver cross-import removal = Task 1; test = Task 2; readable PR screenshots = Task 3; docs/decision/handoff = Task 4; verification = Task 5.
- Placeholder scan: no `TBD` or open-ended TODO remains in the implementation plan.
- Type consistency: `DriverSlipDetailEntry` props match `DriverTabNavigator` state (`token`, `slipId`, `slipNo`, `partnerName`, `onBack`).
