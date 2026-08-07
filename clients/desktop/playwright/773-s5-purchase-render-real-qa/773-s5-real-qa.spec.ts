import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #773 S5 라이브 QA — 매입(PURCHASE) 재검증 노출(참고 배너) + modelName 채움 실증.
 *
 * S5: ① BE modelName 채움(extractModelTokenOrNull·실 모델코드만) → 모델 컬럼 재도입.
 *     ② PURCHASE 도 재검증 표 렌더 + 참고용 배너("판매기준 참고용·정식 매입단가 감사 아님")
 *        + 확인 컬럼 '참고' 마커.
 *
 * 실 게이트웨이(:8080, mock OFF·재빌드 accounting jar) → 실 Postgres. dev_accountant.
 * 웹 배포=createBrowserRouter → 해시 없는 실경로 `/accounting/daily-closings`.
 *
 * 타깃 데이터 = 결정론적 dev 시드의 **2026-05-03 매출 세금계산서**(운임/서비스 3라인).
 * 모델 컬럼은 실 모델 라벨을 가진 라인에서 토큰 노출, 서비스 라인은 '—' 로 대비된다.
 * (풍부한 SALES_SLIP 모델 데이터가 있는 완전 시드 환경에서는 해당 소스로 확장 가능.)
 *
 * 단계별 캡처(docs/qa/773-s5-purchase-render-modelname/):
 *  01 진입 — 일마감 조회 화면
 *  02 매출(SALES) 2026-05-03 세금계산서 상세 — 모델별 재검증 테이블(모델 컬럼)
 *  03 모델 컬럼 클로즈업 — 실 모델 토큰 vs 서비스행 '—'
 *  04 매입(PURCHASE) 전환 — 참고용 배너("판매(출고) 기준 참고용")
 *  05 매입 상세 카드 — 배너 + 확인 컬럼 맥락
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const TARGET_DATE = process.env['S5_QA_DATE'] ?? '2026-05-03'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/773-s5-purchase-render-modelname'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

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

test('일마감 매입 참고 배너 + 모델 컬럼 (S5 FE+BE)', async ({ page }) => {
  const login = await realLogin(page, 'dev_accountant')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/accounting/daily-closings`)
  await expect(page.getByRole('heading', { name: '일마감 조회' })).toBeVisible({ timeout: 30_000 })
  await capture(page, 'entry')

  // 1) 매출(SALES) 2026-05-03 · 세금계산서(기본 소스) → 모델별 재검증 + 모델 컬럼
  await page.getByTestId('daily-closing-filter-date').fill(TARGET_DATE)
  await page.getByRole('button', { name: '세금계산서', exact: true }).click()
  await expect(page.getByRole('heading', { name: '모델별 재검증' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('columnheader', { name: '모델' })).toBeVisible()
  await page.getByRole('heading', { name: '모델별 재검증' }).scrollIntoViewIfNeeded()
  await capture(page, 'sales-detail-model-column')

  const revalidationTable = page.locator('table').last()
  await revalidationTable.screenshot({
    path: path.join(SHOTS, '03-model-column-closeup.png'),
  })
  shotNo = Math.max(shotNo, 3)

  // 2) 매입(PURCHASE) 전환 → 참고 배너 + 확인 '참고' 마커
  await page.getByRole('radio', { name: '매입' }).click()
  await expect(page.getByRole('note')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('note')).toContainText('판매(출고) 기준 참고용')
  await page.getByRole('note').scrollIntoViewIfNeeded()
  await capture(page, 'purchase-reference-banner')

  await page.getByRole('heading', { name: '모델별 재검증' }).scrollIntoViewIfNeeded()
  await capture(page, 'purchase-detail-card')

  console.log('[S5 QA] entry + SALES 모델컬럼 + PURCHASE 참고배너 캡처 완료')
})
