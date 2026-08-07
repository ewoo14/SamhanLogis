---
name: feedback_live_qa_every_round_screenshots
description: 라이브 QA(Docker 실서버+실 GUI 스크린샷)는 매 리뷰 라운드마다 필수 — 끝 1회/텍스트 대체 금지
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b6595c58-1401-4b50-805f-e460138d686c
---

2026-07-02 개발책임자 강력 지적(E2 #699 위반). 캐논 워크플로우 QA 차원 = **"Docker 라이브QA + 단계별 스크린샷"을 매 리뷰 라운드마다**(Opus 5-agent 라운드 AND Codex 5-agent 라운드 각각) 수행. 위반 2종 금지:

1. **끝에 1회로 미루기 금지** — 라이브 QA 를 마지막 Task/PM 단계로 deferral 하지 말 것. **각 리뷰 라운드의 QA agent 가 실제 Docker 라이브 QA 를 수행**하고 스샷을 그 라운드 게시에 인라인.
2. **텍스트/API/SSE 캡처로 GUI 스샷 대체 금지** — 실사용자 데스크톱/브라우저 **화면 스크린샷**이 증거. curl/SSE round-trip 텍스트는 보조일 뿐, [[feedback_real_server_check_screenshot]] 기준(실 UI 화면 캡처) 필수. 단계별 여러 장(한 장 금지, [[feedback_canonical_workflow]]).

**Why**: E2 #699 에서 라이브 QA 를 매 라운드가 아닌 종료 직전 1회, 그것도 SSE 텍스트 캡처(스샷 없음)로 처리 → 개발책임자 "라이브 QA를 리뷰 라운드마다 요청했었음" 지적. QA 차원이 정적 코드리뷰로 형해화되면 실 UI 결함(깜빡임·stale·충돌)을 놓침.

**How to apply**: 매 Opus·Codex 리뷰 라운드에서 QA agent(또는 PM)가 (a) Docker 실서버 재빌드·기동(코드 반영, launch 후 `docker compose up -d --build <svc>` [[project_local_stack_qa_gotchas]]) (b) 실 게이트웨이 :8080·dev_master(자격은 `infrastructure/.env.local`)·mock OFF 로그인 (c) 해당 기능 실 화면 **단계별 스크린샷** 캡처(2세션 라이브 반영 등) docs/qa/<slice>/ (d) 라운드 게시에 인라인. Docker/GUI 불가 요소만 정직 명시(P2)+대안. [[feedback_qa_docker_real_test]] [[feedback_overnight_live_capture]] [[feedback_no_fake_data_ever]]

**2026-07-03 정제(개발책임자 워크플로우 감사)**: '매 라운드' 원칙 유지하되 **실 캡처 대상 = 실 GUI 변경이 있는 라운드**. BE/mock-only 변경·review-only(재검) 라운드·실데이터 불가(예 대상 seed 0건) 라운드는 **정직 disposition**(직전 캡처 참조+사유 명기·해당 변경이 GUI 미영향임을 근거화, 가짜/합성 캡처 금지) 허용. 즉 GUI 변경 라운드는 반드시 실 캡처, 비-GUI/데이터불가 라운드는 정직 보고. (오버나이트 6머지 세션 감사서 확정 — #700 D/F/G·E1-b-2 매입[INBOUND seed 0]·각 재검 라운드가 이 정합.)

**🚨 2026-07-05 개발책임자 재지적 — "Codex 라운드도 Codex에 의해 라이브 QA 진행"**: Codex 순차 라운드를 **read-only 리뷰로 단축 금지**. Codex 라운드 = Codex(mcp__codex__codex, danger-full-access)가 **직접** (a) Docker 실서버 재빌드·기동 (b) 실 게이트웨이 :8080·dev_master·mock OFF (c) 해당 기능 실 플로우 실행 (d) 단계별 스샷 캡처 → 라운드 게시 인라인. 2026-07-03 'review-only 재검 disposition'을 **Codex 라운드 전체를 QA 없는 read-only로 만드는 핑계로 과잉적용 금지**(내 상습 실수). disposition 은 '해당 라운드에 새 GUI 변경이 없을 때 캡처 생략+정직 사유'만 허용이지, Codex 가 라이브 QA 자체를 안 하는 근거가 아님. BE-only 슬라이스도 Codex 가 실 플로우(예: 재고예약/주문확정 실호출) 라이브 실증. (#25 X-Is-System-Master 세션서 재지적.)
