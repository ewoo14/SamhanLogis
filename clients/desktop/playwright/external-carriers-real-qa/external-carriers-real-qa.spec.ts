import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * PR #591 슬2 — 외부기사/배송사 마스터(external_carrier) 라이브 실서버 QA 캡처.
 *
 * [[feedback_no_fake_data_ever]] [[feedback_real_server_check_screenshot]] [[feedback_realqa_run_and_false_red]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시 + 실 JWT).
 * - 대상 화면: /admin/external-carriers (좌측 "배차 > 외부기사/배송사").
 * - 단계: 메뉴진입 → 등록폼 → 목록표시 → 수정/비활성 → 선택필드 클리어(P1 fix 실증) → soft-delete.
 *
 * 실행:
 *   별도 터미널: VITE_API_BASE_URL=http://localhost:8080 node_modules/.bin/vite dev --config vite.renderer.dev.config.ts  (mock off, :5175)
 *   cd clients/desktop
 *   node_modules/.bin/playwright test --config playwright/external-carriers-real-qa/playwright.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const SALES_USER_ID = 'a0000000-0000-0000-0000-000000000004'
const SALES_ROLE = 'SALES'
const SALES_DISPLAY_NAME = '[DEV-SEED] 개발영업'

const CARRIER_NAME = '한빛퀵QA'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(
  process.env['QA_SHOTS']
    ? path.resolve(process.env['QA_SHOTS'])
    : path.resolve(_dirname, '../../../../docs/qa/external-carriers-s2'),
)

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false })
}

// 로컬 dev 테스트 계정(V5 P0-5 seed) 비밀번호. 기존 real-qa 스펙 컨벤션과 동일하게
// 환경변수 우선 + 폴백. 실 운영 크레덴셜 아님(공개 dev seed 계정).
const QA_DEV_DEFAULT_PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

function fetchRealToken(loginId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    void import('http').then((httpMod) => {
      const http = httpMod.default
      const body = JSON.stringify({ loginId, password: QA_DEV_DEFAULT_PASSWORD })
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 8080,
          path: '/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        (res) => {
          let d = ''
          res.on('data', (c) => {
            d += c
          })
          res.on('end', () => {
            try {
              resolve(JSON.parse(d).data.token as string)
            } catch {
              reject(new Error('token parse 실패: ' + d))
            }
          })
        },
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })
}

async function installRealAuth(
  page: Page,
  token: string,
  userId: string,
  role: string,
  displayName: string,
): Promise<void> {
  await page.addInitScript(
    (a: { t: string; userId: string; role: string; displayName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: a.t,
            userId: a.userId,
            role: a.role,
            displayName: a.displayName,
            fullName: a.displayName,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { t: token, userId, role, displayName },
  )
}

/** 게이트웨이 백엔드 호출만 좁게 프록시 — 앱 lazy 청크는 가로채지 않는다. */
async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    const realUrl = `${GW_URL}${u.pathname}${u.search}`
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({
        url: realUrl,
        method: route.request().method(),
        headers,
        body: postData ?? undefined,
      })
      await route.fulfill({ response })
    } catch (err) {
      console.error('[PROXY]', realUrl, err)
      await route.abort()
    }
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_000)
}

test.describe('PR #591 슬2 외부기사/배송사 마스터 — 라이브 실 QA(mock OFF)', () => {
  test('MASTER CRUD 전체 흐름 + P1 선택필드 클리어 실증', async ({ page }) => {
    const token = await fetchRealToken('dev_master')
    await installRealAuth(page, token, MASTER_USER_ID, MASTER_ROLE, MASTER_DISPLAY_NAME)
    await setupApiProxy(page, token)

    // ── 1) 메뉴 진입: 배차 카테고리 펼치고 "외부기사/배송사" 클릭 → 목록 화면 ──
    await gotoAndSettle(page, `${BASE_URL}/#/`)
    const dispatchToggle = page.getByTestId('sidebar-category-toggle-배차')
    if (await dispatchToggle.count()) {
      await dispatchToggle.click().catch(() => {})
      await page.waitForTimeout(300)
    }
    const menuLink = page.getByTestId('sidebar-dispatch-external-carriers')
    await expect(menuLink, '좌측 배차 > 외부기사/배송사 메뉴가 노출되어야 함').toBeVisible({
      timeout: 15_000,
    })
    await menuLink.click()
    await page.getByTestId('admin-external-carriers-table').waitFor({ timeout: 15_000 })
    await expect(page.getByTestId('admin-external-carriers-add-button')).toBeVisible({
      timeout: 10_000,
    })
    await page.waitForTimeout(800)
    await capture(page, '01-menu')

    // ── 2) 등록 폼 입력 ──
    // Modal 은 createPortal 로 document.body 에 렌더되므로 wrapper div(빈 0-size, hidden) 대신
    // 실제 role="dialog" + 폼 필드 가시성으로 대기한다.
    const dialog = page.getByRole('dialog')
    await page.getByTestId('admin-external-carriers-add-button').click()
    await page.getByTestId('admin-external-carriers-form-name').waitFor({ timeout: 10_000 })
    await page.getByTestId('admin-external-carriers-form-name').fill(CARRIER_NAME)
    await page.getByTestId('admin-external-carriers-form-phone').fill('010-9000-0001')
    await page.getByTestId('admin-external-carriers-form-email').fill('qa@hanbit.example')
    await page.getByTestId('admin-external-carriers-form-default-vehicle-type').fill('1톤')
    await page.getByTestId('admin-external-carriers-form-memo').fill('QA 실서버 등록 메모')
    await page.waitForTimeout(400)
    await capture(page, '02-form')

    // 저장(모달 footer "등록")
    await dialog.getByRole('button', { name: '등록', exact: true }).click()

    // ── 3) 목록 신규 표시 + 활성 Badge ──
    const row = page.getByTestId(`admin-external-carriers-row-${CARRIER_NAME}`)
    await expect(row, '저장 후 목록에 신규 행이 표시되어야 함').toBeVisible({ timeout: 15_000 })
    // 같은 행(tr)에 "활성" Badge 존재
    const createdTr = page.locator('tr', { has: row })
    await expect(createdTr.getByText('활성', { exact: true })).toBeVisible({ timeout: 10_000 })
    // 이메일/기본차종 값이 채워졌는지(클리어 대비 baseline)
    await expect(createdTr.getByText('qa@hanbit.example')).toBeVisible()
    await expect(createdTr.getByText('1톤', { exact: true })).toBeVisible()
    await page.waitForTimeout(500)
    await capture(page, '03-list-created')

    // ── 4) 수정 + 활성 토글 해제 + 메모 수정 → "비활성" Badge ──
    await page.getByTestId(`admin-external-carriers-edit-${CARRIER_NAME}`).click()
    await page.getByTestId('admin-external-carriers-form-active').waitFor({ timeout: 10_000 })
    const activeCheckbox = page.getByTestId('admin-external-carriers-form-active')
    await expect(activeCheckbox).toBeChecked()
    await activeCheckbox.uncheck()
    await page.getByTestId('admin-external-carriers-form-memo').fill('QA 비활성 처리 + 메모 수정')
    await page.waitForTimeout(300)
    await dialog.getByRole('button', { name: '수정', exact: true }).click()

    await expect(row).toBeVisible({ timeout: 15_000 })
    const afterDeactivateTr = page.locator('tr', { has: row })
    await expect(
      afterDeactivateTr.getByText('비활성', { exact: true }),
      '활성 해제 후 비활성 Badge 가 표시되어야 함',
    ).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)
    await capture(page, '04-edit-deactivate')

    // ── 5) P1 fix 실증: 이메일/기본차종 클리어 후 저장 → 재조회 시 "-" 표시 ──
    await page.getByTestId(`admin-external-carriers-edit-${CARRIER_NAME}`).click()
    await page.getByTestId('admin-external-carriers-form-email').waitFor({ timeout: 10_000 })
    const emailField = page.getByTestId('admin-external-carriers-form-email')
    const vtField = page.getByTestId('admin-external-carriers-form-default-vehicle-type')
    await expect(emailField).toHaveValue('qa@hanbit.example')
    await expect(vtField).toHaveValue('1톤')
    await emailField.fill('')
    await vtField.fill('')
    await page.waitForTimeout(300)
    await dialog.getByRole('button', { name: '수정', exact: true }).click()

    await expect(row).toBeVisible({ timeout: 15_000 })
    const clearedTr = page.locator('tr', { has: row })
    // 클리어 반영 확인: 이메일/기본차종 셀이 "-" 로 표시되고, 옛 값은 사라짐
    await expect(
      clearedTr.getByText('qa@hanbit.example'),
      'P1: 이메일 클리어가 silent 무시되지 않고 비워져야 함',
    ).toHaveCount(0, { timeout: 10_000 })
    await expect(
      clearedTr.getByText('1톤', { exact: true }),
      'P1: 기본차종 클리어가 silent 무시되지 않고 비워져야 함',
    ).toHaveCount(0, { timeout: 10_000 })
    // "-" 빈값 표시 셀 2개 이상(이메일 + 기본차종)
    await expect(clearedTr.getByText('-', { exact: true })).toHaveCount(2, { timeout: 10_000 })
    await page.waitForTimeout(500)
    await capture(page, '05-clear-optional')

    // ── 6) Soft-delete 후 목록 제외 ──
    page.once('dialog', (d) => {
      void d.accept()
    })
    await page.getByTestId(`admin-external-carriers-delete-${CARRIER_NAME}`).click()
    await expect(row, 'soft-delete 후 목록에서 사라져야 함').toHaveCount(0, { timeout: 15_000 })
    await page.waitForTimeout(800)
    await capture(page, '06-deleted')
  })

  test('권한 없는 SALES — 배차 > 외부기사/배송사 메뉴 미노출 + 직접 URL 접근 차단', async ({
    page,
  }) => {
    const token = await fetchRealToken('dev_sales')
    await installRealAuth(page, token, SALES_USER_ID, SALES_ROLE, SALES_DISPLAY_NAME)
    await setupApiProxy(page, token)

    // 직접 URL 접근 시도
    await gotoAndSettle(page, `${BASE_URL}/#/admin/external-carriers`)
    // 배차 카테고리 펼침 시도(있으면)
    const dispatchToggle = page.getByTestId('sidebar-category-toggle-배차')
    if (await dispatchToggle.count()) {
      await dispatchToggle.click().catch(() => {})
      await page.waitForTimeout(300)
    }
    // 메뉴 링크 미노출
    await expect(
      page.getByTestId('sidebar-dispatch-external-carriers'),
      'SALES 는 외부기사/배송사 메뉴가 노출되면 안 됨',
    ).toHaveCount(0, { timeout: 5_000 })
    // 관리 화면 콘텐츠(등록 버튼/테이블) 미노출 = PermissionGuard 차단
    await expect(
      page.getByTestId('admin-external-carriers-add-button'),
      'SALES 는 외부기사/배송사 관리 화면에 직접 접근할 수 없어야 함',
    ).toHaveCount(0, { timeout: 5_000 })
    await page.waitForTimeout(500)
    await capture(page, '07-no-access')
  })
})
