# Ecount MIG-9 Cash → Journal 자동 생성 + Partner aging snapshot

> 2026-05-20 / branch `spec/2026-05-20-mig-9-cash-journal-aging`

## 범위

- accounting-service V29: `journals.source_ref`, `journals(source_type, source_ref)` unique, `partner_aging_snapshot` MATERIALIZED VIEW.
- auth-service V22: `ecount.mig9.cash-journal.disbursement`, `ecount.mig9.cash-journal.receipt` PageCode seed.
- shared/common: MIG9 ErrorCode 5종 + `EcountMig9JournalResult`.
- service/controller: CashDisbursement/CashReceipt → POSTED Journal + JournalLine 2건, aging snapshot refresh.

## 구현 메모

- 지출: 차변 `지급수수료`, 대변 `보통예금`.
- 입금: 차변 `보통예금`, 대변 `외상매출금`.
- ChartOfAccount lookup은 `name` + `is_leaf=true` 기준이며 miss는 `MIG9_DEFAULT_ACCOUNT_MISSING` sample로 응답한다.
- `journal_no`는 CashDisbursement `JD-` + `slip_no`, CashReceipt `JR-` + `slip_no`로 분리하며, 기존 20자 제한을 cash slip 번호 수용을 위해 40자로 확장했다.
- 동시성은 `REQUIRES_NEW + READ_COMMITTED`와 `pg_advisory_xact_lock` 단일 namespace로 제어한다.
- `DuplicateKeyException`은 `journals_source_type_ref_uk` constraint 명칭일 때만 `MIG9_JOURNAL_DUPLICATE`로 흡수한다.
- `REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot`은 `Propagation.NEVER`로 트랜잭션 밖에서 실행한다.
- `partner_aging_snapshot.total_receivable` 등 4개 금액 컬럼은 본 슬라이스에서 increase-only 누계로 정의한다. net 잔액(`debit - credit`) view 보정은 MIG-10+ 후속 슬라이스로 이연한다.
- Controller IT는 controller-service 권한/오류 계약 검증에 한정한다(`@MockBean Mig9CashJournalService`, `@MockBean Mig9AgingSnapshotRefreshService`). Flyway V29 + MATERIALIZED VIEW end-to-end 검증은 후속 슬라이스 또는 별도 IT에서 다룬다.

## 검증

- `shared:common` MIG9 ErrorCode 테스트 통과.
- `services:accounting-service` MIG9 대상 테스트 통과.
- 최종 검증 명령:
  - `./gradlew.bat :shared:common:test :services:auth-service:test :services:accounting-service:test --no-daemon`

## 이연

- Employee cross-link(D-MIG-8-05)는 MIG-10+로 유지한다.
- Partner aging snapshot 조회 화면은 후속 슬라이스에서 연결한다.
