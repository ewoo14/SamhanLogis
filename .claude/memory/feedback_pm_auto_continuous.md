---
name: pm-auto-continuous
description: PM 자율 연속 진행 — 한 슬라이스 머지 후 사용자 개입 없이 다음 슬라이스 자동 진입 (사용자 명시 2026-05-20)
metadata:
  type: feedback
---

# PM 자율 연속 진행 (2026-05-20 사용자 정정)

> 사용자 명시: "PM이 자동으로 계속 다음 단계 진행"

PR 머지 완료 후 사용자가 "진행" 누르지 않아도 PM 이 자율로 다음 슬라이스 spec → plan → Codex 개발 → 사이클 → 머지 무한 반복.

## 스펙 리뷰 게이트도 PM 자율 (2026-06-04 사용자 명시)

> "앞으로 스펙은 프로젝트를 관할하는 PM이 보고 자율 진행 요청"

superpowers brainstorming 의 **User Review Gate(스펙 사용자 검토)를 PM(Claude) 자체 판정으로 갈음**. 스펙 작성·self-review 후 사용자 승인 대기 없이 writing-plans → 구현으로 연속 진행. **단, 설계 방향을 가르는 진짜 결정(범위·정책·시퀀싱)은 여전히 AskUserQuestion(마우스 선택)으로 확인** — 자율은 "검토 게이트 생략"이지 "결정 생략"이 아님.

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
- **spec 구현 시 세부 결정도 PM 판단 자율** (2026-06-02 개발책임자 "spec 구현시 PM 판단 하 자율 진행"): 구현 중 매 결정마다 AskUserQuestion 묻지 말고 PM 판단으로 진행. [[always-mouse-choices]] 는 **중대 갈림길**(범위·도메인 모델·비가역 결정)에만 적용. 구현 디테일(생명주기 배선, API 형태, 테스트 구조 등)은 자율 결정 + commit/dev-report 에 근거 박제.

**언제 멈추는가**:
- 시리즈 종료 (이카운트 raw 모두 처리 완료 + 도메인 변환 완료)
- 사이클 3 안 미해소 결함 누적
- 외부 시스템 의존 (NTS API key 부재 등)
- 사용자 명시 stop

관련: [[arologis-extract-autopilot]], [[dual-5agent-review]], [[user-merge-authority]], [[samhan-public-overview-sync]]
