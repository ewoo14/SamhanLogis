---
name: pm-auto-continuous
description: PM 자율 연속 진행 — 한 슬라이스 머지 후 사용자 개입 없이 다음 슬라이스 자동 진입 (사용자 명시 2026-05-20)
metadata:
  type: feedback
---

# PM 자율 연속 진행 (2026-05-20 사용자 정정)

> 사용자 명시: "PM이 자동으로 계속 다음 단계 진행"

PR 머지 완료 후 사용자가 "진행" 누르지 않아도 PM 이 자율로 다음 슬라이스 spec → plan → Codex 개발 → 사이클 → 머지 무한 반복.

**Why:** 이카운트 마이그레이션 같은 대규모 시리즈 (MIG-1~N) 진행 시 사용자 매번 trigger 입력 부담 회피. PM 자동시작 ([feedback_arologis_extract_autopilot]) 일반화.

**How to apply:**

- 매 머지 후 즉시 다음 슬라이스 후보 (handoff `다음 슬라이스` 섹션) 자동 분석 → branch 생성 → spec/plan → Codex 일괄 → PR → 사이클 1 → PM 자동 머지 → 다음 슬라이스
- 사용자 개입 필수 시점만:
  - 모든 이카운트 마이그레이션 완료 (raw 모두 처리, 도메인 변환 모두 완료) — 다음 Phase 결정 대기
  - **사이클 3 안 미해소 결함** (PM 자동 머지 차단 조건)
  - **GitGuardian critical**, **CVE 발견**, **DB 데이터 손실 risk**
  - 사용자 명시 "stop" / "중단"
- 슬라이스 범위 결정 우선순위:
  1. 직전 슬라이스 이연 항목 (D-MIG-N-XX 이연 명시)
  2. handoff `후보 범위` 섹션 명시
  3. 핵심 기능 우선 + 사용자 영향 큰 순
- 각 슬라이스 머지 후 handoff + samhan-public-overview.html 즉시 동기화 ([feedback_samhan_public_overview_sync])
- **PR 발행 alert / 머지 confirmation 모두 PM 자율 — 사용자 통지 X**

**언제 멈추는가**:
- 시리즈 종료 (이카운트 raw 모두 처리 완료 + 도메인 변환 완료)
- 사이클 3 안 미해소 결함 누적
- 외부 시스템 의존 (NTS API key 부재 등)
- 사용자 명시 stop

관련: [[arologis-extract-autopilot]], [[dual-5agent-review]], [[user-merge-authority]], [[samhan-public-overview-sync]]
