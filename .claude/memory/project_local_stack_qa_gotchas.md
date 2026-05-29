# 로컬 Docker 스택 + 데스크톱 실 QA 함정 (재사용)

> 2026-05-30, PR #320(거래처 RESTORE) Docker 실 QA 중 확인. 데스크톱 FE 를 실 백엔드 대상으로
> 헤드리스 브라우저 QA 할 때 반복 적용.

## 1. 로컬 이미지가 stale 일 수 있음 (가장 큰 함정)
- `scripts/launch-local-stack.ps1` 은 bootJar 는 빌드하지만 **docker 이미지는 캐시 재사용** →
  컨테이너가 일주일 전(예: 2026-05-22) jar 로 돌 수 있다. 새 컨트롤러/엔드포인트가 "No static
  resource ..." (404→500 wrap) 로 안 잡히면 **이미지 stale** 의심.
- 단일 서비스 재빌드+재기동(프로젝트명 `infrastructure`, working_dir `infrastructure/`):
  `docker compose -p infrastructure --project-directory <repo>/infrastructure -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml build <svc>`
  후 `... up -d --no-deps --force-recreate <svc>`. 이미지는 `*spring-build`(`infrastructure/docker/spring-service.Dockerfile`)가 `JAR_FILE` 을 COPY 만 함(소스 재컴파일 X, 빠름).
- 이미지 생성시각 확인: `docker inspect infrastructure-<svc>:latest --format '{{.Created}}'`.

## 2. 게이트웨이 라우팅 격차 (FE→gateway 가 막히는 경우)
- `/api/v1/partners/**` 라우트는 **StripPrefix=2** 인데 4tab/revision 컨트롤러는 풀패스
  `@RequestMapping("/api/v1/partners…")` → strip 후 `/partners/…` 로 404. 풀패스 컨트롤러는
  blocks/orders 처럼 **no-strip 라우트**가 따로 있어야 동작.
- `/auth/**`(auth-service-legacy) 라우트엔 **JwtAuthentication 필터 미적용** → 게이트웨이가
  X-User-Id/Role 미주입 → auth-service `HeaderAuthenticationFilter` 가 인증 실패 → `isAuthenticated()`
  endpoint(예: `/auth/admin/permissions/my`) 403(빈 body). auth-service 는 Bearer 자체검증 안 함(헤더 신뢰).
- 게이트웨이 `JwtAuthenticationGatewayFilterFactory` 는 **X-User-Id / X-User-Role / X-User-Department
  만 주입(X-User-Name 미주입)**. → header 인증 service 의 `principal.getName()` = **X-User-Id(UUID)**.
  컨트롤러가 이를 표시명으로 쓰면 UUID 가 화면에 샌다(PR #320 F4). 표시명 필요 시 UUID 가드 필수.

## 3. 헤드리스 브라우저 실 QA 브리지 기법 (Playwright)
- web 모드엔 electron preload 없음 → `addInitScript` 로 `window.samhanAuth`(+`samhanLegacy`) IPC
  shim 주입(토큰 localStorage 미러). 앱 라우팅은 **HashRouter**(`#/...`).
- 게이트웨이 격차 우회: `context.route('**')` 로 대상 서비스 **직접 포트(:8095 등)** 프록시(node http,
  `X-User-Id/Role/Name` 주입 = 게이트웨이 필터 대행) + 기능 무관 endpoint(권한매트릭스/검색)는 stub.
  로그인/정책은 실 게이트웨이 passthrough. → 기능 자체는 실 서버 적중, 화면은 실 UI.
- **DS `Modal` 은 `data-testid` 를 전달하지 않음** → 다이얼로그 대기는 `[role=dialog]` 또는 내부 실
  testid 버튼(예: `partner-detail-edit-btn`) 사용. DS `Input` 은 `type=text` 속성 없을 수 있음 →
  `input:not([disabled])`. `DataTable` 행 onClick 은 `<tr>` (셀 텍스트 클릭 버블 OK).
- 캡처 스크립트 선례: `clients/desktop/playwright/partner-restore-qa/capture.mjs`.

## 4. react-query 캐시 stale
- 편집 mutation 이 연관 list 쿼리(`['partnerRevisions', code]` 등)를 invalidate 안 하면 탭 전환만으로는
  최신 안 보임. 같은 SPA 세션 재오픈으로도 안 되면 문서 리로드 필요. → 근본 fix 는 onSuccess invalidate.
