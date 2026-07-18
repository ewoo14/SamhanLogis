/**
 * #845 DS-1 renderer screen/print sanity mock 스위트.
 *
 * DOM 바이트 golden은 Vitest가 담당하고, 이 스위트는 CSS/폰트가 로드된 브라우저에서
 * 대표 fixture를 screen과 print media로 확인하는 보조 게이트다. PM 실행 전용이다.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotDir = path.resolve(dirname, '../../../../docs/qa/ac-845-ds1-form-renderer/screenshots')
fs.mkdirSync(screenshotDir, { recursive: true })

const approvalId = 'playwright-ds1-fixture'
const approvalPath = `/admin/groupware/approvals/${approvalId}`
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i

const fixtureApproval = {
  approvalId,
  approvalNo: 'GW-DS1-PLAYWRIGHT-001',
  requesterId: 'internal-requester',
  requesterName: '작성자',
  title: 'DS-1 브라우저 sanity 문서',
  content: '첫 번째 브라우저 문단\n\n두 번째 브라우저 문단',
  templateId: 'template-playwright-ds1',
  templateName: '지출결의',
  fieldValues: { amount: '1234567', memo: '브라우저 검증' },
  status: 'APPROVED',
  steps: [
    {
      sequence: 1,
      stepType: 'USER',
      approverGroupId: null,
      approverId: 'internal-approver-1',
      approverName: '결재자',
      status: 'APPROVED',
      decidedAt: '2026-07-18T10:00:00',
      reason: null,
    },
  ],
}

const fixtureAttachments = [{
  id: 'internal-attachment-1',
  attachmentType: 'FILE',
  label: '브라우저 첨부',
  displayOrder: 1,
  refSlipNo: null,
  refSlipType: null,
  refPartnerCode: null,
  refPartnerName: null,
  refPeriod: null,
  refDocType: null,
  refDocNo: null,
  refDocLabel: null,
  fileName: 'ds1.txt',
  contentType: 'text/plain',
  fileSize: 10,
  downloadUrl: null,
}]

const fixtureTemplate = {
  id: 'template-playwright-ds1',
  code: 'EXPENSE',
  name: '지출결의',
  description: null,
  active: true,
  displayOrder: 1,
  fields: [
    {
      fieldKey: 'amount',
      label: '금액',
      fieldType: 'NUMBER',
      required: false,
      displayOrder: 1,
      options: [],
      placeholder: null,
    },
    {
      fieldKey: 'memo',
      label: '메모',
      fieldType: 'TEXT',
      required: false,
      displayOrder: 2,
      options: [],
      placeholder: null,
    },
  ],
}

function permissionQuery(pageCodes: string[]): string {
  return Buffer.from(JSON.stringify(pageCodes.map((pageCode) => ({ pageCode, view: true, edit: true }))), 'utf8').toString('base64')
}

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'playwright-ds1-token',
          userId: 'internal-user',
          role: 'MASTER',
          fullName: 'QA 사용자',
          partnerCode: 'P-MOCK-001',
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function installApiFixtures(page: Page): Promise<void> {
  await page.route(`**${approvalPath}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { data: fixtureApproval } })
      return
    }
    await route.fallback()
  })
  await page.route(`**${approvalPath}/attachments`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { data: fixtureAttachments } })
      return
    }
    await route.fallback()
  })
  await page.route('**/groupware/approval-templates/active', async (route) => {
    await route.fulfill({ json: { data: [fixtureTemplate] } })
  })
}

async function gotoFixture(page: Page): Promise<void> {
  await installAuthMock(page)
  await installApiFixtures(page)
  const permissions = permissionQuery(['groupware.approvals'])
  await page.goto(`${BASE}/?mockRole=MASTER&mockPerms=${permissions}#/groupware/approvals/${approvalId}/print`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('.print-approval-doc')).toBeVisible({ timeout: 15_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    document.querySelectorAll('*').forEach((element) => {
      const item = element as HTMLElement
      item.style.setProperty('animation', 'none', 'important')
      item.style.setProperty('transition', 'none', 'important')
    })
  })
}

test.describe('AC-845 DS-1 문서 렌더러 screen/print sanity', () => {
  test('screen 대표 fixture와 UUID 비노출', async ({ page }) => {
    await gotoFixture(page)

    await expect(page.getByRole('heading', { name: fixtureApproval.title })).toBeVisible()
    await expect(page.getByLabel('전자서명 결재란')).toBeVisible()
    await expect(page.getByText('브라우저 첨부')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(UUID_PATTERN)
    await page.screenshot({ path: path.join(screenshotDir, '01-screen.png'), fullPage: true })
  })

  test('print media 대표 fixture sanity', async ({ page }) => {
    await gotoFixture(page)
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.paper-a4-portrait')).toBeVisible()
    await expect(page.locator('.print-approval-body')).toContainText('첫 번째 브라우저 문단')
    await page.screenshot({ path: path.join(screenshotDir, '02-print.png'), fullPage: true })
  })
})
