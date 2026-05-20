# MIG-3 이카운트 회계 전표 4종 마이그레이션 — dev-report

> 작성일: 2026-05-20
> spec: [2026-05-20-ecount-mig-3-voucher-design.md](../superpowers/specs/2026-05-20-ecount-mig-3-voucher-design.md)
> plan: [2026-05-20-ecount-mig-3-voucher.md](../superpowers/plans/2026-05-20-ecount-mig-3-voucher.md)
> branch: `spec/2026-05-20-mig-3-voucher`

---

## 1. 산출 요약

| 항목 | 결과 |
|---|---|
| Flyway | accounting V23 `staging.ecount_purchase_slip_raw` / `sales_slip_raw` / `general_voucher_raw` / `journal_entry_raw`, auth V16 MIG3 PageCode seed |
| shared/common | ErrorCode MIG3 5종 + `EcountCsvSupport.computeMd5FileHash` |
| importer | `EcountPurchaseSlipImporter`, `EcountSalesSlipImporter`, `EcountGeneralVoucherImporter`, `EcountJournalEntryImporter` |
| controller | `POST /admin/accounting/purchase-slips/imports/ecount`, `/sales-slips/imports/ecount`, `/general-vouchers/imports/ecount`, `/journal-entries/imports/ecount` |
| lookup | partner-service `/internal/partners/by-name?name=` 재사용, 회계전표분개 계정명은 `staging.ecount_account_map.account_name → account_uuid` 역방향 lookup |
| 응답 | `EcountVoucherImportResult` — UUID 없이 `slipNo` / `journalNo` / partner/account raw sample 중심 |
| fixture | `voucher-purchase.csv`, `voucher-sales.csv`, `voucher-general.csv`, `voucher-journal-entry.csv` 4종 classpath header cross-check |

---

## 2. 결정

- D-MIG-3-01: 4 raw는 단일 통합 PR로 묶는다.
- D-MIG-3-02: 멱등 키는 `source_file_hash(MD5)` + `source_row_no(1-base)` staging PK로 둔다.
- D-MIG-3-03: 4 importer 모두 `REQUIRES_NEW + READ_COMMITTED`와 `pg_advisory_xact_lock` 4 namespace를 사용한다.
- D-MIG-3-04: `EcountCsvSupport`의 BOM strip, `데이터관리>` meta row, strict header, advisory lock, max length guard를 재사용한다.
- D-MIG-3-05: 거래처/계정 lookup miss는 silent fallback 없이 `MIG3_LOOKUP_MISS` sample reject로 보고한다.
- D-MIG-3-06: 일반전표는 raw 차/대 정보가 없어 Journal `DRAFT`로 유지한다.
- D-MIG-3-07: 회계전표분개는 journalNo 그룹별 차/대 합계가 일치하면 `POSTED`, 불일치하면 `DRAFT` + `MIG3_JOURNAL_BALANCE_MISMATCH` warning으로 보고한다.
- D-MIG-3-08: soft-deleted domain row는 insert 전 `WITH restored AS (...)` CTE로 복구한다.

---

## 3. 검증 상태

- TDD RED 테스트 추가: 매입전표 importer, 회계전표분개 importer, 4 fixture header cross-check, ErrorCode MIG3, PageCode MIG3.
- 로컬 Gradle 실행은 네트워크 제한으로 미완료:
  - wrapper 배포본 다운로드: `Permission denied: getsockopt`
  - 캐시된 Gradle 직접 실행: plugin classpath 의존성 미캐시로 `--offline` 실패
- 실행 가능 환경에서 아래 명령 재검증 필요:

```powershell
.\gradlew.bat :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon
```
