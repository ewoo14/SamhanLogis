import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #845 DS-3b 라이브 GUI QA — L1~L6 (PM 직접 수행)
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다. 실서버(게이트웨이 :8080)와
 * 실 렌더러(vite.renderer.dev.config.ts · HashRouter)를 대상으로만 실행한다.
 *
 * 단계별 스크린샷을 docs/qa/845-ds3b-live-qa-2026-07-22/ 에 남긴다.
 * 전용 throwaway docType 만 사용하고 종료 시 정리한다(공유 실데이터 무변경).
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

// cwd = clients/desktop (ESM 스코프라 __dirname 불가 — process.cwd() 기준)
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '845-ds3b-live-qa-2026-07-22'))
const TEMPLATE_NAME = 'PM 라이브QA GUI 양식'
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

test.use({ viewport: { width: 1600, height: 1000 } })

test('DS-3b L1~L6 — 목록·편집기·요소·저장·재진입 (GUI)', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (name: string) => {
    await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })
  }

  // ── 로그인(실서버 JWT) + 렌더러 auth 주입 ────────────────────────────
  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}` }
  await page.addInitScript(
    (v: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ ...v, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' },
  )

  // 이전 실행 잔재 정리
  const before = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers: auth })
  expect(before.ok(), `양식 목록 조회 실패: HTTP ${before.status()}`).toBeTruthy()
  const beforeRows = (await before.json()).data ?? []
  for (const t of beforeRows) {
    if (t.name === TEMPLATE_NAME) {
      if (t.status === 'ACTIVE') await page.request.post(`${API_BASE}/admin/groupware/document-templates/${t.id}/deactivate`, { headers: auth })
      await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers: auth })
    }
  }

  let createdId = ''
  try {
    // ── L1: 사이드바 진입 → 목록 표시 · UUID 미노출 ──────────────────
    await test.step('L1 목록', async () => {
      await page.goto(`${BASE_URL}/#/groupware/document-templates`)
      await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
      await expect(page.getByRole('table')).toBeVisible()
      await shot('L1-목록')
      const tableText = (await page.getByRole('table').innerText()) ?? ''
      expect(UUID_RE.test(tableText), `L1 위반 — 목록에 UUID 노출: ${tableText.match(UUID_RE)?.[0]}`).toBeFalsy()
    })

    // ── L2: 신규 양식 → 3-pane 편집기 ────────────────────────────────
    await test.step('L2 편집기 진입', async () => {
      await page.getByRole('button', { name: '신규 문서 양식' }).click()
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
      await expect(page.getByRole('region', { name: '요소 팔레트' })).toBeVisible()
      await expect(page.getByTestId('document-template-live-preview')).toBeVisible()
      const select = page.getByLabel('문서 유형')
      const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
      expect(values.length, 'GROUPWARE docType 옵션이 없음').toBeGreaterThan(0)
      await select.selectOption(values[0]!)
      await page.getByLabel('양식명').fill(TEMPLATE_NAME)
      await shot('L2-편집기-3pane')
    })

    // ── L3: 문구(TEXT) 추가 → 속성 변경 → 미리보기 즉시 반영 ─────────
    await test.step('L3 문구 추가·속성 변경 즉시 반영', async () => {
      const preview = page.getByTestId('document-template-live-preview')
      const beforeAdd = await preview.innerHTML()
      await page.getByRole('button', { name: '문구 추가' }).click()
      await shot('L3a-문구추가-직후')
      await expect.poll(async () => (await preview.innerHTML()) !== beforeAdd, { timeout: 10000 }).toBeTruthy()

      // 캔버스에서 방금 추가한 '문구' 요소 선택 → 속성 패널 노출
      await page.getByRole('button', { name: '문구', exact: true }).click()
      await expect(page.getByRole('group', { name: '스타일' })).toBeVisible()
      await shot('L3b-문구-속성패널')

      // (1) 굵게 — 체크 시 미리보기 HTML 이 바뀌어야 한다
      const beforeBold = await preview.innerHTML()
      await page.getByRole('checkbox', { name: '굵게' }).check()
      await expect.poll(async () => (await preview.innerHTML()) !== beforeBold, { timeout: 10000 })
        .toBeTruthy()

      // (2) 정렬 — 가운데
      const beforeAlign = await preview.innerHTML()
      await page.getByLabel('정렬').selectOption('center')
      await expect.poll(async () => (await preview.innerHTML()) !== beforeAlign, { timeout: 10000 })
        .toBeTruthy()

      // (3) 좌표 — 위치(%) x/y 변경
      // 화면의 'x'/'y' 글자는 aria-hidden 이고 실제 접근성 이름은 GEOMETRY_LABEL 값이다.
      const beforeGeo = await preview.innerHTML()
      await page.getByLabel('가로 위치(x, %)').fill('12')
      await page.getByLabel('세로 위치(y, %)').fill('34')
      await expect.poll(async () => (await preview.innerHTML()) !== beforeGeo, { timeout: 10000 })
        .toBeTruthy()

      // 🔴 PM 직접 발견 — 요소 기본 w=100 이라 x 를 0 보다 크게 하는 순간 x+w>100 으로 즉시 무효가 되어
      // 저장이 막힌다(templateSchema.ts:205). 각 입력은 min=0/max=100 안에 있어 화면상 벗어난 값이
      // 없는데 안내는 "밴드 상대 백분율 범위여야 합니다" 뿐이라 실제 제약(x+w≤100)을 특정하지 못한다.
      // 이 상태를 증거로 남긴다.
      await expect(page.getByRole('alert')).toContainText('밴드 상대 백분율')
      await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
      await expect(page.getByLabel('가로 위치(x, %)')).toHaveValue('12')
      await expect(page.getByLabel('가로 크기(w, %)')).toHaveValue('100')
      await shot('L3d-발견-x변경만으로-저장불가')

      // 시나리오 완주를 위해 w 를 줄여 유효 범위로 되돌린다(12+60=72 ≤ 100).
      await page.getByLabel('가로 크기(w, %)').fill('60')
      await expect(page.getByRole('alert')).toHaveCount(0)
      await shot('L3c-정렬-굵기-좌표-반영')
    })

    // ── L4: 필드(FIELD) 추가 ─────────────────────────────────────────
    await test.step('L4 필드 추가', async () => {
      await page.getByRole('button', { name: '필드 추가' }).click()
      await shot('L4-필드추가')
    })

    // ── L5: 결재란 추가 · 1개 초과 불가 ──────────────────────────────
    await test.step('L5 결재란', async () => {
      const addGrid = page.getByRole('button', { name: '결재란 추가' })
      await addGrid.click()
      await shot('L5a-결재란-추가')
      await addGrid.click()
      await shot('L5b-결재란-중복시도')
    })

    // ── L6: 저장 → 목록 복귀 → 재진입 시 전부 복원 ───────────────────
    await test.step('L6 저장·재진입', async () => {
      await expect(page.getByText('저장하지 않은 변경이 있습니다.')).toBeVisible()
      const save = page.getByRole('button', { name: '저장' })
      await expect(save).toBeEnabled()
      await save.click()
      await expect(page.getByText('저장된 상태입니다.')).toBeVisible({ timeout: 20000 })
      await shot('L6a-저장직후')
      createdId = page.url().split('/document-templates/')[1]?.split('/')[0] ?? ''

      await page.getByRole('button', { name: '목록' }).click()
      await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
      await shot('L6b-목록복귀')

      await page.getByRole('button', { name: TEMPLATE_NAME }).click()
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
      await expect(page.getByLabel('양식명')).toHaveValue(TEMPLATE_NAME)
      await expect(page.getByText('저장된 상태입니다.')).toBeVisible()

      // 🔴 L6 핵심 — geometry/style/binding 소실 0 (R2 라이브 대응)
      // 화면에 그려진 요소를 다시 선택해 L3 에서 넣은 값이 그대로인지 단언한다.
      await page.getByRole('button', { name: '문구', exact: true }).click()
      await expect(page.getByLabel('가로 위치(x, %)'), 'L6 위반 — geometry.x 소실').toHaveValue('12')
      await expect(page.getByLabel('세로 위치(y, %)'), 'L6 위반 — geometry.y 소실').toHaveValue('34')
      await expect(page.getByLabel('가로 크기(w, %)'), 'L6 위반 — geometry.w 소실').toHaveValue('60')
      await expect(page.getByRole('checkbox', { name: '굵게' }), 'L6 위반 — style.bold 소실').toBeChecked()
      await expect(page.getByLabel('정렬'), 'L6 위반 — style.align 소실').toHaveValue('center')
      await shot('L6c-재진입-문구-geometry-style-복원')

      await page.getByRole('button', { name: '필드', exact: true }).click()
      await expect(page.getByLabel('표시할 값'), 'L6 위반 — FIELD binding 소실').not.toHaveValue('')
      await shot('L6d-재진입-필드-binding-복원')

      // 결재란이 여전히 1개인지(중복 저장 방지) 확인
      await expect(page.getByRole('button', { name: '결재란', exact: true })).toHaveCount(1)
    })
  } finally {
    // ── QA 잔재 정리 (공유 실데이터 무변경 원칙) ─────────────────────
    const after = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers: auth })
    if (after.ok()) {
      for (const t of ((await after.json()).data ?? [])) {
        if (t.name === TEMPLATE_NAME || t.id === createdId) {
          if (t.status === 'ACTIVE') await page.request.post(`${API_BASE}/admin/groupware/document-templates/${t.id}/deactivate`, { headers: auth })
          await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers: auth })
        }
      }
    }
  }
})
