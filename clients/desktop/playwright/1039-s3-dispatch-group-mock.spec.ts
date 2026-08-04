import { test, expect } from '@playwright/test'

function withPermission(path: string, pageCode: string): string {
  const perms = btoa(JSON.stringify([{ pageCode, view: true, edit: true }]))
  return `/#${path}?mockRole=MANAGER&mockPerms=${encodeURIComponent(perms)}`
}

test.describe('S3 운송사·배차 그룹 mock 화면', () => {
  test('인사 > 운송사 목록에서 마스터 상태를 표시한다', async ({ page }) => {
    await page.goto(withPermission('/admin/carriers', 'hr.carriers'))
    await expect(page.getByTestId('carrier-list-page')).toBeVisible()
    await expect(page.getByRole('cell', { name: '아로로지스' })).toBeVisible()
    await expect(page.getByText('한빛퀵')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '정산 거래처' })).toBeVisible()
  })

  test('배차 그룹에서 지정일·전송 상태를 읽기 전용으로 표시한다', async ({ page }) => {
    await page.goto(withPermission('/admin/dispatch-groups', 'dispatch.board'))
    await expect(page.getByTestId('dispatch-group-page')).toBeVisible()
    await expect(page.getByText('DG-20260804-01')).toBeVisible()
    await expect(page.getByText('미전송')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '전송 상태' })).toBeVisible()
    await expect(page.getByRole('button', { name: /전송/ })).toHaveCount(0)
  })
})
