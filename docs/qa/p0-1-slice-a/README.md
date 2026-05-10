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

---

## PR #134 FE+Designer 결함 12건 fix QA (2026-05-10)

### 추가 체크리스트 (fix 결함 검증)

- [ ] D1: 손익계산서 / 재무상태표 — 개발자도구 Computed Styles 에서 raw hex 미사용 확인 (CSS 변수만 사용)
- [ ] D2: 재무상태표 balanced=false 배너 — `--state-danger-bg` 배경 / `--state-danger` 텍스트
- [ ] D2: 재무상태표 균형 텍스트 — balanced=true 시 `--color-success`, false 시 `--color-danger`
- [ ] D3: 손익계산서 당기순이익 행 — dark 배경 (`--color-neutral-900`) + 흰 텍스트 (`--color-neutral-0`)
- [ ] D4: 합계 행 `.report-total-row` class 확인 (background-color: `--color-neutral-100`)
- [ ] D4: 최종 행 `.report-grand-total-row` class 확인 (background-color: `--color-neutral-900`)
- [ ] D5: [인쇄] 버튼 클릭 → 새 탭으로 인쇄 전용 URL 열림
- [ ] D5: `/accounting/reports/income-statement/print?period=202604` 정상 렌더
- [ ] D5: `/accounting/reports/balance-sheet/print?asOfDate=2026-04-30` 정상 렌더
- [ ] D6: 인쇄 레이아웃 헤더 보고서명 → 18pt (var(--print-text-lg)) 확인
- [ ] D7: 에러 상태 배너 — `--state-danger-bg` 배경 토큰 확인
- [ ] F1: 손익계산서 진입 시 사이드바 "재무 보고서" active 표시 안 됨 (end prop 검증)
- [ ] F2: 회계 월 / 기준일 Input — `<label htmlFor>` ↔ `<input id>` 연결 (접근성 검증)
- [ ] F3: sortOrder 정렬 — 임의 순서 mock 도 화면에서 올바른 순서 표시
- [ ] Q3: mock period 형식 'YYYYMM' = BE 형식 일치 확인 (202604)

### 스크린샷 캡처 예정

| 파일명 | 내용 |
|---|---|
| `income-statement-fix-qa.png` | 손익계산서 토큰 적용 후 (합계 배경 / grand-total 배경) |
| `balance-sheet-fix-qa.png` | 재무상태표 불균형 배너 + 합계 배경 |
| `print-income-statement.png` | 손익계산서 인쇄 새 창 |
| `print-balance-sheet.png` | 재무상태표 인쇄 새 창 |

[캡처 예정 — Slice A 머지 후 mock 모드 구동 후 보강]
