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

## SP-D7 조회성 부가 endpoint 권한

상품 audit log와 realtime SSE는 SP-D7 전용 `products.list.view` VIEW, 상품 edit-request 목록은
`products.edit-requests` VIEW 동적 권한으로 전환했다. `products.list` 기존 VIEW endpoint widening을 피하기 위해
auth-service V38은 전용 page에만 내부 role VIEW grant를 insert하고, `PARTNER`는 제외한다.

## Google Sheets 동기화 (Phase 6)

- PR #68 / #75 — google sheets cron 동기화. `getDisplayValues` / `getFormulas` 로 표시값과 수식을 모두 채취하여 model 정보 정확화.
- 환경변수: `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON 파일 경로 또는 base64 `GOOGLE_SA_KEY_JSON_BASE64`), `SRC_SHEET_ID` (legacy 견적 spreadsheet ID).

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
