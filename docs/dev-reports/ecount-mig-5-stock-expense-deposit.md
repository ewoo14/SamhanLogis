# MIG-5 이카운트 창고이동·지출결의서·입금보고서 raw 3종 마이그레이션 — dev-report

> 작성일: 2026-05-20
> spec: [2026-05-20-ecount-mig-5-stock-expense-deposit-design.md](../superpowers/specs/2026-05-20-ecount-mig-5-stock-expense-deposit-design.md)
> plan: [2026-05-20-ecount-mig-5-stock-expense-deposit.md](../superpowers/plans/2026-05-20-ecount-mig-5-stock-expense-deposit.md)
> branch: `spec/2026-05-20-mig-5-stock-expense-deposit`

---

## 1. 산출 요약

| 항목 | 결과 |
|---|---|
| Flyway | inventory V13 `staging.ecount_stock_transfer_raw`; accounting V25 `staging.ecount_expense_voucher_raw` / `staging.ecount_deposit_report_raw`; auth V18 MIG5 PageCode seed |
| shared/common | ErrorCode MIG5 8종 + `EcountMig5ImportResult` / `EcountMig5ImportSupport` |
| importer | `EcountStockTransferImporter`, `EcountExpenseVoucherImporter`, `EcountDepositReportImporter` |
| controller | `POST /admin/inventory/stock-transfers/imports/ecount`, `/admin/accounting/expense-vouchers/imports/ecount`, `/admin/accounting/deposit-reports/imports/ecount` |
| fixture/test | `fixtures/mig5-*.csv` 3종 + header cross-check + behavior test + controller IT |

---

## 2. 결정

- D-MIG-5-01: 3 raw는 한 PR 통합으로 처리한다.
- D-MIG-5-02: 창고이동은 기존 `StockTransfer` + `StockTransferLine` 도메인으로 변환하고 status는 `CONFIRMED`로 적재한다.
- D-MIG-5-03: 지출결의서/입금보고서는 staging only로 두고 cash 도메인 신설은 후속으로 둔다.
- D-MIG-5-04: 거래처/품목/창고 lookup miss는 silent fallback 없이 `MIG5_LOOKUP_MISS`로 reject 한다.
- D-MIG-5-05: staging 멱등 키는 SHA-256 `source_file_hash` + 1-base `source_row_no` 복합 PK로 둔다.
- D-MIG-5-06: 3 importer는 서로 다른 `pg_advisory_xact_lock` namespace를 사용한다.
- D-MIG-5-07: StockTransfer/Line 도메인 복구는 soft-delete CTE 패턴을 적용한다.
- D-MIG-5-08: admin UI는 후속 슬라이스로 둔다.
- D-MIG-5-09: auth-service V18에 MIG5 PageCode 3종 권한 seed를 추가한다.
- D-MIG-5-10: shared/common에 MIG5 ErrorCode 8종을 추가한다.
- D-MIG-5-11: PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다.
- D-MIG-5-12: footer는 빈 footer만 skip하고, 빈 일자 + nonblank 금액/내용은 `MIG5_DATE_INVALID`로 reject 한다.
- D-MIG-5-13: importer behavior 테스트를 처음부터 작성해 MIG-4 회고를 반영한다.
- D-MIG-5-14: controller IT는 endpoint별 multipart/권한/header mismatch 케이스를 parameterized로 유지한다.

---

## 3. 검증 상태

- 지정 검증 명령은 Gradle wrapper가 배포본을 다운로드하려다 sandbox 네트워크 제한으로 실패했다: `Permission denied: getsockopt`.
- 캐시된 Gradle 8.10.2 직접 실행 + `--offline`도 plugin classpath 의존성 캐시 부재로 구성 실패했다.
- 사용자 지시 조건에 따라 commit/push는 보류한다.
- 사이클 1c 기준 로컬 Windows Docker Desktop npipe 한계로 Testcontainers IT는 skip될 수 있다. Linux CI에서는 MIG-5 controller IT 27/27 PASS로 검증되었다.
- 사이클 1c fix 후 동일 검증 명령을 재시도했으나 wrapper 배포본 다운로드가 sandbox 네트워크 제한으로 실패했다. 캐시된 Gradle 8.10.2 직접 실행도 offline classpath 캐시 부재로 `dependency-management-plugin-1.1.6.jar` 등을 resolve하지 못해 실패했다.

```powershell
.\gradlew.bat :services:inventory-service:test :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon
```

---

## 4. Codex cycle 1

- V13/V25/V18 Flyway와 MIG5 ErrorCode/PageCode를 추가했다.
- StockTransfer domain 변환 importer와 accounting staging-only importer 2종을 추가했다.
- classpath fixture 3종, header cross-check, behavior test, controller IT를 추가했다.
- README/ROADMAP/DECISIONS/handoff/samhan-public-overview 문서를 MIG-5 진행 상태로 동기화했다.
