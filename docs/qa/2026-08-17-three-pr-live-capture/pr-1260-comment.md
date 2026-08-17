## SOL 라이브 QA — #1260

현재 head `db77a38bf`의 `wd03` 프론트를 공유 gateway/auth/product 스택에 연결해 캡처했습니다. 공유 컨테이너 재시작과 DB 쓰기는 없었습니다.

- [① 홈멀티](screenshots/01-home-multi-remote-panel-options.png): 107/107행, 리모컨 6개, 판넬 5개
- [② 인피니트](screenshots/02-infinite-home-panel-options.png): 107/107행 중 인피니트 세트 1행 선택, 판넬 총 5개(실제 4종 + 판넬제외)
- [③ 상업멀티](screenshots/03-commercial-multi-remote-panel-options.png): 310/310행, 리모컨 6개, 판넬 7개, 형상 2개
- [④ 싱글중대형](screenshots/04-single-remote-panel-options.png): 전체 851행/표시 133행, 리모컨 3개, 판넬 5개, 형상 2개

인피니트 판넬 실제 표시 4종은 `기본`, `공청`, `인피니트 25년형`, `인피니트 공청+동작감지 AI`입니다. 요청된 네 모델 코드는 셀렉트에 코드가 아니라 표시명으로 노출돼 화면 표시명 기준으로 확인했습니다.

기동한 프론트 프로세스는 회수했고 공유 24개 컨테이너는 그대로 healthy입니다.

전체 보고서: `docs/qa/2026-08-17-three-pr-live-capture/report.md`
