---
name: no-backlog-strict
description: 사이클 안 모든 결함 fix 의무 — "schema 변경 동반", "PR scope 외", "후속 슬라이스 분리" 등 백로그 정당화 표현 모두 금지. PR #301 위반 회고 (2026-05-26).
metadata:
  type: feedback
---

## 규칙

`feedback_dual_5agent_review.md` line 180-181 의 "**PR 안 모든 fix 의무**" 는 다음 모든 경우에 적용:

- review 가 "본 PR scope 외" 라고 명시한 결함 → **본 PR 에 포함**
- "schema 변경 동반이라 다음 슬라이스" → **본 PR 에서 해결 가능한 fix 가 있다면** (예: PESSIMISTIC_WRITE) 본 PR 적용
- "동일 패턴이 N 도메인에 존재" → **N 도메인 모두 본 PR 일괄 fix**
- "범위가 너무 커진다" → 범위 축소 위해 단순 fix 우선, 정교한 schema 변경은 후속 — 단 본 PR 의 회귀 위험 0 도달 의무

## Why (2026-05-26 사용자 정정)

PR #301 사이클 1d Codex P2-BE-1 (race condition) 을 사이클 1e 에서 "schema 변경 동반이라 Slice 5 백로그" 로 미루고 머지 → 사용자 지적 "백로그가 있는데 사이클이 더 진행 안되었어?" → hotfix PR #302 발행.

PR #302 review 가 P1 (동일 race 6 도메인) + P2 (consumeApproval / lock_timeout) 발견 → 사용자 결정 "엄격 메모리 준수" — 본 PR scope 확대로 30 file 일괄 fix.

**핵심 학습**:
1. PM 의 백로그 정당화는 검증 미스 가능성 → 사용자 지적 위험 매우 높음
2. 단순 fix (pessimistic lock, application.yml 한 줄) 로 큰 결함 해소 가능 → schema 변경 동반 판단은 신중
3. "PR scope" 와 "review 발견 결함" 의 차이를 백로그 분리 사유로 삼지 말 것 — 같은 review 의 P1+P2 는 본 PR 내

## How to apply

### Cycle 1c / 1e Codex fix 진행 직전 체크리스트

1. ☐ review 표 모든 결함 정렬 (P0/P1/P2/Minor)
2. ☐ 각 결함의 fix 난이도 평가 — **schema 변경 가능성 우선 의심**, 단순 fix (lock, config, helper) 가능한가?
3. ☐ "본 PR scope 외" 표현 reviewer 가 사용 → PM 이 결함의 본질 (같은 코드 패턴, 같은 위험) 재평가 → 본 PR 포함
4. ☐ scope 확대 결정 시 사용자에게 한 줄 보고 ("scope 확대 — N 도메인 일괄 fix"), 사용자 결정 대기 옵션 X
5. ☐ Codex 디스패치 시 명확한 Task 분리 (Task A / B / C / D) — 한 디스패치에 모든 fix
6. ☐ 검증: 영향 받는 모든 service 의 test 통과 + cross-domain 회귀 검증

### "백로그" 가 적용되는 유일한 케이스

`feedback_dual_5agent_review.md` line 186 — **사이클 3 review 까지** 잔존 결함 0 도달 못 한 경우의 blocker 만 fix + Nit 백로그. **사이클 1/2 에서는 백로그 분리 금지**.

## 위반 회고

- PR #301 (Slice 4 — APPROVAL 채널): 사이클 1e 에서 race condition 백로그 → 사용자 지적 → hotfix PR #302 발행
- PR #302 (race hotfix): 사이클 1a 에서 6 도메인 동일 패턴 발견 → 사용자 결정 "엄격 준수" → cycle 1c scope 확대 (30 file)

[[dual-5agent-review]] [[user-merge-authority]] [[integrated-pr-pattern]]
