# MIG-14 관리자 화면 토큰

현금, 주문서, 거래처 잔액 스냅샷, 원장 7개 화면은 기존 데스크톱 관리자 레이아웃을 유지한다. 본 문서는 FE 구현 시 새 별칭 토큰으로만 추가하고, 기존 전역 토큰은 변경하지 않는다.

---

## 1. 기본 서체

- 기본 서체: `Pretendard`, `Apple SD Gothic Neo`, `Malgun Gothic`, `sans-serif`
- 숫자 표기: 금액, 수량, 페이지 번호는 `font-variant-numeric: tabular-nums`
- 화면 제목: 20px / 600
- 테이블 본문: 13px / 400
- 테이블 헤더: 12px / 600 / 글자 간격 0
- 필터 chip, 상태 badge: 12px / 600

---

## 2. WCAG AAA 대비 목표

관리자 화면은 장시간 표 조회가 핵심이므로 텍스트 대비는 WCAG AAA를 목표로 한다.

| 용도 | 전경 | 배경 | 최소 대비 |
|---|---|---|---|
| 기본 본문 | `#111827` | `#FFFFFF` | 7:1 이상 |
| 보조 텍스트 | `#374151` | `#FFFFFF` | 7:1 이상 |
| 비활성 텍스트 | `#4B5563` | `#F9FAFB` | 7:1 이상 |
| 링크/강조 | `#1D4ED8` | `#FFFFFF` | 7:1 이상 |
| 오류 | `#991B1B` | `#FEF2F2` | 7:1 이상 |
| 성공 | `#065F46` | `#ECFDF5` | 7:1 이상 |
| 경고 | `#854D0E` | `#FFFBEB` | 7:1 이상 |

배경만으로 상태를 구분하지 않는다. 모든 상태 badge는 텍스트와 아이콘 또는 명확한 라벨을 함께 사용한다.

---

## 3. 테이블 토큰

```css
:root {
  --mig14-table-header-bg: #F3F4F6;
  --mig14-table-header-fg: #111827;
  --mig14-table-row-bg: #FFFFFF;
  --mig14-table-row-hover-bg: #EFF6FF;
  --mig14-table-row-selected-bg: #DBEAFE;
  --mig14-table-border: #D1D5DB;
  --mig14-table-cell-pad-y: 10px;
  --mig14-table-cell-pad-x: 12px;
  --mig14-table-row-h: 44px;
  --mig14-table-empty-bg: #F9FAFB;
}
```

- 기본 페이지 크기: 50행
- 헤더는 고정 가능, 높이 40px
- 금액 컬럼은 우정렬, 음수는 `-120,000`처럼 부호를 금액 앞에 표시
- `slipNo`, `orderNo`, `journalNo`는 좌정렬 링크 스타일
- UUID, 내부 행 키, DB 식별자는 화면에 표시하지 않는다

---

## 4. 필터 chip 토큰

```css
:root {
  --mig14-filter-chip-bg: #FFFFFF;
  --mig14-filter-chip-fg: #111827;
  --mig14-filter-chip-border: #9CA3AF;
  --mig14-filter-chip-active-bg: #DBEAFE;
  --mig14-filter-chip-active-fg: #1E3A8A;
  --mig14-filter-chip-active-border: #1D4ED8;
  --mig14-filter-chip-remove-fg: #374151;
}
```

- 필터 chip은 적용된 조건만 표시한다.
- 삭제 버튼은 `×` 아이콘 + 접근성 라벨 `필터 제거`를 사용한다.
- 날짜 범위는 `2026-05-01 ~ 2026-05-31` 형식으로 표시한다.
- 거래처 조건은 `거래처: 삼한공조`처럼 업무 식별자만 표시한다.

---

## 5. 페이지네이션 토큰

```css
:root {
  --mig14-pagination-item-size: 32px;
  --mig14-pagination-gap: 4px;
  --mig14-pagination-bg: #FFFFFF;
  --mig14-pagination-fg: #111827;
  --mig14-pagination-border: #9CA3AF;
  --mig14-pagination-active-bg: #1D4ED8;
  --mig14-pagination-active-fg: #FFFFFF;
  --mig14-pagination-disabled-fg: #4B5563;
}
```

- 좌측: `총 128건 · 50건씩 보기`
- 우측: `처음`, `이전`, 페이지 번호, `다음`, `끝`
- 키보드 포커스는 2px outline으로 표시한다.

---

## 6. 상태 토큰

```css
:root {
  --mig14-status-neutral-fg: #374151;
  --mig14-status-neutral-bg: #F3F4F6;
  --mig14-status-neutral-border: #9CA3AF;

  --mig14-status-success-fg: #065F46;
  --mig14-status-success-bg: #ECFDF5;
  --mig14-status-success-border: #059669;

  --mig14-status-warning-fg: #854D0E;
  --mig14-status-warning-bg: #FFFBEB;
  --mig14-status-warning-border: #D97706;

  --mig14-status-danger-fg: #991B1B;
  --mig14-status-danger-bg: #FEF2F2;
  --mig14-status-danger-border: #DC2626;
}
```

상태 라벨 매핑:

| 영역 | 값 | 표시 |
|---|---|---|
| Cash kind | `DISBURSEMENT` | 지출 |
| Cash kind | `RECEIPT` | 회수 |
| 주문 진행 | `READY` | 준비 |
| 주문 진행 | `IN_PROGRESS` | 진행 |
| 주문 진행 | `DONE` | 완료 |
| 주문 진행 | `CANCELED` | 취소 |
| 원장 대조 | `MATCHED` | 일치 |
| 원장 대조 | `DIFF` | 차이 |
| 원장 대조 | `MISSING_CLOSING` | 결산 없음 |

---

## 7. 공통 상태 화면

| 상태 | 표시 규칙 |
|---|---|
| 로딩 | 표 skeleton 8행, 필터 영역은 유지 |
| 빈 결과 | `조건에 맞는 자료가 없습니다.` + `필터 초기화` 버튼 |
| 오류 | `자료를 불러오지 못했습니다.` + `다시 시도` 버튼 |
| 권한 없음 | `이 화면을 볼 권한이 없습니다.` + `관리자에게 권한을 요청하세요.` |
| 부분 갱신 실패 | 기존 표 유지 + 상단 안내문 |
