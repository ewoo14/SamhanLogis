---
name: feedback_emit_real_tool_calls
description: 🚨 도구 호출은 반드시 실제 함수 호출(invocation)로 발행 — 산문/들여쓴 텍스트로 적으면 실행 안 되고 화면 노출만(루프 안 걸림·작업 누락). 호출 후 결과 확인 의무.
metadata:
  type: feedback
---

🚨 2026-06-24 개발책임자 **3회 지적**("자꾸 텍스트로 나옴·재발방지 요청"). **모든 도구 호출(특히 ScheduleWakeup·TaskUpdate 등 단독 호출)은 실제 함수 호출 메커니즘으로만 발행한다.** 산문 형태(들여쓰기·`call`/`invoke` 텍스트·코드펜스 안)로 적으면 파서가 텍스트로 처리 → 실행 안 되고 화면에만 노출 → 루프 안 걸림·작업 누락.

**Why**: 이번 세션에서 ScheduleWakeup/TaskUpdate를 텍스트로 적어 3회 미실행. 단독 도구 호출을 prose처럼 작성하는 습관이 원인.

**How to apply**:
- 도구 호출은 항상 진짜 invocation 으로 발행(앞에 코드펜스/들여쓰기/리스트 마커 금지).
- 호출 직후 **결과(예약 확인·도구 출력)를 확인** — 결과가 안 오면 텍스트 노출된 것이니 즉시 재발행.
- 한 응답에 prose + 도구 호출을 섞을 때 도구 호출 블록을 깨끗이 분리(설명을 호출처럼 들여쓰지 말 것).
- 특히 "ScheduleWakeup 1건만 발행하고 턴 종료" 같은 단독 호출 시 가장 자주 실수 → 발행 후 "Next wakeup scheduled" 확인 필수.
