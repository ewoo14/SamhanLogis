# MIG-17 Designer tokens.md + Mock 라벨 실 enum 동기화

> 날짜: 2026-05-21  
> 브랜치: `spec/2026-05-21-mig-17-designer-tokens-sync`  
> 범위: FE 라벨 + docs

---

## 1. 배경

MIG-14 admin UI 산출 이후 Designer Minor 백로그로 남은 FE 라벨, `tokens.md`, mock wireframe의 상태/구분 라벨을 실제 화면 API enum 계약에 맞춘다.

---

## 2. 변경 요약

| 파일 | 변경 |
|---|---|
| `docs/design/mig-14-admin-ui/tokens.md` | CashKind / CashReceiptKind / OrderProgressStatus 라벨과 chip token 매핑 명시 |
| `clients/desktop/src/renderer/routes/accounting/admin/Mig14AdminShared.tsx` | CashKind / CashReceiptKind / OrderProgressStatus 라벨 테이블 정정 |
| `clients/desktop/src/renderer/routes/accounting/admin/CashTransactionList.tsx` | 지출/입금 화면별 kind 라벨/옵션 분리 |
| `docs/design/mig-14-admin-ui/01_cash_disbursement_list_mock.md` | CashKind chip을 지출결의서 / 수기 지출로 정정 |
| `docs/design/mig-14-admin-ui/02_cash_receipt_list_mock.md` | 화면 라벨을 입금 중심으로 정렬하고 CashReceiptKind chip을 입금보고서 / 수기 입금으로 정정 |
| `docs/design/mig-14-admin-ui/03_order_list_mock.md` | OrderProgressStatus 라벨을 완료 / 진행 / 취소 / 대기로 정정 |
| `docs/design/mig-14-admin-ui/04_order_detail_mock.md` | 상세 헤더와 필드 설명의 진행상태 라벨 정정 |
| `docs/design/mig-14-admin-ui/05_partner_aging_snapshot_mock.md` | 집계 라벨을 총입금액 / 총지출액으로 정리하고 kind/status chip 미표시 계약 명시 |
| `docs/design/mig-14-admin-ui/06_sales_ledger_mock.md` | 원장 mock을 `transformStatus` 기준 변환상태 chip으로 정정 |
| `docs/design/mig-14-admin-ui/07_purchase_ledger_mock.md` | 원장 mock을 `transformStatus` 기준 변환상태 chip으로 정정 |

---

## 3. 라벨 계약

### 3.1 CashKind / CashReceiptKind

| enum | 라벨 | chip token |
|---|---|---|
| `EXPENSE_VOUCHER` | 지출결의서 | `status-badge.done` |
| `MANUAL_DISBURSEMENT` | 수기 지출 | `status-badge.wip` |

### 3.2 CashReceiptKind

| enum | 라벨 | chip token |
|---|---|---|
| `DEPOSIT_REPORT` | 입금보고서 | `status-badge.done` |
| `MANUAL_RECEIPT` | 수기 입금 | `status-badge.wip` |

### 3.3 OrderProgressStatus

| enum | 라벨 | chip token |
|---|---|---|
| `COMPLETED` | 완료 | `status-badge.done` |
| `IN_PROGRESS` | 진행 | `status-badge.wip` |
| `CANCELED` | 취소 | `status-badge.plan` |
| `PENDING` | 대기 | `status-badge.plan` |

### 3.4 Ledger transformStatus

| enum | 라벨 | chip token |
|---|---|---|
| `PENDING` | 대기 | `status-badge.wip` |
| `TRANSFORMED` | 변환완료 | `status-badge.done` |
| `REJECTED` | 제외 | `status-badge.plan` |

---

## 4. 결정

| 결정 | 내용 |
|---|---|
| D-MIG-17-01 | `tokens.md`는 CashKind / CashReceiptKind / OrderProgressStatus 화면 API enum과 한국어 라벨을 1:1 표로 명시한다. |
| D-MIG-17-02 | 7개 MIG-14 mock wireframe의 상태 chip/구분 라벨은 `tokens.md` 라벨 계약을 따른다. |
| D-MIG-17-03 | 필터 chip + reset 공통 UI 구현은 MIG-18(E admin UI 2단계)로 이연하고, 이번 슬라이스는 라벨/문서 정합만 처리한다. |
| D-MIG-17-04 | 옵션 C 21단계 문맥의 사이클 1c CRITICAL fix로 처리하며 FE typecheck/build와 accounting-service test를 검증한다. |

---

## 5. 검증

- `clients/desktop npm run typecheck`
- `clients/desktop npm run build`
- `./gradlew :services:accounting-service:test --no-daemon`
- `git diff --check`

---

## 6. 사이클 1c 회고

MIG-14부터 FE 라벨 테이블이 실제 BE enum과 불일치했다. MIG-17 초안도 이 오류를 다시 덮어써 `CashKind`에 `DEPOSIT_REPORT` / `MANUAL` / `OTHER`, `OrderProgressStatus`에 `DRAFT` / `CONFIRMED` / `CANCELLED`를 문서화했다. 실제 enum은 `CashKind={EXPENSE_VOUCHER, MANUAL_DISBURSEMENT}`, `CashReceiptKind={DEPOSIT_REPORT, MANUAL_RECEIPT}`, `OrderProgressStatus={COMPLETED, IN_PROGRESS, CANCELED, PENDING}`이며, 본 사이클 1c에서 FE 라벨과 문서 산출물을 모두 이 계약으로 되돌린다. 분류: CRITICAL.
