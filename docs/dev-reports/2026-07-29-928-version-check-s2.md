# #928 버전 확인 S2 — 아로로지스 데스크톱

작성일: 2026-07-29 (KST)  
작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\928-version`  
브랜치: `feat/928-version-check-s2`  
기준 HEAD: `6da2da717`

## 결론

8개 클라이언트를 현재 코드로 재실측한 결과, 웹 3앱은 PR #934 산출물이 이미 존재했고 유일한 미착수 앱은 `clients/arologis-desktop`이었다. 금지된 웹 3앱은 수정하지 않고 아로로지스 데스크톱만 구현했다.

구현 범위는 `AROLOGIS_DESKTOP` 전용 `/app/version` 조회와 MINOR/MAJOR/CRITICAL 안내, 조회 실패·오프라인 fail-soft, `electron-updater` 다운로드→설치→재시작 IPC, 공통 빌드 버전 주입, 코드서명·전용 피드 fail-closed 릴리스 wrapper다.

실제 Windows installer 설치·재시작은 코드서명 인증서와 피드 URL이 없어 미검증이다. `npm run build:win`은 피드가 없으면 시작 전에 차단된다.

## 정찰 결과

| 앱 | package 버전 | 실제 버전 확인 근거 | 상태 |
|---|---:|---|---|
| 삼한 데스크톱 | 0.1.0 | `clients/desktop/src/renderer/App.tsx:45`, `src/renderer/components/common/AppVersionGate.tsx:271`, `src/main/auto-update.ts:10` | 기존 유지 |
| 삼한 모바일 | 0.5.0 | `clients/mobile/src/version/MobileVersionGate.tsx:34`, `src/version/versionCheck.ts:62` | 기존 유지 |
| 직원 모바일 | 0.4.0 | `clients/mobile-staff/src/version/MobileVersionGate.tsx:34`, `src/version/versionCheck.ts:62` | 기존 유지 |
| 아로로지스 모바일 | 1.0.0 | `clients/arologis-mobile/src/version/MobileVersionGate.tsx:34`, `src/version/versionCheck.ts:62` | 기존 유지 |
| 아로로지스 데스크톱 | 1.0.0 | 구현 전 `versionCheck`, `AppVersionGate`, `electron-updater`, `app/version` 검색 0건 | 이번 구현 |
| 주문 웹 | 0.4.0 | `clients/web/order-app/src/main.ts:25`, `src/version/versionGate.ts:61` | PR #934 완료 |
| 종합견적 웹 | 2.0.0 | `clients/web/estimate-app/routes/index.js:13`, `views/index.ejs:19633`, `public/version-gate.js:9` | PR #934 완료 |
| 모바일 퍼블릭 웹 | 0.1.0 | `clients/web/mobile-public/src/EmployeeSignaturePage.tsx:11`, `src/version/WebVersionGate.tsx:16` | PR #934 완료 |

기존 방식은 `/app/version`에 앱별 `clientType`을 보내고 MINOR/MAJOR/CRITICAL을 판정한다. Electron은 CJS default import `electron-updater`와 `updater:*` IPC를 사용한다. 새 구현은 이 방식을 `AROLOGIS_DESKTOP`에 재사용했다.

## RED → GREEN 원문

RED: 테스트를 먼저 추가한 뒤 다음을 실행했다.

```text
npm test -- src/renderer/version/versionCheck.test.ts src/main/auto-update.test.ts src/renderer/components/common/AppVersionGate.test.tsx

Test Files  3 failed (3)
Tests       no tests
Error: Failed to resolve import "./auto-update" ... Does the file exist?
Error: Failed to resolve import "./versionCheck" ... Does the file exist?
Error: Failed to resolve import "./AppVersionGate" ... Does the file exist?
```

GREEN:

```text
npm test -- src/renderer/version/versionCheck.test.ts src/main/auto-update.test.ts src/renderer/components/common/AppVersionGate.test.tsx

Test Files  3 passed (3)
Tests       9 passed (9)
```

## 실행·산출물 확인

- DOM 테스트에서 서버 응답 `latestVersion=2026/07/29-2`를 `app-version-minor-banner` 텍스트로 읽었고 `아로로지스 본문`도 유지했다.
- 오프라인 fetch 실패 시 본문 유지와 blocking modal 부재를 확인했다.
- 개발 빌드 renderer asset 프로그램 읽기: `assetFiles=1`, `hasBuildSentinel=True`, `hasArologisClientType=True`, `hasVersionNoticeTestId=True`, `hasVersionEndpoint=True`.
- `VITE_APP_VERSION=2026/07/29-928 BUILD_ENV=preview npm run build`: `build_exit=0`, `has_release_version=True`.
- `npm run build:win` 원문: `[arologis-release] AROLOGIS_UPDATE_URL이 필요합니다. 코드서명된 아로로지스 전용 HTTPS 업데이트 피드를 지정하십시오.`

인증서·피드 확보 후 `build:win`과 설치본의 update-available/downloaded/quitAndInstall 실검증이 남았다.

## 회귀 검증

```text
# 아로로지스 데스크톱
npm test
Test Files  12 passed (12)
Tests       60 passed (60)
npm run typecheck  -> exit 0
npm run lint       -> exit 0

# 기존 삼한 데스크톱 version/updater 회귀
npm test -- src/renderer/version/versionCheck.test.ts src/renderer/components/common/AppVersionGate.test.tsx src/main/auto-update.test.ts
Test Files  3 passed (3)
Tests       25 passed (25)
```

웹 3앱은 금지 경로라 `npm ci`/실행 산출물을 만들지 않았고, PR #934 구현과 이번 diff의 변경 파일 목록으로 회귀 범위를 확인했다.

## 불변식·제약

- R-1: 최신 버전 안내 banner/blocking modal과 updater 상태를 사용자에게 표시한다.
- R-2: 개발 `0.1.0-dev`, 릴리스 명시 `YYYY/MM/DD-{번호}`를 renderer 산출물에서 확인한다.
- R-3: 기존 7개 앱 소스는 미변경이며 삼한 데스크톱 회귀 25개가 통과했다.
- R-4: 버전 fetch/updater 확인·설치 오류는 안내로 바꾸고 앱을 죽이지 않는다. 서버 `CRITICAL`만 정책대로 차단한다.
- 변경은 `clients/arologis-desktop/**`와 `scripts/build-arologis-desktop-release.cjs`에만 있다.
- `clients/web/order-app/**`, `clients/web/estimate-app/**`, `clients/web/legacy-quantity-golden/**` 변경 0건.
- git 쓰기 명령(commit/push/checkout/reset/stash) 0회.

## `git diff --numstat` 개별 파일 값

추적 파일은 `git diff --numstat`, 신규 파일은 `git diff --no-index --numstat NUL <file>` 원문이며 합산 `--stat`은 사용하지 않았다.

```text
4  1  clients/arologis-desktop/README.md
10 4  clients/arologis-desktop/electron-builder.yml
12 0  clients/arologis-desktop/electron.vite.config.ts
105 0 clients/arologis-desktop/package-lock.json
2  1  clients/arologis-desktop/package.json
6  1  clients/arologis-desktop/src/main/index.ts
14 0  clients/arologis-desktop/src/preload/index.ts
5  1  clients/arologis-desktop/src/renderer/App.tsx
15 0 clients/arologis-desktop/src/renderer/types/electron.d.ts
4  0 clients/arologis-desktop/src/renderer/vite-env.d.ts
62 0 clients/arologis-desktop/src/main/auto-update.test.ts
86 0 clients/arologis-desktop/src/main/auto-update.ts
48 0 clients/arologis-desktop/src/renderer/components/common/AppVersionGate.test.tsx
145 0 clients/arologis-desktop/src/renderer/components/common/AppVersionGate.tsx
42 0 clients/arologis-desktop/src/renderer/version/versionCheck.test.ts
109 0 clients/arologis-desktop/src/renderer/version/versionCheck.ts
58 0 scripts/build-arologis-desktop-release.cjs
170 0 docs/dev-reports/2026-07-29-928-version-check-s2.md
```

## 스크래치패드 저장 확인

저장 경로: `C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\7445e5b2-c181-4d85-abc3-95daebb19d9f\scratchpad\928-version-s2.md`

저장 직후 `ls -la`:

```text
-rw-r--r-- 1 user 197121 5917 Jul 29 07:21 C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\7445e5b2-c181-4d85-abc3-95daebb19d9f\scratchpad\928-version-s2.md
```

저장 직후 첫 40줄:

```text
  1: # #928 버전 확인 S2 작업 보고
  2:
  3: 작성일: 2026-07-29 (KST)
  4: 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\928-version`
  5: 브랜치: `feat/928-version-check-s2`
  6: HEAD: `6da2da717`
  7:
  8: ## 결론
  9:
 10: - 정찰 결과 8개 중 미착수는 아로로지스 데스크톱 1개뿐이었다.
 11: - 웹 3앱은 PR #934로 이미 처리된 상태였다. 주문 웹·종합견적 웹·모바일 퍼블릭 웹을 다시 수정하지 않았다.
 12: - 아로로지스 데스크톱에 `AROLOGIS_DESKTOP` 버전 조회, fail-soft 게이트, `electron-updater` IPC, 코드서명·전용 피드 fail-closed 릴리스 wrapper를 구현했다.
 13: - 실제 Windows installer 설치·재시작은 코드서명 인증서와 `AROLOGIS_UPDATE_URL` 부재로 미검증이다. `npm run build:win`은 피드 URL 미지정 시 시작 전에 실패한다.
 14:
 15: ## 정찰
 16:
 17: | 앱 | 현 버전 | 실제 구현 | 판정 |
 18: |---|---:|---|---|
 19: | 삼한 데스크톱 | 0.1.0 | `clients/desktop/src/renderer/App.tsx:45`, `components/common/AppVersionGate.tsx:271`, `main/auto-update.ts:10` | 기존 동작 유지 |
 20: | 삼한 모바일 | 0.5.0 | `clients/mobile/src/version/MobileVersionGate.tsx:34`, `versionCheck.ts:62` | 기존 동작 유지 |
 21: | 직원 모바일 | 0.4.0 | `clients/mobile-staff/src/version/MobileVersionGate.tsx:34`, `versionCheck.ts:62` | 기존 동작 유지 |
 22: | 아로로지스 모바일 | 1.0.0 | `clients/arologis-mobile/src/version/MobileVersionGate.tsx:34`, `versionCheck.ts:62` | 기존 동작 유지 |
 23: | 아로로지스 데스크톱 | 1.0.0 | 착수 전 `rg` 결과 `versionCheck/AppVersionGate/electron-updater/app/version` 0건 | 이번 슬라이스 구현 |
 24: | 주문 웹 | 0.4.0 | `clients/web/order-app/src/main.ts:25`, `version/versionGate.ts:61` | PR #934 완료 |
 25: | 종합견적 웹 | 2.0.0 | `clients/web/estimate-app/routes/index.js:13`, `views/index.ejs:19633`, `public/version-gate.js:9` | PR #934 완료 |
 26: | 모바일 퍼블릭 웹 | 0.1.0 | `clients/web/mobile-public/src/EmployeeSignaturePage.tsx:11`, `version/WebVersionGate.tsx:16` | PR #934 완료 |
 27:
 28: 기존 패턴은 `/app/version` + 앱별 clientType + MINOR/MAJOR/CRITICAL 판정이며, Electron은 CJS default import `electron-updater`와 `updater:*` IPC를 사용한다. 이 패턴을 아로로지스 전용 식별자와 전용 피드에 맞춰 재사용했다.
 29:
 30: ## RED 원문
 31: 실행:
 32:
 33: ```text
 34: npm test -- src/renderer/version/versionCheck.test.ts src/main/auto-update.test.ts src/renderer/components/common/AppVersionGate.test.tsx
 35: ```
 36:
 37: ```text
 38: Test Files  3 failed (3)
 39: Tests       no tests
 40: Error: Failed to resolve import "./auto-update" ... Does the file exist?
```
