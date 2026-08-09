---
name: feedback_qa_harness_commit_breaks_ci
description: 라이브QA 하네스를 커밋하면 CI 가 깨진다 — docs/qa 경로 하드코딩·워크트리 절대경로. 커밋 전에 가드를 먼저 돌려라
metadata:
  type: feedback
---

# 🚨 **내가 커밋한 QA 하네스가 CI 를 깼다** (2026-08-03 · 한 세션에 2트랙)

## 무슨 일이 있었나

라이브QA 산출물(보고서·캡처·하네스)을 커밋했더니 **CI 3잡이 red** 가 됐다.

```text
#1059  clients/desktop/playwright/1013-dispatch-inherit-real-qa/dispatch-inherit-real-qa.spec.ts:6
         path.resolve(process.cwd(), '../../docs/qa/1013-dispatch-inherit-real-qa')
       → H-2 가드 위반 "캡처 목적지 docs/qa 경로 상수는 전부 resolveQaShotsDir 를 경유한다"
       → Desktop Playwright · Frontend Desktop · 문서 본문 단언 스펙  3잡 red

#1057  clients/desktop/playwright/874-riusage-global-dc-real-qa/*.mjs (9개)
         const shots = 'D:/dev/Samhan-Public/.claude/worktrees/w1057/docs/qa/…'
       → 워크트리 절대경로 하드코딩. 다른 PC·CI 에서 성립 불가
       → #1059 에서 겪고 바로 확인해 커밋에서 제외(사전 차단)
```

## 🔑 왜 놓치나

- 하네스는 **QA 를 돌린 codex 가 만든 부산물**이라 PM 이 내용을 안 보고 산출물째로 `git add` 한다.
- 하네스 자체는 **그 워크트리에서 잘 돈다.** 문제는 다른 환경에서만 드러난다.
- 구현자는 이 실패를 *"이번 변경과 무관한 기존 실패"* 로 보고했다 — **기존이 아니라 직전 커밋에서 PM 이 넣은 것**이었다. 라운드 산출물만 보면 자기 변경과 무관해 보인다.

## 어떻게 할 것인가

- 🚨 **QA 하네스를 커밋하기 전에 가드를 돌려라.** `harness-false-green-guard.test.ts` 가 그 장치다. 캡처와 보고서만 커밋하고 드라이버는 빼는 것도 방법이다 — **증거는 보고서와 캡처이지 드라이버가 아니다.**
- 하네스를 남긴다면 **`resolveQaShotsDir` 경유 + 상대경로**. 절대경로·워크트리 경로는 금지.
- 🚨 **디렉토리 접미사 규약** — 라이브(실서버) 스펙은 **`-real-qa`**, mock 스펙은 접미사 없음. 반대로 두면 mock 스위트가 라이브 스펙을 집어 `ECONNREFUSED` 로 깨진다. **mock 산출 캡처를 `-real-qa` 문서 경로에 두지도 말 것**(나중에 라이브 증거로 오인된다 — 2026-08-03 #1063 에서 실제로 그렇게 들어와 `-mock` 으로 옮겼다).
- 🚨 **CI 실패를 구현자 보고만으로 "기존 것" 으로 분류하지 마라.** `git log` 로 그 파일이 언제 들어왔는지 확인할 것.

## 함께 나온 것 — 계약 문서가 옛 경로를 붙들고 있었다

같은 CI 에서 별개 원인이 하나 더 있었다.

```text
문서 본문 단언 스펙
  expect(sources).toContain('/admin/notifications/dispatch-batch/send')
```

개발책임자 A안(자동 SMS 제거)으로 그 경로를 없앴는데 **스펙이 옛 계약을 그대로 단언**하고 있었다. 🔑**경로·계약을 제거하는 fix 는 그것을 단언하는 문서·계약 테스트를 함께 세라.**

## 🚨 PM 은 **라운드마다 CI 를 따로 본다** — 2026-08-06 하룻밤에 두 번 놓쳤다

라운드 보고서는 **지정 suite 만 좁게** 돌린다. 좁히는 것 자체는 완주를 위해 옳다([[feedback_narrow_briefing_completes_wide_times_out]]) — 대신 **PM 이 매 라운드 CI 를 본다**. 안 봐서 생긴 일 둘:

```
#1077  충돌(CONFLICTING) → pull_request run 이 아예 0건.  네 커밋 동안 몰랐다.
       "큐에 있음" 처럼 보이고 에러가 없다.  → [[feedback_pr_conflict_blocks_all_workflows]]
#1057  Harness Guard 가 네 SHA 연속 red.  CI 잡도 같은 가드라 함께 red.
       가드가 잡던 것이 바로 위 ④의 덮어쓰기 상수(const qaDir / const out)였다.
```

특히 `#1057` 은 뼈아프다 — **가드는 네 SHA 동안 정확히 그 사고를 말하고 있었고**, PM 은 그 신호가 아니라 우연한 `git status` 대조로 같은 사고를 발견했다.

라운드 종료 때 함께 볼 것:

```powershell
gh pr view <PR> --json mergeable,mergeStateStatus      # CONFLICTING 이면 run 0건
gh run list --branch <branch> --limit 6 --json headSha,status,conclusion,name
```

**체크가 현재 SHA 에 하나도 없으면 그것부터.** 실패가 있으면 라운드 판정보다 먼저 본다 — 게이트 ②는 "성공 수 = 전체 수" 다.

## 🚨 **고아 산출물을 "회수" 할 때가 가장 잘 놓친다** — 2026-08-09 재발

세션 단위 워크트리 훑기로 고아 산출물을 main 에 회수하다가 **같은 가드를 또 깼다**(main 15분 red).

```
99f98ea2e  docs(qa): 고아로 남은 라이브QA 증거 회수 (5개 디렉터리)
           → H-2 · G3a · G3b  3건 red
           1110-s12-live-qa.spec.ts 의 const SHOT_DIR 가 resolveQaShotsDir 미경유
           + 저장소 절대경로 하드코딩
```

🔑 **왜 또 놓쳤나 — "새로 쓴 코드" 가 아니라서다.** 회수는 *옮기는 일*로 느껴져서 "내 변경" 목록에 안 올라가고, 가드를 돌릴 생각 자체가 안 든다. 파일이 **몇 달 전 것**이라 더 그렇다 — 그때는 가드가 없었으니 위반인 게 당연하다.

⟹ **가드는 파일이 언제 쓰였는지 묻지 않는다. 커밋 시점에 트리에 있으면 대상이다.**

- 🚨 회수·이관·복원도 **커밋 전에 가드를 돌린다**. `git mv`·`cp` 로 들어온 것도 예외가 아니다.
- 🚨 회수할 때는 **PNG·보고서만** 가져오고 드라이버(`*.spec.ts`·`*.mjs`)는 두고 온다. 위 사고에서 증거였던 것은 스크린샷 10장이고 나머지 6개는 재현 편의였다 — 결국 드라이버만 빼서 해결했다.
- 🔑 **로컬 가드 실행 결과를 CI 와 같은 모집단으로 착각하지 마라.** 로컬은 `.claude/tmp/**` 같은 untracked 임시파일까지 스캔해 CI 3건 대 로컬 5건이 나왔다. **권위는 CI** 이고, 로컬은 "내가 넣은 것이 목록에 있나" 를 보는 데만 쓴다.

## 관련

- [[feedback_live_qa_artifacts_vanish_silently]] — 증거가 사라지는 네 경로(이 파일의 가드가 막는 것)
- [[feedback_pm_copy_untracked_files]] — 고아 산출물을 회수하는 절차 자체
- [[feedback_live_qa_first_not_last]] — 같은 세션에서 나온 순서 개편
- [[feedback_screenshot_restore_scope_destroys_edits]] — QA 산출물 커밋이 다른 것을 망가뜨리는 계열
- [[feedback_design_system_playwright_mock_suite]]
- [[feedback_pr_conflict_blocks_all_workflows]]
