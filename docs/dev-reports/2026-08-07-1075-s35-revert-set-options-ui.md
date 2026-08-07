# S35 — S34 되돌림: 견적 세트 옵션 UI 제거

## 결론

개발책임자 결정에 따라 데스크톱 견적 화면에만 복원됐던 S34 세트 옵션 입력 UI를 제거했다. 웹 종합견적서·주문서 범위와 데스크톱 견적/판매전표 범위를 분리했으며, `#1078` 후보 모달·규격 provenance와 `#1077` 금액/세트 데이터 계약은 보존했다.

변경은 S34 커밋 `dcf01e474`의 추가분에 한정했다.

## ① 되돌림으로 새로 가능한 상태·조합 점검

| 조합 | 결과 | 근거 |
|---|---|---|
| 견적에 BUNDLE 품목 입력 → onBlur lookup → 자동 구성행 | GREEN | `bundle-set-options` 7/7; 시나리오 5의 `SET-HM2WAY` 값 유지 단언 통과. 옵션 행은 렌더하지 않음 |
| BUNDLE 견적 저장 payload | GREEN / 경로 보존 | `EstimateFormPage`의 `toApiBundleSetOptions`와 `setOptions` 초기화·계승·payload 경로 유지; FE `slip.test.ts` 8/8 |
| 저장된 견적 재편집 | GREEN / 경로 보존 | `setOptions: line.setOptions ?? emptyBundleSetOptions()` 유지; `EstimateFormPage.coedit.test.tsx` 55/55, `estimateApi.test.ts` 1/1 |
| 견적 버전 복원 | GREEN / 경로 보존 | provenance unit 5/5, estimate collaboration 2/2, 백엔드 Estimate/Bundle 필터 테스트 성공 |
| BUNDLE 라인에 옵션 데이터가 이미 있어도 견적 화면이 깨지지 않음 | GREEN | 입력 UI import/렌더 제거 후 desktop `build:web` 및 집중 Playwright 7/7 통과; 데이터는 화면과 독립된 저장 계약으로 유지 |

옵션 입력 UI 제거로 인해 “견적 화면에서 옵션을 조작”하는 조합은 의도적으로 불가능해졌다. 옵션 데이터의 초기화·계승·payload·snapshot 경로는 삭제하지 않았다.

## RED 실행 원문

### RED-A — 활성 데스크톱 UI 참조 0건

```text
rg -n "BundleOptionRow|bundle-options-" clients/desktop/src clients/desktop/playwright
(no matches)
```

S34 보고서, 기존 handoff/spec/QA 캡처 원문에는 과거 구현을 설명하는 문자열이 남아 있다. 이 기록은 삭제하지 않았으며, 실행 소스·테스트·스토리북 기준 참조는 0건이다. S34 보고서 자체도 보존 의무가 있어 저장소 전체 문자 grep을 0건으로 만들 수는 없다.

### RED-B / RED-C — 보존 확인

```text
rg -n "setOptions: line\.setOptions \?\? emptyBundleSetOptions|toApiBundleSetOptions|emptyBundleSetOptions" clients/desktop/src
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:303: setOptions: line.setOptions ?? emptyBundleSetOptions(),
clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1749: setOptions: toApiBundleSetOptions(l.productType, l.setOptions),
... 초기화·계승·전표 payload 경로 다수
```

`estimateSpecificationProvenance` decode/encode와 후보 모달 import/handler는 변경 diff에 포함되지 않았다.

## ② 식별자 전수 확인

확인 대상: `BundleOptionRow`, `bundle-options-*`, S34가 `EstimateFormPage.tsx`에 추가한 import·두 렌더 블록·`updateLine` 옵션 핸들러.

- 활성 `clients/desktop/src`, Playwright spec, 테스트, 스토리북: 0건
- 삭제 파일: `clients/desktop/src/renderer/routes/components/BundleOptionRow.tsx`
- Playwright 시나리오 5에서 제거한 것은 `bundle-options-0`, `bundle-options-0-panel-360` 두 단언뿐이며, `modelInput.toHaveValue('SET-HM2WAY')` 단언은 유지
- 기존 판매전표의 데이터 경로와 UI는 이번 diff에서 변경하지 않음

## ③ 변경 파일 참조 테스트

### 빌드·타입

```text
clients/web/design-system: npm run build                      exit 0
clients/desktop: npm run build:web                            exit 0
clients/desktop: npm run typecheck                            exit 0
```

### FE unit/contract

```text
npx vitest run src/renderer/routes/EstimateFormPage.coedit.test.tsx \
  src/renderer/routes/SlipFormPage.test.tsx src/renderer/api/slip.test.ts \
  src/renderer/api/estimateApi.test.ts src/renderer/api/estimateCollab.test.ts \
  src/renderer/utils/estimateSpecificationProvenance.test.ts \
  src/renderer/components/audit/SlipVersionHistoryPanel.test.tsx
Test Files  7 passed (7)
Tests       171 passed (171)
```

### BE 세트·견적 관련

```text
services/slip-service: ..\..\gradlew.bat test --tests "*Estimate*" --tests "*Bundle*" --no-daemon
BUILD SUCCESSFUL in 1m 12s

services/product-service: ..\..\gradlew.bat test --tests "*Bundle*" --no-daemon
BUILD SUCCESSFUL in 46s
```

Docker와 서비스 재기동은 하지 않았다.

### Playwright headless

```text
npx playwright test playwright/bundle-set-options --reporter=line
Running 7 tests using 1 worker
7 passed (11.9s)
```

사용자가 지정한 단일 worker 전체 명령도 실행했으나 604초 timeout(exit 124)으로 성공 집계하지 않았다.

병렬 worker로 전체 집합을 끝까지 실행한 원문:

```text
npx playwright test --workers=4 --reporter=line
Running 658 tests using 4 workers
1 failed
  development-menu-dev2.spec.ts:93 — 클라이언트 팝업은 캐러셀과 공지별 다시 보지 않기 영속 처리를 제공한다
657 passed (3.6m)
```

따라서 요청 기준 658 대비 통과 수는 정상적으로 657이며, 실패 1건은 S35 변경 파일 및 세트/견적 경로와 무관한 기존 `development-menu-dev2` 시나리오다. 전체 “실패 0” 게이트는 이 차단 때문에 미충족이다.

## 변경·스테이징 범위

S35에서 새로 만든 파일:

- `docs/dev-reports/2026-08-07-1075-s35-revert-set-options-ui.md`

수정/삭제 파일:

- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`
- `clients/desktop/playwright/bundle-set-options/bundle-set-options.spec.ts`
- `clients/desktop/src/renderer/routes/components/BundleOptionRow.tsx` (삭제)
- `docs/dev-reports/2026-08-07-1075-s34-estimate-set-options-restore.md` (서두에 되돌림 문구 추가)

기존 사용자 미추적 산출물 `docs/dev-reports/2026-08-07-1075-r13-live-qa.md`, `docs/qa-shots/`는 건드리거나 스테이징하지 않았다.

## 남은 차단

1. 전체 Playwright에 기존 `development-menu-dev2` 1건 실패가 남아 있다. S35 관련 실패는 집중 suite 및 대상 unit/BE 테스트에서 재현되지 않았다.
2. 저장된 BUNDLE 옵션을 데스크톱 견적 입력 UI에서 재조작하는 경로는 개발책임자 결정으로 제거된 상태가 정상이다. 웹 종합견적서·주문서의 옵션 동작은 이번 범위에서 건드리지 않았다.
