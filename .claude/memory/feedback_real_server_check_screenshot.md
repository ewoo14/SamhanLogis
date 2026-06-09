---
name: feedback_real_server_check_screenshot
description: 실서버 점검·QA 시 PR 에 실제 스크린샷 반드시 첨부 (psql/콘솔 출력 아닌 실 화면/응답 캡처)
metadata:
  type: feedback
---

실서버를 대상으로 점검/검증/QA 를 수행할 때는 **PR 본문에 실제 스크린샷을 반드시 인라인 첨부**한다 (2026-06-09 개발책임자 지시).

**Why**: 텍스트 로그/표만으로는 "실제로 실서버에서 돌렸다"는 증명이 약하다. 실 화면·실 응답 캡처가 [[feedback_no_fake_data_ever]] · [[feedback_qa_docker_real_test]] 의 정직성 기준을 시각적으로 충족한다.

**How to apply**:
- 🚨 **실사용자가 보는 실제 화면을 캡처한다** (2026-06-09 개발책임자 재지시). API JSON 응답/psql 출력 캡처는 불충분 — 데스크톱 앱(Electron/렌더러)이 **실 Docker 스택**(VITE_MOCK_MODE 아님, 실 게이트웨이·실 서비스·실 DB)에 붙어 실제 기능 흐름(예: 전표 생성 → 세트가 구성품으로 전개된 라인 화면)을 수행하는 장면을 캡처.
- 기능에 UI 가 있으면 **반드시 그 UI 화면**을 캡처(전표 목록/상세/작성 화면 등). API-only(UI 없는 내부 엔드포인트)면 그 기능이 실제로 영향을 주는 **사용자 화면**(예: 세트 전표가 화면에 구성품으로 보이는 장면)으로 대체 캡처.
- 실 스택 기동 = `scripts/launch-local-stack` + 데스크톱 렌더러를 실 게이트웨이(`VITE_API_BASE_URL=http://localhost:8080`)로 기동(mock 모드 끄기). 실 로그인/시드 계정 사용.
- 기존 [[feedback_pr_qa_screenshots]] · [[feedback_no_fake_data_ever]] · [[feedback_qa_docker_real_test]] 의 실서버 강화판. 합성·목업·VITE_MOCK_MODE fixture 화면 금지.
- 실연동 불가로 캡처 못 하면 "캡처 불가 + 사유" 정직 명시(가짜 생성 금지).
