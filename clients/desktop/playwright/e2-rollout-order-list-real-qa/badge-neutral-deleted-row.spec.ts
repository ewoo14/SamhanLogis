import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * R2 fix Design F-1 실증 — 삭제행 상태 배지 중립화.
 *
 * 삭제된 CONFIRMED(완료) 주문의 상태 배지가 원래 의미색(초록 success)이 아니라
 * 중립(neutral-100 배경)으로 렌더되는지 실서버 GUI 에서 computed style 로 단언한다.
 * 대상: 2026/07/07-9003 (DB 시드 — CONFIRMED + soft-deleted).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const ORDER_NO = process.env['BADGE_ORDER_NO'] ?? '2026/07/07-9003'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-rollout-order-list'))

async function realLogin(page: Page): Promise<{ token: string; role: string; userId: string; displayName: string }> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
}

test('삭제된 완료(CONFIRMED) 주문 배지 = 중립색(의미색 초록 아님)', async ({ page }) => {
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
  // 상태 필터: 완료(CONFIRMED) + 주문번호 검색 → 삭제행만 매칭
  await page.getByTestId('partner-order-list-status-filter').selectOption('CONFIRMED')
  await page.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  const row = page.getByTestId(`partner-order-row-${ORDER_NO}:deleted`)
  await expect(row, '삭제행 렌더').toBeVisible({ timeout: 20_000 })

  const badge = row.locator('td', { hasText: '완료' }).locator('span').last()
  await expect(badge, '상태 배지 텍스트 보존(한국어)').toHaveText('완료')
  const styles = await badge.evaluate((el) => {
    const cs = window.getComputedStyle(el)
    // 기대값 = 문서 루트에 해석된 design-system 토큰 실값(--color-neutral-100) — 폴백 리터럴
    // 하드코딩 대신 토큰과 직접 대조(토큰 실값 #EDF0F4 ≠ 폴백 #F3F4F6 실측 교훈).
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--color-neutral-100)'
    document.body.appendChild(probe)
    const expectedNeutral = window.getComputedStyle(probe).backgroundColor
    probe.remove()
    return { bg: cs.backgroundColor, color: cs.color, deco: cs.textDecorationLine, expectedNeutral }
  })
  console.log('[BADGE-COMPUTED]', JSON.stringify(styles))
  // 의미색(초록 success 계열)이 아니어야 하고 design-system neutral-100 토큰 실값이어야 한다.
  expect(styles.bg, '배지 배경=중립(--color-neutral-100 실값)').toBe(styles.expectedNeutral)
  expect(styles.bg, '배지 배경≠success 초록(state-success-bg)').not.toBe('rgb(209, 250, 229)')
  expect(styles.deco, '취소선 유지').toContain('line-through')

  await page.screenshot({ path: path.join(SHOTS, 'r2fix-badge-neutral-confirmed-deleted.png'), fullPage: false })
  const zoom = await row.screenshot()
  const fs = await import('fs')
  fs.writeFileSync(path.join(SHOTS, 'r2fix-badge-neutral-row-zoom.png'), zoom)
})
