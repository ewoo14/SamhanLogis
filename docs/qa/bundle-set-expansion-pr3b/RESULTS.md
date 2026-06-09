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
| 4 | 판넬 360 형상 선택(문자열 미지정/원형/사각) + 자재 포함 + 텍스트옵션 round-trip | ✅ |
| 5 | UUID 비공개 가드 — 옵션 행 UUID 미노출 | ✅ |
| 6 | **제출 페이로드 단언** — BUNDLE 라인 setOptions(remoteExcluded=true·panelShape360='사각'·materialIncluded=true·미입력 modelCode=null) + SINGLE 라인 setOptions=undefined 가 POST 본문에 정확 반영 | ✅ |
| 7 | **견적서 작성 경로**(별도 `/slips/lookup-product` onBlur lookup) — BUNDLE 모델 → 옵션 행 노출 | ✅ |

```
7 passed (13.5s)
```

> 시나리오 6 은 in-process mock 이 `page.route` 가로채기 불가([[inprocess-mock-principles]])하므로
> mock POST `/slips` 핸들러가 `globalThis.__SAMHAN_LAST_SLIP_CREATE` 로 노출한 실제 요청 본문을
> `page.evaluate` 로 읽어 단언 — `setOptions` 매핑(특히 `panelShape360` **String** 계약)을 직접 증명.

**회귀 PASS**: `ac-2-product-autocomplete` 7/7 + `d2-6d-inventory-lookup` 13/13 + `phase-2-6c-inventory-deduction` 8/8 = **28/28** (SortableLineRow wrapper-ref 재구성 후에도 dnd/재고모달/자동완성 무회귀).

## 3. 풀스택 Docker 실서버 QA (옵션 적용 전개)

> (작성 예정 — PR 오픈 후 후속 커밋. 실 시트 적재본 + product-service/slip-service 기동,
> 옵션 변화에 따른 구성품 라인 수/금액 변화 실증: ① 옵션 기본 전개, ② 실외기 제외 시 실외기 구성품 누락,
> ③ 판넬 선택 변경 시 판넬 구성품 교체.)

## 사이클 1 (Claude TM 5-agent) 반영 fix

| # | 지적 | 조치 |
|---|---|---|
| P1 | `panelShape360` 타입 계약 불일치(BE=String `원형/사각`, FE=boolean→silent no-op) | FE 를 `string \| null` + 형상 선택(미지정/원형/사각)으로 교정. 시나리오 6 가 `'사각'` 문자열 전송 실증 |
| P1 | 제출 페이로드 단언 부재 | 시나리오 6 추가(globalThis 노출 본문 단언) |
| P1 | off-brand Indigo(`--color-primary-*` 미정의) | `--color-brand-400/600` + `--action-brand` 토큰으로 교정 |
| P2 | 체크박스 accent 부재 | `accentColor: var(--action-brand)` (LineRow 와 일치) |
| P2 | 하드코딩 회색/다크모드 미대응 + `--ink-secondary` fallback 불일치 | `--color-bg-subtle`/`--surface-card`/`--color-neutral-200` 토큰화, fallback `#5C6773` 정정 |
| P2 | 드래그 시 picker 분리 | `SortableLineRow` 가 `setNodeRef` 를 wrapper 에 부착 + `footer` slot 으로 picker 동시 이동 |
| P2 | 견적 경로 미검증 | 시나리오 7 추가 |
| P2 | d2-6d/2-6c 회귀 미기록 | 28/28 실행·기록 |
| P3 | `emptySetOptions`/`toApiSetOptions` 중복 | `api/slip.ts` `emptyBundleSetOptions`/`toApiBundleSetOptions` 공용 추출(단일점) |

> **부수 발견(잠복 버그 fix)**: mock POST `/slips`(+형제 18곳) 가 `JSON.parse(config.data as string)` 로
> object 본문에서 throw → 신규 전표 저장이 mock 에서 항상 "알 수 없는 오류". `parseMockBody(config)` 로
> 일괄 교정([[inprocess-mock-principles]] 원칙①). 본 PR 의 실 저장 QA 가 최초 적발.

## 미해결 / 후속 (머지차단 아님)

- 기존 전표 라인추가(addLine) 경로는 전개 미적용(주 경로 create 처리). PR-3a 후속 항목과 동일.
- 옵션 modelCode 는 현재 자유 입력(미입력=BE 기본값). 추후 시트 옵션 목록 기반 dropdown 으로 개선 여지.
