# SP-08 legacy GAS DB/API parity 전체 시리즈 종료 보고

> SP-08 series — Samhan Public 전메뉴 legacy GAS 동등 기능을 우리 DB/API 잠금 + Notion runtime zero + 자격 평문 비공개 가드 강화. 전체 시리즈 누적 머지 완료.

## 1. 시리즈 개요

### SP-08-5 매입 CRUD parity (6 PR)

| 슬라이스 | PR | mergeCommit |
|---|---|---|
| SP-08-5-1 R1/R2 매입 목록·상세 | #220 | `0d621b36` |
| SP-08-5-2 U1 매입 수정 PUT | #221 | `61925942` |
| SP-08-5-3 D1 매입 soft delete | #222 | `211711a1` |
| SP-08-5-4 C1 검수 CTA 회귀 | #223 | `1486e610` |
| SP-08-5-5 P1 매입 인쇄 양식 | #224 | `dafee351` |
| SP-08-5-6 통합 검증 | #225 | `d9b2af43` |

### SP-08-6 매출/회계 CRUD parity (7 PR)

| 슬라이스 | PR | mergeCommit |
|---|---|---|
| SP-08-6-1 R1/R2 매출 목록·상세 | #226 | `c380644e` |
| SP-08-6-2 U1 매출 수정 PUT | #227 | `85bb007f` |
| SP-08-6-3 D1 매출 soft delete | #228 | `5be1fa99` |
| SP-08-6-4 P1 거래명세서/계산서 | #229 | `93d7c4c4` |
| SP-08-6-5 P2 일마감/원장 + V15 | #230 | `2ae5b0fe` |
| SP-08-6-6 세금계산서 회귀 (옵션 A) | #231 | `7ed50aaf` |
| SP-08-6-7 통합 검증 | #232 | `5b681d03` |

### SP-08-7/8 보안 가드 (2 PR)

| 슬라이스 | PR | mergeCommit |
|---|---|---|
| SP-08-7 Notion runtime zero | #233 | `3e311e6e` |
| SP-08-8 자격 평문 가드 | #234 | `36d6aca2` |

### SP-08-9 통합 검증 (본 PR)

| 슬라이스 | PR | mergeCommit |
|---|---|---|
| SP-08-9 SP-08 전체 시리즈 종료 | TBD | TBD |

**누적 통계** (16 PR):
- 사이클 평균: N=1.3 (5회차 워크플로우 + 회고 누적 효과)
- CI 누적: 300+ check SUCCESS
- TM PR comment: ~40건 (Claude/Codex 양쪽)
- 신규 IT: 70+ case (slip-service + accounting-service)
- 신규 Playwright: 40+ case
- 신규 PNG: 50+장
- 코드: +20,000줄 (BE/FE/Design/QA/docs)

## 2. 영역별 산출물 누적

### Backend (slip-service + accounting-service + shared)

**slip-service** (매입/매출 통합):
- `SlipController/SlipQueryController` 매입/매출 권한 가드 (INBOUND/OUTBOUND 분기)
- `SlipPurchaseAccessGuard` + `SlipSalesAccessGuard`
- `SlipUpdateController/Service` 매입 수정 PUT
- `SalesSlipUpdateController/Service` 매출 수정 PUT
- `SlipDeleteController/Service` 매입 삭제 + `SalesSlipDeleteController/Service` 매출 삭제
- `Slip` 도메인 메서드: `updateHeader/replaceLines` (매입) + `updateSalesHeader/replaceSalesLines` (매출) + `deleteForPurchase` + `deleteForSales` + `requireNotLocked`
- `SlipInspectionCtaRegressionIT` 회귀 가드
- `UserInternalClient` + `SlipDetailResponse.ownerFullName`

**accounting-service**:
- `DailyClosing` 도메인 + Repository + Service + Controller + IT 12 case
- `LedgerService` + `LedgerController` (journal_lines view 기반)
- `TaxInvoiceControllerIT.issueAlreadyIssued_409` 회귀

**shared**:
- ErrorCode 10+ 신규 (SLIP_OPTIMISTIC_LOCK_CONFLICT, SLIP_UPDATE_INVALID_LINE, SLIP_DELETE_INSPECTION_COMPLETED, SLIP_DELETE_NON_INBOUND, SLIP_UPDATE_NON_SALES, SLIP_DELETE_SALES_SHIPPED, SLIP_DELETE_NON_SALES 등)

**Flyway**: V15 `daily_closings` + partial unique index (SP-08-6-5)

### Frontend (clients/desktop)

- `PurchaseQueryPage` + `SalesQueryPage` 매입/매출 query 화면
- `SlipDetailPage` 매입/매출 수정/삭제 modal 통합
- `InboundInspectionDialog` 검수 흐름 회귀
- `PurchaseSlipPrintPage` + `SalesTransactionStatementPrintPage` + `SalesInvoicePrintPage` 인쇄 양식 3종
- `DailyClosingPage` + `GeneralLedgerPage` 회계 화면
- `TaxInvoiceDetailPage` 발행 (기존, 회귀 가드)
- `api/slip.ts` + `api/accounting.ts` 정합
- `utils/dateUtils.ts` + `currencyUtils.ts` + `printUtils.ts` 공용
- 라우트 등록 다수

### Design + global.css

- warning/danger scale 토큰 (50/200/300/500/700/800 + CSS/TS mirror)
- `.warning-banner` / `.danger-banner` / `.success-banner` / `.danger-text`
- `.purchase-edit-field` / `.sales-edit-field` (의미 분리)
- `.purchase-print-*` / `.sales-print-*` (인쇄 영역 분할)
- 인쇄 폰트 Batang/명조 계열 (회계 양식)
- design docs: `print-spec.md` 매입/매출 양식

### DevOps + CI

- Flyway V15 (V12~V14 기존 + V15 SP-08-6-5)
- @MockBean 8종 격리 표준화 (UserInternalClient + ArologisDispatchClient 등)
- `.gitattributes` (SP-08-5-4) EOL 정책
- `scripts/check-notion-zero.sh` + CI `notion-zero-guard` job (SP-08-7)
- `scripts/check-credential-plaintext.sh` + CI `credential-plaintext-guard` job (SP-08-8)
- GitGuardian false positive PM 자동 처리 (메모리 정책)
- Korean path JDK 우회 (`GRADLE_USER_HOME=.gradle-codex`)

## 3. 핵심 결정 누적

### 도메인 정책

- **`SlipType.OUTBOUND = 매출`** 확정 (별도 SALE enum X)
- **권한 매트릭스 (SP-03 §4.2)**:
  - 매입: WAREHOUSE/MANAGER/MASTER
  - 매출: SALES/MANAGER/MASTER
  - 회계: ACCOUNTANT/MANAGER/MASTER
  - 역할 분기 — 교차 권한 차단 (INVENTORY + null → 403 SP-08-5-1 IT 정정)
- **옵션 B endpoint 패턴**: `/slips/{id}/sales` 매입/매출 도메인 의미 분리 (SP-08-6-2)
- **출고 정책**: SHIPPED 이후 삭제 차단 → `SLIP_DELETE_SALES_SHIPPED` (SP-08-6-3)
- **InboundInspection 정책**: slip-service 내부 EDITABLE_STATUSES 재사용 (별도 도메인 X) — SP-08-5-3
- **일마감 잠금**: `requireNotLocked()` 도메인 가드 (SP-08-6-5)
- **세금계산서 발행**: 기존 endpoint 재사용 (옵션 A), NTS 실연동 SP-09/10 후속

### UI/UX 정책

- **UUID 사용자 비공개** (internal API 응답 UUID 유지, 화면 노출만 차단)
- **비즈니스 식별자만**: slipNo / taxInvoiceNo / closingDate / partnerCode
- **인쇄 양식 A4 portrait + paper-a4-portrait + @media print + @page**
- **부가세 Math.floor 통일** (라인 + 합계 정합)
- **인쇄 폰트 명조 계열** (Batang/바탕/HY신명조 — 회계 양식)
- **음수 `△` 표시** (한국 회계 표준)
- **한국어 라벨 + 한국어 Javadoc** 의무
- **design-system 우선** (자체 컴포넌트 신규 작성 금지)

### CI/DevOps 정책

- **Flyway IF NOT EXISTS 멱등** (V15 daily_closings + partial unique index)
- **`@MockBean` 8종 격리** 표준화 (Eureka 비활성 환경 보호)
- **grep 가드 자동화**:
  - `notion-zero-guard`: Notion runtime 의존 zero
  - `credential-plaintext-guard`: 자격 평문 비공개 (Notion + AWS + OpenAI + JWT + Sheet ID + Aligo)
- **리뷰 규칙 엄수**: 5 agent raw markdown 저장만, TM 통합 1건만 PR comment 게시 (Claude TM + Codex TM 사이클당 2건)
- **사이클 N=3 안 완료 의무** (4회차) — 실제 평균 N=1.3
- **PM 자동 머지** + 자동 슬라이스 진입 (사용자 7회차)

## 4. 5회차 워크플로우 효율 검증

| 시리즈 | 사이클 평균 | 비고 |
|---|---|---|
| SP-08-5 (매입 6 PR) | N=1.6 | 초기 회고 누적 |
| SP-08-6 (매출/회계 7 PR) | N=1.2 | SP-08-5 회고 활용 — 효율 향상 |
| SP-08-7 (Notion zero) | N=1.0 (head A→B README 제외) | 단순 가드 |
| SP-08-8 (자격 가드) | N=1.0 (head A→B→C Playwright 제거) | CI testDir 이슈 |
| **전체** | **N=1.3** | 회고 누적 효과 |

**Codex cross-check 효과** (사이클당 평균 신규 발견):
- SP-08-5-1: 8건 (UUID 정책 + Bean Validation 422)
- SP-08-6-2: 1건 (FE/BE endpoint 정합)
- SP-08-6-5: 2건 (FE/BE DTO query param)
- SP-08-8: 1건 (CI hard gate 범위)
- 평균: ~3건 신규 발견 / 사이클 (특히 cross-team 계약 정합)

**Codex 거부 → Claude 직접 fix 패턴** (사용자 정책 변경):
- PR #227 사이클 1 2c — Codex sandbox 거부 후 Claude 직접 supervisionAddress audit fix
- 이후 일관 적용 (Codex 진행 X, Claude PM 진행)

## 5. Follow-up (후속 슬라이스 / Phase)

| 항목 | 발견 슬라이스 | 우선순위 | 다음 Phase |
|---|---|---|---|
| Pretendard self-host (`clients/desktop/public/fonts/`) | SP-08-5-5 | P2 | 별도 PR |
| BE 35 IT @MockBean 일괄 추가 (UserInternalClient) | SP-08-5-5 | P2 | 별도 PR |
| warehouse name snapshot `destinationWarehouseName` | SP-08-5-5 | P2 | 별도 PR |
| ErrorCode `slip-service` 패키지 이동 | SP-08-5-3 | P3 | 후속 |
| controller utility 추출 (BaseSlipController/SlipHeaderUtils) | SP-08-5-3 | P3 | 후속 |
| 매입 인쇄 30행 초과 다중 페이지 분할 | SP-08-5-5 | P3 | 후속 |
| PartnerLookupClient.findByPartnerId 실 구현 | SP-08-6-5 | P2 | partner-service |
| LedgerLine.accountName BE DTO 추가 | SP-08-6-5 | P2 | accounting-service |
| TaxInvoiceListPage 일괄 발행 path 정합 | SP-08-6-6 | P2 | 별도 PR |
| 원장 페이지네이션 (대용량 운영) | SP-08-6-5 | P3 | 후속 |
| **NTS e-tax 실연동** (TaxInvoice.linkETaxExternalId) | SP-08-6-6 | P2 | **SP-09/10** |
| Phase 11 AWS migration 전 운영 비밀번호 교체 | SP-08-8 | P1 | **Phase 11** |
| Google Sheet ID rotation 절차 | SP-08-8 | P2 | DevOps |
| SP-08-7/8 가드 통합 (`check-secrets.sh`) | SP-08-8 | P3 | 후속 |
| SP-08-8 Playwright spec qa/playwright testDir 통합 | SP-08-8 | P3 | 별도 PR |

## 6. 시리즈 종료 선언

SP-08 legacy GAS DB/API parity 시리즈 — 16 PR 누적 머지 완료. Samhan Public 전메뉴 (견적관리/공급사/주문/매입/매출/사입 + 회계) legacy GAS 동등 기능 우리 DB/API 잠금 + Notion runtime 의존 zero + 자격 평문 비공개 가드 강화 완료.

**다음 Phase**: **Phase 11 AWS migration** (master plan `project_phase11_aws.md` 참조 — Seoul m5.xlarge + db.t3.medium + RDS auto backup + EC2 Auto Recovery + Health Check Lambda, 월 ₩405K).

또는 후속 Phase 9/10 vendor 연동 (NTS e-tax, Aligo SMS, OCR 등) 진행.

**tech-manager — 2026-05-18**
