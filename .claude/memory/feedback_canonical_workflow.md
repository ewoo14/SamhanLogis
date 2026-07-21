---
name: feedback_canonical_workflow
description: 🚨 표준 워크플로우 유일 진실원. 🚨🚨2026-07-22 머지 게이트 = 도달성 축(실 사용자 경로 재현 가능한 결함 0 + CI green + 라이브QA) — 07-21 "전 심각도 0" 은 폐기(종료 조건 아님). 검증 품질(테스트 약함·문서 과장·가드 구멍·직접SQL전용)은 슬라이스당 1이슈 이월. (2026-07-15 전면 개편 · 07-20 기획검수 폐지 · 07-21 1차 적대검증 OPUS 4.8·fix SONNET5) — OPUS 4.8 기획+조기PR+게시 → CODEX LUNA 5.6 구현+게시 → (OPUS 4.8 5+agent 적대리뷰·라이브QA+SONNET5 fix+검증+게시 → CODEX SOL 5.6 5+agent 리뷰+LUNA fix+게시) 0수렴 반복 → PM 종합+게시 → CI green → PM 머지. OPUS 4.8=기획+1차 적대검증 리뷰+PM 오케스트레이션(라운드 fix 직접 수행 금지). FABLE5 는 토큰 과다로 파이프라인 제외. 엄수·단축금지·모든 단계 리뷰 게시·라이브QA 스샷 다수. 구 워크플로우 전부 폐기.
metadata:
  type: feedback
---

🚨 **2026-07-15 개발책임자 지시로 전면 개편.** 본 파일이 슬라이스/PR 워크플로우의 **유일한 진실원**이다. 종전 워크플로우는 **전부 삭제·폐기**되었다 — 구 캐논(Opus 기획+리뷰 ↔ Codex 구현+리뷰), Sonnet 5 대체 모드, 구 9-게이트 명세, Codex 모델 자동전환(spark/gpt-5.5) 포함. 삭제 파일 4종(`feedback_review_5agent_no_shortcut_strict`·`feedback_workflow_discipline_root_cause`·`feedback_sonnet_substitution_when_codex_unavailable`·`feedback_codex_model_auto_switch`)의 유효 규율은 본 파일에 흡수했다. **집PC·회사PC 어느 세션에서 진행하더라도 본 워크플로우를 엄수한다. 단축 금지.**

---

# 🚨🚨 2026-07-22 개발책임자 결정 — **머지 게이트를 "심각도 축" 에서 "도달성 축" 으로 전환**

⚠️ **이 절이 머지 게이트의 현행 정본이다.** 2026-07-21 의 *"전 심각도(BLOCKING/HIGH/MED/LOW) 잔여 0"* 은 **폐기**한다. 구 문구를 현행으로 읽지 말 것.

## 현행 머지 게이트
> **① 실 사용자 경로로 재현 가능한 결함 0** (심각도 무관) · **② CI green(exact SHA)** · **③ 라이브QA(실서버 실제 실행)**

**게이트에서 빠지는 것** = *검증 품질* 결함. 즉 **테스트가 약함 · 문서가 과장됨 · CI 가드에 구멍 · mock 인프라 미비 · 직접 SQL 로만 도달**. 이것들은 **슬라이스당 1개 이슈로 묶어 이월**하고 분기별 chore 배치로 태운다([[feedback_backlog_burndown_issue_bar]]).

🚫 **"MED/LOW 무시" 가 아니다.** **도달 가능한 MED/LOW 는 여전히 게이트다.** 분류 축이 *심각도* 에서 *도달성* 으로 바뀐 것뿐이다.

## 왜 바꿨나 — 전 심각도 0 은 **종료 조건이 아니다** (2026-07-21~22 실측)

밤새 3트랙을 돌려 **머지 0건**. 그런데 심각도 궤적은 수렴 중이었다:

| PR | BLOCKING | HIGH | MED | LOW |
|---|---|---|---|---|
| #876 | 2 → **0** | 6 → **1** | 9 → 7 | — |
| #865 | 0 → **0** | 1 → **0** | 9 → 7 | 20 → **1** |
| #864 | 0 → **0** | 1 → **0** | 5 → 2 | 11 → ↓ |

**BLOCKING·HIGH·LOW 는 떨어지는데 MED 만 7 근처에서 평평했다.** 그 MED 의 정체를 분류하니:

- **#865 R4 의 MED 7**: 테스트/가드 품질 **4** · 테스트 인프라 1 · 직접 SQL 전용 1 · **실 도달 가능 제품 결함 1**
- **#876 SOL R2 의 8건**: 심각한 제품 1(CloudWatch 가 Prometheus 를 죽임) · 경미한 제품 1 · 문서 2 · **테스트/가드 품질 4**

⟹ **적대 프로세스가 자기 검증 장치를 감사하는 단계에 들어가 있었다.**

🔑 **종료되지 않는 구조적 이유**: **fix 를 하면 테스트·가드·문서가 늘고, 그 늘어난 검증 장치가 다음 라운드의 감사 대상이 된다.** 측정된 fix-유발률 76~100% 의 정체가 이것이다. RED-first 를 넣어도 안 끝난 이유도 같다 — RED-first 는 *fix* 를 강화하는데 리뷰어는 **그 RED-first 테스트 자체를 다시 감사**한다. 전 심각도 0 은 **검증 장치가 완벽해질 것**을 요구하는데 그 장치는 fix 할 때마다 자란다.

**도달성 축이 종료되는 이유**: 도달 가능한 결함은 **유한하고 실제로 줄어든다**(위 표가 증거). 검증 품질은 무한하지만 **게이트가 아니다**.

## 리뷰어 브리프에 반영할 것
적대 리뷰어는 발견을 **전부 보고**하되 **`도달 가능` / `검증 품질` 로 분류**해야 한다. 분류 근거(실 사용자 경로 재현 여부 · 앱 경로 vs 직접 SQL)를 명시한다. **PM 은 게이트 판정에 `도달 가능` 만 쓰고, `검증 품질` 은 이월 이슈로 묶는다.**

## 마감 라운드는 **도달성 한정**으로 좁힌다
수렴 직전 라운드는 5차원 전면 감사가 아니라 **"이 코드에 실 사용자 경로로 재현 가능한 결함이 있는가"** 단일 질문으로 브리핑한다. 전면 감사를 반복하면 검증 품질 발견이 다시 7건씩 나와 종료되지 않는다.

## 유효하게 남는 것 (변경 없음)
RED-first · 라이브QA=실서버 실제 실행 · **뮤테이션 RED 의무**(2026-07-22 신설) · PM 중재 3단 · 무한루프 차단기("RED 불가 = 고치지 않는다") · test.skip/false-green/미실행/캐시인용 금지 · 게시 1:1 · 모델 대체 금지 · PM 은 불변식만 말하고 구현 수단 지시 금지.

## 병렬도 (2026-07-22 개발책임자 결정)
**마감 집중 후 재개** — 열린 PR 을 닫는 데 집중하고, 닫힌 뒤 다음 슬라이스를 채운다. 밤새 3병렬이 조율 표면을 키워 **PM 게시 누락(LOW 20건 압축) · PM 이 요구한 가드의 `tests=0` 구멍 · 스크린샷 클로버 3회 · 격리본 오적용** 을 만들었다. [[feedback_throughput_parallel_scope_freeze_batch]] 의 병렬 허용은 유지하되 **마감 국면에서는 축소**한다.

---

🚨 **2026-07-16 개발책임자 지시 — 1차 적대검증 모델 교체: FABLE5 → OPUS 4.8.** 사유 = **FABLE5 토큰 소모량 극심**. 이로써 **OPUS 4.8 이 기획(1단계)과 1차 적대검증(4단계)을 겸한다.** fix 주체도 "그 라운드 진행 모델" 규칙에 따라 **4단계 fix = OPUS 4.8**. 2·3·5단계(CODEX SOL 5.6 기획검수 / CODEX LUNA 5.6 구현 / CODEX SOL 5.6 2차 적대검증)는 **변경 없음**. 두 적대검증 스테이지가 **OPUS 4.8 ↔ CODEX SOL 5.6** 로 여전히 이종(異種) 모델이라 적대 검증의 교차 가치는 유지된다.

> **구 기록 독해 매핑**: 다른 메모리/dev-report/PR의 "Opus 라운드"→**1차 적대검증 라운드**, "Codex 라운드/적대검증"→**CODEX SOL 5.6 라운드**, "Codex 개발/구현"→**CODEX LUNA 5.6 구현**, "Opus 기획"→**OPUS 4.8 기획**으로 읽는다. **2026-07-15~16 사이 PR(#820 R4·R6 등)의 "FABLE5 라운드" = 현 1차 적대검증 라운드**(그 시기엔 FABLE5 가 담당). 역할 배정이 상충하면 항상 본 파일이 이긴다.

🚨 **2026-07-20 (2차) 개발책임자 지시 — 1차 적대검증 리뷰 = FABLE5, 리뷰 라운드 fix = SONNET5.** 종전 **OPUS 4.8 이 담당하던 "리뷰" 역할을 전부 FABLE5 가 대체**하고, **그 라운드의 fix 는 SONNET5** 가 수행한다. **"OPUS 4.8 라운드는 모두 해당"** — R1·R3·R4·재수렴 등 OPUS 슬롯의 모든 적대검증 라운드에 적용된다. ⚠️ 2026-07-16 의 FABLE5 폐지(토큰 소모 극심)는 **본 지시로 번복·복원**되었다. 잔여 역할: **기획(1단계) = OPUS 4.8 유지**(지시가 "리뷰하는 부분"으로 한정), **구현(2단계) = CODEX LUNA 5.6 유지**, **2차 적대검증 = CODEX SOL 5.6 리뷰 / CODEX LUNA 5.6 fix 유지**, PM 오케스트레이션·commit 대행·머지 = 세션(OPUS 4.8). 🚫 **PM(OPUS 4.8)이 리뷰 라운드 fix 를 직접 수행하지 않는다** — SONNET5 로 디스패치.

🚨 **2026-07-21 개발책임자 지시 (현행 정본) — 1차 적대검증 리뷰 = OPUS 4.8 로 재전환. fix = SONNET5 유지.** 사유 = **FABLE5 리뷰가 토큰을 너무 많이 소모**(실측: 6차원 라운드 1회에 서브에이전트 토큰 합계 약 1.0~1.2M — #825 슬5 R1 과 #845 DS-3a R1 모두 동일 규모). ⚠️ **2026-07-20 2차의 "리뷰=FABLE5" 는 본 지시로 번복**되며, 2026-07-16 의 FABLE5 폐지 결정으로 되돌아간다(같은 사유의 3번째 전환 — 07-16 폐지 → 07-20 복원 → 07-21 재폐지).

> **07-16 결정과 다른 점**: 07-16 은 리뷰·fix 를 모두 OPUS 가 겸했으나, **본 지시는 fix 만은 SONNET5 로 유지**한다("FIX는 SONNET5 그대로 진행"). 즉 **리뷰어(OPUS 4.8) ↔ 구현자(SONNET5) 분리는 그대로** 살아 있고, CODEX 측 SOL(리뷰)/LUNA(fix) 분리와 동형을 이룬다.
>
> 잔여 역할: **기획 = OPUS 4.8**, **구현 = CODEX LUNA 5.6**, **2차 적대검증 = CODEX SOL 5.6 리뷰 / CODEX LUNA 5.6 fix** — 전부 불변. 두 적대검증 스테이지가 **OPUS 4.8 ↔ CODEX SOL 5.6** 이종(異種)이라 교차 검증 가치도 유지된다.
>
> ⚠️ **OPUS 는 이제 기획 + 1차 적대검증 리뷰 + PM 오케스트레이션을 겸한다.** 종전 "OPUS 는 리뷰 직접 수행 금지" 조항은 **리뷰에 한해 해제**되며, **라운드 fix 직접 수행 금지는 계속 유효**(fix=SONNET5). 리뷰 라운드는 `model: "opus"` 서브에이전트 다차원 디스패치로 수행한다(PM 세션이 혼자 리뷰를 대신하는 것이 아니다 — 5차원 이상 유지).

🚨 **2026-07-20 개발책임자 지시 — 기획검수(구 2단계, CODEX SOL 5.6 spec 적대검수) 폐지.** 사유 = **한 슬라이스 소요 과다** + **기획검수가 적대리뷰와 거의 동일(중복)** + **검수 후에도 적대리뷰에서 결함 다수 발생**하므로 존재 가치 낮음. 이로써 파이프라인은 **OPUS 4.8 기획(조기 PR+게시) → CODEX LUNA 5.6 구현 → OPUS 4.8 R1 적대검증+fix → CODEX SOL 5.6 R2 적대검증+LUNA fix → 0수렴 반복 → PM 종합 머지**(6단계). 기존 결정 교차검증([[feedback_spec_cross_check_prior_decisions]])·경계/권한/계약/무결성 spec 점검은 **OPUS 기획 단계가 흡수**하고, 놓친 spec 결함은 두 적대리뷰(R1/R2)가 포착한다. **적대검증 2라운드(OPUS↔CODEX SOL 이종)·라이브QA·0수렴·단축금지는 불변**(축소는 검증 라운드가 아니라 중복 기획검수만 제거). 구 기록의 "기획검수/SOL 검수 라운드"는 폐지된 단계로 읽는다.

## 표준 파이프라인 (슬라이스/PR 1건 · 순차 · **모든 단계 산출물을 그 즉시 PR에 리뷰 게시**)

1. **기획 = OPUS 4.8** — 슬라이스 spec/plan 수립(기존 결정 교차검증 [[feedback_spec_cross_check_prior_decisions]]·경계/권한/계약/무결성 spec 점검을 **기획검수 폐지(2026-07-20)로 OPUS 기획이 흡수**·놓친 spec 결함은 적대리뷰 R1/R2가 포착). **기획 단계에서 브랜치 + PR 즉시 개설**(OPEN, draft 금지 [[feedback_pr_open_not_draft]]) 후 **기획(spec) 리뷰를 PR에 게시**. 🚫 PR 없이 다음 단계 진행 = 위반.
2. **구현 = CODEX LUNA 5.6** — 구현 전담(파일 수정만, git 금지 — PM commit 대행 [[feedback_codex_sandbox_git]]). PM(세션) 직접 구현 금지 유지([[feedback_pm_no_direct_implementation]]). 완료 시 **구현/개발사항 리뷰를 PR 게시**.
3. **1차 적대검증 = OPUS 4.8 5-agents(또는 그 이상)** ※**2026-07-21 지시로 FABLE5 → OPUS 4.8 재전환**(FABLE5 토큰 과다), **fix = SONNET5 유지** — FE/BE/Design/DevOps/QA **최소 5차원 전부**(Design "N/A" 대체 금지·focused 축소 금지·수렴/재검 라운드도 full) + 필요 시 증원(보안/성능/마이그레이션/회계정합 등). **적대 리뷰 + 라이브QA**(Docker 실서버·mock OFF [[feedback_qa_docker_real_test]]) 수행. **라이브QA 스크린샷 다수 필수 첨부** — 사용자 플로우 단계별 여러 장(요약 1컷 금지), SendUserFile + PR SHA-pinned 인라인 둘 다([[feedback_live_qa_every_round_screenshots]] [[feedback_pr_screenshot_sha_pinned_urls]] [[feedback_qa_screenshots_inline_to_user]]). 발견 전건 명시 disposition → **FIX = SONNET5 디스패치**(2026-07-20 2차 지시 · 종전 "OPUS 4.8 직접" 폐기) → fix 후 검증(변경모듈 전체 스위트 genuine [[feedback_changed_module_full_test_before_push]] [[feedback_gradle_test_cache_false_green]]) → **라운드 리뷰(5차원 취합 표 + 스샷) PR 게시**.
4. **2차 적대검증 = CODEX SOL 5.6 5-agents(또는 그 이상)** — 3단계와 동일 구조(5차원 이상·적대·라이브QA·스샷 다수·fix 후 검증). 실행 = `mcp__codex__codex` **차원별 직접 호출**(codex-rescue 금지 [[feedback_codex_rescue_unreliable_use_mcp]]·sandbox danger-full-access [[feedback_codex_review_sandbox_danger_access]]·approval-policy never·git 금지·PM commit 대행). **FIX = CODEX LUNA 5.6**(SOL 은 리뷰·적대검증·재검증 전담·fix 미수행 — **2026-07-18 개발책임자 지시**: "코덱스 리뷰는 SOL, 해당 라운드 실제 fix 는 LUNA". SOL=리뷰어/LUNA=구현자 분리) → LUNA fix 후 SOL 재검증 → **라운드 리뷰 PR 게시**.
5. 🚨 **수렴 판정 = 전 심각도 0수렴 (현행 정본 — 2026-07-21 21:40 개발책임자 결정)**
   > *"기존 MED, LOW 등의 결함도 모두 FIX하고 넘어가는것으로 하자."*
   - **머지 게이트 = BLOCKING/HIGH/MED/LOW 잔여 0** + CI green(exact SHA) + 라이브QA(실서버 실제 실행).
   - 발견은 **심각도 무관 전건** ①명시 disposition(fix 또는 검증된 무결 근거) ②재수렴 라운드(양측 새 지적 0) ③PM 종합 후에만 머지. **PM 독단 dismissal + 즉시 머지 절대 금지.**
   - **범위 밖**(타 서비스·타 슬라이스)만 분리 가능하다 — [[feedback_fix_in_current_pr_no_split]] 의 원칙 그대로.
   - ⚠️ **같은 날 앞선 "BLOCKING/HIGH 0 = 머지 게이트, MED/LOW 는 배치 이슈" 결정은 폐기됐다.** 그 결정의 문제의식(fix 가 새 결함을 낳아 라운드가 무한증식)은 **범위 축소가 아니라 fix 품질로 해결**한다 — 아래 8항 **RED-first fix** 와 9항 **라이브QA 실서버 실제 실행**이 그 장치다. 구 문구를 현행으로 읽지 말 것.
   - **심각도와 무관하게 통과 아닌 것**: `test.skip` · false-green · 미실행 · 캐시 히트를 실행 증거로 인용.
   - **불변**: 적대검증 강도·최소 5차원·라이브QA 매 라운드·실행=게시 1:1·라운드 수 상한 없음.
   - 📌 참고 실측(폐기된 결정의 근거였고, **RED-first 로 상쇄해야 할 대상**): #854 R4 신규 1,400줄 → R5 HIGH 5건이 거의 전부 그 안 · #864 R3 HIGH/MED 5건 중 4건이 R2 fix 신규 코드 안 · #865 R2 MED 4건 중 3건이 R1 fix 도입. **fix 부피가 다음 라운드 발견량을 키운다는 사실 자체는 유효하다** — 그러니 전건 fix 하되 **RED-first 로 결함 표면을 먼저 확정**해 부피와 오사격을 줄인다.
6. **PM 종합 → 머지** — PM(오케스트레이션 세션)이 전 단계·전 라운드를 종합한 **PM 종합 리뷰를 PR 게시**, dev-report/docs 동기화([[feedback_continuous_docs_sync]]) 확인, CI green(exact SHA) 확인 후 아래 머지 게이트 전부 충족 시 자율 머지([[feedback_pm_auto_merge_authority]]).

7. 🚨 **PM 은 fix 지시에서 불변식만 말하고 구현 수단을 지시하지 않는다 (2026-07-21 신설)**
   PM 이 "이렇게 고쳐라"로 **수단**을 지정하면 그 수단의 결함까지 PM 이 떠안고, 구현자·리뷰어의 독립 판단이 사라진다. 실측 3건: ①#865 M-1 감사 위조 = **PM 이 `COALESCE(modified_at, created_at)` 사용을 지시**해서 생김(LOW 를 고치려다 더 나쁜 것을 넣음) ②#865 BLOCKING(ACTIVE-0) = **PM 이 "설계 정합" 으로 수용 처분**해 남음 ③#864 HIGH-1 = **PM 이 FE 만 읽고 "BLOCKING fix 가 진짜" 라고 판정**해 BE 분기가 그대로 남음.
   ⟹ PM 은 **"무엇이 참이어야 하는가"(불변식·수용 기준·검증 게이트)** 를 쓰고, **"어떻게"** 는 구현자가 고른다. 수단을 꼭 제안해야 하면 **제안임을 명시**하고 구현자가 반박할 여지를 남긴다. PM 이 지시한 fix 일수록 검증을 **더 엄격히** 본다([[feedback_pm_verify_what_measurement_proves]]).

8. 🚨 **RED-first fix — 결함 재현 테스트를 먼저 쓰고 RED 를 보인 뒤 고친다 (2026-07-21 개발책임자 결정)**
   종전 순서는 `fix → 테스트 추가 → 뮤테이션 확인` 이었다. 뮤테이션 검사는 fix **이후**에 하므로 **"구현자가 고른 fix"만 검증**하고 **결함의 전체 표면은 검증하지 않는다.** 순서를 뒤집으면 코드를 쓰기 전에 **결함이 어느 층·어느 파일까지 사는지 열거**해야 한다.
   - 각 BLOCKING/HIGH 발견마다 **그 결함을 재현하는 실패 테스트를 먼저 작성하고 RED 원문을 제출**한다. 그 다음 고치고 GREEN 원문을 제출한다.
   - 실측 근거: #864 BLOCKING-1 은 **FE 만 고쳐지고 BE 분기가 그대로 남았다**. BE 를 지나는 RED 테스트를 먼저 썼다면 구조적으로 불가능했다. #865 M-2(`EntityManager#persist` 가 Spring 예외변환 상실)·M-1(`COALESCE` 가 다른 의미) 도 **계약을 고정하는 테스트가 선행했다면** 치환이 걸러졌다.
   - RED 를 못 만들면 그것 자체가 신호다 — 결함을 아직 이해하지 못했거나, 테스트가 닿지 않는 층에 있다는 뜻이다. **그 상태로 고치지 말고 보고한다.**

9. 🚨 **라이브QA = 실서버 실제 실행. 정적 게이트로 대체 금지 (2026-07-21 개발책임자 지시)**
   > *"REAL QA로 실서버 검증을 하지 않는다면 추후 사용자가 사용할때 나타나는 버그를 잡을 수가 없잖아."*
   - `--list`·typecheck·lint 류 **정적 검사는 하네스가 구조적으로 부서진 것만** 잡는다. **사용자가 겪을 버그는 실행해야만** 나온다. 정적 게이트를 라이브QA 의 **대체물로 제안하는 것은 금지**(보조 조기경보로만 허용).
   - 🚨 **구조적 실태(2026-07-21 실측)**: repo 에 `*-real-qa.spec.ts` **85파일/213테스트**가 있으나 `playwright.config.ts` 가 명시 제외하고 `.github/workflows/` 에 `real-qa` **0건** → **CI 가 한 번도 실행하지 않는다.** 그래서 ①하네스 결함이 영구 미탐(#864 R2 가 testMatch 를 축소해 82스펙을 죽였는데 CI 는 40/40 green 이었다) ②사용자 표면 회귀도 미탐. **83개 스펙이 사실상 죽은 코드다.**
   - ⟹ 라이브QA 라운드는 **해당 슬라이스의 real-QA 를 실서버로 실제 실행**하고 결과 원문을 제출한다. "코드로 확인했다"·"IT 로 통과했다" 는 대체가 아니다([[feedback_live_qa_penetrates_it_masking]]).

## 모델 디스패치 매핑 (2026-07-15 집PC 실측 · 2026-07-16 갱신)
- **OPUS 4.8** = Agent 도구 `model: "opus"` 서브에이전트 **명시**(에이전트 정의 frontmatter 기본값 의존 금지). **1단계 기획 + 3단계 1차 적대검증 리뷰 + PM 오케스트레이션/commit 대행/머지**(2026-07-21 지시 — 리뷰 겸임 복귀). 🚫 **라운드 fix 직접 수행은 계속 금지**(fix=SONNET5). 리뷰는 `model:"opus"` 다차원 서브에이전트로 디스패치 — PM 세션이 혼자 대신하지 않는다.
- ~~**FABLE5** = `model: "fable"`~~ — **2026-07-21 지시로 파이프라인에서 제외**(토큰 과다). 07-16 폐지 → 07-20 복원 → **07-21 재폐지**. 구 기록의 "FABLE5 라운드" = 1차 적대검증 라운드로 읽는다.
- **SONNET5** = Agent 도구 `model: "sonnet"` **명시**. **1차 적대검증 라운드의 fix 전담**(2026-07-20 2차 지시 · **2026-07-21 에도 유지 — "FIX는 SONNET5 그대로"**). 리뷰어(OPUS 4.8)와 구현자(SONNET5) 분리 — CODEX 측 SOL/LUNA 분리와 동형.
- **CODEX SOL 5.6** = `mcp__codex__codex`/`codex exec` **`model: "gpt-5.6-sol"`** — 2026-07-15 codex CLI 실측 정상 응답.
- **CODEX LUNA 5.6** = 동일 경로 **`model: "gpt-5.6-luna"`** — 실측 정상 응답. `~/.codex/config.toml`의 기본 model(gpt-5.5)은 폴백일 뿐 — **디스패치마다 스테이지 모델 명시 의무**. effort 기본 high(보안/마이그레이션/race/인시던트 xhigh).
- 🚫 **모델 대체 금지** — 스테이지 지정 모델 사용 불가(한도/장애/미지원) 시 임의 대체(타 모델·서브에이전트 갈음) 금지, **개발책임자 선확인 후에만 진행**(구 Sonnet 대체 모드 폐기). 부재 단정 전 실제 호출 시도부터(미검증 단정 금지 — 2026-07-13 #813 박제).

## 절대 규칙
- 🚫 **순차** — 단계·라운드 병렬 금지. **1차 적대검증 라운드(OPUS 4.8)** **완료+게시** 후에만 CODEX SOL 라운드. 한 PR의 두 검증 스테이지 동시 실행 금지. 병렬 다중 PR이어도 각 슬라이스는 전 단계 순차 완주(PM이 매번 전 슬라이스 점검).
- 🚫 **단축 금지** — 트리비얼/기계적/1줄/인프라/chore PR도 동일 워크플로우([[feedback_infra_chore_not_canon_exempt]]). 범위 점증 시 리뷰 재가동([[feedback_expanded_scope_reinstate_review]]). 단일모델 머지 금지.
- 🚫 **실행 = 게시 1:1** — 모든 단계·라운드(기획·구현·각 검증·재수렴·PM 종합)는 완료 즉시, **다음 행동(fix 디스패치·다음 라운드·채팅 보고)보다 먼저** `gh pr comment`(UTF-8 body-file [[feedback_gh_comment_utf8_pipe_mojibake]])로 게시. 채팅 보고 ≠ PR 게시. 머지 직전 "실행 라운드 수 = 게시 라운드 수" 1:1 대조 의무.
- 🚫 **fix 주체**: **3단계(1차 적대검증) 리뷰=OPUS 4.8·fix=SONNET5**(2026-07-21 지시 — 리뷰는 OPUS 로 재전환하되 **리뷰어/구현자 분리는 유지**). **4단계(CODEX SOL 2차 적대검증) 리뷰=CODEX SOL 5.6·fix=CODEX LUNA 5.6**(2026-07-18 개발책임자 지시 — SOL 리뷰, LUNA fix 분리). 구현 결함 재작업=CODEX LUNA 5.6. fix는 현재 PR 내 처리([[feedback_fix_in_current_pr_no_split]]). 어떤 fix든(1줄이라도) 후에 full 재수렴 없이 머지 금지.
- 🚫 **라이브QA 스샷 다수 매 라운드** — 실캡처만([[feedback_no_fake_data_ever]]), CI IT/SSE·API 텍스트로 GUI 스샷 대체 금지, 실연동 불가 시 사유 정직 보고([[feedback_overnight_live_capture]]).
- 🧭 **매 단계 ScheduleWakeup 재자각·mega턴 금지**([[feedback_autonomous_loop_schedulewakeup]]). 도구 호출은 실 invocation([[feedback_emit_real_tool_calls]]). Codex 진행 검증·10분 보고([[feedback_pm_codex_progress_verification]]).
- 🔁 **미준수 소급 보완** — 본 워크플로우 미준수로 진행/머지된 PR 발견 시 누락 단계를 소급 실행·게시.
- ✅ 무중단 자율(슬라이스 끝마다 묻지 않고 연속 진행), 한국어 커밋/PR([[feedback_korean_commits]]), `[FEAT]`/`[FIX]` 대괄호 prefix, Role 풀네임, 개발책임자 결정은 PR에 누적 기록([[feedback_post_devlead_decisions_to_pr]]), Issue 자동 close([[feedback_issue_close_after_pr]]).

## 근본원인 자각 (구 discipline 파일 승계 — 반복위반 방지 장치)
① 속도(처리량·병렬 완주 압박)가 충실도를 이기게 두지 말 것 — **속도 < 충실도 절대**. ② 워크플로우는 "결과 맞추는 가이드"가 아니라 **내 판단이 틀릴 때를 잡는 장치** — 물음은 "결과가 맞나"가 아니라 "**모든 단계를 밟았나**". ③ 행동 전 결정 시점마다 본 파일 재대조(관성 금지). ④ 긴 세션·병렬 부하가 규율을 침식하면 짧게 끊고 ScheduleWakeup 재자각. 실증(2026-07-07): 단축 라운드를 full로 소급 재검하자 단축이 놓친 🔴CRITICAL(soft-delete 거래처 5소비처 노출)이 발굴됨 — **단축은 "결과 맞음"이 아니라 실 버그를 숨긴다**.

## 머지 게이트 (PM 머지 직전 — 응답에 체크리스트 명시, 전부 ✓ 후에만 merge)
① 기획 리뷰 게시(기획 단계 조기 PR 존재 — **PR 본문만으로 갈음 불가·별도 코멘트 필수**) ② CODEX LUNA 구현 리뷰 게시 ③ **FABLE5 1차 적대검증** 라운드 전부 게시+전건 disposition ④ CODEX SOL 라운드 전부 게시 ⑤ **fix 주체 준수(FABLE5 라운드=SONNET5 · CODEX SOL 라운드=CODEX LUNA)** ⑥ 0수렴(양측 terminal 0·재수렴 포함) ⑦ 라이브QA 스샷 다수(SendUserFile+PR SHA-pinned) 매 라운드 ⑧ PM 종합 게시+dev-report/docs 동기화 ⑨ CI 100% green + 실행=게시 1:1 대조 + 메모리 가드(한국어·UUID 비노출·풀네임 Role) 위반 0. (기획검수 게이트는 2026-07-20 폐지)
→ **멈춤(개발책임자 확인 대기)** = 신규 업무규칙/정책 결정 · 데이터손실/보안/운영중단급 P0 · 무결성도메인 편집정책([[feedback_integrity_domain_policy_preconfirm]]) · 스테이지 모델 부재 시 대체 여부뿐. 그 외는 자율 판단·정직 기록 후 진행. `--admin` 강행 머지는 개발책임자 명시 시만.

## 기술 참조
- Codex 호출 표준: `mcp__codex__codex`(sandbox danger-full-access·approval-policy never·git 금지·PM commit 대행) 또는 `codex exec`(백그라운드 `</dev/null` [[feedback_codex_exec_stdin_hang]]). → [[feedback_codex_plugin_setup]] [[feedback_codex_sandbox_git]] [[feedback_codex_mcp_session_limit]]
- 라이브 QA 실행법(렌더러 mock off·standalone 부팅·캡처) → [[feedback_realqa_run_and_false_red]] [[feedback_real_server_check_screenshot]]
- 검증 genuine 강제(캐시 false-green 방지) → [[feedback_gradle_test_cache_false_green]] · CI 권위=exact SHA([[feedback_parallel_agent_gradle_shared_tree_contention]])
