import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.cjs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const apiBase = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1219-daily-closing-cc043f652-real-qa'))
fs.mkdirSync(shots, { recursive: true })

async function signIn(page: Page) {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.ok(), `로그인 실패 ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token: data.token ?? '',
    role: data.role ?? '',
    userId: data.userId ?? '',
    displayName: data.displayName ?? 'dev_master',
  })
}

async function openResult(page: Page) {
  await page.goto(`${baseUrl}/#/accounting/daily-closings`)
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' })
  await page.getByTestId('daily-closing-filter-date').fill('2026-08-03')
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: '결과' }).click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible()
  await expect(page.getByRole('button', { name: '상세 펼치기 6' })).toHaveCount(4)
}

test('1219 일마감 live QA 화면 계산과 표 정렬 캡처', async ({ page }) => {
  await signIn(page)
  await openResult(page)

  const table = page.getByTestId('daily-closing-table')
  await page.screenshot({ path: path.join(shots, '01-edit-before-real-qa.png'), fullPage: true })

  const firstRow = page.getByRole('button', { name: '상세 펼치기 6' }).nth(0).locator('xpath=ancestor::tr')
  await firstRow.getByLabel('단가(VAT포함) 6').fill('17,000')
  await expect(page.getByText('저장되지 않은 금액 수정 1건')).toBeVisible()
  await expect(table).toContainText('963,040')
  await expect(table).toContainText('641,480')
  await expect(table).toContainText('118,580')
  await expect(page.getByTestId('daily-closing-total-row')).toContainText('1,740,100')
  await page.screenshot({ path: path.join(shots, '02-after-unit-rate-edit-real-qa.png'), fullPage: true })

  await firstRow.getByRole('button', { name: '상세 펼치기 6' }).click()
  await expect(page.getByTestId('daily-closing-expanded-6')).toHaveCount(1)
  await expect(page.getByTestId('daily-closing-expanded-6').locator('td')).toHaveCount(2)
  await page.screenshot({ path: path.join(shots, '03-expanded-first-row-real-qa.png'), fullPage: true })

  fs.writeFileSync(path.join(shots, 'README.md'), [
    '# #1219 일마감 라이브QA',
    '',
    '- `01-edit-before-real-qa.png`: 사용자는 로그인 → 회계 → 일마감 → 대상일 2026-08-03 → 결과 탭으로 들어온다.',
    '- `02-after-unit-rate-edit-real-qa.png`: 같은 경로에서 번호 6 전표 첫 행의 단가 입력만 수정한다. 저장 버튼은 누르지 않는다.',
    '- `03-expanded-first-row-real-qa.png`: 같은 화면에서 첫 행의 상세 펼치기만 누른다. 저장·마감 실행·역마감은 누르지 않는다.',
    '',
  ].join('\n'), 'utf8')
})
