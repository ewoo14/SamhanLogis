import { _electron as electron, expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(HERE, '../..')
const SHOTS = resolveQaShotsDir(
  path.resolve(HERE, '../../../../docs/qa/2026-08-15-1220-adversarial'),
)

test('운영 미주입 빌드에서 두 버튼 모두 alert로 사용자에게 도달한다', async () => {
  const app = await electron.launch({ args: [DESKTOP_ROOT] })
  try {
    const page = await app.firstWindow()
    await page.evaluate(async () => {
      await window.samhanAuth.setToken({
        token: 'qa-local-only',
        userId: '00000000-0000-0000-0000-000000010001',
        role: 'MASTER',
        fullName: '적대검증자',
        partnerCode: null,
      })
      window.location.hash = '#/sales/estimates?mockRole=MASTER'
    })
    await page.reload({ waitUntil: 'domcontentloaded' })

    const nav = page.getByTestId('sales-subnav-external')
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button', { name: /웹 종합견적서/ })).toBeVisible()
    await expect(nav.getByRole('button', { name: /웹 주문서/ })).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, '01-sales-subnav-entry.png'), fullPage: true })

    for (const name of [/웹 종합견적서/, /웹 주문서/]) {
      const dialog = page.waitForEvent('dialog')
      await nav.getByRole('button', { name }).click()
      const opened = await dialog
      expect(opened.type()).toBe('alert')
      expect(opened.message()).toBe(
        '외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      )
    }
  } finally {
    await app.close()
  }
})
