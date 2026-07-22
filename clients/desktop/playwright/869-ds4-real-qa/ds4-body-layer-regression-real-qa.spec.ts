/**
 * #869 DS-4 — BODY % geometry 좌표 원점 회귀 라이브 실측 QA (PM 직접 수행)
 *
 * 회귀: BODY % geometry 요소가 variable-height approval-doc-print-content 자체를 containing block으로 사용
 *       → legacy/flow 내용이 길어질수록 같은 저장 geometry의 top이 달라진다.
 * fix: BODY flow와 분리된 단일 position:absolute 24mm layer가 % geometry 원점을 고정한다.
 *
 * 🚨 이 스펙은 레이어 수가 아니라 사용자가 보는 실제 getBoundingClientRect()를 잰다.
 * 첫 TEXT에는 반드시 ElementInspector의 x/y/w/h를 입력한다. geometry 없는 기본 TEXT만 추가하면
 * 일반 flow 자식이라 이 회귀를 재현하지 못한다. 이후 geometry 없는 긴 flow TEXT를 추가해
 * containing block 높이를 실제로 바꾸고, 같은 positioned 요소의 rect를 다시 잰다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '869-ds4-body-layer-2026-07-23')

test.use({ viewport: { width: 1600, height: 1100 } })

test('DS-4 회귀 — BODY % geometry 요소의 좌표 원점이 flow 높이에 흔들리지 않는다', async ({ page }) => {
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

  /** `% geometry`가 실제 적용된 요소 하나의 rect만 측정한다. */
  const measurePositioned = async () => preview.locator('.approval-doc-print-content [data-template-element]').evaluateAll((els) => {
    const positioned = els.filter((el) => getComputedStyle(el).position === 'absolute')
    return positioned.map((el) => {
      const r = el.getBoundingClientRect()
      const body = el.closest('.approval-doc-print-content')?.getBoundingClientRect()
      return {
        // fill()이 긴 flow textarea를 viewport에 맞추며 scrollY를 바꿀 수 있으므로,
        // viewport 절대좌표가 아닌 실제 containing body 기준 rect를 단언한다.
        top: Math.round(r.top - (body?.top ?? 0)),
        left: Math.round(r.left - (body?.left ?? 0)),
        h: Math.round(r.height),
      }
    })
  })
  const setGeometry = async () => {
    for (const [label, value] of [
      ['가로 위치(x, %)', '10'],
      ['세로 위치(y, %)', '50'],
      ['가로 크기(w, %)', '30'],
      ['세로 크기(h, %)', '10'],
    ] as const) {
      await page.getByLabel(label).fill(value)
    }
  }

  await page.goto(`${BASE_URL}/#/groupware/document-templates`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '신규 문서 양식' }).click()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
  await expect(preview).toBeVisible()

  let anchorBeforeFlow: { top: number; left: number; h: number }
  await test.step('🔴 RED 전제 — 첫 TEXT에 실제 % geometry를 입력한다', async () => {
    await expect(addText, 'TEXT 팔레트 버튼이 없다').toBeVisible()
    await addText.click()
    await setGeometry()
    await expect(preview.locator('.approval-doc-print-content [data-template-element]'),
      '첫 positioned 요소가 미리보기에 렌더되지 않았다').toHaveCount(1, { timeout: 10000 })
    const positioned = await measurePositioned()
    expect(positioned, 'x/y/w/h를 지정한 TEXT가 absolute positioned 요소가 아니다').toHaveLength(1)
    anchorBeforeFlow = positioned[0]!
    console.log(`■ % geometry 기준 rect = ${JSON.stringify(anchorBeforeFlow)}`)
    await shot('B1-요소1개')
  })

  await test.step('🔴 R1 — variable flow를 추가해도 같은 % geometry rect가 유지된다', async () => {
    await addText.click()
    await page.getByRole('textbox', { name: '문구' }).fill(Array.from({ length: 30 }, (_, index) => `가변 flow 본문 ${index + 1}`).join('\n'))
    await expect(preview.locator('.approval-doc-print-content [data-template-element]'),
      'flow TEXT가 렌더되지 않아 containing block 높이 변화 시험이 성립하지 않는다').toHaveCount(2, { timeout: 10000 })
    const positioned = await measurePositioned()
    expect(positioned, 'geometry가 있는 요소가 사라졌다').toHaveLength(1)
    const delta = Math.abs(positioned[0]!.top - anchorBeforeFlow.top)
    console.log(`■ flow 추가 후 positioned rect = ${JSON.stringify(positioned[0])} · top drift=${delta}px`)
    expect(delta, `legacy/flow 높이 변화로 % geometry top이 ${delta}px 이동했다`).toBeLessThan(8)
    await shot('B2-variable-flow')
  })

  await test.step('실 BE 왕복 후에도 % geometry가 유지된다', async () => {
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
    const savedTemplateId = String((await res.json()).data?.id ?? '')
    expect(savedTemplateId, '저장 응답에 template id가 없다').not.toBe('')

    await page.getByRole('button', { name: '목록' }).click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 15000 })
    const entry = page.getByRole('button', { name: templateName })
    await expect(entry, '저장한 양식이 목록에 없다').toBeVisible({ timeout: 15000 })
    await entry.click()
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    await expect(preview.locator('.approval-doc-print-content [data-template-element]'),
      '재진입 후 geometry/flow TEXT가 복원되지 않았다').toHaveCount(2, { timeout: 15000 })

    const positioned = await measurePositioned()
    expect(positioned).toHaveLength(1)
    const delta = Math.abs(positioned[0]!.top - anchorBeforeFlow.top)
    console.log(`■ BE 왕복 후 positioned rect = ${JSON.stringify(positioned[0])} · top drift=${delta}px`)
    expect(delta, `BE 왕복 후 % geometry top이 ${delta}px 달라졌다`).toBeLessThan(8)
    await shot('B3-BE왕복후')
  })

  await test.step('인쇄 미디어에서도 % geometry rect가 유지된다', async () => {
    await page.emulateMedia({ media: 'print' })
    await expect(preview.locator('.paper')).toBeVisible()
    const positioned = await measurePositioned()
    expect(positioned).toHaveLength(1)
    console.log(`■ print 미디어 positioned rect = ${JSON.stringify(positioned[0])}`)
    expect(Math.abs(positioned[0]!.top - anchorBeforeFlow.top), '인쇄 미디어에서 % geometry 원점이 변했다').toBeLessThan(8)
    await shot('B4-인쇄미디어')
    await page.emulateMedia({ media: 'screen' })
  })

  // ── 정리 — 공유 실 DB에 throwaway를 남기지 않는다 ───────────────
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
