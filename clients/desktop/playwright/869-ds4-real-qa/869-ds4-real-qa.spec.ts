/**
 * #845 DS-4 — 반복 detail 밴드 · 이미지/로고 실서버 라이브 GUI QA (PM 직접 수행)
 *
 * 구현자는 mock Playwright 와 로컬 `page.pdf()` 까지만 했고 실서버 라이브QA 는 하지 않았다고
 * 정직 보고했다. 여기서 그 공백을 닫는다.
 *
 * 핵심 질문 — **신규 schema v2 요소(DETAIL/IMAGE)가 실 BE 를 왕복하는가.**
 * `DocumentPayloadValidator` 가 새 타입을 거부하면 저장 자체가 실패한다. mock 은 이걸 못 잡는다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '869-ds4-live-qa-2026-07-23')

test.use({ viewport: { width: 1600, height: 1100 } })

test('DS-4 — 품목행·이미지 요소가 실 BE 를 왕복한다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  const preview = page.getByTestId('document-template-live-preview')
  const detailLayer = page.getByTestId('document-template-detail-layer')
  const templateName = `DS4 실서버QA ${Date.now()}`

  await test.step('D1 편집기 진입 후 품목행·이미지 추가', async () => {
    await page.goto(`${BASE_URL}/#/groupware/document-templates`)
    await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: '신규 문서 양식' }).click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    await expect(preview).toBeVisible()

    // 양성 — 신규 팔레트 버튼이 실제로 있다
    const addDetail = page.getByRole('button', { name: '품목행 추가' })
    const addImage = page.getByRole('button', { name: '이미지/로고 추가' })
    await expect(addDetail, 'DETAIL 팔레트 버튼이 없다').toBeVisible()
    await expect(addImage, 'IMAGE 팔레트 버튼이 없다').toBeVisible()

    await addDetail.click()
    await addImage.click()
    await shot('D1-요소추가')

    // 양성 — 미리보기에 품목행 레이어가 실제로 렌더된다
    await expect(detailLayer, '품목행 레이어가 미리보기에 렌더되지 않는다').toBeVisible({ timeout: 10000 })
    // 열 헤더가 실제 텍스트로 나온다 (presence 가 아니라 구별 출력)
    await expect(detailLayer).toContainText('품목')
    await expect(detailLayer).toContainText('공급가액')
    await expect(detailLayer).toContainText('부가세')
    // 이미지가 실제로 로드된다 (naturalWidth > 0 — src 만 있고 깨진 경우를 배제)
    const img = preview.locator('img').first()
    await expect(img, '이미지 요소가 미리보기에 없다').toBeVisible({ timeout: 10000 })
    const natural = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)
    expect(natural, '이미지가 렌더는 되지만 실제로 로드되지 않았다(naturalWidth=0)').toBeGreaterThan(0)
    console.log(`■ 이미지 naturalWidth = ${natural}`)
  })

  await test.step('D2 실 BE 저장 — DocumentPayloadValidator 가 신규 타입을 받는가', async () => {
    await page.getByRole('textbox', { name: '양식명' }).fill(templateName)
    // 저장 응답을 직접 관측한다 — 화면 문구만 보면 실패를 놓칠 수 있다
    const saved = page.waitForResponse((r) =>
      r.url().includes('/document-templates') && ['POST', 'PUT'].includes(r.request().method()), { timeout: 20000 })
    await page.getByRole('button', { name: '저장' }).click()
    const res = await saved
    console.log(`■ 저장 응답 = ${res.request().method()} ${res.status()}`)
    expect(res.status(), `실 BE 저장 실패 — DocumentPayloadValidator 가 신규 요소를 거부했을 수 있다`)
      .toBeLessThan(400)
    await expect(page.getByText('저장된 상태입니다.')).toBeVisible({ timeout: 15000 })
    await shot('D2-저장완료')
  })

  await test.step('D3 재진입 — 품목행·이미지가 실 DB 에서 복원된다', async () => {
    await page.getByRole('button', { name: '목록' }).click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 15000 })
    const row = page.getByRole('row').filter({ hasText: templateName })
    await expect(row, '저장한 양식이 목록에 없다').toBeVisible({ timeout: 15000 })
    await row.getByRole('link', { name: /편집|수정/ }).or(row.getByRole('button', { name: /편집|수정/ })).first().click()

    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    // 양성 — JSONB 왕복 후에도 두 요소가 살아있다
    await expect(detailLayer, '재진입 시 품목행 레이어가 복원되지 않았다').toBeVisible({ timeout: 15000 })
    await expect(detailLayer).toContainText('공급가액')
    const img2 = preview.locator('img').first()
    await expect(img2, '재진입 시 이미지가 복원되지 않았다').toBeVisible({ timeout: 10000 })
    const natural2 = await img2.evaluate((el) => (el as HTMLImageElement).naturalWidth)
    expect(natural2, '재진입 이미지가 로드되지 않았다').toBeGreaterThan(0)
    await shot('D3-재진입-복원')
  })

  await test.step('D4 인쇄 미디어 — 신규 요소가 본문에 남고 편집기 UI 는 사라진다', async () => {
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.document-template-editor-pane--palette')).toBeHidden()
    await expect(page.locator('header.no-print h1')).toBeHidden()
    // 신규 요소는 인쇄 본문에 남아야 한다
    await expect(preview.locator('.paper')).toBeVisible()
    await expect(detailLayer, '인쇄 시 품목행이 사라진다').toBeVisible()
    await shot('D4-인쇄미디어')
    await page.emulateMedia({ media: 'screen' })
  })
})
