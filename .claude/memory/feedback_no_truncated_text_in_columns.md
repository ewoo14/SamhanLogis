---
name: feedback-no-truncated-text-in-columns
description: 열이 좁아 글씨가 말줄임으로 잘리면 안 된다 — 품목명·모델명은 업무 식별자라 잘리면 구별이 안 된다
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-15T10:42:36.751Z
---

개발책임자 (2026-08-15): *"또한 열이 너무 좁아서 글씨가 잘리지 않도록 주의"*

실측 (#1223 주문서 상세 라이브QA 캡처):

```text
품목명   실외기_6HP…       Y형 실내기 …
모델명   AJ060MXH…         AXJ-YA251…
```

**Why:** 품목명·모델명은 업무 식별자다. 잘리면 두 행이 같은 품목인지 다른 품목인지 구별할 수 없다.
병합 승인처럼 "보고 판단해서 누르는" 화면에서는 잘린 글씨가 곧 잘못된 승인이 된다.
`AJ060MXHNBC1` 과 `AJ060MXHNBC2` 는 `AJ060MXH…` 로 똑같이 보인다.

🔑 **비용은 개발책임자가 이미 정했다** — *"스크롤해도 상관 없음"*.
가로 스크롤이 생기는 것보다 글씨가 잘리는 것이 나쁘다. 폭을 줄여 맞추려 하지 마라.

**How to apply:**

- 표를 만들거나 고칠 때 **식별자 열(품목명·모델명·거래처명·전표번호)** 이 잘리는지 먼저 본다
- `text-overflow: ellipsis` 로 덮지 말고 열 폭을 주거나 줄바꿈시킨다
- 폭이 모자라면 **가로 스크롤을 허용한다** — 잘라내지 않는다
- tooltip 으로 때우지 마라 (마우스 없는 경로에서 안 보인다)
- 라이브QA 캡처를 볼 때 `…` 가 보이면 그 자체가 결함 신호다
- 좁은 폭(1024px·모바일 390px)에서도 확인한다 — [[feedback_measure_display_vs_interaction]]

관련: [[feedback_auto_blank_row_for_all_line_entry]] · [[feedback_uuid_no_user_visibility]]
