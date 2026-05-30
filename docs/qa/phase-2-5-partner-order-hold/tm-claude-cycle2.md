# 🔍 TM 통합 리뷰 — Phase 2.5 주문 보류+필터 · Cycle 2 (Claude 5-agent 재리뷰)

> HEAD cycle1 fix `7c41e0d9` → 2c fix 후. 사이클 N=2 의무([[cycle-n2-mandatory]]).

## 종합 판정: APPROVE (cycle2). 차단 결함 0.

### cycle1 fix 검증 + cycle2 신규 결함 처리
| 항목 | 결과 |
|---|---|
| P1-1/1-2 list COALESCE 통일 | ✅ status=null/CONFIRMING 누락 해소 |
| P1-3 FE 기간필터 분기 | ✅ FE APPROVE (Minor: status 복귀 시 수동기간 리셋, 후속) |
| P1-4 ON_HOLD=warning 뱃지 | ✅ |
| **P1-NEW (cycle2 발견)**: COALESCE query.orderBy 가 count 쿼리 오류 위험 | ✅ **2c fix** — count 쿼리(getResultType==Long) orderBy skip 가드 + totalElements IT 단언 |
| @Version 보호 / 버튼 disabled·onError / variant 위계 | ✅ |

### 검증
- BE compileJava+compileTestJava SUCCESS / **HoldStatusFilterIT 10 PASS skipped=0**(count 가드 회귀 없음) / FE typecheck 0
- BE/FE/QA cycle2 APPROVE

### 잔여 비차단 (후속)
- ON_HOLD 복원(Phase 2.4 requireRestorable 연계) IT 명시 케이스 — 로직상 자동 허용(제외목록 CONFIRMING/CANCELED만 409), 후속 가드.
- FE status 복귀 시 수동 기간 리셋 UX / Playwright 라벨 단언 보강 / COALESCE 시간대 경계(dev-report 명시됨) / (선택) status 인덱스.

→ CI green(skipped=0) → Docker 실 QA → 머지.
