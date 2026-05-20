# MIG-3 이카운트 회계 전표 4종 마이그레이션 — Implementation Plan

> **For agentic workers:** Codex 개발 의무 ([feedback_dual_5agent_review] 9회차). `mcp__codex__codex sandbox=workspace-write` 로 전체 task 일괄 수행.

**Goal:** 이카운트 raw 4종 (매입전표 I / 매출전표 I / 일반전표 / 회계전표분개) → staging 멱등 + 기존 SAS/Journal 도메인 transform.

**Architecture:** 3-Tier (raw CSV → staging.ecount_*_raw → 도메인). MIG-2 lookup map 4종 사용. 4 importer + 4 controller + 5 ErrorCode + V23 (accounting) + V16 (auth PageCode).

**Tech Stack:** Spring Boot 3 / Java 17 / Postgres 16 / OpenCSV 5.9 (commons-beanutils 1.11.0) / Flyway / JdbcTemplate / Mockito / Spring AOP

---

## 작업 그룹 8 (Codex 일괄)

### Task 1: V23 Flyway — staging schema 4 테이블

**Files:**
- Create: `services/accounting-service/src/main/resources/db/migration/V23__add_ecount_voucher_staging.sql`

SQL:
- `CREATE TABLE IF NOT EXISTS staging.ecount_purchase_slip_raw (...)` — slip_no/transaction_type/amount/partner_name/description + source_file_hash/source_row_no PRIMARY KEY (file_hash, row_no)
- `CREATE TABLE IF NOT EXISTS staging.ecount_sales_slip_raw (...)`
- `CREATE TABLE IF NOT EXISTS staging.ecount_general_voucher_raw (...)`
- `CREATE TABLE IF NOT EXISTS staging.ecount_journal_entry_raw (...)` — date/journal_no/line_seq/account_name/partner_name/debit_amount/credit_amount/description
- INDEX 추가 (transaction_date / partner_name 등)

### Task 2: ErrorCode MIG3 5종 (shared/common)

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java`

신규 enum 값:
- `MIG3_VOUCHER_NO_DUPLICATE(CONFLICT, "전표번호 중복")`
- `MIG3_LOOKUP_MISS(UNPROCESSABLE_ENTITY, "lookup 키 매핑 누락 - 거래처/계정/부서/창고 확인 필요")`
- `MIG3_SLIP_AMOUNT_INVALID(UNPROCESSABLE_ENTITY, "전표 금액 형식 불일치 또는 0 이하")`
- `MIG3_JOURNAL_BALANCE_MISMATCH(UNPROCESSABLE_ENTITY, "차/대 합계 불일치 - POSTED 전이 차단")`
- `MIG3_CSV_HEADER_MISMATCH(BAD_REQUEST, "회계 전표 CSV 헤더 불일치")`

### Task 3: EcountPurchaseSlipImporter (accounting-service)

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountPurchaseSlipImporter.java`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountPurchaseSlipImporterTest.java`

핵심 로직:
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)`
- `pg_advisory_xact_lock(advisoryLockKey(NAMESPACE_PURCHASE_UUID, MD5(hash)))`
- OpenCSV + EcountCsvSupport.parse → strict 5 column header
- staging 멱등 적재 (`ON CONFLICT (source_file_hash, source_row_no) DO NOTHING`)
- transform: 거래처명 → partner-service `/internal/partners/by-name` 호출 또는 직접 JDBC join → partnerId UUID
- `PurchaseAccountingSlip.draft(slipNo, partnerId, totalAmount, description, "MIGRATION")` 생성 → save
- import 결과: imported / updated / skipped / rejected 분포 + sample reject 최대 20

테스트:
- `정상 1건 적재`
- `REJECT_PARTNER_LOOKUP_MISS` (MIG3_LOOKUP_MISS)
- `MIG3_SLIP_AMOUNT_INVALID` (음수/문자/0)
- `MIG3_VOUCHER_NO_DUPLICATE` (동일 파일 내 slip_no 중복)
- `MULTI_ROW_SOURCE_ROW_NO containsExactly(1,2,3)`
- `BOM_INPUT`
- `LOOKUP_MAP_IDEMPOTENT` (2회 import 동일 결과)
- `rawHeaderCrossCheck()` (classpath fixture)

### Task 4: EcountSalesSlipImporter

Task 3 와 동일 패턴, `NAMESPACE_SALES_UUID`, `SalesAccountingSlip.draft(...)` 사용.

### Task 5: EcountGeneralVoucherImporter

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountGeneralVoucherImporter.java`
- Create: `EcountGeneralVoucherImporterTest.java`

차이점:
- `Journal.create(journalNo, journalDate, description, JournalSourceType.MANUAL, null)`
- 단일 line 생성 (raw 에 차/대 정보 없음) — `journal.addLine(...)`
- 상태 = DRAFT 유지 (POSTED 전이 X — 차/대 정보 부재)

### Task 6: EcountJournalEntryImporter (회계전표분개)

**Files:**
- Create: `EcountJournalEntryImporter.java`
- Create: `EcountJournalEntryImporterTest.java`

차이점:
- raw 의 `일자-No-순번` 으로 journalNo + lineSequence 추출 (예: `2026/05/01 -1-1`)
- 동일 journalNo group by → 차/대 합계 검증
- 차/대 일치 시 → Journal.create + addLine 여러 개 + `Journal.post(adminUser)` (POSTED 전이)
- 차/대 불일치 시 → DRAFT 유지 + `MIG3_JOURNAL_BALANCE_MISMATCH` 결과 보고서 노출
- 계정명 lookup → `staging.ecount_account_map` 역방향 검색 (`account_name` → `ChartOfAccount.id`)

테스트:
- `차대일치_journal_POSTED 전이`
- `차대불일치_DRAFT 유지 + MIG3_JOURNAL_BALANCE_MISMATCH 보고`
- `MIG3_LOOKUP_MISS` (account_name 매핑 부재)
- `MULTI_LINE_ORDER` (lineSequence 1,2,3 정확)

### Task 7: 4 Controller (`POST /admin/.../imports/ecount`)

**Files:**
- Create: `EcountPurchaseSlipImportController.java`
- Create: `EcountSalesSlipImportController.java`
- Create: `EcountGeneralVoucherImportController.java`
- Create: `EcountJournalEntryImportController.java`

공통:
- `@PostMapping(value = "/admin/.../imports/ecount", consumes = MULTIPART_FORM_DATA)`
- multipart `MultipartFile file` (10MB)
- ROLE_MASTER + ROLE_MANAGER 만 (PageCode MIG3 4종 + role_page_permissions)
- 응답: `EcountVoucherImportResult` DTO (5 분류 카운트 + sample reject 최대 20)

### Task 8: V16 auth-service PageCode MIG3 4종 + permission seed

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V16__seed_mig3_page_codes.sql`

PageCode 신규:
- `ECOUNT_MIG3_PURCHASE_SLIP`
- `ECOUNT_MIG3_SALES_SLIP`
- `ECOUNT_MIG3_GENERAL_VOUCHER`
- `ECOUNT_MIG3_JOURNAL_ENTRY`

V16 seed:
- `INSERT INTO page_codes ... ON CONFLICT DO NOTHING` × 4
- `INSERT INTO role_page_permissions (role, page_code, can_view, can_edit) ... ON CONFLICT DO NOTHING` × 8 (ROLE_MASTER + ROLE_MANAGER true, DISPATCH/MEMBER false)

### 검증 의무 (모든 task 완료 후)

```
./gradlew :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon
```
→ **BUILD SUCCESSFUL** 확인 후 commit + push.

commit 메시지 (한국어):
```
feat(mig-3): 이카운트 회계 전표 4종 마이그레이션 (매입/매출/일반/분개)

- staging schema 4 테이블 (V23 accounting)
- 4 importer (Purchase/Sales/General/JournalEntry) + 4 controller
- ErrorCode MIG3 5종 + PageCode MIG3 4종 (V16 auth)
- pg_advisory_xact_lock 4 namespace 분리 + REQUIRES_NEW + READ_COMMITTED
- MIG-2 lookup map 4종 (item_alias/account_map/department_map/warehouse_map) 사용
- 회계전표분개 차/대 합계 검증 + POSTED/DRAFT 분기
```

### Task 9: dev-report 갱신 ([feedback_continuous_docs_sync])

**Files:**
- Create: `docs/dev-reports/ecount-mig-3-voucher.md` (3-layer 누적 — 산출/결정/사이클 결과)

---

## 후속

PR 발행 → 9회차 워크플로우 사이클 진입:
1. Claude 5-agent review (BE/FE/Designer/QA-Docker/DevOps) + TM 통합 + Claude fix
2. Codex 5-agent review (BE/FE/Designer/QA/DevOps, read-only) + TM 통합 + Codex fix
3. 사이클 N ≤ 3 안 모든 결함 해소
4. CI 25/25 PASS + 잔존 결함 0 → PM 마지막 종합 리뷰 + 자동 squash 머지
5. MIG-4 (세금계산서/판매전표/매출매입내역) 자동 진입
