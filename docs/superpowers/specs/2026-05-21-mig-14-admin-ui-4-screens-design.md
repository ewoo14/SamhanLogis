# MIG-14 admin UI 4 화면 통합 + DynamicPermissionClient 청소 — 설계 (Design Spec)

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-14-admin-ui-4-screens`
> 입력: MIG-7 Cash + MIG-8 Order + MIG-9 partner_aging_snapshot + MIG-11 Ledger staging

---

## 1. 개요

이카운트 마이그레이션 11 슬라이스 + MIG-12 follow-up + MIG-13 청소 모두 머지 완료 → **admin UI 4 화면 통합 + DynamicPermissionClient @MockBean 일괄 청소** (사용자 결정).

- baseline: MIG-1~13 모두 머지
- 사용자 결정: "MIG-14 4 화면 통합 (큰 PR)" — Cash + Order + AgingSnapshot + Ledger
- DynamicPermissionClient @MockBean 30+ IT 청소 동시 진행 (SP-D5 PermissionGuard 단일화 자연 연장)

---

## 2. 4 admin 화면

### 2.1 Cash 화면 (Cash Operations)
- `CashDisbursementListPage.tsx` — 지출 트랜잭션 조회 + 페이지네이션 + 검색 (partner_id / slip_no / kind / transaction_date range)
- `CashReceiptListPage.tsx` — 회수 트랜잭션 조회 (동일 패턴)
- BE: `GET /api/v1/accounting/cash-disbursements?page=N&size=M&filter=...` + `GET /api/v1/accounting/cash-receipts`
- DTO: UUID 비공개, slipNo + partnerName + amount + journalNo (linked) + kind

### 2.2 Order 화면
- `OrderListPage.tsx` — 주문서 목록 + progress_status 필터 + 매니저명 검색
- `OrderDetailPage.tsx` — Order + OrderLine 상세
- BE: `GET /api/v1/accounting/orders` + `GET /api/v1/accounting/orders/{orderNo}`
- 응답 DTO: orderNo + partnerName + managerName + progressStatus + linkedSlipNo + lines[]

### 2.3 AgingSnapshot 화면
- `PartnerAgingSnapshotPage.tsx` — partner_aging_snapshot view 조회 + net 컬럼 표시 + 새로고침 버튼 (POST refresh)
- BE: `GET /api/v1/accounting/aging-snapshot?partner_name=&sort=net_receivable_desc`
- 응답: partnerName + total_receivable / total_payable / total_receipt / total_disbursement / net_receivable / net_payable / net_cash + last_refreshed_at

### 2.4 Ledger 화면
- `SalesLedgerPage.tsx` + `PurchaseLedgerPage.tsx` — staging.ecount_sales_ledger_raw / purchase_ledger_raw 조회
- BE: `GET /api/v1/accounting/ledger/sales` + `GET .../purchase`
- DailyClosing 대조 결과 표시 (raw_total vs closing_total vs diff)

---

## 3. 산출 예정 (80~100 file, 약 6~8K LOC)

| 영역 | 신규 |
|---|---|
| accounting-service | 7 endpoint (Cash 2 + Order 2 + Aging 2 + Ledger 2) + DTO 7종 + Repository query method |
| auth-service | V25 PageCode MIG14 4종 (CASH/ORDER/AGING/LEDGER) + role_page_permissions |
| clients/desktop | React route 7 페이지 (Cash/Order/Aging/Ledger) + sidebar 메뉴 + Permission Guard |
| design-system | 4 화면 token (테이블 정렬/필터/페이지네이션) |
| docs/qa | Playwright spec 4 spec + 화면 capture 4 PNG |
| DynamicPermissionClient 청소 | 30+ IT (accounting-service + user-service + inventory-service + slip-service + notification-service + partner-order-service) — shared/security PermissionGuard 통합 인터페이스로 교체 |

---

## 4. UI 패턴 (Designer 의무)

- Pretendard 폰트 + WCAG 2.1 AA contrast
- 테이블: 페이지네이션 50 row + sort + filter chip
- 필터 패턴: partner_name 검색 + transaction_date range + status enum
- Permission Guard: `<PermissionGuard action="VIEW" page="ecount.mig9.cash-journal.disbursement">` HOC
- UUID 비공개 가드 ([feedback_uuid_no_user_visibility])
- 한국어 의무

---

## 5. DynamicPermissionClient 청소 (D-MIG-13 이연)

30+ IT 의 `@MockBean DynamicPermissionClient` → SP-D5 의 `shared/security` 통합 인터페이스 사용:
- accounting-service IT: 19건 (TaxInvoice* / EcountMig* / Sales/PurchaseAccountingSlip* 등)
- user-service IT: 3건
- inventory-service IT: 2건
- slip-service IT: 5건
- notification-service IT: 3건
- partner-order-service IT: 1건

각 IT 가 deprecated DynamicPermissionClient 의 `canView` / `canEdit` mock → 통합 인터페이스로 교체. 단 deprecated 제거는 별 슬라이스 (운영 검증 후).

---

## 6. 결정 (D-MIG-14-XX)

- D-MIG-14-01 4 화면 통합 PR (사용자 결정)
- D-MIG-14-02 admin UI = `clients/desktop/src/renderer/routes/accounting/admin/` 위치
- D-MIG-14-03 Permission Guard = 기존 sp-d5 PermissionGuard 컴포넌트 활용
- D-MIG-14-04 UUID 비공개 (응답 DTO 비즈니스 식별자만)
- D-MIG-14-05 DynamicPermissionClient @MockBean 일괄 교체 (30+ IT)
- D-MIG-14-06 PageCode MIG14 4종 (V25 auth)
- D-MIG-14-07 ErrorCode MIG14 추가 X (기존 사용)
- D-MIG-14-08 Playwright spec 4 + 화면 capture 4 PNG
- D-MIG-14-09 PM 자율 연속 + 옵션 A 12단계

---

## 7. 옵션 A 12단계 + 5-team 매트릭스

| Team | 산출 |
|---|---|
| **Designer** | 4 화면 wireframe + token + a11y + Pretendard |
| **BE** | 7 endpoint + DTO 7종 + Repository query + V25 |
| **FE** | React route 7 + sidebar 메뉴 + Permission Guard |
| **QA** | Playwright spec 4 + 화면 capture + 25+ IT (DynamicPermissionClient 청소) |
| **DevOps** | CI + GitGuardian |

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 자율 연속 진행
