# 라이브QA 블록 — 브리핑에 그대로 붙인다

> 🚨 라이브QA·스크린샷을 요구하는 **모든** 브리핑(SOL·LUNA 둘 다)에 아래 블록을 통째로 붙인다.
> 손으로 다시 쓰지 마라. 4회 재발 전부 "짧게 쓰다 빠뜨림" 이 원인이었다
> (08-09 SOL 6회 · 08-11 LUNA 3회 · 08-13 SOL 2회 · 08-16 SOL 1회).
> 슬롯 N개를 동시에 띄우면 **발주 직전에 N번 다 들어갔는지 센다.**
> 근거: [.claude/memory/feedback_live_qa_use_playwright_not_browser_runtime.md](../memory/feedback_live_qa_use_playwright_not_browser_runtime.md)

---

## 🚨 라이브QA 는 Playwright 로 한다. chromium 은 이미 설치돼 있다

```
%LOCALAPPDATA%\ms-playwright   (chromium-1217 정상 동작 실측됨)

- 반드시 clients/desktop 패키지 **안에서** 실행하라 — 밖에서 import 하면 ERR_MODULE_NOT_FOUND 가 난다
- headless: true 가 기본이다. headless 캡처도 실 앱·실 서버라 가짜데이터 위반이 아니다
- "에이전트 브라우저 런타임 목록이 비어 있다"([]) 는 것은 Playwright 를 못 쓴다는 뜻이 **아니다.**
  그것은 에이전트 도구가 제어하는 MCP/CDP 세션 목록이고 Playwright 와는 다른 물건이다.
  그 이유로 "관측 불가" 를 쓰지 마라.
- 정말 못 띄웠다면 **launch 에러 원문 그대로**를 붙여라 (다른 도구의 출력 말고)
```

## 🚨 해시라우터

```
❌  page.goto(`${BASE_URL}/warehouse/...`)     ← 조용히 홈으로 낙착한다. 에러도 안 나고 캡처도 찍힌다
✅  page.goto(`${BASE_URL}/#/warehouse/...`)
```

🔑 **캡처 전에 그 화면에만 있는 요소를 하나 단정해서 화면 도달을 증명하라.**
경로 규약은 또 틀릴 수 있지만, 화면 고유 요소를 단정하면 홈에 떨어진 것이 그 자리에서 드러난다.

## 🚨 스크린샷은 행 수를 센다

화면에 뜬 **행 수**와 백엔드 응답 **건수**를 나란히 적어야 증거가 된다.
stub 화면도 한글은 정상으로 보인다 — 행 수를 세야 걸린다.
파일명·바이트 수를 적고 직접 육안 확인했다고 명시하라.

## 🚨 라이브 스펙 파일명은 `-real-qa`

`playwright.config.ts` 의 `testIgnore` 가 `**/*-real-qa.spec.ts` · `**/*-real-qa/**` 만 제외한다.
접미사가 없으면 **mock 스위트가 라이브 스펙을 집어 CI 가 깨진다.**

## 🚨 프로세스 회수

기동한 Playwright·chrome-headless-shell·Electron·Vite·Metro·격리 컨테이너를 **전부 회수**하고
잔여 수를 보고하라. 회수 지시가 없으면 쌓인다 — 275개까지 간 적이 있다.
