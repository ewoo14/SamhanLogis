# MIG-14 admin UI 4 화면 통합 — Plan

> 큰 슬라이스 — Designer + BE + FE + QA + DevOps 5-team 병렬.

**Goal:** Cash + Order + AgingSnapshot + Ledger 4 admin 화면 통합 + DynamicPermissionClient @MockBean 30+ IT 청소.

---

## 작업 그룹 19 (Codex 5-team 일괄)

### Designer Task: 4 화면 wireframe + token

- `docs/design/mig-14-admin-ui/` 폴더 신규
- `01_cash_disbursement_list_mock.md`
- `02_cash_receipt_list_mock.md`
- `03_order_list_mock.md` + `04_order_detail_mock.md`
- `05_partner_aging_snapshot_mock.md`
- `06_sales_ledger_mock.md` + `07_purchase_ledger_mock.md`
- `tokens.md` — 테이블 / 필터 chip / 페이지네이션 + WCAG AAA contrast

### BE Task: 7 endpoint + DTO

#### accounting-service

- `GET /api/v1/accounting/cash-disbursements` (page/size/filter) + `CashDisbursementResponse` (UUID 비공개)
- `GET /api/v1/accounting/cash-receipts`
- `GET /api/v1/accounting/orders` (filter: progressStatus / managerName / partnerName)
- `GET /api/v1/accounting/orders/{orderNo}` + `OrderDetailResponse` (lines[])
- `GET /api/v1/accounting/aging-snapshot` (filter/sort) + 새로고침 endpoint 재사용 (MIG-9 의 `/aging-snapshot/refresh`)
- `GET /api/v1/accounting/ledger/sales` (page/filter)
- `GET /api/v1/accounting/ledger/purchase`

#### Repository

- `CashDisbursementRepository.findBy*` (Spring Data JPA query method 또는 Specification)
- `OrderRepository.findBy*` + `OrderLineRepository.findByOrderId`
- `PartnerAgingSnapshotRepository` 신규 (MATERIALIZED VIEW JPA mapping)
- `SalesLedgerRepository` + `PurchaseLedgerRepository` (staging row JPA / JdbcTemplate)

#### V25 auth Flyway

- PageCode MIG14 4종:
  - `ECOUNT_MIG14_CASH_LIST`
  - `ECOUNT_MIG14_ORDER_LIST`
  - `ECOUNT_MIG14_AGING_SNAPSHOT`
  - `ECOUNT_MIG14_LEDGER`
- role_page_permissions 8건 (MASTER/MANAGER true)

### FE Task: React route + sidebar 메뉴

- `clients/desktop/src/renderer/routes/accounting/admin/`
  - `CashDisbursementListPage.tsx`
  - `CashReceiptListPage.tsx`
  - `OrderListPage.tsx` + `OrderDetailPage.tsx`
  - `PartnerAgingSnapshotPage.tsx`
  - `SalesLedgerPage.tsx` + `PurchaseLedgerPage.tsx`
- `Sidebar.tsx` — admin 섹션에 4 메뉴 추가
- `PermissionGuard` HOC 적용 (페이지별 PageCode)
- React Query 데이터 fetch + 페이지네이션 + 필터
- 한국어 의무

### QA Task: Playwright spec + DynamicPermissionClient 청소

#### Playwright spec 4 (4 화면 × 4~5 case)
- `mig-14-cash-admin.spec.ts` — Cash 목록 + 필터 + Permission Guard
- `mig-14-order-admin.spec.ts` — Order 목록 + 상세 + progress filter
- `mig-14-aging-snapshot-admin.spec.ts` — aging view + 새로고침
- `mig-14-ledger-admin.spec.ts` — 매출/매입 ledger
- 각 spec: 200 정상 / Permission denied / 빈 결과 / 페이지네이션 / 화면 capture PNG

#### DynamicPermissionClient @MockBean 청소 (30+ IT)
- shared/security 의 PermissionGuard 통합 인터페이스로 일괄 교체
- 각 IT 의 `@MockBean DynamicPermissionClient` → 신 인터페이스 `@MockBean`
- 변경 IT: TaxInvoice* / EcountMig* / Sales/PurchaseAccountingSlip* / DispatchTask* / Estimate* / Notification* / PartnerOrder* 등

### DevOps Task: CI + GitGuardian

- ci.yml paths-ignore 확인 (clients/desktop/src 추가 시 영향)
- Playwright fixture 자격 평문 가드
- frontend desktop typecheck + lint + build CI job

### Plan (TM) Task: 문서 동기화

- spec/plan 검증 + dev-report 신규 `docs/dev-reports/mig-14-admin-ui-4-screens.md`
- ROADMAP / DECISIONS (D-MIG-14-01~09) / 4 service README / overview HTML

---

## 검증

```
./gradlew :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon
cd clients/desktop && npm run typecheck && npm run lint && npm run build
cd clients/desktop && npx playwright test mig-14-*
```

BUILD SUCCESSFUL + Playwright PASS 후 commit:

```
feat(mig-14): admin UI 4 화면 통합 (Cash/Order/AgingSnapshot/Ledger) + DynamicPermissionClient @MockBean 청소

- 7 GET endpoint (Cash 2 + Order 2 + Aging 1 + Ledger 2) + DTO 7종 (UUID 비공개)
- PageCode MIG14 4종 (V25 auth) + role_page_permissions
- React route 7 페이지 + sidebar 메뉴 + PermissionGuard
- Designer 4 mockup + token (WCAG AAA)
- Playwright spec 4 + 화면 capture 4 PNG
- DynamicPermissionClient @MockBean 30+ IT → shared/security 통합 인터페이스 교체
- PartnerAgingSnapshotRepository (MATERIALIZED VIEW JPA mapping)

옵션 A 12단계 + 5-team 병렬.
```

push: `origin spec/2026-05-21-mig-14-admin-ui-4-screens`
