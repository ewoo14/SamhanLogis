# Issue #910 / PR #993 — R 표시 표면 fix 라운드 보고서

- 작업일: 2026-07-31
- 대상: Samhan Public 데스크톱, 아로로지스 데스크톱
- 기준: `VITE_APP_VERSION=2026/07/31-1`
- 내부 updater 비교 버전: `1.20260731.1`
- 원칙: 사용자 표시값은 `YYYY/MM/DD-N`, 내부 semver는 `electron-updater`와 패키징 메타데이터에만 사용
- 백엔드 서비스·Flyway·Docker는 변경하지 않음

## 선행 자료 확인

`docs/qa/910-app-client-identity/`에는 최신 재수렴 보고서 본문 파일이 없고, 2026-07-29 시각의 PNG 11장만 있었다. 따라서 해당 디렉터리의 파일 목록을 먼저 확인하고, 기존 dev-report와 이미지 산출물을 기준으로 표시 표면을 다시 전수 조사했다. 새 실제 캡처는 `docs/qa/910-app-client-identity/r-2026-07-31/`에 저장했다.

## 1. 버전이 보이는 자리 전수 표

`version`, `currentVersion`, `latestVersion`, `minSupportedVersion`, `VITE_APP_VERSION`, `VERSION`, `DisplayVersion`, 창 제목, 페이지 제목, tray/about/error/update 표면 및 `v0.1.0`·내부 semver 리터럴을 양쪽 데스크톱 소스·빌드 설정·렌더러 산출물에서 검색했다.

| 자리 | 현재 표시값 또는 수정 전 관측값 | 기대 표시값 | 조치 |
|---|---|---|---|
| Samhan Public 인증 셸 사이드바(모든 인증 후 화면) | `v0.1.0` | `2026/07/31-1` | `AppLayout`의 package 버전 리터럴을 주입된 표시 버전으로 교체. 실제 인증 화면 캡처로 확인 |
| Samhan Public `AppVersionGate` 현재 버전·차단/권장 안내 | 주입된 날짜형 버전 | `YYYY/MM/DD-N` | 기존 표시 계약 유지, 실제 번들에 `2026/07/31-1` 주입 확인 |
| Samhan Public 최신/최소 지원 버전 정책 UI | 정책 API의 날짜형 `latestVersion`/`minSupportedVersion` | `YYYY/MM/DD-N` | 변경 없음. API 계약과 렌더러 표시 경로를 확인 |
| Samhan Public Electron updater `available`/`downloaded` 알림 | 정상 내부 semver는 날짜형으로 변환됐으나 알 수 없는 `1.0.0`은 그대로 노출 가능 | 날짜형, 해석 불가 값은 원문 semver 대신 `새 버전` | `displayVersionFromUpdateInfo`에 형식 검증 fallback 추가 |
| Samhan Public 관리자 릴리스 관리 화면 | 정책의 날짜형 표시값 | `YYYY/MM/DD-N` | 변경 없음. 사용자 정책 값은 내부 semver를 사용하지 않음을 확인 |
| Samhan Public HTML 문서 제목·Electron 창 제목 | 버전 없음 (`Samhan Public 데스크톱`, `Samhan Public`) | 버전 없음 | 누출 없음, 변경 없음 |
| Samhan Public tray/about/정보 창 | tray 구현과 별도 about 창을 찾지 못함 | 존재하지 않는 표면 | 변경 없음 |
| Samhan Public NSIS 설치 마법사/브랜딩 | electron-builder `VERSION`에서 내부 `1.20260731.1` 사용 | `2026/07/31-1` | 임시 NSIS include가 `VERSION`을 날짜형으로 재정의하도록 양산 wrapper 수정 |
| Samhan Public Windows 프로그램 목록 `DisplayVersion` | 내부 `1.20260731.1` | `2026/07/31-1` | 같은 NSIS include가 `installer.nsi`의 `DisplayVersion`을 날짜형으로 만들도록 수정 |
| Samhan Public `package.json`/`extraMetadata.version` | 내부 `1.20260731.1` | 사용자 화면에는 노출 금지, updater 비교용으로만 내부 유지 | 유지. renderer에는 `VITE_APP_VERSION`만 주입 |
| Samhan Public 설치 파일명/출력 경로 | `2026-07-31-1` | 사용자 표시와 구분되는 path-safe 날짜형 | 유지. 파일명은 내부 semver가 아님 |
| 아로로지스 `AppVersionGate` 현재 버전·차단/권장 안내 | 주입된 날짜형 버전 | `YYYY/MM/DD-N` | 기존 표시 계약 확인, 실제 번들에 `2026/07/31-1` 주입 확인 |
| 아로로지스 Electron updater `available`/`downloaded` 알림 | 정상 내부 semver는 변환됐으나 알 수 없는 `1.0.0`은 그대로 노출 가능 | 날짜형, 해석 불가 값은 `새 버전` | fallback 추가 및 테스트 |
| 아로로지스 로그인·`AppLayout`·HTML 문서 제목·Electron 창 제목 | 버전 없음 (`아로로지스`) | 버전 없음 | 누출 없음. 실제 로그인 캡처 확인 |
| 아로로지스 tray/about/정보 창 | tray 구현과 별도 about 창을 찾지 못함 | 존재하지 않는 표면 | 변경 없음 |
| 아로로지스 NSIS 설치 마법사/브랜딩 | 내부 `1.20260731.1` | `2026/07/31-1` | 아로로지스 release wrapper에도 동일한 NSIS include 적용 |
| 아로로지스 Windows 프로그램 목록 `DisplayVersion` | 내부 `1.20260731.1` | `2026/07/31-1` | 동일 include 적용 |
| 아로로지스 `package.json`/`extraMetadata.version` 및 설치 파일명 | 내부 semver / path-safe 날짜형 | 사용자 화면에는 내부 semver 금지 | 내부 메타데이터·파일명 역할로 유지 |
| 양쪽 updater 로그·오류 화면 | 상세 오류 원문은 개발자 콘솔에만 기록되고, renderer 오류 상태는 일반 안내 | 사용자 화면에 raw semver·URL·secret 노출 금지 | raw 오류가 renderer로 전달되지 않는 기존 계약과 신규 updater 테스트 확인 |
| 양쪽 업무 도메인의 `version`/이력/optimistic-lock 필드 | 문서·행 데이터의 업무 버전 숫자 | 앱 클라이언트 버전 규칙 대상 아님 | 앱 identity와 무관한 업무 데이터로 분류, 변경하지 않음 |

### 전수 조사 결론

사용자 화면에서 확인된 실제 누출은 Samhan Public 인증 셸의 `v0.1.0`과 양쪽 앱의 NSIS/Windows `DisplayVersion` 내부 semver였다. updater의 비정상 입력 raw semver 전달도 표시 표면 방어 누락으로 함께 차단했다. HTML/창 제목·로그·오류·tray/about에는 별도 내부 버전 누출을 확인하지 못했다.

## 2. 결함별 RED → 변경 → 증거

### 결함 A — 인증 셸 사이드바 package 버전 누출

#### RED 원문

현재 코드에 대한 Samhan Public Vitest의 신규 불변식 실패:

```text
AssertionError: expected ... not to contain 'v0.1.0'
```

#### 변경 요지

`clients/desktop/src/renderer/components/AppLayout.tsx`에서 `v0.1.0`을 제거하고 `resolveBuildAppVersion(import.meta.env.VITE_APP_VERSION)` 결과를 모든 인증 후 사이드바의 표시값으로 사용했다. 테스트 모드에서만 기존 sentinel을 fallback으로 허용하고 릴리스/실행 화면에는 날짜형 주입값을 사용한다.

#### 실행·캡처 증거

- 실제 renderer 실행: `VITE_APP_VERSION=2026/07/31-1 npx vite --config vite.renderer.dev.config.ts --port 5181 --strictPort`
- 실제 Chromium 인증 후 화면의 좌측 하단에 `2026/07/31-1 · 사내 전용` 표시 확인
- 번들 검색: `clients/desktop/out/renderer/assets/index-BNuyyO8q.js`에 날짜형 주입값 확인, `v0.1.0` 표시 리터럴 미검출
- 실제 캡처:
  - `docs/qa/910-app-client-identity/r-2026-07-31/01-samhan-login-real.png`
  - `docs/qa/910-app-client-identity/r-2026-07-31/02-samhan-authenticated-sidebar-real.png`
  - `docs/qa/910-app-client-identity/r-2026-07-31/03-samhan-sidebar-version-real.png`

### 결함 B — NSIS 설치 화면 및 Windows `DisplayVersion` 내부 semver 누출

#### RED 원문

NSIS 표시 버전 계약을 먼저 추가했을 때의 Node test RED:

```text
TypeError: createNsisDisplayVersionInclude is not a function
```

updater와 표시 표면 테스트에서도 내부 semver raw 전달이 확인됐다:

```text
AssertionError: expected version '새 버전' but received '1.0.0'
```

#### 변경 요지

- `scripts/app-build-version.cjs`에 날짜형 `VERSION`을 생성하는 `createNsisDisplayVersionInclude()`를 추가했다.
- Samhan Public와 아로로지스 release wrapper가 임시 `display-version.nsh`를 만들고 `--config.nsis.include=...`로 electron-builder에 전달한다.
- `extraMetadata.version`에는 계속 `1.YYYYMMDD.N`을 전달하므로 updater 비교 계약은 보존한다.
- 양쪽 updater에서 내부 semver 형식이 아닌 입력은 renderer에 raw로 보내지 않고 `새 버전`으로 표시한다.

#### 실행·캡처 증거

- `node --test scripts/app-build-version.test.cjs`: **12 passed, 0 failed**
- 두 release wrapper가 실제 builder 인자에 NSIS include와 내부 package semver를 함께 전달하는 단정 통과
- 실제 renderer 번들에서 양쪽 앱의 `2026/07/31-1` 주입 확인
- 양쪽 NSIS builder를 실제 실행했다. Windows unpacked 산출물은 생성됐다:
  - `clients/desktop/release/qa-2026-07-31-1-r2/win-unpacked/Samhan Public.exe`
  - `clients/desktop/release/qa-2026-07-31-1-r2/win-unpacked/resources/app.asar`
- NSIS 설치 실행 파일 자체는 현재 계정의 심볼릭 링크 권한 때문에 생성하지 못했다. electron-builder 원문:

```text
cannot execute  cause=exit status 2
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
...
winCodeSign-2.6.0.7z
```

따라서 설치 마법사 UI와 실제 Windows 프로그램 목록의 최종 실행 캡처는 이 환경에서 GREEN이라고 주장하지 않는다. NSIS include 문자열·electron-builder 삽입 위치·wrapper 전달 인자는 테스트와 소스 검증으로 확인했고, 실제 renderer UI는 위 캡처로 확인했다.

### 결함 C — CI `CodefImportScopeForm` 1건 실패

#### CI RED 원문 및 원인 판정

실행 ID `30528769269`의 `Frontend Desktop (typecheck + lint + build)` 실패 원문:

```text
src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests | 1 failed)

R2 BLOCKING-1 — 저장된 LOAN+ALL 은 가져오기 type을 저장된 defaultImportType으로 유지하고 refs를 생략한다
AssertionError: expected { connectedId: 'connected-main', …(4) } to match object { type: 'LOAN', scopeMode: 'ALL' }
diff: expected type: "LOAN" / received type: "ALL", scopeMode: "ALL"

Test Files 1 failed | 186 passed (187)
Tests 1 failed | 1695 passed (1696)
```

판정은 **이번 버전 표기 변경이 만든 결함이 아니라 선재한 렌더/effect race 성격의 비결정적 결함**이다. 실패 파일은 Codef import payload이고 버전·NSIS·updater 코드와 의존하지 않는다. 수정 전 이 워크트리의 동일 42개 테스트는 로컬에서 42/42로 통과해 CI 재현도 불안정했다. 다만 CI red를 남기지 않기 위해 현재 선택이 아직 dirty일 때 `restoredScope`를 우선 사용하고, 상태 반영 순서가 앞선 경우 `scopeQuery.data`를 authoritative fallback으로 사용하는 보강을 추가했다.

#### GREEN 증거

- `npx vitest run ... CodefImportScopeForm.test.tsx ...`: Codef 42/42 포함 대상 3파일 57/57 통과
- Samhan Public 전체 테스트: 186/186 test files, 1678/1678 tests 통과

## 3. Linux 단정 검토

새 단정마다 Linux CI에서의 참 여부를 확인했다.

| 새 단정 | Linux에서의 판단 |
|---|---|
| `createNsisDisplayVersionInclude()` 문자열 전체 비교 | OS API·Windows 경로·줄바꿈에 의존하지 않는 순수 문자열 단정이므로 Linux에서 참 |
| 두 wrapper의 `--config.nsis.include=` 전달 확인 | 임시 경로의 실제 구분자를 검사하지 않고 인자 prefix만 검사하므로 Linux에서 참 |
| Samhan `AppLayout` 소스 불변식 | `fileURLToPath`·`resolve`로 읽고 Windows 역슬래시 리터럴을 단정하지 않으므로 Linux에서 참 |
| 양쪽 updater의 `1.0.0 → 새 버전` 단정 | mock event와 순수 renderer IPC payload만 검사하며 Windows API가 없으므로 Linux에서 참 |
| Codef 회귀 테스트 | DOM/React 상태·payload 로직만 검사하며 Windows 경로 단정이 없으므로 Linux에서 참 |

따라서 파일 전체 skip이나 Windows 전용 skip을 새로 추가하지 않았다.

## 4. 실행 결과

| 명령 | 결과 |
|---|---|
| `clients/desktop npm run build` (`VITE_APP_VERSION=2026/07/31-1`) | PASS |
| `clients/arologis-desktop npm run build` (`VITE_APP_VERSION=2026/07/31-1`) | PASS |
| `clients/desktop npm run typecheck` | PASS (`typecheck:real-qa` 포함) |
| `clients/desktop npm run lint` | PASS, warning 104건·error 0건 |
| `clients/arologis-desktop npm run typecheck` | PASS |
| `clients/arologis-desktop npm run lint` | PASS |
| `clients/desktop npm test` | 첫 실행은 stale `out/main/index.js` pretest guard에서 중단; build 후 재실행 PASS, 186 files / 1678 tests |
| `clients/arologis-desktop npm test` | PASS, 12 files / 63 tests |
| `node --test scripts/app-build-version.test.cjs` | PASS, 12 tests |
| 실제 Samhan renderer (`5181`)·아로로지스 renderer (`5182`) | PASS, 실제 Chromium PNG 4장 저장 |
| 실제 Windows NSIS builder | unpacked PASS, NSIS는 winCodeSign 심볼릭 링크 권한으로 BLOCKED |

## 5. 변경 파일 목록

### 수정 파일

- `scripts/app-build-version.cjs` — NSIS 사용자 표시 버전 include 생성
- `scripts/app-build-version.test.cjs` — NSIS include 및 wrapper 인자 회귀 단정
- `scripts/build-desktop-release.cjs` — Samhan NSIS include 임시 파일 전달·정리
- `scripts/build-arologis-desktop-release.cjs` — 아로로지스 NSIS include 임시 파일 전달·정리
- `clients/desktop/src/renderer/components/AppLayout.tsx` — 인증 셸 버전 누출 제거
- `clients/desktop/src/main/auto-update.ts` — 비정상 updater 버전 raw 노출 방지
- `clients/desktop/src/main/packaging-invariants.test.ts` — 인증 셸 표시 불변식
- `clients/desktop/src/main/auto-update.test.ts` — updater fallback 테스트
- `clients/desktop/src/renderer/routes/components/CodefImportScopeForm.tsx` — LOAN+ALL payload race 보강
- `clients/arologis-desktop/src/main/auto-update.ts` — 비정상 updater 버전 raw 노출 방지
- `clients/arologis-desktop/src/main/auto-update.test.ts` — updater fallback 테스트

### 신규 파일

- `docs/dev-reports/2026-07-31-910-r-display-surface-fix.md` — 본 보고서
- `docs/qa/910-app-client-identity/r-2026-07-31/01-samhan-login-real.png`
- `docs/qa/910-app-client-identity/r-2026-07-31/02-samhan-authenticated-sidebar-real.png`
- `docs/qa/910-app-client-identity/r-2026-07-31/03-samhan-sidebar-version-real.png`
- `docs/qa/910-app-client-identity/r-2026-07-31/04-arologis-login-real.png`

위 PNG는 합성·목업이 아닌 실제 Vite renderer와 실제 Chromium에서 저장했다. Samhan 인증 캡처는 실제 gateway 로그인 세션을 renderer에 주입해 실제 인증 후 셸을 띄운 것이다.

### 검증 중 생성된 산출물

- `clients/desktop/out/**`, `clients/arologis-desktop/out/**`
- `clients/desktop/release/qa-2026-07-31-1/**`
- `clients/desktop/release/qa-2026-07-31-1-r2/**`
- `clients/arologis-desktop/node_modules/**` (의존성 설치 산출물)

### `git status --porcelain` 원문

사용자의 명시적 지시가 `git` 명령 전부 금지이므로 `git status --porcelain`도 실행하지 않았다. 따라서 아래는 실행 결과를 위조하지 않기 위한 기록이다.

```text
[실행하지 않음 — 사용자 지시: git 명령 금지]
```

커밋·add·push는 수행하지 않았으며, PM이 이 워크트리의 변경 파일을 확인해 커밋해야 한다.
