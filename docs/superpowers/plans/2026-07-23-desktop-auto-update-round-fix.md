# PR #909 라운드 fix 구현 계획

> **작업자용:** 이 계획은 TDD와 RED/GREEN/mutation RED 및 실제 updater 주입 라이브 QA를 순서대로 실행한다. 커밋은 개발책임자 지정대로 PM이 수행한다.

**목표:** updater 오류 원문을 사용자에게 숨기고, 데스크톱 기동 시 업데이트 확인·자동 설치·재시작을 로그인보다 먼저 수행한다.

**구조:** 메인 프로세스가 오류 상세를 로그에만 기록하고 안전한 상태 문구를 IPC로 보낸다. 렌더러 `AppVersionGate`는 `AppRouter` children을 감싸 기동 상태를 관리하며, 초기 updater run에서만 자동 설치한다. timeout 뒤 일반 수준은 로그인과 다운로드를 분리하고, CRITICAL은 차단 모달을 유지한다.

**기술:** Electron 33, electron-updater 6.8.9, React 18, TypeScript, Vitest, Playwright, PowerShell/Docker PostgreSQL.

## 전역 제약

- 작업 디렉터리는 `C:\dev\Samhan-Public\.claude\worktrees\autoupdate`만 사용한다.
- 포트 5200, API 게이트웨이 8080, `dashboard_db`만 사용한다.
- BE `/app/version`, 게이트웨이 라우트, admin CRUD, forceLevel 계약은 변경하지 않는다.
- 코드사이닝·설치본 빌드는 실행하지 않는다.
- 모든 사용자 문구·보고·문서는 한국어로 작성한다.
- 원문 오류는 로그에만 남기고 렌더러 텍스트·스크린샷·상태 메시지에는 URL/경로/header/body를 포함하지 않는다.
- 확인 timeout 30,000ms, 다운로드 timeout 180,000ms.
- 상한 초과는 일반 수준에서 로그인 fail-open하고 진행 중 updater 다운로드는 유지한다. CRITICAL은 차단한다.

## 변경 파일 지도

- `clients/desktop/src/main/auto-update.ts`: 오류 로그/안전 문구, 설치 오류 경계, 앱 종료 IPC.
- `clients/desktop/src/main/auto-update.test.ts`: 오류 원문 비노출·설치 실패·종료 IPC 회귀.
- `clients/desktop/src/preload/index.ts`: 종료 IPC 브리지.
- `clients/desktop/src/renderer/types/electron.d.ts`: 종료 API 타입.
- `clients/desktop/src/renderer/version/desktopUpdatePolicy.ts`: 자동 설치 계약과 안전 오류 문구/timeout 상수.
- `clients/desktop/src/renderer/version/desktopUpdatePolicy.test.ts`: 정책·문구·`canInstall` 회귀.
- `clients/desktop/src/renderer/components/common/AppVersionGate.tsx`: 기동 gate, 상한, 자동 install, fail-open, CRITICAL 안내.
- `clients/desktop/src/renderer/components/common/AppVersionGate.test.tsx`: 실제 React effect와 injected updater 상태 전이.
- `clients/desktop/src/renderer/App.tsx`: router를 gate children으로 이동.
- `clients/desktop/playwright/909-auto-update-real-qa/luna-round-real-qa.spec.ts`: 5개 실 QA 경로와 스크린샷.
- `docs/dev-reports/2026-07-23-desktop-auto-update.md`: 이번 라운드 RED/GREEN/mutation/live 결과 누적.
- `docs/qa/909-luna-round-2026-07-23/`: 라이브 스크린샷과 SQL 확증 산출물.

## 실행 순서

1. 기존 테스트를 읽고 새 테스트를 먼저 작성한다.
2. 오류 원문 노출 RED를 실행해 터미널 원문을 보존한다.
3. 자동 기동 gate RED를 실행해 login 선렌더·자동 install 누락·timeout 미해제를 보존한다.
4. 메인 오류 경계와 렌더러 gate를 최소 변경으로 구현한다.
5. 관련 Vitest GREEN → 전체 Desktop Vitest → typecheck 순으로 실행한다.
6. 안전 처리와 gate를 임시 mutation해 각각 RED를 확보하고 원복한다.
7. 포트 5200에서 실 렌더러를 띄우고, 실 API 로그인·throwaway release·init-script updater로 5개 경로를 실행한다.
8. DB 정리 후 SQL로 DESKTOP 잔재 0건을 확증하고, mock Playwright 전체 회귀를 끝까지 실행한다.
