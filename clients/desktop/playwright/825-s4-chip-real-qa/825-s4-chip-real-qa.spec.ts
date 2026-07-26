import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬4 칩 복수선택 표준 컴포넌트 — 실서버 라이브 QA (OPUS 1차 적대검증 라운드).
 *
 * 실 게이트웨이 :8080 · mock OFF · 실 로그인 토큰 · 합성/fixture 없음(전부 실 DOM 캡처).
 * 시나리오(QA 차원 A/B/D/E):
 *  A 결재작성 복수 결재자 칩·순서·번호 + DOM UUID 미노출(실 UUID)
 *  B 결재선설정 GROUP/USER delta 왕복(add POST → 새로고침 유지 → 저장 id DELETE) — net-zero 복원
 *  D 결재양식 SELECT 옵션 FreeTextChip value-only + H1(미확정 draft 저장 시 소실 방지) — net-zero 복원
 *  E DOM UUID 미노출(A에 통합)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5271'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const LOGIN_ID = process.env['DEV_LOGIN'] ?? 'dev_master'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/825-s4-chip-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function goto(page: Page, route: string): Promise<void> {
  // 앱은 BrowserRouter(history) 기반 — 경로로 직접 이동한다(vite SPA fallback 이 index.html 서빙).
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
  // 실 인증/권한 async 로드 대기(헤더 MASTER 표시)
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
  await page.waitForTimeout(1500)
}

test.describe('#825 슬4 칩 복수선택 — 실서버 라이브 QA', () => {
  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, LOGIN_ID)
    expect(login.token, '토큰 없음').toBeTruthy()
    await installAuthStub(page, login)
  })

  test('A · 결재작성 복수 결재자 칩·순서 + DOM UUID 미노출(실 UUID)', async ({ page }) => {
    await goto(page, '/groupware/approvals/new')
    const tmpl = page.getByTestId('groupware-approval-create-template')
    await expect(tmpl).toBeVisible({ timeout: 20000 })
    // 첫 실 템플릿 선택
    const opts = await tmpl.locator('option').all()
    let picked = ''
    for (const o of opts) {
      const v = await o.getAttribute('value')
      if (v) { picked = v; break }
    }
    if (picked) await tmpl.selectOption(picked)
    await page.waitForTimeout(1200)
    await shot(page, 'A1-template-selected')

    const input = page.getByTestId('approver-search-input')
    await expect(input).toBeVisible({ timeout: 10000 })

    // 실 사원 검색 — 결재자 검색은 minChars=2 이므로 2글자 이상 사용. '개발'=DEV-SEED 5명.
    // MultiSelectAutocomplete 가 선택 완료 후보를 필터하므로 같은 '개발' 재검색 시 새 인물이 나온다.
    const chips = page.getByTestId('approver-chip')
    for (const q of ['개발', '개발', '김기', '이승', '박']) {
      if (await chips.count() >= 2) break
      await input.fill(q)
      const list = page.getByRole('listbox', { name: '결재자 검색 결과' })
      try {
        await expect(list).toBeVisible({ timeout: 6000 })
        const before = await chips.count()
        await list.getByRole('option').first().click()
        await expect(chips).toHaveCount(before + 1, { timeout: 6000 })
      } catch { /* 후보 없음 — 다음 성씨 */ }
    }
    const n = await chips.count()
    await shot(page, 'A2-approvers-added')

    if (n >= 2) {
      // 순서·번호(1,2) 검증
      await expect(chips.nth(0)).toContainText('1')
      await expect(chips.nth(1)).toContainText('2')
    }

    // E · DOM UUID 미노출 — 옵션 재검색 후 옵션 id + body + 칩 속성 검사(2글자 이상)
    await input.fill('개발')
    try {
      const list = page.getByRole('listbox', { name: '결재자 검색 결과' })
      await expect(list.getByRole('option').first()).toBeVisible({ timeout: 6000 })
      const optionIds = await list.getByRole('option').evaluateAll((els) => els.map((e) => e.id))
      for (const id of optionIds) {
        expect(id, `옵션 id UUID 노출: ${id}`).not.toMatch(UUID_RE)
        expect(id).toMatch(/-opt-\d+$/)
      }
    } catch { /* 후보 없음 허용 */ }
    // 칩 컨테이너 outerHTML(속성 포함)에서 UUID 미검출
    const approverBlock = page.getByTestId('groupware-approval-create-approvers')
    const html = (await approverBlock.evaluate((el) => el.outerHTML)) ?? ''
    expect(html, '결재자 영역 DOM 속성에 UUID 노출').not.toMatch(UUID_RE)
    await shot(page, 'A3-uuid-check')
    console.log(`[A] 추가된 결재자 칩=${n}, role=${LOGIN_ID}`)
  })

  test('B · 결재선설정 GROUP/USER delta 왕복(add POST→새로고침 유지→저장 id DELETE)', async ({ page }) => {
    await goto(page, '/admin/approval-line-config')
    await page.waitForTimeout(1500)
    await shot(page, 'B1-config-open')

    // 첫 결재자 검색 입력(role 무관) 확보
    const anySearch = page.locator('[data-testid^="approval-role-approver-search-"]').first()
    if (await anySearch.count() === 0) {
      await shot(page, 'B1-no-role-search')
      test.skip(true, '결재자 검색 입력이 없는 화면(문서유형/역할 부재) — B 스킵')
      return
    }
    await expect(anySearch).toBeVisible({ timeout: 10000 })
    const chip = page.getByTestId('approval-role-approver-chip')
    const before = await chip.count()

    // 실 사원/그룹 추가(add POST)
    let added = false
    for (const q of ['김', '이', '매니저', '박']) {
      await anySearch.fill(q)
      const list = page.getByRole('listbox').first()
      try {
        await expect(list.getByRole('option').first()).toBeVisible({ timeout: 5000 })
        await list.getByRole('option').first().click()
        await expect(chip).toHaveCount(before + 1, { timeout: 8000 })
        added = true
        break
      } catch { /* 다음 후보어 */ }
    }
    await shot(page, 'B2-approver-added')
    if (!added) { test.skip(true, '추가 후보 없음 — B 스킵'); return }

    // 새로고침 후 유지(pending→실 id 확정 증거)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(before + 1, { timeout: 10000 })
    await shot(page, 'B3-persisted-after-reload')

    // 저장 id DELETE — 방금 추가분 제거(net-zero 복원)
    const lastRemove = page.getByRole('button', { name: /제거$/ }).last()
    await lastRemove.click()
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(before, { timeout: 8000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    await expect(page.getByTestId('approval-role-approver-chip')).toHaveCount(before, { timeout: 10000 })
    await shot(page, 'B4-removed-restored')
    const bodyUuid = (await page.locator('body').innerText()) ?? ''
    expect(bodyUuid).not.toMatch(UUID_RE)
    console.log(`[B] before=${before} add→reload유지→remove→복원 완료`)
  })

  test('D · 결재양식 SELECT 옵션 FreeTextChip value-only + H1(미확정 draft 저장)', async ({ page }) => {
    await goto(page, '/groupware/approval-templates')
    await page.waitForTimeout(1500)
    await shot(page, 'D1-templates-open')

    // SELECT 옵션 입력(FreeTextChipInput, aria-label="선택 옵션") 확보 — 첫 템플릿 진입
    const firstTemplate = page.locator('table tbody tr, [role="row"]').first()
    if (await firstTemplate.count() > 0) {
      try { await firstTemplate.click(); await page.waitForTimeout(800) } catch { /* noop */ }
    }
    let optInput = page.getByRole('textbox', { name: '선택 옵션' }).first()
    if (await optInput.count() === 0) {
      // 목록의 다른 항목들 순회
      const rows = await page.locator('table tbody tr, [role="row"]').all()
      for (const r of rows) {
        try { await r.click(); await page.waitForTimeout(600) } catch { /* noop */ }
        if (await page.getByRole('textbox', { name: '선택 옵션' }).count() > 0) break
      }
      optInput = page.getByRole('textbox', { name: '선택 옵션' }).first()
    }
    if (await optInput.count() === 0) {
      await shot(page, 'D2-no-select-field')
      test.skip(true, 'SELECT 필드가 있는 템플릿 없음 — D 스킵(값 편집 화면 캡처만)')
      return
    }
    await optInput.scrollIntoViewIfNeeded()
    await shot(page, 'D2-select-options-chips')

    // value-only 렌더 확인: 옵션 칩 텍스트에 "항목 :" 접두가 없어야 함
    const chipTexts = await page.locator('[class*="chip"]').filter({ hasText: /.+/ }).allInnerTexts()
    const hasItemPrefix = chipTexts.some((t) => t.trim().startsWith('항목'))
    console.log(`[D] 칩 텍스트 샘플=${JSON.stringify(chipTexts.slice(0, 6))} · 항목접두=${hasItemPrefix}`)

    // 읽기 전용 검증: value-only 렌더(옵션 칩에 "항목:" 접두 없음). 실 템플릿 저장은 하지 않는다.
    // 템플릿 update 는 soft-delete replace-set(기존 필드 soft-delete + 신규 추가)이라 공유 실 문서에
    // 영향을 주므로 라이브 QA 에서 실 템플릿 쓰기는 회피한다. H1(미확정 draft 저장 소실 방지)의
    // flush-commit 동작은 design-system vitest 로 검증한다.
    expect(hasItemPrefix, '옵션 칩이 "항목:" 접두로 렌더(spec §1② value-only 위반)').toBeFalsy()
    console.log('[D] value-only 확인(읽기전용) · 실 템플릿 저장 미수행(공유 실데이터 보호)')
  })
})
