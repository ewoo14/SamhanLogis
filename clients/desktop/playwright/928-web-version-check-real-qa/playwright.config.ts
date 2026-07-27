import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURRENT_VERSION } from './current-version'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(configDir, '../../../..')
const orderAppApiBaseUrl = process.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080/api/v1'
/**
 * 🚨 [R3-1 fix] 의도적으로 process.env['VITE_APP_VERSION']을 읽지 않는다.
 *
 * 이전에는 `process.env['VITE_APP_VERSION'] ?? '2026/07/26-92700'`였다 — `??`는 변수가
 * "없을 때만" 핀 값을 적용하므로, 호출한 셸에 그 변수가 설정돼 있으면(예: 937 계열
 * real-QA 스펙이 요구하는 `VITE_APP_VERSION=2026/07/27-1`을 같은 세션에서 먼저 실행한 뒤
 * 이어서 928을 돌리는 경우) 앰비언트 값이 조용히 이 하네스의 빌드 버전을 갈아치웠다.
 * order-app은 이 값을 빌드타임에 번들에 굽고(vite.config.ts:28) 런타임에 자신의
 * "현재 버전"으로 백엔드에 조회하므로, 스펙(928-...-real-qa.spec.ts)의 CURRENT_VERSION과
 * 실제 빌드 버전이 어긋나면 버전 안내 UI가 뜨지 않는 채로 실패한다 — 이때도 스펙이 직접
 * 조회하는 API 판정은 CURRENT_VERSION 기준으로 고정돼 있어 정상으로 보이기 때문에
 * 하네스 설정 문제가 제품 결함처럼 읽힌다.
 *
 * 이제 이 값은 스펙과 공유하는 단일 진실원(./current-version)에서만 나오고, 호출한 셸의
 * VITE_APP_VERSION으로는 바뀌지 않는다. 다른 real-QA 스펙(937 계열 등)이 자기 실행 경로에서
 * VITE_APP_VERSION을 직접 읽는 것은 이 config와 무관하므로 그대로 유지된다.
 */
const orderAppVersion = CURRENT_VERSION
const orderAppWebServerEnv: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  ),
  VITE_API_BASE_URL: orderAppApiBaseUrl,
  VITE_APP_VERSION: orderAppVersion,
}

export default defineConfig({
  testDir: configDir,
  testMatch: ['**/*-real-qa.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5181',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  timeout: 60000,
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5181 --strictPort',
    cwd: path.join(repoRoot, 'clients/web/order-app'),
    env: orderAppWebServerEnv,
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
