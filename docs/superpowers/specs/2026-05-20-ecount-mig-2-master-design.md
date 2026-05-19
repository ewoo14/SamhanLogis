# MIG-2 이카운트 마스터 5종 일괄 마이그레이션 — Design

> 작성일: 2026-05-20
> PM: Claude Opus 4.7 + 개발책임자
> baseline: MIG-1 PoC (PR #262 머지 `060c6f13`) + SAS 시리즈 5/5 머지 (#263~#269)
> handoff §A 의무 규칙 + [project_ecount_product_identity_rule] (품목 alias 매핑 의무)

## 1. 핵심 결정 (사용자 확정 2026-05-20)

| # | 결정 | 근거 |
|---|---|---|
| D-MIG-2-01 | **한 PR 통합 5종** (품목/계정/부서/창고/카드) | MIG-1 PoC 패턴 재사용, 자동 lookup map 4종 동시 산출 |
| D-MIG-2-02 | **품목 alias = Product + product_aliases 별도 테이블** | products.id 단일 UUID + product_aliases(alias_code → main_product_id) N:1, index 효율 |
| D-MIG-2-03 | **3-Tier 패턴 재사용** | MIG-1 와 동일: `staging.ecount_<도메인>_raw` → transform → 도메인 |
| D-MIG-2-04 | **멱등 키 = (source_file_hash, source_row_no)** | MIG-1 V9 패턴 |
| D-MIG-2-05 | **5 importer 동시 endpoint** | `POST /admin/<도메인>/imports/ecount` × 5 (multipart, ROLE_MASTER+MANAGER) |
| D-MIG-2-06 | **자동 lookup map 4종 산출** | warehouse_map / department_map / item_alias / account_map — MIG-3+ 트랜잭션 의존 해소 |
| D-MIG-2-07 | **품목 신원 판정** = `item_name + item_relation` join | [project_ecount_product_identity_rule]. 단순 `item_code` PK 적재 금지 |

## 2. Architecture Overview

```
[이카운트 raw 5 file]
├── 품목-Excel다운로드.csv (313 KB)
├── 품목관계-Excel다운로드.csv (15 KB)  ← alias_code, main_code 매핑
├── 품목계층그룹-Excel다운로드.csv (4.7 KB)  ← 카테고리
├── 계정상세내역-Excel다운로드.csv (78 KB)
├── 부서코드-Excel다운로드.csv (349 B)
├── 창고-Excel다운로드.csv (2.5 KB)
└── 통장계좌-Excel다운로드.csv (카드/계좌)
         ↓
[staging schema — 각 service-per-DB]
├── product-service: staging.ecount_item_raw + staging.ecount_item_relation_raw + staging.ecount_item_group_raw
├── accounting-service: staging.ecount_account_raw + staging.ecount_card_raw
├── hr-service (또는 accounting): staging.ecount_department_raw
├── warehouse-service: staging.ecount_warehouse_raw
         ↓
[transform — domain]
├── products + product_aliases (품목 alias 의무)
├── accounts (chart_of_accounts)
├── departments
├── warehouses
├── card_master (또는 통장계좌)
         ↓
[자동 lookup map 4종]
├── staging.ecount_warehouse_map (code → warehouse_uuid)
├── staging.ecount_department_map (code → department_uuid)
├── staging.ecount_item_alias (alias_code → main_product_uuid)  ← 핵심
└── staging.ecount_account_map (code → account_uuid)
```

## 3. 도메인 모델 (5 도메인)

### 3-A. 품목 (product-service)

```
products (기존 확장)
├── id UUID (내부 PK)
├── product_code VARCHAR(100) UNIQUE (사용자 노출 = main_code)
├── product_name VARCHAR(200)
├── unit VARCHAR(20)  -- 단위 (EA/SET/M 등)
├── category_group VARCHAR(100)  -- 품목계층그룹
├── tax_type ENUM (TAXABLE/ZERO_RATED/EXEMPT)
├── unit_price_with_vat NUMERIC(15,2)  -- VAT-inclusive (slip-service 기준 동일)
├── memo TEXT
└── BaseEntity 7

product_aliases (신규)
├── id UUID
├── alias_code VARCHAR(100) UNIQUE  -- 이카운트 alias item_code
├── main_product_id UUID FK → products(id)
├── source VARCHAR(20)  -- "ECOUNT_IMPORT" 등
└── BaseEntity 7

CREATE INDEX idx_product_alias_main ON product_aliases(main_product_id) WHERE is_deleted = FALSE;
```

**품목 신원 판정 로직**:
1. `staging.ecount_item_raw` 적재 후 `staging.ecount_item_relation_raw` join
2. 동일 `item_name` 그룹화 + relation 매핑 적용
3. 그룹 대표 (main) 선정: 가장 오래된 createdAt 또는 사용자 지정 (이카운트의 main_code 컬럼 있다면 그대로)
4. main → `products` 적재
5. alias → `product_aliases` 적재 (alias_code → main_product_id)

### 3-B. 계정 (accounting-service)

```
accounts (한국 일반기업회계기준 seed 이미 있음 — V?? 기존)
├── account_code VARCHAR(10) UNIQUE  -- 100/200/300/400/500/800/900
├── account_name VARCHAR(100)
├── category ENUM (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE)
└── ...
```

MIG-2: 이카운트 `계정상세내역-Excel다운로드.csv` 와 기존 accounts seed cross-check + 차이 row 만 update/insert.

### 3-C. 부서 (hr-service or accounting-service)

```
departments (신규 또는 기존 확장)
├── department_code VARCHAR(50) UNIQUE
├── department_name VARCHAR(100)
└── BaseEntity 7
```

### 3-D. 창고 (warehouse-service)

```
warehouses (기존)
├── warehouse_code VARCHAR(50) UNIQUE
├── warehouse_name VARCHAR(100)
├── warehouse_type ENUM (HEADQUARTERS/VEHICLE/CONSIGNMENT/VIRTUAL)  -- 기존 4-tier
└── ...
```

이카운트 raw 의 추가사업장용 창고 매핑 = `staging.ecount_warehouse_map(code, name, warehouse_uuid)`.

### 3-E. 카드/계좌 (accounting-service)

```
card_master (또는 bank_account, 신규)
├── card_code VARCHAR(50) UNIQUE
├── card_name VARCHAR(100)
├── card_type ENUM (CREDIT/DEBIT/BANK_ACCOUNT)
├── account_number VARCHAR(50)
└── BaseEntity 7
```

## 4. 5 Importer Service + Endpoint

```
POST /admin/products/imports/ecount       — product-service (품목 + alias + group)
POST /admin/accounts/imports/ecount        — accounting-service (계정)
POST /admin/departments/imports/ecount     — accounting-service or hr-service (부서)
POST /admin/warehouses/imports/ecount      — warehouse-service (창고)
POST /admin/cards/imports/ecount           — accounting-service (카드/계좌)
```

각 importer:
- MIG-1 PoC 의 `EcountPartnerImporter` 패턴 재사용 (OpenCSV + BOMInputStream + NamedParameterJdbcTemplate 멱등 UPSERT)
- 응답: 5 분류 카운트 + rejected sample + sourceFileHash
- ROLE_MASTER + ROLE_MANAGER (DISPATCH 차단)

## 5. 자동 lookup map 4종

MIG-2 완료 시점에 자동 채워짐:

```sql
-- partner-service or 별도 schema
staging.ecount_warehouse_map (ecount_code VARCHAR, ecount_name VARCHAR, warehouse_uuid UUID)
staging.ecount_department_map (ecount_code VARCHAR, ecount_name VARCHAR, department_uuid UUID)
staging.ecount_item_alias (alias_code VARCHAR, main_product_uuid UUID)
staging.ecount_account_map (ecount_code VARCHAR, account_uuid UUID)
```

MIG-3+ 트랜잭션 transform 단계에서 lookup 호출:
- 이카운트 전표 의 `warehouse_code` → `ecount_warehouse_map.warehouse_uuid`
- 전표 의 `item_code` → `ecount_item_alias.main_product_uuid` (alias → main 정규화)

## 6. VAT 분리 (slip-service 와 일관)

품목 단가 = VAT-inclusive (slip-service 기준). product 적재 시 그대로 저장. 매출/매입전표 변환 시 SAS-1 의 `VatCalculator.split(qty, unitPrice, taxType)` 재사용.

## 7. ErrorCode 신규

| 코드 | HTTP | 상황 |
|---|---|---|
| `MIG2_HEADER_MISMATCH` | 422 | CSV 헤더 형식 불일치 |
| `MIG2_ITEM_NAME_NULL` | 422 (warning level) | 품목명 빈값 → REJECT_NAME_NULL |
| `MIG2_PLACEHOLDER_CODE` | (info) | placeholder code → SKIPPED |
| `MIG2_RELATION_ORPHAN` | 422 | 품목관계 row 의 main_code 가 staging.ecount_item_raw 에 없음 |
| `MIG2_ALIAS_DUPLICATE` | 409 | 동일 alias_code 가 2 main 에 매핑 시도 |

## 8. ⚠ 핵심 의존 — MIG-1 narrow placeholder regex 패턴 재사용

MIG-1 PoC 사이클 1 fix 의 `^(-|0+|0+[- ]?0+[- ]?0+)$` 정규식 그대로 5 importer 에 적용. 1~4자리 숫자 정상 코드 NORMAL 처리 (예: `01`, `1123` 등).

## 9. Admin UI (out-of-scope, 후속)

본 MIG-2 PR = BE-only PoC + 자동 lookup map. Admin UI 메뉴 5건 추가는 후속 슬라이스 (SP-MIG-UI 또는 SAS-5 패턴 확장).

## 10. 후속 (PR 머지 후)

- **MIG-3** 회계 전표 묶음 (일반/매입/매출) — accounting-service
- **MIG-4** 매출매입 묶음 (주문서 5 분기) — sales/purchase-service
- **MIG-5** 입출금 묶음 — accounting-service
- **MIG-6** 재고 입출고 — warehouse/inventory-service
- 모두 MIG-2 의 자동 lookup map 4종 의존

## 11. 검증 SQL (각 도메인)

```sql
-- 품목 alias 무결성
SELECT count(*) FROM product_aliases pa
LEFT JOIN products p ON pa.main_product_id = p.id
WHERE p.id IS NULL AND pa.is_deleted = FALSE;
-- 기대: 0

-- 동일 item_name + 다른 main_code 검출 (alias 누락 의심)
SELECT product_name, COUNT(DISTINCT product_code)
FROM products WHERE is_deleted = FALSE
GROUP BY product_name HAVING COUNT(DISTINCT product_code) > 1;

-- 자동 lookup map row 수 cross-check
SELECT 'warehouse_map' AS map_name, COUNT(*) FROM staging.ecount_warehouse_map
UNION ALL SELECT 'department_map', COUNT(*) FROM staging.ecount_department_map
UNION ALL SELECT 'item_alias', COUNT(*) FROM staging.ecount_item_alias
UNION ALL SELECT 'account_map', COUNT(*) FROM staging.ecount_account_map;
```

## 12. 회귀 가드

- MIG-1 PoC (partner-service) 무영향 — 별도 schema (samhan_partner.partners + staging.ecount_partner_raw)
- 기존 product-service / accounting-service / warehouse-service 도메인 확장만 (PK + UNIQUE 무수정)
- SAS 시리즈 (PR #263~269) 무영향 — 매출/매입전표는 본 product/account/warehouse 의존, alias lookup 추가 시 자동 해소

## 13. 사이클 분해 (writing-plans 단계)

| Task 그룹 | 내용 |
|---|---|
| 1. Flyway migrations | 각 service-per-DB 의 V?? — staging schema + 도메인 컬럼 확장 |
| 2. 도메인 entity | Product (확장) + ProductAlias (신규) + 기타 4 |
| 3. ErrorCode + DTO 5종 | 5 importer 의 Request/Response record |
| 4. Importer Service 5종 | EcountProductImporter / EcountAccountImporter / EcountDepartmentImporter / EcountWarehouseImporter / EcountCardImporter |
| 5. Controller 5종 | POST /admin/<도메인>/imports/ecount × 5 |
| 6. 자동 lookup map 4종 | staging table + transform 후 채움 |
| 7. 단위 + IT | 각 importer 단위 + IT (Docker postgres) |
| 8. PageCode + permission seed | auth-service V?? — 5 신규 PageCode |
| 9. PM 통합 build + dev-report | 실 raw 파일 검증 + 5 분류 카운트 + alias 무결성 SQL |

## 14. AWS / 비용

0 (각 service 기존 그대로, staging schema 는 동일 DB 내 추가).
