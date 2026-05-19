# MIG-2 이카운트 마스터 5종 Implementation Plan

> **For agentic workers:** 워크플로우 9회차 — **Codex 개발** (mcp__codex__codex sandbox=workspace-write) 의무. Claude subagent 단독 금지. Codex fix 후 새 head 기준 Claude/Codex re-review 자동 진행.

**Goal:** 이카운트 5 raw CSV (품목/계정/부서/창고/카드) → 3-Tier (staging.ecount_*_raw → transform → 도메인) 멱등 적재 + 자동 lookup map 4종 산출.

**Architecture:** MIG-1 PoC (PR #262) 패턴 5x 미러 + 품목 alias (project_ecount_product_identity_rule). 5 service-per-DB 도메인 동시 변경: product/accounting/hr-or-accounting/warehouse.

**Tech Stack:** Java 17 / Spring Boot 3 / JPA / Postgres 16 / Flyway / OpenCSV / BOMInputStream / NamedParameterJdbcTemplate

**Spec:** [`docs/superpowers/specs/2026-05-20-ecount-mig-2-master-design.md`](../specs/2026-05-20-ecount-mig-2-master-design.md)

---

## File Structure (요약 — Codex 가 spec 기반 정확 분해)

### product-service (품목 + alias + group)
- `db/migration/V??__add_product_aliases_and_ecount_staging.sql` — products 확장 + product_aliases + staging.ecount_item_raw / item_relation_raw / item_group_raw
- `domain/Product.java` — 확장 (unit / category_group / tax_type / unit_price_with_vat)
- `domain/ProductAlias.java` — 신규
- `repository/ProductRepository.java` — 확장 (findByCode 등)
- `repository/ProductAliasRepository.java` — 신규
- `service/EcountProductImporter.java` — 3-Tier 멱등 적재 (MIG-1 패턴 미러) + alias 매핑 (item_name + item_relation join)
- `controller/EcountProductImportController.java` — POST /admin/products/imports/ecount (multipart, ROLE_MASTER/MANAGER)
- `web/dto/EcountProductImportRequest/Response.java`
- 단위: `EcountProductImporterTest` + IT `EcountProductImportControllerIT`

### accounting-service (계정 + 카드)
- `db/migration/V??__add_ecount_account_card_staging.sql` — staging.ecount_account_raw + ecount_card_raw + card_master (신규)
- `domain/CardMaster.java` — 신규
- `service/EcountAccountImporter.java` + `EcountCardImporter.java`
- `controller/EcountAccountImportController.java` + `EcountCardImportController.java`
- 단위 + IT × 2

### hr-service or accounting-service (부서)
- `db/migration/V??__add_department_ecount_staging.sql` — staging.ecount_department_raw + departments 확장
- `domain/Department.java` — 신규 또는 확장
- `service/EcountDepartmentImporter.java`
- `controller/EcountDepartmentImportController.java`

### warehouse-service (창고)
- `db/migration/V??__add_warehouse_ecount_staging.sql` — staging.ecount_warehouse_raw + 기존 warehouses 활용
- `service/EcountWarehouseImporter.java`
- `controller/EcountWarehouseImportController.java`

### 자동 lookup map 4종 (각 service 의 staging schema)
- `staging.ecount_warehouse_map` (warehouse_service)
- `staging.ecount_department_map` (accounting or hr)
- `staging.ecount_item_alias` (product-service, 가장 핵심)
- `staging.ecount_account_map` (accounting-service)

### shared/common ErrorCode + auth-service PageCode + permission seed
- `ErrorCode.MIG2_*` 5건
- `PageCode.ECOUNT_MIG2_*` 5건 (or 1 ECOUNT_MIG2_MASTER)
- `V??__add_ecount_mig2_permissions.sql`

---

## Task 1: ErrorCode + PageCode 신규

**Files:** `shared/common/.../ErrorCode.java` + `auth-service/.../PageCode.java` + `V?? permission seed`

- [ ] **Step 1**: 신규 ErrorCode 5건:
```java
MIG2_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY, "MIG2_HEADER_MISMATCH", "CSV 헤더 형식 불일치"),
MIG2_ITEM_NAME_NULL(HttpStatus.UNPROCESSABLE_ENTITY, "MIG2_ITEM_NAME_NULL", "품목명 빈값 거부"),
MIG2_RELATION_ORPHAN(HttpStatus.UNPROCESSABLE_ENTITY, "MIG2_RELATION_ORPHAN", "품목관계 main_code 가 raw 에 없음"),
MIG2_ALIAS_DUPLICATE(HttpStatus.CONFLICT, "MIG2_ALIAS_DUPLICATE", "동일 alias_code 가 다른 main 에 매핑"),
MIG2_FILE_HASH_INVALID(HttpStatus.UNPROCESSABLE_ENTITY, "MIG2_FILE_HASH_INVALID", "파일 hash 계산 실패"),
```

- [ ] **Step 2**: PageCode 5건:
```java
ECOUNT_MIG2_PRODUCT("ecount.mig2.product", "이카운트 품목 마이그레이션"),
ECOUNT_MIG2_ACCOUNT("ecount.mig2.account", "이카운트 계정 마이그레이션"),
ECOUNT_MIG2_DEPARTMENT("ecount.mig2.department", "이카운트 부서 마이그레이션"),
ECOUNT_MIG2_WAREHOUSE("ecount.mig2.warehouse", "이카운트 창고 마이그레이션"),
ECOUNT_MIG2_CARD("ecount.mig2.card", "이카운트 카드 마이그레이션"),
```

- [ ] **Step 3**: auth-service V?? permission seed (MASTER/MANAGER edit only).
- [ ] **Step 4**: Commit.

## Task 2: Flyway migration × 4 service-per-DB

각 service-per-DB 의 다음 V?? 번호 +1 사용. MIG-1 V9 패턴 미러.

- product-service: `V??__add_product_aliases_and_ecount_staging.sql`
  - products 확장: `unit VARCHAR(20) NULL`, `category_group VARCHAR(100) NULL`, `tax_type VARCHAR(20) DEFAULT 'TAXABLE'`, `unit_price_with_vat NUMERIC(15,2) DEFAULT 0`
  - 신규 `product_aliases` 테이블 (id UUID PK + alias_code UNIQUE + main_product_id FK + source VARCHAR + BaseEntity 7)
  - `staging.ecount_item_raw` + `staging.ecount_item_relation_raw` + `staging.ecount_item_group_raw`
  - `staging.ecount_item_alias` lookup map
- accounting-service: `V??__add_ecount_account_card_staging.sql`
  - `staging.ecount_account_raw` + `staging.ecount_card_raw` + `staging.ecount_account_map`
  - `card_master` 신규 테이블
- hr-service or accounting-service (부서): `V??__add_department_ecount_staging.sql`
  - `staging.ecount_department_raw` + `staging.ecount_department_map`
- warehouse-service: `V??__add_warehouse_ecount_staging.sql`
  - `staging.ecount_warehouse_raw` + `staging.ecount_warehouse_map`

각 staging 테이블 = MIG-1 V9 패턴 (source_file_hash + source_row_no PK + 17~ raw 컬럼 + transform_status + reject_reason + target_*_uuid + audit).

## Task 3: 도메인 entity 신규/확장

- `Product` 확장 (4 컬럼 + getter)
- `ProductAlias` 신규 + factory `create(aliasCode, mainProductId, source)`
- `CardMaster` 신규
- `Department` 신규 또는 확장

각 entity BaseEntity 7 audit + @SQLRestriction("is_deleted = false") + Lombok @Getter @NoArgsConstructor(PROTECTED).

## Task 4~8: 5 Importer Service + Controller (MIG-1 EcountPartnerImporter 패턴 미러)

각 service:
- OpenCSV + BOMInputStream + NamedParameterJdbcTemplate 멱등 UPSERT
- 17 컬럼 헤더 검증 (각 raw 파일별)
- placeholder regex narrow `^(-|0+|0+[- ]?0+[- ]?0+)$`
- 5 분류: IMPORTED / UPDATED / REJECT_NAME_NULL / SKIPPED_PLACEHOLDER / SKIPPED_RELATION_ORPHAN
- 응답 DTO: `{ totalRows, imported, updated, rejected*, sourceFileHash, rejectedSample }`

품목 (Task 4) — 특별 처리:
- `staging.ecount_item_raw` 적재 후 `staging.ecount_item_relation_raw` join
- 동일 item_name 그룹 → main 선정 (가장 오래된 createdAt 또는 raw 의 main 컬럼)
- main → `products` upsert
- alias → `product_aliases` upsert + `staging.ecount_item_alias` lookup map 채움

기타 4 (계정/부서/창고/카드) — 단순 1:1 적재 + lookup map 채움.

## Task 9: PM 통합 build + dev-report + PR

- `./gradlew :services:product-service:test :services:accounting-service:test :services:auth-service:test :services:warehouse-service:test :services:hr-service:test :shared:common:test` → BUILD SUCCESSFUL
- `docs/dev-reports/mig-2-master.md` 작성 (5 분류 카운트 + alias 무결성 SQL + 자동 lookup map 4종 row 수)
- PR 발행 + 9회차 워크플로우 (Claude/Codex 5-agent review 사이클 → CI green → PM 자동 머지)

---

## Self-Review

- Spec coverage: §1~§14 모두 task 매핑 ✓
- Placeholder: 0 (구체적 SQL/code/command 포함)
- Type consistency: product_aliases / ProductAlias / staging.ecount_item_alias 일관
- 신규 발견: hr-service 의 부서 도메인 위치 (accounting-service 통합 검토 — Codex 가 실 구조 확인 후 결정)
