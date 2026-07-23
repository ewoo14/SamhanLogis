/**
 * #825 슬7 — 주문 병합 거래처 우선 선택 라이브 GUI QA (PM 직접 수행)
 *
 * 실 게이트웨이(:8080) + 실 렌더러 대상. `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 *
 * 검증하는 불변식
 *   S7-1 거래처를 정하기 전에는 주문 후보 자체가 없다 (섞어 고르는 상태에 도달 불가)
 *   S7-4 거래처를 바꾸면 이전 거래처에서 고른 주문 선택이 남지 않는다
 *
 * 🚨 부재 단언 앞에 양성 단언을 둔다 — 화면이 실제로 렌더됐고 기대한 거래처의 후보가
 *    나왔음을 먼저 증명하지 않으면, 권한 부족으로 튕긴 화면에서도 "다른 거래처 0건" 이
 *    공허하게 통과한다(이 세션에서 실제로 겪은 함정).
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '867-s7-merge-live-qa-2026-07-23')

test.use({ viewport: { width: 1600, height: 1000 } })

test('슬7 — 거래처 우선 선택으로 다른 거래처 주문을 섞을 수 없다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_sales', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' }
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발영업' })

  // ── 준비: 실 주문에서 거래처 2곳과 각자의 주문번호를 확보 ─────────
  const codeA = 'P-2026-0002'
  const codeB = 'P-2026-0004'
  /** 거래처별 병합 가능(DRAFT/ON_HOLD) 주문번호를 필터 API 로 정확히 가져온다. */
  const ordersOf = async (code: string) => {
    const res = await page.request.get(
      `${API_BASE}/api/v1/partner-orders?page=0&size=50&partnerId=${encodeURIComponent(code)}&includeDeleted=false`,
      { headers: auth },
    )
    expect(res.ok(), `${code} 주문 조회 실패 HTTP ${res.status()}`).toBeTruthy()
    const content: Array<{ orderNumber: string; status: string; partnerCode?: string }> =
      (await res.json()).data?.content ?? []
    // 거래처 필터가 실제로 걸렸는지 확인 — 안 걸렸으면 이 시험 전체가 무의미하다
    expect(content.every((o) => o.partnerCode === code), `${code} 필터가 다른 거래처를 섞어 반환한다`).toBeTruthy()
    return content.filter((o) => o.status === 'DRAFT' || o.status === 'ON_HOLD').map((o) => o.orderNumber)
  }
  const ordersA = await ordersOf(codeA)
  const ordersB = await ordersOf(codeB)
  expect(ordersA.length, `${codeA} 병합가능 주문이 없다`).toBeGreaterThan(0)
  expect(ordersB.length, `${codeB} 병합가능 주문이 없다`).toBeGreaterThan(0)
  console.log(`■ 거래처 A=${codeA} (${ordersA.length}건) · B=${codeB} (${ordersB.length}건)`)

  // ⚠️ data-testid="merge-convert-dialog" 는 design-system Modal 이 DOM 으로 forward 하지 않아
  //    실제로 존재하지 않는다(PM 실측 count=0). role=dialog 로 잡는다.
  const dialog = page.getByRole('dialog')
  const summary = page.getByTestId('merge-convert-order-candidate-summary')
  const search = page.getByTestId('merge-convert-partner-search')

  /** 거래처 선택 — design-system PartnerAutocomplete 는 listbox "거래처 목록" + role=option 을 쓴다. */
  const pickPartner = async (code: string) => {
    await expect(search).toBeVisible({ timeout: 10_000 })
    await search.fill(code)
    const listbox = page.getByRole('listbox', { name: '거래처 목록' })
    await expect(listbox, `거래처 검색 결과가 뜨지 않는다: ${code}`).toBeVisible({ timeout: 10_000 })
    const option = listbox.locator('[role="option"]').filter({ hasText: code }).first()
    await expect(option, `검색 결과에 ${code} 가 없다`).toBeVisible({ timeout: 10_000 })
    await option.click()
  }

  // ── S7-1 전제: 거래처 확정 전에는 주문 후보 자체가 없다 ───────────
  await test.step('S7-1 거래처 확정 전에는 주문 후보가 없다', async () => {
    await page.goto(`${BASE_URL}/sales/partner-orders`)
    // 양성 — 목록 화면이 실제로 렌더됐다
    await expect(page.getByTestId('merge-convert-open'), '병합 진입 버튼이 없다 — 화면이 안 떴을 수 있다')
      .toBeVisible({ timeout: 20000 })
    await shot('S1-주문목록')

    await page.getByTestId('merge-convert-open').click()
    await expect(dialog).toBeVisible({ timeout: 15000 })
    // 양성 — 거래처 선택 단계가 먼저 보인다
    await expect(page.getByTestId('merge-convert-partner-selection')).toBeVisible()
    await expect(page.getByTestId('merge-convert-partner-required')).toBeVisible()
    // 부재 — 거래처 전에는 주문 선택 영역 자체가 없다
    await expect(page.getByTestId('merge-convert-order-selection'),
      '거래처를 정하기 전에 주문 후보가 노출된다 — 섞어 고르는 상태에 도달 가능하다').toHaveCount(0)
    await shot('S2-거래처확정전-주문후보없음')
  })

  // ── S7-1 본체: A 선택 시 A 주문만 후보 ───────────────────────────
  await test.step(`S7-1 거래처 A(${codeA}) 선택 → A 주문만 후보`, async () => {
    await pickPartner(codeA)

    // 양성 먼저 — 선택 거래처가 표시되고 후보가 실제로 나왔다
    await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(codeA)
    await expect(page.getByTestId('merge-convert-order-selection')).toBeVisible()
    // 🚨 초기 렌더는 후보 0건이다. 쿼리가 resolve 될 때까지 재시도 단언으로 기다린다
    //    — 즉시 읽으면 0 을 보고 이후 부재 단언이 공허하게 통과한다(PM 실측).
    await expect(summary, 'A 거래처 후보가 끝내 0건이면 이후 부재 단언이 무의미하다')
      .toContainText(/[1-9]\d*건 후보/, { timeout: 15_000 })
    const nA = Number((await summary.innerText()).match(/(\d+)건 후보/)?.[1] ?? -1)
    console.log(`■ A 후보 = ${nA}건`)
    await shot('S3-거래처A-후보노출')

    // 🚨 주문 옵션은 검색창에 입력해야 DOM 에 렌더된다. 입력 없이 부재를 단언하면
    //    옵션이 애초에 없어서 공허하게 통과한다(PM 실측).
    const orderSearch = page.getByTestId('merge-convert-order-search')
    await expect(orderSearch).toBeVisible({ timeout: 10_000 })

    // 양성 대조 먼저 — A 주문을 입력하면 옵션이 실제로 뜬다(= 검색이 작동한다)
    await orderSearch.fill(ordersA[0])
    await expect(page.getByTestId(`merge-convert-order-option-${ordersA[0]}`),
      `A 주문 ${ordersA[0]} 이 검색되지 않는다 — 이 상태의 부재 단언은 무의미하다`)
      .toBeVisible({ timeout: 10_000 })

    // 부재 — 같은 검색창에 B 주문번호를 넣어도 옵션이 뜨지 않는다
    for (const no of ordersB.slice(0, 3)) {
      await orderSearch.fill(no)
      await page.waitForTimeout(600)
      await expect(page.getByTestId(`merge-convert-order-option-${no}`),
        `다른 거래처(${codeB}) 주문 ${no} 가 A 후보에 섞여 있다`).toHaveCount(0)
    }
    await orderSearch.fill('')
  })

  // ── S7-4: 거래처 변경 시 이전 선택이 남지 않는다 ─────────────────
  await test.step(`S7-4 거래처 B(${codeB}) 로 변경 → A 선택 잔존 없음`, async () => {
    // A 주문 하나를 실제로 선택해 둔다 (검색 → 옵션 클릭)
    const firstA = ordersA[0]
    console.log(`■ A 에서 선택한 주문 = ${firstA}`)
    const orderSearch2 = page.getByTestId('merge-convert-order-search')
    await orderSearch2.fill(firstA)
    const optA = page.getByTestId(`merge-convert-order-option-${firstA}`)
    await expect(optA, 'A 후보 옵션이 화면에 없다').toBeVisible({ timeout: 10_000 })
    await optA.click()
    await expect(page.getByTestId(`merge-convert-order-chip-${firstA}`),
      'A 주문 칩이 생기지 않아 S7-4 시험이 성립하지 않는다').toBeVisible({ timeout: 10_000 })
    await shot('S4-거래처A-주문선택')

    await pickPartner(codeB)

    // 양성 먼저 — B 로 바뀌고 B 후보가 나왔다
    await expect(page.getByTestId('merge-convert-selected-partner')).toContainText(codeB)
    await expect(summary, 'B 거래처 후보가 끝내 0건이면 이후 부재 단언이 무의미하다')
      .toContainText(/[1-9]\d*건 후보/, { timeout: 15_000 })
    const nB = Number((await summary.innerText()).match(/(\d+)건 후보/)?.[1] ?? -1)
    console.log(`■ B 후보 = ${nB}건`)

    // 부재 — A 에서 고른 칩이 남아있지 않다
    await expect(page.getByTestId(`merge-convert-order-chip-${firstA}`),
      `거래처를 바꿨는데 이전 거래처(${codeA}) 주문 ${firstA} 선택이 남아 있다`).toHaveCount(0)
    await shot('S5-거래처B전환-이전선택소거')
  })
})
