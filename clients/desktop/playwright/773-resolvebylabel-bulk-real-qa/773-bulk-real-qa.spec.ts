/**
 * #773 후속 — resolveByLabel N+1 → lookup-by-label 벌크 라이브 QA.
 *
 * BE-only 성능 리팩터(라벨 해소 N+1 HTTP → 벌크 1회). FE/응답 계약 불변이므로 라이브 QA 는
 * "재배포된 벌크 코드로 일마감 상세가 parity 대로 렌더된다"를 실증한다(회귀 0).
 *
 * 실 게이트웨이(:8080, mock OFF·**product+accounting 양측 재배포 jar**) → 실 Postgres. dev_accountant.
 * 타깃 = 결정론적 dev 시드 2026-05-03 매출 세금계산서(운임/서비스 3 라벨·전부 NOT_FOUND).
 * N+1→1 자체는 단위테스트(times(6)→times(1))·accounting per-label 로그 부재로 별도 실증.
 *
 * 캡처(docs/qa/773-resolvebylabel-bulk/):
 *  01 일마감 상세 — 모델별 재검증 테이블(3 서비스 라벨·판정불가·벌크 해소 후 렌더)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/773-resolvebylabel-bulk')
fs.mkdirSync(SHOTS, { recursive: true })

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
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
}

test('일마감 상세 벌크 해소 후 parity 렌더 (#773 N+1→벌크)', async ({ page }) => {
  const login = await realLogin(page, 'dev_accountant')
  await installAuthStub(page, login)

  // 웹 배포(VITE_PLATFORM='web')는 createBrowserRouter → 해시 없는 실 경로(773-s4/s5 동일 포트군과 동일 하네스).
  await page.goto(`${BASE_URL}/accounting/daily-closings`)
  await expect(page.getByRole('heading', { name: '일마감 조회' })).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('daily-closing-filter-date').fill('2026-05-03')
  await page.getByRole('button', { name: '세금계산서', exact: true }).click()
  await expect(page.getByRole('heading', { name: '모델별 재검증' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('heading', { name: '모델별 재검증' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '01-daily-detail-bulk-parity.png'), fullPage: false })

  const table = page.locator('table').last()
  await table.screenshot({ path: path.join(SHOTS, '02-revalidation-table-closeup.png') })

  console.log('[773 bulk QA] 일마감 상세 벌크 해소 parity 렌더 캡처 완료')
})
