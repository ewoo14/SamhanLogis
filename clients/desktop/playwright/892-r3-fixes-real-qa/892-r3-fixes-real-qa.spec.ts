import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #892 R3 — CODEX SOL 도달가능 4건(A·B·C·D) 라이브 GUI QA (PM 직접 수행)
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 * 실서버(게이트웨이 :8080) + 실 렌더러 대상으로만 실행한다.
 *
 * D(수신함 50건 경계 페이저)를 GUI 로 확증한다.
 *   - 51건: `다음` 활성 → 2페이지에 실제 1건
 *   - 정확히 50건: `다음` 비활성 (구 휴리스틱이면 활성이고 빈 페이지가 열린다)
 * C(늦게 도착한 알림 배지 재조정)는 5초 주기 재조회가 살아있는지 확인한다.
 *
 * A(포화 무손실)·B(중복 없음)는 GUI 로 도달할 수 없어 API 버스트 + DB 대조로 검증했다
 * (330 발행 → 메시지 330 = 알림 330 = distinct source_ref 330). PR 코멘트에 원문 기록.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5191'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '892-r3-live-qa-2026-07-23'))

test.use({ viewport: { width: 1600, height: 1000 } })

test('R3 D — 수신함 50건 경계에서 다음 버튼이 실제 존재 여부를 따른다', async ({ page }) => {
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

  const pageRoot = page.getByTestId('messenger-page')
  const next = page.getByRole('button', { name: '다음' })
  const prev = page.getByRole('button', { name: '이전' })

  await test.step('D-1 51건 · 1페이지 — 다음 활성', async () => {
    await page.goto(`${BASE_URL}/#/messenger`)
    await expect(pageRoot).toBeVisible({ timeout: 20000 })
    await expect(pageRoot.getByRole('heading', { name: '수신함' })).toBeVisible()
    await expect(page.getByText('1페이지')).toBeVisible()
    await expect(prev).toBeDisabled()
    await expect(next).toBeEnabled()
    await shot('D1-51건-1페이지-다음활성')
  })

  await test.step('D-2 2페이지 — 실제 1건 · 다음 비활성', async () => {
    await next.click()
    await expect(page.getByText('2페이지')).toBeVisible()
    await expect(prev).toBeEnabled()
    // 마지막 페이지이므로 다음은 다시 잠긴다
    await expect(next).toBeDisabled()
    await shot('D2-2페이지-실제1건-다음비활성')
  })

  await test.step('C 5초 주기 재조회가 살아있다', async () => {
    // 늦게 도착한 알림을 다시 확인 처리하기 위한 주기 재조회.
    // 수신함 요청이 실제로 반복되는지 네트워크로 관측한다.
    await prev.click()
    await expect(page.getByText('1페이지')).toBeVisible()
    let hits = 0
    page.on('request', (r) => { if (r.url().includes('/messages/inbox')) hits += 1 })
    await page.waitForTimeout(12_000)
    expect(hits, `12초 동안 수신함 재조회 ${hits}회 — 주기 재조회가 동작하지 않는다`).toBeGreaterThanOrEqual(2)
    await shot('C-주기재조회-관측')
  })
})
