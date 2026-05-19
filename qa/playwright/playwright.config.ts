import { defineConfig, devices } from '@playwright/test';

/**
 * SamhanLogis Phase 7 QA — Playwright config
 *
 * 5 project:
 *  - web-order-app      : Vite dev server, port 5184, 거래처 주문서 v4
 *  - web-estimate-app   : Express EJS, port 5183, 종합견적서 v2
 *  - electron-desktop   : electron-vite build, packaged binary 또는 dev
 *  - mobile-chrome      : Pixel 7 viewport, mobile-staff WebView 시나리오
 *  - mobile-safari      : iPhone 14 viewport, mobile-staff WebView 시나리오
 *
 * 환경 변수:
 *  - QA_ORDER_APP_URL    (기본 http://localhost:5184)
 *  - QA_ESTIMATE_APP_URL (기본 http://localhost:5183)
 *  - QA_API_BASE_URL     (기본 http://localhost:8080)
 *  - QA_ELECTRON_PATH    (electron 실행 파일 경로, 미설정 시 electron project skip)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list'], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    // 시각적 회귀 baseline (Phase 7 2차 Designer)
    // 3 project (mobile-chrome / mobile-safari / electron-desktop) 별 baseline 별도.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  use: {
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'web-order-app',
      // Phase 7 3차 정정 — desktop 은 tutorial-mobile.spec.ts 제외, tutorial-pc/staff/state 만.
      // mobile-chrome / mobile-safari 의 testMatch 와 직교성 보장 (tutorial-mobile 은 mobile 만).
      // Phase 7 종합 TM 보강 — tutorial-mobile 은 mobile project 전담, tutorial-staff/state 는
      // PC + mobile 양쪽 실행하여 역할 (영업원/창고/Stateful 흐름) 직교성을 양 viewport 에서 검증.
      testMatch: [
        /.*\/(auth|catalog|draft|confirm|history|dc|stock|edge|visual)\/.*\.spec\.ts/,
        /.*\/tutorial\/tutorial-(pc|staff|state)\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_ORDER_APP_URL ?? 'http://localhost:5184',
      },
    },
    {
      name: 'web-estimate-app',
      // Phase 7 3차 정정 — desktop 은 tutorial-pc/staff/state 만 (estimate 는 tutorial-state 도 포함).
      testMatch: [
        /.*\/(auth|catalog|draft|confirm|history|dc|edge|visual)\/.*\.spec\.ts/,
        /.*\/tutorial\/tutorial-(pc|staff|state)\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_ESTIMATE_APP_URL ?? 'http://localhost:5183',
      },
    },
    {
      name: 'electron-desktop',
      // tutorial 은 PC 전용 spec 만 (tutorial-pc.spec.ts)
      testMatch: [
        /.*\/(auth|catalog|confirm|stock|visual)\/.*\.spec\.ts/,
        /.*\/tutorial\/tutorial-pc\.spec\.ts/,
      ],
      use: {
        baseURL: process.env.QA_ORDER_APP_URL ?? 'http://localhost:5184',
      },
    },
    {
      name: 'mobile-chrome',
      // mobile 은 PC 전용 (tutorial-pc.spec.ts) 제외 — 명시적 mobile/staff/state 시나리오만
      testMatch: [
        /.*\/(auth|catalog|draft|confirm|visual)\/.*\.spec\.ts/,
        /.*\/tutorial\/tutorial-(mobile|staff|state)\.spec\.ts/,
      ],
      use: {
        ...devices['Pixel 7'],
        baseURL: process.env.QA_ORDER_APP_URL ?? 'http://localhost:5184',
      },
    },
    {
      name: 'mobile-safari',
      testMatch: [
        /.*\/(auth|catalog|draft|confirm|visual)\/.*\.spec\.ts/,
        /.*\/tutorial\/tutorial-(mobile|staff|state)\.spec\.ts/,
      ],
      use: {
        ...devices['iPhone 14'],
        baseURL: process.env.QA_ORDER_APP_URL ?? 'http://localhost:5184',
      },
    },
    {
      // Phase 10 Step 8 — 9 슬라이스 통합 PR smoke
      // (P0-2/P0-4/P0-5/P1-5/P1-8/P2-1/P2-4/P2-6 + 인쇄 5건 — 시나리오 ~160 case)
      // 본 project 는 typecheck + backend health gate + spec inventory 검증만 수행.
      // 실제 case 별 spec 은 후속 DevOps PR 에서 점진 추가.
      name: 'nine-slice-smoke',
      testMatch: [/.*\/nine-slice\/.*\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_DESKTOP_URL ?? 'http://localhost:5173',
      },
    },
    {
      // SP-10-2 — 인성데이타 퀵프로그램 vendor 통합 QA (W10-2)
      // 6 case: mock 회귀 / sandbox fail-soft / 알림톡 채널 분리 / GPS 우선순위 / webhook 전이 / 사이드바 변동 0
      // BE 완료 전: page.route() mock 기반 FE 단독 검증
      // BE 완료 후: QA_AROLOGIS_URL 실 서버 연동으로 점진 확장
      name: 'arologis-sp-10-2',
      testMatch: [/.*\/arologis\/sp-10-2-insung-quick-vendor\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_AROLOGIS_URL ?? 'http://localhost:5173',
      },
    },
    {
      // Signature Slice C — 공개 서명 번들 smoke 검증 (audit cycle 1 QA 결과)
      // 10 case: BE API 계약(mock) / UUID 0건 / PNG 50KB 경계 / Web Crypto SHA-256
      //   + FE 번들 미구현 fixme 4건 (false green 불허)
      //
      // FE 미구현 상태:
      //   - signature.js (≤6KB gzip) 미존재
      //   - mobile.css canvas 클래스 추가분 미존재
      //   - /d/{token}/s/{slipNo} HTML 서빙 미구현
      //   - /share/{shareToken} HTML 서빙 미구현
      //
      // FE 구현 후: QA_SIGNATURE_URL 을 sign.samhan-air.com 또는 localhost:포트로 지정
      //   fixme 해제 + 실 navigate 검증으로 전환
      //
      // BE 구현 완료 (slip-service):
      //   POST /public/batches/{token}/slips/{slipNo}/signature  (SHA-256 + 50KB 가드)
      //   GET  /public/signatures/{shareToken}                   (UUID 미포함)
      //   PublicSignatureControllerIT 8 시나리오 커버
      name: 'signature-c-smoke',
      testMatch: [/.*\/signature-c\/signature-c-smoke\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_SIGNATURE_URL ?? process.env.QA_API_BASE_URL ?? 'http://localhost:8080',
      },
    },
  ],

  outputDir: 'test-results/',
});
