# product-service

SamhanLogis Product 마스터 + Category 트리 + Google Sheets 동기화 서비스.

- 포트: **8084**
- DB: PostgreSQL `product_db` (service-per-DB), Flyway 자동 마이그레이션
- 인증: gateway 가 주입하는 `X-User-Id` / `X-User-Role` 헤더 신뢰 (HeaderAuthenticationFilter)
- 외부 서비스 호출 없음 (internal-token guard 미사용)

## 5대 핵심 결정

1. **Category 모델링**: 별도 엔티티 + 단일 부모 자기참조 트리. 깊이 무제한 (코드 강제 X)
2. **태그 저장**: PostgreSQL `jsonb` + Hibernate 6 native `@JdbcTypeCode(SqlTypes.JSON)` + GIN 인덱스
3. **가격 자료형**: `BigDecimal` + `NUMERIC(15,2)` + `currency CHAR(3) NOT NULL DEFAULT 'KRW'`
4. **단종 처리**: 별도 `ProductStatus` enum {`ACTIVE`, `DISCONTINUED`} (soft-delete 와 직교)
5. **unique 제약**: `(model_name)` 단독 unique partial: `is_deleted = false`. Google Sheets sync
   대응 `model_code` 컬럼은 V3 마이그에서 추가, partial unique (`is_deleted = false`).

## REST endpoints

| Method | Path | 권한 |
|---|---|---|
| GET | `/products` | 인증 |
| GET | `/products/{id}` | 인증 |
| GET | `/api/products/by-code/{modelCode}` | 인증 (Phase 7 3차 추가) |
| POST | `/products/lookup` | 인증 |
| POST | `/products` | MASTER / MANAGER / DEVELOPER |
| PATCH | `/products/{id}` | MASTER / MANAGER / DEVELOPER |
| PATCH | `/products/{id}/price` | MASTER / MANAGER / DEVELOPER / ACCOUNTANT |
| PUT | `/products/{id}/tags` | MASTER / MANAGER / DEVELOPER |
| POST | `/products/{id}/discontinue` | MASTER / MANAGER / DEVELOPER |
| POST | `/products/{id}/reactivate` | MASTER / MANAGER / DEVELOPER |
| DELETE | `/products/{id}` | MASTER / MANAGER / DEVELOPER (soft-delete) |
| GET | `/products/categories` | 인증 |
| POST | `/products/categories` | MASTER / MANAGER / DEVELOPER |
| PATCH | `/products/categories/{id}` | MASTER / MANAGER / DEVELOPER |
| DELETE | `/products/categories/{id}` | MASTER / MANAGER / DEVELOPER (자식 존재 시 409) |

## 수량 동기화 규칙 저장 경계 (#896 S2)

`quantity_sync_rule`/`quantity_sync_source`/`quantity_sync_target`는 독립 Product 간
수량 동기화 규칙을 저장하는 스키마다. 이 슬라이스는 evaluator를 호출하지 않는다.

| Method | Path | 권한 |
|---|---|---|
| GET | `/api/v1/quantity-sync-rules` | 인증 |
| GET | `/api/v1/quantity-sync-rules/{ruleKey}` | 인증 |
| POST | `/api/v1/quantity-sync-rules` | MASTER / MANAGER / DEVELOPER |
| PUT | `/api/v1/quantity-sync-rules/{ruleKey}` | MASTER / MANAGER / DEVELOPER |
| DELETE | `/api/v1/quantity-sync-rules/{ruleKey}` | MASTER / MANAGER / DEVELOPER |

저장 시 source/target은 `modelCode`와 품목명으로 해소·응답하며 내부 UUID를 API에 노출하지
않는다. V24는 실 catalog snapshot을 확보한 뒤에만 명시 seed를 추가할 수 있도록 현재
seed INSERT를 포함하지 않는다.

`enabled=false` 규칙은 강제력이 없다(survey.md:509) — 순환·REPLACE 중복 판정에서 제외되고,
그 규칙이 참조하는 Product의 단종/삭제/노출구분(`usageScope`) 변경도 막지 않는다.
`POST /products/{id}/discontinue` · `DELETE /products/{id}` · `PATCH /products/{id}`
(`usageScope`를 `NONE`으로 바꾸는 경우) · `PATCH /api/v1/products/{modelCode}/usage`(수동
override로 `NONE` 지정)는 **활성(enabled)** 규칙이 참조 중이면 그 상태 변경만 409
`CONFLICT`로 거부하며, 메시지에 참조 중인 ruleKey를 담아 원인을 드러낸다(예: `수량 동기화
규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다: HOME_1WAY_HOSE_L`) — 네 경로
모두 같은 원인이면 완전히 같은 메시지를 낸다. 규칙을 비활성화하거나 삭제하면 해제된다.

`enabled=false` 규칙이 참조하던 Product가 (위 게이트를 우회할 수단 없이) 단종/삭제/노출
해제되어도 규칙 API 자체는 절대 깨지지 않는다 — `GET /api/v1/quantity-sync-rules`(목록)·
`GET /api/v1/quantity-sync-rules/{ruleKey}`(단건)는 해당 슬롯을 `productCode: null`,
`productName: "(삭제된 품목)"`으로 표시할 뿐 다른 규칙의 조회·생성·수정을 막지 않는다.
사용자는 목록에서 깨진 규칙을 식별해 `DELETE`(복구) 또는 `PUT`(다른 Product로 교체)으로
직접 정리할 수 있다.

## 품목 노출 수동 토글 + usageScope 질의 (요구사항1 PR-B, PR #460)

품목별 견적/주문 노출을 시트 탭 자동 분류 + **수동 토글**로 운영한다 (개발책임자 2026-06-10 결정 — 시트에 없는 품목도 수동 노출 가능).

| 항목 | 내용 |
|---|---|
| V14 | `products.usage_scope_manual BOOLEAN NOT NULL DEFAULT FALSE` — 수동 override 플래그 |
| 수동 토글 | `PATCH /api/v1/products/{modelCode}/usage` body `{usageScope, estimateCategory?}` → manual=true (NONE/PARTNER_ORDER 시 estimateCategory 강제 null). `DELETE /api/v1/products/{modelCode}/usage` → 플래그 해제(값 유지) + **rowHash 캐시 evict** — 다음 sync 가 시트 기준 재분류. 권한 `products.admin` UPDATE |
| sync 보존 | `usageScopeManual=true` 품목은 sync 가 usageScope/estimateCategory 무변경 + **시트 부재 시 soft-delete 제외** (`preservedManual` 카운터) |
| catalog 질의 | `GET /api/v1/products` (ProductCatalogController — 게이트웨이 정확경로): `q`(model_code/name/model_name LIKE, 와일드카드 이스케이프) + `usageScope` **IN-확장**(ESTIMATE→+BOTH, PARTNER_ORDER→+BOTH) + `category`(EstimateCategory) + `ORDER BY display_order NULLS LAST, model_code` 결정 페이징 |
| `/products` 자동완성 질의 | `/products`(ProductController, `/api/products/**` strip 경로) 도 `usageScope` **IN-확장**(ESTIMATE→+BOTH, PARTNER_ORDER→+BOTH)을 적용한다. desktop 전표 라인 자동완성(`SlipFormPage`)이 `usageScope=PARTNER_ORDER` 로 호출한다. |

데스크톱 소비처: `/products/catalog` 품목 관리 화면 (견적/주문 노출 토글). order-app 은 `usageScope=PARTNER_ORDER` 로 본 catalog 질의를 사용. (출처 컬럼·시트자동/수동 뱃지는 PR #461 시드 전용 정책으로 제거.)

## 품목관리 고도화 — 세트 컬럼 + 구성품 편집 + 표시 순서 + 실시간 SSE (PR #461, 2026-06-11)

| 항목 | 내용 |
|---|---|
| 세트 정보 | catalog 응답(`ProductCatalogResponse`)에 `productType`(SINGLE/BUNDLE) + `componentCount`(BUNDLE 활성 구성품 수, SINGLE=0) 추가. 페이지 내 BUNDLE UUID 집합 → `BundleComponentRepository.countMapByBundleProductIds(IN)` 1쿼리 벌크 채움(N+1 방지). |
| 구성품 조회 | `GET /api/v1/products/{modelCode}/components` (products.list VIEW) — 구성품 목록(코드/명칭/수량/순서/옵션 메타). 명칭은 1차 model_code IN → 2차 model_name IN fallback(레거시 model_code null 행 표시 해소, D-PCE-03). |
| 구성품 편집 | `PUT /api/v1/products/{modelCode}/components` (products.admin UPDATE) — **replace-all**(배열 인덱스=1-based display_order). 검증: BUNDLE 아님 409 / 부모 model_code null(죽은 세트) 409 / 빈 배열·자기참조·미해소·세트-안-세트·중복 코드 400. 해소 축 = `model_code`-only(전개 expander 정합 — model_name fallback 저장 시 전표 전개 단가 0·productId null silent 방출 차단, D-PCE-03). soft-delete actor=`X-User-Id`. 동일 BUNDLE 동시 PUT 은 부모 행 `PESSIMISTIC_WRITE`(`findByIdForUpdate`)로 직렬화. |
| 표시 순서 | `PUT /api/v1/products/display-orders` (products.admin UPDATE) — body `[{modelCode, displayOrder}]` 일괄. 전건 검증(미존재 1건 → 404 전체 롤백) + 중복 modelCode 400. **검증 축 = `estimateCategory` 동일 군**(null끼리 허용, null+non-null/서로다른 non-null 400) — 자동 재번호 카테고리 한정(D-PCE-02). `Product.changeDisplayOrder` 도메인 메서드. |
| 실시간 SSE | `GET /api/v1/products/catalog-realtime` (products.list VIEW) — 목록 레벨 SSE(채널 = well-known UUID, event `product:catalog:changed`, 30s heartbeat). `ProductCatalogChangePublisher` 가 usage PATCH/DELETE·components PUT·display-orders PUT publish 를 **afterCommit 으로 통일**(롤백 헛이벤트 제거). 기성 `ProductRealtimeBroker`(SP-D7) 재사용(D-PCE-05). |
| internal #23 | `POST /products/internal/lookup-by-model-codes` (X-Internal-Token) — modelCode 일괄 조회. partner-order 주문 상세 productType enrich 전용(direct PUT 라인 synthetic productId 대비 modelCode snapshot 기준). |
| V15 | `bundle_component.display_order INTEGER`(NULL 허용, ORDER BY NULLS LAST) + 기존 활성 행 ROW_NUMBER backfill + 부분 인덱스 `ix_bundle_component_order` + 잉여 `ix_bc_bundle` DROP. |
| 게이트웨이 | api-gateway `product-components-v1`/`product-display-orders-v1`/`product-catalog-realtime-v1` no-strip 라우트 3종(`product-service-v1` strip=2 앞 선언). |

## SP-D7 조회성 부가 endpoint 권한

상품 audit log와 realtime SSE는 SP-D7 전용 `products.list.view` VIEW, 상품 edit-request 목록은
`products.edit-requests` VIEW 동적 권한으로 전환했다. `products.list` 기존 VIEW endpoint widening을 피하기 위해
auth-service V38은 전용 page에만 내부 role VIEW grant를 insert하고, `PARTNER`는 제외한다.

## Google Sheets 동기화 (Phase 6, PR #461 시드 전용 격하)

- PR #68 / #75 — google sheets cron 동기화. `getDisplayValues` / `getFormulas` 로 표시값과 수식을 모두 채취하여 model 정보 정확화.
- 환경변수: `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON 파일 경로 또는 base64 `GOOGLE_SA_KEY_JSON_BASE64`), `SRC_SHEET_ID` (legacy 견적 spreadsheet ID).
- ⚠️ **시드 전용 격하 (PR #461, D-PCE-04)**: 구글 시트는 **최초 시드 데이터**로, 자동 cron + 부팅 sync 는 `samhan.product.sheet-sync.cron-enabled`(기본 **false**) 게이트로 비활성한다(재시작·주기 sync 가 사용자 표시순서를 시트 기준 재적재하여 소실하는 것 방지). 시드 재적재는 비상 수단인 수동 trigger(`POST /api/v1/products/admin/sync`)만 사용하며 게이트와 무관하게 항시 유효. manual 보존 가드·rowHash evict 는 #460 자산 유지.

## by-code endpoint (Phase 7 3차)

`GET /api/products/by-code/{modelCode}` — 사용자 노출 식별자 modelCode 로 productId (UUID) 조회.
- DTO: `web/dto/ProductByCodeResponse.java` (record — `id` + `modelCode` + `name`)
- repository 재사용: `ProductRepository.findByModelCodeAndIsDeletedFalse(String)`
- IT 3 case (happy / not-found / soft-deleted)
- Client `qa/playwright/utils/api-clients.ts` `lookupProductIdByCode(code)` 가 본 endpoint 호출.

## Phase 8 호환성 가드 (PR #88 / #89 / #90)

- **chained-default 환경변수** — `SAMHAN_<KEY>:${LEGACY_KEY:default}` 패턴 적용 (legacy 호환 100%, 무중단 cutover 가능)
- **12-factor 12/12 OK** + RDS 호환 (jsonb GIN index 등 standard PostgreSQL feature 만 사용 — RDS 미지원 extension 부재)
- **AWS 서비스 매핑** — `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` 본 service 항목 참조
- **env-template** — `infrastructure/env-templates/product-service.env` 보유 (`GOOGLE_SERVICE_ACCOUNT_KEY` 포함, `CHANGE_ME_LOCAL_ONLY` placeholder)
- **ServiceDiscoveryClient (Phase 11 활성 대비)** — `shared:discovery-abstraction` 의존성 도입은 Phase 11 cutover 시점

## Phase 9 신규 service 매트릭스 (참조)

| Service                | Port | DB                | 도메인                              |
| ---------------------- | ---- | ----------------- | ----------------------------------- |
| partner-service        | 8095 | partner_db        | 거래처 마스터 + 신용한도 + 거래내역 |
| groupware-service      | 8092 | groupware_db      | 결재선 + 메신저 + 일정              |
| notification-service   | 8093 | notification_db   | 푸시/이메일/SMS 통합 라우터         |
| dashboard-service      | 8094 | dashboard_db      | KPI + 실시간 재고 + 매출            |

dashboard-service 는 본 product-service 의 카탈로그 / 재고 데이터를 inventory-service 와 함께 집계 source 로 사용 예정. 상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조.
