# SP-08-6 매출 / 회계 CRUD parity 시리즈 (master plan)

> 작성: 2026-05-18 PM
> 기준 main: `d9b2af43` (PR #225 SP-08-5-6 merge 후)
> 직전 시리즈: SP-08-5 매입 (#220~#225) 종료 — `docs/dev-reports/sp-08-5-summary.md` 참조

## 1. 시리즈 범위

legacy GAS B 회계 4건 (거래명세서 / 계산서 / 일마감 / 원장) + 매출 전표 (`Slip` `slipType=SALE`) CRUD parity. SP-08-5 매입 패턴 동일 재사용 — `Slip` 도메인 type 분기로 처리.

### 핵심 차이 (SP-08-5 매입 vs SP-08-6 매출)

| 영역 | SP-08-5 매입 (INBOUND) | SP-08-6 매출 (SALE) |
|---|---|---|
| `Slip.slipType` | `INBOUND` | `SALE` (또는 `OUTBOUND` — 도메인 정의 확인) |
| 권한 가드 | WAREHOUSE/MANAGER/MASTER | SALES/MANAGER/MASTER (또는 ACCOUNTANT 추가) |
| 검수 흐름 | InboundInspection (slip-service 내부 EDITABLE_STATUSES) | 출고/배송 흐름 (`SlipStatus.SHIPPED/DELIVERED`) |
| 인쇄 양식 | 매입 전표 A4 portrait (SP-08-5-5) | 거래명세서 / 계산서 / 세금계산서 / 매출 전표 (다중 양식) |
| 회계 연동 | 없음 (매입 audit log only) | `accounting_db.daily_closings` + `accounting_db.invoices` 별도 service 연동 |

## 2. Sub-task 분해

SP-08-5 패턴 (6 슬라이스 5 PR + 통합 검증) 동일 적용 가능. 단, 회계 연동으로 인해 추가 슬라이스 필요.

### SP-08-6-1 — R1/R2 매출 목록 / 상세 endpoint 잠금

- BE: `GET /api/v1/slips?slipType=SALE` + `GET /api/v1/slips/{id}` 매출 응답 정합
- FE: `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx` (기존 패턴 검증) + CTA (출고/거래명세서/계산서 등)
- 권한 가드: SALES/MANAGER/MASTER (또는 ACCOUNTANT 추가)
- Playwright + IT + PNG 4장
- SP-08-5-1 `Slip.findBySlipTypeAndSlipNoAndIsDeletedFalse` 헬퍼 재사용 검토

### SP-08-6-2 — U1 매출 수정 direct PUT + optimistic lock

- BE: SP-08-5-2 `SlipUpdateService` 패턴 재사용 — `SlipType.SALE` 분기
- 도메인 메서드: `Slip.updateHeader`/`replaceLines` 가 INBOUND/SALE 양쪽 처리 가능한지 확인
- 권한 가드: SALES/MANAGER/MASTER

### SP-08-6-3 — D1 매출 soft delete + 출고 정책

- BE: SP-08-5-3 `SlipDeleteService` 패턴 재사용 — `SlipType.SALE` 분기
- 정책: 출고 완료 (`SHIPPED/DELIVERED`) 매출 삭제 차단 → ErrorCode `SLIP_DELETE_SALES_SHIPPED` (또는 동등)

### SP-08-6-4 — P1 매출 거래명세서 + 계산서 인쇄 양식

- FE: `SalesTransactionStatementPrintPage.tsx` (거래명세서) + `SalesInvoicePrintPage.tsx` (계산서)
- 인쇄 양식 legacy GAS 100% 매칭 (사용자 Edge 캡처 iteration 3~5회 필수 — `feedback_print_design_iteration`)
- design-system PrintLayout + paper-a4-portrait 재사용
- A4 한 장 fit + 부가세 (10%) + 합계

### SP-08-6-5 — P2 일마감 + 원장 endpoint 잠금

- BE: `POST /api/v1/accounting/daily-closings` + `GET /api/v1/accounting/ledgers` (accounting-service 도메인)
- 옵션 (날짜 range / 거래처 필터) GAS 정합
- 인쇄 양식: 일마감 / 원장 (PDF 또는 print view)
- accounting-service 도메인 + Flyway migration 가능성 (회계 신규 컬럼/테이블)

### SP-08-6-6 — 세금계산서 발행 + 외부 연동 (옵션)

- BE: 국세청 또는 외부 vendor 연동 (e-tax)
- 본 시리즈에서는 endpoint 정합만 검증, 실제 발행은 후속 시리즈 (SP-09 또는 SP-10)

### SP-08-6-7 — 통합 검증 + 시리즈 종료 dev-report

- `docs/dev-reports/sp-08-6-summary.md` 작성
- ROADMAP/DECISIONS 갱신
- 다음 시리즈 안내 (SP-08-7 Notion runtime zero / SP-08-8 자격 평문 가드)

## 3. 핵심 패턴 (SP-08-5 누적 + 신규)

| 패턴 | 적용 |
|---|---|
| BaseEntity 7 audit + Soft Delete only | hard delete 금지 |
| `@MockBean` 외부 client 7~8종 | slip-service + accounting-service IT 격리 |
| UUID 사용자 비공개 | slipNo / 거래처명 / 모델명 / 거래명세서번호 / 계산서번호 |
| 한국어 라벨 의무 | 화면 / QA / dev-report |
| design-system PrintLayout + paper-a4-portrait | 거래명세서 / 계산서 / 일마감 / 원장 모두 재사용 |
| N=3 + 5회차 | Claude review/fix → Codex review/fix, 최대 3 사이클 |
| 사용자 6/7회차 | PR 내 모든 결함 해결 + PM 자동 머지 + 자동 진입 |

## 4. 위험 요소

| 위험 | 완화 |
|---|---|
| `Slip.slipType=SALE` 정의 부재 (도메인) | SP-08-5-1 `SlipType` enum 확인 — `SALE` 존재 안 하면 `OUTBOUND` 사용 또는 신규 추가 |
| accounting-service 연동 신규 컬럼/테이블 | SP-08-6-5 진입 전 Flyway V12+ 추가 검토 |
| 거래명세서 / 계산서 / 세금계산서 인쇄 양식 GAS 캡처 부재 | 사용자 Edge 캡처 iteration 의무 (`feedback_print_design_iteration`) |
| `ACCOUNTANT` 권한 가드 정책 결정 | 매출 조회 가능 / 수정 불가 / 삭제 불가 가정 — BE agent 정책 결정 |
| 매출 = `Slip.slipType=OUTBOUND` 이면 SP-08-5 와 type 분기 충돌 | INBOUND/SALE 분기 + OUTBOUND 별도 (배송) 도메인 의미 정렬 |

## 5. 진행 절차

1. **SP-08-6-1** R1/R2 endpoint 잠금 — Slip.slipType 분기 확인 + Playwright + IT + PNG
2. PR 발행 후 Claude/Codex 양쪽 review/fix 1사이클
3. CI green + 양쪽 0 P0/P1 → PM 자동 머지
4. SP-08-6-2 자동 진입
5. 반복 (N=3 + 5회차 + 사용자 6/7회차)
6. SP-08-6-7 통합 검증 후 SP-08-7 진입

**tech-manager — 2026-05-18**
