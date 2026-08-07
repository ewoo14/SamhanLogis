# PR #1078 / 이슈 #1075 — main 병합 충돌 해소 보고서

## 결론

6개 지정 충돌 파일의 충돌 마커는 제거하고 양쪽 기능을 병렬 보존했다. 금액 계산식이나 `unitPrice` 전달 semantics는 변경하지 않았다. 다만 실행 검증에서 지정 충돌 밖의 의미 충돌이 발견되어 작업을 중단했다.

`origin/main`이 삭제한 `clients/desktop/src/renderer/routes/components/BundleOptionRow.tsx`를 현재 `EstimateFormPage.tsx`가 계속 import/렌더링한다. 따라서 현재 Vite 실행 경로는 `BundleOptionRow` import 해석 실패로 막힌다. 사용자가 제시한 갈래 밖의 셋째 가능성이므로 임의 복원하지 않았다.

## 충돌 hunk 판단표

| 파일:줄 | 양쪽 의도 | 해소 판단 | 근거 |
|---|---|---|---|
| `bundle-set-options.spec.ts:192-198` | #1078은 견적 BUNDLE 옵션 행/패널 표시를 검증; #1077은 blur 후 모델값/자동 전개를 검증 | 두 단언 모두 유지 | 동일 onBlur 경로의 UI와 값 보존을 함께 검증하며 금액과 무관 |
| `EstimateFormPage.tsx:81-85` | #1078의 `BundleOptionRow`와 규격 provenance decode import; #1077에는 해당 import 없음 | #1078 import 유지 | 후보 자동완성·규격 계승·옵션 행이 같은 화면에 필요 |
| `EstimateFormPage.tsx:2094-2138` | #1078의 `ProductAutocomplete`/옵션 행; #1077의 기본 mobile line callbacks | #1078 블록 유지, callbacks 포함 | #1078 UI가 callbacks를 이미 모두 제공하며 옵션 행을 잃으면 기능 삭제 |
| `ProductSummary.java:25-27, 97-108` | #1078의 `fixedDiscountRate/specification`; #1077의 `bundleMode`와 호환 생성자 | record와 호환 생성자에 세 필드 병렬 보존 | product wire-format 필드가 서로 다른 기능에 사용되며 금액 필드 계산은 변경하지 않음 |
| `Estimate.java:465-466` | #1078의 `specificationSource`; #1077의 `bundleSetOptions` snapshot | 두 필드를 모두 snapshot에 전달 | revision 복원 시 규격 provenance와 세트 옵션을 동시에 보존해야 함 |
| `EstimateSnapshot.java:94-95, 101-128` | #1078의 규격 출처; #1077의 세트 옵션 snapshot | record에 두 필드, 구 생성자는 null 기본값으로 하위호환 | JSONB 구 snapshot은 두 신규 필드가 null이어야 안전하게 역직렬화됨 |
| `EstimateService.java:152-157` | #1078의 component 규격 provenance; #1077의 `assignBundleComponent(..., setOptions)` | 두 호출 의미 결합, 중복 2-인자 호출 제거 | 구성품 규격 출처와 선택 옵션 문맥을 모두 저장하며 expand의 `unitPrice` 전달은 그대로 유지 |

판단이 갈려 임의 선택하지 않은 지정 hunk는 없다. 별도 비충돌 의미 충돌인 `BundleOptionRow.tsx` 삭제는 아래 차단 목록으로 올린다.

## 실행 검증

### 백엔드 — 양쪽 PR 범위

실행:

```text
./gradlew :services:slip-service:test
  --tests EstimateRevisionSnapshotTest
  --tests EstimateRevisionServiceTest
  --tests EstimateRestoreTest
  --tests BundleOptionRoundTripTest
  --tests BundleProductGuardTest
  --tests EstimateServiceTest
```

결과: `BUILD SUCCESSFUL`.

초기 실행에서는 병합 생성자 하위호환 문제가 발견됐다. `EstimateSnapshot.Line`의 nullable 구 생성자 모호성과 `ProductSummary`의 #1078 호환 생성자 누락을 보완한 뒤 재실행해 통과했다.

### 프론트엔드 — 양쪽 PR 범위

- `EstimateFormPage.coedit.test.tsx` 및 `SlipFormPage.test.tsx`: 실행 전 `pretest` freshness guard에서 중단.
  `clients/web/design-system/dist/index.d.ts`가 최신 `ProductAutocomplete.tsx`보다 오래됐다. 지시대로 design-system을 재빌드하지 않았으며 코드 결함으로 해석하지 않는다.
- `bundle-set-options.spec.ts` headless Playwright: 첫 실행은 병합 직후 JSX의 잔여 `>` 문법 오류를 발견했다. 해당 잔여 문자를 제거한 뒤 재실행했으나 `BundleOptionRow.tsx` import 해석 실패로 1개 대상 시나리오가 실패했다. 전체 첫 실행은 7개 시나리오가 동일 import/transform 문제로 실패했다.

## 이 병합으로 새로 가능해진 조합

업무 경로상 조합은 있다. 견적 화면에서 BUNDLE 품목을 후보 자동완성/onBlur로 선택하면서 세트 옵션 행을 조작하고, 품목 규격은 catalog/user provenance로 계승할 수 있다. 저장·revision snapshot에는 구성품의 `bundleSetOptions`와 `specificationSource`가 함께 남는다.

다만 현재는 `BundleOptionRow.tsx` 비충돌 삭제 때문에 화면 실행이 차단되어, 이 조합이 실제 브라우저에서 통과한다고 주장할 수 없다. 세트 전개 금액은 두 변경의 동일 `unitPrice` 전달 경로를 유지했으며, 금액을 바꾸는 해소는 하지 않았다.

## 차단 및 신규 파일

- 차단: `clients/desktop/src/renderer/routes/components/BundleOptionRow.tsx`가 `origin/main`에서 삭제됐지만 #1078 화면이 계속 import한다. 복원 여부는 사용자/PM 판단이 필요한 지정 갈래 밖 변경이다.
- 차단: design-system `dist` freshness guard. PM이 의존 패키지 build 후 FE unit test를 재실행해야 한다.
- 신규 파일: `docs/dev-reports/2026-08-07-1075-main-merge-conflict-resolution.md`

커밋, `git add`, merge 완료 처리는 수행하지 않았다.
