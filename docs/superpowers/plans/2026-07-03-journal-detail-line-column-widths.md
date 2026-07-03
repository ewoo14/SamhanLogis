# 분개 상세 라인 테이블 열 너비 정비 (개발책임자 지시 fix)

> 2026-07-03 개발책임자: "차변 열 너비가 너무 넓음. 거래처 너비가 더 넓게 하되, 차변 왼쪽으로 이동."

## 현행 (JournalDetailPage.tsx 라인 테이블 DataTable columns)
`#` 40px · 계정과목 220px · 차변 140px · 대변 140px · 거래처 180px · 메모(무지정=flexible). 차변 값(우측정렬)이 계정과목 넓은 폭+차변 폭에 밀려 오른쪽 멀리 위치 → "차변이 너무 넓다/멀다".

## 변경
- 계정과목 220→**160px**·차변 140→**110px**(대변 동일 110px — 차/대 금액 열 짝 유지) → **차변 열 시작 위치가 왼쪽으로 당겨짐**.
- 거래처 180→**260px**(확대). 메모=flexible 유지.
- 모바일 무영향 — 이 페이지의 모바일 분기는 `detail-mobile-hide`(테이블 숨김)+자체 카드 리스트이며 ≤768px 에선 colgroup width 자체가 무효(정정: 종전 "mobilePriority" 표기는 기제 오기).
- 🔴 리뷰 적발 반영: 합계 행 `.journal-totals` grid 가 테이블 열폭을 미러하므로 **동수치 갱신 필수**(40/160/110/110/1fr) + `DataTable tableLayout="fixed"` + gap 0 / 셀 padding 동기화.
- 백로그(개발책임자 확인): 거래처 열은 현재 BE `JournalLineResponse` 에 `partnerName`/`accountName` 표시 필드가 없어 실제 서버 상세에서는 전행 '—' 또는 코드 중심 표시가 될 수 있음 — BE DTO enrich 후속(별도 슬라이스) 필요.

## 검증
- vitest(JournalDetailPage.test.tsx 회귀)·typecheck.
- 라이브 QA: 실 분개 상세(오늘 S2 분개)에서 열 배치 GUI 캡처 + 라인 금액 셀과 합계 금액 셀 right edge 수치 단언. 분개장 목록 캡처는 현재 REVERSED 목록 화면에서 `J-2026-` 잔여 노출 0건을 실증한다.

## 최종 구현 정정 노트 (Opus 재검 fix 라운드, 2026-07-03)
- 위 "변경" 절의 초기 계획은 합계를 별도 `.journal-totals` div-grid 로 테이블 열폭을 미러하는 방식이었으나, 최종 구현은 **합계를 `DataTable` 마지막 행(`journal-total-row` sentinel row)으로 편입** — 열 정렬을 테이블 구조 자체가 보장하도록 변경(개발책임자 "합계열이 안 맞음" 재지적 해소).
- 계정과목/거래처/메모 셀은 `JournalCellEllipsis` 래퍼(`journal-cell-ellipsis` + 조건부 `title`)로 통일 — 긴 값은 CSS ellipsis 로 자르고 hover 시 전체값을 title 로 노출.
- 모바일 합계 카드는 결합 문자열("차변 / 대변")이 아니라 라인 카드와 동일한 2열 grid(`mobile-item-metrics`) 패턴으로 차변/대변을 분리 렌더 — 10자리 금액 개행/절단 위험 원천 제거(Opus 재검 HIGH fix).
