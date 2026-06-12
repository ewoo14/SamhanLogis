---
name: 코멘트 용어 — 협업 코멘트 금지
description: 사용자 노출 라벨은 "협업 코멘트"가 아니라 그냥 "코멘트". 영문 식별자(CollabComment/collab-core)는 별개로 유지
metadata:
  type: feedback
---
2026-06-12 개발책임자 지시: "코멘트는 협업 코멘트라고 하지 말고 그냥 코멘트라고 해."

- 화면 노출 라벨·헤더·aria-label·문서·내 발화에서 **"협업 코멘트" 금지 → "코멘트"** 사용.
- 영문 기술 식별자(`DispatchCollabComment`, `collab-core`, `dispatchCollab`, `CollabCommentService`)는 기술 식별자라 **유지**([[jeonpyo-not-slip]] 의 slipId 예외와 동일 원리).
- 적용처: 데스크톱 `DispatchCommentThread`(헤더/aria-label), 신규 코멘트 UI 전부. 기존 테스트 spec 설명 등은 점진 치환.

**Why:** 사용자에게는 단순·일관 용어가 중요. "협업"은 내부 기능명일 뿐 사용자 노출 불필요.
**How to apply:** 코멘트 기능 UI/문서/발화에 "코멘트"만. 새 화면도 처음부터 "코멘트". 관련: [[jeonpyo-not-slip]] [[arologis-name]].
