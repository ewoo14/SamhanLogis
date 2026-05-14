---
name: qa-sequential-after-be-fe
description: 2026-05-14 정정 — QA agent 는 BE/FE/Designer 완료 후 sequential dispatch (병렬 X). 실 BE/FE 산출 검증 + 실 화면 캡처 의무
metadata:
  type: feedback
---

5-team 패턴의 **QA agent 는 BE/FE/Designer 완료 후 sequential dispatch** (병렬 5-team 패턴의 정정).

**Why:** 2026-05-14 개발책임자 명시 — "QA 는 다른 에이전트가 끝나고 QA 를 진행해야지 않나?". 기존 5-team 병렬 (BE+FE+Designer+QA+DevOps 동시) 에서는 QA 가 spec 기반 mock 시나리오 + mock PNG 만 작성. 실 BE 코드 / 실 FE 화면 검증 안 됨. mock 산출은 documentation 수준이고 실 회귀 검증 X — 가치 제한.

**How to apply:**

새 디스패치 흐름 (Phase D~F 부터):
1. **1차 병렬** = BE + FE + Designer + DevOps (4 agent parallel)
2. **2차 sequential** = 1차 완료 후 QA agent dispatch — 실 BE 코드 동작 검증 + 실 FE 화면 캡처 + 실 e2e 시나리오 회귀
3. **TM 통합** = 5 worktree merge + 컴파일/회귀 가드 + 문서 동기화 + PR 발행

QA agent prompt 차이 (sequential 단계):
- BE worktree branch 명 + FE worktree branch 명 명시 → QA agent 가 두 branch merge 또는 cherry-pick 후 실 검증
- 실 PNG 캡처 (Mock 아니라 build 후 실 화면) — `npm run dev` electron + `npx expo start --web` mobile + Eureka dashboard + 실 e2e 흐름
- 실 회귀 — `gradlew :services:slip-service:test` Docker 가용 시 실 IT 실행

**참조:** [[feedback_multi_agent_team_pattern]] (기존 5-team 병렬) — 본 메모리가 그것의 정정/보완. QA 단계는 sequential, 다른 4-team 은 병렬 유지.

**예외 (mock 만 충분한 경우):**
- spec/plan 작성 단계 (코드 산출 전)
- 단순 documentation only (예: PR #185, #187 의 mock 캡처)
- 시간 제약 큰 hot-fix

본 case 외 모든 일반 Phase 슬라이스 = sequential QA 의무.
