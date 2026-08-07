import { resolveQaCredential } from '../../scripts/lib/qa-credentials.cjs'
/**
 * QA 실서버 실화면 캡처 — 수식 빌더 F1 고정DC% 인라인 자동저장 (PR #499, 개발책임자 정정)
 *
 * 개발책임자 정정(2026-06-18): 고정DC%는 모달이 아니라 변동DC 옆 인라인 컬럼에서 %단위 숫자 입력.
 *   빈칸 = 전역DC율 영향 품목. 저장 버튼 없이 자동 저장(변동DC 토글과 동일 UX).
 *
 * 검증 흐름(실 게이트웨이 PATCH 회귀 포함):
 *   A. 견적품목 테이블 — 변동DC 토글 + 고정DC% 인라인 컬럼 동시 노출
 *   B. 고정DC% 입력(35) → blur → PATCH /fixed-discount 200 자동저장
 *   C. reload 후 35% persist 확인
 *   D. 빈칸 원복 → blur → PATCH 200(null) → 전역DC 영향 복귀
 *   E. 분류 설정 모달 — catL/M/S 전용(고정DC 입력 없음 확인)
 *
 * mock OFF. 실 gateway(:8080). dev_master. renderer localhost:5173.
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../scripts/lib/qa-shots-dir.mjs'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER = 'http://localhost:5173'
const GATEWAY = 'http://localhost:8080'
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../docs/qa/formula-f1-inline-dc'))
const results = []
const record = (s, p, n) => { results.push({ scene: s, pass: p, note: n }); console.log(`[qa] ${p ? 'PASS' : 'FAIL'} — ${s}${n ? ' :: ' + n : ''}`) }

async function freshToken() {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) }) })
  const json = await res.json()
  if (!json?.data?.token) throw new Error('login failed')
  return json.data
}

async function main() {
  const auth = await freshToken()
  const browser = await chromium.launch({ headless: true, chromiumSandbox: false, args: ['--disable-dev-shm-usage', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, deviceScaleFactor: 1.5, locale: 'ko-KR' })
  await context.addInitScript((snap) => {
    window.samhanAuth = { getToken: async () => snap, setToken: async () => {}, clearToken: async () => {} }
    window.samhanLegacy = { getEstimateUrl: async () => '', openExternal: async () => {} }
  }, { token: auth.token, userId: auth.userId, displayName: auth.displayName, role: auth.role })
  const page = await context.newPage()

  // 고정DC PATCH 응답 추적
  const patchLog = []
  page.on('response', (res) => {
    const u = res.url()
    if (u.includes('/fixed-discount') && res.request().method() === 'PATCH') {
      patchLog.push({ url: u, status: res.status() })
    }
  })

  // ── Scene A: 견적품목 테이블 (변동DC + 고정DC% 인라인 컬럼) ──
  await page.goto(`${RENDERER}/#/products/estimate-items?category=HOME_MULTI`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 20000 })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/01-table-inline-columns.png`, fullPage: false })
  const vdcToggle = await page.locator('[data-testid^="estimate-items-vdc-toggle-"]').first().isVisible().catch(() => false)
  const fixedInput = page.locator('input[data-testid^="estimate-items-fixed-dc-"]').first()
  const fixedVisible = await fixedInput.isVisible().catch(() => false)
  record('A. 테이블 — 변동DC 토글 + 고정DC% 인라인 컬럼 동시 노출', vdcToggle && fixedVisible, `변동DC=${vdcToggle} 고정DC입력=${fixedVisible}`)

  // 대상 행의 modelCode 추출 (testid suffix)
  const targetTestId = await fixedInput.getAttribute('data-testid').catch(() => null)
  const modelCode = targetTestId ? targetTestId.replace('estimate-items-fixed-dc-', '') : null

  // ── Scene B: 고정DC% 입력(35) → blur → PATCH 200 자동저장 ──
  let savePatch = null
  if (fixedVisible) {
    patchLog.length = 0
    await fixedInput.fill('35')
    await fixedInput.blur()
    await page.waitForTimeout(1500)
    savePatch = patchLog.find((p) => p.status === 200) || patchLog[0] || null
    await page.screenshot({ path: `${OUT}/02-fixed-dc-autosave-35.png`, fullPage: false })
    record('B. 고정DC% 35 입력 → blur 자동저장(저장 버튼 없음)', savePatch?.status === 200, `PATCH status=${savePatch?.status ?? '없음'}`)
  }

  // ── Scene C: reload 후 35% persist 확인 ──
  let persisted = null
  if (modelCode) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 20000 })
    await page.waitForTimeout(1800)
    const reInput = page.locator(`input[data-testid="estimate-items-fixed-dc-${modelCode}"]`)
    persisted = await reInput.inputValue().catch(() => null)
    await page.screenshot({ path: `${OUT}/03-reload-persist-35.png`, fullPage: false })
    record('C. reload 후 35% persist', persisted === '35', `reload 값="${persisted}"`)
  }

  // ── Scene D: 빈칸 원복 → blur → PATCH 200(null) → 전역DC 복귀 ──
  let revertPatch = null
  if (modelCode) {
    const reInput = page.locator(`input[data-testid="estimate-items-fixed-dc-${modelCode}"]`)
    patchLog.length = 0
    await reInput.fill('')
    await reInput.blur()
    await page.waitForTimeout(1500)
    revertPatch = patchLog.find((p) => p.status === 200) || patchLog[0] || null
    await page.screenshot({ path: `${OUT}/04-revert-null-global-dc.png`, fullPage: false })
    record('D. 빈칸 원복 → 자동저장(null=전역DC 복귀)', revertPatch?.status === 200, `PATCH status=${revertPatch?.status ?? '없음'}`)
  }

  // ── Scene E: 분류 설정 모달 — catL/M/S 전용(고정DC 입력 없음) ──
  let modalNoFixedDc = false
  if (modelCode) {
    const settingsBtn = page.locator(`[data-testid="estimate-items-classification-settings-${modelCode}"]`)
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click()
      await page.waitForTimeout(1000)
      const modalSave = await page.locator('[data-testid="estimate-items-classification-modal-save"]').isVisible().catch(() => false)
      const catL = await page.locator(`[data-testid="estimate-items-cat-l-${modelCode}"]`).isVisible().catch(() => false)
      // 모달 내부에 고정DC 입력이 없어야 함(인라인으로 분리됨)
      const fixedInModal = await page.locator('[data-testid="estimate-items-classification-modal-' + modelCode + '"] input[data-testid^="estimate-items-fixed-dc-"]').count().catch(() => 0)
      modalNoFixedDc = modalSave && catL && fixedInModal === 0
      await page.screenshot({ path: `${OUT}/05-classification-modal-cat-only.png`, fullPage: false })
      record('E. 분류 모달 — catL/M/S 전용(모달 내 고정DC 입력 0)', modalNoFixedDc, `모달=${modalSave} catL=${catL} 모달내고정DC=${fixedInModal}`)
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  writeFileSync(`${OUT}/_results.json`, JSON.stringify({ results, modelCode, savePatch, persisted, revertPatch }, null, 2))
  await browser.close()
  const pass = results.filter((r) => r.pass).length
  console.log(`[qa] ${pass}/${results.length} PASS — modelCode=${modelCode}`)
  if (pass < results.length) process.exitCode = 2
}
main().catch((e) => { console.error(e); process.exit(1) })
