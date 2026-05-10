# QA — P0-1 Slice A: 재무 보고서 FE

## 검증 환경

- `VITE_MOCK_MODE=1` + `?mockRole=MASTER`
- `cd clients/desktop && npm run dev`

## 체크리스트

- [ ] `/accounting/reports` — 3개 카드 (손익계산서 / 재무상태표 / 시산표) 표시
- [ ] `/accounting/reports/income-statement` — 월 선택 → 조회 → 한국 회계 양식 표시
- [ ] 손익계산서 음수 금액 빨강, 합계 행 굵게
- [ ] 손익계산서 [인쇄] 클릭 → print dialog 열림 (회사 헤더 포함)
- [ ] `/accounting/reports/balance-sheet` — 기준일 선택 → 조회 → 좌/우 두 열 표시
- [ ] 재무상태표 balanced=true 시 녹색 균형 메시지
- [ ] 재무상태표 balanced=false 시 상단 빨강 배너 (mock 수동 전환 테스트)
- [ ] `/accounting/balances` — summary 카드 (총 차변 / 총 대변 / 균형 chip) 표시
- [ ] 사이드바 회계 그룹 — "재무 보고서 / 손익계산서 / 재무상태표" 서브메뉴 표시
- [ ] `data-testid="accounting-income-statement-table"` 존재
- [ ] `data-testid="accounting-balance-sheet-table"` 존재
- [ ] `data-testid="accounting-trial-balance-summary"` 존재

## 스크린샷 위치

`docs/qa/p0-1-slice-a/*.png` — mock 모드 Edge 캡처 후 첨부.
