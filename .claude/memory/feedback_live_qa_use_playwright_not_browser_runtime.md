---
name: feedback_live_qa_use_playwright_not_browser_runtime
description: 🚨 검증자가 "Browser 런타임 []" 로 라이브QA 를 관측 불가 처리한다 — Playwright chromium 은 설치돼 있고 정상 동작한다. 브리핑에 실행 방법을 명시하라 (2026-08-09 하룻밤 6라운드)
metadata:
  type: feedback
---

# 🚨 "Browser 런타임이 `[]` 라 관측 불가" 는 대부분 **틀린 전제**다

2026-08-09 하룻밤, **여섯 개 SOL 라운드가 전부** 같은 문장으로 라이브QA 를 포기했다.

```
#1145 R8   GUI·스크린샷: 브라우저 런타임 0개로 관측 불가
#1145 R9   Browser 런타임이 [] 여서 GUI·스크린샷은 관측 불가
#1145 R11  Browser 런타임이 [] 여서 역할별 라이브 GUI 와 PNG 는 관측 불가
#1129 R5   GUI 배지·스크린샷: 브라우저 미연결([])로 관측 불가
#1129 R6   라이브 GUI 는 브라우저 가용 목록이 [] 여서 lock 배지와 캡처가 관측 불가
#1130 R3   실 GUI: renderer 는 실 API 모드로 기동했지만 가용 브라우저가 없어 관측 불가
```

## 실측 — 브라우저는 있다

PM 이 직접 확인했다.

```
%LOCALAPPDATA%\ms-playwright\
  chromium-1161 · chromium-1217
  chromium_headless_shell-1161 · chromium_headless_shell-1217

각 워크트리 clients/desktop/node_modules/@playwright  존재
```

그리고 실제로 띄워 봤다.

```js
// clients/desktop/_local/pwcheck.mjs  (패키지 안에서 실행해야 모듈이 풀린다)
import { chromium } from '@playwright/test'
const b = await chromium.launch({ headless: true })
...
// LAUNCH_OK text=playwright ok  · 스크린샷 7,660 bytes
```

**정상 동작한다.**

## 🔑 무엇을 착각한 것인가

검증자가 찾은 *"가용 브라우저 목록"* 은 **에이전트 도구가 제어하는 브라우저 런타임**(MCP/CDP 세션 목록)이고, 이 저장소의 라이브QA 수단인 **Playwright 와는 다른 것**이다. 그쪽이 비어 있다고 Playwright 를 못 쓰는 게 아니다.

⟹ 게이트 ③(라이브QA 실서버 실행)이 **있지도 않은 이유로** 여섯 라운드 연속 미충족 처리됐다.

## 🚨 2026-08-11 재발 — 이번엔 **구현자(LUNA)** 쪽. 브리핑에 안 넣었기 때문이다

한 세션에서 **세 번** 같은 blocker 가 나왔다.

```text
#1166 fix2   "공유 DB write 금지 · 타 워크트리 컨테이너 · P-QA-40 seed 부재"  ← 이건 진짜 blocker
#1169 fix2   "No browser is available"                                    ← 틀린 blocker
#1170 fix3   "in-app browser 에 사용 가능한 브라우저가 없음"                 ← 틀린 blocker
```

PM 이 매번 확인했고 매번 브라우저는 있었다(`chromium-1217` · `node_modules/.bin/playwright` 정상).

### 🔑 원인 — PM 이 이 절을 **SOL 브리핑에만** 넣고 있었다

```text
검증 브리핑(SOL)   "clients/desktop 안에서 Playwright 직접 실행" 을 매번 넣었다  → 문제 없음
fix 브리핑(LUNA)   "라이브QA 하고 스크린샷" 만 적었다                            → 세 번 다 여기서 났다
⟹ 라이브QA 를 **요구하는 모든** 브리핑에 넣어야 한다. fix 브리핑도 포함이다
```

🚩 함께 관찰된 좋은 점 — 세 구현자 모두 **허위 스크린샷을 만들지 않고 실패 원문/README 를 남겼다.**
blocker 가 틀렸어도 그 처리는 옳다. PM 이 되묻는 것으로 회수된다.

## 🚨 2026-08-13 3차 재발 — 같은 세션에서 **성공 4 · 실패 2** 로 갈렸다

하루에 라이브QA 6라운드를 돌렸는데, **PM 이 위 블록을 넣은 라운드만 완주**했다.

```text
완주   #1189  스크린샷 15장      #1197  라운드 3·4
       #1181  16장               #1199  27장
포기   #1198  "No browser is available" · 목록 []
       #1200  getForUrl(...) No browser is available · agent.browsers.list() []
```

🔑 **차이는 검증자 능력이 아니라 브리핑이었다.** 완주한 넷은 브리핑에 *"Playwright 를 쓰십시오 — chromium-1217 정상 동작이 확인됐습니다"* 가 들어 있었고, 포기한 둘은 그 문장이 없었다. PM 이 브리핑을 짧게 쓰다 빠뜨렸다.

### 오늘 실제로 동작한 경로 — 브리핑에 이대로 붙여라

`#1181` 검증자가 남긴 원문이다.

```text
Version 1.59.1
CHROMIUM_1217_COUNT=1
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe

"인앱 Browser 연결은 실패했으나 로컬 Playwright Chromium 은 정상 실행했다"
```

⟹ **인앱 Browser 런타임과 로컬 Playwright 는 다른 물건이다.** 전자가 `[]` 인 것은 정상이고, 후자로 띄우면 된다. 두 검증자 다 전자의 원문을 붙이고 *"실패 명령과 원문을 붙였다"* 고 여겼다 — **붙인 원문이 다른 도구의 것**이었다.

🚩 좋은 점 — 둘 다 허위 스크린샷을 만들지 않고 중단했다. 그 처리는 옳다. PM 이 되묻는 것으로 회수됐고, 실제로 재개 후 진행됐다.

### ⟹ 규칙을 강화한다

**브리핑을 줄일 때 이 블록을 먼저 지우지 마라.** 세 번 다 그렇게 났다(08-09 SOL 6회 · 08-11 LUNA 3회 · 08-13 SOL 2회). 라이브QA 를 요구하면서 이 블록이 없으면 **브리핑이 미완성**이다.

## How to apply

라이브QA 를 요구하는 모든 브리핑(SOL·LUNA **둘 다**)에 넣는다.

```
🚨 라이브QA 는 Playwright 로 하십시오. chromium 은 이미 설치돼 있습니다
   (%LOCALAPPDATA%\ms-playwright).
   - 반드시 clients/desktop 패키지 안에서 실행하십시오 — 밖에서 import 하면
     ERR_MODULE_NOT_FOUND 가 납니다
   - headless: true 가 기본입니다. headless 캡처도 실 앱·실 서버라
     가짜데이터 위반이 아닙니다
   - "에이전트 브라우저 런타임 목록이 비어 있다" 는 것은 Playwright 를
     못 쓴다는 뜻이 **아닙니다**. 그 이유로 "관측 불가" 를 쓰지 마십시오
   - 정말 못 띄웠다면 **실패 원문**(launch 에러 그대로)을 붙이십시오
```

## 🚨 함께 넣을 것 — **해시라우터**. 안 그러면 홈을 보고 "확인했다" 고 한다

```
❌  await page.goto(`${BASE_URL}/warehouse/...`)     ← 홈으로 낙착한다
✅  await page.goto(`${BASE_URL}/#/warehouse/...`)
```

이 앱은 해시라우터라 **해시 없는 경로는 조용히 홈으로 떨어집니다.** 에러도 안 나고 스크린샷도 찍히니, 검증자는 목표 화면을 봤다고 믿고 보고합니다.

저장소에 가드가 있습니다 — `H-1a: 해시라우터 하네스 대상 goto 는 전부 해시 경로다`. 다만 **CI 에서만 잡히므로** 그 라운드의 라이브QA 판정은 이미 오염된 뒤입니다(2026-08-09 `#1130` R6 실측: `Frontend Desktop` + `하네스 가드` 두 잡이 같은 원인으로 red).

🚨 브리핑에 함께 적을 것:
```
- 해시라우터입니다. goto 는 반드시 `${BASE_URL}/#/경로` 형태로 (해시 없으면 홈으로 낙착)
- 캡처 전에 **그 화면에만 있는 요소**를 하나 단정해 화면 도달을 증명하십시오
```
🔑 두 번째가 근본 방어다 — 경로 규약은 또 틀릴 수 있지만, **화면 고유 요소를 단정하면 홈에 떨어진 것이 그 자리에서 드러난다.**

## 🚨 그리고 라이브 스펙 파일명은 `-real-qa` 로

`playwright.config.ts` 의 `testIgnore` 가 `'**/*-real-qa.spec.ts'` · `'**/*-real-qa/**'` 만 제외한다. 접미사가 없으면 **mock 스위트가 라이브 스펙을 집어 CI 가 깨진다**(2026-08-09 `#1152` 실측 — `QA 자격이 없습니다` 로 mock hard gate red). 자세히는 [[feedback_qa_harness_commit_breaks_ci]].

🚨 **"관측 불가" 를 받으면 PM 이 이유를 되묻는다.** 이 저장소는 *"못 밟으면 관측 불가이지 결함 0 이 아니다"* 를 규칙으로 두는데, 그 규칙이 **틀린 이유로 남용되면 게이트가 영원히 안 닫힌다.** 실패 원문이 없는 "관측 불가" 는 받지 않는다.

## 🚨 2026-08-16 4차 재발 — 원인은 **5슬롯 동시 발주**였다

PR #1246 R4 (SOL) 이 또 같은 문장으로 멈췄다.

```text
판정: 확정 도달 결함 0건
단, Browser 런타임이 [] 여서 세 화면 실 UI·스크린샷은 미도달했습니다
따라서 잔존 결함 0건 및 R4 통과 판정은 보류했습니다
```

🔑 **PM 이 5개 브리핑을 한 번에 쓰면서 이 블록만 빠뜨렸다.** 다른 규율(RED-first·양방향·행 수 세기·프로세스 회수·`--body-file`)은 다섯 개 전부에 들어갔는데 이 블록만 없었다. 병렬 발주는 **브리핑을 균질하게 쓰는 능력을 떨어뜨린다** — 슬롯이 많을수록 각 브리핑이 짧아지고, 짧아질 때 제일 먼저 잘리는 게 이 블록이다(4회 모두 동일).

🚩 이번에도 검증자는 **허위 스크린샷을 만들지 않았다.** 그 처리는 옳다. 좁은 보완 브리핑 하나로 회수된다.

### ⟹ 슬롯을 여러 개 띄울 때의 규칙

**브리핑을 손으로 다시 쓰지 마라. 템플릿에서 붙여라.**
`.claude/briefing/live-qa-block.md` 에 이 블록을 고정해 뒀다. 라이브QA·스크린샷을 요구하는 브리핑이면 SOL·LUNA 가리지 않고 **그 파일을 그대로 붙인다.** 붙였는지 발주 직전에 한 번 센다 — 슬롯 N개면 N번 다 들어가 있어야 한다.

**Why:** 라이브QA 는 이 저장소에서 **코드 재수렴이 못 잡는 층**을 잡는 유일한 수단이다([[feedback_live_qa_first_not_last]] — QA 돌린 4트랙 4번 다 결함이 나왔다). 그것이 여섯 라운드 연속 이유 없이 건너뛰어졌다면, 그 라운드들의 "도달 결함 0" 은 **코드 범위에서만 참**이다.

관련: [[feedback_live_qa_first_not_last]] · [[feedback_sol_review_includes_live_qa]] · [[feedback_qa_environment_verification_first]] · [[feedback_qa_processes_leak_and_starve_machine]] · [[feedback_no_fake_data_ever]]
