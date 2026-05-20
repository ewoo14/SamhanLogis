# MIG-4 이카운트 영업·세무 raw 4종 마이그레이션 — dev-report

> 작성일: 2026-05-20
> spec: [2026-05-20-ecount-mig-4-sales-tax-invoice-design.md](../superpowers/specs/2026-05-20-ecount-mig-4-sales-tax-invoice-design.md)
> plan: [2026-05-20-ecount-mig-4-sales-tax-invoice.md](../superpowers/plans/2026-05-20-ecount-mig-4-sales-tax-invoice.md)
> branch: `spec/2026-05-20-mig-4-sales-tax-invoice`

---

## 1. 산출 요약

| 항목 | 결과 |
|---|---|
| Flyway | accounting V24 `staging.ecount_tax_invoice_raw` / `ecount_sales_slip_line_raw` / `ecount_sales_purchase_summary_raw` / `ecount_order_raw`, `sales_accounting_slips.due_date`; auth V17 MIG4 PageCode seed |
| shared/common | ErrorCode MIG4 9종 |
| importer | `EcountTaxInvoiceImporter`, `EcountSalesSlipLineImporter`, `EcountSalesPurchaseSummaryImporter`, `EcountOrderImporter` |
| controller | `POST /admin/accounting/tax-invoices/imports/ecount`, `/sales-slips/imports/ecount-line`, `/sales-purchase-summary/imports/ecount`, `/orders/imports/ecount` |
| 응답 | `EcountMig4ImportResult` — UUID 없이 business key, reject sample, mismatch sample 중심 |
| fixture/test | `fixtures/mig4-*.csv` 4종 + `Mig4FixtureHeaderCrossCheckTest` + MIG-4 controller IT |

---

## 2. 결정

- D-MIG-4-01: 4 raw는 한 PR 통합으로 처리한다.
- D-MIG-4-02: 세금계산서용 판매전표는 `TaxInvoice` OUTBOUND + `TaxInvoiceLine` 으로 이관한다.
- D-MIG-4-03: 판매전표는 `SalesAccountingSlipLine` 보강으로 처리하고, 전표가 없으면 신규 `SalesAccountingSlip`을 생성한다.
- D-MIG-4-04: `TaxInvoiceStatus.MIGRATED`를 추가한다. DB는 `VARCHAR(20)` 상태 컬럼이라 별도 Postgres enum V25는 불필요하다.
- D-MIG-4-05: 매출매입내역은 staging only + 검증 SQL로 처리한다.
- D-MIG-4-06: 주문서는 staging only + 검증 SQL로 처리하고 Order 도메인 변환은 후속으로 둔다.
- D-MIG-4-07: 매출장/매입장 xlsx는 본 슬라이스 변환 대상에서 제외하고 DailyClosing 대조는 후속으로 둔다.
- D-MIG-4-08: lookup miss는 silent fallback 없이 `MIG4_LOOKUP_MISS` reject로 보고한다.
- D-MIG-4-09: staging 멱등 키는 SHA-256 `source_file_hash` + 1-base `source_row_no` 복합 PK로 둔다.
- D-MIG-4-10: 4 importer는 서로 다른 `pg_advisory_xact_lock` namespace를 사용한다.
- D-MIG-4-11: admin UI는 후속 슬라이스로 둔다.
- D-MIG-4-12: auth-service V17에 MIG4 PageCode 4종 권한 seed를 추가한다.
- D-MIG-4-13: shared/common에 MIG4 ErrorCode 9종을 추가한다.
- D-MIG-4-14: PM 자동시작 범위로 spec → plan → Codex 개발을 진행한다.
- D-MIG-4-15: 주문서 5분할 파일은 동일 importer를 file hash 별로 5회 실행하는 방식으로 처리한다.

---

## 3. 검증 상태

- 로컬 Gradle wrapper 최초 실행은 네트워크 제한으로 배포본 다운로드가 차단됨: `Permission denied: getsockopt`.
- 캐시된 Gradle 8.10.2 직접 실행은 가능했지만 plugin classpath 의존성이 캐시되어 있지 않아 `--offline` 구성 실패.
- 네트워크 접근 가능한 환경에서 아래 명령 재실행 필요:

```powershell
.\gradlew.bat :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon
```

---

## 4. Codex cycle 1

- V24 staging 4표와 `sales_accounting_slips.due_date` nullable 보강 추가.
- TaxInvoice/SalesSlipLine/Summary/Order importer와 controller 4종 추가.
- 실 raw 헤더와 같은 classpath fixture 4종 및 header cross-check 추가.
- `services/accounting-service/README.md`, `ROADMAP.md`, `DECISIONS.md`, `docs/migration/ecount-data/README.md` 동기화.
