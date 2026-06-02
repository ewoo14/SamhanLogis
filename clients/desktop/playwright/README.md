# Desktop Playwright opt-out 컨벤션

`clients/desktop/playwright/**`의 mock 회귀 스펙은 CI hard gate에서 자동 실행된다. 기본 webServer가 `VITE_MOCK_MODE=1`로 Vite를 기동하므로, `mockRole=MASTER` 등 mock 기반 스펙은 별도 allowlist 없이 `npx playwright test` 대상에 포함된다.

실서버, 실QA, 수동 캡처 전용 스펙은 반드시 아래 컨벤션 중 하나를 사용한다.

- `playwright/manual/` 디렉토리
- `playwright/full-qa/` 디렉토리
- `playwright/audit/` 디렉토리
- `playwright/phase-2-4-real-qa/` 디렉토리
- `*-real-qa.spec.ts` 파일명
- `playwright/full-menu-contract/` 디렉토리 — 레거시 GAS 소스(`tools/legacy-gas/**`) 의존, mock 회귀 아님(소스 부재 시 미수집)

위 컨벤션을 사용한 스펙만 CI mock 회귀 게이트에서 제외된다. 신규 mock 스펙은 자동 게이트되므로 PR 전 로컬에서 `PLAYWRIGHT_SKIP_WEB_SERVER` 없이 `npx playwright test`로 green을 확인한다.

allowlist 방식은 금지한다. allowlist는 신규 mock 스펙을 CI에서 누락시키는 false-green을 만들 수 있으므로, 이 프로젝트는 명시적으로 제외할 실QA/수동 스펙만 opt-out 하는 방식을 사용한다.
