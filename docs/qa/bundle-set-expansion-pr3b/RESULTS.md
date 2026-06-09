# PR-3b QA — 세트(BUNDLE) 전개 옵션 picker (FE)

> 에픽: 세트→전표 구성품 전개 (spec `docs/superpowers/specs/2026-06-09-bundle-set-expansion-spec.md`).
> 본 PR(3b)은 BE 완결(PR-1/1b/2/3a)에 이어 **FE 옵션 선택 UI** 를 추가한다.
> 라인 품목 lookup 결과 `productType === "BUNDLE"` 일 때만 세트 옵션 picker(실외기 제외/교체,
> 판넬 선택/360 형상, 자재 포함)를 노출하고, 요청 `setOptions` 로 BE BundleExpander 에 전달한다.

## 범위

| 영역 | 변경 |
|---|---|
| design-system | `ProductOption`(+productType/modelCode), `LineDraft`(+productType/modelCode/setOptions), `BundleSetOptions` 신규 export |
| desktop api | `productApi.searchProducts` 매핑(+productType/modelCode), `slip.ts` `ProductLookupResult`(+productType/modelCode)·`SlipLineInput.setOptions`·`BundleSetOptions`, `estimateApi.EstimateLineRequest.setOptions` |
| desktop UI | `BundleOptionRow` 공용 컴포넌트, `EstimateFormPage`·`SlipFormPage` BUNDLE 라인 옵션 picker + 제출 setOptions 배선 |
| mock | `SET-HM2WAY`(BUNDLE) fixture + lookup/search 핸들러 productType/modelCode echo |
| 회귀 | `playwright/bundle-set-options/` 5 시나리오 |

> `SalesAccountingSlipFormPage` 는 기존 출고전표 라인을 **배분(allocation)** 하는 회계 화면으로,
> 품목 직접 선택 경로가 아니므로 전개 대상 아님(원천 전표는 SlipFormPage 에서 이미 전개됨).

## 1. 타입 검증 (CI 동형)

- design-system `tsc -p tsconfig.build.json --noEmit` ✅ PASS
- design-system `tsc -p tsconfig.json --noEmit`(stories/tests 포함) ✅ PASS
- desktop `npm run typecheck`(tsconfig.node + tsconfig.web) ✅ PASS

> ⚠️ 함정: 루트 폴더 rename 으로 desktop `@samhan/design-system` file: junction 이 구경로(`/c/dev/SamhanLogis/...`)
> 로 깨져 있었음 → `npm install` 로 재링크 후 정상([[rename-filedep-junction]]).

## 2. FE Playwright 회귀 (mock-mode, `playwright/bundle-set-options/`)

> [[feedback_no_fake_data_ever]] 가드: 본 절은 **VITE_MOCK_MODE=1 컴포넌트 회귀 전용**.
> 실 전개 결과(6:4 재배분·옵션 필터)는 §3 Docker 실서버 QA 에서 검증.

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | SINGLE 품목(AJ040) 선택 → 옵션 행 미노출 | ✅ |
| 2 | BUNDLE 품목(SET-HM2WAY) 선택 → 옵션 행 + 5 컨트롤 노출 | ✅ |
| 3 | "실외기 제외" 체크 → 실외기 교체 입력 비활성(상호배타) | ✅ |
| 4 | 판넬 360 / 자재 포함 체크박스 토글 | ✅ |
| 5 | UUID 비공개 가드 — 옵션 행 UUID 미노출 | ✅ |

```
5 passed (13.5s)
```

회귀 영향 없음: `playwright/ac-2-product-autocomplete` 7/7 PASS (SortableLineRow div 래핑 후에도 dnd/autocomplete 정상).

## 3. 풀스택 Docker 실서버 QA (옵션 적용 전개)

> (작성 예정 — PR 오픈 후 후속 커밋. 실 시트 적재본 + product-service/slip-service 기동,
> 옵션 변화에 따른 구성품 라인 수/금액 변화 실증: ① 옵션 기본 전개, ② 실외기 제외 시 실외기 구성품 누락,
> ③ 판넬 선택 변경 시 판넬 구성품 교체.)

## 미해결 / 후속 (머지차단 아님)

- 기존 전표 라인추가(addLine) 경로는 전개 미적용(주 경로 create 처리). PR-3a 후속 항목과 동일.
- 옵션 modelCode 는 현재 자유 입력(미입력=BE 기본값). 추후 시트 옵션 목록 기반 dropdown 으로 개선 여지.
