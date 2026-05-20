# MIG-9 Cash → Journal 자동 생성 + Partner aging snapshot view — Implementation Plan

> Codex `mcp__codex__codex sandbox=workspace-write`.

**Goal:** CashDisbursement/CashReceipt → Journal 자동 생성 + partner_aging_snapshot MATERIALIZED VIEW (D-MIG-7-04 옵션 C 이연 처리).

---

## 작업 그룹 14 (Codex 일괄)

### Task 1: V29 Flyway accounting

`services/accounting-service/src/main/resources/db/migration/V29__add_cash_journal_aging_snapshot.sql`:

- `ALTER TABLE journals ADD CONSTRAINT journals_source_type_ref_uk UNIQUE (source_type, source_ref)` (IF NOT EXISTS)
- `partner_aging_snapshot` MATERIALIZED VIEW 신규 (spec §6 SQL)
- `CREATE UNIQUE INDEX idx_partner_aging_snapshot_partner_id ON partner_aging_snapshot (partner_id)`
- `cash_disbursements.journal_id` / `cash_receipts.journal_id` 컬럼 NOT NULL 제약 추가 시도 (현재 NULL → 본 슬라이스 후 NOT NULL 변경) — 옵션, 안전 마지막 ALTER

### Task 2: JournalSourceType enum 확장

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/JournalSourceType.java` — `CASH_DISBURSEMENT`, `CASH_RECEIPT` 신규 enum 값 추가.

### Task 3: V22 auth PageCode MIG9 2종

`ECOUNT_MIG9_CASH_JOURNAL_DISBURSEMENT` / `ECOUNT_MIG9_CASH_JOURNAL_RECEIPT` + role_page_permissions 4건.

### Task 4: ErrorCode MIG9 5종 (shared/common)

(spec §9)

### Task 5: Mig9CashJournalService + 단위 테스트 11 cases

- `@Transactional(REQUIRES_NEW + READ_COMMITTED)` + advisory lock
- `cash_disbursements` 의 `journal_id IS NULL` batch + `cash_receipts` 의 `journal_id IS NULL` batch
- 각 cash row 별 Journal 자동 생성:
  - `Journal.fromCashDisbursement(cd)` factory 신규 (또는 별도 Mig9JournalFactory)
  - ChartOfAccount default lookup (지출 / 현금 / 매출채권 / 외상매입금) — `MIG9_DEFAULT_ACCOUNT_MISSING` reject
  - JournalLine 2건 (차/대 균형)
- Journal save → `cash.linkJournal(journalId)` 호출
- DuplicateKeyException catch (source_type + source_ref UNIQUE 위반)
- 응답 DTO `EcountMig9JournalResult` (cash_disbursement_journals_created / cash_receipt_journals_created / rejected + sample 20)

behavior 단위 테스트 11 케이스 (D-MIG-9-12):
- 정상 CashDisbursement 1건 → Journal + JournalLine 2 생성
- 정상 CashReceipt 1건
- journal_id 가 이미 set 된 cash row 는 skip (멱등)
- MIG9_CASH_ROW_NOT_FOUND
- MIG9_DEFAULT_ACCOUNT_MISSING (chart_of_accounts seed 부재)
- MIG9_CASH_AMOUNT_INVALID
- MIG9_JOURNAL_DUPLICATE (race window)
- multi_row_source_row_no
- DuplicateKeyException_catch
- JournalLine_차대_균형_검증
- cash.journal_id_갱신_검증

### Task 6: aging snapshot refresh service

- `Mig9AgingSnapshotRefreshService.refresh()` — `REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot` 호출
- `@Transactional(propagation=NEVER)` (CONCURRENTLY 트랜잭션 외 실행)
- `MIG9_AGING_REFRESH_FAILED` 예외 처리

### Task 7: 2 Controller

- `POST /admin/accounting/cash-journals/generate-from-disbursements` — CashDisbursement → Journal batch
- `POST /admin/accounting/cash-journals/generate-from-receipts` — CashReceipt → Journal batch
- `POST /admin/accounting/aging-snapshot/refresh` (옵션, 본 슬라이스에 추가 가능)

multipart 없음 + ROLE_MASTER+MANAGER + `EcountMig9JournalResult` DTO

### Task 8: 10 IT parameterized (D-MIG-9-13)

- 5 case (200/401/403/400/422) × 2 endpoint = 10 IT
- @MockBean 외부 client

### Task 9: dev-report

`docs/dev-reports/ecount-mig-9-cash-journal-aging.md`

### Task 10: 문서 동기화

- ROADMAP / DECISIONS / accounting-service README / root README / handoff / overview HTML (nav-badge MIG-9 진행 중)

---

## 검증 + commit + push 의무

```
cd C:/dev/SamhanLogis
./gradlew.bat :shared:common:test :services:auth-service:test :services:accounting-service:test --no-daemon
```

BUILD SUCCESSFUL 후 commit (한국어):

```
feat(mig-9): Cash → Journal 자동 생성 + Partner aging snapshot view (D-MIG-7-04 이연 처리)

- JournalSourceType.CASH_DISBURSEMENT / CASH_RECEIPT 신규 enum
- journals(source_type, source_ref) UNIQUE INDEX 추가 (V29 accounting)
- partner_aging_snapshot MATERIALIZED VIEW 신규 + REFRESH CONCURRENTLY
- Mig9CashJournalService (CashDisbursement/Receipt → Journal + JournalLine 2건 차대 균형)
- ChartOfAccount default lookup (지급수수료/보통예금/외상매출금/외상매입금) + MIG9_DEFAULT_ACCOUNT_MISSING reject
- ErrorCode MIG9 5종 + PageCode MIG9 2종 (V22 auth)
- pg_advisory_xact_lock 1 namespace + REQUIRES_NEW
- 멱등: journal_id 가 set 된 cash row 는 skip
- 단위 테스트 11 cases + 10 IT parameterized (D-MIG-9-12/13)
- Employee cross-link (D-MIG-8-05) 은 MIG-10+ 이연
```

push: `origin spec/2026-05-20-mig-9-cash-journal-aging`

git add 권한 거부 시 변경만 보고. Claude 가 commit + push.
