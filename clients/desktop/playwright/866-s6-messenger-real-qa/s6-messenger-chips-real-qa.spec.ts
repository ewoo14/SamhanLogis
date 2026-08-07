import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #866 / #825 슬6 — 쪽지 수신자 칩 복수선택 라이브 GUI QA (PM 직접 수행)
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 * 실서버(게이트웨이 :8080) + 실 렌더러(HashRouter) 대상으로만 실행한다.
 * 발송한 QA 쪽지는 본문에 고유 마커를 넣어 종료 후 PM 이 정리한다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '866-s6-messenger-live-qa-2026-07-22'))

const MARKER = 'PMLIVEQA-S6-20260722'
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

test.use({ viewport: { width: 1600, height: 1000 } })

test('슬6 수신자 칩 복수선택 — 검색·칩·본인제외·UUID미노출·카운터·발송', async ({ page }) => {
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

  // ── S1: 메신저 진입 · 발송 폼 노출 ───────────────────────────────
  await test.step('S1 메신저 진입', async () => {
    await page.goto(`${BASE_URL}/#/messenger`)
    const pageRoot = page.getByTestId('messenger-page')
    await expect(pageRoot).toBeVisible({ timeout: 20000 })
    // 앱 헤더에도 동일 제목(h2)이 있어 페이지 범위로 좁힌다(제품 문제 아님).
    await expect(pageRoot.getByRole('heading', { name: '메신저' })).toBeVisible()
    await expect(pageRoot.getByRole('heading', { name: '메시지 발송' })).toBeVisible()
    await expect(pageRoot.getByRole('heading', { name: '수신함' })).toBeVisible()
    // MASTER 이므로 권한 경고가 없어야 한다(H-4 반대 조건)
    await expect(page.getByText('메신저 발송 권한이 없어 발송할 수 없습니다.')).toHaveCount(0)
    await shot('S1-메신저-진입')
  })

  // ── S2: 수신자 검색 → 후보 목록 · 본인 제외(H-3) ─────────────────
  await test.step('S2 수신자 검색·본인 제외', async () => {
    const input = page.getByTestId('messenger-recipient-search')
    await input.click()
    await input.fill('개발')
    const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    await expect(listbox).toBeVisible({ timeout: 15000 })
    await shot('S2a-수신자-검색결과')

    // H-3: 본인(개발마스터)은 후보에 나오지 않는다
    const optionsText = await listbox.innerText()
    expect(optionsText, 'H-3 위반 — 본인이 수신자 후보에 노출').not.toContain('개발마스터')

    // 🔴 UUID 미노출 — 후보 목록 텍스트에 UUID 형태가 없어야 한다
    expect(UUID_RE.test(optionsText), `UUID 노출: ${optionsText.match(UUID_RE)?.[0]}`).toBeFalsy()
  })

  // ── S3: 칩 복수선택 (이 슬라이스의 핵심) ─────────────────────────
  await test.step('S3 칩 2개 선택', async () => {
    const listbox = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    await listbox.getByRole('option').first().click()
    await expect(page.getByTestId('messenger-recipient-chip')).toHaveCount(1)

    const input = page.getByTestId('messenger-recipient-search')
    await input.fill('개발')
    await expect(listbox).toBeVisible({ timeout: 15000 })
    await listbox.getByRole('option').first().click()
    await expect(page.getByTestId('messenger-recipient-chip'), '복수선택 실패').toHaveCount(2)
    await shot('S3-칩-2개-선택')

    // 칩 텍스트에도 UUID 가 없어야 한다
    const chipsText = await page.getByTestId('messenger-recipient-chip').allInnerTexts()
    expect(UUID_RE.test(chipsText.join(' ')), 'UUID 노출(칩)').toBeFalsy()
  })

  // ── S4: 본문 입력 + 카운터 반영 ──────────────────────────────────
  await test.step('S4 본문·카운터', async () => {
    const body = page.getByTestId('messenger-body')
    const text = `${MARKER} PM 라이브QA 복수 수신 발송 검증`
    await body.fill(text)
    await expect(page.getByTestId('messenger-body-counter')).toContainText(`${text.length} / 2000자`)
    await shot('S4-본문-카운터')
  })

  // ── S5: 2000자 초과 절단 안내 (M-6) ─────────────────────────────
  await test.step('S5 2000자 절단 안내', async () => {
    const body = page.getByTestId('messenger-body')
    await body.fill('가'.repeat(2100))
    await expect(page.getByTestId('messenger-body-counter')).toContainText('2000 / 2000자')
    await shot('S5-2000자-절단')
    // 되돌리기
    const text = `${MARKER} PM 라이브QA 복수 수신 발송 검증`
    await body.fill(text)
    await expect(page.getByTestId('messenger-body-counter')).toContainText(`${text.length} / 2000자`)
  })

  // ── S6: 발송 → 성공 ─────────────────────────────────────────────
  await test.step('S6 발송', async () => {
    await expect(page.getByTestId('messenger-recipient-chip')).toHaveCount(2)
    const send = page.getByRole('button', { name: '발송' })
    await expect(send).toBeEnabled()
    await send.click()
    // 성공 시 칩이 비워지고 상태 메시지가 뜬다
    await expect(page.getByRole('status').filter({ hasText: /발송|전송|완료/ }).first()).toBeVisible({ timeout: 20000 })
    await shot('S6-발송-완료')
  })

  // ── S7: 화면 전체 DOM 에 UUID 미노출 ────────────────────────────
  await test.step('S7 UUID 미노출(전체)', async () => {
    const bodyText = await page.locator('body').innerText()
    const m = bodyText.match(UUID_RE)
    expect(m, `🔴 UUID 노출: ${m?.[0]}`).toBeNull()
    await shot('S7-전체화면-UUID미노출')
  })
})
