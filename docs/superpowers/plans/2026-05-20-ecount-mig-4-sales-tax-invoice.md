# MIG-4 이카운트 영업·세무 raw 4종 마이그레이션 — Implementation Plan

> **For agentic workers:** Codex 개발 의무 ([feedback_dual_5agent_review] 9회차). `mcp__codex__codex sandbox=workspace-write` 로 전체 task 일괄 수행.

**Goal:** 이카운트 raw 4종 (세금계산서용 판매전표 / 판매전표 / 매출매입내역 / 주문서) → staging 멱등 + TaxInvoice OUTBOUND/SalesAccountingSlipLine 보강 + 검증 SQL.

**Architecture:** 3-Tier (raw CSV → staging.ecount_*_raw → 도메인/검증). MIG-2 lookup map + MIG-1 partner 재사용. 4 importer + 4 controller + 9 ErrorCode + V24 (accounting) + V17 (auth PageCode).

**Tech Stack:** Spring Boot 3 / Java 17 / Postgres 16 / OpenCSV 5.9 (commons-beanutils 1.11.0) / Flyway / JdbcTemplate / Mockito / Spring AOP

---

## 작업 그룹 9 (Codex 일괄)

### Task 1: V24 Flyway — staging 4 테이블 + TaxInvoiceStatus.MIGRATED

**Files:**
- Create: `services/accounting-service/src/main/resources/db/migration/V24__add_ecount_mig4_staging.sql`

SQL:
- `CREATE TABLE IF NOT EXISTS staging.ecount_tax_invoice_raw (...)` — partner_code/partner_name/biz_subno/representative/address/biz_type/biz_item/email/supply_amount/vat_amount/issue_date/item_name/quantity/unit_price/related_slip_no + source_file_hash VARCHAR(64) + source_row_no + PRIMARY KEY (file_hash, row_no)
- `CREATE TABLE IF NOT EXISTS staging.ecount_sales_slip_line_raw (...)` — slip_no/partner_code/partner_name/item_name/quantity/unit_price/supply_amount/vat_amount/total_amount/due_date + file_hash/row_no
- `CREATE TABLE IF NOT EXISTS staging.ecount_sales_purchase_summary_raw (...)` — month_day/type_name/electronic_type/partner_name/detail/purchase_supply/purchase_vat/sales_supply/sales_vat/sales_total + file_hash/row_no
- `CREATE TABLE IF NOT EXISTS staging.ecount_order_raw (...)` — order_no/partner_name/manager_name/valid_until/payment_terms/reference/progress_status/item_name/quantity/unit_price/supply_amount/vat_amount/item_due_date + file_hash/row_no
- INDEX 추가 (partner_name / issue_date / slip_no / order_no 등)
- `ALTER TYPE tax_invoice_status ADD VALUE IF NOT EXISTS 'MIGRATED';` (Postgres enum 확장, 트랜잭션 외 실행 — Flyway script 분리 또는 baseline 변경 확인)
- 가드: TaxInvoiceStatus enum 확장이 트랜잭션 안에서 실행 불가하면 V24 후속 `V25__alter_tax_invoice_status_enum.sql` 분리 (Codex 결정)

### Task 2: ErrorCode MIG4 9종 (shared/common)

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java`

신규 enum 값:
- `MIG4_TAX_INVOICE_DUPLICATE(CONFLICT, "동일 source_file 내 세금계산서 중복")`
- `MIG4_LOOKUP_MISS(UNPROCESSABLE_ENTITY, "lookup 키 매핑 누락 - 거래처/품목 확인 필요")`
- `MIG4_LOOKUP_AMBIGUOUS(UNPROCESSABLE_ENTITY, "거래처명 중복 매칭 - 거래처코드 보강 필요")`
- `MIG4_AMOUNT_INVALID(UNPROCESSABLE_ENTITY, "금액 형식 불일치 또는 0 이하")`
- `MIG4_DATE_INVALID(BAD_REQUEST, "일자 포맷 불일치 - yyyy/MM/dd 외 포맷")`
- `MIG4_SLIP_NO_INVALID(UNPROCESSABLE_ENTITY, "전표번호 또는 회계전표일자-No 포맷 불일치")`
- `MIG4_SUMMARY_BALANCE_MISMATCH(UNPROCESSABLE_ENTITY, "매출매입내역 합계 ↔ 도메인 합계 불일치")`
- `MIG4_ORDER_STATUS_INVALID(UNPROCESSABLE_ENTITY, "주문서 진행상태 unknown 값")`
- `MIG4_CSV_HEADER_MISMATCH(BAD_REQUEST, "MIG-4 CSV 헤더 불일치")`

### Task 3: EcountTaxInvoiceImporter (accounting-service)

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountTaxInvoiceImporter.java`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountTaxInvoiceImporterTest.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoiceStatus.java` — `MIGRATED` enum 값 추가

핵심 로직:
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)`
- `pg_advisory_xact_lock(advisoryLockKey(NAMESPACE_TAX_INVOICE_UUID, SHA-256(hash)[:8]))`
- OpenCSV + EcountCsvSupport.parse → strict 15 column header + trailing empty column 허용
- staging 멱등 적재 (`ON CONFLICT (source_file_hash, source_row_no) DO NOTHING`)
- transform:
  - 거래처코드 1차 lookup (`partners.ecount_code`) → 미스 시 거래처명 2차 lookup (partner-service `/internal/partners/by-name`)
  - 동일 (거래처 + 일자) 의 다중 raw row → 1 TaxInvoice 머리 + N TaxInvoiceLine
  - `TaxInvoice.draftMigration(customerPartnerId, issuedAt, type=TAX_INVOICE, direction=OUTBOUND, status=MIGRATED, externalRef=hash+'-'+headerRowNo)` 신규 factory
  - `TaxInvoiceLine.create(itemName, quantity, unitPrice, supplyAmount, vatAmount, description="회계전표:" + related_slip_no)` × N
- import 결과: imported / updated / skipped / rejected 분포 + sample reject 최대 20

테스트:
- `정상 1건 적재 (단일 line)`
- `정상 다중 line 적재 (동일 거래처+일자, 2건 line)`
- `REJECT_PARTNER_LOOKUP_MISS` (MIG4_LOOKUP_MISS)
- `MIG4_AMOUNT_INVALID` (음수/문자/0)
- `MIG4_DATE_INVALID` (yyyy-MM-dd 포맷 / null)
- `MULTI_ROW_SOURCE_ROW_NO containsExactly(1,2,3)`
- `BOM_INPUT`
- `LOOKUP_MAP_IDEMPOTENT` (2회 import 동일 결과)
- `rawHeaderCrossCheck()` (classpath fixture)
- `trailing empty column 1개 허용`

### Task 4: EcountSalesSlipLineImporter

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountSalesSlipLineImporter.java`
- Create: `EcountSalesSlipLineImporterTest.java`

핵심 로직:
- Task 3 동일 패턴, `NAMESPACE_SALES_SLIP_LINE_UUID`
- 일자-No. (`yyyy/MM/dd -N`) → 정규화 `yyyy-MM-dd-NNN` → `SalesAccountingSlip.slipNo` lookup
- 매칭 slip 존재 시 → `SalesAccountingSlipLine.create(itemName, quantity, unitPrice, supplyAmount, vatAmount, totalAmount)` 추가 + slip.addLine()
- 매칭 slip 미존재 시 → 신규 `SalesAccountingSlip.draftMigration(slipNo, partnerId, totalAmount, description="MIG-4 신규")` + line 동시 생성
- 입금예정일 (`MMDD`, 4자리) → 일자 의 연도 결합 → LocalDate → slip.updateDueDate() (보강)
- soft-deleted slip/line 복구 CTE 사용 (MIG-3 D-08 패턴)

테스트:
- `매칭_slip_존재_line_추가`
- `매칭_slip_미존재_신규_생성`
- `MIG4_SLIP_NO_INVALID` (일자-No. 포맷 불일치)
- `MIG4_LOOKUP_MISS` (거래처코드 매칭 부재)
- `linked_unlinked_카운트_분리_정확`
- `BOM_INPUT`
- `LOOKUP_MAP_IDEMPOTENT`
- `rawHeaderCrossCheck()`

### Task 5: EcountSalesPurchaseSummaryImporter (staging only + 검증)

**Files:**
- Create: `EcountSalesPurchaseSummaryImporter.java`
- Create: `EcountSalesPurchaseSummaryImporterTest.java`

차이점:
- staging 적재만 (도메인 변환 X)
- `validateAgainstDomain()` 검증 method: `staging.ecount_sales_purchase_summary_raw` 의 일별 매출/매입 합계 vs SalesAccountingSlip/PurchaseAccountingSlip 일별 합계 cross-check (JdbcTemplate query)
- 불일치 → `MIG4_SUMMARY_BALANCE_MISMATCH` 보고서 (sample 5건 + raw 값 + 도메인 합계 차이)
- 응답 DTO: `imported / mismatchCount / mismatchSamples`

테스트:
- `staging 적재 정상`
- `검증_PASS` (도메인 합계 일치)
- `검증_FAIL_MISMATCH_SAMPLE` (불일치 5건 sample)
- `BOM_INPUT`
- `rawHeaderCrossCheck()`

### Task 6: EcountOrderImporter (staging only, 5 분할 파일)

**Files:**
- Create: `EcountOrderImporter.java`
- Create: `EcountOrderImporterTest.java`

차이점:
- staging 적재만
- 5 분할 파일 = 동일 importer 가 file_hash 별 5회 멱등 import (사용자 5회 upload)
- 진행상태 enum 사전 정의: `완료 / 진행 / 취소 / 대기` (MIG-4 본 슬라이스 enum), unknown 값 → `MIG4_ORDER_STATUS_INVALID` reject sample
- `validateAgainstDomain()` 검증 method: 진행상태='완료' 의 일자-No. 가 SalesAccountingSlip.slipNo 와 매핑 (도메인 변환 X, 검증만)
- 응답 DTO: `imported / unknownStatusCount / linkedSlipCount / unlinkedSlipCount`

테스트:
- `staging 적재 정상`
- `multi_file_idempotent` (5 분할 파일 file_hash 별 멱등)
- `MIG4_ORDER_STATUS_INVALID_SAMPLE`
- `linkedSlipCount_정확`
- `BOM_INPUT`
- `rawHeaderCrossCheck()`

### Task 7: 4 Controller (`POST /admin/.../imports/ecount`)

**Files:**
- Create: `EcountTaxInvoiceImportController.java` — `POST /admin/accounting/tax-invoices/imports/ecount`
- Create: `EcountSalesSlipLineImportController.java` — `POST /admin/accounting/sales-slips/imports/ecount-line`
- Create: `EcountSalesPurchaseSummaryImportController.java` — `POST /admin/accounting/sales-purchase-summary/imports/ecount`
- Create: `EcountOrderImportController.java` — `POST /admin/accounting/orders/imports/ecount`

공통:
- `@PostMapping(value = "...", consumes = MULTIPART_FORM_DATA)`
- multipart `MultipartFile file` (10MB)
- ROLE_MASTER + ROLE_MANAGER 만 (PageCode MIG4 4종 + role_page_permissions)
- 응답: `EcountMig4ImportResult` DTO (5 분류 카운트 + sample reject 최대 20)
- IT: multipart / 권한 / 미인증 / 검증 실패 4 케이스 × 4 controller = 16 IT

### Task 8: V17 auth-service PageCode MIG4 4종 + permission seed

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V17__seed_mig4_page_codes.sql`

PageCode 신규:
- `ECOUNT_MIG4_TAX_INVOICE`
- `ECOUNT_MIG4_SALES_SLIP_LINE`
- `ECOUNT_MIG4_SUMMARY`
- `ECOUNT_MIG4_ORDER`

V17 seed:
- `INSERT INTO page_codes ... ON CONFLICT DO NOTHING` × 4
- `INSERT INTO role_page_permissions (role, page_code, can_view, can_edit) ... ON CONFLICT DO NOTHING` × 8 (ROLE_MASTER + ROLE_MANAGER true, DISPATCH/MEMBER false)

### Task 9: classpath fixture 4종 + IT raw header cross-check

**Files:**
- Create: `services/accounting-service/src/test/resources/fixtures/mig4-tax-invoice.csv`
- Create: `services/accounting-service/src/test/resources/fixtures/mig4-sales-slip-line.csv`
- Create: `services/accounting-service/src/test/resources/fixtures/mig4-sales-purchase-summary.csv`
- Create: `services/accounting-service/src/test/resources/fixtures/mig4-order.csv`

각 fixture:
- 실 raw 헤더 정확 일치 (BOM + meta row `데이터관리>` + strict header + trailing empty column 1개) — MIG-3 D-MIG-3-10 패턴
- 3 row sample (정상 / lookup miss / 금액 오류)

테스트 cross-check:
- `Mig4FixtureHeaderCrossCheckTest` — 4 fixture vs 실 raw 헤더 byte-for-byte 비교

### Task 10: 4 IT Controller (multipart + 권한)

**Files:**
- Create: `EcountTaxInvoiceImportControllerIT.java`
- Create: `EcountSalesSlipLineImportControllerIT.java`
- Create: `EcountSalesPurchaseSummaryImportControllerIT.java`
- Create: `EcountOrderImportControllerIT.java`

각 IT 4 케이스:
- 정상 (200)
- 미인증 (401)
- 권한 부족 (403, ROLE_DISPATCH/MEMBER)
- 검증 실패 (400/422, MIG4_CSV_HEADER_MISMATCH 등)

@MockBean: 외부 client (PartnerInternalClient 등) 격리 ([feedback_it_mockbean_external_clients])

### 검증 의무 (모든 task 완료 후)

```
./gradlew :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon
```
→ **BUILD SUCCESSFUL** 확인 후 commit + push.

commit 메시지 (한국어):
```
feat(mig-4): 이카운트 영업·세무 raw 4종 마이그레이션 (세금계산서/판매전표/내역/주문서)

- staging schema 4 테이블 (V24 accounting) + TaxInvoiceStatus.MIGRATED 추가
- 4 importer (TaxInvoice/SalesSlipLine/Summary/Order) + 4 controller
- ErrorCode MIG4 9종 + PageCode MIG4 4종 (V17 auth)
- pg_advisory_xact_lock 4 namespace 분리 + REQUIRES_NEW + READ_COMMITTED
- MIG-1 partner + MIG-2 lookup map 재사용
- 매출매입내역/주문서 = staging + 검증 SQL (도메인 변환 X)
- 세금계산서용 판매전표 → TaxInvoice OUTBOUND, 판매전표 → SalesAccountingSlipLine 보강
```

### Task 11: dev-report 갱신 ([feedback_continuous_docs_sync])

**Files:**
- Create: `docs/dev-reports/ecount-mig-4-sales-tax-invoice.md` (3-layer 누적 — 산출/결정/사이클 결과)

구조:
- §1 산출 요약 (file 카운트, importer/controller/Flyway/ErrorCode)
- §2 결정 D-MIG-4-01~15
- §3 검증 상태 (gradle test 결과)
- §4~ 사이클 1/2/3 fix 누적

### Task 12: 문서 동기화 ([feedback_continuous_docs_sync])

**Files:**
- Modify: `ROADMAP.md` — MIG-4 항목 체크
- Modify: `migration/decisions/DECISIONS.md` — MIG-4 결정 D-MIG-4-XX 추가
- Modify: `services/accounting-service/README.md` — MIG-4 importer 4종 anchor 갱신
- Modify: `docs/migration/ecount-data/README.md` — MIG-4 raw 4종 anchor 갱신
- Modify: `docs/handoff/CURRENT-WORK.md` — MIG-4 진입 + 예정 산출 (PR 발행 후 머지 결과로 갱신)

---

## 5-team 매트릭스

| Team | Tasks | 산출 |
|---|---|---|
| **BE** | 1~10 | Flyway V24/V17, 4 importer + IT, ErrorCode/PageCode, 4 controller |
| **QA** | 9, 10 | 4 fixture (raw header cross-check), 16 IT (4 controller × 4 케이스), domain integrity SQL 10건, idempotency 검증 |
| **Designer** | — | UI 미구현 (admin 화면 후속) — `fe-impact-zero.md` 명시 |
| **DevOps** | — | CI 추가 변경 없음 (paths-ignore 확인만), GitGuardian false positive 가드 확인 |
| **Plan** (TM) | 12 | 문서 동기화 + 사이클 종합 |

---

## 9회차 워크플로우 사이클 (10단계 절대 변동 금지)

### 사이클 1 (PR 발행 직후)
1. ☐ Claude 5-agent 병렬 review (single message multiple Agent calls)
2. ☐ **TM Claude 통합 PR comment 등록 (즉시, head SHA 명시)**
3. ☐ Claude fix (Codex CLI MCP workspace-write 또는 직접)
4. ☐ commit + push (head 갱신)
5. ☐ Codex 5-agent 병렬 review (1c push 후 새 head)
6. ☐ **TM Codex 통합 PR comment 등록 (즉시, head SHA 명시)**
7. ☐ Codex fix (workspace-write)
8. ☐ commit + push (head 갱신)
9. ☐ 종료 조건: 잔존 결함 0 + CI watch PASS
10. ☐ 충족 시 PM 종합 리뷰 + 자동 머지 / 미충족 시 사이클 2 (최대 N=3)

---

🤖 PM Claude (Opus 4.7) — 2026-05-20 자율 진행
