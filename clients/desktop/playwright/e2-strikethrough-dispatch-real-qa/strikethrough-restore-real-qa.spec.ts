import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E2 기둥2 — 배차 취소선 삭제 + 복원 라이브 실서버 QA (mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 slip-service(V55 deleted_by_name)·auth-service(V78 RESTORE 시드)
 * → 실 Postgres. 합성/fixture 없음.
 *
 * 단계별 캡처(docs/qa/e2-strikethrough-dispatch/):
 *  01 보드 초기 → 02 그룹+전표 활성 → 03 전표 제거=취소선+삭제자 배지 → 04 전표 복원
 *  → 05 그룹 삭제=취소선 → 06 그룹 복원(개별 삭제분은 등호 매칭에 걸리지 않아 취소선 잔존)
 *  → 07 전표 복원 후 최종 활성.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-strikethrough-dispatch'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
/** 전체 화면 컨텍스트 컷 — 시작/종료 등 최소한만 사용한다. */
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

/**
 * 대상 차량그룹 카드 클로즈업 캡처 — 풀페이지에선 상태 변화가 카드 한 장에 몰려
 * "전부 똑같은 스샷" 이 되므로(개발책임자 2026-07-02 지적), 각 단계는 카드 요소 단위로
 * 잘라 변화(취소선/배지/복원버튼)가 이미지 대부분을 차지하게 한다.
 */
async function captureCard(page: Page, groupSeq: string, name: string): Promise<void> {
  shotNo++
  await page
    .getByTestId(`dispatch-board-vehicle-group-${groupSeq}`)
    .screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`) })
}

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

test('취소선 삭제+복원 라이브 — 전표/그룹 삭제 → 취소선+삭제자 배지 → 복원', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled({ timeout: 15000 })
  await page.waitForTimeout(800)
  await capture(page, 'board-initial')

  // (1) 차량 그룹 추가 — 이번 QA 전용 신규 그룹(마지막 sequence)을 대상으로 한다.
  const beforeIds = await page
    .locator('[data-testid^="dispatch-board-vehicle-group-"][data-testid$="-select"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(page.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
  await page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_1').click()
  await page.getByTestId('dispatch-board-add-vehicle-submit').click()
  await page.waitForTimeout(1000)
  const afterIds = await page
    .locator('[data-testid^="dispatch-board-vehicle-group-"][data-testid$="-select"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
  const newSelectId = afterIds.find((id) => !beforeIds.includes(id))
  expect(newSelectId, '신규 그룹 미생성').toBeTruthy()
  const groupSeq = newSelectId!.replace('dispatch-board-vehicle-group-', '').replace('-select', '')
  const g = (suffix: string) => `dispatch-board-vehicle-group-${groupSeq}-${suffix}`
  const groupCard = page.getByTestId(`dispatch-board-vehicle-group-${groupSeq}`)

  // (2) 미배차 풀 첫 전표를 전표번호로 배정 — 풀 필터를 과거로 넓혀 실 DB 미배차 전표를 노출.
  //     보드 표시자격 미배차 전표(실 DEV 시드)는 slip_date 2026-01~03월대라 from 을 연초로 넓힌다.
  await page.getByTestId('dispatch-board-filter-from').fill('2026-01-01')
  const firstSlipRow = page.locator('[data-testid^="dispatch-board-slip-row-"]').first()
  await expect(firstSlipRow, '미배차 전표 풀이 비어 있음 — DEV 시드 확인 필요').toBeVisible({ timeout: 15000 })
  const slipRowTestId = await firstSlipRow.getAttribute('data-testid')
  const slipNo = slipRowTestId!.replace('dispatch-board-slip-row-', '')
  const s = (suffix: string) => `dispatch-board-group-slip-${slipNo}-${suffix}`
  const slipInGroup = (suffix?: string) =>
    groupCard.getByTestId(suffix ? s(suffix) : `dispatch-board-group-slip-${slipNo}`)
  await page.getByTestId(g('slip-input')).fill(slipNo)
  await page.getByTestId(g('slip-add')).click()
  await expect(slipInGroup()).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(600)
  await captureCard(page, groupSeq, 'closeup-active-slip-in-group')

  // (3) 전표 제거 → 취소선 + "삭제: {이름}" 배지 + 복원 버튼 (영구 노출).
  await slipInGroup('remove').click()
  await expect(slipInGroup('deleted-badge')).toBeVisible({ timeout: 10000 })
  const slipBadgeText = await slipInGroup('deleted-badge').textContent()
  expect(slipBadgeText, 'X-User-Name 실전파 — 삭제자 이름 배지').toContain('삭제:')
  const slipLabelDecoration = await slipInGroup('deleted-label').evaluate(
    (el) => getComputedStyle(el).textDecorationLine,
  )
  expect(slipLabelDecoration).toContain('line-through')
  await expect(slipInGroup('restore')).toBeVisible()
  await page.waitForTimeout(400)
  await captureCard(page, groupSeq, 'closeup-slip-strikethrough-badge')

  // (4) 전표 복원 → 활성 복귀(취소선 소멸). ※ 02 컷과 동일 상태로 보이는 것이 정상 —
  //     복원 = 원상복구이므로. 증명력은 03(취소선) → 04(소멸) 순서 대비에 있다.
  await slipInGroup('restore').click()
  await expect(slipInGroup('deleted-badge')).toHaveCount(0, { timeout: 10000 })
  await expect(slipInGroup()).toBeVisible()
  await page.waitForTimeout(500)
  await captureCard(page, groupSeq, 'closeup-slip-restored-active')

  // (5) 전표 재제거 후 그룹 삭제(활성 0) → 그룹 취소선+배지.
  await slipInGroup('remove').click()
  await expect(slipInGroup('deleted-badge')).toBeVisible({ timeout: 10000 })
  await page.getByTestId(g('delete')).click()
  await expect(page.getByTestId(g('deleted-badge'))).toBeVisible({ timeout: 10000 })
  const groupBadgeText = await page.getByTestId(g('deleted-badge')).textContent()
  expect(groupBadgeText).toContain('삭제')
  await expect(page.getByTestId(g('restore'))).toBeVisible()
  await page.waitForTimeout(400)
  await captureCard(page, groupSeq, 'closeup-group-strikethrough-badge')

  // (6) 그룹 복원 — 개별 삭제된 전표 매핑은 공유 deletedAt 등호 매칭에 걸리지 않아
  //     cascade 부활하지 않고 취소선 잔존해야 한다(±2초 창 제거 검증).
  await page.getByTestId(g('restore')).click()
  await expect(page.getByTestId(g('deleted-badge'))).toHaveCount(0, { timeout: 10000 })
  await expect(slipInGroup('deleted-badge')).toBeVisible()
  await page.waitForTimeout(500)
  // 05(그룹 헤더 취소선) 와의 대비가 증명 — 헤더는 활성 복귀, 행 취소선만 잔존.
  await captureCard(page, groupSeq, 'closeup-group-restored-tombstone-kept')

  // (7) 전표 단건 복원 → 최종 전체 활성.
  await slipInGroup('restore').click()
  await expect(slipInGroup('deleted-badge')).toHaveCount(0, { timeout: 10000 })
  await page.waitForTimeout(500)
  await capture(page, 'final-all-restored')

  // 정리 — QA 그룹을 삭제 상태로 남기지 않고 전표 제거 + 그룹 삭제(soft)로 마무리하되,
  // 취소선 영구 노출 자체가 기능이므로 남는 tombstone 은 정상 데이터다.
  await slipInGroup('remove').click()
  await expect(slipInGroup('deleted-badge')).toBeVisible({ timeout: 10000 })
  await page.getByTestId(g('delete')).click()
  await expect(page.getByTestId(g('deleted-badge'))).toBeVisible({ timeout: 10000 })
})
