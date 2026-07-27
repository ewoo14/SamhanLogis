import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #757 STEP4 Design MED 회귀 실증 — 활성 CONFIRMED(완료) 주문 배지는 여전히 success 초록.
 *
 * `.statusDeletedNeutral` 의 dead `color` 선언 제거(STEP4)가 활성 행 배지 색에 영향을 줄 수 없음을
 * 코드상으로도 확인함: 배지 className 은 `deleted ? statusDeletedNeutral : STATUS_CLASS[o.status]`
 * 삼항으로 상호배타적이라 활성 행은 애초에 statusDeletedNeutral 클래스를 받지 않는다
 * (SalesPartnerOrderListPage.tsx:329). 이 스펙은 그 상호배타성을 실 GUI computed-style 로 재확인한다.
 *
 * 읽기 전용 — DB 변경 없음(활성 CONFIRMED 주문 목록 조회만).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-rollout-order-list'))
fs.mkdirSync(SHOTS, { recursive: true })

async function realLogin(page: Page): Promise<{ token: string; role: string; userId: string; displayName: string }> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
}

test('활성 CONFIRMED(완료) 주문 배지 = success 초록 (삭제행 중립화 fix 로 인한 회귀 없음)', async ({ page }) => {
  const login = await realLogin(page)
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )

  await page.goto(`${BASE_URL}/#/sales/partner-orders`)
  await page.getByTestId('partner-order-list-status-filter').selectOption('CONFIRMED')
  await page.getByTestId('partner-order-list-keyword-filter').fill('')
  await page.waitForTimeout(1000)

  const rows = page.locator('table tbody tr')
  await expect(rows.first(), '활성 CONFIRMED 목록 최소 1건').toBeVisible({ timeout: 20_000 })
  const rowCount = await rows.count()
  expect(rowCount, 'CONFIRMED 목록에 활성행 존재').toBeGreaterThan(0)

  // 첫 행 = 활성(비삭제) 이어야 한다 — testid 접미사 ':deleted' 없음을 명시 확인.
  const firstRow = rows.first()
  const testId = await firstRow.getAttribute('data-testid')
  expect(testId ?? '', '첫 행은 활성행(비삭제) testid').not.toContain(':deleted')

  const badge = firstRow.locator('td', { hasText: '완료' }).locator('span').last()
  await expect(badge, '상태 배지 텍스트=완료').toHaveText('완료')
  const styles = await badge.evaluate((el) => {
    const cs = window.getComputedStyle(el)
    return { bg: cs.backgroundColor, color: cs.color, deco: cs.textDecorationLine }
  })
  console.log('[ACTIVE-CONFIRMED-BADGE-COMPUTED]', JSON.stringify(styles))

  // sales.module.css .statusConfirmed { background: var(--state-success-bg, #d1fae5) } 실측.
  expect(styles.bg, '활성 완료 배지 배경 = success 초록(rgb(209, 250, 229))').toBe('rgb(209, 250, 229)')
  expect(styles.deco, '활성행은 취소선 없음').not.toContain('line-through')

  await page.screenshot({ path: path.join(SHOTS, 'step4-active-confirmed-green-badge-list.png') })
  const zoom = await firstRow.screenshot()
  fs.writeFileSync(path.join(SHOTS, 'step4-active-confirmed-green-badge-zoom.png'), zoom)
})
