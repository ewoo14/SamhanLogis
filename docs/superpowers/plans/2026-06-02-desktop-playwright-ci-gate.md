# desktop Playwright CI hard gate — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 체크박스(`- [ ]`)로 추적.
>
> **🚨 구현 = Codex 디스패치**([[feedback_codex_implements_claude_reviews]]). 본 계획 코드 블록은 명세. PR 은 1차 push 직후 조기 발행([[feedback_open_pr_early]]) — 트리아지는 열린 PR 의 CI 로 발견·수렴.

**Goal:** `clients/desktop/playwright/**` mock 회귀 스펙을 CI hard gate 로 실행(opt-out 컨벤션, 신규 자동 커버).

**Architecture:** Playwright config 에 testIgnore(실QA/manual 제외) + 크로스플랫폼 webServer(env) + CI workers. `qa-e2e.yml` 에 `desktop-playwright` 잡 추가(실패=CI fail + silent-skip 가드). 제외 외 스펙은 조기 PR CI 로 전수 실행해 분류.

**Tech Stack:** Playwright, GitHub Actions, vite(VITE_MOCK_MODE), Node 20.

**Spec:** `docs/superpowers/specs/2026-06-02-desktop-playwright-ci-gate-design.md`

---

## Task 1: playwright.config.ts — testIgnore + 크로스플랫폼 webServer + workers

**Files:** Modify `clients/desktop/playwright.config.ts`

- [ ] **Step 1: testIgnore + workers + webServer env 반영**

`defineConfig({...})` 를 다음으로 갱신(기존 구조 유지, 변경점만):
```ts
export default defineConfig({
  testDir: './playwright',
  // opt-out 컨벤션: 실서버/실QA·수동 캡처 전용 스펙 제외(나머지 mock 회귀는 자동 게이트)
  testIgnore: [
    '**/manual/**',
    '**/full-qa/**',
    '**/audit/**',
    '**/phase-2-4-real-qa/**',
    '**/*-real-qa.spec.ts',
  ],
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 1,
  reporter: process.env['CI']
    ? [['line'], ['json', { outputFile: 'playwright-report/results.json' }], ['html', { open: 'never' }]]
    : [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['PLAYWRIGHT_SKIP_WEB_SERVER'] === '1'
    ? undefined
    : {
        command: 'npx vite src/renderer --host 127.0.0.1 --port 5173',
        env: { VITE_MOCK_MODE: '1' },
        url: 'http://127.0.0.1:5173/',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
})
```
> `set VITE_MOCK_MODE=1&&`(Windows cmd 전용) 제거 → `env` 옵션으로 크로스플랫폼. 로컬 Windows 수동 실행도 `env` 로 동일 동작.

- [ ] **Step 2: 로컬 dry 확인**

Run: `cd clients/desktop && npx playwright test --list 2>&1 | tail -5`
Expected: testIgnore 적용되어 manual/full-qa/audit/*-real-qa 제외된 스펙 목록 출력(0 아님).

- [ ] **Step 3: 커밋** (Claude 대행)
```bash
git add clients/desktop/playwright.config.ts
git commit -m "ci(desktop): Playwright testIgnore(opt-out) + 크로스플랫폼 webServer + CI workers"
```

---

## Task 2: opt-out 컨벤션 문서 (README)

**Files:** Create `clients/desktop/playwright/README.md`

- [ ] **Step 1: 컨벤션 명문화**

내용: ① mock 회귀 스펙(VITE_MOCK_MODE, `mockRole=MASTER`)은 CI hard gate 자동 실행 ② 실서버/실QA·수동 캡처 스펙은 **반드시** `manual/` 디렉토리 또는 `*-real-qa.spec.ts` 네이밍(또는 full-qa/audit) — 그래야 CI 에서 제외됨 ③ 신규 mock 스펙은 자동 게이트되므로 로컬 `PLAYWRIGHT_SKIP_WEB_SERVER` 없이 `npx playwright test` 로 green 확인 후 PR ④ allowlist 금지 사유([[feedback_ci_test_filter_false_green]]).

- [ ] **Step 2: 커밋**
```bash
git add clients/desktop/playwright/README.md
git commit -m "docs(desktop): Playwright opt-out 컨벤션 README"
```

---

## Task 3: qa-e2e.yml — desktop-playwright 잡 + silent-skip 가드

**Files:** Modify `.github/workflows/qa-e2e.yml` (jobs 에 추가)

- [ ] **Step 1: 잡 추가**

`jobs:` 아래 신규(기존 `playwright`/`detox-android` 형식 준수):
```yaml
  desktop-playwright:
    name: Desktop Playwright (mock 회귀 hard gate)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: clients/desktop/package-lock.json
      - name: 의존성 설치
        working-directory: clients/desktop
        run: npm ci
      - name: Playwright 브라우저 설치
        working-directory: clients/desktop
        run: npx playwright install --with-deps chromium
      - name: Playwright 실행 (mock 회귀 hard gate — 실패 시 CI fail)
        working-directory: clients/desktop
        run: npx playwright test
      - name: silent-skip 가드 (false-green 2차 방어)
        if: always()
        working-directory: clients/desktop
        run: node scripts/assert-playwright-ran.mjs
      - name: 리포트 업로드
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: desktop-playwright-report
          path: clients/desktop/playwright-report/
          retention-days: 7
```
> `npx playwright test` 에 `|| true` 절대 금지(hard gate). webServer 가 자동으로 VITE_MOCK_MODE vite 기동.

- [ ] **Step 2: silent-skip 가드 스크립트**

Create `clients/desktop/scripts/assert-playwright-ran.mjs`:
```js
// false-green 2차 방어: 실제 실행 건수 검증. results.json 의 stats 로
// expected(통과)>0 && skipped==0 아니면 비정상 종료(1).
import { readFileSync } from 'node:fs'
const path = 'playwright-report/results.json'
let stats
try {
  stats = JSON.parse(readFileSync(path, 'utf8')).stats
} catch (e) {
  console.error('[guard] results.json 없음 — 테스트 미실행 의심:', e.message)
  process.exit(1)
}
const { expected = 0, unexpected = 0, skipped = 0, flaky = 0 } = stats
console.log(`[guard] expected=${expected} unexpected=${unexpected} skipped=${skipped} flaky=${flaky}`)
if (expected === 0) { console.error('[guard] 통과 테스트 0 — 미실행/전량 skip false-green'); process.exit(1) }
if (skipped > 0) { console.error(`[guard] skipped=${skipped} > 0 — 조건부 skip false-green 차단`); process.exit(1) }
process.exit(0)
```
> hard gate 라 `unexpected>0` 이면 이미 `playwright test` 단계에서 CI fail. 본 가드는 "0건 실행/전량 skip" 위장만 추가 차단.

- [ ] **Step 3: 커밋**
```bash
git add .github/workflows/qa-e2e.yml clients/desktop/scripts/assert-playwright-ran.mjs
git commit -m "ci(qa-e2e): desktop-playwright mock 회귀 hard gate 잡 + silent-skip 가드"
```

---

## Task 4: 조기 PR + 트리아지 (반복, CI 발견)

**전제:** Task 1~3 push 직후 PR 발행([[feedback_open_pr_early]]). CI `desktop-playwright` 가 testIgnore 제외분을 전수 실행 → 실패 노출.

- [ ] **Step 1: PR 발행** (1차 push 직후)
- [ ] **Step 2: CI 실패 전수 분류** (CI 로그 기준)
  - PASS → 무작업(게이트 편입).
  - **실서버 필요(mock 불가)** → `manual/` 이동 또는 `*-real-qa.spec.ts` 개명. 사유 PR 코멘트.
  - **실 버그/노후 스펙** → 수정(Codex).
  - **범위 외 대량 결함** → 투명 격리: 개별 `test.skip(true, '사유 — 추적: 3-A2')` + dev-report 추적목록(D-3A2-03). 사이클 3 내 미해소분 한정.
- [ ] **Step 3: skipped==0 가드 충족 확인** — 격리(test.skip)가 있으면 가드의 `skipped>0` 차단과 충돌. **격리 스펙은 testIgnore(개명/이동)로 빼거나 `test.fixme` 대신 파일 단위 제외**로 처리해 가드의 skipped 집계에서 빠지게 한다(조건부 skip 위장만 차단하는 가드 취지 유지). dev-report 에 제외분 명시.
- [ ] **Step 4: 반복** — CI green(제외분 전수 PASS + 가드 통과)까지.

---

## Task 5: hard gate 실증 + 문서

- [ ] **Step 1: hard gate 실증** — mock 스펙 1개에 의도적 실패 단언 임시 주입 push → CI `desktop-playwright` **fail** 확인 → 원복 push → green. (PR 코멘트에 fail/green 링크 증빙.)
- [ ] **Step 2: dev-report** `docs/dev-reports/slice-3-a2-desktop-playwright-ci-gate.md` — 게이트 구조 + 제외/격리 추적목록 + 트리아지 결과 통계.
- [ ] **Step 3: DECISIONS D-3A2-01~03 + CURRENT-WORK 동기화.**
- [ ] **Step 4: 커밋.**

---

## 자가 검토
- **Spec 커버리지**: §3.1 testIgnore→T1, §3.2 webServer→T1, §3.3 workers→T1, §3.4 CI잡→T3, §3.5 가드→T3, §3.6 트리아지→T4, §4 실증→T5, 컨벤션 문서→T2. ✅
- **Placeholder**: 없음(코드 전량 기재). 트리아지 결과는 본질적으로 CI 발견(조기 PR 설계). ✅
- **일관성**: silent-skip 가드의 `skipped>0` 차단(T3) ↔ 격리 처리(T4 Step3) 충돌을 명시 해소(격리=파일 제외, 가드=조건부 skip 차단). ✅
