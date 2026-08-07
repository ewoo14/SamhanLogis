# PR #1078 / 이슈 #1075 — S33 main 병합 완주 보고서

## 결과

- `git merge --no-commit --no-ff origin/main` 재개 후 지정 충돌 6개를 해소했다.
- 충돌 hunk는 기존 판단표대로 양쪽 기능을 보존했다.
- `origin/main`에서 삭제된 `BundleOptionRow.tsx`는 복원하지 않았다. `EstimateFormPage.tsx`의 import, `updateSetOption`, 모바일/데스크톱 옵션 행 렌더 참조를 main 기준으로 제거했다.
- 커밋·푸시·`git merge --continue`는 수행하지 않았다. 병합 결과는 스테이징 상태다.

## ① 새 상태·화면 조합 점검

견적 BUNDLE 후보 선택 경로를 코드 기준으로 확인했다.

1. `EstimateFormPage`의 품목 후보 확정은 `handleProductSelection`으로 들어가며, catalog 규격이면 `specificationSource: CATALOG`를 계승한다. 사용자가 직접 규격을 수정하면 `USER`로 전환된다.
2. 후보가 BUNDLE이어도 `BundleOptionRow`와 `updateSetOption`은 더 이상 견적 화면에 없다. 따라서 이 화면에서 세트 옵션을 조작하는 UI 경로는 없다.
3. 기존 편집 라인의 `setOptions`는 `line.setOptions ?? emptyBundleSetOptions()`로 복원되고, 새 라인은 빈 옵션으로 시작한다. 저장 payload에는 `toApiBundleSetOptions(l.productType, l.setOptions)`가 남아 있다.
4. 백엔드 `EstimateService`는 후보 BUNDLE 전개 시 `assignBundleComponent(..., setOptions)`를 사용하고, 구성품 provenance도 함께 저장한다. revision snapshot은 `specificationSource`와 `bundleSetOptions`를 함께 보존한다.

따라서 RED-A의 provenance/snapshot 경로와 RED-B의 편집 재진입 `setOptions` 보존 경로는 동시에 코드상 살아 있다. 다만 옵션 조작 화면 자체는 main 삭제 판정에 따라 존재하지 않으며, 브라우저 조합은 Playwright 진입 차단으로 실측 완료하지 못했다.

## ② 식별자 전수 grep

소스·테스트 기준 결과:

- `BundleOptionRow`: 활성 TS/TSX import·render 참조 0건. 삭제 파일은 스테이징 `D` 상태.
- `updateSetOption`: 활성 참조 0건.
- `emptyBundleSetOptions`: 견적/전표 초기화·복원·payload 경로에 의도된 참조 유지.
- `BundleSetOptions`: API 타입, 견적/전표 DTO·도메인·snapshot·테스트에서 의도된 참조 유지.

과거 handoff/QA 문서와 Playwright 실패 산출물에는 `BundleOptionRow` 문자열이 남지만 실행 소스 참조는 아니다.

## ③ 변경 파일을 import하는 테스트

### BE

실행 원문:

```text
./gradlew :services:slip-service:test --tests EstimateRevisionSnapshotTest --tests EstimateRevisionServiceTest --tests EstimateRestoreTest --tests BundleOptionRoundTripTest --tests BundleProductGuardTest --tests EstimateServiceTest
BUILD SUCCESSFUL
18 actionable tasks: 2 executed, 16 up-to-date
```

### FE 선행 빌드

실행 원문:

```text
npm run build                         # clients/web/design-system
✓ built in 4.00s

npm run build:web                     # clients/desktop
✓ built in 5.07s
```

### FE unit/contract

실행 원문:

```text
npm exec vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx src/renderer/routes/line-input-ux-r23.contract.test.ts
Test Files  2 passed (2)
Tests       61 passed (61)
```

### Playwright headless

`VITE_MOCK_MODE=1`, `PLAYWRIGHT_SKIP_WEB_SERVER=1`, `AUDIT_BASE_URL=http://127.0.0.1:5175` 및 Playwright Chromium 기본 headless 설정으로 실행했다.

```text
npx playwright test playwright/bundle-set-options --reporter=line
Running 7 tests using 1 worker
7 failed
Received: "대시보드"; Expected: "새 판매전표"
```

PWA 설정 없는 direct Vite 실행에서는 첫 화면이 다음 오류로 막혔다:

```text
[plugin:vite:import-analysis] Failed to resolve import "virtual:pwa-register"
```

PWA 설정 Vite로 재실행한 결과는 `BundleOptionRow` 해석 오류가 아니라 `/sales/new` 이동 후 대시보드에 머무는 harness/라우팅 차단이다.

## 남은 차단

1. Playwright mock 실행 환경이 `/sales/new`를 열지 못해 RED-A와 RED-B의 브라우저 조합 실측은 미완료다. Docker 재기동 없이 PM이 기존 QA 실행 방식/라우팅 설정을 확인해야 한다.
2. 견적 화면에서 BUNDLE 옵션을 조작할 UI는 main 삭제 판정에 따라 제거된 상태다. 옵션 입력이 요구사항이라면 `BundleOptionRow` 복원/대체 외의 별도 제품 결정이 필요하며, 이번 작업에서는 임의 복원하지 않았다.

## 새로 만든 파일

`git status --porcelain` 기준 이번 세션 신규 파일:

- `docs/dev-reports/2026-08-07-1075-s33-merge-completion.md`
