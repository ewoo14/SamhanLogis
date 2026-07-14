# #817 데스크톱 패키지 앱 white-screen 정식 수정 (preload CJS + sandbox:true)

- **일자**: 2026-07-14
- **PR**: #817 · 브랜치 `fix/desktop-packaging-preload`
- **연관**: #804 세션(white-screen 최초 발견·핫픽스) · #748 [SECURITY] Electron 하드닝

## 배경 / 문제

데스크톱 패키지 앱(electron-builder `build:win`)이 그간 `@samhan/design-system` prod dep로 인한 asar 크래시로 **한 번도 빌드된 적이 없어** dev 모드만 검증됐다. 첫 패키징 시 **로그인 후 흰 화면**이 드러났다.

## 근본원인 (2건 연쇄)

1. **design-system `file:` prod dep → asar 크래시**: `@samhan/design-system`(`file:../web/design-system`)이 `dependencies`라 electron-builder asar packer가 앱 디렉토리 밖(`.storybook/*.ts`) 상대경로 계산 실패("must be under …") → 빌드 중단.
2. **preload ESM + sandbox:true → white screen**: electron-vite가 preload를 ESM(`.mjs`)로 빌드하는데 **샌드박스 preload는 CommonJS만 허용** → packaged(file://)에서 "Cannot use import statement outside a module"로 preload 미로드 → `window.samhanAuth`(IPC contextBridge) undefined → 세션 부트/라우팅 실패 → 흰 화면. (부수: 401 리다이렉트가 브리지 부재로 web 분기 `window.location.replace('/login')`→`file:///C:/login` 차단.)

## 수정

- **design-system**: `dependencies` → `devDependencies` (renderer 번들에 이미 인라인·electron-builder는 devDep 미패킹·node_modules 심링크는 dep/devDep 무관).
- **preload**: electron-vite preload output `format:'es'`/`.mjs` → **`format:'cjs'`/`.cjs`**, main `preload` 경로 `.cjs`, **`sandbox:true` 유지**(#748 OS 렌더러 샌드박스 하드닝 복원). preload는 `contextBridge`/`ipcRenderer`만 써서 샌드박스 CJS로 충분.
- **webviewTag**: `true` → `false` (legacy estimate webview 폐기·미사용, XSS 시 webview 생성 공격면 차단).
- **회귀 가드**: `packaging-invariants.test.ts` — 주석 strip 소스 검사 + 빌드 산출물(`out/main`·`out/preload/*.cjs`) 검사로 sandbox:true·preload .cjs·format cjs·design-system devDeps·webviewTag:false 불변식 단언(CI가 `build:win` 미실행하는 사각 방어).
- **arologis-desktop 스윕**: 동일 패턴(preload .mjs+sandbox:true·design-system prod dep) 동형 수정 + 가드 신규(결함-패밀리 sweep). Electron 클라이언트 2개(desktop+arologis) 전수 완결.

## 리뷰 (캐논 듀얼·순차·0수렴)

- **Opus 5-agent R1**: BLOCKING(QA GAP1 post-login 렌더 미실증·GAP2 실 GUI 스샷 부재)·MEDIUM(sandbox:false=#748 되돌림) → CJS+sandbox:true 전환·실 GUI 로그인 QA로 해소.
- **Codex 5-agent 적대 R1**: HIGH(arologis 동일 패턴)·MEDIUM(webviewTag)·LOW(가드 정규식 취약) → sweep·webviewTag:false·가드 견고화로 해소. PM 독립검증(양 클라이언트 build+test).
- **0수렴**: 신규 findings 0 · sweep 완결.

## QA (실 GUI·패키지 exe·실 백엔드)

- **desktop**: 패키지 win-unpacked exe + Docker :8080(mock OFF). 로그인 화면(#/login·"Samhan Public 로그인") 렌더 → dev_master 실 `/auth/login` 인증(token MASTER) → 대시보드 전이. `window.samhanAuth`=object.
- **arologis**: 패키지 exe. `window.arologisAuth`=object · "아로로지스" 관리자 로그인 폼 렌더.
- 스샷: `docs/qa/817-desktop-preload-cjs/`.

## 교훈 (메모리 반영)

[[feedback_electron_packaging_gotchas]] 갱신 — CJS+sandbox:true 정식 채택 · CDP `captureScreenshot`는 hidden 윈도우서 hang → `--disable-backgrounding-occluded-windows` 등으로 해소.
