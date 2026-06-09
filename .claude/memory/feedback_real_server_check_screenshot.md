---
name: feedback_real_server_check_screenshot
description: 실서버 점검·QA 시 PR 에 실제 스크린샷 반드시 첨부 (psql/콘솔 출력 아닌 실 화면/응답 캡처)
metadata:
  type: feedback
---

실서버를 대상으로 점검/검증/QA 를 수행할 때는 **PR 본문에 실제 스크린샷을 반드시 인라인 첨부**한다 (2026-06-09 개발책임자 지시).

**Why**: 텍스트 로그/표만으로는 "실제로 실서버에서 돌렸다"는 증명이 약하다. 실 화면·실 응답 캡처가 [[feedback_no_fake_data_ever]] · [[feedback_qa_docker_real_test]] 의 정직성 기준을 시각적으로 충족한다.

**How to apply**:
- 실서버 점검(정합성 쿼리, API 호출, UI 흐름 등) → 그 결과를 실제 캡처(PNG)하여 `docs/qa/<slug>/*.png` 저장 + PR 본문 인라인 첨부.
- 가능하면 **실 UI 화면** 캡처(데스크톱 앱이 실 BE 에 붙은 장면). UI 가 없는 BE 점검이면 실 API 응답/실 DB 조회 결과를 캡처(합성·목업 금지, [[feedback_no_fake_data_ever]]).
- 기존 [[feedback_pr_qa_screenshots]](모든 PR QA 스크린샷 1장+) 의 실서버 강화판 — 실서버가 개입한 점검은 예외 없이 캡처.
- 실연동 불가로 캡처 못 하면 "캡처 불가 + 사유" 정직 명시(가짜 생성 금지).
