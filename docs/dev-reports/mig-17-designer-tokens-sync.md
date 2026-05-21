# MIG-17 Designer tokens.md + Mock 라벨 실 enum 동기화

> 날짜: 2026-05-21  
> 브랜치: `spec/2026-05-21-mig-17-designer-tokens-sync`  
> 범위: docs only

---

## 1. 배경

MIG-14 admin UI 산출 이후 Designer Minor 백로그로 남은 `tokens.md`와 mock wireframe의 상태/구분 라벨을 실제 화면 API enum 계약에 맞춘다. 구현 코드는 건드리지 않고, 디자인 문서와 운영 핸드오프만 동기화한다.

---

## 2. 변경 요약

| 파일 | 변경 |
|---|---|
| `docs/design/mig-14-admin-ui/tokens.md` | CashKind / CashReceiptKind / OrderProgressStatus 라벨과 chip token 매핑 명시 |
| `docs/design/mig-14-admin-ui/01_cash_disbursement_list_mock.md` | Cash kind chip을 지출결의서 / 입금보고서 / 수동 분개 / 기타로 정정 |
| `docs/design/mig-14-admin-ui/02_cash_receipt_list_mock.md` | 화면 라벨을 입금 중심으로 정렬하고 CashReceiptKind chip 표시 정정 |
| `docs/design/mig-14-admin-ui/03_order_list_mock.md` | OrderProgressStatus 라벨을 초안 / 확정 / 진행 중 / 완료 / 취소로 정정 |
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
| `DEPOSIT_REPORT` | 입금보고서 | `status-badge.done` |
| `MANUAL` | 수동 분개 | `status-badge.wip` |
| `OTHER` | 기타 | `status-badge.plan` |

### 3.2 OrderProgressStatus

| enum | 라벨 | chip token |
|---|---|---|
| `DRAFT` | 초안 | `status-badge.plan` |
| `CONFIRMED` | 확정 | `status-badge.wip` |
| `IN_PROGRESS` | 진행 중 | `status-badge.wip` |
| `COMPLETED` | 완료 | `status-badge.done` |
| `CANCELLED` | 취소 | `status-badge.plan` |

### 3.3 Ledger transformStatus

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
| D-MIG-17-04 | 옵션 C 21단계 문맥의 docs-only PM 자율 연속 슬라이스로 처리하며 Gradle 검증은 skip한다. |

---

## 5. 검증

- docs only 변경이므로 Gradle 검증은 skip.
- `git diff --check`로 whitespace 검증한다.
