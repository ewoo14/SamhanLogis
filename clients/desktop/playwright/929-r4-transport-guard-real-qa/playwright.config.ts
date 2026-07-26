/**
 * #929 재수렴 4차 실 서버 QA 설정 — 렌더러 5920, 게이트웨이 8080, mock OFF.
 *
 * <p>기본 mock Playwright 설정과 분리해(디렉토리 `-real-qa` 접미사) 실 QA 스펙이 자동
 * 회귀 스위트에 섞이지 않게 한다. 스크린샷은 {@code resolveQaShotsDir} 기본값
 * (`docs/qa/<slug>/_local/`, .gitignore 대상)으로 나가므로 커밋된 캡처를 덮어쓰지 않는다.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5920',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
  }],
})
