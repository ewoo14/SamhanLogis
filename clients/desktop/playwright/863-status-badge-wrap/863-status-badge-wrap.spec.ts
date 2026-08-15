/**
 * #863 N-2 — 좁은 뷰포트에서 '완료' 상태 배지가 발행 배지와 동거할 때 2줄로 줄바꿈되는 회귀.
 *
 * <h2>배경</h2>
 * R1 라이브QA(`docs/qa/863-r1-liveqa/863-badge-390px-real-qa.spec.ts` 부수관측 테스트,
 * `05-390px-status-badge-wrap-comparison.png`)가 실서버 390px 통제 비교로 다음을 실측했다.
 *
 * | 행 | 상태 배지 폭 | 높이 |
 * |---|---|---|
 * | 2026/04/15-10 (발행 배지 동거) | 26.13px | 37px (2줄) |
 * | 2026/04/15-16 (상태 배지 단독) | 36.25px | 20.5px (1줄) |
 *
 * 차이가 "발행 배지 동거" 하나뿐이라 원인이 `.statusBadge`(sales.module.css)에
 * `white-space: nowrap` 이 없어 `.partnerOrderNumberCell`(inline-flex, min-width:0) 안에서
 * 축소되며 텍스트가 줄바꿈되는 것으로 특정됐다. 형제 `.partnerOrderDeletedBadge` 는 동일 부모
 * 안에서 `white-space: nowrap` 가드를 갖고 있어 이 결함을 겪지 않는다.
 *
 * <h2>본 spec — mock 버전 통제 비교(CI 게이트 대상)</h2>
 * real-qa 버전은 `playwright.config.ts` 가 명시 제외해 CI 가 실행하지 않는다
 * ([[feedback_canonical_workflow]] 2026-07-21 결정 3 — "정적 게이트/미실행 real-qa 는 라이브QA
 * 대체물이 아니다"). 동일 통제 비교를 mock.ts 기존 fixture 로 재현해 CI mock hard gate 에 편입한다.
 *
 * mock.ts 의 `GET /api/v1/partner-orders?status=CONVERTED` 는 이미 다음 두 행을 반환한다
 * (별도 mock 수정 불필요 — 기존 fixture 가 이 통제 비교에 필요한 조합을 정확히 갖추고 있음):
 *   - `2026/05/03-1`(CONFIRMED_ROW): slipPublishStatus='PUBLISHED' → SLIP_PUBLISH_STATUS_DISPLAY
 *     에 PUBLISHED 항목이 없어 발행 배지 미렌더 → 상태 배지 단독.
 *   - `2026/05/31-6`(SLIP_PENDING_RETRY_ROW): slipPublishStatus='PENDING_RETRY' → 발행 배지
 *     ('전표 발행 재시도 중') 렌더 → 상태 배지 동거.
 * 두 행 모두 완료 축의 상태라 상태 라벨('완료')이 동일 — 통제 비교 성립.
 *
 * <h2>단언 원칙 — presence-only 금지</h2>
 * "배지가 존재한다"가 아니라 실측 높이/줄수를 단언한다([[feedback_live_qa_penetrates_it_masking]]
 * 계열 원칙). 핵심 단언은 절대 px 값이 아니라 통제 비교(동거 행 높이 == 단독 행 높이, 허용오차
 * 내)다 — 이래야 fix 가 한쪽 행만 고치는 것을 막을 수 있다. 부가로 line-height 대비 실측 높이로
 * "1줄" 여부를 직접 판정하고, scrollWidth/clientWidth 로 텍스트 오버플로 유무를, 문서
 * scrollWidth/clientWidth 로 가로 스크롤 유무를 확인한다.
 *
 * <h2>실행 방법(포트 격리 — 다른 워크트리와 5173 공유 금지)</h2>
 * <pre>
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --config vite.config.ts --host 127.0.0.1 --port 5175 --strictPort &
 *   PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5175 \
 *     npx playwright test playwright/863-status-badge-wrap --reporter=line
 * </pre>
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

const listUrl = () => `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER`

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function gotoListAndWait(page: Page): Promise<void> {
  await page.goto(listUrl(), { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', {
    timeout: 15_000,
  })
  await page.getByTestId('partner-order-list-status-filter').selectOption('CONVERTED')
}

interface BadgeMetrics {
  text: string
  width: number
  height: number
  scrollWidth: number
  clientWidth: number
  lineHeight: string
}

/** td[data-label="상태"] > span(wrapper=partnerOrderNumberCell) > span(첫 자식=상태 배지) */
async function measureStatusBadge(
  page: Page,
  orderNumber: string,
): Promise<{ statusBadge: BadgeMetrics; wrapper: BadgeMetrics }> {
  const row = page.getByTestId(`partner-order-row-${orderNumber}`)
  await expect(row, `행 ${orderNumber} 이 목록에 없다.`).toBeVisible({ timeout: 15_000 })
  await row.scrollIntoViewIfNeeded()

  const statusBadge = row.locator('td[data-label="상태"] > span > span').first()
  const wrapper = row.locator('td[data-label="상태"] > span').first()

  const read = (el: Element): BadgeMetrics => {
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

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

for (const viewport of [
  { width: 390, height: 844, label: '390px' },
  { width: 360, height: 780, label: '360px(하한)' },
]) {
  test(`#863 N-2 — ${viewport.label} 상태 배지 발행배지 동거 시 줄바꿈 회귀(통제 비교, mock)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await installAuthMock(page)
    await gotoListAndWait(page)

    const withPublishBadge = await measureStatusBadge(page, '2026/05/31-6') // 발행 배지 동거
    const withoutPublishBadge = await measureStatusBadge(page, '2026/05/03-1') // 상태 배지 단독

    // eslint-disable-next-line no-console
    console.log(
      `[863-N2] ${viewport.label} 상태배지(발행배지 동거)  = ${JSON.stringify(withPublishBadge)}`,
    )
    // eslint-disable-next-line no-console
    console.log(
      `[863-N2] ${viewport.label} 상태배지(단독)          = ${JSON.stringify(withoutPublishBadge)}`,
    )

    // 통제 비교 전제 — 두 행의 상태 라벨이 같아야 "발행 배지 동거" 하나만의 차이로 귀속할 수 있다.
    expect(
      withPublishBadge.statusBadge.text,
      '두 행의 상태 라벨이 같아야 통제 비교가 성립한다(둘 다 완료 축="완료"여야 함).',
    ).toBe(withoutPublishBadge.statusBadge.text)

    // 핵심 단언 — 실측 높이 비교(존재 단언 아님). 발행 배지와 동거해도 상태 배지 높이는 단독 행과
    // 같아야 한다(둘 다 1줄). 회귀 상태에서는 동거 행이 2줄로 커져 이 비교가 깨진다.
    expect(
      withPublishBadge.statusBadge.height,
      `동거 행 상태 배지 높이(${withPublishBadge.statusBadge.height}px)가 단독 행` +
        `(${withoutPublishBadge.statusBadge.height}px)보다 커서 줄바꿈이 의심된다.`,
    ).toBeLessThanOrEqual(withoutPublishBadge.statusBadge.height + 2)

    // 부가 단언 — line-height 대비 실측 높이로 "1줄"임을 직접 판정(단독 행 기준 계산해도 회귀
    // 없는 정상 상태이므로 기준값으로 유효).
    const lineHeightPx = Number.parseFloat(withoutPublishBadge.statusBadge.lineHeight)
    if (Number.isFinite(lineHeightPx) && lineHeightPx > 0) {
      expect(
        withPublishBadge.statusBadge.height,
        `동거 행 상태 배지 높이가 1줄 line-height(${lineHeightPx}px)의 1.6배를 넘어 2줄 이상으로 ` +
          `판정된다.`,
      ).toBeLessThanOrEqual(lineHeightPx * 1.6)
    }

    // 텍스트가 배지 폭을 넘쳐 잘리지 않는다.
    for (const [name, m] of [
      ['동거', withPublishBadge.statusBadge] as const,
      ['단독', withoutPublishBadge.statusBadge] as const,
    ]) {
      expect(
        m.scrollWidth,
        `${name} 행 상태 배지 텍스트가 폭을 넘침(scroll=${m.scrollWidth} client=${m.clientWidth})`,
      ).toBeLessThanOrEqual(m.clientWidth + 1)
    }

    // 문서 자체가 가로 스크롤을 만들지 않는다(배지가 컨테이너를 넘쳐 페이지 폭을 밀어내지 않음).
    expect(
      await hasHorizontalScroll(page),
      `${viewport.label} 에서 문서에 가로 스크롤이 생겼다 — 배지가 뷰포트를 넘친다.`,
    ).toBe(false)
  })
}
