import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5201'
const shotDir = process.env['AUDIT_SHOT_DIR'] ?? join(process.cwd(), '..', '..', 'docs', 'qa', '2026-08-14-1211-app-update-notice', 'screenshots')
const disabled = { installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true }
const enabled = { installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false }

type Scenario = 'disabled' | 'trust' | 'integrity' | 'network' | 'approved' | 'declined'

async function harness(page: import('@playwright/test').Page, scenario: Scenario) {
  await page.addInitScript(({ scenario: selected }) => {
    const listeners = new Set<(status: unknown) => void>()
    let statusCalls = 0
    const emit = (status: unknown) => listeners.forEach((listener) => listener(status))
    Object.defineProperty(window, 'arologisAuth', { configurable: true, value: { getToken: async () => null, setToken: async () => undefined, clearToken: async () => undefined } })
    Object.defineProperty(window, 'arologisUpdater', { configurable: true, value: {
      onStatus: (listener: (status: unknown) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      check: async () => {
        const messages = {
          trust: '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.',
          integrity: '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.',
          network: '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.',
        } as const
        if (selected in messages) emit({ kind: 'error', message: messages[selected as keyof typeof messages] })
        else emit({ kind: 'not-available' })
      },
      install: async () => undefined,
      quit: async () => undefined,
    } })
    if (['disabled', 'approved', 'declined'].includes(selected)) {
      Object.defineProperty(window, 'arologisTrustRoot', { configurable: true, value: {
        status: async () => { statusCalls += 1; return selected === 'approved' && statusCalls > 1 ? { installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false } : { installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true } },
        install: async () => selected === 'approved' ? { installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false } : { installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true },
      } })
    }
  }, { scenario })
}

test('PR #1211 AppUpdateNotice 6개 실제 화면 캡처', async ({ browser }) => {
  mkdirSync(shotDir, { recursive: true })
  const cases: Array<[Scenario, string]> = [
    ['disabled', '01-auto-update-disabled-declined'], ['trust', '02-trust-failure'], ['integrity', '03-integrity-failure'],
    ['network', '04-network-failure'], ['approved', '05-approved-immediately-enabled'], ['declined', '06-declined-banner-remains'],
  ]
  for (const [scenario, name] of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await harness(page, scenario)
    await page.goto(`${baseUrl}/`)
    if (['disabled', 'approved', 'declined'].includes(scenario)) {
      await expect(page.getByTestId('app-trust-root-disabled')).toBeVisible({ timeout: 10000 })
      if (scenario !== 'disabled') await page.getByRole('button', { name: '신뢰 루트 설치' }).click()
      if (scenario === 'approved') await expect(page.getByTestId('app-trust-root-disabled')).toHaveCount(0)
      if (scenario === 'declined') await expect(page.getByTestId('app-trust-root-disabled')).toBeVisible()
    } else {
      await expect(page.getByTestId('app-auto-update-status')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('app-auto-update-status')).toHaveAttribute('data-severity', scenario)
    }
    await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true })
    await context.close()
  }
})
