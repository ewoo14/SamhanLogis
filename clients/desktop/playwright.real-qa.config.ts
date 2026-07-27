/**
 * playwright.real-qa.config.ts
 *
 * 실서버 QA 전용 Playwright 설정 — repo 공유 하네스(전체 real-QA 스펙 대상).
 * testIgnore 없이 *-real-qa.spec.ts 파일을 직접 실행한다.
 *
 * 🚨 [SONNET5 R3 HIGH-2 fix] R2 가 testMatch 를 이 슬라이스 스펙 1개로 좁혀 repo 전체
 * real-QA 스펙(172개 파일 · 548개 테스트, 2026-07-27 실측)을 무력화했었다(공유 하네스를
 * 슬라이스 전용으로 오염). testMatch 는 다시 repo 전체 *-real-qa.spec.ts 를 대상으로
 * 원복한다. 슬라이스 단위 격리가 필요하면(서로 다른 외부 상태/전제 혼입 방지) testMatch 를
 * 좁히지 말고 아래처럼 CLI 인자로 파일을 지정한다 — Playwright 는 CLI 경로 인자를
 * testMatch 의 교집합(추가 필터)으로만 적용하므로 testMatch 를 그대로 두고도 특정
 * 슬라이스만 골라 실행할 수 있다.
 *
 * 🚨 [#851 R1 fix] 상대경로 page.goto('/…')를 쓰는 스펙은 baseURL 없이는
 * "Cannot navigate to invalid URL"로 실행 자체가 안 된다 — 대상은 897 · 928 · 929-r4
 * 3개다(929-r5 는 자체 QA_BASE_URL 로 절대 URL 을 조립해 원래부터 이 문제와 무관 —
 * 929-r5-route-collision-real-qa.spec.ts:30-39 참고). 그런데 이 3개가 전부 같은 앱을
 * 쓰는 게 아니다 — 897 · 929-r4 는 데스크톱 렌더러(HashRouter `/#/...`)이지만 928 은
 * 완전히 다른 Vite 앱인 주문 웹 order-app(BrowserRouter `/`, clients/web/order-app)
 * 이다. 하나의 전역 baseURL 로는 이 둘을 동시에 만족시킬 수 없어(렌더러를 가리키면
 * 928 이 엉뚱한 앱의 DOM 을 로드해 콘텐츠 단언에서야 실패하고, order-app 을 가리키면
 * 897 · 929-r4 가 깨진다) 아래 projects 로 928 만 별도 오리진 프로젝트로 분리한다.
 *
 * 🚨 [#851 R1 fix] 오리진 override 환경변수 이름도 새로 만든다 — `AUDIT_BASE_URL` ·
 * `QA_BASE_URL` 은 이미 real-QA 스펙 148개가 "자기 오리진" 기본값으로 스펙 코드 안에서
 * 직접 읽고 있고(그중 106개는 기본 오리진이 5175 가 아니다). 이 두 이름을 이 공유
 * config 의 override 로 재사용하면, 이 config 로 배치 실행할 때 그 스펙들이 자체적으로
 * 읽는 오리진까지 함께 끌려간다 — 예컨대 928 을 맞추려고 QA_BASE_URL=5181 을 export 하면
 * 937-* · 929-r6 · 924 · 920-* · 902-* · 809-* 등 QA_BASE_URL 을 직접 읽는 다른 스펙도
 * 전부 5181 로 끌려가 깨진다. 그래서 이 파일 전용의 새 이름
 * (`REAL_QA_RENDERER_BASE_URL` / `REAL_QA_ORDER_APP_BASE_URL`)을 쓴다.
 *
 * 사용:
 *   cd clients/desktop
 *   # 전체 real-QA 스펙(172개 파일 · 548개 테스트) 실행 — 데스크톱 렌더러(:5175)를 먼저 띄울 것.
 *   # 928 도 포함해 전부 통과시키려면 order-app(:5181, clients/web/order-app)도 함께 띄운다.
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000
 *   # 이 슬라이스(#825 슬5)만 격리 실행:
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line --timeout=60000 `
 *     playwright/825-s5-null-semantics-real-qa/825-s5-null-semantics-real-qa.spec.ts
 */
import { defineConfig, devices } from '@playwright/test'

/**
 * 배치 실행 기본 오리진 — 데스크톱 렌더러(HashRouter). repo 대다수 real-QA 스펙의 목표이며
 * `vite.renderer.dev.config.ts` 정본 포트(5175)와 같다.
 */
const RENDERER_BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'

/**
 * 928(주문 웹 order-app) 전용 오리진 — 데스크톱 렌더러와 다른 Vite 앱이라 위 기본값을
 * 그대로 쓰면 안 된다(R1-1). 기본값은 928 정본
 * playwright/928-web-version-check-real-qa/playwright.config.ts 의 QA_BASE_URL
 * 기본값과 같은 포트(5181).
 */
const ORDER_APP_BASE_URL = process.env['REAL_QA_ORDER_APP_BASE_URL'] ?? 'http://127.0.0.1:5181'

/** order-app 전용 프로젝트가 가져갈 스펙 — 이 글롭에 걸리는 파일은 렌더러 프로젝트에서 제외한다. */
const ORDER_APP_TEST_MATCH = ['928-web-version-check-real-qa/**/*-real-qa.spec.ts']

export default defineConfig({
  testDir: './playwright',
  testMatch: ['**/*-real-qa.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
  projects: [
    {
      // 928 전용 — 주문 웹(order-app) 오리진. testMatch 를 명시해 이 글롭만 가져간다.
      name: 'order-app',
      testMatch: ORDER_APP_TEST_MATCH,
      use: { baseURL: ORDER_APP_BASE_URL },
    },
    {
      // 나머지 전부 — 데스크톱 렌더러 오리진. 최상위 testMatch(전체)를 상속하고
      // order-app 글롭만 testIgnore 로 제외해 위 프로젝트와 겹치지 않는다.
      name: 'renderer',
      testIgnore: ORDER_APP_TEST_MATCH,
      use: { baseURL: RENDERER_BASE_URL },
    },
  ],
})
