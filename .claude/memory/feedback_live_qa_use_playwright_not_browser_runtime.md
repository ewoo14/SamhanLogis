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

## How to apply

라이브QA 를 요구하는 모든 브리핑(SOL·LUNA)에 넣는다.

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

🚨 **"관측 불가" 를 받으면 PM 이 이유를 되묻는다.** 이 저장소는 *"못 밟으면 관측 불가이지 결함 0 이 아니다"* 를 규칙으로 두는데, 그 규칙이 **틀린 이유로 남용되면 게이트가 영원히 안 닫힌다.** 실패 원문이 없는 "관측 불가" 는 받지 않는다.

**Why:** 라이브QA 는 이 저장소에서 **코드 재수렴이 못 잡는 층**을 잡는 유일한 수단이다([[feedback_live_qa_first_not_last]] — QA 돌린 4트랙 4번 다 결함이 나왔다). 그것이 여섯 라운드 연속 이유 없이 건너뛰어졌다면, 그 라운드들의 "도달 결함 0" 은 **코드 범위에서만 참**이다.

관련: [[feedback_live_qa_first_not_last]] · [[feedback_sol_review_includes_live_qa]] · [[feedback_qa_environment_verification_first]] · [[feedback_qa_processes_leak_and_starve_machine]] · [[feedback_no_fake_data_ever]]
