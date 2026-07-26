/**
 * PR #910 U-gate — 모바일 3앱 실 Expo-web 렌더 캡처.
 *
 * `expo start --web`(react-native-web, 실 앱 소스코드)로 각 앱을 브라우저 타깃으로 띄우고,
 * 실 게이트웨이(:8080)·실 dashboard-service 버전 정책을 그대로 조회한 결과를 캡처한다.
 * 판정의 권위는 스크린샷이 아니라 각 앱이 실제로 호출한 `/app/version` 네트워크 응답이다.
 *
 * 전제:
 *   - arologis-mobile: http://localhost:19010 (EXPO_PUBLIC_API_BASE_URL=http://localhost:8080)
 *   - mobile:          http://localhost:19011 (EXPO_PUBLIC_API_BASE_URL=http://localhost:8080)
 *   - mobile-staff:    http://localhost:19012 (EXPO_PUBLIC_API_BASE_URL=http://localhost:8080)
 *   - AROLOGIS_MOBILE 은 이미 CRITICAL(2026/07/25-9801) 로 배포되어 있어야 한다(U-gate 1 선행).
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const SHOT_DIR = resolveQaShotsDir(process.env['AUDIT_SHOT_DIR']
  ?? join(process.cwd(), '..', '..', 'docs', 'qa', '910-app-client-identity'))

test.use({ viewport: { width: 430, height: 932 } })

test.beforeAll(() => {
  mkdirSync(SHOT_DIR, { recursive: true })
})

async function captureVersionCheck(
  page: Page,
  url: string,
  expectedClientType: string,
): Promise<{ status: number; body: unknown }> {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/app/version') && res.url().includes(`clientType=${expectedClientType}`),
    { timeout: 60_000 },
  )
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  const response = await responsePromise
  const status = response.status()
  const body = await response.json().catch(() => null)
  return { status, body }
}

test.describe('U-gate 3 — 모바일 3앱 실 렌더 (expo web)', () => {
  test.setTimeout(120_000)

  test('아로로지스 모바일 — CRITICAL 로 차단 안내를 받는다', async ({ page }) => {
    const { status, body } = await captureVersionCheck(page, 'http://localhost:19010/', 'AROLOGIS_MOBILE')
    console.log('■ arologis-mobile /app/version 응답:', status, JSON.stringify(body))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((body as any)?.data?.forceLevel).toBe('CRITICAL')

    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(SHOT_DIR, '09-아로로지스모바일-CRITICAL차단-안내.png') })
    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log('■ arologis-mobile 화면 텍스트:', bodyText.slice(0, 300))
    expect(bodyText).toContain('업데이트 필요')
    expect(bodyText).toContain('더 이상 사용할 수 없습니다')
  })

  test('삼한 모바일 — 영향 없음(비차단, 정상 통과)', async ({ page }) => {
    const { status, body } = await captureVersionCheck(page, 'http://localhost:19011/', 'SAMHAN_MOBILE')
    console.log('■ mobile(삼한 모바일) /app/version 응답:', status, JSON.stringify(body))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forceLevel = (body as any)?.data?.forceLevel
    // 실 Expo dev 클라이언트는 release-build 미주입 시 고정 sentinel "0.1.0-dev"를 보낸다
    // (scripts/app-build-version.cjs DEVELOPMENT_FALLBACK_VERSION). dev-format latestVersion은
    // 설계상 legacy semver보다 항상 "이후"로 비교되므로 NONE은 나올 수 없고, 등록된 forceLevel이
    // 그대로 나온다 — 핵심은 CRITICAL(차단)이 아니라는 것: AROLOGIS_MOBILE 의 CRITICAL 등록과
    // 무관하게 이 앱은 자신에게 등록된 MINOR(비차단) 정책만 받는다(A1).
    expect(forceLevel, 'SAMHAN_MOBILE 은 AROLOGIS_MOBILE CRITICAL 에 차단되면 안 된다').not.toBe('CRITICAL')
    expect(forceLevel).toBe('MINOR')

    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(SHOT_DIR, '10-삼한모바일-영향없음.png') })
    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log('■ mobile 화면 텍스트(차단 문구 없어야 함):', bodyText.slice(0, 300))
    expect(bodyText).not.toContain('업데이트 필요')
    expect(bodyText).not.toContain('더 이상 사용할 수 없습니다')
  })

  test('삼한 직원 모바일 — 영향 없음(비차단, 정상 통과)', async ({ page }) => {
    const { status, body } = await captureVersionCheck(page, 'http://localhost:19012/', 'SAMHAN_MOBILE_STAFF')
    console.log('■ mobile-staff(직원 모바일) /app/version 응답:', status, JSON.stringify(body))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forceLevel = (body as any)?.data?.forceLevel
    expect(forceLevel, 'SAMHAN_MOBILE_STAFF 는 AROLOGIS_MOBILE CRITICAL 에 차단되면 안 된다').not.toBe('CRITICAL')
    expect(forceLevel).toBe('MINOR')

    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(SHOT_DIR, '11-직원모바일-영향없음.png') })
    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log('■ mobile-staff 화면 텍스트(차단 문구 없어야 함):', bodyText.slice(0, 300))
    expect(bodyText).not.toContain('업데이트 필요')
    expect(bodyText).not.toContain('더 이상 사용할 수 없습니다')
  })
})
