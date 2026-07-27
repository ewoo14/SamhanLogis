---
name: feedback_pm_delegate_to_codex_conserve_tokens
description: 🚨 PM 토큰 절약 — 기획 정찰·구현·리뷰·라이브QA 를 최대한 Codex/서브에이전트에 위임하고 PM 직접 실행 최소화. PM 은 오케스트레이션·검증·commit 대행·머지·결정만
metadata:
  type: feedback
---

# 🚨 PM 직접 실행 최소화 · 가급적 Codex 토큰 위임 (2026-07-27 개발책임자 지시)

> *"직접하는데 토큰이 너무 소요되었으므로 코덱스로 진행 바람"* · *"가급적 CODEX 토큰 사용 바람"*

세션 초반 PM(메인 세션)이 정찰·검증·라이브QA 를 직접 수행하다 토큰을 과소모하자 개발책임자가 정정. **PM 세션의 토큰이 병목**이므로 토큰-무거운 작업을 Codex/서브에이전트로 밀어낸다(Codex/서브에이전트 토큰은 PM 세션 토큰과 별개 풀).

## 무엇을 위임하나 (거의 전부)
- **기획 전수 정찰** — 큰 파일·다표면 조사는 `mcp__codex__codex`(gpt-5.6-sol) 또는 OPUS 서브에이전트. PM 은 정찰 **결과로 설계 결정**만.
- **구현** — CODEX LUNA (`gpt-5.6-luna`).
- **적대검증 리뷰** — 1차 OPUS 서브에이전트(Agent `model:"opus"`), 2차 CODEX SOL. fix = SONNET5(Agent `model:"sonnet"`)/LUNA.
- **라이브QA** — 원칙상 OPUS 라운드는 PM 직접이나(캐논), **토큰 절약이 우선일 때 SOL/QA 에이전트에 위임 가능**. 단 PM 은 산출물(스샷·응답코드·RED 원문)을 **검증**한다.

## PM 이 직접 하는 것 (위임 안 함)
오케스트레이션 · 디스패치 브리핑(불변식) · **산출물 검증**(릴레이 금지 — PM 이 diff·스샷·수치를 직접 확인) · commit 대행 · PR 게시 · 개발책임자 결정 상신 · 머지 · 핸드오프.

## 검증은 여전히 PM 몫
위임했다고 **결과를 그대로 신뢰하지 않는다**. 실측 3건(이 세션): ①LUNA fix 가 `DECISIONS.md` 에 공백/EOL 잔재 → PM diff 확인이 잡아 revert ②SOL 이 stale 배포에 라이브QA → PM 이 재배포+프로브로 재확증 ③OPUS 가 spec 불변식 모순(LUNA 가 잡음)·V67↔DepositMatch 충돌(OPUS 가 잡음)을 발견. 위임 산출물마다 **"이 측정이 증명하는 것"** 을 PM 이 대조한다.

**왜** — PM 세션 토큰이 유한하고 3~4 트랙 상시 오케스트레이션에는 정찰·리뷰·QA 를 병렬 위임해야 처리량이 난다. PM 이 직접 파면 한 트랙에 토큰이 쏠려 병렬성이 죽는다.

관련: [[feedback_pm_no_direct_implementation]] · [[feedback_codex_plugin_setup]] · [[feedback_pm_verify_what_measurement_proves]] · [[feedback_pm_codex_progress_verification]]
