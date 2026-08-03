---
name: feedback-pm-must-open-qa-screenshots
description: 라이브QA 캡처는 PM 이 직접 열어보고 게이트로 세라 — JSON 을 실 화면으로 전달한 사고 (2026-08-02)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 784d015b-a375-44cf-bf9a-36470a6fe392
  modified: 2026-08-02T13:47:24.668Z
---

개발책임자 지적 (2026-08-02):

> *"라이브QA 스크린샷이 JSON 데이터인데 진짜 라이브QA 수행한게 맞아?"*

**실측.** PR #1046 라이브QA 캡처를 열어보지 않고 개발책임자께 전달하며
*"목록·상세에서 노출 코드가 모델명으로 나온다"* 고 캡션을 달았다. 실제로 열어 보니:

| 캡처 | 실체 |
|---|---|
| `01-live-product-list-model-name.png` | **JSON API 응답을 브라우저에 띄운 것** |
| `02-live-product-detail-model-name.png` | **JSON** |
| `04-scenario-4-stock-balance.png` | 실 화면 (재고 현황) — 유효 |

같은 세션의 PR #1024 캡처는 **전부 실 화면**이었다(품목 등록 화면 + 충돌 배너).
즉 담당자·라운드마다 품질이 달랐고 **PM 이 구분하지 않고 통과시켰다.**

**How to apply:**
- 🔑 **라이브QA 캡처는 게이트 ③ 의 증거다. PM 이 Read 도구로 직접 열어보고** 실 화면인지
  확인한 뒤에만 게이트 충족으로 센다. 파일명(`live-…`, `real-qa`)은 증거가 아니다.
- 🔑 **사용자에게 전달할 때도 열어보고 캡션을 쓴다.** 안 본 것을 본 것처럼 요약하면
  개발책임자가 잘못된 근거로 판단하게 된다.
- 🔑 브리핑에 *"API JSON·터미널 출력으로 대체 금지, 실 사용자 화면만"* 을 넣어도
  지켜지지 않을 수 있다 — **산출물 검증은 여전히 PM 몫**([[feedback_pm_delegate_to_codex_conserve_tokens]]).
- 🔑 판정 문구도 같이 본다: *"lookup 관문 HTTP 200"* 처럼 **HTTP 로 답한 시나리오**는
  실 화면 캡처가 아닐 가능성이 높다.

**Why:** 게이트 ③(라이브QA=실서버 실제 실행)의 목적이 *"사용자 버그는 실행해야 나온다"* 인데,
API 응답 캡처는 실행 증거가 아니라 **정적 게이트의 변형**이다. 그것을 통과로 세면
게이트가 이름만 남는다. → [[feedback_real_server_check_screenshot]]
