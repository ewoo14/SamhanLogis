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
