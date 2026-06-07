# ProductCatalog 권한 소급 + 풀패스 라우팅 교정 — 실행 계획

> 2026-06-07 PM 계획. PR #418 잔여 ②(ProductCatalogController 기존 GET 무권한 비대칭) 재개 슬라이스.
> 권한코드 = PM 전권 자율 범위([[feedback_pm_permission_autonomy]]) — 워크플로우(조기PR·Codex 구현·dual review·Docker 실QA·CI green·백로그 금지) 엄격 적용.

---

## 1. 배경 / 정찰 결과 (2026-06-07 Explore 2기 + PM 직접 실측)

핸드오프 기재는 "기존 GET 3건 무권한"이었으나, 전수 정찰([[feedback_defect_family_sweep_fix]] 계열 sweep) 결과 **범위 확대**:

### 1.1 무권한 endpoint 10건 (product-service)

`ProductCatalogController`(`@RequestMapping("/api/v1")`, 풀패스) **9개 endpoint 전부 무가드** + `CategoryController.tree()` 1건.
인접 컨트롤러(ProductController/ProductByCodeController/ProductLookupController/CategoryController mutation)는 전부 `@RequirePermission` 보유 — 명백한 비대칭.

| # | Endpoint | 핸들러 | 성격 | 위험도 |
|---|---|---|---|---|
| 1 | `GET /api/v1/products` | listProducts (카탈로그 검색) | 조회 | P2 |
| 2 | `PATCH /api/v1/products/{code}/usage` | changeUsage — Javadoc "admin only"인데 검증 0 | **mutation** | **P1** |
| 3 | `GET /api/v1/products/{code}/specs` | listSpecs | 조회 | P2 |
| 4 | `POST /api/v1/products/{code}/specs` | addSpec | **mutation** | **P1** |
| 5 | `PATCH /api/v1/products/{code}/specs/{id}` | editSpec | **mutation** | **P1** |
| 6 | `DELETE /api/v1/products/{code}/specs/{id}` | deleteSpec — actor `"system"` 하드코딩 부수결함 | **mutation** | **P1** |
| 7 | `PATCH /api/v1/products/{code}/specs/reorder` | reorderSpecs | **mutation** | **P1** |
| 8 | `GET /api/v1/spec-key-templates` | listTemplates | 조회 | P2 |
| 9 | `POST /api/v1/spec-key-templates/{id}/apply-to-existing` | applyTemplateToExisting (G19) | **mutation** | **P1** |
| 10 | `GET /products/categories` | CategoryController.tree | 조회 | P2 |

### 1.2 게이트웨이 라우팅 결함 (동반 발견 — #418 RC9 풀패스 no-strip 계열)

`api-gateway application.yml` 실측:
- `product-specs-v1`(no-strip)은 `/api/v1/products/*/specs**` + `/api/v1/spec-key-templates**`만 커버.
- **`GET /api/v1/products`(정확 경로)와 `PATCH /api/v1/products/{code}/usage`는 `product-service-v1`(StripPrefix=2)로 빠짐** → `/products`, `/products/{code}/usage`로 변환:
  - `GET /api/v1/products` → **ProductController.search 오매칭** (파라미터 usageScope/category 무시 + ApiResponse envelope ≠ Spring Page 계약 — FE `sales.ts listProducts`/estimate-app/order-app 소비 계약 파괴)
  - `PATCH .../usage` → ProductController에 해당 매핑 없음 → **404** (게이트웨이 경유 도달 불가)
- 선례: `product-admin-v1`(RC2)·`product-lookups-v1`(RC9) — 풀패스 컨트롤러는 표적 no-strip 라우트를 strip 라우트보다 먼저 선언.

### 1.3 seed 현황

- `products.list`/`products.admin` page-code 는 기존 운영 중 (ProductController 가 이미 enforcement, V10/V30/V31/V32/V38 + V43 빌트인 그룹 계열). **신규 Flyway 불필요 예상** — 구현 단계에서 group_page_permissions 의 products.admin grant 범위(MASTER/MANAGER/DEVELOPER) 검증 후 확정.
- PR #418 선례: 견적/주문 라인입력 lookup 3종에 `products.list` VIEW 재사용 → 같은 화면 소비처인 카탈로그 GET 도 동일 코드 재사용이 정합.

### 1.4 FE 소비처 (403 영향 범위)

- `clients/desktop/src/renderer/api/sales.ts` — listProducts(L142)/getProductSpecs(L165)/listSpecKeyTemplates(L175): 견적/주문 라인입력 화면 → products.list VIEW 보유 그룹이 사용(#418 동일) → **FE 화면 변경 불필요**.
- spec mutation UI(SpecAddModal 등) 진입 버튼 — `canAccess('products.admin', …)` 가드 동반 의무([[feedback_fe_canaccess_pagecode_be_match]]).
- estimate-app `getInventoryTable`/order-app `getProducts` — `/api/v1/products?usageScope=…` 소비 → 라우팅 교정의 **수혜자** (현재 오매칭).

## 2. 작업 범위

### 2.1 BE (product-service) — Flyway 0 예상
1. 위 10 endpoint 에 `@RequirePermission` 부여:
   - 조회(1·3·8·10) = `products.list` VIEW
   - admin mutation(2·5·7) = `products.admin` UPDATE / (4·9) = `products.admin` CREATE / (6) = `products.admin` DELETE
2. `deleteSpec` actor: `X-User-Id` 헤더 추출 → service 전달 (CategoryController.delete 선례), 미존재 시 기존 "system" 폴백.
3. 기존 IT/단위 테스트 영향 검토 — `@RequirePermission` AOP 테스트 컨텍스트(@MockBean DynamicPermissionClient 격리, [[feedback_it_mockbean_external_clients]]).

### 2.2 게이트웨이 (api-gateway)
4. 표적 no-strip 라우트 2건 — `product-service-v1`(strip) 보다 먼저 선언 (RC2/RC9 선례 + 주석):
   - `product-catalog-v1`: `Path=/api/v1/products` (정확 경로만 — `/**` 금지, strip 라우트 잠식 방지)
   - `product-usage-v1`: `Path=/api/v1/products/*/usage`
5. 기존 `/api/products/**`(StripPrefix=1, ProductController.search 소비처) 무영향 검증.

### 2.3 FE (desktop) — 4종 원자 체크리스트([[feedback_defect_family_sweep_fix]])
6. **BE대조**: page-code/action = §2.1 표와 1:1 (테마틱 금지).
7. **FE전환**: spec mutation UI 버튼 canAccess 가드 (이미 있으면 page-code 정합 검증).
8. **mock 동기화**: mock.ts 권한 카탈로그에 products.list/products.admin grant 정합 + 본 endpoint mock 핸들러의 권한 거부 시맨틱(403) 동기화.
9. **spec 박제**: Playwright 계약 단언 — 권한 보유 200 / 미보유 403 (catalog·spec mutation 각 1+). 기존 catalog spec(homemulti-grid 등) 회귀 무결.

### 2.4 문서 (PR 내 포함, [[feedback_continuous_docs_sync]])
10. dev-report `docs/dev-reports/product-catalog-permission-retrofit.md` + README/ROADMAP/DECISIONS 해당부 + samhan-public-overview.html + CURRENT-WORK.md.

## 3. 비범위 (명시)
- lookup 3종 시드 슬라이스(material_price 28행·ODU 24행) — workbook.json 원천 시드 방식 = 개발책임자 결정 대기.
- `PartnerPublicController`/`PublicSlip*` — 의도된 무가드(토큰/DTO 가드) 판정, 변경 비대상.
- listTemplates 의도적 공개 전환 여부 — 비대칭 해소(가드 부여)가 기본값. 공개 유지 근거 없음.

## 4. 리스크 / 완화
| 리스크 | 완화 |
|---|---|
| 라우팅 교정으로 `/api/v1/products` 소비처 계약 변화 (search 오매칭 → catalog 정상화) | Docker 실QA 에서 견적/주문 카탈로그 모달 + estimate-app 흐름 실측. 오매칭 현상태가 결함이므로 정상화가 옳음 — QA 로 입증 |
| products.admin grant 부족으로 운영 기능 lockout | 구현 전 seed grant 실측(MASTER bypass + MANAGER/DEVELOPER) → 부족 시 V48 seed 추가로 전환 |
| spec CRUD 화면 사용 그룹이 products.admin 미보유 | FE 소비처별 화면-그룹 매트릭스 QA 검증, 불일치 시 개발책임자 보고(widening 정책 확인) |
| AOP 추가로 기존 테스트 컨텍스트 깨짐 | PermissionAspect 테스트 프로파일/MockBean 선례(@RequirePermission 기존 컨트롤러 IT) 그대로 적용 |

## 5. 워크플로우 (의무 체크)
조기 PR(plan 단계) → **Codex 구현**([[feedback_codex_implements_claude_reviews]], approval-policy never + Claude commit 대행) → Claude 5-agent 리뷰 게시+fix → Codex 5-section 리뷰 게시+fix (1f 발동 시 N=2 의무, 최대 N=3) → QA Docker 실서버([[feedback_no_fake_data_ever]]) → CI 전 green 후 PM 종합 리뷰 게시 → 자동 머지([[feedback_pm_permission_autonomy]]).
