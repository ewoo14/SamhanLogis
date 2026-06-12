---
name: 다모델 리뷰 워크플로우 (현행 단일)
description: 슬라이스 사이클 = Opus 계획/PR → Codex 개발 → Opus 5-agent → Codex 5-agent → Fable5 5-agent → PM. 각 라운드 5-agent에 QA agent 포함 + 스크린샷을 그 라운드 리뷰에 게시. 구 워크플로우 전부 대체
metadata:
  type: feedback
---
2026-06-11 개발책임자 지시 / 2026-06-12 재확인("내가 준 워크플로우대로... 이전 워크플로우는 모두 삭제하고 새 워크플로우대로"). **본 워크플로우가 유일 — 구 dual/N-cycle 워크플로우 메모리(dual_5agent_review·cycle_n2_mandatory·cycle_pm_judgment_gate·pr_review_workflow·codex_fix_claude_verify)는 삭제·대체됨.**

> 🔒 **2026-06-12 개발책임자 "영구 워크플로우" 확정 — temp 아님(슬러그만 legacy).**
> ⚠️ **정정(2026-06-12): "코덱스 구현 완료되면 PR 에 리뷰 게시" 의 뜻 = Codex 개발 직후 [개발사항](무엇을 개발했는지 요약)을 PR 코멘트로 게시.** 5-agent 리뷰 findings 를 (더구나 미완 1/2 로) 게시하라는 뜻이 아니었음 — 본 PM 2회 오해.
> **규칙: ① Codex 개발 끝나면 즉시 '개발사항' PR 게시(step 2.5) ② 모든 게시는 완결 산출만 — 부분/미완 리뷰 게시 금지 ③ 5-agent 리뷰 라운드도 완결 후 PR 게시**([[review-posting-and-zero-skip]]).

## 슬라이스 사이클 6단계
1. **Opus 4.8** — 계획 + PR 개설(조기)
2. **Codex(GPT5.5)** — 개발 (Claude 직접 구현 금지 [[codex-implements-claude-reviews]]; 토큰 회복 시)
2.5. **개발사항 PR 게시 (의무)** — Codex 개발 직후 **무엇을 개발했는지**(BE/FE/test/migration 변경 요약 + 컴파일·IT 검증 결과)를 PR 코멘트로 즉시 게시. ← 개발책임자 "리뷰 게시" = 이것.
3. **Opus 5-agent TM** — 리뷰 + fix + 게시 (완결 후)
4. **Codex 5-agent TM** — 리뷰 + fix + 게시 (토큰 회복 시)
5. **Fable5 5-agent TM** — 리뷰 + fix + 게시 (**2026-06-22까지만 가용** → 이후 본 라운드 자동 제외)
6. **PM 종합** — 검토 → 머지 또는 다음 사이클 + 게시

## 🚨 각 리뷰어 라운드(3·4·5)에 QA agent + 스크린샷 의무 (자주 위반 — 2026-06-12 재지적)
- 각 라운드 5-agent는 코드축(BE/FE/data/sec)**만** 돌리면 위반. **QA agent 가 Docker 실서버 QA(서비스 재빌드 포함)를 수행하고 그 스크린샷을 해당 라운드 리뷰 코멘트에 인라인 게시**.
- **코드만 리뷰하고 실 QA·스크린샷을 마지막 단일 단계나 별도 전달(SendUserFile/PR본문만)로 미루는 것은 위반.** 라운드별 리뷰 게시에 스크린샷이 함께 있어야 함.
- 라이브 캡처는 미루지 말 것([[overnight-live-capture]]) — 서비스 재빌드해서라도 라운드 안에서.

## 머지 게이트
- **Opus만 돌리고 머지 물어보기 금지.** 3·4·5 전 라운드 + 각 fix + PM 종합까지 완주 후 머지.
- 머지 = **리뷰 error 0 · skip 0** + CI 모두 green + Docker 실 QA(라운드별 스크린샷) 후. PM 종합 게시 → 머지.
- 종료 = 개발책임자 stop.

## How to apply
각 라운드 review→fix→PR 코멘트 게시(QA 스크린샷 포함). Codex 라운드는 토큰 회복 후. Fable5는 2026-06-22 경과 시 제외. 진행 중 슬라이스는 완료 단계 다음부터 진입. 관련 원칙: [[codex-implements-claude-reviews]] [[review-posting-and-zero-skip]] [[pr-qa-screenshots]] [[qa-docker-real-test]] [[overnight-live-capture]] [[codex-model-auto-switch]].
