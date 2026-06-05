---
name: feedback_playwright_local_version_skew
description: 로컬 Playwright npx 전역 vs 설치본 skew로 "did not expect test.describe()" — 로컬 bin 직접 호출 / npm ci
metadata:
  type: feedback
---

`clients/desktop` 에서 `npx playwright test` 가 **"Playwright Test did not expect test.describe() to be called here / two different versions"** 에러를 내면, `npx` 가 **전역 캐시 버전**(예 1.60.0)을 끌어와 runner↔설치본(@playwright/test 1.59.1) 버전이 어긋난 것(코드 버그 아님).

**How to apply**:
- **로컬 bin 직접 호출**: `Push-Location clients/desktop; node_modules\.bin\playwright.cmd test <spec> --reporter=line` (desktop cwd 필수 — playwright.config.ts·testDir 위치).
- 또는 `cd clients/desktop; npm ci`(desktop 에 **package-lock.json 추적됨**) 로 trio(@playwright/test·playwright·playwright-core) 정렬. ⚠️ `clients/desktop/package-lock.json` 은 **추적 파일** — stray 로 오인해 삭제 금지.
- PowerShell 진행표시(ANSI `[1A[2K`)가 stderr 로 나와 `NativeCommandError` 처럼 보여도 실패 아님 — 마지막 `N passed` 줄로 판정.
- repo 루트 `package-lock.json` 은 stray(루트 package.json 없음).

관련: [[feedback_desktop_typecheck_command]], [[feedback_testcontainers_windows_docker]].
