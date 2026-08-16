---
name: feedback-amount-must-be-single-source-across-steps
description: 같은 주문의 금액이 미리보기·최종확인·저장값에서 갈라지는 결함 계열 — 단계마다 각자 계산하면 사용자가 다른 금액을 보고 승인한다
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-16T02:39:32.804Z
---

2026-08-16 실측. **서로 다른 두 PR 에서 같은 계열의 결함이 동시에 나왔다.**

```text
#1229  미리보기/서버저장 36,960원   vs  최종 확인창 61,600원
       미리보기/서버저장 1,576,036원 vs  최종 확인창 2,982,100원
       근원 — 미리보기는 서버 line.finalPrice, 확인창은 buildSendRows() 의 it.price
              order-app/index.html:6815  vs  :8282

#1241  품목표/최종확인 1,590,000원  vs  미리보기 2,313,975원   (723,975원 차이)
       근원 — 서버 가격 미리보기가 세트 배분가를 덮어씀
```

🔑 **둘 다 "화면이 잘못 그린다" 가 아니라 금액을 만드는 경로가 둘 이상이었다.**
어느 한 단계에서만 고치면 다른 단계가 남는다.

## How to apply

```text
🚨 금액이 걸린 화면은 "단계마다 같은 값인가" 를 반드시 실행으로 확인한다
   품목표 → 미리보기 → 최종 확인창 → 서버 저장값 → 조회 재표시
   한 곳이라도 다르면 결함이다. 심각도 무관 — 사용자가 다른 금액을 보고 승인한다

🚨 fix 는 표면에서 숫자를 덮어쓰지 말고 **금액이 갈라지는 지점을 찾아 원천에서 하나로** 만든다
   "확인창만 서버값으로 바꿔라" 식 봉합은 다음 단계에서 또 갈라진다

🚨 라이브QA 브리핑에 이 축을 넣어라 —
   "같은 주문의 금액을 단계별로 나란히 적어라" 라고 명시하지 않으면 검증자가 한 화면만 본다
```

🚩 이 결함은 **정적 테스트로는 안 잡힌다.** 두 경로가 각각 자기 테스트를 통과하기 때문이다.
실제로 화면을 단계별로 넘겨 봐야 나온다 → [[feedback_live_qa_first_not_last]]

관련: [[feedback_measure_display_vs_interaction]] · [[feedback_fix_closes_symptoms_not_denominator]] ·
[[feedback_gas_parity_function_and_result_not_ui]](결과 표시방식 동등 — 금액 자리 하나가 청구액을 바꾼다)
