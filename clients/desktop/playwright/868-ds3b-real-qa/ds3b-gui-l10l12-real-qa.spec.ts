import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #845 DS-3b 라이브 GUI QA — L10(ACTIVE 편집 차단) · L12(인쇄 미디어 no-print)
 *
 * PM 직접 수행. 실서버(:8080) + 실 렌더러(HashRouter) 대상.
 * throwaway 양식만 사용하고 종료 시 정리한다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '845-ds3b-live-qa-2026-07-22'))
const TEMPLATE_NAME = 'PM 라이브QA L10L12 양식'

const V2_DOC = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'h', kind: 'HEADER', elements: [{ key: 'h-title', type: 'TITLE' }, { key: 'h-grid', type: 'APPROVAL_GRID' }] },
    { key: 'b', kind: 'BODY', elements: [{ key: 'b-text', type: 'TEXT', text: 'L12 인쇄 대상 본문', geometry: { x: 5, y: 5, w: 60, h: 10 }, style: { bold: true, align: 'center' } }] },
    { key: 'f', kind: 'FOOTER', elements: [{ key: 'f-close', type: 'CLOSING' }] },
  ],
}

test.use({ viewport: { width: 1600, height: 1000 } })

test('DS-3b L10·L12 — ACTIVE 편집 차단 / 인쇄 미디어 no-print', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}` }
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  const purge = async () => {
    const r = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers: auth })
    if (!r.ok()) return
    for (const t of ((await r.json()).data ?? [])) {
      if (t.name === TEMPLATE_NAME) {
        if (t.status === 'ACTIVE') await page.request.post(`${API_BASE}/admin/groupware/document-templates/${t.id}/deactivate`, { headers: auth })
        await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers: auth })
      }
    }
  }
  await purge()

  // 픽스처: docType 은 편집기가 노출하는 GROUPWARE 목록에서 고른다.
  const types = await page.request.get(`${API_BASE}/admin/groupware/approval-line-configs/doc-types`, { headers: auth })
  let docType = 'GROUPWARE_QA_DS3B_L10L12'
  if (types.ok()) {
    const list = (await types.json()).data ?? []
    const gw = list.filter((o: { kind?: string }) => o.kind === 'GROUPWARE')
    if (gw.length) docType = gw[0].value ?? docType
  }

  let id = ''
  try {
    const created = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
      headers: auth, data: { docType, name: TEMPLATE_NAME, schemaVersion: 2, document: V2_DOC },
    })
    expect(created.ok(), `픽스처 생성 실패: HTTP ${created.status()} ${await created.text()}`).toBeTruthy()
    id = (await created.json()).data.id

    // ── L10: ACTIVE 상태에서 편집 차단 ───────────────────────────────
    await test.step('L10 ACTIVE 편집 차단', async () => {
      const act = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, { headers: auth })
      expect(act.ok(), `활성화 실패: HTTP ${act.status()}`).toBeTruthy()

      await page.goto(`${BASE_URL}/#/groupware/document-templates/${id}/edit`)
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })

      // 한국어 안내가 뜬다
      await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다. 비활성화 후 편집하세요.')).toBeVisible()
      // 부작용 고지도 함께 노출된다
      await expect(page.getByText('편집을 시작하면 이 문서 유형은 사용 중인 양식이 없는 상태가 되며')).toBeVisible()
      // 편집 조작 자체가 막힌다
      await expect(page.getByRole('button', { name: '문구 추가' })).toBeDisabled()
      await expect(page.getByRole('button', { name: '결재란 추가' })).toBeDisabled()
      await expect(page.getByLabel('양식명')).toBeDisabled()
      await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
      // 422 원문/에러코드가 화면에 노출되지 않는다
      const body = await page.locator('body').innerText()
      expect(body, 'L10 위반 — 원문 상태코드 노출').not.toContain('422')
      expect(body, 'L10 위반 — 에러코드 노출').not.toContain('INVALID_INPUT')
      await shot('L10a-ACTIVE-편집차단')

      // 편집 시작(비활성화) → 편집 가능 전환
      await page.getByRole('button', { name: '편집 시작' }).click()
      await expect(page.getByRole('button', { name: '문구 추가' })).toBeEnabled({ timeout: 20000 })
      await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다. 비활성화 후 편집하세요.')).toHaveCount(0)
      await shot('L10b-편집시작-후-해제')
    })

    // ── L12: 인쇄 미디어에서 편집기 UI 가 인쇄물에 미포함 ─────────────
    await test.step('L12 인쇄 미디어 no-print', async () => {
      // 화면(screen) 기준으로는 편집기 UI 가 보인다
      await expect(page.getByRole('region', { name: '요소 팔레트' })).toBeVisible()
      await expect(page.getByRole('heading', { name: '라이브 미리보기' })).toBeVisible()

      await page.emulateMedia({ media: 'print' })

      // no-print 대상은 인쇄물에서 사라진다
      await expect(page.getByRole('region', { name: '요소 팔레트' }), 'L12 위반 — 팔레트가 인쇄물에 포함').toBeHidden()
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' }), 'L12 위반 — 편집기 헤더가 인쇄물에 포함').toBeHidden()
      await expect(page.getByRole('heading', { name: '라이브 미리보기' }), 'L12 위반 — 미리보기 라벨이 인쇄물에 포함').toBeHidden()
      await expect(page.getByRole('button', { name: '저장' }), 'L12 위반 — 저장 버튼이 인쇄물에 포함').toBeHidden()

      // 정작 인쇄돼야 할 문서 본문은 남는다
      // SONNET5 라운드 fix(N-7/Q-1 파생): PR #914가 도입한 인쇄 폭 사전측정 ruler(printRuler)가
      // 화면 사본과 별개로 같은 텍스트를 aria-hidden·visibility:hidden 사본으로 하나 더 렌더한다
      // (인쇄 시 A4 고정폭 줄바꿈을 화면 미디어 전환 이전에 미리 계산해 두기 위함 — 실제 측정에
      // 필요해 display:none으로 걷어낼 수 없다). visibility:hidden은 Playwright getByText 매칭에서
      // 배제되지 않으므로(실측 확인) 바깥 getByText는 두 사본 모두와 매칭돼 strict mode violation을
      // 낸다. data-template-element(실제 화면 사본에만 붙는 속성)로 스코프하면 인쇄 측정 사본은
      // data-template-print-element를 쓰므로 모호성 없이 하나만 남는다.
      await expect(page.getByTestId('document-template-live-preview')).toBeVisible()
      await expect(page.locator('[data-template-element]').filter({ hasText: 'L12 인쇄 대상 본문' })).toBeVisible()

      await shot('L12a-인쇄미디어-편집기UI-소거')
      await page.pdf({ path: join(SHOT_DIR, 'L12b-실제출력.pdf'), format: 'A4', printBackground: true })
      await page.emulateMedia({ media: 'screen' })
    })
  } finally {
    await purge()
  }
})
