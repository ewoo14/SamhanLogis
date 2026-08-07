# #1101 S6 소비처 자격 연결 수정 계획

> **For agentic workers:** 이 계획은 현재 세션에서 순차 실행한다. 각 단계는 테스트와 정적 전수 확인으로 검증한다.

**Goal:** `infrastructure/.env.local`의 표준 QA 자격 키가 Node·Playwright·PowerShell 실행 경로에 자동 전달되고, 누락 시 조치 가능한 오류를 내도록 한다.

**Architecture:** 저장소 루트의 `infrastructure/.env.local`을 읽는 Node 공용 로더와 PowerShell 대응 로더를 둔다. 표준 환경변수를 우선하고, 파일 값을 두 번째로 사용하며, 호환 alias는 마지막 입력으로만 허용한다. 실행 파일의 빈 문자열 fallback을 로더 호출로 치환하고 k6는 `__ENV`만 사용한다.

**Tech Stack:** Node.js CommonJS/ESM, TypeScript Playwright, PowerShell, k6 JavaScript, Bash guard.

## Global Constraints

- Docker·서비스 재기동·재빌드·커밋·푸시는 하지 않는다.
- `infrastructure/.env.local` 실물은 git에 추가하지 않는다.
- 평문 자격은 로그·JSON·보고서에 기록하지 않는다.
- `.gitguardian.yaml`은 수정하지 않는다.
- 표준 키는 `QA_DEV_DEFAULT_PASSWORD`, 역할별 `QA_*_PASSWORD`, k6는 `LOADTEST_PASSWORD`다.

---

### Task 1: 공용 로더 계약

**Files:**
- Create: `scripts/lib/qa-credentials.cjs`
- Create: `scripts/lib/qa-credentials.d.cts`
- Test: `scripts/lib/qa-credentials.test.cjs`

- [ ] 표준 환경변수·`.env.local`·alias 우선순위와 누락 오류를 검증하는 실패 테스트를 작성한다.
- [ ] 테스트가 로더 미구현으로 실패하는지 확인한다.
- [ ] 값은 절대 출력하지 않고, 누락 시 파일 경로와 키 이름만 포함한 오류를 구현한다.
- [ ] 테스트를 통과시킨다.

### Task 2: Node/Playwright/desktop 소비처 일괄 연결

**Files:**
- Modify: `clients/desktop/playwright/**/*.ts`, `clients/desktop/playwright/**/*.mjs`, `clients/desktop/qa-*.mjs`, `clients/desktop/scripts/**/*.cjs`, `scripts/verify-ds4-real-qa-cleanup.cjs`

- [ ] 기존 `DEV_PASSWORD`·`QA_PASSWORD`·빈 문자열 fallback을 `resolveQaCredential()` 호출로 치환하고 파일별 상대 import를 추가한다.
- [ ] 표준 역할 키가 필요한 소비처는 해당 `QA_*_PASSWORD`를 명시한다.
- [ ] 대표 Node QA를 `.env.local`만 사용해 실행하고 로그인 HTTP 200 원문을 확보한다.

### Task 3: PowerShell·k6 진입점

**Files:**
- Create: `scripts/lib/qa-credentials.ps1`
- Modify: `tools/operational-validation/run-smoke-tests.ps1`, `tools/operational-validation/import-notion-csv.ps1`, `scripts/run-load-test.ps1`, `perf/k6/mixed-load.js`

- [ ] PowerShell 로더를 dot-source하고 표준 키를 파일에서 주입한다.
- [ ] k6에서 `process.env`를 제거하고 `__ENV.LOADTEST_PASSWORD` 누락 시 명시적으로 중단한다.
- [ ] k6 미설치 사실과 실제 실행 불가를 보고서에 명시한다.

### Task 4: 회귀 검증 및 보고서

**Files:**
- Modify: all consumer files above
- Create: `docs/dev-reports/2026-08-07-1101-s6-consumer-wiring-fix.md`

- [ ] 정적 소비처 전수 분류가 201개 실행 파일을 설명하는지 확인한다.
- [ ] 대표 스크립트, credential guard, Gradle 두 서비스 테스트, desktop TypeScript 검증을 실행한다.
- [ ] 네 RED 실행 원문, 대표 로그인 200, k6 미검증, 남은 차단, 새 파일 목록을 평문 없이 기록한다.
- [ ] 변경 파일을 스테이징하되 커밋하지 않는다.
