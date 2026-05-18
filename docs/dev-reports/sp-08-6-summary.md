# SP-08-6 매출/회계 CRUD parity 시리즈 종료 보고

> SP-08-6 series — 매출 (Slip slipType=OUTBOUND) R1/R2/U1/D1 + 매출 인쇄 양식 P1 + 회계 P2 일마감/원장 + 세금계산서 발행 회귀 6 슬라이스 6 PR 누적 머지 완료.

## 1. 시리즈 개요

| 슬라이스 | PR | mergeCommit | 머지일 | 사이클 |
|---|---|---|---|---|
| **SP-08-6-1** R1/R2 매출 목록·상세 endpoint 잠금 + master plan | #226 | `c380644e` | 2026-05-18 | N=1 |
| **SP-08-6-2** U1 매출 수정 direct PUT + optimistic lock | #227 | `85bb007f` | 2026-05-18 | N=2 |
| **SP-08-6-3** D1 매출 soft delete + 출고 정책 | #228 | `5be1fa99` | 2026-05-18 | N=1 |
| **SP-08-6-4** P1 거래명세서 + 계산서 인쇄 양식 | #229 | `93d7c4c4` | 2026-05-18 | N=1 |
| **SP-08-6-5** P2 일마감 + 원장 endpoint + Flyway V15 | #230 | `2ae5b0fe` | 2026-05-18 | N=1 |
| **SP-08-6-6** 세금계산서 발행 회귀 가드 (옵션 A) | #231 | `7ed50aaf` | 2026-05-18 | N=1 |
| **SP-08-6-7** 통합 검증 (본 보고서) | TBD | TBD | 2026-05-18 | — |

**누적 통계** (6 PR):
- 사이클 평균: N=1.2
- CI 누적: 100+ check SUCCESS
- TM PR comment 누적: ~18건 (Claude/Codex 양쪽)
- 신규 IT: 40+ case (SlipQuerySalesIT 14 + SlipSalesUpdateIT 10 + SlipSalesDeleteIT 9 + DailyClosingIT 12 + TaxInvoiceControllerIT issueAlreadyIssued 1)
- 신규 Playwright: 30 case (5 × 6 PR)
- 신규 PNG: 24장 (4 × 6 PR)

## 2. 영역별 산출물 누적

### Backend (slip-service + accounting-service + shared)

| 신규 | 슬라이스 |
|---|---|
| `SlipSalesAccessGuard` (OUTBOUND 권한 가드) | SP-08-6-1 |
| `SalesSlipUpdateController/Service` + `Slip.updateSalesHeader/replaceSalesLines` | SP-08-6-2 |
| `SalesSlipDeleteController/Service` + `Slip.deleteForSales` | SP-08-6-3 |
| `DailyClosing` 도메인 + `DailyClosingController/Service` + `LedgerController/Service` + Flyway V15 | SP-08-6-5 |
| `TaxInvoiceControllerIT.issueAlreadyIssued_409` 회귀 가드 | SP-08-6-6 |
| ErrorCode: `SLIP_UPDATE_NON_SALES`(403), `SLIP_DELETE_SALES_SHIPPED`(422), `SLIP_DELETE_NON_SALES`(403) | SP-08-6-2/3 |

### Frontend (clients/desktop)

| 신규 / 수정 | 슬라이스 |
|---|---|
| `SalesQueryPage` 검수 CTA + canQuerySales + statusBadgeVariant | SP-08-6-1 |
| `SlipDetailPage` 매출 수정 modal + 매출 삭제 modal | SP-08-6-2/3 |
| `slip.ts` updateSalesSlip + deleteSalesSlip | SP-08-6-2/3 |
| `SalesTransactionStatementPrintPage` + `SalesInvoicePrintPage` + 라우트 2 | SP-08-6-4 |
| `printUtils.ts` + Math.floor 통일 | SP-08-6-4 |
| `DailyClosingPage` + `GeneralLedgerPage` + 라우트 2 | SP-08-6-5 |
| `dateUtils.ts` + `currencyUtils.ts` 공용 util | SP-08-6-5 |
| `accounting.ts` BE 정합 (DailyClosing + LedgerResponse) | SP-08-6-5 |
| `TaxInvoiceDetailPage` 발행 CTA (기존, 회귀 검증) | SP-08-6-6 |

### Design + global.css

| 변경 | 슬라이스 |
|---|---|
| `.sales-edit-field` 클래스 (D-C1-2 회고) | SP-08-6-2 |
| `.success-banner` global.css | SP-08-6-2 |
| `.sales-print-*` 350줄 + design docs print-spec.md (803줄) | SP-08-6-4 |
| 인쇄 폰트 Batang/명조 계열 (SP-08-5-5 회고) | SP-08-6-5 |
| 12 토큰 권고 (기존 토큰 충족 — 추가 없음) | SP-08-6-5 |

### DevOps

| 변경 | 슬라이스 |
|---|---|
| Flyway V15 daily_closings + partial unique index | SP-08-6-5 |
| @MockBean 8종 격리 (UserInternalClient + ArologisDispatchClient) | SP-08-6-1~5 |
| GitGuardian clean (samhan_dev_pw false positive 외) | 전체 |

## 3. 핵심 결정 누적

### 도메인 정책

- **SlipType.OUTBOUND = 매출 확정** (SALE 신규 X) — SP-08-6-1
- **권한 매트릭스 (SP-03 §4.2 정합)**:
  - 매출 조회/수정/삭제: SALES/MANAGER/MASTER
  - INVENTORY/WAREHOUSE/ACCOUNTANT: 403 (매출 미허용)
  - INVENTORY + type=null → 403 (SP-08-5-1 IT 회귀 정정)
- **매출 endpoint 옵션 B**: `/slips/{id}/sales` 매입/매출 도메인 의미 분리 — SP-08-6-2
- **출고 정책**: SHIPPED 이후 삭제 차단 → 422 `SLIP_DELETE_SALES_SHIPPED` — SP-08-6-3
- **일마감 정책**: `daily_closings` 테이블 + lockFlag + `requireNotLocked()` guard — SP-08-6-5
- **세금계산서 발행**: 기존 `POST /tax-invoices/{id}/issue` 재사용 (옵션 A), e-tax 실연동 SP-09/10 후속 — SP-08-6-6

### UI/UX 정책

- UUID 사용자 비공개 — 비즈니스 식별자 only (slipNo/taxInvoiceNo/closingDate/partnerCode)
- 매출 거래명세서/계산서 인쇄: A4 portrait + paper-a4-portrait + `@media print` + `@page` + 8/7 컬럼 + NTS 2-panel + [인] 인장 + print-color-adjust exact
- 부가세 통일 Math.floor (라인 + 합계 정합)
- 인쇄 폰트 명조 계열 (Batang/바탕/HY신명조)
- 일마감/원장 화면 + DataTable + 한국 회계 표준 `△` 음수 표시
- 한국어 라벨 의무 + 한국어 Javadoc

### CI/DevOps 정책

- Flyway V12~V15 누적 (V15 daily_closings) + IF NOT EXISTS 멱등
- @MockBean 8종 격리 (SP-08-5-5 회고 + SlipServiceClient + PartnerLookupClient 등)
- 리뷰 규칙 엄수: 5 agent raw markdown 저장만, TM 통합 1건만 PR comment 게시

## 4. 5회차 워크플로우 효율 검증

| 사이클 | Claude 발견 + Codex 신규 | 1c fix | 2c fix |
|---|---|---|---|
| SP-08-6-1 | 24 + 5 | 13 | 2 |
| SP-08-6-2 | 14 + 1 | 11 | 1 |
| SP-08-6-3 | 12 + 0 | 10 | 0 |
| SP-08-6-4 | 9 + 2 | 9 | 2 |
| SP-08-6-5 | 16 + 2 | 13 | 2 |
| SP-08-6-6 | 0 + 2 (MINOR) | 1 (IT) | 0 |

**관찰**:
- 사이클 평균 N=1.2 (SP-08-5 N=1.6 대비 효율 향상 — 회고 누적 효과)
- SP-08-5 회고 (warning/danger scale, .sales-edit-field, supervisionAddress audit 등) SP-08-6 에서 즉시 활용
- Codex cross-check 효과: FE/BE 계약 불일치 자동 감지 (SP-08-6-2 endpoint URL, SP-08-6-5 DTO from/to)
- 옵션 A/B 결정 패턴 (SP-08-6-2 B / SP-08-6-3 B / SP-08-6-6 A) — 도메인 영향 분석 후 채택

## 5. Follow-up (후속 슬라이스)

| 항목 | 발견 슬라이스 | 우선순위 |
|---|---|---|
| PartnerLookupClient.findByPartnerId placeholder 실 구현 | SP-08-6-5 | P2 |
| LedgerLine.accountName BE DTO 추가 + FE 컬럼 부활 | SP-08-6-5 | P2 |
| TaxInvoiceListPage "일괄 발행" `/accounting/hometax-export` vs spec `/accounting/tax-invoices/batch` 경로 불일치 | SP-08-6-6 | P2 |
| NTS e-tax 실연동 (TaxInvoice.linkETaxExternalId + ETaxClient + V16 emit_status?) | SP-08-6-6 | P3 (SP-09/10) |
| 원장 페이지네이션 (대용량 운영) | SP-08-6-5 | P3 |
| DataTable rowKey lineNo BE 추가 시 5-필드 조합 정리 | SP-08-6-5 | P3 |
| accountCode query param BE 지원 | SP-08-6-5 | P3 |
| mock fixture (DailyClosing/Ledger) 업데이트 | SP-08-6-5 | P3 |
| TaxInvoice "일괄 발행" 경로 정합 | SP-08-6-6 | P2 |

## 6. 시리즈 종료 선언

SP-08-6 매출/회계 CRUD parity 시리즈 — 6 PR 누적 머지 완료. legacy GAS B 회계 4건 (거래명세서/계산서/일마감/원장) + 매출 전표 CRUD (R1/R2/U1/D1) + 세금계산서 발행 회귀 가드 우리 DB/API 잠금 완료.

다음 시리즈: **SP-08-7 Notion runtime 의존 zero 정적 잠금** (master plan §3 SP-08-7).

**tech-manager — 2026-05-18**
