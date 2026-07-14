---
name: feedback_electron_packaging_gotchas
description: 데스크톱 Electron 패키지(build:win) 함정 — design-system prod dep asar 크래시·preload ESM+sandbox white screen·winCodeSign 심링크·app.asar 잠금·CDP 검증
metadata:
  type: feedback
---

데스크톱 Electron 앱 패키징(electron-builder `build:win`) 함정 (#804 세션 white-screen 디버깅서 실증·2026-07-14). **패키지 빌드가 design-system 파손으로 지금껏 미실행이라 dev 모드만 검증됐고, 첫 패키징서 아래가 연쇄 노출됨.**

**Why:** 패키지(file://) 런타임은 dev(vite dev server)와 로딩/샌드박스가 달라 dev-green이 packaged-red일 수 있다. `clients/desktop`·`clients/arologis-desktop` 공통.

**How to apply:**
1. **design-system `file:` prod dep → electron-builder asar 크래시**: `@samhan/design-system`(`file:../web/design-system`)이 `dependencies`면 electron-builder asar packer가 심링크를 실경로로 따라가 앱 디렉토리 밖 파일(`.storybook/*.ts`) 상대경로 계산 실패("... must be under ...") → 빌드 중단. **fix=`devDependencies`로 이동**(vite/electron-vite가 renderer 번들에 이미 인라인·electron-builder는 devDep 미패킹·node_modules 심링크는 dep/devDep 무관 존재). [[feedback_rename_filedep_junction]]
2. **preload ESM + `sandbox:true` → packaged white screen**: electron-vite가 preload를 ESM(`.mjs`·`format:'es'`)로 빌드하는데 **샌드박스 preload는 CommonJS만 허용** → packaged에서 "Cannot use import statement outside a module"로 preload 미로드 → `window.<authBridge>`(IPC contextBridge) undefined → 세션 부트스트랩/토큰 저장 실패 → **흰 화면**. 부수: 로그인 401/네비 리다이렉트가 브리지 부재로 web 분기(`window.location.replace('/login')`)→`file:///C:/login` 차단. **정식 fix(#817 채택)=preload를 CommonJS(`electron.vite.config.ts` preload output `format:'cjs'`+`entryFileNames:'[name].cjs'`, main `preload:'…/index.cjs'`)로 빌드하고 `sandbox:true` 유지** — preload가 `contextBridge`/`ipcRenderer`만 쓰면 샌드박스 CJS로 충분(산출 `index.cjs`=`require("electron")` 확인). `sandbox:false`(ESM preload 로드)는 임시책이나 **#748 [SECURITY] OS 렌더러 샌드박스 하드닝을 되돌리므로 지양**(듀얼리뷰 3에이전트 수렴 지적). CI가 `build:win`을 안 돌려 packaged 경로 미검증 → 소스 불변식 가드 테스트(`src/main/packaging-invariants.test.ts`: sandbox:true·preload .cjs·format:'cjs'·design-system devDeps)로 회귀 방어.
3. **winCodeSign 심링크 추출 실패(Windows)**: `winCodeSign` 캐시(darwin `.dylib` 심링크) 추출이 관리자/개발자모드 없으면 "Cannot create symbolic link : 권한 없음" → nsis/portable 서명 단계 실패. **단 win-unpacked 폴더는 그 전에 완성**(`release/<v>/win-unpacked/<App>.exe` 실행 가능) → `electron-builder --win --dir`로 서명 우회 or win-unpacked 직접 사용.
4. **app.asar 파일 잠금**: 실행 중 앱/AV 스캔이 `resources/app.asar` 잠금("being used"/"Device or resource busy") → 재빌드 실패. 앱 종료(`Get-Process "<App>"|Stop-Process`) or 새 출력 디렉토리(`-c.directories.output=release2/<v>`).
5. **검증(GUI 스샷)**: `<App>.exe --remote-debugging-port=9222` 실행 → node 전역 WebSocket(node22+)로 CDP 접속 → `Runtime.evaluate typeof window.<bridge>`(=object면 preload OK)·`Log.entryAdded`/`Runtime.exceptionThrown` 에러·`location.hash` 확인. **실 GUI 스샷=`Page.captureScreenshot`** — 단 **hidden/occluded 윈도우는 Chromium 페인팅 스로틀로 captureScreenshot가 무한 hang**(fromSurface true/false 무관) → exe 기동에 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-gpu` 부여하면 실 렌더 캡처됨(2026-07-14 #817 실증). 로그인 QA=`window.<bridge>.clearToken()`+`Page.reload`로 로그인 화면 재현→React 입력은 native value setter+`input`/`change` 이벤트로 채움→로그인 버튼 click→hash `#/login`→`#/` 전이+토큰 저장 확인.

관련: 데스크톱 white-screen 근본수정 브랜치 `fix/desktop-packaging-preload`(#804 세션·미머지·캐논 리뷰 대기). VITE_API_BASE_URL 미설정 시 renderer 기본 `http://localhost:8080`(게이트웨이).
