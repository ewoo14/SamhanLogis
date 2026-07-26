# #928 웹 3앱 버전 안내와 작성 중 입력 보호

- 작업일: 2026-07-26
- 범위: `clients/web/order-app`, `clients/web/estimate-app`, `clients/web/mobile-public`
- 기준: `#910`의 `scripts/app-build-version.cjs`, `Semver`, `GET /app/version`, 앱별 식별자와 `0.1.0-dev` sentinel
- 커밋 상태: Codex는 git 쓰기를 하지 않았으며 커밋하지 않았다.
- 커밋 메시지 초안: `feat: 웹 3앱 버전 확인과 작성 중 입력 보호`

## 1. RED 원문

처음에는 의존성 미설치로 발생한 `vitest not found`/`jest not found`를 기능 RED로 세지 않았다. 각 앱에서 `npm ci` 후, 새 구현 파일이 없는 상태에서 다시 실행한 기능 RED는 다음과 같다.

### M1 — 등록 릴리스가 실제 앱 안내로 도달

```text
order-app: 2 failed, 0 tests
Failed to load url ./versionCheck ... Does the file exist?
Failed to load url ./versionGate ... Does the file exist?
mobile-public: Failed to resolve import "./WebVersionGate" ... Does the file exist?
estimate-app: Cannot find module '../lib/version-check'
estimate-app: Cannot find module '../lib/version-gate'
```

버전 조회·게이트·화면 연결이 모두 없었으므로 안내 실행 경로 자체가 RED였다.

### M2 — 작성 중 입력을 소리 없이 잃지 않음

```text
order-app versionGate.test.ts: Failed to load url ./versionGate ... Does the file exist?
estimate-app test/version-gate.test.js: Cannot find module '../lib/version-gate'
mobile-public: Failed to resolve import "./WebVersionGate" ... Does the file exist?
```

dirty reload guard와 모바일 게이트가 없었으므로, 작성 중 상태를 확인하거나 사용자의 선택을 받을 수 없는 RED였다.

### M3 — 앱 간 오폭 방지

```text
order-app versionCheck.test.ts: Failed to load url ./versionCheck ... Does the file exist?
estimate-app test/version-check.test.js: Cannot find module '../lib/version-check'
mobile-public: Failed to resolve import "./WebVersionGate" ... Does the file exist?
```

세 앱이 각자 고유 식별자로 조회하는 실행 코드가 없었으므로 cross-app 판정 테스트가 실행되지 않는 RED였다.

### M4 — 조회 실패·404 fail-open

```text
order-app versionCheck.test.ts: Failed to load url ./versionCheck ... Does the file exist?
estimate-app test/version-check.test.js: Cannot find module '../lib/version-check'
mobile-public: Failed to resolve import "./WebVersionGate" ... Does the file exist?
```

실패를 `null`로 수렴하는 조회 함수와 콘텐츠를 계속 렌더링하는 게이트가 없었다.

### M5 — 개발 sentinel 차단 금지

```text
order-app versionCheck.test.ts: Failed to load url ./versionCheck ... Does the file exist?
mobile-public: Failed to resolve import "./WebVersionGate" ... Does the file exist?
estimate-app test/version-check.test.js: Cannot find module '../lib/version-check'
```

앱이 기존 build-version resolver와 버전 상태 판정에 연결되지 않은 RED였다.

### M6 — 릴리스 산출물만 명시 버전 요구

```text
order-app versionCheck.test.ts: Failed to load url ./versionCheck ... Does the file exist?
mobile-public: Failed to resolve import "./WebVersionGate" ... Does the file exist?
estimate-app test/version-check.test.js: Cannot find module '../lib/version-check'
```

세 앱의 새 버전 경로와 기존 resolver를 연결하는 빌드 경계 테스트가 실행되지 않는 RED였다. 이후 구현 후 릴리스 무주입 명시 실패도 별도 검증했다(§5).

## 2. 구현 결과와 M1~M6 판정

### M1 — 도달

- 주문 웹은 `SAMHAN_ORDER_WEB`, 견적 웹은 `SAMHAN_ESTIMATE_WEB`, 모바일 퍼블릭은 `SAMHAN_MOBILE_PUBLIC_WEB`을 코드에 고정했다.
- 세 앱 모두 기존 `/app/version` 응답 envelope을 읽고 `MINOR`·`MAJOR`·`CRITICAL`을 안내 상태로 변환한다.
- `MINOR`와 `MAJOR`는 `페이지 새로고침`·`나중에`, `CRITICAL`은 새로고침 선택만 표시한다. 안내 표시만으로 reload하지 않는다.
- 실제 게이트웨이에 주문 웹 throwaway 릴리스를 등록·배포하고 주문 웹에서 `2026/07/26-92801` 안내가 실제 표시되는 것을 확인했다.

### M2 — 작성 중 입력 보존

- 주문 웹 dirty 판정: `#cardHome`, `#cardSingle`, `#cardComm`, `#cardOld`, `#pageOrderInfo`, `#pageBranch` 아래의 `input/select/textarea`에서 `value/defaultValue`와 `checked/defaultChecked`를 비교한다. 검색·필터 영역(`.filter-bar`)은 작성 상태에서 제외한다.
- 견적 웹 dirty 판정: 실제 EJS 작성 루트(`#cardHome`, `#cardSingle`, `#cardComm`, `#cardOld`, `#cardOrderInfo`)를 같은 방식으로 검사하고 필터 입력을 제외한다.
- 모바일 퍼블릭은 별도 문서 작성 폼이 없고 `EmployeeSignaturePage`의 `SignaturePad` `empty` 상태가 작성 상태다. `empty === false`를 `WebVersionGate.isDirty`로 전달한다.
- 모바일 퍼블릭 `WebVersionGate` 통합 테스트에서 작성 중 상태로 실제 재로드 버튼을 눌러 추가 확인 UI가 열리고 서명 콘텐츠가 유지되는 것을 검증했다.
- 새로고침 버튼을 눌렀을 때 dirty이면 추가 확인 UI/대화상자를 먼저 연다. 취소하거나 확인하지 않은 동안 reload 함수는 호출되지 않는다. 저장되지 않은 입력을 자동으로 삭제하는 경로는 두지 않았다.
- 모바일 퍼블릭은 서명 입력 중 `웹 버전 재로드`를 누르면 `web-version-unsaved-confirm` 확인 UI를 열고, 주문·견적은 실제 form control snapshot을 다시 읽어 같은 보호 경로를 탄다.

### M3 — 오폭 방지

버전 함수와 Vite/EJS 진입점에 앱 식별자를 각각 명시했다. 다른 앱 릴리스의 데이터는 조회하지 않는다. 실 게이트웨이 값은 §4에 기록했다.

### M4 — fail-open

HTTP 404, 네트워크 예외, abort, malformed response를 `null`로 수렴한다. `null`이면 기존 콘텐츠를 건드리지 않고 정상 사용을 계속한다. 브라우저 콘솔 경고만 찍고 진행하는 soft-pass는 사용하지 않았다.

### M5 — sentinel

세 앱의 build config가 공통 `scripts/app-build-version.cjs`를 사용한다. 개발 모드의 `0.1.0-dev`는 `/app/version` 판정에서 제외되는 기존 서버 계약을 그대로 사용하고, 클라이언트도 이를 임의 릴리스로 비교하지 않는다.

### M6 — 릴리스 버전 경계

평범한 무주입 `npm run build`는 세 앱 모두 계속 동작한다. `SAMHAN_RELEASE_BUILD=1`에서 `VITE_APP_VERSION`을 넣지 않으면 세 앱 모두 기존 resolver의 명시 버전 오류로 실패한다. 견적 웹은 새 `typecheck`와 `build`를 배포 workflow에도 연결했다.

## 3. 세 앱 작성 중 상태 조사

| 앱 | 조사한 작성 상태 | dirty 판단 | 결과 |
|---|---|---|---|
| 주문 웹 | 레거시 주문 카드·주문 정보·지점 선택 영역의 form controls | 현재값과 기본값 비교, 필터 제외 | 값이 바뀐 주문서는 reload 전 사용자 확인 |
| 견적 웹 | EJS의 홈/싱글/상업/구형/주문정보 작성 루트 | 현재값과 기본값 비교, 필터 제외 | 값이 바뀐 견적서는 reload 전 사용자 확인 |
| 모바일 퍼블릭 | `EmployeeSignaturePage`의 `SignaturePad` 상태 | `empty`가 false이면 dirty | 작성 중 서명은 확인 전 유지 |

실 브라우저에서 주문 웹의 작성 루트 DOM은 5개가 존재하는 것을 확인했다. 다만 현재 게이트웨이의 partner-auth가 `GET /api/v1/auth/partner-status`에 HTTP 503을 반환했고, 라이브 파트너 로그인 자격 증명이 제공되지 않아 BizGate를 통과해 실제 주문 필드에 값을 입력하는 단계까지는 완료하지 못했다. 따라서 라이브 M2 입력 증거를 합성 DOM으로 대체하지 않았고, 실제 DOM snapshot/dirty guard 단위 테스트와 모바일 기존 화면 통합 테스트를 권위 증거로 남겼다.

## 4. 실 게이트웨이 U-gate 및 오폭 값

대상: `http://localhost:8080`, `dev_master`, mock OFF. 등록·배포·삭제는 주문 웹 `SAMHAN_ORDER_WEB` throwaway 릴리스에만 수행했다.

```text
[오폭] 등록 전 SAMHAN_ORDER_WEB 행 수=0
[오폭] 등록 후 판정={
  "order": {
    "http": 200,
    "latestVersion": "2026/07/26-92801",
    "minSupportedVersion": "2026/07/26-92700",
    "forceLevel": "MINOR",
    "releaseNotes": "QA #928 throwaway 주문 웹 버전 안내 확인",
    "releasedAt": "2026-07-26T00:00:00"
  },
  "estimate": { "http": 404 },
  "mobile": { "http": 404 }
}
[도달] 안내 문구=새 주문 웹 버전 2026/07/26-92801을 사용할 수 있습니다. 페이지 새로고침 나중에
[M2 라이브 조사] 작성 폼 DOM 수=5
[정리] SAMHAN_ORDER_WEB 행 수 before=0, after=0
```

주문 릴리스 등록이 견적 웹·모바일 퍼블릭의 판정을 만들지 않았고, 주문 웹에서만 안내가 떴다. 안내 후 1초 동안 URL이 유지되어 자동 reload가 없음을 확인했다. 캡처는 다음 경로에 생성됐다.

`docs/qa/928-web-version-check/_local/01-order-version-notice.png`

`resolveQaShotsDir`가 committed 디렉터리 아래 `_local`을 선택하므로 기존 `docs/qa/**` 커밋 PNG는 건드리지 않았다.

## 5. 검증 원문

### 전체 typecheck + 단위 테스트

```text
order-app: tsc -p tsconfig.json --noEmit
Test Files  8 passed (8)
Tests       29 passed (29)

estimate-app: typecheck OK: 14 JavaScript files
Test Suites: 7 passed, 7 total
Tests:       102 passed, 102 total

mobile-public: tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit
Test Files  3 passed (3)
Tests       9 passed (9)
```

### 무주입 개발 빌드

```text
order-app: 62 modules transformed / ✓ built in 409ms / PWA precache 7 entries
estimate-app: typecheck OK: 14 JavaScript files
mobile-public: 88 modules transformed / ✓ built in 694ms
```

### 릴리스 모드 무주입 실패

```text
Error: VITE_APP_VERSION에 YYYY/MM/DD-{번호} 형식의 릴리스 버전을 명시적으로 주입해야 합니다. 릴리스 모드에서는 개발 sentinel을 사용하지 않습니다.
order-app EXPECTED_RELEASE_NO_INJECTION_EXIT=1
mobile-public EXPECTED_RELEASE_NO_INJECTION_EXIT=1
estimate-app EXPECTED_RELEASE_NO_INJECTION_EXIT=1
```

### workflow YAML

```text
YAML OK: .github\workflows\deploy-estimate-app.yml
```

estimate 배포 workflow에 `JavaScript typecheck`와 `무주입 개발 빌드` 단계가 실제로 등록됐다. `ci.yml`은 변경하지 않았다.

## 6. 변경 파일

- 버전 조회/게이트: `clients/web/order-app/src/version/*`, `clients/web/mobile-public/src/version/*`, `clients/web/estimate-app/lib/version-check.js`, `clients/web/estimate-app/lib/version-gate.js`, `clients/web/estimate-app/public/version-gate.js`
- 진입점/빌드: order `src/main.ts`, `vite.config.ts`, `src/vite-env.d.ts`; mobile `src/main.tsx`, `EmployeeSignaturePage.tsx`, `vite.config.ts`, `src/vite-env.d.ts`; estimate `routes/index.js`, `views/index.ejs`, `scripts/typecheck.cjs`, `package.json`
- 테스트: 세 앱 버전 조회·게이트 테스트(모바일 퍼블릭 작성 중 확인 포함)
- CI/QA: `.github/workflows/deploy-estimate-app.yml`, `clients/desktop/playwright/928-web-version-check-real-qa/*`
- 문서: `README.md`, `ROADMAP.md`, `migration/decisions/DECISIONS.md`, `docs/samhan-public-overview.html`, 본 보고서

## 7. 최종 상태 확인

```text
git status --porcelain
 M .github/workflows/deploy-estimate-app.yml
 M README.md
 M ROADMAP.md
 M clients/web/estimate-app/package.json
 M clients/web/estimate-app/routes/index.js
 M clients/web/estimate-app/views/index.ejs
 M clients/web/mobile-public/src/EmployeeSignaturePage.tsx
 M clients/web/mobile-public/src/main.tsx
 M clients/web/mobile-public/src/vite-env.d.ts
 M clients/web/mobile-public/vite.config.ts
 M clients/web/order-app/src/main.ts
 M clients/web/order-app/src/vite-env.d.ts
 M clients/web/order-app/vite.config.ts
 M docs/samhan-public-overview.html
 M migration/decisions/DECISIONS.md
?? clients/desktop/playwright/928-web-version-check-real-qa/
?? clients/web/estimate-app/lib/version-check.js
?? clients/web/estimate-app/lib/version-gate.js
?? clients/web/estimate-app/public/version-gate.js
?? clients/web/estimate-app/scripts/typecheck.cjs
?? clients/web/estimate-app/test/version-check.test.js
?? clients/web/estimate-app/test/version-gate.test.js
?? clients/web/mobile-public/src/version/
?? clients/web/order-app/src/version/
?? docs/dev-reports/2026-07-26-928-web-version-check.md

git status --porcelain -- docs/qa
(출력 없음)
```

`docs/qa/**` tracked PNG 오염은 0개다. 최종 전체 `git status --porcelain`은 PM에게 전달할 변경 파일만 포함하며, Codex는 commit/push/GitHub 쓰기를 하지 않았다.

## 8. 하지 못한 것 / 범위 밖 발견

- 라이브 partner-auth 503과 파트너 로그인 자격 증명 부재로 실제 주문 필드 입력 후 reload 확인은 완료하지 못함.
- 관리자 릴리스 메뉴의 데스크톱 UI 직접 클릭은 이번 웹 3앱 구현 범위에서 실행하지 않고 동일 권한의 실 `/app/releases` CRUD API로 throwaway 도달을 검증함.
- 아로로지스 데스크톱 `electron-updater` 신설·코드서명·업데이트 피드·installer 연동.
- 사용 중 주기 polling 알림 및 OTA.
- Git commit, push, GitHub PR/Issue 쓰기.
