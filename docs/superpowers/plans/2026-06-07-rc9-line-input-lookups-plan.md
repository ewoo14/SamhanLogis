# RC9 잔여 — 견적/주문 라인 입력 lookup 3종 노출 + 데드코드 정리 (구현 계획)

> 2026-06-07 PM 자율 수립 (개발책임자 취침 위임 — "다음 슬라이스 결정 등을 진행"). PR #321 전기능 실QA 의 RC9(미구현 기능 404) 잔여 정찰 결과 기반.

## 0. 정찰 결과 (main `beca12d0` 기준 RC9 실잔여)

| RC9 항목 | 판정 |
|---|---|
| vendor-order-upload / sales-closing / sheet-sync | ✅ 기완료 (FE+BE+mock+사이드바) |
| spec-key-templates | ✅ BE 노출 기완료 (모달용 — 라우트 불요) |
| `/api/v1/estimates` 데드코드 | ✅ 정리 완료 |
| **material-prices / odu-recommendations / branch-pipes** | 🔴 **전체 미노출** — product-service entity/repository 기존재(V3, SP-08 GAS parity), 컨트롤러·FE·mock 부재 |
| **partners/long-pending** | 🔴 **데드코드** — order-approvals(LONG_PENDING status) 통합 완료, sales.ts 잔재만 |

## 1. 슬라이스 범위

1. **BE**: `ProductLookupController` 신규 — GET 3종, `@RequirePermission(page="products.list", action=VIEW)` (V10 seed 재사용 → **auth 신규 마이그레이션 0건**, Flyway 0건)
2. **게이트웨이**: `product-lookups-v1` no-strip 라우트 (풀패스 컨트롤러 — `product-specs-v1` 선례)
3. **FE**: sales.ts lookup 함수 3개 + `LineLookupReferenceModal`(탭 3, 읽기전용, InventoryLookupModal 선례) + EstimateFormPage/SalesPartnerOrderDetailPage 진입 버튼(canAccess('products.list','view') 가드) + long-pending 데드코드 제거
4. **mock**: 핸들러 3개 (배열 직접 반환 — BE 무 envelope 계약 동일). SP_D1_PAGES 무변경(신규 page-code 없음)
5. **Playwright**: `rc9-line-input-lookups` spec — 4종 원자 체크리스트 박제(BE 대조/FE 가드/mock/데드코드 회귀 가드/게이트웨이 no-strip)

## 2. API 설계

공통: `/api/v1` 풀패스, envelope 미적용 배열 직접 반환(모바일 legacy shim 계약 고정), DTO 에 UUID 미포함(비즈니스 식별자만).

| 경로 | 파라미터 | 응답 record | 정렬 |
|---|---|---|---|
| `GET /api/v1/material-prices` | 없음 | `{materialKey, name, price(number), optionLabel}` (computedFormula 비노출) | materialKey 숫자 suffix ASC (D10<D2 문자열 함정 — comparator) |
| `GET /api/v1/odu-recommendations` | `type?` (HOME_MULTI/MULTI_HEATING_COOLING) | `{recommendationType, indoorCapacity, indoorCount, outdoorHp}` | type ASC, capacity ASC |
| `GET /api/v1/branch-pipes` | `branchCode?` | `{branchCode, description, summaryQty}` | branchCode ASC |

## 3. 구현 단계 (Codex 디스패치)

T1 BE 컨트롤러+DTO+IT → (T2 게이트웨이 ∥ T3 sales.ts+데드코드) → T4 모달+버튼 → T5 mock → T6 Playwright 박제 → T7 dev-report/핸드오프.

## 4. 리스크/미결정 (dev-report 승계)

1. **3 테이블 0 row (시드 별도 트랙)** — API 는 빈 배열=정상. FE "데이터 없음(시드 전)" 안내. MaterialPrice 28·ODU 24 행은 G13 게이트 무관 → 차기 시드 슬라이스 후보.
2. **기존 ProductCatalogController GET 무권한 비대칭** — 신규 3종만 가드. 소급 부착은 별도 권한 이관 슬라이스.
3. **분지관 = 코드 참조 수준 한정** — 분기 계산 grid(legacy saveBranchCalc) 재현 비범위.
4. price 직렬화 = JSON number (catalog 컨벤션).
