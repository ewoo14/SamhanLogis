# 개발책임자 결정으로 되돌림

# S34 — 견적 화면 세트 옵션 UI 복원

## 범위

PR #1078 / 이슈 #1075의 CI 실패를 해소하기 위해, `EstimateFormPage`에서 삭제된 BUNDLE 세트 옵션 입력 행을 복원했다. 삭제 전 `BundleOptionRow`의 계약과 현재 `SlipFormPage`의 `BundleSetOptions` 필드(`remoteOption`, `remoteExcluded`, `panelOption`, `panelShape360`, `materialIncluded`)를 유지했다.

금액 계산, BUNDLE 전개 API, `SlipFormPage` 구현은 변경하지 않았다. 견적의 기존 hydrate/API 경로도 그대로 사용한다.

## 구현

- 새 `clients/desktop/src/renderer/routes/components/BundleOptionRow.tsx` 추가
- 견적 모바일 카드의 `children`과 데스크톱 라인 footer에 BUNDLE일 때만 옵션 행 렌더
- 옵션 변경은 `updateLine(i, { setOptions: { ...line.setOptions, ...patch } }, true)`로만 반영
- 기존 저장 경로 `toApiBundleSetOptions(l.productType, l.setOptions)`와 편집 hydrate 경로 `line.setOptions ?? emptyBundleSetOptions()` 보존

## ① 새 상태·화면 조합 점검

| 조합 | 결과 | 근거 |
|---|---|---|
| 견적 신규 → 모델명 `SET-HM2WAY` onBlur → 옵션 행/360 선택지 | GREEN | `playwright/bundle-set-options` 7/7; `bundle-options-0`, `bundle-options-0-panel-360` 가시성 단언 통과 |
| 견적 옵션 변경 → 저장 payload | 코드 경로 보존 | `EstimateFormPage`의 `buildBody`가 기존 `toApiBundleSetOptions`를 사용하며 옵션 UI는 동일 `setOptions`를 갱신 |
| 견적 저장 후 재편집 hydrate | 코드 경로 보존 | `setOptions: line.setOptions ?? emptyBundleSetOptions()` 유지; 타입검사 통과 |
| 견적 revision 복원 후 선택 | revision 화면 회귀 GREEN | `estimate-version-history` 2/2; 복원 API 경로는 기존 `buildMockEstimateDetail`/hydrate 경로를 사용 |
| 견적 → 판매전표 전환 | 변환 코드 비변경 | `EstimateDetailPage`는 기존 `convertEstimate(id)`만 호출하고, 전표 세트 전개/금액 로직은 수정하지 않음. 저장 옵션의 변환까지 확인하는 mock 전용 시나리오는 없음 |

마지막 조합은 현재 저장된 선택값을 실제 mock 변환 응답까지 왕복 단언하는 기존 테스트가 없어 런타임 증거를 확보하지 못했다. 이는 구현 변경으로 생긴 실패가 아니라 테스트/fixture 차단이며, 해당 차단을 남긴다.

## ② 식별자 전수 grep

실행:

```text
rg -n "BundleOptionRow|bundle-options-[A-Za-z0-9-]*" clients/desktop/src clients/desktop/playwright
```

결과:

- `BundleOptionRow` import/렌더는 `EstimateFormPage`의 모바일·데스크톱 2곳뿐이다.
- `bundle-options-*` 구현은 새 컴포넌트 1곳뿐이다.
- `bundle-set-options.spec.ts`가 요구하는 testid와 새 컴포넌트 testid가 일치한다.
- `SlipFormPage`에는 해당 testid/새 컴포넌트의 고아 참조가 없고 기존 인라인 옵션 구현은 그대로다.

## ③ 참조 테스트·검증

### RED 재현

작업 워크트리의 `clients/desktop`에서 복원 전 실행:

```text
npx playwright test playwright/bundle-set-options --reporter=line
Running 7 tests using 1 worker
1 failed — 시나리오 5, bundle-options-0 element(s) not found
6 passed
```

### 복원 후

```text
npm run build                         # clients/web/design-system — exit 0
npm run build:web                     # clients/desktop — exit 0
npx playwright test playwright/bundle-set-options --reporter=line
7 passed (10.9s)

npm run typecheck                     # clients/desktop — exit 0
npx vitest run src/renderer/routes/SlipFormPage.test.tsx src/renderer/api/slip.test.ts
103 passed (95 + 8)
npx vitest run src/renderer/api/estimateApi.test.ts src/renderer/api/estimateRevision.test.ts
1 passed (estimateApi; estimateRevision 파일은 대상 없음)

npx playwright test playwright/estimate-version-history --reporter=line
2 passed

npx playwright test --workers=4 --reporter=line
Running 658 tests using 4 workers
658 passed (3.6m)
```

전체 mock 수는 요청 기준 657보다 줄지 않았고, 현재 워크트리 집합은 658 passed다. `--workers=1` 전체 실행은 5분 제한에 걸려 결과 없이 timeout 되었으나, 동일 전체 집합의 `--workers=4` headless 실행은 완료·통과했다.

`git diff --check`도 통과했다. Docker 및 서비스 재기동은 하지 않았다.

## 남은 차단

- 견적에서 변경한 옵션을 저장 → 재편집 → revision restore → 견적→전표 변환까지 한 번에 왕복하는 mock Playwright 시나리오가 현재 저장소에 없다. 기존 hydrate/API/convert 코드 경로는 보존됐지만 이 조합의 독립 런타임 단언은 후속 테스트가 필요하다.
- Playwright 전체 기준 수치가 사용자 제시 657에서 현재 658로 관측된다. 감소는 없으며, 집합 증가 원인은 이번 변경과 무관한 기존 스펙 집합이다.
