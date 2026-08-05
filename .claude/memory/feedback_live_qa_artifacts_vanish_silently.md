---
name: feedback_live_qa_artifacts_vanish_silently
description: 🚨 라이브QA 증거가 조용히 사라지는 두 경로 — 캡처를 clients/desktop/docs/ 에 만들면 .gitignore 가 먹고, 캡처 0장 보고서를 PASS 로 세면 게이트가 비어 버린다 (2026-08-05 집PC #1063)
metadata:
  type: feedback
---

# 🚨 라이브QA 증거가 **조용히** 사라지는 두 경로

**2026-08-05 집PC `#1063`** 에서 한 트랙에 두 번 났다. 둘 다 **에러가 안 나고 보고서는 PASS 로 보인다.**

## ① 캡처를 `clients/desktop/docs/qa/...` 에 만들면 gitignore 가 먹는다

R36 이 캡처 11장을 `clients/desktop/docs/qa/1062-…/` 에 만들었다. 그 경로는

```
.gitignore:97   clients/desktop/docs/
```

에 걸린다. `git add` 는 **성공하고 아무것도 안 담는다.** PM 이 `git check-ignore -v` 로 확인해 `docs/qa/<slug>/` 로 옮겼다.

- 캡처 저장 위치는 **저장소 루트 `docs/qa/<슬러그>-real-qa/`** 로 브리핑에 못박는다.
- 커밋 전 `git status --porcelain` 에 **캡처 파일이 실제로 보이는지** 눈으로 대조한다. 보고서만 담기면 신호다.

## ② 캡처 0장인 PASS 를 게이트로 세면 안 된다

R33 이 분개·재고이동 8동선을 PASS 로 냈는데 보고서에 *"브라우저 세션 시간 제한으로 캡처 파일을 생성하지 못함"* 이라 적혀 있었다. **정직한 보고였고 PM 이 그대로 세면 안 되는 것**이었다. 규칙은 *라이브QA = 실제 GUI 스크린샷 다수*이고 DOM·네트워크 로그로 대체할 수 없다 → [[feedback_live_qa_every_round_screenshots]]

R36 에서 같은 동선을 캡처와 함께 다시 밟아 PASS 를 확정했다.

## 🔑 함께 나온 것 — 에이전트 내장 브라우저 도구는 죽을 수 있다

R34·R35 가 `No browser is available` · 가용 목록 `[]` 로 **전 항목 미실시**로 끝났다. PM 이 같은 워크트리에서 직접 재보니

```powershell
cd clients/desktop ; node <임시>.mjs   # import { chromium } from '@playwright/test'
→ LAUNCH_OK
```

**Playwright 자체는 멀쩡했다.** 죽은 것은 에이전트의 내장 브라우저 도구뿐이었다. 이후 브리핑에 *"내장 브라우저 도구를 쓰지 말고 node Playwright 드라이버로 몰아라"* 를 넣자 R36·R37·R38 이 전부 완주했다.

- 라이브QA 가 브라우저 문제로 멈추면 **제품 결함으로 세기 전에 PM 이 `node` 로 직접 한 번 띄워 본다.**
- 렌더러는 **`localhost`** 로 띄운다. `127.0.0.1` 로 띄우면 API 쿠키가 분리돼 로그인 세션이 안 붙는다(2026-08-05 실측).

## ③ `*.log` — RED 원문을 지시한 대로 남겼는데 커밋이 안 된다 (2026-08-06 `#1069` S29)

S27 의 RED 가 **git 에 없는 중간 상태**에서 얻은 것이라 재생 불가였다. 그래서 S29 브리핑에 *"RED raw log 를 파일로 남기라"* 를 넣었고 구현자는 정확히 `2026-08-06-1069-s29-red.log` 로 남겼다. 그런데

```
.gitignore:35   *.log
```

에 걸려 `git add -- docs/dev-reports` 가 **성공하고 그 파일만 안 담았다.** `git status` 도 깨끗하다 — 이미 무시되고 있으니 아무 신호가 없다. PM 이 `git diff --stat` 에 `.log` 가 없는 것을 보고 알아챘다.

- 브리핑에서 raw 출력을 요구할 때는 **확장자를 `.txt`/`.md` 로 못박는다.**
- 커밋 직후 `git diff --stat HEAD~1 HEAD` 로 **요구한 파일이 실제로 들어갔는지** 센다. `git status` 가 깨끗한 것은 증거가 아니다 — ignore 된 파일은 애초에 안 나온다.

## ④ 나중 라운드 드라이버가 **앞 라운드의 증거 디렉토리에 그대로 다시 쓴다** (2026-08-06 `#874`)

R82 를 커밋하려고 `git status --porcelain` 을 눈으로 대조하다 발견했다.

```
 M docs/qa/874-riusage-r71-real-qa/driver-summary.json
 M docs/qa/874-riusage-r71-real-qa/*.txt
 M docs/qa/874-riusage-r71-real-qa/screenshots/*.png     ← 총 10개
```

커밋본과 대조하니 내용이 이렇게 바뀌어 있었다.

```
커밋본 (R71 · 이중 적용 결함이 살아 있던 시점)   494,802   slipNo 2026/08/06-9
작업 트리 (나중 라운드가 덮어씀)                  970,200   slipNo 2026/08/06-11
```

**"결함이 이렇게 보였다" 는 기록이 "고쳐진 뒤의 값" 으로 바뀌어 있었다.** 그대로 커밋했으면 그 트랙의 결함 이력 하나가 조용히 사라진다. 드라이버가 출력 디렉토리를 상수로 들고 있으면 라운드를 넘어가도 같은 곳에 쓴다.

- 라이브QA 산출물은 **자기 라운드 번호의 새 디렉토리**에만 쓴다. 기존 디렉토리 재사용 금지를 브리핑에 명시한다.
- 커밋 전 `git status --porcelain` 에 **`M` 로 표시된 QA 파일이 있으면 그것부터 본다.** 새 라운드는 `??` 만 만들어야 정상이다.
- 이미 덮었으면 커밋 전이므로 `git checkout -- <dir>` 로 온전 복구된다 → [[feedback_briefing_title_only_truncates_existing_report]]

## ⑤ 반대 방향 — 남기면 안 되는 것이 증거에 섞여 들어간다 (2026-08-06 `#874`)

앞의 넷은 "증거가 사라지는" 경로인데, 이건 반대다. 라이브QA 가 **로그인 응답 원문**을 증거로 남기면서 JWT 가 다섯 파일에 들어갔다.

```
docs/qa/<슬러그>/login-response.txt
{"success":true,...,"data":{"token":"eyJhbGciOiJIUzI1NiJ9....","userId":"a0000000-...-0003",...}
```

- 저장소 자체 가드 `Credential Plaintext Guard (SP-08-8)` 는 **pass** 했다. 잡은 것은 **GitGuardian** 뿐이다.
- **GitGuardian 은 최종 트리가 아니라 커밋 이력을 스캔한다** — 지운 뒤에도 계속 red 다. 이 저장소는 squash 머지라 main 에는 최종 트리만 들어가므로 토큰이 main 이력에는 안 남는다. 그 판단 근거를 PR 에 남기고 진행한다.
- 라이브QA 브리핑에 **"로그인·인증 응답의 토큰은 반드시 마스킹"** 을 항상 넣는다. 응답의 나머지(성공 여부·userId·role·displayName)는 증거로 유지한다.

## 🔑 네 경로의 공통점 (①~④)

전부 **`git add` 가 성공하고 에러가 없다.** 증거가 사라졌다는 사실은 나중에 그 증거를 인용하려 할 때에야 드러난다. 그래서 **"담겼나" 를 세는 것이 라운드의 일부**여야 한다. ⑤는 반대로 **"담기면 안 되는 것이 담겼나"** 를 세는 일이다.

## 관련
[[feedback_live_qa_every_round_screenshots]] · [[feedback_qa_harness_commit_breaks_ci]] · [[feedback_qa_environment_verification_first]] · [[feedback_pr_screenshot_sha_pinned_urls]] · [[feedback_defective_round_poisons_db_for_next_round]] · PR #1063 · PR #1077 · PR #1057
