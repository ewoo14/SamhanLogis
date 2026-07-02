# E2 기둥1 배차 라이브 컬렉션 동기화 — 라이브 QA (Task6)

실서버 Docker 스택(slip-service 새 jar 재빌드 + api-gateway + eureka + postgres, 전부 healthy) + 실 게이트웨이 :8080 + dev_master 실 로그인. **가짜/합성 금지 — 실 SSE round-trip 캡처.**

## SSE round-trip 실 end-to-end (핵심)

절차:
1. `POST /auth/login` (dev_master / DEV-SEED) → 200, JWT + access_token 쿠키 (`01_login_resp.json`).
2. `GET /admin/dispatch-tasks/board-realtime` SSE 구독(쿠키 인증, 게이트웨이 no-strip 라우트) → 스트림 오픈.
3. `POST /admin/dispatch-tasks {"dispatchDate":"2026-07-02"}` → **201**, taskCode `2026/07/02-1` (`03_create_resp.json`). 게이트웨이가 JWT→X-User-Role=MASTER 주입, 실 DB 커밋.
4. 구독 스트림에 이벤트 실수신.

캡처 (`02_sse_stream.txt`):
```
event:connected
data:{"entityId":"747eb9d3-50ae-3571-9e17-282f1b4c3c3d"}   # = nameUUIDFromBytes("dispatch:board:changed") 결정적 채널

:ping                                                        # 30s heartbeat

event:dispatch:board:changed
data:{"changeType":"CREATED"}                                # ← createTask afterCommit publish 실전달
```

## 입증된 것
- **전 경로 실동작**: 게이트웨이 JWT 인증 → SSE 구독 → 서버 mutation(createTask) 커밋 → **afterCommit 발화** → 구독 클라이언트 **실수신**. E2 기둥1 라이브 컬렉션 동기화의 publish→delivery end-to-end 실증.
- **채널 정합**: connected entityId `747eb9d3...` = `DispatchBoardRealtime.CHANNEL_ID`(nameUUIDFromBytes) 일치 — 발행 채널 = 구독 채널 동일 브로커 확증.
- **게이트웨이 라우트**: `slip-dispatch-admin-noprefix` no-strip 라우트가 `/admin/dispatch-tasks/board-realtime` SSE 를 버퍼링 없이 통과(text/event-stream 실시간 flush).
- **2세션 반영 본질**: 한 연결이 구독 중, 별개 요청(mutation)이 유발한 변경이 구독자에게 라이브 전달됨 = 동시 시청자 실시간 반영의 핵심 메커니즘.

## 한계·정직 disposition
- **2-GUI 데스크탑 세션 캡처 미수행**: 16-서비스 풀스택 GUI 2-세션 스크린샷은 본 세션에서 미수행. 대신 실 게이트웨이 SSE round-trip(위)으로 publish→delivery 를 실증(더 결정적). FE invalidateQueries 는 vitest 로 검증.
- **changeType CREATED 1종 캡처**: UPDATED/DELETED/STATUS_CHANGED 는 동일 `publishBoardChanged` 경로(메커니즘 동일)이며 각 단위테스트로 verify(cb48c24d). payload 는 FE opaque(무조건 refetch)라 값 무관.
- **모바일 WebView**: 웹 번들 SSE 가 WebView 내에서 동작(동일 `createRealtimeClient`) → 자동 반영 예상. 별도 모바일 GUI 캡처 미수행(기동 부담), 웹 SSE 실동작으로 갈음.

## 환경
- Docker: slip-service(새 jar `--build` 재빌드, healthy) · api-gateway · eureka · postgres 전부 healthy.
- 실 게이트웨이 :8080, dev_master(MASTER) 실 로그인, mock OFF.
