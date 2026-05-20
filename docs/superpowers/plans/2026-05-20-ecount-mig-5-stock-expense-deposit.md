# MIG-5 이카운트 창고이동·지출결의서·입금보고서 raw 3종 마이그레이션 — Implementation Plan

> **For agentic workers:** Codex 개발 의무 ([feedback_dual_5agent_review] 9회차). `mcp__codex__codex sandbox=workspace-write` 로 전체 task 일괄 수행.

**Goal:** 이카운트 raw 3종 → staging 멱등 + StockTransfer 도메인 변환 + 지출결의서/입금보고서 staging + Partner aging 검증 SQL.

**Architecture:** 3-Tier (raw CSV → staging.ecount_*_raw → 도메인/검증). MIG-1 partner + MIG-2 lookup map 4종 재사용. 3 importer + 3 controller + 8 ErrorCode + V13 (inventory) + V25 (accounting) + V18 (auth).

**Tech Stack:** Spring Boot 3 / Java 17 / Postgres 16 / OpenCSV 5.9 (commons-beanutils 1.11.0) / Flyway / JdbcTemplate / Mockito / Spring AOP

---

## 작업 그룹 10 (Codex 일괄)

### Task 1: V13 Flyway inventory — staging.ecount_stock_transfer_raw

**Files:**
- Create: `services/inventory-service/src/main/resources/db/migration/V13__add_ecount_stock_transfer_staging.sql`

SQL:
- `CREATE TABLE IF NOT EXISTS staging.ecount_stock_transfer_raw (...)` — transfer_no/source_warehouse_name/destination_warehouse_name/item_name/quantity/amount/memo + file_hash VARCHAR(64) + row_no INT + PRIMARY KEY (file_hash, row_no)
- 인덱스: transfer_no / source_warehouse_name
- BaseEntity 7 audit

### Task 2: V25 Flyway accounting — staging 2표 (지출결의서/입금보고서)

**Files:**
- Create: `services/accounting-service/src/main/resources/db/migration/V25__add_ecount_mig5_staging.sql`

SQL:
- `staging.ecount_expense_voucher_raw` — slip_no/transaction_type/amount/partner_name/description + file_hash/row_no
- `staging.ecount_deposit_report_raw` — 동일 5컬럼 + file_hash/row_no
- 인덱스: partner_name / slip_no

### Task 3: V18 Flyway auth — PageCode MIG5 3종

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V18__seed_mig5_page_codes.sql`

PageCode 신규:
- `ECOUNT_MIG5_STOCK_TRANSFER`
- `ECOUNT_MIG5_EXPENSE_VOUCHER`
- `ECOUNT_MIG5_DEPOSIT_REPORT`

V18 seed:
- `INSERT INTO page_codes ... ON CONFLICT DO NOTHING` × 3
- `INSERT INTO role_page_permissions ...` × 6 (MASTER/MANAGER true, DISPATCH/MEMBER false)

### Task 4: ErrorCode MIG5 10종 (shared/common)

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java`

신규 enum 값:
- `MIG5_TRANSFER_NO_DUPLICATE(CONFLICT, "동일 source_file 내 transferNo 중복")`
- `MIG5_LOOKUP_MISS(UNPROCESSABLE_ENTITY, "lookup 키 매핑 누락 - 거래처/품목/창고 확인 필요")`
- `MIG5_WAREHOUSE_LOOKUP_MISS(UNPROCESSABLE_ENTITY, "창고명 lookup miss")`
- `MIG5_PRODUCT_LOOKUP_MISS(UNPROCESSABLE_ENTITY, "품목명 lookup miss")`
- `MIG5_LOOKUP_AMBIGUOUS(UNPROCESSABLE_ENTITY, "거래처명/창고명 중복 매칭")`
- `MIG5_AMOUNT_INVALID(UNPROCESSABLE_ENTITY, "금액 형식 불일치 또는 음수")`
- `MIG5_DATE_INVALID(BAD_REQUEST, "일자 포맷 불일치")`
- `MIG5_TRANSACTION_TYPE_INVALID(UNPROCESSABLE_ENTITY, "거래유형 값 불일치 - 지출결의서/입금보고서 외")`
- `MIG5_AGING_BALANCE_MISMATCH(UNPROCESSABLE_ENTITY, "Partner aging 잔액 ↔ 누계 합계 불일치")`
- `MIG5_CSV_HEADER_MISMATCH(UNPROCESSABLE_ENTITY, "MIG-5 CSV 헤더 불일치")`

### Task 5: EcountStockTransferImporter (inventory-service)

**Files:**
- Create: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/EcountStockTransferImporter.java`
- Create: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/EcountStockTransferImporterTest.java`

핵심 로직:
- `@Transactional(REQUIRES_NEW + READ_COMMITTED)`
- `pg_advisory_xact_lock(advisoryLockKey(NAMESPACE_STOCK_TRANSFER_UUID, SHA-256(hash)[:8]))`
- OpenCSV + EcountCsvSupport.parse → strict 7 column header + trailing empty 1개 허용
- staging `ON CONFLICT DO NOTHING`
- 출고/입고 창고명 → MIG-2 `staging.ecount_warehouse_map` lookup
- 품목명[규격] → product-service `/products/internal/by-name?name=` lookup
- 동일 transferNo 다중 raw row → 1 StockTransfer + N StockTransferLine
- `StockTransfer.draftMigration(transferNo, sourceWarehouseId, destinationWarehouseId, memo, status=CONFIRMED, externalRef)` factory 신규 (또는 raw INSERT 패턴 MIG-3/4 일관)
- soft-delete CTE 복구 (StockTransfer + StockTransferLine 양쪽)
- 금액 null 허용 (`금액(수량*입고단가)` 빈 raw 값)
- 응답 DTO: `EcountMig5ImportResult` (imported / updated / skipped / rejected + sample 20)

behavior 테스트 9 케이스 (D-MIG-5-13 의무):
- 정상 1건 적재 + N line group
- 정상 동일 transferNo 다중 line group
- MIG5_WAREHOUSE_LOOKUP_MISS (warehouse)
- MIG5_PRODUCT_LOOKUP_MISS (product)
- MIG5_AMOUNT_INVALID (음수)
- MIG5_DATE_INVALID
- multi_row_source_row_no
- BOM_INPUT
- LOOKUP_MAP_IDEMPOTENT
- rawHeaderCrossCheck (classpath fixture)
- soft_deleted_복구_CTE

### Task 6: EcountExpenseVoucherImporter (accounting-service)

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountExpenseVoucherImporter.java`
- Create: `EcountExpenseVoucherImporterTest.java`

핵심 로직:
- staging 적재만 (도메인 변환 X)
- 거래유형 = `지출결의서` 고정 검증 (`MIG5_TRANSACTION_TYPE_INVALID`)
- 거래처명 → partner-service `/internal/partners/by-name` lookup
- `validateAgainstAging()` — 거래처별 지출 누계 vs Partner aging 잔액 cross-check (JdbcTemplate)
- 응답 DTO: `imported / agingMismatchCount / agingMismatchSamples (sample 5)`

behavior 테스트 7 케이스:
- staging 적재 정상
- MIG5_TRANSACTION_TYPE_INVALID
- MIG5_LOOKUP_MISS
- MIG5_AMOUNT_INVALID
- aging_검증_PASS
- aging_검증_FAIL_MISMATCH_SAMPLE
- BOM_INPUT
- rawHeaderCrossCheck

### Task 7: EcountDepositReportImporter (accounting-service)

**Files:**
- Create: `EcountDepositReportImporter.java`
- Create: `EcountDepositReportImporterTest.java`

Task 6 동일 패턴, `NAMESPACE_DEPOSIT_UUID`, 거래유형 = `입금보고서` 고정.
- aging 회수액 cross-check
- behavior 테스트 7 케이스 (Task 6 미러)

### Task 8: 3 Controller

**Files:**
- Create: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/EcountStockTransferImportController.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountExpenseVoucherImportController.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountDepositReportImportController.java`

엔드포인트:
- `POST /admin/inventory/stock-transfers/imports/ecount`
- `POST /admin/accounting/expense-vouchers/imports/ecount`
- `POST /admin/accounting/deposit-reports/imports/ecount`

공통:
- multipart 10MB, ROLE_MASTER+ROLE_MANAGER, EcountMig5ImportResult DTO
- IT: 5 case × 3 endpoint = 15 IT parameterized (D-MIG-5-14)

### Task 9: Classpath fixture 3종 + cross-check 테스트

**Files:**
- Create: `services/inventory-service/src/test/resources/fixtures/mig5-stock-transfer.csv`
- Create: `services/accounting-service/src/test/resources/fixtures/mig5-expense-voucher.csv`
- Create: `services/accounting-service/src/test/resources/fixtures/mig5-deposit-report.csv`
- Create: `Mig5StockTransferFixtureHeaderCrossCheckTest.java` (inventory)
- Create: `Mig5AccountingFixtureHeaderCrossCheckTest.java` (accounting, 2 fixture cross-check)

각 fixture:
- 실 raw 헤더 byte-for-byte 일치 (BOM + meta row `데이터관리>` + strict header + trailing empty 1개)
- 5 row sample (정상 / lookup miss / 금액 오류 / multi-line group / 거래유형 오류)

### Task 10: 3 IT Controller (5 case × 3 endpoint parameterized)

**Files:**
- Create: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/EcountStockTransferImportControllerIT.java`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/EcountMig5AccountingImportControllerIT.java` (2 endpoint × 5 case = 10 IT parameterized)

각 IT 5 케이스:
- 200 (정상 multipart)
- 401 (미인증)
- 403 (ROLE_DISPATCH/MEMBER)
- 400 (invalid MIME)
- 422 (MIG5_CSV_HEADER_MISMATCH)

@MockBean: PartnerInternalClient / DynamicPermissionClient 등 외부 client 격리 ([feedback_it_mockbean_external_clients])

### Task 11: dev-report

**Files:**
- Create: `docs/dev-reports/ecount-mig-5-stock-expense-deposit.md`

구조 (MIG-3/4 패턴 미러):
- §1 산출 요약
- §2 결정 D-MIG-5-01~14
- §3 검증 상태 (gradle test 결과)
- §4~ 사이클 1/2/3 fix 누적

### Task 12: 문서 동기화 ([feedback_continuous_docs_sync] + [feedback_samhan_public_overview_sync])

**Files:**
- Modify: `ROADMAP.md` — MIG-5 항목 체크
- Modify: `migration/decisions/DECISIONS.md` — MIG-5 결정 D-MIG-5-XX 14건 추가
- Modify: `services/inventory-service/README.md` — MIG-5 importer anchor 추가
- Modify: `services/accounting-service/README.md` — MIG-5 importer 2종 anchor 갱신
- Modify: `docs/migration/ecount-data/README.md` — MIG-5 raw 3종 anchor 갱신
- Modify: `docs/handoff/CURRENT-WORK.md` — MIG-5 진입 + 예정 산출 (PR 발행 후 머지 결과로 갱신)
- Modify: `README.md` — MIG-5 entry 추가
- Modify: `docs/samhan-public-overview.html` — nav-badge `Phase 10.6 · MIG-5 진행 중` + progress 표 sub-task MIG-5 추가 + Phase 10.6 callout

---

## 5-team 매트릭스

| Team | Tasks | 산출 |
|---|---|---|
| **BE** | 1~10 | Flyway V13/V25/V18, 3 importer + IT, ErrorCode/PageCode, 3 controller |
| **QA** | 9, 10 | 3 fixture (raw header cross-check), 15 IT parameterized, domain integrity SQL 10건, idempotency 검증 |
| **Designer** | — | UI 미구현 (admin 화면 후속) — `fe-impact-zero.md` 명시 |
| **DevOps** | — | CI 추가 변경 없음, GitGuardian false positive 가드 확인, V13/V25/V18 Flyway 트랜잭션 안전성 |
| **Plan** (TM) | 12 | 문서 동기화 + 사이클 종합 + samhan-public-overview.html |

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
