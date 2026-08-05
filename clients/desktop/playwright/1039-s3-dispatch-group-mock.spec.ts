import { test, expect } from '@playwright/test'

function withPermission(path: string, pageCode: string): string {
  const perms = btoa(JSON.stringify([{ pageCode, view: true, edit: true }]))
  return `/#${path}?mockRole=MASTER&mockPerms=${encodeURIComponent(perms)}`
}

function withPermissions(path: string, pageCodes: string[]): string {
  const perms = btoa(JSON.stringify(pageCodes.map((pageCode) => ({ pageCode, view: true, edit: true }))))
  return `/#${path}?mockRole=MASTER&mockPerms=${encodeURIComponent(perms)}`
}

test.describe('S3 운송사·배차 그룹 mock 화면', () => {
  test('인사 > 운송사 목록에서 마스터 상태를 표시한다', async ({ page }) => {
    await page.goto(withPermission('/admin/carriers', 'hr.carriers'))
    await expect(page.getByTestId('carrier-list-page')).toBeVisible()
    await expect(page.getByRole('cell', { name: '아로로지스' })).toBeVisible()
    await expect(page.getByText('한빛퀵')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '정산 거래처' })).toBeVisible()
  })

  test('배차 그룹에서 지정일·전송 상태와 아로로지스 전송을 표시한다', async ({ page }) => {
    await page.goto(withPermission('/admin/dispatch-groups', 'dispatch.board'))
    await expect(page.getByTestId('dispatch-group-page')).toBeVisible()
    await expect(page.getByText('DG-20260804-01')).toBeVisible()
    await expect(page.getByText('미전송')).toBeVisible()
    await expect(page.getByText('전송 확인 중')).toBeVisible()
    await expect(page.getByText('전송 결과 확인 중입니다. 확인이 끝나면 상태가 자동으로 갱신됩니다.')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '전송 상태' })).toBeVisible()
    await expect(page.getByRole('button', { name: /아로로지스로 전송/ })).toBeVisible()
  })

  test('dispatch.board VIEW만 있으면 배차 운송사 조회는 열리고 인사 운송사 화면은 닫힌다', async ({ page }) => {
    await page.goto(withPermission('/admin/dispatch-groups', 'dispatch.board'))
    await expect(page.getByTestId('dispatch-group-page')).toBeVisible()
    await expect(page.getByText('활성 운송사 2개')).toBeVisible()

    await page.goto(withPermission('/admin/carriers', 'dispatch.board'))
    await expect(page.getByTestId('carrier-list-page')).toHaveCount(0)
  })

  test('인사 자식 권한 조합별 헤더 가시성과 운송사 진입을 보장한다', async ({ page }) => {
    const cases = [
      { name: '운송사만', pageCodes: ['hr.carriers'], header: true, carrier: true },
      { name: '인사관리만', pageCodes: ['admin.employees'], header: true, carrier: false },
      { name: '권한관리만', pageCodes: ['system.permission-admin'], header: true, carrier: false },
      { name: '없음', pageCodes: [], header: false, carrier: false },
    ]

    for (const scenario of cases) {
      // 권한은 모듈 초기화 시 hash query에서 읽으므로 fragment-only 이동의 stale 상태를 차단한다.
      await page.goto('about:blank')
      await page.goto(withPermissions('/', scenario.pageCodes))
      const header = page.getByTestId('sidebar-category-toggle-인사')
      if (!scenario.header) {
        await expect(header).toHaveCount(0)
        continue
      }

      await expect(header).toBeVisible()
      await header.click()
      const carrierLink = page.getByTestId('sidebar-hr-carriers')
      if (!scenario.carrier) {
        await expect(carrierLink, `${scenario.name}: 운송사 링크가 없어야 함`).toHaveCount(0)
        continue
      }

      await expect(carrierLink).toBeVisible()
      await carrierLink.click()
      await expect(page.getByTestId('carrier-list-page')).toBeVisible()
    }
  })
})
