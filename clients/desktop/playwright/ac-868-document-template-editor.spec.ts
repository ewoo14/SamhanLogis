import { expect, test } from '@playwright/test'

const ACTIVE_TEMPLATE_ID = '77777777-eeee-4eee-8eee-000000000001'

function viewOnlyUrl(): string {
  const perms = encodeURIComponent(Buffer.from(JSON.stringify([
    { pageCode: 'groupware.approval-templates', view: true, edit: false },
  ])).toString('base64'))
  return `/#/groupware/document-templates?mockRole=MANAGER&mockPerms=${perms}`
}

test.describe('AC-868 DS-3b 문서 양식 편집기 mock 회귀', () => {
  test('R6: VIEW 전용 사용자는 저장·활성화 버튼에 도달하지 못한다', async ({ page }) => {
    await page.goto(viewOnlyUrl(), { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '결재 문서 양식' })).toBeVisible()
    await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '활성화' })).toHaveCount(0)
  })

  test('R7: ACTIVE 양식 편집은 한국어 안내를 내고 저장을 차단한다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByText('ACTIVE 양식은 직접 수정할 수 없습니다')).toBeVisible()
    await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  test('R8: TEXT 추가는 중복되지 않는 key를 생성한다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: 'TEXT 추가' }).click()
    await page.getByRole('button', { name: 'TEXT 추가' }).click()
    const keys = await page.locator('[data-testid^="template-element-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-template-key')).filter(Boolean))
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('R9: 저장 전 draft 변경이 실 DocumentRenderer 미리보기로 즉시 반영된다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: 'TEXT 추가' }).click()
    await page.getByLabel('문구').fill('저장 전 draft 미리보기')
    await expect(page.getByTestId('document-template-live-preview')).toContainText('저장 전 draft 미리보기')
  })
})
