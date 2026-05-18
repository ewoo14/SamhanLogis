# SP-08-6-5 P2 일마감 + 원장 — 디자인 결정 로그

결정일: 2026-05-18
담당: Designer Agent
슬라이스: SP-08-6-5 P2 일마감 (DailyClose) + 거래처원장 (PartnerLedger)

---

## 1. 범위 결정

| 화면 | 라우트 | mock 파일 |
|------|--------|----------|
| 일마감 목록/처리 | `/accounting/daily-close` | `01_daily_close_screen.html` |
| 일마감 확인 모달 | (modal, 동일 라우트) | `02_daily_close_confirm_modal.html` |
| 거래처원장 조회 | `/accounting/partner-ledger` | `03_partner_ledger_screen.html` |
| 거래처원장 인쇄 | `/accounting/partner-ledger/print` | `04_partner_ledger_print.html` |

---

## 2. 사이드바 — 회계 그룹 갱신

기존 `accounting-slice-A` 3항목 (`계정과목 / 분개장 / 시산표`) 에 신규 2항목 추가:

```
▾ 회계  (ACCOUNTANT/MASTER)
  - 계정과목      /accounting/accounts
  - 분개장        /accounting/journals
  - 시산표        /accounting/balances
  - 일마감        /accounting/daily-close      ← NEW
  - 거래처원장    /accounting/partner-ledger   ← NEW
```

---

## 3. 일마감 화면 설계

### 3-1. 필드 구조 (이카운트 "일/월표" + GAS B 회계 동등)

이카운트 `20260509_091847.png` 메뉴 구조 ("장부 > 일/월표") 참조 + GAS 회계 동등:

| 필드 | 유형 | 비고 |
|------|------|------|
| 마감 일자 | `<input type="date">` | 단일 일자 선택 |
| 거래처 | text search | 부분일치, 공백 = 전체 |
| 마감 상태 | `<select>` | 전체 / 미마감 / 완료 |

### 3-2. 처리 내역 테이블 컬럼

| 컬럼 | 너비 | 정렬 | 비고 |
|------|------|------|------|
| 체크박스 | 44px | center | 선택 처리용 |
| 일자 | 100px | left | yyyy-MM-dd |
| 거래처 | 180px | left | partnerName, UUID 비공개 |
| 전표번호 | 100px | left | slipNo (SS-yyyy-MM-NNN) |
| 건수 | 80px | center | 해당 일자 전표 수 |
| 금액 (원) | 130px | right | tabular-nums |
| 마감 상태 | 110px | center | `<Badge>` — 미마감/완료 |
| 마감 시각 | 160px | left | 완료 시 yyyy-MM-dd HH:mm |
| 비고 | 80px | center | — |

### 3-3. 상태 토큰 신규 3종 (tokens.css 추가 필요)

```css
--close-pending:        #F59E0B;   /* 미마감 — warning 계열 */
--close-pending-bg:     #FEF3C7;
--close-pending-border: #FDE68A;

--close-done:           #047857;   /* 완료 — success 강 */
--close-done-bg:        #D1FAE5;
--close-done-border:    #6EE7B7;

--close-partial:        #9333EA;   /* 부분 마감 (future) */
--close-partial-bg:     #F3E8FF;
--close-partial-border: #D8B4FE;
```

### 3-4. 액션 바

- 선택 N건 + 합계 금액 표시 (왼쪽)
- `[마감 취소]` btn-outline / `[일마감 처리]` btn-success (오른쪽)
- 완료 행: `opacity: 0.7`, 체크박스 `disabled`

### 3-5. 경고 배너

미마감 전표 존재 시 `state-warning` 배너 상단 고정 표시.

---

## 4. 일마감 확인 모달

- 모달 크기: width 560px
- 상단 요약 박스: 3-grid (마감 일자 / 대상 거래처 수 / 총 금액)
- 경고 텍스트: "마감 후 되돌릴 수 없습니다." — `state-warning-bg` 배경
- 거래처 목록: 이름 / 전표 N건 / 미마감 badge / 금액
- footer: `[취소]` + `[일마감 처리]` (btn-success)

---

## 5. 거래처원장 화면 설계

### 5-1. 이카운트 동등 항목

이카운트 `20260509_091847.png` — "장부 > 거래처별거래명세원장 / 거래처관리대장 I/II" 동등.

### 5-2. 필터 필드

| 필드 | 유형 | 비고 |
|------|------|------|
| 조회 시작일 | `<input type="date">` | 기본: 당월 1일 |
| 조회 종료일 | `<input type="date">` | 기본: 오늘 |
| 거래처 | text search | 필수 선택 |
| 전표 유형 | `<select>` | 전체/매출/매입/수금/지급 |

### 5-3. 거래처 요약 카드

조회 결과 상단에 요약 카드 (4 metric):

| 항목 | 색상 |
|------|------|
| 기초 잔액 | `--ledger-debit-color` (#1A1F2E) |
| 기간 차변 합계 | `--ledger-debit-color` |
| 기간 대변 합계 | `--ledger-credit-color` (#1E40AF) |
| 기말 잔액 | `--ledger-balance-pos` (#047857) / `.neg` (#B91C1C) |

### 5-4. 원장 테이블 컬럼

| 컬럼 | 너비 | 정렬 | 비고 |
|------|------|------|------|
| 일자 | 100px | left | MM-dd |
| 전표번호 | 120px | left | monospace, UUID 비공개 |
| 적요 | 1fr | left | |
| 유형 | 80px | center | 매출/매입/수금/지급 pill |
| 차변 (원) | 130px | right | tabular-nums, `--ledger-debit-color` |
| 대변 (원) | 130px | right | tabular-nums, `--ledger-credit-color` |
| 잔액 (원) | 140px | right | tabular-nums, 잔액 부호 색 분기 |
| 비고 | 120px | left | memo |

### 5-5. 특수 행

- **기초잔액 행**: `background: var(--surface-subtle)`, 첫 행 고정
- **합계 행** (tfoot): `border-top: 2px solid`, `background: var(--surface-subtle)`, font-weight: 700

### 5-6. 잔액 색상 규칙

```
양수 잔액 → --ledger-balance-pos (#047857, 녹)
음수 잔액 → --ledger-balance-neg (#B91C1C, 빨강)
0         → --ink-tertiary (#8A95A4, 회색)
```

---

## 6. 거래처원장 인쇄 (A4 Portrait)

### 6-1. 영역 분할

```
@page: A4 portrait (210mm × 297mm), margin: 12mm
본문 영역: 186mm × 273mm
```

| 영역 | 높이 | 비고 |
|------|------|------|
| 제목 헤더 | 12mm | 회사명 (좌) + "거래처원장" 20pt 700 중앙 + 출력일시 (우) |
| 조회 조건 박스 | 16mm | 거래처/기간/담당자/유형 — 2×4 grid |
| 거래처 요약 | 14mm | 기초/차변/대변/기말 4셀 가로 |
| 원장 테이블 | 가변 | 행 높이 8mm, page-break 허용 |
| 서명란 | 14mm | 담당자 확인 / 승인 (우정렬 2박스) |
| 푸터 | 8mm | 회사정보 (좌) + 출력자/일시 (우) |

**budget 검산 (기본 7행 기준):**
```
12 + 4 + 16 + 4 + 14 + 4 + 56(7행×8mm) + 4 + 14 + 4 + 8 = 140mm (여유 133mm)
최대 20행: 12 + 4 + 16 + 4 + 14 + 4 + 160 + 4 + 14 + 4 + 8 = 244mm (여유 29mm)
```

### 6-2. 인쇄 폰트 spec

| 역할 | pt | weight |
|------|----|--------|
| 제목 "거래처원장" | 20pt | 700 |
| 회사명 | 10pt | 700 |
| 조건/요약 라벨 | 9pt | 700 |
| 조건/요약 값 | 9.5pt | 일반 |
| 테이블 헤더 | 9pt | 700 |
| 테이블 본문 | 9pt | 일반 |
| 합계 행 | 9.5pt | 700 |
| 기말잔액 강조 | 10pt | 700 |
| 푸터 | 8pt | 일반 |

### 6-3. 인쇄 색상 정책

| 용도 | 색상 |
|------|------|
| 테이블 헤더 배경 | `#F0F0F0` |
| 기초잔액 행 배경 | `#F8F8F8` |
| 합계 행 배경 | `#F0F0F0` |
| 대변 금액 | `#1E40AF` |
| 양수 잔액 | `#047857` |
| 음수 잔액 | `#B91C1C` |
| 텍스트 기본 | `#000` |
| 보조 텍스트 | `#555` |

---

## 7. design-system 변경 사항

### 신규 토큰 3종 (tokens.css 추가)

`accounting-slice-A` 기존 토큰 외 신규:

```css
/* SP-08-6-5 — 일마감 상태 토큰 */
--close-pending:        #F59E0B;
--close-pending-bg:     #FEF3C7;
--close-pending-border: #FDE68A;
--close-done:           #047857;
--close-done-bg:        #D1FAE5;
--close-done-border:    #6EE7B7;
--close-partial:        #9333EA;
--close-partial-bg:     #F3E8FF;
--close-partial-border: #D8B4FE;

/* SP-08-6-5 — 원장 차변/대변/잔액 색상 */
--ledger-debit-color:   #1A1F2E;    /* = --ink-primary (alias) */
--ledger-credit-color:  #1E40AF;    /* = --action-brand (alias) */
--ledger-balance-pos:   #047857;    /* 양수 잔액 */
--ledger-balance-neg:   #B91C1C;    /* 음수 잔액 */
```

`accounting-slice-A` `tokens.md` 에 이미 차변/대변 토큰 (`--accounting-debit-color` / `--accounting-credit-color`) 존재 — 원장에서는 별도 `--ledger-*` alias 로 분리 (원장 특화 의미 명확화).

### 신규 React 컴포넌트 없음

`JournalStatusBadge` 패턴 준용하여 일마감 상태는 inline Badge variant 확장 또는 별도 `DailyCloseStatusBadge` 컴포넌트로 FE 결정. design-system index.ts 변경 없음.

---

## 8. UUID 비공개 가드

| 화면 표시 | 비고 |
|----------|------|
| 전표번호 (slipNo: SS-yyyy-MM-NNN) | O |
| 거래처명 (partnerName) | O |
| 사업자번호 (businessRegNo) | O (인쇄에서만) |
| 담당자 fullName | O |
| 마감 처리자 fullName | O |
| UUID (모든 internal ID) | X — 절대 노출 금지 |

---

## 9. Iteration 가드 (feedback_print_design_iteration)

본 spec 은 1차 결정. 인쇄 양식 (04_partner_ledger_print.html) 의무 iteration:
1. 1차 mock HTML → Edge 캡처
2. 사용자 피드백 → CSS 미세 조정
3. 2차 Edge 캡처 → 정렬 확인
4. (필요 시) 3~5차 추가 조정

인쇄가 아닌 화면 (01/02/03) 도 1차 mock → 사용자 확인 필수.
