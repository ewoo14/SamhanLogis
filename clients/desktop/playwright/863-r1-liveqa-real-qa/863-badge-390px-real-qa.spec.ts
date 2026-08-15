import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #863 R1 라이브QA ① — 주문 목록 발행상태 배지 390px 실측 캡처.
 *
 * spec §3.4 가 "정적 코드 확인 금지"를 명시했고, R1 차원D 는 코드로만 통과 판정했다(캡처 미이행).
 * 본 스펙은 실서버(:8080, mock OFF) + 실 partner_order_db 실데이터(dev 시드 30주문 중
 * slip_publish_status='PENDING_RETRY' 15건)로 390px 실렌더를 확증한다. DB write 는 하지 않는다.
 *
 * 검증 대상 = 이 PR 의 배지 이동: '연결 전표'(mobilePriority='hidden') → '상태'(mobilePriority='secondary').
 * 이동 전이라면 390px 에서 배지가 들어있던 셀 자체가 display:none 이라 배지가 아예 보이지 않는다.
 *
 * 단순 존재(presence) 단언은 false-green 이 되므로([[feedback_react_query_freshness_route_param_reset]])
 * 다음을 구별출력으로 단언한다:
 *   1) 배지 bounding box 가 390px 뷰포트 안에 완전히 들어옴(좌우 잘림 없음)
 *   2) 배지 텍스트가 셀 폭 안에서 넘치지 않음(scrollWidth <= clientWidth)
 *   3) 배지의 조상 td 가 data-label='상태' + data-mobile-priority='secondary' (이동이 실제 적용됨)
 *   4) 같은 행의 td[data-label='연결 전표'] 는 390px 에서 비가시 (구 위치였다면 안 보였을 것)
 *
 * 캡처: docs/qa/863-r1-liveqa/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5866'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/863-r1-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })

/** dev 시드 실데이터 — slip_publish_status='PENDING_RETRY' (라이브 DB 조회로 확인한 실제 행). */
const SEEDED_PENDING_ORDER = '2026/04/15-10'

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return {
    token: d.token ?? '',
    role: d.role ?? '',
    userId: d.userId ?? '',
    displayName: d.displayName ?? loginId,
  }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: tok,
            userId: uid,
            role: r,
            fullName: name,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

/** 목록 진입 + 전표 발행상태 필터 = 재시도 중. */
async function openListFilteredToPendingRetry(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  const filter = page.getByTestId('partner-order-list-slip-publish-filter')
  await expect(filter, '이 PR 이 추가한 전표 발행상태 필터가 렌더돼야 한다.').toBeVisible({
    timeout: 30_000,
  })
  await filter.selectOption('PENDING_RETRY')
  await page.waitForTimeout(3000)
}

test('#863 ① 발행상태 배지 — 390px 실측(잘림 없음 + 상태 컬럼으로 이동 확증)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await openListFilteredToPendingRetry(page)
  await capture(page, '390px-list-pending-retry-filtered')

  const badge = page.getByTestId(`partner-order-row-slip-publish-status-${SEEDED_PENDING_ORDER}`)
  await expect(
    badge,
    '390px 목록 행에 발행상태 배지가 보여야 한다(이동 전이면 hidden 셀이라 비가시).',
  ).toBeVisible({ timeout: 30_000 })
  await expect(badge).toHaveText('전표 발행 재시도 중')

  // 대상 행이 접힘(fold) 아래에 있으므로 뷰포트로 스크롤한 뒤, 실제 사용자가 보는 상태를 캡처한다.
  await badge.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await capture(page, '390px-badge-in-viewport')

  // (1) 잘림 없음 — bounding box 가 뷰포트(390) 안에 완전히 포함
  const box = await badge.boundingBox()
  expect(box, '배지 bounding box 를 얻지 못했다.').not.toBeNull()
  const b = box!
  // eslint-disable-next-line no-console
  console.log(`[863-QA] badge box x=${b.x} y=${b.y} w=${b.width} h=${b.height}`)
  expect(b.x, `배지 좌측이 뷰포트 밖(x=${b.x})`).toBeGreaterThanOrEqual(0)
  expect(
    b.x + b.width,
    `배지 우측이 390px 뷰포트를 넘어 잘림(right=${b.x + b.width})`,
  ).toBeLessThanOrEqual(390)
  expect(b.width, '배지 폭이 0 — 렌더되지 않음').toBeGreaterThan(0)

  // (2) 텍스트 오버플로 없음
  const overflow = await badge.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    text: (el.textContent ?? '').trim(),
  }))
  // eslint-disable-next-line no-console
  console.log(`[863-QA] badge overflow ${JSON.stringify(overflow)}`)
  expect(
    overflow.scrollWidth,
    `배지 텍스트가 셀 폭을 넘침(scroll=${overflow.scrollWidth} client=${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1)

  // (3) 조상 td 가 '상태' 컬럼이고 mobilePriority=secondary — 이동이 실제 적용됨
  const cellMeta = await badge.evaluate((el) => {
    const td = el.closest('td')
    return {
      label: td?.getAttribute('data-label') ?? null,
      priority: td?.getAttribute('data-mobile-priority') ?? null,
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[863-QA] parent cell ${JSON.stringify(cellMeta)}`)
  expect(cellMeta.label, "배지가 '상태' 컬럼에 있지 않다 — 이동 미적용").toBe('상태')
  expect(cellMeta.priority, "'상태' 컬럼 mobilePriority 가 secondary 가 아니다").toBe('secondary')

  // (4) 구 위치('연결 전표')는 390px 에서 비가시 — 이동하지 않았다면 배지가 안 보였을 것
  const row = page.locator('tr', { has: badge }).first()
  const linkedSlipCell = row.locator('td[data-label="연결 전표"]')
  await expect(
    linkedSlipCell,
    "'연결 전표' 셀은 390px 에서 숨겨져야 한다(구 배지 위치가 비가시였음을 증명).",
  ).toBeHidden()

  // 배지 근접 캡처
  shotNo++
  await row.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-390px-badge-row-closeup.png`),
  })
  shotNo++
  await badge.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-390px-badge-element.png`),
  })
})

/**
 * #863 ① 부수 관측 — 배지 2개가 한 셀에 들어가면서 기존 '완료' 상태 배지가 390px 에서 2줄로
 * 줄바꿈되는지 통제 비교로 확인한다.
 *
 * 통제: 같은 화면·같은 뷰포트·같은 상태 라벨('완료')인 두 행을 비교한다.
 *   - 2026/04/15-10 : CONFIRMED + PENDING_RETRY → 발행 배지 있음(셀 안 배지 2개)
 *   - 2026/04/15-16 : CONFIRMED + PUBLISHED    → 발행 배지 없음(셀 안 배지 1개)
 * PUBLISHED 는 SLIP_PUBLISH_STATUS_DISPLAY 에 없어 배지를 렌더하지 않으므로, 이 두 행의
 * 차이는 "발행 배지 동거" 하나뿐이다. 따라서 높이 차이가 나면 원인이 이 PR 의 배지 이동으로 특정된다.
 */
test('#863 ① 부수관측 — 발행 배지 동거 시 상태 배지 줄바꿈 여부(통제 비교)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  const statusFilter = page.getByTestId('partner-order-list-status-filter')
  await expect(statusFilter).toBeVisible({ timeout: 30_000 })
  await statusFilter.selectOption('CONVERTED')
  await page.waitForTimeout(3000)

  async function measure(orderNo: string) {
    const row = page
      .locator('tr')
      .filter({ has: page.getByText(orderNo, { exact: true }) })
      .first()
    await expect(row, `행 ${orderNo} 이 목록에 없다.`).toBeVisible({ timeout: 30_000 })
    await row.scrollIntoViewIfNeeded()
    // td > span(래퍼 partnerOrderNumberCell) > span(첫 자식 = 상태 배지)
    const statusBadge = row.locator('td[data-label="상태"] > span > span').first()
    const wrapper = row.locator('td[data-label="상태"] > span').first()
    const read = (el: Element) => {
      const r = el.getBoundingClientRect()
      const cs = window.getComputedStyle(el)
      return {
        text: (el.textContent ?? '').trim(),
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        lineHeight: cs.lineHeight,
      }
    }
    return {
      statusBadge: await statusBadge.evaluate(read),
      wrapper: await wrapper.evaluate(read),
    }
  }

  const withPublishBadge = await measure('2026/04/15-10') // 발행 배지 동거
  const withoutPublishBadge = await measure('2026/04/15-16') // 상태 배지 단독

  // eslint-disable-next-line no-console
  console.log(`[863-QA] 상태배지(발행배지 동거)  = ${JSON.stringify(withPublishBadge)}`)
  // eslint-disable-next-line no-console
  console.log(`[863-QA] 상태배지(단독)          = ${JSON.stringify(withoutPublishBadge)}`)

  expect(withPublishBadge.statusBadge.text, '두 행의 상태 라벨이 같아야 통제 비교가 성립').toBe(
    withoutPublishBadge.statusBadge.text,
  )

  await capture(page, '390px-status-badge-wrap-comparison')
})

test('#863 ① 대조군 — 1440px 데스크톱 동일 화면', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await openListFilteredToPendingRetry(page)
  const badge = page.getByTestId(`partner-order-row-slip-publish-status-${SEEDED_PENDING_ORDER}`)
  await expect(badge).toBeVisible({ timeout: 30_000 })
  await capture(page, '1440px-list-pending-retry-control')
})

test('#863 ① 360px 하한 — R1 이 "여유 소멸 가능" 으로 지목한 폭', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await openListFilteredToPendingRetry(page)
  const badge = page.getByTestId(`partner-order-row-slip-publish-status-${SEEDED_PENDING_ORDER}`)
  await expect(badge).toBeVisible({ timeout: 30_000 })
  await badge.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const box = await badge.boundingBox()
  const b = box!
  // eslint-disable-next-line no-console
  console.log(`[863-QA] 360px badge box x=${b.x} y=${b.y} w=${b.width} h=${b.height}`)
  expect(b.x + b.width, `360px 에서 배지 우측 잘림(right=${b.x + b.width})`).toBeLessThanOrEqual(360)
  await capture(page, '360px-list-badge-lower-bound')
})
