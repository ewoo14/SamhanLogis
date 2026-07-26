import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

/**
 * #929 재수렴 5차 D-RC5-1 — 실 서버 라이브QA (mock OFF · Docker 게이트웨이 :8080).
 *
 * <p><b>닫는 결함</b> — 거래처코드 필터에 partner-service 의 형제 라우트 이름을 넣으면 3화면이
 * 502 로 깨졌다:
 * <pre>
 *   일마감    "마감 이력을 불러오지 못했습니다."                      partnerCode=list · by-name
 *   원장      "원장을 불러오지 못했습니다: … status code 502"
 *   거래처원장 "집계 조회 실패: … status code 502"
 * </pre>
 * 원인은 문자가 아니라 경로다 — {@code /internal/partners/{partnerCode}} 의 형제로
 * {@code /list}(거래처 배열 200)·{@code /by-name}(필수 파라미터 누락 400)이 있다.
 * {@code "list"} 는 소문자 ASCII 4자라 4차의 문자 가드로는 원리적으로 막을 수 없다.
 *
 * <p><b>단언의 기준선</b> — "배너가 없다"가 아니라 <b>"없는 거래처 코드와 완전히 같게 동작한다"</b>
 * 이다. 원장처럼 미존재 코드에 404 배너를 띄우는 화면이 있기 때문에, 배너 유무만 보면 화면마다
 * 기준이 흔들린다. 각 화면에서 먼저 {@code NOSUCH9999} 의 화면 상태를 찍고, 형제 라우트 이름들이
 * 그와 <b>문자열까지 동일한</b> 결과를 내는지 본다. 이 기준은 라우트가 늘어나도 그대로 쓸 수 있다.
 *
 * <p><b>회귀 범위</b> — 4차가 확보한 문자 축(전달 불가 문자 = 미존재와 동일)과 과차단 무회귀
 * (실존 코드는 그대로 조회)도 같은 화면에서 함께 다시 잰다.
 *
 * <p>전부 <b>읽기 전용</b>이다 — 어떤 행도 생성·수정·삭제하지 않는다.
 */
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
/**
 * 앱 origin — 공유 {@code playwright.real-qa.config.ts} 에는 {@code use.baseURL} 이 없다(슬라이스마다
 * 렌더러를 다른 포트로 띄우기 때문). 상대 경로 {@code page.goto('/#…')} 는 baseURL 없이는 뜨지
 * 않으므로 이 스펙은 절대 URL 로 이동한다 — 공유 하네스를 건드리지 않고 포트만 갈아끼울 수 있다.
 * 기본값은 {@code vite.renderer.dev.config.ts} 의 정본 포트다.
 */
const APP_BASE = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5175'
const shots = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '929-r5-route-collision'))

/** 없는 거래처 코드 — 모든 단언의 기준선. */
const ABSENT = 'NOSUCH9999'

/**
 * partner-service {@code /internal/partners/*} 의 형제 라우트 이름 전수(소스 전수 + 라이브 실측).
 * 1세그먼트 리터럴 5종과 2세그먼트 라우트의 각 세그먼트를 모두 코드 자리에 넣어 본다.
 */
const ROUTE_NAMES = [
  'list', // GET 리터럴 — 200 + 거래처 배열 (실측 502 원인 ①)
  'by-name', // GET 리터럴 — 400 필수 파라미터 누락 (실측 502 원인 ②)
  'find-by-codes', // POST 전용 → {partnerCode} 로 낙하
  'lookup-by-ids', // POST 전용 → {partnerCode} 로 낙하
  'export', // /export/aligo-csv 선두
  'aligo-csv',
  'admin', // /admin/blocks 선두
  'blocks',
  'summary', // /{id}/summary 후미
  'business-number', // /{id}/business-number 후미
]

/** 4차가 확보한 전달 불가 문자 축 — 회귀 확인용. */
const UNTRANSPORTABLE = ['50%', 'P/2026', 'P-2026-0001;', '..']

/** 실 DB 에 존재하는 코드 — 과차단 무회귀 확인용. */
const REAL_CODE = 'P-2026-0001'

/** {@link REAL_CODE} 의 매출이 실제로 존재하는 기간 (라이브 API 실측: 당월 0건, 2026 연간 1건). */
const DATA_RANGE = { from: '2026-01-01', to: '2026-12-31' }

type LoginResult = { token: string; userId: string; role: string; displayName: string }

async function realLogin(page: Page, loginId = 'dev_master', password = 'dev_p05_pass!'): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId, password } })
  expect(response.ok(), `실 로그인 HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { data?: Partial<LoginResult> }
  const data = body.data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? '',
    displayName: data.displayName ?? loginId,
  }
}

async function installAuth(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: auth.token,
          userId: auth.userId,
          role: auth.role,
          fullName: auth.displayName,
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, login)
}

async function dismissUpdateModal(page: Page): Promise<void> {
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label, exact: true })
    if (await button.count()) await button.first().click().catch(() => undefined)
  }
}

/** HashRouter 라우트로 완전 재진입 (same-document navigation 무동작 회피 — #897 S8). */
async function gotoFresh(page: Page, hashRoute: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${APP_BASE}/#${hashRoute}`, { waitUntil: 'domcontentloaded' })
  await dismissUpdateModal(page)
}

/** 화면에 실제로 떠 있는 오류 배너 문구 전부. */
async function alertTexts(page: Page): Promise<string[]> {
  return page.locator('[role="alert"]').allInnerTexts()
}

/** 5xx 를 사용자에게 노출하는 문구 — 어떤 입력에서도 나오면 안 된다. */
function serverFailureBanners(alerts: string[]): string[] {
  return alerts.filter((t) => /50[0-9]|일시적으로|내부 인증|불러오지 못했습니다\.$/.test(t))
}

/** 파일명에 쓸 수 있게 입력값을 슬러그화. */
function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '_')
}

const safeText = (v: string): string => JSON.stringify(v)

test.describe.serial('#929 재수렴 5차 D-RC5-1 실 서버 라이브QA', () => {
  test('QA-1 일마감 — 형제 라우트 이름을 넣어도 "없는 코드"와 똑같이 동작한다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/daily-closing')
    await expect(page.getByTestId('daily-closing-page')).toBeVisible()

    const filter = page.getByTestId('daily-closing-filter-partner')

    // 기준선 — 없는 코드.
    await filter.fill(ABSENT)
    await page.waitForTimeout(1200)
    const baselineAlerts = await alertTexts(page)
    await expect(page.getByTestId('daily-closing-list-table')).toBeVisible()
    await page.screenshot({ path: join(shots, '01-daily-closing-baseline-absent.png'), fullPage: true })
    console.log(`QA-1 기준선(${ABSENT}) 배너=${safeText(JSON.stringify(baselineAlerts))}`)
    expect(serverFailureBanners(baselineAlerts), '기준선 자체가 깨져 있으면 비교가 무의미').toEqual([])

    const observed: string[] = []
    for (const name of ROUTE_NAMES) {
      await filter.fill(name)
      await page.waitForTimeout(1200)
      const alerts = await alertTexts(page)
      observed.push(`[${name}] 배너=${JSON.stringify(alerts)}`)
      await page.screenshot({
        path: join(shots, `02-daily-closing-${slug(name)}.png`),
        fullPage: true,
      })
      expect(
        serverFailureBanners(alerts),
        `일마감 [${name}] 에서 서버 장애 배너: ${alerts.join(' / ')}`,
      ).toEqual([])
      expect(alerts, `일마감 [${name}] 이 없는 코드와 다른 화면을 만듦`).toEqual(baselineAlerts)
      await expect(page.getByTestId('daily-closing-list-table')).toBeVisible()
    }
    console.log('QA-1 라우트 이름 결과:\n  ' + observed.join('\n  '))

    // 4차 회귀 — 전달 불가 문자도 여전히 기준선과 같다.
    for (const value of UNTRANSPORTABLE) {
      await filter.fill(value)
      await page.waitForTimeout(1200)
      const alerts = await alertTexts(page)
      expect(alerts, `일마감 [${value}] 4차 회귀`).toEqual(baselineAlerts)
    }
    await page.screenshot({ path: join(shots, '03-daily-closing-char-regression.png'), fullPage: true })

    // 과차단 무회귀 — 실존 코드는 그대로 조회된다.
    await filter.fill(REAL_CODE)
    await page.waitForTimeout(1200)
    expect(serverFailureBanners(await alertTexts(page)), '실존 코드가 깨짐').toEqual([])
    await expect(page.getByTestId('daily-closing-list-table')).toBeVisible()
    await page.screenshot({ path: join(shots, '04-daily-closing-real-code.png'), fullPage: true })
  })

  test('QA-2 원장 — 형제 라우트 이름이 502 를 만들지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/ledgers')
    await expect(page.getByTestId('general-ledger-page')).toBeVisible()

    const filter = page.getByTestId('general-ledger-filter-partner')
    const search = page.getByTestId('general-ledger-filter-search')

    await filter.fill(ABSENT)
    await search.click()
    await page.waitForTimeout(1800)
    const baselineAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '05-general-ledger-baseline-absent.png'), fullPage: true })
    console.log(`QA-2 기준선(${ABSENT}) 배너=${safeText(JSON.stringify(baselineAlerts))}`)
    expect(serverFailureBanners(baselineAlerts), '기준선에 5xx 배너').toEqual([])

    const observed: string[] = []
    for (const name of ROUTE_NAMES) {
      await filter.fill(name)
      await search.click()
      await page.waitForTimeout(1800)
      const alerts = await alertTexts(page)
      observed.push(`[${name}] 배너=${JSON.stringify(alerts)}`)
      await page.screenshot({ path: join(shots, `06-general-ledger-${slug(name)}.png`), fullPage: true })
      expect(serverFailureBanners(alerts), `원장 [${name}] 에서 5xx 배너: ${alerts.join(' / ')}`).toEqual([])
      expect(
        alerts.map((t) => t.replace(new RegExp(name, 'g'), ABSENT)),
        `원장 [${name}] 이 없는 코드와 다른 화면을 만듦`,
      ).toEqual(baselineAlerts)
    }
    console.log('QA-2 라우트 이름 결과:\n  ' + observed.join('\n  '))

    for (const value of UNTRANSPORTABLE) {
      await filter.fill(value)
      await search.click()
      await page.waitForTimeout(1800)
      expect(serverFailureBanners(await alertTexts(page)), `원장 [${value}] 4차 회귀`).toEqual([])
    }
    await page.screenshot({ path: join(shots, '07-general-ledger-char-regression.png'), fullPage: true })

    await filter.fill(REAL_CODE)
    await search.click()
    await page.waitForTimeout(1800)
    expect(serverFailureBanners(await alertTexts(page)), '실존 코드가 깨짐').toEqual([])
    await page.screenshot({ path: join(shots, '08-general-ledger-real-code.png'), fullPage: true })
  })

  test('QA-3 거래처원장 — 형제 라우트 이름이 집계 실패를 만들지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/partner-ledger')
    await expect(page.getByTestId('partner-ledger-partner')).toBeVisible()

    const filter = page.getByTestId('partner-ledger-partner')
    const search = page.getByTestId('partner-ledger-search')

    await filter.fill(ABSENT)
    await search.click()
    await page.waitForTimeout(1800)
    const baselineAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '09-partner-ledger-baseline-absent.png'), fullPage: true })
    console.log(`QA-3 기준선(${ABSENT}) 배너=${safeText(JSON.stringify(baselineAlerts))}`)
    expect(serverFailureBanners(baselineAlerts), '기준선에 5xx 배너').toEqual([])

    const observed: string[] = []
    for (const name of ROUTE_NAMES) {
      await filter.fill(name)
      await search.click()
      await page.waitForTimeout(1800)
      const alerts = await alertTexts(page)
      observed.push(`[${name}] 배너=${JSON.stringify(alerts)}`)
      await page.screenshot({ path: join(shots, `10-partner-ledger-${slug(name)}.png`), fullPage: true })
      expect(
        alerts.filter((t) => /집계 조회 실패|50[0-9]|일시적으로|내부 인증/.test(t)),
        `거래처원장 [${name}] 에서 실패 배너: ${alerts.join(' / ')}`,
      ).toEqual([])
      expect(alerts, `거래처원장 [${name}] 이 없는 코드와 다른 화면을 만듦`).toEqual(baselineAlerts)
    }
    console.log('QA-3 라우트 이름 결과:\n  ' + observed.join('\n  '))

    for (const value of UNTRANSPORTABLE) {
      await filter.fill(value)
      await search.click()
      await page.waitForTimeout(1800)
      expect(
        (await alertTexts(page)).filter((t) => /집계 조회 실패|50[0-9]|일시적으로|내부 인증/.test(t)),
        `거래처원장 [${value}] 4차 회귀`,
      ).toEqual([])
    }
    await page.screenshot({ path: join(shots, '11-partner-ledger-char-regression.png'), fullPage: true })

    // 과차단 무회귀 — 실존 코드는 집계 표가 실제로 그려진다. 기본 기간(당월)에는 이 거래처의
    // 매출이 0건이라 "데이터 없음" 상태가 정상이므로, 실 DB 에 매출이 있는 기간으로 넓혀서 본다
    // (읽기 전용 필터 조작).
    await page.getByTestId('partner-ledger-from').fill(DATA_RANGE.from)
    await page.getByTestId('partner-ledger-to').fill(DATA_RANGE.to)
    await filter.fill(REAL_CODE)
    await search.click()
    await page.waitForTimeout(2500)
    const realAlerts = await alertTexts(page)
    expect(
      realAlerts.filter((t) => /집계 조회 실패|50[0-9]/.test(t)),
      '실존 코드가 깨짐',
    ).toEqual([])
    await expect(page.getByTestId('partner-ledger-aggregate-table')).toBeVisible()
    await expect(page.getByTestId(`partner-ledger-aggregate-row-${REAL_CODE}`)).toBeVisible()
    await page.screenshot({ path: join(shots, '12-partner-ledger-real-code.png'), fullPage: true })
  })

  test('QA-4 3자 일치 — 실존 코드의 DB · API · 화면이 같은 거래처를 가리킨다', async ({ page }) => {
    const login = await realLogin(page)
    await installAuth(page, login)

    // API — 게이트웨이 실 응답.
    const apiRes = await page.request.get(
      `${API_BASE}/api/v1/accounting/sales/aggregate`
        + `?from=${DATA_RANGE.from}&to=${DATA_RANGE.to}&partnerCode=${REAL_CODE}`,
      { headers: { Authorization: `Bearer ${login.token}` } },
    )
    expect(apiRes.status(), 'API 가 실존 코드에 200 이 아님').toBe(200)
    const apiBody = (await apiRes.json()) as { data?: Array<{ partnerCode?: string }> }
    const apiCodes = (apiBody.data ?? []).map((r) => r.partnerCode)
    console.log('QA-4 API partnerCode 목록:', JSON.stringify(apiCodes))
    expect(apiCodes.every((c) => c === REAL_CODE), 'API 응답에 다른 거래처가 섞임').toBeTruthy()

    // UI — 같은 필터의 화면.
    await gotoFresh(page, '/accounting/partner-ledger')
    await page.getByTestId('partner-ledger-from').fill(DATA_RANGE.from)
    await page.getByTestId('partner-ledger-to').fill(DATA_RANGE.to)
    await page.getByTestId('partner-ledger-partner').fill(REAL_CODE)
    await page.getByTestId('partner-ledger-search').click()
    await page.waitForTimeout(2500)
    await expect(page.getByTestId(`partner-ledger-aggregate-row-${REAL_CODE}`)).toBeVisible()
    const uiRows = await page.locator('[data-testid^="partner-ledger-aggregate-row-"]').count()
    console.log('QA-4 UI 집계 행수:', uiRows, '/ API 행수:', apiCodes.length)
    expect(uiRows, 'UI 행수와 API 행수 불일치').toBe(apiCodes.length)
    await page.screenshot({ path: join(shots, '13-three-way-agreement.png'), fullPage: true })
  })
})
