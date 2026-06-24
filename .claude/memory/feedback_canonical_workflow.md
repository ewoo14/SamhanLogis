---
name: feedback_canonical_workflow
description: 🚨 슬라이스/PR 표준 워크플로우 유일 진실원 — Opus 기획+PR → Codex 개발+리뷰 → (Opus 5-agent+fix+라이브QA스샷+TM게시 ↔ Codex 5-agent+fix+라이브QA스샷+TM게시) 0수렴까지 → PM 종합 리뷰 게시 → CI green → PM 머지. 다른 워크플로우 정의 없음(본 파일이 유일).
metadata:
  type: feedback
---

🚨 2026-06-23 신설 · **2026-06-24 개발책임자 재확정·완성(영구박제)**. **본 파일이 슬라이스/PR 워크플로우의 유일한 진실원이다.** 과거·경쟁 워크플로우 메모리(team-lead 승인체인 github-pr-workflow · multi-agent-team-pattern · integrated-pr-pattern · dual-5agent-review · per-round-live-qa · review-posting-and-zero-skip · pm-auto-continuous · temp-multimodel-workflow · tm-led-agent-discussion · pr-qa-screenshots · early-pr-docker-qa · pr-ci-monitoring · post-each-review-round-distinctly · rereview-converge-after-fix · tm-pr-comment-pre-merge-gate · user-merge-authority 등)는 **전부 본 파일로 통합·폐기**했다. 다른 워크플로우와 헷갈리지 말 것 — **이 순서를 토씨까지 따른다.**

## 표준 순서 (슬라이스/PR 1건)
1. **Claude(Opus) 기획 + PR 개설** — 스펙/플랜 수립, 브랜치, **조기 PR**(구현 누적 전 PR 먼저).
2. **Codex 개발 + 개발사항 리뷰 게시** — Codex 가 구현(**Claude 가 commit 대행, Codex git 금지**), 자기 개발사항 리뷰를 PR 에 게시.
3. **Claude(Opus) 5-agent 리뷰 + Opus 직접 fix → TM 통합리뷰 게시(스크린샷 인라인)** — FE/BE/Design/DevOps/QA 5인. **QA=Docker 라이브 QA + 단계별 스크린샷.** fix=**Opus 직접**. fix 이후 라이브 QA + 스크린샷 인라인 포함해 TM 통합리뷰 게시.
4. **Codex 5-agent 리뷰 + Codex fix → TM 통합리뷰 게시(스크린샷 인라인)** — 동일 구조. fix=**Codex**.
5. **반복** — 3 ↔ 4 사이클을 리뷰의 **error / skip / backlog 등 잔여가 0 으로 수렴**할 때까지 계속(test.skip·false-green·미실행·백로그 이월 = 통과 아님).
6. **PM 종합 리뷰 게시 (머지 전)** — 0수렴 확인 후, PM 이 전 라운드를 종합한 **최종 종합 리뷰를 PR 에 게시**(개발책임자 2026-06-24 명시). 라운드 코멘트와 별개의 종합이며 머지 전 의무.
7. **PM 최종 확인 + CI 모니터링** — `gh pr checks --watch` 로 CI green 확인.
8. **PM 머지** — 아래 머지 게이트 충족 시 PM 자율 머지.

## 5 agents (3·4단계 공통)
- **FE / BE / Design / DevOps / QA** 5인.
- **QA 에이전트는 FE/BE/Design/DevOps 4인 리뷰 + fix 이후** 진행(순차) — **Docker 라이브 QA**(실 게이트웨이:8080 / 실 서비스 / 실 시드, mock OFF) + 실사용자 화면 **단계별 스크린샷** 캡처.

## 절대 규칙
- 🚫 **리뷰마다 fix 후 라이브 QA + 스크린샷 인라인 게시 필수** — 모든 라운드(Opus·Codex)는 fix 이후 Docker 라이브 실 QA + 스크린샷을 그 라운드 코멘트에 인라인. code-read PASS·가짜 캡처(PIL 합성/mock 화면) 금지([[feedback_no_fake_data_ever]]). 실연동 불가 시 사유 정직 보고([[feedback_overnight_live_capture]]).
- 🚫 **스크린샷 = 과정 단계별 여러 장(한 장 금지)** — 요약 1컷 금지. 사용자 플로우 각 단계(진입→입력→실행→결과→상태변화)를 단계별 별도 캡처로 인라인. 리뷰어/개발책임자가 스크린샷만으로 흐름 전체를 판정 가능하게(개발책임자 2026-06-24).
- 🚫 **각 라운드 즉시 독립 게시** — Opus/Codex/수렴 재검증 각 라운드를 개별 `gh pr comment` 로 그 라운드 완료 즉시 게시. 다른 라운드·최종 종합에 합치기·batch 보류 금지(개발책임자 PR #585 2연속 지적). "라운드 실행"과 "라운드 게시"는 별개이며 둘 다 의무.
- 🚫 **fix 후 0수렴 재리뷰(CI-green 만으로 머지 금지)** — 어떤 fix든(Opus 라운드·Codex 라운드·CI 실패 fix·임의 fix) 그 fix 포함 최종 상태를 순차 듀얼리뷰 재실행 → **양쪽이 새 fix 없이 0 반환**할 때까지 반복 후에만 머지. CI 통과는 리뷰 차원(설계·회귀·계약)을 대체 못함(슬3 #562 회귀 박제).
- 🚫 **듀얼리뷰 병렬 금지(순차)** — Opus 라운드 완료·게시 후에야 Codex 라운드. 한 PR 의 Opus·Codex 동시 실행 금지.
- 🚫 **단축 금지** — 트리비얼/기계적/sweep/1줄 PR 도 동일 워크플로우. 단일모델 머지 금지.
- 🔁 **미준수 PR 소급 보완** — 세션 종료 전(또는 과거) 본 워크플로우를 준수하지 않은 채 진행/머지된 PR 은 발견 시 누락 단계(듀얼리뷰·라이브QA·단계별 스샷·0수렴 재리뷰·PM 종합 게시)를 소급 보완(개발책임자 2026-06-24 ④).
- 🧭 **매 단계 ScheduleWakeup 재자각** — 각 단계(또는 1~2단계 묶음) 완료 후 다음 단계를 ScheduleWakeup 으로 예약·재자각하고 턴 종료(연속 mega-턴 금지, 사용자 활성 중에도 적용). → [[feedback_autonomous_loop_schedulewakeup]]
- ✅ **무중단 자율** — 슬라이스 끝마다 묻지 말고 PM 연속 진행. 한국어 커밋/PR(prefix·trailer 예외), `[FEAT]`/`[FIX]` 대괄호 prefix, Role 풀네임, 개발책임자 결정은 진행 중 PR 에 누적 게시([[feedback_post_devlead_decisions_to_pr]]).

## fix 주체 (라운드별)
- **Opus 라운드 fix = Opus 가 직접 Edit**(Codex 디스패치 금지). **Codex 라운드 fix = Codex.** "Claude 직접 코드 작성 금지"는 2단계 초기 구현 한정 — **리뷰 라운드 fix 에는 적용 안 됨.**

## 머지 게이트 (PM 머지 직전 체크리스트 — 모두 ✓ 후에만 `gh pr merge`)
- □ Opus 5-agent 라운드 게시 + Codex 5-agent 라운드 게시(전 사이클) 확인(`gh pr view N --comments`)
- □ fix 후 0수렴 재리뷰로 양쪽 **0-blocking / 0-skip / 0-backlog** 확인
- □ **PM 종합 리뷰 게시(6단계)** 확인
- □ 라이브 QA **단계별 스크린샷** 인라인 게시 확인
- □ CI 100% green(`gh pr checks`)
- □ 메모리 가드(한국어·UUID 비노출·풀네임 Role·docs 동기화 등) 위반 0
→ 충족 시 **PM 자율 머지**(squash). **멈춤(개발책임자 확인 대기)** = 신규 업무규칙/정책 결정 / 데이터손실·보안·운영중단급 P0 결함뿐. 그 외(트리비얼 결정·라이브QA 실연동 불가 등)는 자율 판단·정직 기록 후 진행. `--admin` 강행 머지는 개발책임자 명시 시만.

## 기술 참조
- Codex 호출 = `mcp__codex__codex`(approval-policy:never, sandbox workspace-write 또는 danger-full-access, model `gpt-5.5`, config:{model_reasoning_effort:"high"}). Claude 가 commit 대행(Codex git 금지). → [[feedback_codex_plugin_setup]] [[feedback_codex_sandbox_git]]
- 라이브 QA 실행법(렌더러 mock off·standalone 부팅·캡처) → [[feedback_qa_docker_real_test]] [[feedback_realqa_run_and_false_red]] [[feedback_no_fake_data_ever]]
- Codex MCP 세션 한계 시 새 세션/codex exec 우회 → [[feedback_codex_mcp_session_limit]]
- Codex 진행 검증·상태 보고 → [[feedback_pm_codex_progress_verification]]
