# 모바일 에픽 슬1 — Foundation: 인증 추상화 + 웹 배포 골격 (설계)

> 작성: 2026-06-25 · 에픽: ② "데스크탑을 모바일로(전 직원용)" · 상위 spec: [2026-06-25-mobile-desktop-access-inspection.md](2026-06-25-mobile-desktop-access-inspection.md)
> 상태: **brainstorming 설계 확정 대기 → 개발책임자 spec 리뷰 후 writing-plans**

## 0. 개발책임자 결정 (확정)
- 에픽 접근법 = **Option A**(데스크탑 렌더러 반응형 + 웹/PWA 배포).
- 웹 인증 = **httpOnly 쿠키** + **SameSite=Lax** CSRF 가드(별도 토큰 미사용).
- auth 추상화 = **Dual-mode**(Electron=기존 IPC Bearer 유지 / Web=httpOnly 쿠키). Electron 무회귀 최우선.
- 1차 범위 = 단계적, 현장 고빈도 우선. 기존 mobile-staff/mobile WebView 앱 = 유지.

## 1. 목표 / 비목표
**슬1 목표 (foundation):**
- 데스크탑 렌더러를 **웹 브라우저로도** 구동 가능한 인증 추상화 레이어 구축.
- 모바일 브라우저에서 **로그인 + 1개 화면(홈 대시보드)** 정상 동작(쿠키 인증).
- **Electron 데스크탑 완전 무회귀**(기존 IPC Bearer 경로 그대로).
- 웹 prod 빌드 골격(`vite.web.config` + `build:web`) + 게이트웨이 쿠키 인증 경로.

**슬1 비목표 (후속 슬라이스):**
- 실제 반응형 UI(사이드바 drawer/하단탭·테이블 카드화) = **슬2+**. 슬1은 breakpoint 토큰만 추가.
- PWA(manifest/Service Worker/오프라인) = 후속.
- partner-auth(거래처 mobile WebView) 쿠키 전환 = **범위 외**(거래처 앱은 기존 Bearer 유지).
- refresh token / 토큰 폐기(blacklist) 모델 = 범위 외(기존 stateless 단일 TTL 유지).
- 프로덕션 도메인/인증서/CORS 최종 확정 = **Phase 11 운영 결정**(슬1은 dev localhost cross-port + 기존 CORS).
- 별도 CSRF 토큰 = 미사용(SameSite=Lax + same-site 서브도메인으로 충분).

## 2. 정찰 근거 (file:line)
- **인증 직접 호출 ~15곳**: `api/client.ts:69`(Bearer 주입), `stores/session.ts:48`(bootstrap), `routes/LoginPage.tsx:70-78`, `realtime/createRealtimeClient.ts:105`, `realtime/createPresenceClient.ts:41`, `realtime/SlipRealtimeClient.ts:113`, `hooks/usePresence.ts:36`, `api/dispatchCollab.ts:51`·`estimateCollab.ts:51`·`partnerOrderCollab.ts:54`·`groupwareApprovalCollab.ts:51`, `routes/GroupwareApprovalCreatePage.tsx:213`. preload 정의=`src/preload/index.ts:41-50`, IPC=`src/main/ipc/auth-token.ts`, 저장=`src/main/store/auth-store.ts`(electron-store+safeStorage).
- **빌드**: `electron.vite.config.ts`(3-entry), `vite.renderer.dev.config.ts`(:5175 web 렌더러 — QA용, **웹 구동 선례**), 라우팅=`routes/index.tsx:64 createHashRouter`. webview JSX 타입=`types/electron.d.ts:34`.
- **게이트웨이**: `JwtAuthenticationGatewayFilterFactory.java:140`(Bearer 헤더만 읽음, 식별 헤더 remove-then-set 주입), `CorsConfig.java:70`(**allowCredentials=true 이미 켜짐**, exposed=Authorization+identity). 로그인=`auth-service AuthController.java:40-43`(body 토큰만, Set-Cookie 없음). JWT 발급/검증=`shared/common JwtTokenProvider.java`.
- **반응형**: viewport meta **이미 존재**(`renderer/index.html:13`). `.app-shell{grid-template-columns:240px 1fr}`=`global.css:48-52`. @media=print 8건만. design-system `tokens.css` breakpoint 토큰 0.

## 3. 설계

### 3.1 FE — auth 추상화 레이어 (핵심)
신규 `src/renderer/auth/authProvider.ts` 인터페이스:
```ts
interface AuthProvider {
  // 식별 정보(토큰 아님) — 협업 헤더/UI 권한 분기용
  getSession(): Promise<SessionInfo | null>   // {userId, fullName, role, partnerCode, groups}
  // HTTP 요청에 붙일 인증 헤더 — Electron={Authorization: Bearer ...}, Web={}(쿠키 자동)
  getAuthHeaders(): Promise<Record<string, string>>
  // 로그인 성공 처리 — Electron=IPC setToken / Web=쿠키 자동(Set-Cookie), 식별정보 캐시
  establishSession(login: LoginResponse): Promise<void>
  // 로그아웃 — Electron=IPC clearToken / Web=POST /auth/logout(쿠키 만료)
  clearSession(): Promise<void>
  // 부팅 복원 — Electron=IPC getToken / Web=GET /auth/me(쿠키 자동전송)
  bootstrap(): Promise<SessionInfo | null>
}
```
- **플랫폼 선택 = 런타임 감지**: `const isElectron = typeof window.samhanAuth?.getToken === 'function'`. Electron은 항상 preload 존재→electronProvider, 웹은 부재→webProvider. **무회귀 보장**(빌드타임 tree-shaking 최적화는 후속, 두 구현체 모두 경량).
- `electronAuthProvider`: 기존 `window.samhanAuth` IPC + electron-store 그대로 래핑(동작 불변).
- `webAuthProvider`: 쿠키 자동전송. `establishSession`=식별정보만 메모리 캐시. `bootstrap`=`GET /auth/me`. `getAuthHeaders`=`{}`.
- **getSession 식별정보 출처**: Electron=IPC getToken().{userId,fullName,...}. Web=login 응답/`/auth/me` 캐시(쿠키는 JS 미접근이라 userId를 토큰에서 못 읽음 → 별도 식별 캐시 필수).

### 3.2 FE — 소비처 교체 (~15곳)
- `api/client.ts`: 요청 인터셉터에서 `window.samhanAuth.getToken()` → `await authProvider.getAuthHeaders()` 머지 + **`config.withCredentials = true` 항상**(Electron 무해, 웹 쿠키 필수). 401 핸들러=`authProvider.clearSession()` + 로그인 리다이렉트(플랫폼 무관).
- `stores/session.ts`: bootstrap/setAuth/logout → authProvider 경유.
- `routes/LoginPage.tsx`: onSuccess → `authProvider.establishSession(res)`.
- **collabHeaders 통합**: 4벌 중복(`dispatchCollab`/`estimateCollab`/`partnerOrderCollab`/`groupwareApprovalCollab`) + `createPresenceClient` → 공용 `auth/collabHeaders.ts`(authProvider.getSession()→X-User-Id/X-User-Name). [[feedback_x_user_name_header_charset_mockmvc]] UTF-8 인코딩 규약 유지.
  - ⚠️ **정합 주의**: 게이트웨이가 JWT claim에서 X-User-Id/X-User-Name 등 식별헤더를 **remove-then-set 재주입**(`JwtAuthGatewayFilter` 224-263)하므로 클라이언트 전송 collab 헤더는 **덮어써짐**(위조 불가, [[feedback_identity_header_authz_antipattern]]). 따라서 본 통합은 기능 변경이 아니라 플랫폼 추상화·중복 제거 목적. 웹에서도 쿠키-JWT로 게이트웨이가 동일 주입 → collab 동작 동등.
- **realtime/SSE**: `createRealtimeClient`·`SlipRealtimeClient`·`usePresence` → getAuthHeaders()(Electron Bearer) / 웹=EventSource `{withCredentials:true}` 또는 fetch `credentials:'include'`(쿠키 자동). SSE 협업은 현장 저빈도라 슬1 검증은 "깨지지 않음"까지(상세 라이브 QA는 슬2+).
- `GroupwareApprovalCreatePage.tsx:213`: requesterId ← authProvider.getSession().userId.

### 3.3 FE — 웹 빌드 골격
- 신규 `vite.web.config.ts`: `base:'/'`, `outDir:'dist/web'`, `define VITE_PLATFORM='web'`, React plugin, `VITE_API_BASE_URL` env. print-renderer/webview 제외.
- **라우터 플랫폼 분기**: `createHashRouter`(Electron, file://) vs `createBrowserRouter`(웹, history) — 동일 런타임 플랫폼 플래그로 선택. 웹 호스팅은 history fallback(`try_files`/SPA rewrite) 필요(문서화).
- `package.json`: `build:web` 스크립트 추가(typecheck 불변, `npm run typecheck`로 검증 [[feedback_desktop_typecheck_command]]).
- **webview JSX 타입 가드**(`types/electron.d.ts:34`): 웹 TS 빌드 통과하도록 처리. legacy estimate webview 페이지(Electron 전용)는 웹에서 조건부 렌더/숨김(빌드 비파손).

### 3.4 FE — 반응형 토큰(최소)
- design-system `tokens.css`에 breakpoint CSS 변수 추가(`--breakpoint-sm/md/lg/xl`). 실제 @media 개조는 슬2. 슬1은 토큰 정의만(zero-risk 선행).

### 3.5 BE — auth-service
- `AuthController.login`: 기존 body 토큰 **유지** + **Set-Cookie 추가**(dual-issue). `ResponseEntity<ApiResponse<LoginResponse>>`로 변경, 헤더 `Set-Cookie: access_token=<JWT>; HttpOnly; SameSite=Lax; Path=/; [Secure]`. Electron=body 토큰 사용(쿠키 무시), 웹=쿠키 사용(body 토큰 무시) → **무회귀**.
- **Secure 플래그 env 토글**: `app.security.cookie.secure`(dev=false HTTP / prod=true HTTPS). 쿠키 이름/TTL=기존 JWT TTL(3600s) 동일(stateless 유지).
- 신규 `GET /auth/me`: 게이트웨이가 쿠키→검증→식별헤더 주입 → auth-service가 `X-User-Id` 등 읽어 SessionInfo 반환(웹 bootstrap용). userId는 **FE 내부 보유**(requesterId 본문 필드·식별용, Electron getToken과 동일 파리티) — **화면 미표시** [[feedback_uuid_no_user_visibility]] 준수. 식별정보=userId/role/displayName/groups/partnerCode.
- 신규 `POST /auth/logout`: `Set-Cookie: access_token=; Max-Age=0`(쿠키 만료). Electron은 호출 안 함(IPC clearToken).

### 3.6 BE — 게이트웨이
- `JwtAuthenticationGatewayFilterFactory`: **쿠키 fallback** 추가 — Authorization Bearer 헤더 우선, 부재 시 `access_token` 쿠키 추출(WebFlux `ServerHttpRequest.getCookies()`)→동일 JWT 검증 경로. 식별헤더 remove-then-set 주입은 **소스 무관 동일**(쿠키 위조 방지 동등). [[feedback_identity_header_authz_antipattern]] 단일 신뢰원 유지.
- CORS: `allowCredentials=true` 기존. allowedOrigins에 **:5175(웹 렌더러 dev)** 및 웹 prod origin 포함 여부 확인·보강(prod 도메인은 Phase 11).
- 우선순위 race 방지: Bearer 헤더 존재 시 쿠키 무시(중복 시 Bearer 우선) 명문화.

## 4. 데이터 흐름
**웹 로그인:** 브라우저 `POST /api/v1/auth/login` → auth-service 200 + `Set-Cookie: access_token`(+body 토큰 무시) → 이후 요청 쿠키 자동전송 → 게이트웨이 쿠키→JWT 검증→식별헤더 주입 → downstream. 부팅=`GET /auth/me`(쿠키)로 세션 복원.
**Electron 로그인(불변):** body 토큰 → IPC setToken(electron-store 암호화) → 매 요청 IPC getToken→Bearer 헤더 → 게이트웨이 Bearer 검증(쿠키 미사용).

## 5. 검증 (라이브 QA, [[feedback_no_fake_data_ever]])
- **Electron 무회귀**: Docker 풀스택 + Electron(또는 :5175 + IPC shim) 로그인→홈→1개 도메인 화면 실 캡처. 기존 Bearer 경로 200.
- **웹 신규**: 모바일 viewport 브라우저(또는 :5175 web 빌드) 로그인→쿠키 발급(DevTools Set-Cookie 확인)→홈 대시보드 로드(쿠키 인증 200)→`/auth/me` bootstrap 복원→logout 쿠키 만료. 실 캡처 다수.
- ⚠️ Playwright httpOnly 쿠키 직접 read 불가 → 네트워크 응답 Set-Cookie/요청 Cookie 헤더로 검증.
- BE: 게이트웨이 쿠키 fallback IT(MockRestServiceServer/실 HTTP — Bearer/쿠키/둘 다/없음 4경로), auth Set-Cookie IT. ci.yml 필터 등재 [[feedback_ci_test_filter_false_green]].

## 6. 리스크 / 완화
| 리스크 | 완화 |
|---|---|
| window.samhanAuth 제거 시 Electron crash | **제거 안 함** — electronProvider가 래핑, 런타임 감지로 Electron 무회귀 |
| dual-issue 토큰 race(쿠키+Bearer) | 게이트웨이 Bearer 우선 명문화, Electron은 쿠키 미수신 |
| 웹 SSE 협업 쿠키 미전송 | EventSource withCredentials / fetch credentials:'include', 슬1은 비파손까지만 검증 |
| webview JSX 타입 웹 빌드 깨짐 | 조건부 타입/렌더 가드 |
| CORS prod origin 미정 | dev=localhost+기존 CORS, prod=Phase 11 |
| 적용 마이그레이션 불변 [[feedback_applied_migration_immutable]] | 본 슬1 BE는 Flyway 무변경(쿠키/엔드포인트만) — DB 변경 없음 확인 |

## 7. 슬라이스 경계 (단일 PR)
슬1 = §3.1~3.6 전체(인증 추상화 + 소비처 교체 + 웹 빌드 골격 + BE 쿠키/엔드포인트 + breakpoint 토큰). **Flyway 0**. 후속: 슬2(반응형 셸: drawer/하단탭+테이블 카드화), 슬3+(화면별 반응형 현장우선), PWA, ③ 버전 에픽(웹 배포 골격 위에 /app/version 팝업).
