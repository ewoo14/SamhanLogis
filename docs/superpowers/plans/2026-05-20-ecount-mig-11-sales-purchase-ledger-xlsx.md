# MIG-11 매출장/매입장 xlsx — Implementation Plan

> Codex `mcp__codex__codex sandbox=workspace-write`.

**Goal:** Apache POI parser 도입 + 매출장/매입장 xlsx 2종 → staging 적재 + DailyClosing 대조 검증 SQL.

---

## 작업 그룹 16 (Codex 일괄)

### Task 1: build.gradle Apache POI 의존성 추가

`shared/common/build.gradle` (또는 root): `implementation 'org.apache.poi:poi-ooxml:5.2.5'`.

### Task 2: EcountXlsxSupport 신규 헬퍼

`shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountXlsxSupport.java`:
- `parse(InputStream, String[] expectedHeaders) → ParsedXlsx`
- SHA-256 file hash
- header strict match
- footer 정확 매칭 (`합계`/`총계` skip)
- 빈 row skip

단위 테스트 5 cases:
- 정상 parse
- header_mismatch_throws
- 빈_row_skip
- footer_skip
- BOM/encoding 검증

### Task 3: V31 Flyway accounting

`services/accounting-service/src/main/resources/db/migration/V31__add_ecount_ledger_staging.sql`:
- `staging.ecount_sales_ledger_raw` (transaction_date / partner_name / item_name / quantity / unit_price / supply_amount / vat_amount / total_amount + file_hash/row_no)
- `staging.ecount_purchase_ledger_raw` (동일 구조)
- INDEX: transaction_date / partner_name

### Task 4: V24 auth + PageCode MIG11 2종

- `ECOUNT_MIG11_SALES_LEDGER` / `ECOUNT_MIG11_PURCHASE_LEDGER`
- role_page_permissions seed 4건

### Task 5: ErrorCode MIG11 5종 (shared/common)

### Task 6: EcountSalesLedgerImporter + 단위 테스트 9 cases

- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + advisory lock
- EcountXlsxSupport.parse 사용
- staging 적재 (`ON CONFLICT DO NOTHING`)
- `validateAgainstDailyClosing()` cross-check method
- 응답 DTO `EcountMig11Result`

behavior 9 cases:
- 정상 적재
- header_mismatch
- amount_invalid
- date_invalid
- duplicate (source_file_hash 동일)
- multi_row_source_row_no
- footer_skip
- daily_closing_mismatch warning sample
- 빈_row_skip

### Task 7: EcountPurchaseLedgerImporter

Task 6 동일 패턴, NAMESPACE_PURCHASE_LEDGER_UUID.

### Task 8: 2 Controller

- `POST /admin/accounting/sales-ledger/imports/ecount`
- `POST /admin/accounting/purchase-ledger/imports/ecount`
- multipart 10MB, ROLE_MASTER+MANAGER, EcountMig11Result

### Task 9: 10 IT parameterized

5 case × 2 endpoint (200/401/403/400/422)
@MockBean 외부 client

### Task 10: 2 fixture xlsx

`services/accounting-service/src/test/resources/fixtures/mig11-sales-ledger.xlsx`
`services/accounting-service/src/test/resources/fixtures/mig11-purchase-ledger.xlsx`

- 5 row sample
- PII placeholder (거래처A/B/C/D/E)
- 실 raw 헤더 일치 (Apache POI workbook 생성)
- Mig11FixtureHeaderCrossCheckTest

### Task 11: dev-report

### Task 12: 문서 동기화 (ROADMAP / DECISIONS / accounting-service README / root README / handoff / overview HTML)

---

## 검증 + commit + push

```
cd C:/dev/SamhanLogis
./gradlew.bat :shared:common:test :services:auth-service:test :services:accounting-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit:

```
feat(mig-11): 매출장/매입장 xlsx → staging + DailyClosing 대조 (Apache POI 도입)

- EcountXlsxSupport 신규 헬퍼 (Apache POI 5.2.5) — MIG-12+ 활용 후보
- staging.ecount_sales_ledger_raw / purchase_ledger_raw (V31 accounting)
- 2 importer (SalesLedger / PurchaseLedger) + 2 controller
- DailyClosing 대조 검증 SQL (sales_amount / purchase_amount cross-check) + MIG11_DAILY_CLOSING_MISMATCH warning
- ErrorCode MIG11 5종 + PageCode MIG11 2종 (V24 auth)
- pg_advisory_xact_lock 2 namespace
- 단위 테스트 18+ cases + 10 IT parameterized (D-MIG-11-12/13)
- fixture xlsx 2종 (Apache POI workbook 생성, PII placeholder)

🤖 Generated with Codex CLI workspace-write
```

push: `origin spec/2026-05-20-mig-11-sales-purchase-ledger-xlsx`
