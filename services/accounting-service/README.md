# accounting-service

## Ecount MIG-4 Importers

MIG-4는 이카운트 영업·세무 raw 4종을 `staging`에 멱등 적재하고 필요한 범위만 도메인으로 보강한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountTaxInvoiceImporter` | `POST /admin/accounting/tax-invoices/imports/ecount` | 세금계산서용 판매전표 → `TaxInvoice` OUTBOUND `MIGRATED` + `TaxInvoiceLine` |
| `EcountSalesSlipLineImporter` | `POST /admin/accounting/sales-slips/imports/ecount-line` | 판매전표 → `SalesAccountingSlipLine` 보강, 미존재 전표는 신규 `POSTED` 생성 |
| `EcountSalesPurchaseSummaryImporter` | `POST /admin/accounting/sales-purchase-summary/imports/ecount` | 매출매입내역 staging only + 일별 매출 합계 검증 |
| `EcountOrderImporter` | `POST /admin/accounting/orders/imports/ecount` | 주문서 staging only + 완료 주문서의 매출전표 연결 검증 |

공통 규칙은 MIG-3와 동일하다: `EcountCsvSupport` BOM strip, `데이터관리>` meta row, strict header, trailing empty column 1개 허용, SHA-256 `source_file_hash`, `(source_file_hash, source_row_no)` staging PK, `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock`.

## Ecount MIG-5 Importers

MIG-5는 이카운트 입출금성 raw 2종을 accounting-service staging에 보존하고 Partner aging cross-check 근거를 남긴다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountExpenseVoucherImporter` | `POST /admin/accounting/expense-vouchers/imports/ecount` | 지출결의서 staging only + 미지급 Partner aging 검증 |
| `EcountDepositReportImporter` | `POST /admin/accounting/deposit-reports/imports/ecount` | 입금보고서 staging only + 미수 Partner aging 검증 |

CashDisbursement/CashReceipt 도메인 변환은 MIG-7에서 담당한다.

## Ecount MIG-6 Importers

MIG-6는 잔여 마스터 중 accounting-service 소유 2종을 staging과 도메인 테이블로 이관한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountBankAccountImporter` | `POST /admin/accounting/bank-accounts/imports/ecount` | 통장계좌 → `bank_accounts` (`chart_account_code`, 외화 여부, 사용 여부 포함) |
| `EcountFixedAssetTypeImporter` | `POST /admin/accounting/fixed-asset-types/imports/ecount` | 고정자산유형 → `fixed_asset_types` |

공통 규칙은 MIG-5와 동일하다: SHA-256 `source_file_hash`, 1-base `source_row_no`, `REQUIRES_NEW + READ_COMMITTED`, importer별 `pg_advisory_xact_lock`, soft-delete CTE 복구, header mismatch 422.

## Ecount MIG-7 Cash Transforms

MIG-7는 MIG-5 staging에 적재된 지출결의서/입금보고서를 Cash 도메인으로 변환한다. CSV multipart upload는 없고, staging batch trigger endpoint만 제공한다.

| Transform | Endpoint | 처리 |
|---|---|---|
| `Mig7CashDisbursementTransformService` | `POST /admin/accounting/cash-disbursements/transform-from-staging` | `staging.ecount_expense_voucher_raw` → `cash_disbursements` (`EXPENSE_VOUCHER`) |
| `Mig7CashReceiptTransformService` | `POST /admin/accounting/cash-receipts/transform-from-staging` | `staging.ecount_deposit_report_raw` → `cash_receipts` (`DEPOSIT_REPORT`) |

공통 규칙: `transform_status='PENDING'`, `external_ref = source_file_hash + '-' + source_row_no`, `REQUIRES_NEW + READ_COMMITTED`, transform별 `pg_advisory_xact_lock`, soft-delete CTE 복구, `DuplicateKeyException` row-level reject, `MIG7_*` ErrorCode 422 통일.

aging snapshot + Journal 자동 생성은 MIG-9+ 후속 슬라이스로 이연한다 (D-MIG-7-04 옵션 C).

## Ecount MIG-8 Order Transform

MIG-8는 MIG-4 주문서 staging에 적재된 주문 raw를 `Order`/`OrderLine` 도메인으로 변환한다. CSV multipart upload는 없고, staging batch trigger endpoint만 제공한다.

| Transform | Endpoint | 처리 |
|---|---|---|
| `Mig8OrderTransformService` | `POST /admin/accounting/orders/transform-from-staging` | `staging.ecount_order_raw` → `orders` + `order_lines` |

공통 규칙: `transform_status='PENDING'`, 동일 `order_no` grouping, `external_ref = source_file_hash + '-' + source_row_no`, `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock`, Order/OrderLine soft-delete CTE 복구, `DuplicateKeyException` row-level reject, `MIG8_*` ErrorCode 422 통일.

`progress_status='완료'` 주문은 `SalesAccountingSlip.slip_no` cross-link를 시도한다. 매칭 실패는 reject가 아니라 `MIG8_SLIP_LINK_MISS` warning sample로 응답한다.

## Ecount MIG-9 Cash Journal + Aging Snapshot

MIG-9는 MIG-7 Cash 도메인의 `journal_id IS NULL` row를 회계 Journal로 자동 생성하고, Partner aging 조회용 materialized view를 추가한다.

| 기능 | Endpoint | 처리 |
|---|---|---|
| 지출 Journal 생성 | `POST /admin/accounting/cash-journals/generate-from-disbursements` | CashDisbursement → POSTED Journal + JournalLine 2건 |
| 입금 Journal 생성 | `POST /admin/accounting/cash-journals/generate-from-receipts` | CashReceipt → POSTED Journal + JournalLine 2건 |
| ~~Aging snapshot refresh~~ | ~~`POST /admin/accounting/aging-snapshot/refresh`~~ | **제거됨(슬1 PR #518)** — refresh **endpoint** 폐기. MV `partner_aging_snapshot` 의 `REFRESH MATERIALIZED VIEW CONCURRENTLY`는 `Mig9AgingSnapshotRefreshService`(EcountReimportService 재import wiring) 내부 lineage 로 유지 |

> ⚠️ **이카운트 네이티브 편입 슬1: 잔액 스냅샷 silo 폐기(PR #518)** — `POST /admin/accounting/aging-snapshot/refresh` 와 조회 API `GET /api/v1/accounting/aging-snapshot`(아래 MIG-14 참조)는 제거됐다. 거래처 미수/미지급 잔액은 네이티브 보고서 `GET /accounting/reports/partner-aging`(`PartnerAgingController`, journals POSTED 110/201 직접 집계)로 대체한다. MV DDL 과 `Mig9AgingSnapshotRefreshService` 는 lineage 로 유지(cutover 후 물리 제거 예정).

공통 규칙: `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock` 1 namespace, `journals(source_type, source_ref)` unique 멱등 키, `journal_no = 'J-' + slip_no`, `ROLE_MASTER`/`ROLE_MANAGER`, row-level reject, `DuplicateKeyException` constraint 분기.

기본 계정 lookup은 `ChartOfAccount.name` 기준으로 지출=`지급수수료`, 현금=`보통예금`, 매출채권=`외상매출금`을 사용한다. lookup miss는 `MIG9_DEFAULT_ACCOUNT_MISSING`, 0 이하 금액은 `MIG9_CASH_AMOUNT_INVALID`, source 중복은 `MIG9_JOURNAL_DUPLICATE`로 422 응답한다.

## Ecount MIG-10 Order Employee Cross-link + Aging Net

MIG-10은 MIG-8 Order의 `manager_name` snapshot을 user-service Employee와 연결하고, MIG-9 `partner_aging_snapshot`에 순잔액 컬럼을 추가한다.

| 기능 | Endpoint | 처리 |
|---|---|---|
| Order 담당자 Employee 연결 | `POST /admin/accounting/orders/backfill-employee-cross-link` | `manager_name` → user-service `/internal/users/by-name?name=` exact lookup 후 `manager_employee_id` backfill |
| Aging snapshot net | Flyway V30 | `net_receivable`, `net_payable`, `net_cash` 추가 + 기존 increase-only 컬럼 유지 |

공통 규칙: `REQUIRES_NEW + READ_COMMITTED`, `pg_advisory_xact_lock`, `ROLE_MASTER`/`ROLE_MANAGER`, `manager_employee_id IS NULL` 대상만 처리, lookup miss/ambiguous는 warning sample로 응답하고 NULL을 유지한다.

service-per-DB 경계상 `employees`는 user-service 소유다. V30은 `orders.manager_employee_id` UUID와 index만 추가하고 FK는 선언하지 않는다. 참조 무결성은 user-service internal lookup을 통한 application-level 검증으로 보장한다.

## Ecount MIG-11 Sales/Purchase Ledger XLSX

MIG-11은 이카운트 출력물 `매출장.xlsx`, `매입장.xlsx`를 Apache POI로 파싱해 staging에만 적재하고 `DailyClosing` 일별 합계와 대조한다.

| Importer | Endpoint | 처리 |
|---|---|---|
| `EcountSalesLedgerImporter` | `POST /admin/accounting/sales-ledger/imports/ecount` | 매출장 XLSX → `staging.ecount_sales_ledger_raw` + `closing_kind='SALES'` DailyClosing warning |
| `EcountPurchaseLedgerImporter` | `POST /admin/accounting/purchase-ledger/imports/ecount` | 매입장 XLSX → `staging.ecount_purchase_ledger_raw` + `closing_kind='PURCHASE'` DailyClosing warning |

실제 raw는 sheet 0 row 0이 `회사명 ... / 매출장|매입장` meta row이고 row 1이 strict header다. 매입장에는 합계 컬럼이 없어 `매입공급가액 + 매입부가세`로 `total_amount`를 계산한다.

공통 규칙: Apache POI `XSSFWorkbook`, SHA-256 `source_file_hash`, source Excel row number 기반 `source_row_no`, `(source_file_hash, source_row_no)` staging PK, `REQUIRES_NEW + READ_COMMITTED`, importer별 `pg_advisory_xact_lock`, footer 정확 매칭(`합계`/`총계`) skip, DailyClosing 불일치는 reject가 아닌 warning sample.

## Ecount MIG-14 Admin 조회 API

MIG-14는 MIG-7~11 결과를 desktop admin UI에서 조회하기 위한 read endpoint를 추가한다. Import/transform endpoint가 아니라 운영 조회용 API이며, DTO에는 내부 UUID를 노출하지 않는다.

| 화면군 | Endpoint | 응답 식별자 |
|---|---|---|
| ~~Cash 지출~~ | ~~`GET /api/v1/accounting/cash-disbursements`~~ | **제거됨(슬2 PR #520)** — endpoint·`CASH_PAGE_CODE`·`listCash*`·DTO(`CashDisbursementResponse`)·page-code 폐기. 현금 자료는 MIG-9 가 네이티브 journals 에 편입 → 분개장 `GET /accounting/journals`·입금매칭·원장 사용 |
| ~~Cash 입금~~ | ~~`GET /api/v1/accounting/cash-receipts`~~ | **제거됨(슬2 PR #520)** — endpoint·DTO(`CashReceiptResponse`)·page-code 폐기. 현금 자료는 네이티브 분개장/입금매칭/원장 사용 |
| Order 목록 | `GET /api/v1/accounting/orders` | `orderNo`, `partnerName`, `managerName`, `progressStatus`, `linkedSlipNo` |
| Order 상세 | `GET /api/v1/accounting/orders/{orderNo}` | `orderNo` + `lines[]`; 내부 `orderId` path 금지 |
| ~~Aging snapshot~~ | ~~`GET /api/v1/accounting/aging-snapshot`~~ | **제거됨(슬1 PR #518)** — endpoint·DTO(`PartnerAgingSnapshotResponse`, `AgingSnapshotRefreshResult`)·page-code 폐기. 거래처 잔액은 네이티브 `GET /accounting/reports/partner-aging` 사용 |
| Ledger 매출 | `GET /api/v1/accounting/ledger/sales` | staging row 업무 컬럼 + DailyClosing 대조 결과 |
| Ledger 매입 | `GET /api/v1/accounting/ledger/purchase` | staging row 업무 컬럼 + DailyClosing 대조 결과 |

권한은 auth-service MIG14 PageCode 와 desktop `PermissionGuard`를 사용한다(`ECOUNT_MIG14_AGING_SNAPSHOT` enum 값은 슬1 PR #518에서, `ECOUNT_MIG14_CASH_LIST` enum 값은 슬2 PR #520에서 제거 — V59/V60 마이그가 권한 행을 정리한다). `DynamicPermissionClient` 테스트 mock은 deprecated service-local 타입 대신 shared/security 통합 인터페이스를 대상으로 정렬한다.

> ⚠️ **lineage 유지** — Cash 조회 endpoint·DTO 는 제거됐으나 `CashDisbursement`/`CashReceipt` 도메인·`cash_*` 테이블·MIG-7 transform(`/transform-from-staging`)·MIG-9 cash-journal 생성(`/cash-journals/generate-from-*`)은 보존된다(cutover 후 물리 제거). 현금 자료는 이 계보로 네이티브 journals 에 편입되어 분개장/입금매칭/원장으로 노출된다.

## 공급자 설정 확장 — 연락처·입금계좌(노출 토글)·인감·로고 (PR #459)

회계 > 공급자 설정(`SupplierProfile`, 구 '사업자 양식')이 인쇄 양식(거래명세서/세금계산서 등)의 공급자 정보 단일 출처가 된다. desktop 인쇄 뷰의 `COMPANY` 하드코딩 상수와 `VITE_COMPANY_*` env 주입을 본 API 가 대체한다.

| 항목 | 내용 |
|---|---|
| V35 | `supplier_profiles` +`tel`/`fax`/`stamp_png`(BYTEA)/`stamp_hash`/`logo_png`(BYTEA)/`logo_hash`, `supplier_bank_accounts` 신규 (7 audit + soft delete, replace-all, `exposed BOOLEAN DEFAULT TRUE`) |
| 인감/로고 | `PUT·DELETE /accounting/supplier-profiles/{id}/stamp` 및 `/{id}/logo` (base64 + PNG magic + SHA-256 검증, ≤200KB, `@Size` base64 상한) — `accounting.supplier-profiles` UPDATE |
| 인쇄 전용 | `GET /accounting/supplier-profiles/print-profile` — **인증-only** (사내 전 role 인쇄 허용, 권한 게이트 없음). 노출(`exposed=true`) 계좌만 + 인감/로고 base64. **외부 파트너(X-Is-Partner: true)는 403** |
| 응답 | 목록 = `bankAccounts[]` 포함 + `hasStamp`/`hasLogo` (stamp/logo base64 만 경량화, `SupplierProfileSummary` projection 으로 BYTEA hydrate 차단) / 상세 `GET /{id}`·`/primary` = base64 포함 전체 |
| 동시성 | 계좌 replace-all 은 `findByIdForUpdate`(PESSIMISTIC_WRITE) 로 보호 |
| 발행 일원화 | `TaxInvoiceService` 인쇄 공급자 블록 = primary `SupplierProfile` 우선, 부재 시 `CompanyProperties`(app.company.*) fallback |

⚠️ 계좌 실데이터·실인감·실로고는 public repo 비커밋 — 운영 환경에서 공급자 설정 화면으로 직접 입력한다.

## 입금자명↔거래처 자동 매핑 (PR #829, #810)

통장거래(입금)의 입금자명을 거래처에 한 번 지정하면 기억하여 이후 동일 입금자명을 자동 매칭한다. dev-report [`docs/dev-reports/2026-07-17-810-bank-depositor-partner-mapping.md`](../../docs/dev-reports/2026-07-17-810-bank-depositor-partner-mapping.md).

| 항목 | 내용 |
|---|---|
| V57~V60 | mapping 테이블 + `bank_transaction` provenance(`partner_match_source`·`matched_mapping_id`·snapshot·`partner_matched_at/by`) + snapshot CHECK(V60 NULL-safe CASE 완결) + `partner_code` snapshot |
| 엔티티 | `BankDepositorPartnerMapping` (`UNIQUE(normalized_name) WHERE NOT is_deleted` + INSERT ON CONFLICT 원자 upsert), `DepositorNameNormalizer`(trim+공백축약+Locale.ROOT 대문자) |
| 관리 CRUD | `/accounting/deposit-mappings` (GET·POST·PUT·DELETE `?normalizedName=`·GET `/history`) — `accounting.deposit-mapping` VIEW/CREATE/UPDATE/DELETE, business key(UUID 비공개), append-only 이력(entityId 전 필드·단일 timestamp·opaque entryKey) |
| 학습 | 인간기원만(match-partner·CRUD, `deposit-mapping:UPDATE` 보유 시)·입금(DEPOSIT)+입금성 source 한정. import/CODEF/KFTC resolver read-only(자기강화 차단) |
| 자동적용 | 활성 매핑 > partnerCode 정확일치(활성 검증) > 미매칭. stale(비활성 거래처)·lookup UNAVAILABLE(일시장애)은 폴백 없이 미매칭 보류(거래는 UNMATCHED로 영속화, 매칭만 보류) |
| 권한 | 단건 배정=`accounting.bank-matching:UPDATE` · 매핑 삭제="이 거래만 해제"(clear) vs "매핑도 삭제"(clear-and-delete-mapping, `deposit-mapping:DELETE`). SYSTEM MASTER 내부 게이트 bypass(게이트웨이 `X-Is-System-Master` 단일권위) |
| lookup | `PartnerLookupClient` FOUND/NOT_FOUND/UNAVAILABLE 3분류 — UNAVAILABLE(5xx/네트워크/파싱)은 stale 오염 없이 매칭 보류·재시도 |
| 동시성 | normalized key `pg_advisory_xact_lock`(64bit hashtextextended·정렬획득) create/update/delete/learn 대칭 |

후속 이슈: #830(멀티인스턴스 revision) · #831(pre-#810 lookup 붕괴 계열·tax invoice HIGH) · #832(mock parity·감사 정밀도·BOM).

## #825 슬5 CODEF null-semantics

`user_codef_import_scope.scope_mode`(V64)은 저장된 `ALL`과 `SELECTED`를 구별한다. 기존 행은
근거 없는 `ALL` 추정 대신 `SELECTED`로 backfill하며, 컬럼 기본값도 `SELECTED`로 유지해 V64
적용 후 구버전 앱 롤백 중 신규 INSERT가 `23502`로 실패하지 않게 한다. 저장 기반 import는
`scopeMode=ALL`이면 요청의 `type` 카테고리만 CODEF에서 열거하고, `SELECTED`이면 저장 ref를
사용한다. 서비스는 두 모순 방향과 null/invalid mode를 독립적으로 거부한다.

### #920 CODEF scope 낙관적 잠금 (2026-07-25)

`PUT /accounting/codef/scopes`는 조회 당시 `version`을 받는다. 미저장 첫 저장은 `null`, 기존 행은
GET 또는 직전 PUT 응답의 버전을 보내야 하며, 현재 행과 다르면 `409 CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT`
로 거부한다. 충돌 시 저장 retry를 하지 않아 기존 전체 교체 선택을 보존하고, 응답의 증가한 버전으로
같은 화면의 즉시 재저장을 허용한다. V66은 기존 행을 버전 0으로 초기화한다. 데스크톱과 mock은
409 최신 선택 재조회·명시적 재선택 계약을 공유한다.

⚠️ **배포 순서 제약 — 무조건적 하위호환이 아니다**: `version`을 모르는 구버전 데스크톱(#920 이전
빌드)이 기존 행에 PUT하면 요청에 `version` 필드 자체가 없어 현재 버전(0)과 불일치로 간주되어 항상
409로 거부된다(영구, 업그레이드 전까지 — `UserCodefImportScopeService.verifyVersion`의
`requestedVersion == null` 분기는 의도된 계약이며 바꾸지 않는다. 회귀 가드:
`UserCodefImportScopeServiceTest.missingVersionFieldOnExistingRowRejectedWith409`). 개발책임자
결정(2026-07-25): 배포 순서로 이 창을 없앤다 — ① 데스크톱 forceLevel=CRITICAL 강제 업데이트
(비해제 차단 모달 — `clients/desktop/src/renderer/version/versionCheck.ts:62-63`의
`forceLevel==='CRITICAL'` → `kind:'blocking'` 경로가 구버전 사용 자체를 막는다) 선행 → ②
그 뒤에만 accounting-service를 배포한다. 상세: `docs/dev-reports/2026-07-25-920-codef-scope-optimistic-lock.md`.
