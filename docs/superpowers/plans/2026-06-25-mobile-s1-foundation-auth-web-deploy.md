# 모바일 슬1 Foundation — 인증 추상화 + 웹 배포 골격 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 본 프로젝트의 실 프로세스는 canonical 워크플로우([[feedback_canonical_workflow]]): 본 plan = Opus 기획. 구현=Codex(또는 Opus 엔지니어 에이전트), 듀얼리뷰 5-agent 0수렴.

**Goal:** 데스크탑 Electron 렌더러를 웹 브라우저로도 구동 가능하게 하는 Dual-mode 인증 추상화 + 웹 prod 빌드 골격을 구축한다(Electron 무회귀, 웹=httpOnly 쿠키).

**Architecture:** 런타임 플랫폼 감지(`window.samhanAuth` 존재)로 `electronAuthProvider`(기존 IPC Bearer) / `webAuthProvider`(httpOnly 쿠키)를 선택하는 `authProvider` 추상화. ~15곳 직접 호출을 추상화 경유로 교체. BE는 로그인 dual-issue(body+Set-Cookie) + 게이트웨이 쿠키 fallback. Flyway 변경 없음.

**Tech Stack:** TypeScript / React 18 / axios / zustand / Vite / electron-vite / Spring Boot 3 WebFlux(gateway) + MVC(auth-service) / JWT(HS256).

## Global Constraints
- **Electron 무회귀 최우선** — 기존 `window.samhanAuth` IPC 경로 동작 불변(electronProvider가 1:1 래핑).
- **Flyway 0** — DB 스키마 변경 없음(쿠키/엔드포인트/필터만).
- 한국어 Javadoc/주석/커밋/PR 의무 [[feedback_korean_commits]].
- 쿠키 = `access_token`, `HttpOnly; SameSite=Lax; Path=/`, `Secure`는 env 토글(`app.security.cookie.secure`, dev=false / prod=true). TTL=기존 JWT TTL(변경 없음).
- 게이트웨이 식별헤더 remove-then-set 단일 신뢰원 유지 [[feedback_identity_header_authz_antipattern]] — 쿠키 소스도 동일 주입.
- UUID 화면 미노출 [[feedback_uuid_no_user_visibility]] — userId는 FE 내부 보유만.
- 신규 IT는 ci.yml 필터 등재 + 로컬 실제 실행 [[feedback_ci_test_filter_false_green]].
- typecheck = `npm run typecheck`(tsconfig.node+web) [[feedback_desktop_typecheck_command]].
- 라이브 QA = 실서버·실캡처만 [[feedback_no_fake_data_ever]], [[feedback_qa_docker_real_test]].

---

## File Structure

**FE (clients/desktop/src/renderer):**
- Create `auth/authProvider.ts` — 추상화 인터페이스 + 플랫폼 선택 singleton.
- Create `auth/electronAuthProvider.ts` — 기존 window.samhanAuth IPC 래퍼.
- Create `auth/webAuthProvider.ts` — httpOnly 쿠키 + /auth/me + 식별 캐시.
- Create `auth/collabHeaders.ts` — 공용 협업 헤더 빌더(authProvider.getSession 경유).
- Modify `api/client.ts` — 인터셉터 authProvider 경유 + withCredentials.
- Modify `stores/session.ts` — bootstrap/setAuth/logout authProvider 경유.
- Modify `routes/LoginPage.tsx` — onSuccess authProvider.establishSession.
- Modify `realtime/createRealtimeClient.ts`·`createPresenceClient.ts`·`SlipRealtimeClient.ts`·`hooks/usePresence.ts` — authProvider 경유.
- Modify `api/dispatchCollab.ts`·`estimateCollab.ts`·`partnerOrderCollab.ts`·`groupwareApprovalCollab.ts` — 공용 collabHeaders 사용.
- Modify `routes/GroupwareApprovalCreatePage.tsx` — requesterId ← authProvider.getSession.
- Modify `routes/index.tsx` — createHashRouter/createBrowserRouter 플랫폼 분기.
- Modify `types/electron.d.ts` — webview JSX 타입 웹 빌드 가드.

**FE 빌드(clients/desktop):**
- Create `vite.web.config.ts` — 웹 prod 빌드(base '/', outDir dist/web, define VITE_PLATFORM).
- Modify `package.json` — `build:web` 스크립트.
- Modify `clients/web/design-system/src/tokens/tokens.css` — breakpoint CSS 변수.

**BE:**
- Modify `services/auth-service/.../web/AuthController.java` — login Set-Cookie + 신규 logout.
- Modify `services/auth-service/.../resources/application.yml` — cookie.secure 토글.
- Modify `services/api-gateway/.../filter/JwtAuthenticationGatewayFilterFactory.java` — 쿠키 fallback.
- Modify `services/api-gateway/.../config/CorsConfig.java` — :5175 origin 확인.

---

## Task 1: FE auth 추상화 레이어 (authProvider)

**Files:**
- Create: `clients/desktop/src/renderer/auth/authProvider.ts`
- Create: `clients/desktop/src/renderer/auth/electronAuthProvider.ts`
- Create: `clients/desktop/src/renderer/auth/webAuthProvider.ts`
- Test: `clients/desktop/src/renderer/auth/__tests__/authProvider.test.ts`

**Interfaces:**
- Produces:
```ts
// authProvider.ts
export interface SessionInfo {
  userId: string
  role: string
  fullName: string
  partnerCode?: string
  groups?: { id: string; name: string; builtin: boolean }[]
}
export interface AuthProvider {
  getSession(): Promise<SessionInfo | null>
  getAuthHeaders(): Promise<Record<string, string>>
  establishSession(login: LoginResponse): Promise<void>   // LoginResponse from api/auth.ts
  clearSession(): Promise<void>
  bootstrap(): Promise<SessionInfo | null>
}
export function getAuthProvider(): AuthProvider          // singleton, 플랫폼 감지
export const isElectronPlatform: boolean                  // typeof window.samhanAuth?.getToken === 'function'
```

- [ ] **Step 1: 플랫폼 감지 + electron 구현 테스트(실패) 작성** — `authProvider.test.ts`: window.samhanAuth mock 주입 시 `isElectronPlatform===true`, `getAuthHeaders()` 가 `{Authorization: 'Bearer T'}` 반환; 미주입 시 `false` + `getAuthHeaders()==={}`. `getSession()` 이 token 제외 식별정보만 반환.
- [ ] **Step 2: 테스트 실패 확인** — `cd clients/desktop && npx vitest run src/renderer/auth/__tests__/authProvider.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: authProvider.ts + 2 구현체 작성**
  - `electronAuthProvider`: `getSession`=`window.samhanAuth.getToken()` 결과에서 token 제외; `getAuthHeaders`=`{Authorization: 'Bearer '+token}`(token 없으면 `{}`); `establishSession(login)`=`window.samhanAuth.setToken({token, userId, role, fullName: login.displayName, partnerCode, groups})`; `clearSession`=`window.samhanAuth.clearToken()`; `bootstrap`=`getToken()`→SessionInfo.
  - `webAuthProvider`: 모듈 스코프 `cachedSession: SessionInfo | null`. `getSession`=캐시 반환; `getAuthHeaders`=`{}`(쿠키 자동); `establishSession(login)`=cachedSession 설정(token 무시); `clearSession`=`POST /auth/logout`(apiClient) + 캐시 null; `bootstrap`=`GET /auth/me`(apiClient)→cachedSession 설정·반환(401 시 null).
  - `getAuthProvider()`=`isElectronPlatform ? electronAuthProvider : webAuthProvider` singleton.
  - ⚠️ webProvider는 apiClient import(순환 주의 — apiClient는 authProvider를 import하므로 lazy require 또는 헤더만 쓰는 fetch 사용). 권장: webProvider의 me/logout는 `import('../api/client')` 동적 import 또는 axios 직접 인스턴스(baseURL 동일, withCredentials:true).
- [ ] **Step 4: 테스트 통과 확인** — 같은 vitest 명령 → PASS.
- [ ] **Step 5: 커밋** — `[FEAT] 모바일 슬1 — authProvider 추상화 레이어(Electron/Web Dual-mode)`

---

## Task 2: api/client + session store + LoginPage 배선

**Files:**
- Modify: `clients/desktop/src/renderer/api/client.ts:44-97`
- Modify: `clients/desktop/src/renderer/stores/session.ts:38-63`
- Modify: `clients/desktop/src/renderer/routes/LoginPage.tsx:67-80`
- Test: `clients/desktop/src/renderer/api/__tests__/client.authheaders.test.ts`

**Interfaces:**
- Consumes: `getAuthProvider()`, `SessionInfo`, `isElectronPlatform` (Task 1).

- [ ] **Step 1: 인터셉터 테스트(실패)** — mock authProvider.getAuthHeaders→`{Authorization:'Bearer T'}` 일 때 요청 config.headers에 주입되고 `config.withCredentials===true`. 401 응답 시 authProvider.clearSession 호출 + hash `#/login`.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/renderer/api/__tests__/client.authheaders.test.ts` → FAIL.
- [ ] **Step 3: client.ts 수정** — 요청 인터셉터 try 블록(현 68-76)을:
```ts
config.withCredentials = true
const headers = await getAuthProvider().getAuthHeaders()
for (const [k, v] of Object.entries(headers)) config.headers.set(k, v)
```
  응답 인터셉터 401(현 84-93): `await getAuthProvider().clearSession()` + Electron 은 `window.location.hash = '#/login'`, Web 은 `window.location.replace('/login')`. (mock 모드 분기는 보존.)
- [ ] **Step 4: session.ts 수정** — bootstrap=`getAuthProvider().bootstrap()`→`set({auth: sessionInfoToSnapshot(s), bootstrapped:true})`; setAuth=`getAuthProvider().establishSession(login)` 형태로 시그니처 정리(또는 establishSession 호출 후 set); logout=`getAuthProvider().clearSession()`. mock 분기 보존. (AuthSnapshot.token: 웹은 `''`.)
- [ ] **Step 5: LoginPage 수정(67-80)** — onSuccess: `await getAuthProvider().establishSession(res); set session; navigate('/')`. (setAuth 헬퍼가 establishSession 위임하면 LoginPage는 그대로 두고 session.ts만 변경 — 택1, DRY.)
- [ ] **Step 6: 테스트 + typecheck** — vitest PASS + `npm run typecheck` 0 에러.
- [ ] **Step 7: 커밋** — `[FEAT] 모바일 슬1 — client/session/login authProvider 배선 + withCredentials`

---

## Task 3: collabHeaders 통합 + realtime/SSE

**Files:**
- Create: `clients/desktop/src/renderer/auth/collabHeaders.ts`
- Modify: `api/dispatchCollab.ts:49-59`, `api/estimateCollab.ts:51`, `api/partnerOrderCollab.ts:54`, `api/groupwareApprovalCollab.ts:51`, `realtime/createPresenceClient.ts:39-49`
- Modify: `realtime/createRealtimeClient.ts:104-109`, `realtime/SlipRealtimeClient.ts:113`, `hooks/usePresence.ts:36`
- Modify: `routes/GroupwareApprovalCreatePage.tsx:213-216`
- Test: `clients/desktop/src/renderer/auth/__tests__/collabHeaders.test.ts`

**Interfaces:**
- Produces: `export async function collabHeaders(): Promise<Record<string,string>>` — `getSession()`→`{'X-User-Id': userId, 'X-User-Name': fullName}`(빈 값 생략). UTF-8 그대로(게이트웨이 재주입이 권위 [[feedback_x_user_name_header_charset_mockmvc]]).

- [ ] **Step 1: 테스트(실패)** — collabHeaders가 session{userId,fullName} → 두 헤더 반환, null session → `{}`.
- [ ] **Step 2: 실패 확인** — vitest FAIL.
- [ ] **Step 3: collabHeaders.ts 작성** (위 시그니처).
- [ ] **Step 4: 4개 collab API + createPresenceClient 의 로컬 `collabHeaders()` 중복 제거** → 공용 import 교체(동작 동일).
- [ ] **Step 5: realtime SSE** — createRealtimeClient/SlipRealtimeClient: Authorization=`getAuthProvider().getAuthHeaders()`(Electron Bearer / 웹 {}) + 웹 쿠키 위해 fetch `credentials:'include'` 또는 EventSource `{withCredentials:true}`. usePresence: `getAuthProvider().getSession()`.
- [ ] **Step 6: GroupwareApprovalCreatePage:213** — `const s = await getAuthProvider().getSession(); if(!s?.userId) throw ...; requesterId: s.userId`.
- [ ] **Step 7: 테스트 + typecheck** — vitest PASS + `npm run typecheck` 0.
- [ ] **Step 8: 커밋** — `[FEAT] 모바일 슬1 — collabHeaders 공용화 + realtime/SSE authProvider 경유`

---

## Task 4: 웹 prod 빌드 골격 + 라우터 분기 + breakpoint 토큰

**Files:**
- Create: `clients/desktop/vite.web.config.ts`
- Modify: `clients/desktop/package.json` (scripts)
- Modify: `clients/desktop/src/renderer/routes/index.tsx:63-67`
- Modify: `clients/desktop/src/renderer/types/electron.d.ts` (webview 가드)
- Modify: `clients/web/design-system/src/tokens/tokens.css`

- [ ] **Step 1: vite.web.config.ts** — `vite.renderer.dev.config.ts` 패턴 참고, `root: src/renderer`, `base:'/'`, `build.outDir:'../../dist/web'`, React plugin, `define: {'import.meta.env.VITE_PLATFORM': JSON.stringify('web')}`, `VITE_API_BASE_URL` 주입. print-renderer/electron preload 제외.
- [ ] **Step 2: routes/index.tsx 라우터 분기** — `import { createHashRouter, createBrowserRouter, ... }`; `const create = isElectronPlatform ? createHashRouter : createBrowserRouter; const router = create(routesArray)`. (routes 배열은 동일.)
- [ ] **Step 3: webview 타입 가드** — `types/electron.d.ts`의 webview JSX.IntrinsicElements 선언이 웹 빌드(tsconfig.web) 컴파일 깨지 않도록 유지(웹에서도 타입만 존재, 런타임 미사용). legacy estimate webview 페이지는 `isElectronPlatform` 가드로 웹에서 미렌더(빌드 비파손 확인).
- [ ] **Step 4: package.json scripts** — `"build:web": "vite build --config vite.web.config.ts"`, 필요 시 `"dev:web"`(기존 :5175 dev config 재사용 가능). typecheck 불변.
- [ ] **Step 5: breakpoint 토큰** — 기존 `tokens.css` `:root`의 `--bp-sm/md/lg/xl/2xl`을 표준으로 사용한다(실 @media 개조는 슬2). 신규 `--breakpoint-*` 중복 토큰은 추가하지 않는다. design-system dist 갱신 필요 시 `npm run build`(design-system).
- [ ] **Step 6: 빌드 검증** — `cd clients/desktop && npm run typecheck` 0 + `npm run build:web` 성공(dist/web 생성) + 기존 `npm run build`(Electron) 무회귀 성공.
- [ ] **Step 7: 커밋** — `[FEAT] 모바일 슬1 — vite 웹 빌드 골격 + 라우터 플랫폼 분기 + breakpoint 토큰`

---

## Task 5: BE auth-service — login Set-Cookie(dual-issue) + logout

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/web/AuthController.java:40-43`
- Modify: `services/auth-service/src/main/resources/application.yml`
- Test: `services/auth-service/src/test/java/.../auth/web/AuthControllerCookieIT.java` (또는 기존 IT 확장)

**Interfaces:**
- `/auth/me` (기존 AuthController:61-73) 재사용 — 신규 불요. MeResponse에 userId 부재 시 추가(웹 getSession 식별용, 화면 미노출).

- [ ] **Step 1: IT(실패)** — `POST /auth/login` 성공 응답에 `Set-Cookie: access_token=<jwt>; HttpOnly; SameSite=Lax; Path=/` 헤더 존재(MockMvc, `getContentAsString(UTF_8)` [[feedback_mockmvc_getcontentasstring_charset]]) + body token 유지(dual). `POST /auth/logout` → `Set-Cookie: access_token=; Max-Age=0`.
- [ ] **Step 2: 실패 확인** — `cd services && ./gradlew :auth-service:test --tests "*AuthControllerCookieIT"` → FAIL.
- [ ] **Step 3: login 수정** — 시그니처에 `HttpServletResponse response` 추가, `authService.login(...)` 후 `response.addHeader(HttpHeaders.SET_COOKIE, buildAccessCookie(res.token()))`. `buildAccessCookie`=`ResponseCookie.from("access_token", jwt).httpOnly(true).sameSite("Lax").path("/").secure(cookieSecure).maxAge(jwtTtlSeconds).build().toString()`. body는 기존대로 `ApiResponse.ok(res)`.
- [ ] **Step 4: logout 추가** — `@PostMapping("/logout")` → `ResponseCookie.from("access_token","").path("/").maxAge(0).build()` Set-Cookie + `ApiResponse.ok()`.
- [ ] **Step 5: application.yml** — `app.security.cookie.secure: ${COOKIE_SECURE:false}` (+ @Value 주입). jwtTtl 기존 값 참조.
- [ ] **Step 6: 테스트 통과 + ci.yml 필터 등재** — IT PASS + `services/.github/workflows/ci.yml` auth 잡 필터에 신규 IT 패키지 등재(누락 시 false-green [[feedback_ci_test_filter_false_green]]).
- [ ] **Step 7: 커밋** — `[FEAT] 모바일 슬1 — auth-service 로그인 Set-Cookie(dual-issue) + /auth/logout + Secure 토글`

---

## Task 6: BE 게이트웨이 — 쿠키 fallback 파싱 + CORS 확인

**Files:**
- Modify: `services/api-gateway/src/main/java/com/samhanair/logis/gateway/filter/JwtAuthenticationGatewayFilterFactory.java:140` 부근
- Modify: `services/api-gateway/src/main/java/com/samhanair/logis/gateway/config/CorsConfig.java`
- Test: `services/api-gateway/src/test/java/.../gateway/filter/CookieAuthGatewayIT.java`

- [ ] **Step 1: IT(실패)** — Bearer 헤더 부재 + `Cookie: access_token=<valid jwt>` → 인증 통과(식별헤더 주입, 200). Bearer + 쿠키 동시 → **Bearer 우선**. 쿠키 invalid → 401. 둘 다 없음 → 401.
- [ ] **Step 2: 실패 확인** — `./gradlew :api-gateway:test --tests "*CookieAuthGatewayIT"` → FAIL.
- [ ] **Step 3: 필터 수정** — 토큰 추출부(현 line 140 `getFirst(AUTHORIZATION)` Bearer): Bearer 부재 시 `exchange.getRequest().getCookies().getFirst("access_token")?.getValue()` 로 fallback. 추출된 토큰은 동일 `parse()`→식별헤더 remove-then-set 주입(소스 무관 동일). Bearer 존재 시 쿠키 무시(우선순위 명문 주석).
- [ ] **Step 4: CORS 확인** — `CorsConfig.java` allowedOrigins에 `http://localhost:5175`(웹 렌더러 dev) 포함 확인·보강. allowCredentials=true 기존 유지. 웹 prod origin=Phase 11 주석.
- [ ] **Step 5: 테스트 통과 + ci.yml 등재** — IT PASS + gateway 잡 필터 등재.
- [ ] **Step 6: 커밋** — `[FEAT] 모바일 슬1 — 게이트웨이 access_token 쿠키 fallback(Bearer 우선) + CORS :5175`

---

## Task 7: 라이브 QA 검증 (Electron 무회귀 + 웹 신규)

**Files:**
- Create: `docs/qa/mobile-s1-foundation/` (실 캡처 다수)

- [ ] **Step 1: Docker 풀스택 재빌드 기동** — auth-service/api-gateway 변경 반영 `docker compose build auth-service api-gateway && docker compose up -d`([[project_local_stack_qa_gotchas]] stale 이미지 주의).
- [ ] **Step 2: Electron 무회귀** — 데스크탑(또는 :5175 + IPC shim) `dev_master` 로그인 → 홈 대시보드 → 1개 도메인 화면(판매 등) 정상. 요청에 `Authorization: Bearer` 유지(쿠키 미사용) 네트워크 확인. **실 캡처**.
- [ ] **Step 3: 웹 신규** — `npm run build:web` 산출물(또는 dev:web)을 모바일 viewport 브라우저 로드 → 로그인 → **응답 Set-Cookie=access_token(HttpOnly/Lax) DevTools 확인** → 홈 대시보드(쿠키 인증 200) → 새로고침 시 `/auth/me` bootstrap 세션 복원 → 로그아웃 시 쿠키 Max-Age=0. **실 캡처 다수**(로그인/Set-Cookie/홈/네트워크 Cookie 헤더/logout).
  - ⚠️ Playwright httpOnly 쿠키 직접 read 불가 → 네트워크 응답 Set-Cookie / 요청 Cookie 헤더로 증명 [[feedback_realqa_run_and_false_red]].
- [ ] **Step 4: QA 리포트** — `docs/qa/mobile-s1-foundation/README.md` 인과 서술 + 캡처 인덱스.
- [ ] **Step 5: 커밋** — `[QA] 모바일 슬1 — Electron 무회귀 + 웹 쿠키 인증 라이브 캡처`

---

## Self-Review (작성자 점검)
- **Spec 커버리지:** §3.1→T1, §3.2→T2, §3.3→T3, §3.4→T4, §3.5→T5(+/auth/me 기존 재사용), §3.6→T6, §5 검증→T7. ✅ 전 항목 매핑.
- **Placeholder:** 없음(각 Task 구체 파일·코드·검증 명령).
- **타입 정합:** `SessionInfo`/`AuthProvider`/`getAuthProvider()`/`collabHeaders()`/`isElectronPlatform` 명칭 T1 정의·후속 일관.
- **순환 주의 박제:** webAuthProvider↔apiClient 순환은 동적 import로 회피(T1 Step3 명시).
- **무회귀 가드:** Electron 경로 electronProvider 1:1 래핑 + dual-issue로 BE 하위호환. Flyway 0.
