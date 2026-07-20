---
name: feedback_autonomous_loop_schedulewakeup
description: 야간/장시간 자율 진행 요청 시 ScheduleWakeup으로 매 워크플로우 단계마다 재자각+연속 진행. 긴 세션 워크플로우 드리프트 방지.
metadata:
  type: feedback
---

🚨 2026-06-24 개발책임자 지시(+ 같은 날 3회 보강). **워크플로우 진행 시 매 단계마다 `ScheduleWakeup`으로 재자각하며 진행한다 — 사용자 부재(취침/외출)뿐 아니라 사용자 활성 중에도 동일 적용(개발책임자 "재개 후에도 매 단계 사용" 명시).** 즉 연속 mega-턴으로 몰지 말고, 단계(또는 1~2단계 묶음) 완료 시마다 다음 단계를 ScheduleWakeup 으로 예약·재자각하며 chunk 한다.

**전 PC 적용(집/회사)**: 본 규칙은 PC 무관하게 항상 적용한다(개발책임자 "회사 PC에서 진행해도 매 단계 적용" 명시). 본 메모리는 git-tracked `.claude/memory/` 라 양 PC 동기화됨([[feedback_canonical_workflow]] 동기화 절차) — 회사 PC 세션에서도 워크플로우 매 단계 ScheduleWakeup 재자각을 누락하지 말 것.

**Why**: 세션이 길어지면 워크플로우 위반(라이브 QA 누락·라운드 게시 누락·재수렴 생략 등)이 반복 발생. 사용자 부재 중 PM이 턴을 yield 하면 루프가 죽음. ScheduleWakeup이 (1) 턴을 넘겨 루프를 살리고 (2) 매 wake마다 워크플로우를 강제 재자각시킴.

**How to apply**:
- 각 워크플로우 단계(또는 1~2단계 묶음) 완료 후, 다음 단계를 `ScheduleWakeup`으로 예약하고 턴 종료. `delaySeconds`는 연속작업이면 짧게(60s, 캐시 <5분 유지). 외부 장시간 대기(빌드/CI)면 그에 맞게.
- **wake prompt(=재자각 프롬프트)에 반드시 포함**: ① 표준 워크플로우 요약([[feedback_canonical_workflow]]) + 절대규칙(라운드마다 라이브QA+스샷 인라인·각 라운드 독립 게시·fix후 0수렴 재리뷰·듀얼리뷰 순차·fix주체) ② 슬라이스 큐 + 현재 슬라이스/PR/단계 상태 ③ 다음 단계 구체 지시(중점·실행법) ④ 자율 권한 범위(막히면 사유 정직 기록 후 진행, 신규 업무규칙/정책만 사용자 확인 대기).
- 각 단계 진입 시 "🧭 워크플로우 자각" 한 줄로 현재 단계+요구사항 명시 후 진행(단계마다 자각 — 개발책임자 명시).
- 상태가 매 단계 변하므로 wake마다 prompt를 **갱신**해 재예약(동적 루프). 진행은 PR 코멘트에 라운드별 누적 게시로 추적 가능하게.
- 멈춤 = 신규 업무규칙/정책 결정 필요 시만. 그 외(트리비얼 결정·라이브QA 실연동 불가 등)는 자율 판단/정직 기록 후 계속.

## 🚨 2026-07-21 실패 박제 — "통지가 오지 않는 대기"가 6시간 23분 정지를 만들었다

**사고**: 트랙1(#854) R6 fix 커밋 `00:22`, 트랙2(#825) LUNA 마지막 쓰기 `00:21` 이후 **06:45 까지 두 트랙 모두 완전 정지**. 실제 작업 ~2시간, 정지 ~6.5시간.

**직접 원인 두 가지 — 둘 다 "기다리면 깨워줄 것"이라는 잘못된 전제**:
1. **CI 확인은 백그라운드 태스크가 아니다** — "CI green 확인 후 R7 진행"이라 해놓고 턴을 끝냈는데, `gh pr checks` 는 내가 직접 호출해야 하는 것이라 **나를 깨우는 통지가 존재하지 않는다.**
2. **MCP idle timeout 으로 `failed` 처리된 codex 태스크는 완료 통지가 오지 않는다** — 그런데 "LUNA 종료 확인 후 진행"이라며 **영원히 오지 않을 통지**를 기다렸다. (abort ≠ 미수행 은 [[feedback_codex_cli_version_model_mismatch]] 에 이미 박제돼 있었고 산출물은 실제로 계속 쌓이고 있었다.)

**🚩 더 나쁜 근본 원인 — 도구 가용성을 추측으로 판단하고 시도조차 안 했다.**
`ScheduleWakeup` 을 "이건 `/loop` 전용이라 여기서 호출하면 에러 날 것"이라고 **혼자 단정하고 건너뛰었다.** 실제로 호출해 보니 **정상 동작**했다. 본 메모리의 규칙(매 단계 재자각)이 이미 있었는데 **도구를 안 써서** 규칙이 무력화된 것이다.
⟹ **미검증 단정 금지**([[feedback_emit_real_tool_calls]] 계열). 도구가 안 될 것 같으면 **실제로 한 번 호출해 보고** 판정하라. 실패해도 비용은 1콜이다.

**턴 종료 전 필수 자문 (체크리스트)**:
- 내가 지금 기다리는 것이 **통지가 오는 작업인가?**(Agent/Bash `run_in_background`/Monitor = 온다 · CI 상태·외부 API·abort 된 MCP = **안 온다**)
- 안 오는 것이 하나라도 있으면 **반드시 `ScheduleWakeup` 으로 자기 기상 예약**.
- 통지 오는 작업만 있어도 **긴 fallback 기상(1200s+)** 을 함께 걸어 hang/누락에 대비.
- wake prompt 에 **"통지가 오지 않는 항목은 직접 폴링"** 을 명시(어떤 항목인지 열거).

관련: [[feedback_canonical_workflow]] [[feedback_post_each_review_round_distinctly]] [[feedback_rereview_converge_after_fix]] [[feedback_no_fake_data_ever]] [[feedback_emit_real_tool_calls]] [[feedback_codex_cli_version_model_mismatch]]
