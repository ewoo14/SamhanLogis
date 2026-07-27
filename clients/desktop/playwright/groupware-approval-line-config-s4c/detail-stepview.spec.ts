/**
 * S4c detail StepView mock regression.
 *
 * Runs in the desktop mock hard gate. A groupware.approvals-only user must see
 * detail field labels and approval-line fallbacks without admin template permission.
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { expect, test, type Page } from '@playwright/test'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const APPROVAL_ID = '77777777-cccc-4ccc-8ccc-000000000901'
const TEMPLATE_ID = '77777777-dddd-4ddd-8ddd-000000000901'
const REQUESTER_ID = 'mock-requester-detail'
const UNKNOWN_GROUP_ID = '00000000-0000-0000-0000-000000009901'
const LABEL_CREATOR = '\uC791\uC131\uC790'
const LABEL_GROUP = '\uAD8C\uD55C\uADF8\uB8F9'
const LABEL_DIRECT_USER = '\uC9C1\uC811\uC9C0\uC815'
const _dirname = path.dirname(fileURLToPath(import.meta.url))
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const DIR = resolveMockQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-line-config-s4c'))

fs.mkdirSync(DIR, { recursive: true })

async function cap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(DIR, name), fullPage: true })
}

test('S4c: detail StepView creator/GROUP/USER fallback and non-admin active template label', async ({ page }) => {
  await page.addInitScript(({ approvalId, templateId, requesterId, unknownGroupId }) => {
    const mockWindow = window as unknown as {
      __SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES_SEED?: unknown[]
      __SAMHAN_MOCK_GROUPWARE_APPROVALS_SEED?: unknown[]
      __SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS_SEED?: Record<string, unknown[]>
    }
    mockWindow.__SAMHAN_MOCK_GROUPWARE_APPROVAL_TEMPLATES_SEED = [
      {
        id: templateId,
        code: 'DETAIL_STEPVIEW',
        name: 'Detail StepView Template',
        description: null,
        active: true,
        displayOrder: 99,
        fields: [
          {
            fieldKey: 'amount',
            label: 'Amount label from active template',
            fieldType: 'NUMBER',
            required: true,
            displayOrder: 1,
            options: [],
            placeholder: null,
          },
        ],
      },
    ]
    mockWindow.__SAMHAN_MOCK_GROUPWARE_APPROVALS_SEED = [
      {
        approvalId,
        approvalNo: 'A2G2-DETAIL-001',
        requesterId,
        requesterName: 'Mock Requester',
        title: 'S4c detail step view',
        content: 'Checks GROUP/USER fallbacks and template field labels.',
        templateId,
        templateName: 'Detail StepView Template',
        fieldValues: { amount: '123000' },
        status: 'PENDING',
        steps: [
          {
            sequence: 0,
            stepType: 'USER',
            approverGroupId: null,
            approverId: requesterId,
            approverName: 'Mock Requester',
            status: 'PENDING',
            decidedAt: null,
            reason: null,
          },
          {
            sequence: 1,
            stepType: 'GROUP',
            approverGroupId: unknownGroupId,
            approverId: null,
            approverName: null,
            status: 'PENDING',
            decidedAt: null,
            reason: null,
          },
          {
            sequence: 2,
            stepType: 'USER',
            approverGroupId: null,
            approverId: 'mock-user-without-name',
            approverName: null,
            status: 'PENDING',
            decidedAt: null,
            reason: null,
          },
        ],
      },
    ]
    mockWindow.__SAMHAN_MOCK_GROUPWARE_APPROVAL_ATTACHMENTS_SEED = {
      [approvalId]: [],
    }
  }, {
    approvalId: APPROVAL_ID,
    templateId: TEMPLATE_ID,
    requesterId: REQUESTER_ID,
    unknownGroupId: UNKNOWN_GROUP_ID,
  })

  const perms = Buffer.from(JSON.stringify([
    { pageCode: 'groupware.approvals', view: true, edit: false },
  ]), 'utf-8').toString('base64')
  await page.goto(`${BASE}/?mockRole=MANAGER&mockPerms=${perms}#/groupware/approvals/${APPROVAL_ID}`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  })
  await page.waitForTimeout(1_500)

  await expect(page.getByTestId('groupware-approval-detail-no')).toContainText('A2G2-DETAIL-001')
  await expect(page.getByTestId('groupware-approval-detail-fields')).toContainText('Amount label from active template')

  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).toContain('Mock Requester')
  expect(body).toContain(LABEL_CREATOR)
  expect(body).toContain(LABEL_GROUP)
  expect(body).toContain(LABEL_DIRECT_USER)
  expect(body).not.toContain(UNKNOWN_GROUP_ID)
  expect(body).not.toContain('mock-user-without-name')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await expect(page.getByTestId('groupware-approval-mobile-steps')).toContainText(LABEL_CREATOR)
  await expect(page.getByTestId('groupware-approval-mobile-steps')).toContainText(LABEL_GROUP)
  await cap(page, '05-detail-stepview-mobile.png')
})
