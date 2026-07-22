/**
 * #869 DS-4 — BODY 복수 positioned 요소 회귀 라이브 실측 QA (PM 직접 수행)
 *
 * CODEX SOL 5.6 이 잡은 [NEW][MAJOR] 도달가능 회귀의 라이브 확증.
 *   회귀: 요소마다 positionedElementLayer([element]) → 레이어마다 min-height:24mm + grid gap 5mm
 *         ⟹ BODY 요소 하나당 문서가 ~29mm(≈110px) 길어진다
 *
 * 🚨 pre/post 실측으로 하네스 유효성을 증명했다 (PM 직접):
 *      fix 이전 b7f3fccc5  요소 1개 추가 시 본문 77→187px · 두 요소 간격 110px  → RED
 *      fix 이후 9e13416e4  요소 1개 추가 시 본문 77→115px · 두 요소 간격  37px  → GREEN
 *   fix : BODY 콘텐츠 자체가 단일 position:relative 원점 · min-height 예약 1회
 *
 * 🚨 이 스펙은 "레이어 수" 같은 구현 내부가 아니라 **사용자가 보는 실제 기하**를 잰다.
 *    구현을 바꿔도 사용자 결과가 같으면 통과해야 하고, 결과가 틀어지면 실패해야 한다.
 *
 * 🔑 왜 BODY 의 TEXT 인가 — PM 이 IMAGE 로 먼저 쟀다가 **fix 이전/이후가 똑같이 통과**해서
 *    하네스를 폐기하고 다시 짰다. IMAGE 는 HEADER 밴드로 들어가고 header 는
 *    `positionedElementLayer(headerPositioned, …)` 로 **모든 요소를 한 레이어에** 담으며
 *    그 줄은 이 fix 가 건드리지도 않는다 — 즉 변하지 않는 곳을 재고 있었다.
 *    회귀는 **BODY** 에서 일어나므로 BODY 로 들어가는 TEXT 를 쓰고, 선택자도
 *    `.approval-doc-print-content` 안으로 좁힌다.
 *
 * 🚨 이 스펙은 fix 이전 코드(b7f3fccc5)에 대해 **반드시 RED 여야 한다.**
 *    RED 를 못 내는 하네스는 통과해도 아무것도 증명하지 않는다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '869-ds4-body-layer-2026-07-23')

test.use({ viewport: { width: 1600, height: 1100 } })

test('DS-4 회귀 — BODY 요소마다 24mm 밴드가 예약되지 않는다', async ({ page }) => {
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
  const addText = page.getByRole('button', { name: '문구 추가' })
  const templateName = `DS4 회귀실측 ${Date.now()}`

  /** 미리보기 안의 positioned 요소들의 실제 화면 좌표를 잰다. */
  const measure = async () => preview.locator('.approval-doc-print-content [data-template-element]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), left: Math.round(r.left), h: Math.round(r.height) }
    }))
  /** 인쇄 본문 박스의 실제 높이 — 요소를 더한다고 늘어나면 안 된다(R2). */
  const bodyHeight = async () => preview.locator('.approval-doc-print-content').first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().height))

  await page.goto(`${BASE_URL}/#/groupware/document-templates`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '신규 문서 양식' }).click()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
  await expect(preview).toBeVisible()

  let h0 = 0
  let h1 = 0
  await test.step('기준선 — 요소 0개, 1개일 때의 본문 높이', async () => {
    h0 = await bodyHeight()
    await expect(addText, 'TEXT 팔레트 버튼이 없다').toBeVisible()
    await addText.click()
    // 양성 — 첫 요소가 실제로 렌더됐다(이후 비교가 공허해지지 않게)
    await expect(preview.locator('.approval-doc-print-content [data-template-element]'),
      '첫 positioned 요소가 미리보기에 렌더되지 않았다').toHaveCount(1, { timeout: 10000 })
    h1 = await bodyHeight()
    console.log(`■ 본문 높이 — 요소 0개=${h0}px · 1개=${h1}px`)
    await shot('B1-요소1개')
  })

  await test.step('🔴 R1 — 두 번째 요소가 24mm 밴드만큼 밀리지 않는다', async () => {
    await addText.click()
    await expect(preview.locator('.approval-doc-print-content [data-template-element]'),
      '두 번째 BODY 요소가 렌더되지 않아 회귀 시험이 성립하지 않는다').toHaveCount(2, { timeout: 10000 })
    const rects = await measure()
    console.log(`■ 두 요소 실측 = ${JSON.stringify(rects)}`)

    // 회귀 상태: 요소마다 min-height:24mm 레이어(≈91px @96dpi) + grid gap 5mm(≈19px)
    //            ⟹ 두 번째 요소의 top 이 ≈110px 아래로 밀린다
    // 정상 상태: 요소는 본문 grid 의 평범한 자식이라 자기 글줄 높이 + gap 만큼만 내려온다
    const delta = Math.abs(rects[1]!.top - rects[0]!.top)
    console.log(`■ 두 요소의 top 간격 = ${delta}px (24mm 밴드 ≈ 91px)`)
    expect(delta, `두 번째 요소가 ${delta}px 밀렸다 — 요소마다 24mm 밴드가 예약되는 회귀다`)
      .toBeLessThan(60)
    await shot('B2-요소2개')
  })

  await test.step('🔴 R2 — 요소를 더해도 문서가 요소마다 24mm 씩 길어지지 않는다', async () => {
    const h2 = await bodyHeight()
    const grow = h2 - h1
    console.log(`■ 본문 높이 — 1개=${h1}px · 2개=${h2}px · 증가=${grow}px`)
    expect(grow, `positioned 요소를 하나 더했더니 본문이 ${grow}px 길어졌다 — 요소마다 24mm 밴드가 예약되는 회귀다`)
      .toBeLessThan(60)
  })

  let savedTemplateId = ''
  await test.step('실 BE 왕복 후에도 기하가 유지된다', async () => {
    const docType = page.getByLabel('문서 유형')
    const values = await docType.locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
    expect(values.length, 'GROUPWARE docType 옵션이 없어 저장 경로에 도달할 수 없다').toBeGreaterThan(0)
    await docType.selectOption(values[0]!)
    await page.getByRole('textbox', { name: '양식명' }).fill(templateName)
    const saved = page.waitForResponse((r) =>
      r.url().includes('/document-templates') && ['POST', 'PUT'].includes(r.request().method()), { timeout: 20000 })
    await page.getByRole('button', { name: '저장' }).click()
    const res = await saved
    expect(res.status(), `실 BE 저장 실패 HTTP ${res.status()}`).toBeLessThan(400)
    savedTemplateId = String((await res.json()).data?.id ?? '')
    expect(savedTemplateId, '저장 응답에 template id 가 없다').not.toBe('')

    // 목록 → 재진입 (JSONB 왕복)
    await page.getByRole('button', { name: '목록' }).click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 15000 })
    const entry = page.getByRole('button', { name: templateName })
    await expect(entry, '저장한 양식이 목록에 없다').toBeVisible({ timeout: 15000 })
    await entry.click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    await expect(preview.locator('.approval-doc-print-content [data-template-element]'),
      '재진입 후 두 요소가 복원되지 않았다').toHaveCount(2, { timeout: 15000 })

    const rects = await measure()
    const gap = Math.abs(rects[1]!.top - rects[0]!.top)
    console.log(`■ BE 왕복 후 top 간격 = ${gap}px · ${JSON.stringify(rects)}`)
    expect(gap, `BE 왕복 후 두 번째 요소가 ${gap}px 밀렸다`).toBeLessThan(60)
    await shot('B3-BE왕복후')
  })

  await test.step('인쇄 미디어에서도 같은 높이를 유지한다', async () => {
    await page.emulateMedia({ media: 'print' })
    await expect(preview.locator('.paper')).toBeVisible()
    const rects = await measure()
    const gap = Math.abs(rects[1]!.top - rects[0]!.top)
    console.log(`■ print 미디어 top 간격 = ${gap}px`)
    expect(gap, `인쇄 미디어에서 두 번째 요소가 ${gap}px 밀렸다`).toBeLessThan(60)
    await shot('B4-인쇄미디어')
    await page.emulateMedia({ media: 'screen' })
  })

  // ── 정리 — 공유 실 DB 에 throwaway 를 남기지 않는다 ───────────────
  await test.step('QA 잔재 정리', async () => {
    const listRes = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, {
      headers: { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' },
    })
    const items: Array<{ id: string; name: string }> = listRes.ok() ? ((await listRes.json()).data ?? []) : []
    const mine = items.filter((t) => t.name?.startsWith('DS4 회귀실측'))
    for (const t of mine) {
      const del = await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, {
        headers: { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' },
      })
      console.log(`■ 정리 ${t.name} → HTTP ${del.status()}`)
    }
    console.log(`■ 정리 대상 ${mine.length}건`)
  })
})
