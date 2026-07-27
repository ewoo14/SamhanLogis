import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
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

// SONNET5 R5 라운드 fix: 하네스가 HashRouter(5191)에서 BrowserRouter(5291)로 바뀐 뒤 갱신되지 않았던
// fallback — AUDIT_BASE_URL 미지정 시 고아 vite/구 라우팅으로 false-RED 를 냈다(동일 패턴 전수 스윕,
// [[feedback_defect_family_sweep_fix]] — ds4-body-layer-regression-real-qa.spec.ts 에서 먼저 발견).
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '869-ds4-live-qa-2026-07-23'))

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

  try {
  await test.step('D1 편집기 진입 후 품목행·이미지 추가', async () => {
    // 웹(vite) 하네스는 BrowserRouter — `#/…` 해시는 무시되고 홈이 렌더된다(실측). 경로로 이동한다.
    await page.goto(`${BASE_URL}/groupware/document-templates`)
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

  let savedTemplateId = ''
  await test.step('D2 실 BE 저장·활성화 게이트 — 신규 타입은 저장되지만 ACTIVE 승격은 막힌다', async () => {
    // 🚨 문서 유형을 고르지 않으면 예약 docType(GROUPWARE_DEFAULT)이 나가 422 로 거절된다.
    //    기존 L1~L6 하네스와 동일하게 실제 옵션을 골라야 저장 경로에 도달한다(PM 실측).
    const docType = page.getByLabel('문서 유형')
    const values = await docType.locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
    expect(values.length, 'GROUPWARE docType 옵션이 없어 저장 경로에 도달할 수 없다').toBeGreaterThan(0)
    await docType.selectOption(values[0]!)
    await page.getByRole('textbox', { name: '양식명' }).fill(templateName)
    // 저장 응답을 직접 관측한다 — 화면 문구만 보면 실패를 놓칠 수 있다
    const saved = page.waitForResponse((r) =>
      r.url().includes('/document-templates') && ['POST', 'PUT'].includes(r.request().method()), { timeout: 20000 })
    await page.getByRole('button', { name: '저장' }).click()
    const res = await saved
    const savedBody = await res.json()
    savedTemplateId = String(savedBody.data?.id ?? '')
    console.log(`■ 저장 응답 = ${res.request().method()} ${res.status()}`)
    if (res.status() >= 400) {
      console.log(`■ 422 본문 = ${(await res.text()).slice(0, 500)}`)
      const req = res.request().postData() ?? ''
      console.log(`■ 요청 본문 일부 = ${req.slice(0, 700)}`)
    }
    expect(res.status(), `실 BE 저장 실패 — DocumentPayloadValidator 가 신규 요소를 거부했을 수 있다`)
      .toBeLessThan(400)
    await expect(page.getByText('저장된 상태입니다.')).toBeVisible({ timeout: 15000 })
    expect(savedTemplateId, '저장 응답에 template id가 없다').not.toBe('')
    const activation = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${savedTemplateId}/activate`, {
      headers: { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' },
    })
    console.log(`■ DETAIL/IMAGE 활성화 응답 = ${activation.status()} ${(await activation.text()).slice(0, 300)}`)
    expect(activation.status(), 'BE 권위 활성화 게이트가 우회되었다').toBe(422)
    await shot('D2-저장완료')
  })

  await test.step('D3 재진입 — 품목행·이미지가 실 DB 에서 복원된다', async () => {
    await page.getByRole('button', { name: '목록' }).click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 15000 })
    // 기존 L1~L6 하네스와 동일 — 목록의 양식명 버튼으로 재진입한다
    const entry = page.getByRole('button', { name: templateName })
    await expect(entry, '저장한 양식이 목록에 없다').toBeVisible({ timeout: 15000 })
    await entry.click()

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

  await test.step('D5 실제 결재문서 /print — 편집기 preview가 아닌 ApprovalDocView route를 연다', async () => {
    const approvals = await page.request.get(`${API_BASE}/admin/groupware/approvals?status=APPROVED`, {
      headers: { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' },
    })
    expect(approvals.ok(), `승인 결재 목록 조회 실패: HTTP ${approvals.status()}`).toBeTruthy()
    const approvalsBody = await approvals.json()
    const approved = (approvalsBody.data ?? []) as Array<{ approvalId?: string }>
    expect(approved.length, '실제 /print를 열 승인 완료 결재문서가 없다').toBeGreaterThan(0)
    const approvalId = approved[0]?.approvalId
    expect(approvalId).toBeTruthy()
    await page.goto(`${BASE_URL}/groupware/approvals/${approvalId}/print`)
    await expect(page.locator('.print-approval-doc')).toBeVisible({ timeout: 20000 })
    await page.emulateMedia({ media: 'print' })
    console.log(`■ 실제 결재문서 /print DOM 확인 = approvalId=${approvalId}`)
    await shot('D5-실제결재문서-print')
    await page.emulateMedia({ media: 'screen' })
  })

  // ── 정리 ─────────────────────────────────────────────────────────
  // 🚨 공유 실 DB 에 throwaway 가 남지 않게 한다(라이브QA 공유데이터 규칙).
  //    하네스가 자기 정리를 하지 않으면 실행할 때마다 실 양식 목록이 오염된다.
  } finally {
    await test.step('QA 잔재 정리 — 생성한 양식 삭제', async () => {
    const listRes = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, {
      headers: { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' },
    })
    const items: Array<{ id: string; name: string }> = listRes.ok() ? ((await listRes.json()).data ?? []) : []
    const mine = items.filter((t) => t.name?.startsWith('DS4 실서버QA'))
    for (const t of mine) {
      const del = await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, {
        headers: { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' },
      })
      console.log(`■ 정리 ${t.name} → HTTP ${del.status()}`)
    }
    console.log(`■ 정리 대상 ${mine.length}건`)
    })
  }
})
