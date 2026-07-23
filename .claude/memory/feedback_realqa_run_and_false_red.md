---
name: realqa-run-and-false-red
description: 데스크톱 real-qa Playwright 실행법(렌더러 vite mock off + VITE_API_BASE_URL + AUDIT_BASE_URL) + 스펙 false-RED 함정(행 첫 토큰=드래그 핸들 글리프 ⠿ 추출, 스펙 실패도 스펙 버그)
metadata:
  type: feedback
---

2026-06-17 PR #495(에픽 #18 슬2) 회고.

## 데스크톱 real-qa 실행법 (실 게이트웨이 실서버 QA — mock 아님)
real-qa config(`clients/desktop/playwright.real-qa.config.ts`)엔 **webServer 없음** → 렌더러 dev 를 **수동 기동** 후 실행.
1. 렌더러(web, mock OFF): `cd clients/desktop && VITE_API_BASE_URL=http://localhost:8080 npx vite src/renderer --host 127.0.0.1 --port 5175` (백그라운드). **VITE_API_BASE_URL 필수** — 없으면 axios baseURL 미설정으로 API 미도달. VITE_MOCK_MODE 미설정=mock off.
2. 실행: `cd clients/desktop && AUDIT_BASE_URL=http://127.0.0.1:5175 node_modules/.bin/playwright test --config=playwright.real-qa.config.ts <spec> --reporter=line --timeout=90000` ([[playwright-local-version-skew]] — node_modules/.bin 직접).
3. 로그인: spec 이 `POST :8080/auth/login {dev_master, dev_p05_pass!}` → `window.samhanAuth` stub `addInitScript` 주입(client.ts interceptor 가 토큰 사용). 스크린샷 `docs/qa/<slug>/*.png`.

## 🪤 real-qa 스펙 false-RED 함정
구성품/행 코드 추출 시 `row.innerText().trim().split(/\s+/)[0]` 는 **행 선두의 design-system DragHandle 글리프 `⠿`** 를 잡음(모델코드 아님) → 모든 행 코드가 `⠿` 동일 → 이동/순서 단언이 **항상 실패**(기능 정상인데 스펙이 false-RED). → 모델코드 span 직접 추출.
- 헤드리스 dnd-kit **키보드 드래그(Space/Arrow)는 flaky** → `boundingBox()` 기반 **마우스 드래그**(down→소폭 이동 activation→target→up)가 신뢰성 높음.
- **스펙 실패도 스펙 버그일 수 있다** — 실 DOM(`test-results/.../error-context.md`)·스크린샷으로 기능 동작을 교차 확인한 뒤 판단(false-RED 를 기능 결함으로 오인 금지). [[no-fake-data-ever]] 실 캡처 원칙과 양립.

## 가드 모수 대칭 (D-PCE-09)
서버측 "전체 포함 강제" 가드의 모수는 **FE 가 실제 전송하는 모수와 집합이 동일**해야 함 — BE 가 전체(usageScope 무관), FE 가 부분(usageScope≠NONE)만 보내면 정상 요청도 거부(영구 400). 가드 쿼리에 FE 와 동일 필터(`usageScope IN (ESTIMATE/PARTNER_ORDER/BOTH)`) 적용. Opus BE 리뷰 단독 적발.

## Git Bash 도구 함정
`jq` 미설치(Git Bash) → 토큰은 `grep -oE '"token":"[^"]+"'` 추출. 한글 model_code(자재 운임/절삭/발통세트)는 Git Bash 파이프가 UTF-8 멀티바이트를 깨뜨림(0xb9) → 서버 500(JSON parse). docker exec 출력은 **`docker cp` + `curl --data-binary @file`** 로 바이트 보존. **curl URL 쿼리의 raw 한글도 깨짐** → `q=서울` 대신 **URL-인코딩**(`q=%EC%84%9C%EC%9A%B8`)으로 보낼 것.

## 🪤 거짓 "플랫폼 갭/라우트 끊김" 오진 (2026-06-23 슬F #576)
거래처 검색이 "404/500 라우트 끊김 = 플랫폼 사전 갭"이라 오진 → 하마터면 **불필요한 partner-service/gateway 변경**을 할 뻔. 실제론 **내 QA 도구 오류 2개**가 만든 거짓 신호:
1. **curl에 `/api` 접두를 임의로 붙임**(`/api/admin/partners/search`=404). FE apiClient `baseURL=http://localhost:8080`(게이트웨이, **/api 없음**)이고 FE 경로는 `/admin/partners/search`(200). → **FE가 실제 호출하는 정확한 URL**(baseURL+path)을 client.ts에서 확인하고 그대로 재현할 것. 경로에 /api 등 임의 접두 금지.
2. **raw 한글 쿼리**(`q=서울`)가 Git Bash에서 깨져 0건(`¼­¿ï` 모지바케) → "이름 검색 안 됨"으로 오인. URL-인코딩하니 정상(서울→2건, 에어→15건).
**교훈**: "라우트/플랫폼이 끊겼다" 결론 전에 — (a) FE 실호출 URL 정확 재현(접두 임의 추가 X), (b) 한글 쿼리 URL-인코딩, (c) `q` 없는 호출로 200·데이터 유무 먼저 확인. 플랫폼 변경 escalation 전 자기 QA 도구부터 의심. (Opus 리뷰의 진짜 BLOCKING=거래처 UUID 비공개 의존은 별개로 유효 → partnerCode 재설계로 해소.)

관련: [[temp-multimodel-workflow]] [[qa-docker-real-test]] [[real-server-check-screenshot]] [[local-stack-qa-gotchas]] [[uuid-no-user-visibility]].

## 🪤 고아 renderer dev 서버 = false-RED/가짜 증적 원천 (2026-07-03 #711 실측)
집PC 에 이전 세션 잔재 vite dev 서버 4개(:5175/:5176/:5177/:5180)가 **구버전 코드(브랜치 이전 상태)를 계속 서빙** 중이었음 — 그 포트로 real-qa 를 돌리면 최신 fix 와 무관한 실패(구 컬럼 순서 등)가 나오고, 반대로 구 코드 화면을 최신 증적으로 오인할 수도 있음.
- **매 라운드 신규 포트 + `--strictPort`** 로 기동(점유 시 즉시 실패 → 고아 감지), 검증 종료 시 kill.
- 세션 시작/종료 시 `Get-NetTCPConnection -LocalPort 51xx` 로 고아 node 리스너 점검·정리.
- 증적 캡처 전 "서빙 코드 = 검증 대상 HEAD" 대조(컬럼 순서 등 마커 확인) — 에이전트가 이 불일치로 원인 오진하지 않게 프롬프트에 명시.

## 🪤 회사PC(2026-07-23 실측) — 하네스가 **앱에 도달조차 못 하는** 함정 2종

둘 다 "기능 결함"처럼 보이지만 **하네스 접속 문제**다. real-qa 를 새 PC 에서 처음 돌릴 때 반드시 먼저 확인할 것.

1. **vite 가 `::1`(IPv6)에만 바인딩한다** — `--port 5291 --strictPort` 로 띄우면 로그에 `Local: http://localhost:5291/` 이라고 나오는데 **`http://127.0.0.1:5291` 은 `ERR_CONNECTION_REFUSED`** 다(Playwright 기본이 IPv4 로 해석). 실측:
   ```
   localhost:5291   OK (200)
   127.0.0.1:5291   FAIL
   ```
   → 스펙의 `AUDIT_BASE_URL` 기본값이 `http://127.0.0.1:...` 인 것들이 있으니 **`http://localhost:...` 로 넘겨야 한다.**
2. **web 하네스(`vite.web.config.ts`)는 BrowserRouter 다** — 기존 스펙들이 쓰는 `#/groupware/document-templates` 해시가 **무시되고 홈(대시보드)이 렌더**된다. 증상은 "페이지 heading 을 못 찾음"이라 기능 결함처럼 보인다. → **경로로 이동**(`/groupware/document-templates`). Playwright `error-context.md` 의 page snapshot 에 사이드바만 보이면 이 함정이다.

## 🪤 BE 컨테이너가 브랜치보다 낡아 게이트가 **관측 불가**였다 (2026-07-23 #908)

`DETAIL/IMAGE 활성화 422` 게이트를 라이브에서 확인하려는데 계속 **400 `"문서 요소가 유효하지 않습니다"`** 로 막혔다. 코드 결함이 아니라 **실행 중 BE 이미지가 게이트 커밋보다 먼저 빌드된 것**이었다(이미지 `2026-07-22T07:48Z` vs 게이트 커밋 `07-23 05:45 KST`). 게이트 이전 단계인 schema whitelist 에서 먼저 걸렸다.
- 배포 증명 = `docker inspect <container> --format '{{.Image}}'` → `docker image inspect <id> --format '{{.Created}}'` 를 **커밋 시각과 대조**.
- 🚨 **compose 는 메인 트리 경로**(`services/*/build/libs/*.jar`)를 본다 — 워크트리에서 `bootJar` 를 만들었으면 **메인 트리로 복사한 뒤** 재빌드해야 한다.
- 🚨 `docker compose up -d --build <svc>` 는 **의존 서비스까지 빌드하려다** 다른 서비스의 jar 부재로 실패한다(`api-gateway.jar: not found`). → **`--no-deps` 필수**:
  `docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --build --no-deps <svc>`
