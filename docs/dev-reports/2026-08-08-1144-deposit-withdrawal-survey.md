# 이슈 #1144 추가분 — 입금보고서·출금 현행 전수 조사

> 조사일: 2026-08-08  
> 실데이터 측정 시각: 2026-08-08 22:56:51 KST  
> 범위: 저장소 코드·Flyway 스키마·실행 중 `samhan-postgres`의 `accounting_db`·`partner_db`·`auth_db`  
> 방식: `BEGIN TRANSACTION READ ONLY` 안의 `SELECT`만 실행. 코드 수정, DB 쓰기, `git`, Docker 재기동·재배포 없음.

## 0. 결론

1. 현행 입금보고서는 데스크톱 화면, CRUD/확정/취소 API, `cash_receipts` 테이블, 권한 코드, 확정 시 자동 분개 게시까지 존재한다.
2. 입금보고서는 개별 매출전표에 배분하지 않는다. 확정 금액을 거래처별 외상매출금 계정의 대변에 그대로 기록하여 거래처 총채권을 줄인다.
3. 현행 출금 원천행은 `bank_transaction`에 151건 존재하지만 전부 미반영이다. 같은 화면에서 거래처를 지정할 수 있는 `matched_partner_id` 필드는 존재하나 실측 지정 건수는 0건이다.
4. 출금보고서 화면·현행 CRUD/확정 API·권한 코드는 없다. 구형 이카운트 이관 계보인 `cash_disbursements` 테이블/엔티티/관리자 변환·분개 배치만 남아 있고 실데이터는 0건이다. 따라서 현행 출금보고서가 구현됐다고 판정할 수 없다.
5. 구형 `CashDisbursement` 분개도 채무 계정 차변이 아니라 지급수수료 차변/보통예금 대변이다. 매입채무 소멸과 연결되지 않는다.
6. 우리 회사법인은 거래처 마스터에 1건 있다. 회계 공급자 프로필의 사업자번호와 동일한 거래처를 대조해 확정했다. 다만 `is_self`, `internal` 같은 자기 자신 구분 필드는 없다.

---

## 1. 입금보고서 — 지금 무엇을 하는가

### 1.1 화면 경로

| 기능 | 현행 경로 | 근거 |
|---|---|---|
| 목록 | `/accounting/admin/cash-receipts` | `clients/desktop/src/renderer/routes/index.tsx:1250-1254` |
| 상세 | `/accounting/admin/cash-receipts/:id` | `clients/desktop/src/renderer/routes/index.tsx:1270-1274` |
| 편집 | `/accounting/admin/cash-receipts/:id/edit` | `clients/desktop/src/renderer/routes/index.tsx:1262-1266` |
| 신규 수기 작성 | 화면 진입점 없음. `/new`는 목록으로 리다이렉트 | `clients/desktop/src/renderer/routes/index.tsx:1258-1259`, `clients/desktop/src/renderer/routes/CashReceiptListPage.tsx:262-275` |
| 통장거래에서 생성 | `/accounting/bank-transactions`의 선택 입금 → `입금보고서 생성` | `clients/desktop/src/renderer/routes/index.tsx:859-863`, `clients/desktop/src/renderer/routes/BankTransactionPage.tsx:770-773`, `:1110-1152` |
| 사이드바 | `입금보고서` | `clients/desktop/src/renderer/components/AppLayout.tsx:1237-1243` |

판정: 목록·상세·편집 화면은 있다. 수기 생성 API는 있으나 신규 수기 작성 화면은 현재 막혀 있다. 통장연계 생성은 입출금 내역 화면에서 제공된다.

### 1.2 API

기본 경로는 `/accounting/cash-receipts`이다(`CashReceiptController.java:42-48`).

| 동작 | API | 권한 액션 | 근거 |
|---|---|---|---|
| 수기 생성(DRAFT) | `POST /accounting/cash-receipts` | `CREATE` | `CashReceiptController.java:53-60` |
| 통장 입금 N건 생성·즉시 확정 | `POST /accounting/cash-receipts/from-bank-transactions` | `UPDATE` | `CashReceiptController.java:63-86` |
| 목록 | `GET /accounting/cash-receipts` | `VIEW` | `CashReceiptController.java:89-105` |
| 단건 | `GET /accounting/cash-receipts/{id}` | `VIEW` | `CashReceiptController.java:108-113` |
| 수정 | `PATCH /accounting/cash-receipts/{id}` | `UPDATE` | `CashReceiptController.java:116-138` |
| 확정 | `POST /accounting/cash-receipts/{id}/confirm` | `UPDATE` | `CashReceiptController.java:141-156` |
| 취소 | `POST /accounting/cash-receipts/{id}/cancel` | `UPDATE` | `CashReceiptController.java:159-178` |
| 초안 삭제 | `DELETE /accounting/cash-receipts/{id}` | `DELETE` | `CashReceiptController.java:181-190` |

화면의 경로 식별에는 내부 UUID가 쓰이지만 사용자 표시 식별자는 전표번호와 거래처명이다(`CashReceiptController.java:108-112`).

### 1.3 테이블과 스키마

정본 테이블은 `accounting_db.public.cash_receipts`다.

- 최초 컬럼: `id`, `slip_no`, `partner_id`, `amount`, `transaction_date`, `kind`, `memo`, `journal_id`, `external_ref`와 BaseEntity 7개 감사 컬럼. 근거: `V27__add_cash_disbursement_receipt.sql:35-55`.
- 후속 컬럼: `status`, `debit_account_code`, `credit_account_code`, `version`. 근거: `V48__cash_receipt_live_domain.sql:8-15`, `CashReceipt.java:57-91`.
- 취소 역분개 연결: `reverse_journal_id`. 근거: `V50__cash_receipt_reverse_journal.sql:1-5`.
- 거래처별 분할 행: `lines_json JSONB`. 근거: `V68__add_cash_receipt_lines_json.sql:1-6`.
- `lines_json` 한 행의 저장 항목: 내부 거래처 식별자, 거래처 코드, 사업자번호, 거래처명, 금액, 적요. 근거: `CashReceiptService.java:624-625`.
- 요청에는 거래처 코드/사업자번호/거래처명, 총액, 거래일, 적요, 차변·대변 계정 코드, 분할 행이 들어간다. 근거: `CashReceiptRequest.java:10-40`, `CashReceiptLineRequest.java:7-13`.

### 1.4 실데이터 행 수

| 상태 | 유형 | 활성 행 | 금액 합계 | 분개 연결 |
|---|---:|---:|---:|---:|
| DRAFT | MANUAL_RECEIPT | 27 | 83,550 | 0 |
| CONFIRMED | MANUAL_RECEIPT | 1 | 77,000 | 1 |
| CONFIRMED | BANK_LINKED | 2 | 200,000 | 2 |
| CANCELLED | MANUAL_RECEIPT | 6 | 2,026,456 | 원분개 3 / 역분개 3 |
| CANCELLED | BANK_LINKED | 15 | 2,513,579 | 원분개 15 / 역분개 15 |
| **활성 합계** |  | **51** | **4,900,585** |  |

- soft-delete 포함 전체 행: 60건. 삭제된 9건은 모두 DRAFT/MANUAL_RECEIPT이며 합계 811,531원.
- `DEPOSIT_REPORT` 유형 활성/삭제 행: 0건. 테이블과 enum에는 있지만 현재 표본은 없다.
- 활성 51건 중 `lines_json IS NULL` 25건, JSON 저장 26건, JSON 내부 논리 행 26개다.
- 2개 이상 분할 행을 가진 실제 보고서: 0건. 분할 기능은 코드에 있으나 다중행 실데이터 표본이 없어 운영 판정은 불가하다.
- Flyway 실DB 최종 적용 버전: 96.

### 1.5 원장 반영 시점·대상·금액 축

수기 생성은 DRAFT로 저장하고 분개를 만들지 않는다(`CashReceiptService.java:64-78`). 확정 시 다음을 같은 서비스 트랜잭션에서 수행한다.

1. DRAFT → CONFIRMED 상태 전이(`CashReceiptService.java:176-180`).
2. 자동 분개 게시(`CashReceiptService.java:184-187`).
3. 입금보고서에 분개 식별자 연결(`CashReceiptService.java:187`).
4. 거래처 에이징 스냅샷 갱신을 커밋 후 예약(`CashReceiptService.java:188-190`).

금액 축은 각 보고서 행마다 다음과 같다(`CashReceiptService.java:333-347`).

| 축 | 기본 계정 | 차변 | 대변 | 거래처 |
|---|---|---:|---:|---|
| 현금성 자산 증가 | 보통예금 `102` | 입금액 | 0 | 해당 행 거래처 |
| 채권 감소 | 외상매출금 `110` | 0 | 입금액 | 해당 행 거래처 |

기본 계정 코드는 `CashReceipt.java:33-37`이다. 실제 활성 CONFIRMED 3건의 분개도 모두 `102` 차변/`110` 대변이며 총액 277,000원이다.

취소는 원분개를 역분개하고 BANK_LINKED이면 통장거래를 다시 미반영으로 돌린다(`CashReceiptService.java:194-217`). 확정 보고서 수정은 기존 분개 역분개 후 새 분개를 재게시한다(`CashReceiptService.java:237-268`).

### 1.6 누가 만들 수 있는가

권한 코드는 `accounting.cash-receipts`다(`CashReceiptController.java:47`). 기본 역할별 권한은 다음과 같다.

| 역할 코드 | VIEW | CREATE | UPDATE | DELETE |
|---|---:|---:|---:|---:|
| MASTER | O | O | O | O |
| MANAGER | O | O | O | O |
| ACCOUNTANT | O | O | O | O |

근거: `V80__seed_accounting_cash_receipts_page_permission.sql:4-31`, `:33-67`. 실DB에서도 동일했고, 활성 `account_page_permissions` 기준 VIEW/CREATE/UPDATE 권한 계정은 각각 10개였다.

주의: 수기 생성은 `CREATE`, 원장까지 반영하는 통장연계 생성과 확정은 `UPDATE`다(`CashReceiptController.java:53-81`, `:141-156`).

### 1.7 채권(매출) 소멸·부분 입금·과입금

확정된 입금보고서는 개별 매출전표를 지정하지 않는다.

- `cash_receipts`에 매출전표 식별자/배분 컬럼이 없다.
- `cash_receipts`를 참조하는 FK는 `bank_transaction.cash_receipt_id` 하나뿐이다. 매출전표/매출전표 배분 FK는 없다.
- 확정 시 거래처별 `110` 대변에 입금액 전체를 기록한다(`CashReceiptService.java:333-347`). 즉 개별 전표 소멸이 아니라 거래처 총채권 감소다.

부분 입금:

- 금액이 0보다 크고 분할 행 합계가 헤더 총액과 같으면 된다(`CashReceipt.java:273-276`, `CashReceiptService.java:571-590`). 현재 채권잔액 또는 특정 매출전표 금액과 같아야 한다는 검사는 없다.
- 실데이터 CONFIRMED 3건은 같은 거래처의 비입금 채권 28,600,000원 중 합계 277,000원을 감소시켰고 현재 잔액은 28,323,000원이다. 거래처 총액 기준 부분 입금 표본은 있다.

과입금:

- 코드에는 채권잔액 상한 검사가 없으므로 채권보다 큰 양수 입금도 저장·확정 경로를 통과한다.
- 거래처별 미수금 보고서는 계산 결과가 0 이하이면 행을 제외한다(`PartnerAgingService.java:95-113`). 별도 미배분 선수금/과입금 엔티티로 넘기는 코드는 찾지 못했다.
- 활성 CONFIRMED 표본 3건에서는 과입금을 관찰하지 못했다. 따라서 실제 과입금 화면 표현은 판정 불가다.

---

## 2. 출금 — 지금 무엇을 하는가

### 2.1 현행 입출금 내역

- 화면: `/accounting/bank-transactions` (`routes/index.tsx:859-863`).
- API: `/accounting/bank-transactions` (`BankTransactionController.java:39-46`).
- 테이블: `accounting_db.public.bank_transaction`.
- 출금 구분: `txn_type='WITHDRAWAL'` (`V43__add_bank_transaction.sql:11-16`).
- 상태: `match_status`는 `UNREFLECTED`, `REFLECTED`, `FORCED` (`V43__add_bank_transaction.sql:25-28`).

실데이터:

| 유형 | 상태 | 행 | 금액 합계 | 거래처 지정 | 분개 연결 | 입금보고서 연결 |
|---|---|---:|---:|---:|---:|---:|
| DEPOSIT | REFLECTED | 2 | 200,000 | 2 | 2 | 2 |
| DEPOSIT | UNREFLECTED | 163 | 202,810,000 | 2 | 0 | 0 |
| WITHDRAWAL | UNREFLECTED | **151** | **15,514,700** | **0** | **0** | **0** |

판정: 출금 원천행과 조회/거래처 지정 UI는 존재하지만 출금 회계반영 표본은 0건이다. 151건 전부 통장 내역 테이블에만 미반영 상태로 남아 있다.

### 2.2 “출금내역에 설정하는 거래처” 필드

있다.

- 테이블·컬럼: `bank_transaction.matched_partner_id` (`V43__add_bank_transaction.sql:27-28`, `BankTransaction.java:88-90`).
- 화면 열: 입금/출금 공통 `거래처` 열과 거래처 검색기 (`BankTransactionPage.tsx:397-430`). 출금 열은 같은 행의 `WITHDRAWAL` 금액을 표시한다(`:470-475`).
- API: `PATCH /accounting/bank-transactions/match-partner`, 요청은 화면 식별자인 거래 자연키와 `partnerCode`를 사용한다(`BankTransactionController.java:124-133`, `BankTransactionService.java:244-269`).
- 서비스는 수동 거래처 지정 자체를 DEPOSIT으로 제한하지 않는다(`BankTransactionService.java:268-300`). DEPOSIT 제한은 후속 입금자명 자동학습에만 있다(`:303-320`). 따라서 일반 출금행에도 거래처 지정이 가능하다.
- 실측: WITHDRAWAL 151건 중 `matched_partner_id IS NOT NULL`은 0건이다. 필드는 구현됐지만 출금 실사용 표본은 없다.

### 2.3 출금보고서/출금 처리

현행 출금보고서는 없다.

확인한 부분 구현/계보는 다음뿐이다.

| 항목 | 상태 | 근거 |
|---|---|---|
| `cash_disbursements` 테이블 | 있음, 실데이터 0건 | `V27__add_cash_disbursement_receipt.sql:6-33`, 실DB |
| `CashDisbursement` 엔티티 | 있음 | `CashDisbursement.java:26-74` |
| 현행 사용자 CRUD/확정/취소 API | 없음 | 현행 컨트롤러 전수 검색 결과 관리자 이관 API만 존재 |
| 데스크톱 출금보고서 화면/라우트 | 없음 | 클라이언트 전수 검색 결과 MIG 권한 표시와 별도 그룹웨어 지출결의서만 존재 |
| 이카운트 staging → 구형 도메인 변환 | 관리자 API 있음 | `Mig7CashDisbursementTransformController.java:20-42` |
| 구형 도메인 → 분개 배치 | 관리자 API 있음 | `Mig9CashJournalController.java:20-43` |

`cash_disbursements`의 `partner_id`는 지출결의서 이관행 거래처다(`V27__add_cash_disbursement_receipt.sql:6-15`). 그러나 현재 0건이며 통장 출금의 `matched_partner_id`와 연결하는 코드/FK는 찾지 못했다.

### 2.4 어디에 반영되며 채무 소멸과 연결되는가

현행 통장 출금 151건은 `bank_transaction`에만 있고 모두 미반영이다. 분개와 채무 원장 반영은 없다.

구형 MIG-9 출금 배치는 다음 분개를 만든다.

| 축 | 차변 | 대변 |
|---|---:|---:|
| 지급수수료 | 출금액 | 0 |
| 보통예금 | 0 | 출금액 |

근거: `Mig9CashJournalService.java:36-37`, `:77-103`.

외상매입금 `201` 또는 미지급금 `210` 차변이 아니므로 이 경로도 매입채무를 소멸시키지 않는다. 실데이터가 0건이라 이 구형 배치의 운영 실행 결과도 판정 불가다.

---

## 3. 우리 회사법인

### 3.1 거래처 마스터 등록 여부

등록돼 있다. 회계 공급자 프로필의 정본 회사 정보와 거래처 마스터를 사업자번호로 대조했다.

| 출처 | 식별자 | 회사명 | 활성 행 |
|---|---|---|---:|
| `accounting_db.supplier_profiles` | 사업자번호 `2148720659` | `（주）삼한공조시스템` | 1 |
| `partner_db.partners` | 거래처코드 `2148720659`, 사업자번호 `2148720659` | `(주)삼한공조시스템` | 1 |

거래처 마스터 후보는 동일 사업자번호 기준 정확히 1건이다. 상태는 `ACTIVE`, `partner_group1='MAIN'`이다. 거래처의 사용자 식별자는 `partner_code`, `biz_no`, `name`이다(`Partner.java:51-61`).

### 3.2 자기 자신 구분 플래그

없다.

- `partners` 실DB 49개 컬럼 전수에서 이름에 `self`, `internal`, `company`, `corp`, `own`이 들어가는 컬럼은 0개였다.
- 엔티티에도 `isSelf`, `internal` 같은 필드는 없다. `partner_group1`, 판매/매입 유형, 채권/채무 관리값은 일반 분류 필드일 뿐이다(`Partner.java:140-173`).
- 따라서 `partner_group1='MAIN'`을 자기 자신 플래그라고 확정할 수 없다.

### 3.3 실데이터 수

- 활성 거래처 전체: 7,259건.
- 회사 공급자 프로필 사업자번호와 일치하는 자기 회사 후보: **1건**.
- 이름/그룹만으로 추가 확정할 수 있는 후보: 모른다. 자기 자신 플래그가 없으므로 사업자번호 일치 1건 외에는 확정하지 않았다.

---

## 4. 입금·출금 비대칭 실측

| 축 | 입금 | 출금 |
|---|---|---|
| 화면 | 입금보고서 목록·상세·편집 있음. 통장 입금 선택 생성 있음. 수기 신규 화면은 없음 | 출금보고서 화면 없음. 입출금 내역 화면의 출금행만 있음 |
| 화면 경로 | `/accounting/admin/cash-receipts`, `/accounting/bank-transactions` | `/accounting/bank-transactions` |
| API | 현행 생성·조회·수정·확정·취소·삭제 전부 있음 | 출금보고서 CRUD/확정 API 없음. 통장거래 조회·거래처 지정 API만 있음 |
| 테이블 | `cash_receipts` 활성 51건 | `bank_transaction` 출금 151건(전부 미반영). 구형 `cash_disbursements` 0건 |
| 원장 반영 | 확정 시 `102` 차변 / `110` 대변 자동 게시. CONFIRMED 3건, 277,000원 실측 | 현행 0건. 구형 배치는 지급수수료 차변/보통예금 대변이나 표본 0 |
| 권한 | `accounting.cash-receipts`; MASTER/MANAGER/ACCOUNTANT VIEW·CREATE·UPDATE·DELETE | 출금보고서 권한 없음. 입출금 내역은 `accounting.bank-matching`; MASTER/MANAGER/ACCOUNTANT VIEW·EDIT. 구형 MIG 권한은 별도 |
| 보고서 | 있음 | 없음 |
| 전표 연결 | 입금보고서 ↔ 자동 분개 연결. 개별 매출전표 배분 연결은 없음 | 통장 출금 ↔ 분개/매입전표 연결 없음. 구형 `cash_disbursements.journal_id`만 계보상 존재 |
| 채권·채무 소멸 | 거래처 총 외상매출금 `110`을 입금액만큼 감소 | 외상매입금 `201`/미지급금 `210` 감소 코드 없음 |
| 거래처 설정 | 입금보고서 헤더/분할행 거래처 필수 | `bank_transaction.matched_partner_id` 필드는 있고 UI에서 지정 가능하나 출금 실측 0건 |

---

## 5. 회계 원장과의 관계

### 5.1 거래처별 채권 원장

두 read model이 있다.

1. 거래처 원장 화면 `/accounting/partner-ledger`, API `GET /accounting/journals/partner-ledger` (`routes/index.tsx:1012-1016`, `AccountingReportController.java:180-189`).
2. 거래처별 미수/미지급 보고서 `/accounting/reports/partner-aging`, API `GET /accounting/reports/partner-aging?type=RECEIVABLE` (`routes/index.tsx:811-815`, `PartnerAgingController.java:50-77`).

거래처 원장은 출고 판매전표와 확정 입금보고서를 합친다.

- 판매전표는 `slip-service`의 `/internal/slips/partner-ledger-sales`에서 직접 읽는다(`PartnerLedgerSalesClient.java:16-34`, `SlipInternalController.java:382-405`).
- 입금은 `cash_receipts.status=CONFIRMED`를 직접 읽어 수금 문서로 추가한다(`PartnerLedgerReadModelService.java:121-129`, `:335-347`).
- CASH_RECEIPT 분개는 중복 계산을 피하려고 일반 분개 집계에서 제외한다(`PartnerLedgerReadModelService.java:96-108`).

거래처별 미수금 보고서는 분개 라인의 외상매출금 `110`을 `debit-credit`으로 계산한다(`PartnerAgingController.java:50-66`, `PartnerAgingService.java:49-54`, `:95-113`).

실DB `POSTED+REVERSED` 기준:

| 계정 | 라인 | 거래처 | 차변 | 대변 | 잔액 |
|---|---:|---:|---:|---:|---:|
| 110 외상매출금 | 90 | 40 | 526,330,034 | 13,647,034 | 512,683,000 |

### 5.2 거래처별 채무 원장

채권 거래처 원장과 짝인 “매입전표 + 출금보고서” 문서 원장은 없다. 현재 확인되는 채무 조회는 다음 보고서다.

- `/accounting/reports/partner-aging?type=PAYABLE`: 외상매입금 `201`, `credit-debit` (`PartnerAgingController.java:50-66`, `PartnerAgingService.java:50-54`, `:200-213`).
- `/accounting/reports/receivables-payables?direction=PAYABLE`: `201`, `210`의 POSTED+REVERSED 분개 라인 기반 (`ReceivablesPayablesService.java:31-46`, `:153-169`).

실DB `POSTED+REVERSED` 기준:

| 계정 | 라인 | 거래처 | 차변 | 대변 | 잔액 |
|---|---:|---:|---:|---:|---:|
| 201 외상매입금 | 3 | 2 | 800,000 | 4,070,000 | 3,270,000 |
| 210 미지급금 | 1 | 0 | 0 | 700,000 | 700,000 |

이 채무 데이터의 출처는 전부 MANUAL 분개다. CASH_DISBURSEMENT 출처 행은 0건이다.

### 5.3 입금·출금의 원장 반영 코드 지점

| 사건 | 코드 지점 | 현행 효과 |
|---|---|---|
| 입금보고서 확정 | `CashReceiptService.java:176-190` | 상태 확정 + 자동 분개 게시 + 분개 연결 |
| 입금 금액축 | `CashReceiptService.java:333-347` | 행별 현금성 계정 차변/외상매출금 대변 |
| 거래처 원장 입금 표시 | `PartnerLedgerReadModelService.java:121-129`, `:335-347` | CONFIRMED 보고서를 직접 읽음 |
| 미수 원장 집계 | `PartnerAgingService.java:95-113`, `:200-213` | `110` POSTED+REVERSED 분개 합계 |
| 통장 입금 반영 | `BankDepositReceiptService.java:53-91`, `:165-183` | 입금보고서 확정 후 통장행을 REFLECTED로 연결 |
| 통장 출금 반영 | 없음 | 151건 모두 UNREFLECTED |
| 구형 출금 분개 | `Mig9CashJournalService.java:77-103` | 지급수수료/보통예금; 채무 소멸 아님 |

### 5.4 규칙 8 — “회계전표 생성 전에도 원장 반영” 여부

코드로 확정되는 현행은 다음과 같다.

| 대상 | 회계전표/분개 전 원장 반영 여부 | 코드 판정 |
|---|---|---|
| 출고 판매전표 → 채권 거래처 원장 | **예** | 거래처 원장이 `slip-service` 판매전표 projection을 직접 읽음. `PartnerLedgerReadModelService.java:131-170` |
| 수기 입금보고서 DRAFT | **아니오** | 생성 시 분개 없음이고, 원장은 CONFIRMED만 조회. `CashReceiptService.java:64-78`, `PartnerLedgerReadModelService.java:335-341` |
| 입금보고서 CONFIRMED | **조건부로 직접 조회 가능** | 원장은 `journal_id` 유무와 무관하게 CONFIRMED를 읽고, 분개가 없으면 보고서 전표번호를 쓴다(`PartnerLedgerReadModelService.java:335-347`). 다만 현행 수기/통장 확정은 같은 서비스 트랜잭션에서 분개까지 게시한다(`CashReceiptService.java:176-190`). 실DB CONFIRMED 3건은 모두 분개 연결됨 |
| 통장 출금 | **아니오** | 출금행은 원장 read model에 포함되지 않고 실측 전부 UNREFLECTED |
| 구형 CashDisbursement | **판정 불가** | 테이블/배치는 있으나 0건. 채무 원장 read model도 이를 직접 읽지 않고 분개만 읽음 |
| 매입전표 | **아니오로 판정** | `PurchaseAccountingSlipService.post`는 상태만 POSTED로 바꾸며 분개를 만들지 않는다(`PurchaseAccountingSlipService.java:71-82`, `PurchaseAccountingSlip.java:114-123`). 채무 보고서는 분개 라인만 읽는다. 실DB 매입전표 0건이라 운영 표본은 없음 |

따라서 입금·출금에 규칙 8이 동일하게 적용된다고 말할 수 없다. 입금은 CONFIRMED 문서를 직접 읽는 경로가 있지만 현행 확정과 분개 게시가 붙어 있고, 출금은 원장 반영 경로 자체가 없다.

---

## 6. 개발책임자 확인이 필요한 것

아래는 현행 코드·데이터만으로 의미를 확정할 수 없어 질문으로 남긴다.

1. 이슈 #1144의 “출금내역에 설정하는 거래처”는 현행 입출금 내역의 `bank_transaction.matched_partner_id`를 뜻합니까? 현재 이 필드는 출금행에도 지정할 수 있지만 출금 실데이터 지정은 0건입니다.
2. “대부분 우리 회사법인”은 통장 출금의 거래처를 `(주)삼한공조시스템`으로 지정한다는 뜻입니까? 회사 거래처 후보는 사업자번호 일치 1건으로 확정했지만 자기 자신 플래그는 없습니다.
3. 이슈에서 말하는 “채권 원장·채무 원장”은 문서형 거래처 원장과 분개 기반 미수/미지급 보고서 중 어느 것을 정본으로 부르는 것입니까? 현행은 채권 문서 원장은 있으나 짝이 되는 채무 문서 원장은 없습니다.
4. 부분 입금·과입금은 개별 매출전표 배분을 요구하는 의미입니까, 거래처 총잔액 증감만을 의미합니까? 현행은 후자이고 개별 매출전표 링크가 없습니다.

## 7. 확정하지 못한 것

- 다중 거래처 분할 입금의 실제 운영 결과: 코드에는 있으나 다중행 실데이터 0건.
- 과입금의 실제 화면 표시/후속 처리: 코드상 상한 검사는 없으나 활성 과입금 표본 0건.
- 구형 `cash_disbursements` 변환·MIG-9 분개 배치의 현 운영 가능 여부: 테이블과 코드만 있고 실데이터 0건. 구현 완료로 판정하지 않음.
- 출금 거래처 지정의 실제 운영 사용 여부: 필드·화면·API는 있으나 출금 지정 표본 0건.
- 출금보고서 권한·상태·번호 체계: 현행 구현이 없어 모른다.
- 자기 회사 판별 규칙: 사업자번호 대조 후보 1건은 확정했으나 전용 플래그가 없어 일반화 규칙은 모른다.
- 매입전표의 운영상 채무 원장 반영: 코드상 분개 기반 보고서에 연결되지 않고 실데이터도 0건이다.

## 8. 신규 파일

- `docs/dev-reports/2026-08-08-1144-deposit-withdrawal-survey.md`
