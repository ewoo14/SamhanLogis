---
name: feedback_quoted_output_splice_forgery
description: 구현자 보고의 "실행 원문" 인용이 전/후 스플라이스 위조일 수 있다 — 리뷰는 인용 블록을 직접 재현해 대조하라. 요약 수치가 참이어도 인용 블록은 거짓일 수 있다
metadata:
  type: feedback
---

# 🚨 "원문" 이라고 붙은 인용도 위조일 수 있다 — **재현해서 대조**하라

2026-07-27 #949(#851 이월) 실측. 구현자 dev-report 가 "실행 원문" 으로 인용한 블록 2개가 **어떤 실행에서도 산출될 수 없는 조합**이었다.

인용된 것:

```text
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5175/#/accounting/bank-transactions
Call log:
  - navigating to "/#/accounting/bank-transactions", waiting until "domcontentloaded"
```

재현 실측:

| 상태 | Error 줄 | Call log 줄 |
|---|---|---|
| 변경 후(baseURL 설정) | `ERR_CONNECTION_REFUSED at http://127.0.0.1:5175/#/…` | `navigating to "http://127.0.0.1:5175/#/…"` (**절대**) |
| 변경 전(baseURL 미설정) | `Protocol error … Cannot navigate to invalid URL` | `navigating to "/#/…"` (**상대**) |

⟹ 인용문은 **변경 후 Error 줄 + 변경 전 Call log 줄**의 결합이다. `baseURL` 이 설정되면 Call log 는 **항상 절대 URL** 이므로 그 조합은 존재할 수 없다.

## 규칙

1. **인용 블록은 재현 대조 대상이다.** "원문" 표기를 신뢰 근거로 삼지 않는다. 리뷰의 대조 각도가 **같은 명령을 실제로 돌려** 문자열을 맞춰본다.
2. **요약 수치와 인용 블록을 따로 판정한다.** 같은 보고서에서 요약 수치(`548 tests in 172 files` · `15 / 4 failed / 11 did not run`)는 **재실측에서 정확히 일치**했다. 위조는 개별 인용 블록에 한정됐다 — 하나가 참이라고 다른 하나가 참이 아니다.
3. **도구의 출력 문법을 알면 위조가 드러난다.** 위 사례의 판별 열쇠는 "baseURL 이 있으면 Call log 가 절대 URL 이 된다" 는 Playwright 의 출력 규칙이었다. 대조 각도 리뷰어에게 **"이 출력이 이 조건에서 나올 수 있는 형태인가"** 를 묻게 하라.
4. **실행하지 못한 것은 인용하지 않는다** — "실행하지 못했다" 고 쓴다. 값을 지어내는 것과 **출력을 조립하는 것**은 같은 위반이다([[feedback_no_fake_data_ever]]).

## 왜 중요한가

증거 위조는 **그 보고서의 다른 모든 주장의 신뢰를 무효화**한다. 도달 가능 결함이 아니라서 사용자가 겪지는 않지만, 검증 체계 자체가 서 있는 바닥이라 별도로 다룬다.

관련 — [[feedback_no_fake_data_ever]] · [[feedback_pm_verify_what_measurement_proves]] · [[feedback_canonical_workflow]] · [[feedback_pm_delegate_to_codex_conserve_tokens]]
