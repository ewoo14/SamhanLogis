---
name: feedback_arologis_desktop_standalone_qa_harness
description: arologis-desktop 브라우저 standalone 실서버 QA 하네스 구동법(프록시 rewrite·인증·playwright 위치)
metadata:
  type: feedback
---

arologis-desktop(Electron)을 **브라우저 단독 렌더러**로 띄워 실서버 GUI QA 하는 법 (#784 strict QA서 구축·2026-07-11).

**Why:** arologis-desktop은 desktop과 달리 renderer 전용 vite config·playwright 디렉터리가 없어 real-qa가 비자명. 프로덕션 리버스프록시(`arologis.samhan-air.com`)가 `/api/arologis/**`를 rewrite하는 데 의존해 로컬 standalone에선 그냥 안 뜬다.

**How to apply:**
- 렌더러 config = `clients/arologis-desktop/vite.renderer.dev.config.ts`(electron.vite renderer 블록 재사용). **프록시 필수**: `^/api/arologis/.*`(정규식+슬래시 — `/api/arologis.ts` 소스모듈까지 가로채지 않게) → target `:8097`, rewrite `/api/arologis`→`/admin/arologis`. **#804서 `^/admin/arologis/.*` passthrough(rewrite 없이 `:8097`) 추가** — 대다수 sibling 클라이언트·배차 상세가 `/admin/arologis` 직호출이라 이 규칙 없으면 QA false-RED(vite dev 서버가 SPA fallback). `^/auth/.*`도 `:8097`.
- 구동: `VITE_AROLOGIS_API_BASE='' node_modules/.bin/vite dev --config vite.renderer.dev.config.ts --port 5291 --strictPort` (빈 base라야 apiClient가 상대경로→프록시 경유). 실 arologis-service = `:8097`(별개 게이트웨이 아님).
- **@playwright/test는 arologis-desktop에 미설치** → 스펙을 `clients/desktop/playwright/arologis-warning-aa-real-qa/`에 두고 **desktop의 playwright 바이너리**로 구동(SHOTS 4-up 경로 동일).
- 인증: `POST :8097/auth/admin/login {loginId:"admin",자격은 infrastructure/.env.local}`(AROLOGIS_MASTER 시드). **Electron IPC 브리지 `window.arologisAuth`가 브라우저엔 부재** → 토큰 저장 실패("로그인 중 오류가 발생했습니다", API는 200). playwright=`page.addInitScript`로 `window.arologisAuth.getToken()`=AuthSnapshot(accessToken/refreshToken/userId=JWT sub/role/loginId/fullName/expiresAt) 스텁. **gstack browse(#804 실증)**=로그인 폼 채우기 전 `$B js "window.arologisAuth={_t:null,getToken:function(){return Promise.resolve(this._t)},setToken:function(a){this._t=a;return Promise.resolve()},clearToken:function(){this._t=null;return Promise.resolve()}}"` shim 주입 후 fill/click(브리지 존재로 setAuth 성공→대시보드 전이). **전 플로우 1 bash 세션**(goto→shim→login→navigate→verify→screenshot·browse 데몬 idle-restart로 세션 유실 방지)·`sleep 3~5`(auth settle+API). SPA 네비=`$B js "location.hash='#/dispatches/detail/{id}'"`(goto 리로드=shim 유실).
- ✅ **DispatchDetailPage 크래시(#785)·FE-BE 계약 불일치(#804) 해소**(2026-07-14) — 배차 상세 QA 가능. 실 엔드포인트=`GET /admin/arologis/dispatches/{id}`(200 실데이터). dev status 분포=PENDING/ASSIGNED/DEPARTED/DELIVERED(**MATCHING 없음**→서브텍스트 QA는 투명 시드)·match_source=EXTERNAL_INSUNG_QUICK/INTERNAL_APP/EXTERNAL_KAKAO/null 혼재(INSUNG pill 게이팅 QA=KAKAO 차량 대조). screenshot 경로는 cwd/Temp 제한(scratchpad 저장 후 cp).

관련: [[feedback_realqa_run_and_false_red]] · [[feedback_css_var_token_not_fallback]]
