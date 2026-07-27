import { expect, test, type Locator, type Page } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

/**
 * #929 재수렴 6차 D-RC6-1 — 실 서버 라이브QA (mock OFF · Docker 게이트웨이 :8080).
 *
 * <p><b>닫는 결함</b> — 거래처코드 필터에 제어문자 23종 중 하나를 <b>단독으로</b>(또는 공백과만
 * 섞어) 넣으면 4엔드포인트가 전부 502 로 깨졌다.
 * <pre>
 *   일마감      "마감 이력을 불러오지 못했습니다."
 *   원장        "원장을 불러오지 못했습니다: … status code 502"
 *   거래처원장   "집계 조회 실패: … status code 502"
 * </pre>
 *
 * <p><b>기전은 판정 순서다</b> — {@code PartnerLookupClient.findByPartnerCodeResult} 가
 * {@code isBlank()} 는 <b>원본</b>으로 판정하고 {@code isAddressableAsPathSegment()} 는
 * <b>{@code trim()} 결과</b>로 판정했다. {@code Character.isWhitespace(0x02)} 는 false 라
 * blank 검사를 통과하는데 {@code String.trim()} 은 {@code <= U+0020} 를 전부 제거하므로
 * {@code trimmed = ""} 가 되고, 빈 문자열은 가드의 문자 루프가 <b>0회</b> 돌아 어떤 판정도
 * 적용되지 않은 채 {@code true} 를 받는다. 결국 {@code GET /internal/partners/} 가 나가고
 * partner-service 가 {@code NoResourceFoundException} → 500 을 돌려주며, 5차의
 * {@code isAddressingFailure} 는 4xx 만 보므로 500 은 그대로 {@code UNAVAILABLE} → 502 다.
 *
 * <p><b>트리거 집합</b> = {@code c <= 0x20 && !Character.isWhitespace(c)}
 * = U+0000–U+0008 · U+000E–U+001B (23종). 바코드 스캐너의 STX/ETX, 고정폭 리포트·CSV
 * 복사가 현실 경로다. 앞뒤에 글자가 붙으면 trim 이 지우지 못해 4차의 문자 가드가 잡는다.
 *
 * <p><b>단언의 기준선</b> — "배너가 없다"가 아니라 <b>"없는 거래처 코드와 완전히 같게 동작한다"</b>
 * 이다(5차와 동일 기준). 원장처럼 미존재 코드에 404 배너를 띄우는 화면이 있어 배너 유무만
 * 보면 화면마다 기준이 흔들린다.
 *
 * <p><b>입력은 합성 이벤트가 아니다</b> — {@code fill()} 만 쓰면 "React state 에 값이 들어갔다"
 * 밖에 증명하지 못한다. 그래서 실 클립보드 붙여넣기({@code navigator.clipboard.writeText} +
 * {@code Control+V})와 실 키보드 {@code insertText}(CDP {@code Input.insertText}) 두 경로를
 * 먼저 재현하고, 입력 요소의 실제 {@code value} 코드포인트를 읽어 {@code [2]} 임을 증명한다.
 *
 * <p><b>회귀 범위</b> — 4차(문자 축)·5차(라우트 이름 축)·과차단 무회귀를 같은 화면에서 함께
 * 다시 잰다. 전부 <b>읽기 전용</b>이다 — 어떤 행도 생성·수정·삭제하지 않는다.
 */
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
/** 앱 origin — 공유 config 에 {@code use.baseURL} 이 없어 절대 URL 로 이동한다(5차와 동일). */
const APP_BASE = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5175'
const shots = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '929-r6-normalize-before-judge'))

/** 없는 거래처 코드 — 모든 단언의 기준선. */
const ABSENT = 'NOSUCH9999'

/** 실 DB 에 존재하는 코드 — 과차단 무회귀 확인용. */
const REAL_CODE = 'P-2026-0001'

/** {@link REAL_CODE} 의 매출이 실제로 존재하는 기간 (라이브 API 실측). */
const DATA_RANGE = { from: '2026-01-01', to: '2026-12-31' }

/**
 * 트리거 집합 — {@code trim()} 은 지우지만 {@code Character.isWhitespace} 는 false 인 코드포인트.
 * Java 의 whitespace 집합(09 0A 0B 0C 0D 1C 1D 1E 1F 20)을 0x00–0x20 에서 빼면 정확히 23종이다.
 * 열거가 아니라 <b>정의</b>로 만들어서, 하나를 손으로 빠뜨릴 여지를 없앤다.
 */
const JAVA_WHITESPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20])
const TRIGGER_CODEPOINTS: number[] = Array.from({ length: 0x21 }, (_, cp) => cp).filter(
  (cp) => !JAVA_WHITESPACE.has(cp),
)

/** 대표 트리거 — 바코드 스캐너 STX. 실 입력 경로(클립보드·키보드) 재현에 쓴다. */
const STX = String.fromCodePoint(0x02)

/** 5차가 확보한 라우트 이름 축 — 회귀 확인용(전수 14 중 실측 502 를 냈던 2종 + 대표 2종). */
const ROUTE_NAMES = ['list', 'by-name', 'find-by-codes', 'summary']

/** 4차가 확보한 전달 불가 문자 축 — 회귀 확인용. */
const UNTRANSPORTABLE = ['50%', 'P/2026', 'P-2026-0001;', '..']

/** 제어문자가 <b>글자 사이/앞뒤에 글자와 함께</b> 있으면 4차 가드가 잡아야 한다(무회귀). */
const CONTROL_WITH_LETTERS = [`P${STX}X`, `${STX}${ABSENT}`, `${ABSENT}${STX}`]

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
  return alerts.filter((t) => /50[0-9]|일시적으로|내부 인증|집계 조회 실패|불러오지 못했습니다\.$/.test(t))
}

/** 입력 요소에 실제로 들어간 값의 코드포인트 — "합성 이벤트가 아니다"의 증명. */
async function valueCodePoints(input: Locator): Promise<number[]> {
  return input.evaluate((el) => Array.from((el as HTMLInputElement).value).map((c) => c.codePointAt(0) ?? -1))
}

/** 실 클립보드 붙여넣기 — OS 클립보드에 쓰고 Control+V 로 붙인다. */
async function pasteFromClipboard(page: Page, input: Locator, value: string): Promise<void> {
  await page.evaluate((text) => navigator.clipboard.writeText(text), value)
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
}

/** 실 키보드 insertText — CDP Input.insertText (IME/붙여넣기와 같은 경로). */
async function typeWithKeyboard(page: Page, input: Locator, value: string): Promise<void> {
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(value)
}

function hex(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.describe.serial('#929 재수렴 6차 D-RC6-1 실 서버 라이브QA', () => {
  test('QA-1 일마감 — 실 클립보드·실 키보드로 넣은 제어문자가 화면을 깨지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/daily-closing')
    await expect(page.getByTestId('daily-closing-page')).toBeVisible()

    const filter = page.getByTestId('daily-closing-filter-partner')

    // ── 기준선 — 없는 코드.
    await filter.fill(ABSENT)
    await page.waitForTimeout(1400)
    const baselineAlerts = await alertTexts(page)
    await expect(page.getByTestId('daily-closing-list-table')).toBeVisible()
    await page.screenshot({ path: join(shots, '01-daily-closing-baseline-absent.png'), fullPage: true })
    console.log(`QA-1 기준선(${ABSENT}) 배너=${JSON.stringify(baselineAlerts)}`)
    expect(serverFailureBanners(baselineAlerts), '기준선 자체가 깨져 있으면 비교가 무의미').toEqual([])

    // ── 실 입력 경로 ① 클립보드 붙여넣기.
    await pasteFromClipboard(page, filter, STX)
    const pastedCodePoints = await valueCodePoints(filter)
    console.log(`QA-1 [실 클립보드 붙여넣기 STX] input 코드포인트=${JSON.stringify(pastedCodePoints)}`)
    expect(pastedCodePoints, '클립보드 붙여넣기가 제어문자를 넣지 못함 — 재현 전제 실패').toEqual([0x02])
    await page.waitForTimeout(1400)
    const pasteAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '02-daily-closing-clipboard-stx.png'), fullPage: true })
    console.log(`QA-1 [실 클립보드 붙여넣기 STX] 배너=${JSON.stringify(pasteAlerts)}`)
    expect(serverFailureBanners(pasteAlerts), `클립보드 붙여넣기 STX 에서 서버 장애 배너`).toEqual([])
    expect(pasteAlerts, '클립보드 붙여넣기 STX 가 없는 코드와 다른 화면을 만듦').toEqual(baselineAlerts)

    // ── 실 입력 경로 ② 키보드 insertText.
    await typeWithKeyboard(page, filter, STX)
    const typedCodePoints = await valueCodePoints(filter)
    console.log(`QA-1 [실 키보드 insertText STX] input 코드포인트=${JSON.stringify(typedCodePoints)}`)
    expect(typedCodePoints, 'insertText 가 제어문자를 넣지 못함 — 재현 전제 실패').toEqual([0x02])
    await page.waitForTimeout(1400)
    const typedAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '03-daily-closing-insert-text-stx.png'), fullPage: true })
    console.log(`QA-1 [실 키보드 insertText STX] 배너=${JSON.stringify(typedAlerts)}`)
    expect(serverFailureBanners(typedAlerts), `insertText STX 에서 서버 장애 배너`).toEqual([])
    expect(typedAlerts, 'insertText STX 가 없는 코드와 다른 화면을 만듦').toEqual(baselineAlerts)

    // ── 트리거 23종 전수 — 화면 필터로.
    const broken: string[] = []
    for (const cp of TRIGGER_CODEPOINTS) {
      await filter.fill(String.fromCodePoint(cp))
      await page.waitForTimeout(900)
      const alerts = await alertTexts(page)
      if (serverFailureBanners(alerts).length > 0) broken.push(`${hex(cp)} → ${alerts.join(' / ')}`)
    }
    await page.screenshot({ path: join(shots, '04-daily-closing-23-triggers.png'), fullPage: true })
    console.log(`QA-1 트리거 23종 결과: 깨진 건수=${broken.length}`)
    expect(broken, `일마감에서 제어문자가 화면을 깨뜨림:\n${broken.join('\n')}`).toEqual([])

    // ── 제어문자 + 글자 조합 (4차 문자 가드 무회귀).
    for (const value of CONTROL_WITH_LETTERS) {
      await filter.fill(value)
      await page.waitForTimeout(900)
      expect(serverFailureBanners(await alertTexts(page)), `일마감 제어문자+글자 조합 회귀`).toEqual([])
    }

    // ── 5차 라우트 이름 축 무회귀.
    for (const name of ROUTE_NAMES) {
      await filter.fill(name)
      await page.waitForTimeout(900)
      expect(await alertTexts(page), `일마감 [${name}] 5차 회귀`).toEqual(baselineAlerts)
    }
    // ── 4차 문자 축 무회귀.
    for (const value of UNTRANSPORTABLE) {
      await filter.fill(value)
      await page.waitForTimeout(900)
      expect(await alertTexts(page), `일마감 [${value}] 4차 회귀`).toEqual(baselineAlerts)
    }
    await page.screenshot({ path: join(shots, '05-daily-closing-prior-round-regression.png'), fullPage: true })

    // ── 과차단 무회귀 — 실존 코드는 그대로 조회된다.
    await filter.fill(REAL_CODE)
    await page.waitForTimeout(1400)
    expect(serverFailureBanners(await alertTexts(page)), '실존 코드가 깨짐').toEqual([])
    await expect(page.getByTestId('daily-closing-list-table')).toBeVisible()
    await page.screenshot({ path: join(shots, '06-daily-closing-real-code.png'), fullPage: true })
  })

  test('QA-2 원장 — 제어문자 23종이 502 를 만들지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/ledgers')
    await expect(page.getByTestId('general-ledger-page')).toBeVisible()

    const filter = page.getByTestId('general-ledger-filter-partner')
    const search = page.getByTestId('general-ledger-filter-search')

    await filter.fill(ABSENT)
    await search.click()
    await page.waitForTimeout(1800)
    const baselineAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '07-general-ledger-baseline-absent.png'), fullPage: true })
    console.log(`QA-2 기준선(${ABSENT}) 배너=${JSON.stringify(baselineAlerts)}`)
    expect(serverFailureBanners(baselineAlerts), '기준선에 5xx 배너').toEqual([])

    // 실 키보드 insertText 로 STX.
    await typeWithKeyboard(page, filter, STX)
    expect(await valueCodePoints(filter), 'insertText 재현 전제 실패').toEqual([0x02])
    await search.click()
    await page.waitForTimeout(1800)
    const typedAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '08-general-ledger-insert-text-stx.png'), fullPage: true })
    console.log(`QA-2 [실 키보드 insertText STX] 배너=${JSON.stringify(typedAlerts)}`)
    expect(serverFailureBanners(typedAlerts), `원장 insertText STX 에서 5xx 배너`).toEqual([])

    const broken: string[] = []
    for (const cp of TRIGGER_CODEPOINTS) {
      await filter.fill(String.fromCodePoint(cp))
      await search.click()
      await page.waitForTimeout(900)
      const alerts = await alertTexts(page)
      if (serverFailureBanners(alerts).length > 0) broken.push(`${hex(cp)} → ${alerts.join(' / ')}`)
    }
    await page.screenshot({ path: join(shots, '09-general-ledger-23-triggers.png'), fullPage: true })
    console.log(`QA-2 트리거 23종 결과: 깨진 건수=${broken.length}`)
    expect(broken, `원장에서 제어문자가 화면을 깨뜨림:\n${broken.join('\n')}`).toEqual([])

    for (const value of [...CONTROL_WITH_LETTERS, ...UNTRANSPORTABLE]) {
      await filter.fill(value)
      await search.click()
      await page.waitForTimeout(900)
      expect(serverFailureBanners(await alertTexts(page)), `원장 [${value}] 이전 라운드 회귀`).toEqual([])
    }
    for (const name of ROUTE_NAMES) {
      await filter.fill(name)
      await search.click()
      await page.waitForTimeout(900)
      expect(serverFailureBanners(await alertTexts(page)), `원장 [${name}] 5차 회귀`).toEqual([])
    }
    await page.screenshot({ path: join(shots, '10-general-ledger-prior-round-regression.png'), fullPage: true })

    await filter.fill(REAL_CODE)
    await search.click()
    await page.waitForTimeout(1800)
    expect(serverFailureBanners(await alertTexts(page)), '실존 코드가 깨짐').toEqual([])
    await page.screenshot({ path: join(shots, '11-general-ledger-real-code.png'), fullPage: true })
  })

  test('QA-3 거래처원장 — 제어문자 23종이 집계 실패를 만들지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/partner-ledger')
    await expect(page.getByTestId('partner-ledger-partner')).toBeVisible()

    const filter = page.getByTestId('partner-ledger-partner')
    const search = page.getByTestId('partner-ledger-search')

    await filter.fill(ABSENT)
    await search.click()
    await page.waitForTimeout(1800)
    const baselineAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '12-partner-ledger-baseline-absent.png'), fullPage: true })
    console.log(`QA-3 기준선(${ABSENT}) 배너=${JSON.stringify(baselineAlerts)}`)
    expect(serverFailureBanners(baselineAlerts), '기준선에 5xx 배너').toEqual([])

    await pasteFromClipboard(page, filter, STX)
    expect(await valueCodePoints(filter), '클립보드 재현 전제 실패').toEqual([0x02])
    await search.click()
    await page.waitForTimeout(1800)
    const pasteAlerts = await alertTexts(page)
    await page.screenshot({ path: join(shots, '13-partner-ledger-clipboard-stx.png'), fullPage: true })
    console.log(`QA-3 [실 클립보드 붙여넣기 STX] 배너=${JSON.stringify(pasteAlerts)}`)
    expect(serverFailureBanners(pasteAlerts), `거래처원장 클립보드 STX 에서 실패 배너`).toEqual([])

    const broken: string[] = []
    for (const cp of TRIGGER_CODEPOINTS) {
      await filter.fill(String.fromCodePoint(cp))
      await search.click()
      await page.waitForTimeout(900)
      const alerts = await alertTexts(page)
      if (serverFailureBanners(alerts).length > 0) broken.push(`${hex(cp)} → ${alerts.join(' / ')}`)
    }
    await page.screenshot({ path: join(shots, '14-partner-ledger-23-triggers.png'), fullPage: true })
    console.log(`QA-3 트리거 23종 결과: 깨진 건수=${broken.length}`)
    expect(broken, `거래처원장에서 제어문자가 화면을 깨뜨림:\n${broken.join('\n')}`).toEqual([])

    for (const value of [...CONTROL_WITH_LETTERS, ...UNTRANSPORTABLE, ...ROUTE_NAMES]) {
      await filter.fill(value)
      await search.click()
      await page.waitForTimeout(900)
      expect(serverFailureBanners(await alertTexts(page)), `거래처원장 [${value}] 이전 라운드 회귀`).toEqual([])
    }
    await page.screenshot({ path: join(shots, '15-partner-ledger-prior-round-regression.png'), fullPage: true })

    await page.getByTestId('partner-ledger-from').fill(DATA_RANGE.from)
    await page.getByTestId('partner-ledger-to').fill(DATA_RANGE.to)
    await filter.fill(REAL_CODE)
    await search.click()
    await page.waitForTimeout(2500)
    expect(serverFailureBanners(await alertTexts(page)), '실존 코드가 깨짐').toEqual([])
    await expect(page.getByTestId('partner-ledger-aggregate-table')).toBeVisible()
    await expect(page.getByTestId(`partner-ledger-aggregate-row-${REAL_CODE}`)).toBeVisible()
    await page.screenshot({ path: join(shots, '16-partner-ledger-real-code.png'), fullPage: true })
  })

  test('QA-4 HTTP 전수 — 트리거 23종 × 4엔드포인트 어디에도 5xx 가 없다', async ({ page }) => {
    const login = await realLogin(page)
    const endpoints: Array<{ name: string; path: string; params: Record<string, string> }> = [
      { name: '일마감 목록', path: '/api/accounting/daily-closings', params: DATA_RANGE },
      { name: '원장', path: '/api/accounting/ledgers', params: DATA_RANGE },
      { name: '매출 집계', path: '/api/accounting/sales/aggregate', params: DATA_RANGE },
      { name: '거래처원장 데이터', path: '/api/accounting/journals/ledger-data', params: DATA_RANGE },
    ]

    // 기준선 — 없는 코드의 상태코드를 화면별로 먼저 고정한다(원장/거래처원장은 404 가 정상).
    const baseline: Record<string, number> = {}
    for (const ep of endpoints) {
      const res = await page.request.get(
        `${API_BASE}${ep.path}?from=${ep.params.from}&to=${ep.params.to}&partnerCode=${ABSENT}`,
        { headers: { Authorization: `Bearer ${login.token}` } },
      )
      baseline[ep.name] = res.status()
      expect(res.status(), `${ep.name} 기준선이 5xx`).toBeLessThan(500)
    }
    console.log('QA-4 기준선(NOSUCH9999) 상태코드=' + JSON.stringify(baseline))

    const mismatches: string[] = []
    let calls = 0
    for (const cp of TRIGGER_CODEPOINTS) {
      for (const ep of endpoints) {
        const res = await page.request.get(
          `${API_BASE}${ep.path}?from=${ep.params.from}&to=${ep.params.to}`
            + `&partnerCode=${encodeURIComponent(String.fromCodePoint(cp))}`,
          { headers: { Authorization: `Bearer ${login.token}` } },
        )
        calls += 1
        if (res.status() !== baseline[ep.name]) {
          mismatches.push(`${hex(cp)} ${ep.name} → HTTP ${res.status()} (기준선 ${baseline[ep.name]})`)
        }
      }
    }
    console.log(`QA-4 전수 호출=${calls}건, 기준선 불일치=${mismatches.length}건`)
    expect(mismatches, `제어문자가 기준선과 다른 응답을 만듦:\n${mismatches.join('\n')}`).toEqual([])
    expect(calls, '전수 호출 건수').toBe(TRIGGER_CODEPOINTS.length * endpoints.length)
  })
})
