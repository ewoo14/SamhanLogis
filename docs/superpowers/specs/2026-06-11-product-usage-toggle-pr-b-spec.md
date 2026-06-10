# 요구사항1 PR-B — 품목 노출 수동 토글 + usageScope 필터 실효화 + 품목관리 화면 신설

> 2026-06-11 (야간 자율, 개발책임자 위임). #457(PR-A: usageScope/displayOrder 도입) 의 명시 이월 스코프.
> 근거: [.claude/memory/project_item_exposure_and_menu_5cat.md] §1 — "시트 탭 자동 + 품목별 수동 토글, 시트에 없는 품목도 수동 노출 가능".
> 관련: docs/qa/product-exposure-display-order/RESULTS.md 비스코프(PR-B) 목록.

## 0. 정찰 결론 (2026-06-11 심야)

| 자산 | 현황 | 갭 |
|---|---|---|
| `Product.usageScope/estimateCategory/displayOrder` + `changeUsage()` 도메인 메서드 | ✅ #457 기성 (V13) | override 보존 플래그 없음 |
| `EstimateCatalogInternalController` | ✅ usageScope IN (ESTIMATE, BOTH) 필터 **이미 적용** (#455/#457) | 변경 불요 |
| `ProductSheetSyncService` | 시트 탭 기반 usageScope 자동 분류 | **sync 마다 무조건 덮어씀** — 수동 토글 유실 |
| `PATCH /api/v1/products/{modelCode}/usage` | ❌ BE 부재 | desktop mock(1102행) 만 선행 — false-green 주의 |
| `GET /api/v1/products` 라우팅 | **게이트웨이 정확경로 `product-catalog-v1` → `ProductCatalogController.listProducts`** (no-strip). `ProductController.search` 는 `/api/products/**` (StripPrefix=1) 전용 | ⚠️ 사이클1 정정: 최초 정찰이 `/api/v1/products` 담당을 ProductController 로 오인 — order-app/sales.ts 의 usageScope·EstimateCategory 는 catalog 컨트롤러에서 **기실효** 였음. 실제 갭 = catalog 경로의 `q` 부재 + usageScope exact-match(BOTH 미포함) 시멘틱 |
| order-app `getProducts(category)` | `GET /api/v1/products?usageScope=PARTNER_ORDER&category=...` → catalog 컨트롤러 도달 | exact-match 라 **BOTH 품목 제외** → PARTNER_ORDER 분기 실질 공집합 위험 (시트 4대 탭 = BOTH 시드) |
| desktop `api/sales.ts` 품목 fetch | `usageScope=BOTH&category=...` → catalog 컨트롤러 도달 | BOTH exact 는 동작 — 단 시멘틱 통일 필요 |
| desktop `productApi.searchProducts` (SlipFormPage 전표 품목 검색) | usageScope 없음 | **의도적 전 품목 유지** (전표는 노출 제한 대상 아님 — 메모리 "일반 품목관리 리스트는 전체 노출" 준용) |
| 데스크톱 품목관리 화면 | ❌ 부재 (products.list 는 권한코드/피커만 존재) | **신규 페이지** 필요 |

## 1. BE (product-service)

### 1a. V14 마이그레이션 — 수동 override 플래그
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS usage_scope_manual BOOLEAN NOT NULL DEFAULT FALSE;
```
- 모델 결정(옵션 B): 단일 `usage_scope` 컬럼 유지 + `usage_scope_manual` 플래그. 조회 필터는 기존 `usage_scope` 그대로 사용 (COALESCE 이중 컬럼 모델 기각 — 쿼리 단순성).

### 1b. 도메인/서비스
- `Product.markUsageManual(UsageScope, EstimateCategory)` — usageScope/estimateCategory 변경 + `usageScopeManual=true`. `clearUsageManual()` — 플래그 해제 (값은 유지, 다음 sync 가 시트 기준 재분류).
- `ProductSheetSyncService` upsert: **`usageScopeManual=true` 인 품목은 usageScope/estimateCategory 무변경** (displayOrder 는 시트 순서이므로 계속 갱신). 신규 insert 는 기존 로직.
- `ProductService.updateUsage(modelCode, req)` / `clearUsageOverride(modelCode)`.

### 1c. API
- `PATCH /api/v1/products/{modelCode}/usage` — body `{ usageScope: UsageScope, estimateCategory?: EstimateCategory|null }` → manual=true. `products.admin` UPDATE (@RequirePermission + 동적 권한 헬퍼 — 기존 ProductController mutation 패턴 동일).
- `DELETE /api/v1/products/{modelCode}/usage` — override 해제 (manual=false). 동일 권한.
- `GET /api/v1/products` 에 `usageScope`(UsageScope) + `category`(ProductCategory) optional 파라미터 추가 → repository 필터 (status/q 등 기존 필터와 AND). **order-app M1a 호출 + desktop sales.ts 호출이 즉시 실효** — 주문서 PARTNER_ORDER 분기 완성.
- 응답 DTO 에 `usageScope`/`estimateCategory`/`usageScopeManual`/`displayOrder` 노출 (품목관리 화면 소비).

### 1d. 테스트
- 단위: markUsageManual/clearUsageManual, sync 보존 (manual=true 품목 scope 불변 + displayOrder 는 갱신).
- IT: PATCH/DELETE usage 권한 deny→403/allow→200 (PR #316 lockout 패턴), GET usageScope+category 필터 왕복, FE 계약 키 검증.

## 2. FE (clients/desktop)

### 2a. 품목관리 페이지 신설 — `/products/catalog` (가칭, 라우트 확정은 구현 시)
- 목록: 전 품목 (제한 없음 — products.list VIEW), 컬럼 = 모델명/카테고리/견적노출/주문노출/노출구분 출처(시트자동·수동 뱃지)/displayOrder.
- **수동 토글**: '견적 노출'/'주문 노출' 체크 2개 → usageScope 매핑 (둘다=BOTH/견적만=ESTIMATE/주문만=PARTNER_ORDER/없음=NONE). 토글 시 PATCH `/usage` (manual). '시트 자동 복귀' 버튼 → DELETE `/usage`.
- 게이트: 토글/복귀 버튼 = canAccess('products.admin','update'), 페이지 = products.list VIEW.
- 좌측 메뉴 등록 (현 구조 내 — 5대분류 재편은 별도 슬라이스).
- estimateCategory 는 ESTIMATE/BOTH 선택 시에만 선택 셀렉트 노출.

### 2b. mock 동형
- 기존 PATCH /usage 핸들러(1102행) 계약 검증·갱신 (usageScopeManual 반영), DELETE /usage 신설, GET /products 의 usageScope/category 필터 동형, 목록 행에 usageScopeManual/displayOrder.
- mock 3원칙 준수. **mock 만 선행이던 endpoint 가 BE 실존하게 되므로 형상 1:1 대조 필수.**

### 2c. Playwright mock TC
- 토글 왕복(견적off→PATCH→뱃지 '수동'), 시트 복귀(DELETE→뱃지 '시트 자동'), 권한 view-only 토글 비활성.

### 3. order-app / estimate 소비처
- order-app FE 변경 없음 (이미 송신 — BE 필터 실효화로 완성). 단 **실 QA 로 PARTNER_ORDER 분기 실증 의무**.
- 견적 카탈로그(EstimateCatalogInternalController)는 기변경 없음 — 수동 토글 결과가 견적 카탈로그에 반영되는지 실 QA 대조.

## 4. QA (Docker 실서버 — 의무)
- T1 품목관리 목록 + 토글 UI 실 캡처 / T2 PATCH 후 DB 실증(usage_scope/usage_scope_manual) / T3 **시트 sync 재실행 후 수동 override 보존** 실증 / T4 GET /products?usageScope=PARTNER_ORDER 필터 실효 (주문서 분기) / T5 견적 카탈로그 수동 노출 반영 / T6 권한 deny / T7 DELETE 복귀 후 sync 재분류.
- 실QA 실행은 디렉터리 한정 (#459 회고 — testMatch 광역 함정).

## 4-1. 사이클1 확정 시멘틱 (2026-06-11 심야 — PM 자율 결정, 개발책임자 박제 결정 범위 내)

- **usageScope 질의 시멘틱 = 노출 대상 확장**: 요청 ESTIMATE → IN (ESTIMATE, BOTH) / PARTNER_ORDER → IN (PARTNER_ORDER, BOTH) / BOTH·NONE → exact. (`findExposedCatalog` 기존 패턴과 통일 — BOTH 품목이 양쪽 질의에 모두 노출.)
- **catalog 경로(`/api/v1/products`)에 `q` 추가** — 신규 품목관리 화면 검색 실효화. ProductController 신규 파라미터는 `/api/products` 경로 지원으로 유지 (라우팅 정정 문서화).
- **sync soft-delete 가드**: `usageScopeManual=true` 품목은 시트 부재 시에도 soft-delete 제외 — 개발책임자 박제 결정("시트에 없는 품목도 수동 노출 가능")에 부합.
- **rowHash 캐시 evict**: 시트 복귀(DELETE /usage) 시 해당 modelCode 의 sync hash 캐시 무효화 — 다음 sync 재분류 보장.
- 수동 PARTNER_ORDER 품목의 order-app 카테고리 탭 노출(estimateCategory 부여 허용 여부)은 **개발책임자 확인 항목** — 현 구현은 category 미지정 질의에서만 노출.

## 5. 비스코프 (별도 슬라이스)
- 좌측 메뉴 5대분류 + 권한 필터 + '홈' (대기 큐 3번 — Codex 회복 후).
- 시트 sync 자체 변경 (탭 매핑 로직) — 보존 가드만 추가.
