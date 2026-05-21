# MIG-17 Designer tokens.md + Mock 라벨 실 enum 동기화 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-17-designer-tokens-sync`
> 입력: MIG-14 Designer Minor 백로그

---

## 1. 개요

MIG-16 머지 후 PM 자율 연속 — **G Designer 라벨/Mock 동기화** (docs only).

- baseline: MIG-1~16 머지
- 옵션 C 21단계

---

## 2. 동기화 항목

### 2.1 tokens.md 라벨 매핑 (MIG-14 Designer-MIN-1)

`docs/design/mig-14-admin-ui/tokens.md:127-137`:

기존: `DISBURSEMENT/RECEIPT/READY/IN_PROGRESS/DONE/CANCELED` 매핑
변경: **실 도메인 enum 값** 일치
- `CashKind`: `EXPENSE_VOUCHER` / `DEPOSIT_REPORT` / `MANUAL` / `OTHER`
- `CashReceiptKind`: 동일 패턴
- `OrderProgressStatus`: `DRAFT` / `CONFIRMED` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED`

각 enum 의 한국어 표시 라벨 정의:
- `EXPENSE_VOUCHER` → "지출결의서"
- `DEPOSIT_REPORT` → "입금보고서"
- `MANUAL` → "수동 분개"
- `OTHER` → "기타"
- `DRAFT` → "초안"
- `CONFIRMED` → "확정"
- `IN_PROGRESS` → "진행 중"
- `COMPLETED` → "완료"
- `CANCELLED` → "취소"

### 2.2 4 mockup wireframe 정합 갱신 (MIG-14 Designer-MIN-2)

`docs/design/mig-14-admin-ui/` 4 mockup md 의 상태 chip + 라벨 → 실 enum 값으로 정정. 필터 chip + reset 패턴은 MIG-18 (E admin UI 2단계) 이연 명시.

---

## 3. 산출 예정 (5~10 file, 약 100~200 LOC docs only)

| 영역 | 변경 |
|---|---|
| docs/design/mig-14-admin-ui/tokens.md | 라벨 enum 정확 매핑 |
| docs/design/mig-14-admin-ui/01~07 mockup | 상태 chip + 라벨 정정 |
| dev-report | D-MIG-17-01~02 |

---

## 4. 결정 (D-MIG-17-XX)

- D-MIG-17-01 tokens.md 라벨 실 enum 매핑 (CashKind / CashReceiptKind / OrderProgressStatus)
- D-MIG-17-02 4 mockup wireframe 상태 chip + 라벨 정정
- D-MIG-17-03 chip + reset 필터 UI 는 MIG-18 (E admin UI 2단계) 이연 명시
- D-MIG-17-04 옵션 C 21단계 + PM 자율 연속

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 자율 연속
