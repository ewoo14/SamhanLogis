# 모바일 슬1 Foundation — 라이브 QA (PR #596)

> 실서버 라이브 검증. Docker 풀스택 재빌드(auth-service + api-gateway 를 브랜치 `feat/mobile-s1-foundation-auth-web` 로 재빌드, 08:55 KST 기동 healthy). 가짜 데이터·합성 캡처 금지([[feedback_no_fake_data_ever]]). 계정 `dev_master`.

## A. BE 계약 — 실 게이트웨이(:8080) 실 HTTP curl (2026-06-25)

재빌드된 auth-service(Set-Cookie dual-issue·/auth/logout) + api-gateway(access_token 쿠키 fallback·Bearer 우선) 에 대한 실 HTTP 검증.

| # | 검증 | 명령 | 결과 |
|---|---|---|---|
| 1 | 로그인 dual-issue | `POST /api/v1/auth/login {dev_master}` | **200** · `Set-Cookie: access_token=<jwt>; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax` **+** body `data.token`(352자) 양립 |
| 2 | /auth/me 쿠키 fallback(웹) | `GET /api/v1/auth/me` (Cookie: access_token) | **200** · `{userId, role:MASTER, displayName, groups:[마스터]}` |
| 3 | /auth/me Bearer(Electron 무회귀) | `GET /api/v1/auth/me` (Authorization: Bearer) | **200** · 동일 세션 |
| 4 | Bearer + 위조 쿠키 → Bearer 우선 | valid Bearer + `Cookie: access_token=bogus` | **200** (Bearer 우선 명문 동작) |
| 5 | 로그아웃 쿠키 만료 | `POST /api/v1/auth/logout` | **200** · `Set-Cookie: access_token=; Max-Age=0; Expires=1970; HttpOnly; SameSite=Lax` |
| 6 | 무인증 → 401 | `GET /api/v1/auth/me` (no auth) | **401** · `{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}` |

**판정:** 게이트웨이 쿠키 fallback(소스 무관 식별헤더 주입) + Bearer 우선 + 로그인 dual-issue + 로그아웃 만료 + 무인증 차단 = 설계 spec §3.5/§3.6 라이브 일치. Electron(Bearer)·웹(쿠키) 양 경로 동등 200.

## B. 브라우저 UI — 웹 쿠키 인증 실 캡처 (🔴 BLOCKING 발견)

dist/web 를 :5175(게이트웨이 CORS 허용 origin)에 서빙, Playwright(모바일 390x844, iPhone UA)로 실 구동.

| 캡처 | 결과 |
|---|---|
| `B1-web-login-mobile.png` | ✅ 로그인 페이지 모바일 정상 렌더(가로 overflow 없음, BrowserRouter `/login`) |
| `B2-web-home-after-login.png` | 🔴 로그인 제출 후 **빈 로그인 폼으로 리로드**(입력값 소실·홈 미진입) |

### 🔴 BLOCKING — 웹 전용 무한 리로드 루프 (라이브 QA 단독 적발)

**증상:** 웹 브라우저에서 앱 로드 시 로그인 화면이 계속 리로드되고, 로그인 제출 시 `POST /auth/login` 이 `net::ERR_ABORTED` 로 취소되어 **로그인 자체가 불가**. (Electron 무관 — curl BE 계약은 전부 200.)

**근본 원인 (코드 확정):**
1. 웹 부팅 → `session.ts` bootstrap → `webAuthProvider.bootstrap()` → `apiClient.get('/auth/me')` (`webAuthProvider.ts:67`).
2. 미로그인이라 쿠키 없음 → 게이트웨이 **401**(정상 신호).
3. **응답 인터셉터**(`api/client.ts:86-99`)가 **모든 401**에서 `clearSession()` + 웹 분기 **`window.location.replace('/login')`**(line 97) = **풀 페이지 리로드**.
4. 리로드 → 재부팅 → `/auth/me` 401 → `replace('/login')` → **무한 리로드 루프**. 로그인 POST 도 리로드에 ABORTED.

`webAuthProvider.bootstrap()` 은 401 을 `return null` 로 처리하려 하나(`webAuthProvider.ts:77-80`), 인터셉터가 **먼저** 풀 리로드를 일으켜 무력화. Electron 은 `window.location.hash='#/login'`(리로드 없음·멱등)이라 루프 없음 → **웹 전용 회귀**.

**판정:** 집PC 슬1 세션이 라이브 QA 를 건너뛰어(핸드오프 자인) 미적발한 **웹 사용 불가** 결함. unit/IT(authProvider mock)는 인터셉터↔부팅 통합 루프를 못 봄 → 라이브가 단독 적발([[feedback_qa_docker_real_test]] 2026-06-25 재강조 사례).

**권장 fix (Codex 전담 — Opus 임의구현 금지):** 401 응답 인터셉터가 **인증 프로브/인증 엔드포인트(`/auth/me`·`/auth/login`·`/auth/logout`)의 401 에는 redirect/clearSession 을 건너뛰도록** 가드(이들 401 은 호출자가 처리: bootstrap→null, login→에러배너). 보호 리소스 401(세션 만료)만 로그인 유도.

### ✅ fix 적용 후 재 QA — 전부 PASS
Codex 가 `api/client.ts` 401 인터셉터에 인증프로브 가드(`/\/auth\/(me|login|logout)\/?$/` skip) 적용 + `client.authheaders.test.ts` 회귀 테스트. 검증: typecheck 0 · vitest 14/14 · build:web 0 → :5175 재서빙 → Playwright 재실행:

| 캡처 | 결과 |
|---|---|
| `B1` 로그인(모바일) | ✅ 정상 렌더 |
| `B2` 로그인→홈 | ✅ **홈 대시보드 진입**(쿠키 인증, 헤더 신원 "개발마스터 · MASTER") |
| `B3` 새로고침 | ✅ **세션 복원**(`GET /auth/me` 200, "처리중 판매전표 1" 위젯 로드) |
| `B4` 쿠키삭제→새로고침 | ✅ **`/login` 리다이렉트**(가드, 루프 없음) |

네트워크: `POST /auth/login` 200+Set-Cookie / `GET /auth/me` 401(초기,루프없이 처리)→200(복원) / `context.cookies` access_token httpOnly·Lax. **리로드 루프 해소.**

⚠️ 일부 대시보드 위젯(저재고/미확인메시지/결재대기)은 "준비중" fallback + 일부 500 — **슬1(인증 추상화) 범위 외 기존 로컬스택 위젯 거동**. "처리중 판매전표" 위젯이 정상 동작 = 쿠키→게이트웨이 식별헤더 주입→downstream 정상 증명(게이트웨이는 쿠키/Bearer 소스 무관 동일 주입). Electron/Bearer 에서도 동일 → 슬1 회귀 아님.

## C. Electron 무회귀 UI 실 캡처 (BE Bearer 계약 PASS, UI 캡처는 fix 후 웹과 함께)

curl 로 Bearer 경로 `/auth/me` 200(§A #3) = Electron 인증 경로 무회귀 확인. electronAuthProvider 는 기존 `window.samhanAuth` IPC 1:1 래핑(소스 무변경)이라 회귀 위험 낮음. 헤드리스 Electron UI 캡처는 하네스 제약 → 웹 fix 후 라운드에서 보강.
