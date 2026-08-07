import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

/**
 * #929 재수렴 4차 — 실 서버 라이브QA (mock OFF · Docker 게이트웨이 :8080).
 *
 * <p>닫는 결함 4건:
 * <ul>
 *   <li>D1 — 일마감 거래처코드 필터가 {@code ';'} 에서 503 (자기 화면 가드 우회)</li>
 *   <li>D2 — 같은 계약을 쓰는 나머지 호출부(원장·거래처원장 등)가 {@code '%'}·{@code '/'}·
 *       {@code ';'} 에서 502/503</li>
 *   <li>R-1 — {@code aria-controls} 가 존재하지 않는 패널 id 를 가리킴(통장거래)</li>
 *   <li>② — off-page 상세 요약이 서버 마감 상태와 어긋난 값을 계속 표시</li>
 * </ul>
 *
 * <p>전부 <b>읽기 전용</b>이다 — 일마감/통장거래 어느 행도 생성·수정·삭제하지 않는다
 * (②는 실 DB 에 이미 있는 2031-05-15 21행을 조회만 한다).
 */
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const shots = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '929-r4-transport-guard'))

type LoginResult = { token: string; userId: string; role: string; displayName: string }

async function realLogin(page: Page, loginId = 'dev_master', password = (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))): Promise<LoginResult> {
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
          token: auth.token, userId: auth.userId, role: auth.role,
          fullName: auth.displayName, partnerCode: null,
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
  await page.goto(`/#${hashRoute}`, { waitUntil: 'domcontentloaded' })
  await dismissUpdateModal(page)
}

/** 화면에 실제로 떠 있는 오류 배너 문구 전부. */
async function alertTexts(page: Page): Promise<string[]> {
  return page.locator('[role="alert"]').allInnerTexts()
}

/** 전달 불가 문자 — 실측 거부 집합(%, /, \, ;, 단독 ., ..). */
const UNTRANSPORTABLE = ['50%', 'P/2026', 'P\\2026', 'P-2026-0001;', ';', '..', '.']

test.describe.serial('#929 재수렴 4차 실 서버 라이브QA', () => {
  test('QA-1 (D1) 일마감 거래처코드 필터 — 어떤 입력도 페이지를 깨지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/daily-closing')
    await expect(page.getByTestId('daily-closing-page')).toBeVisible()

    const filter = page.getByTestId('daily-closing-filter-partner')
    const observed: string[] = []
    for (const value of UNTRANSPORTABLE) {
      await filter.fill(value)
      await page.waitForTimeout(900)
      const alerts = await alertTexts(page)
      const broken = alerts.filter((t) => /불러오지 못했|503|502|일시적으로|내부 인증/.test(t))
      observed.push(`[${value}] 오류배너=${broken.length} ${broken.join(' / ')}`)
      await page.screenshot({
        path: join(shots, `01-d1-daily-closing-filter-${UNTRANSPORTABLE.indexOf(value)}.png`),
        fullPage: true,
      })
      expect(broken, `일마감 필터 [${value}] 에서 오류 배너 발생: ${broken.join(' / ')}`).toEqual([])
      await expect(page.getByTestId('daily-closing-list-table')).toBeVisible()
    }
    console.log('QA-1 D1 결과:\n  ' + observed.join('\n  '))

    // 과차단 무회귀 — 실존 코드는 여전히 조회된다.
    await filter.fill('P-2026-0001')
    await page.waitForTimeout(900)
    expect(await alertTexts(page)).toEqual([])
    await page.screenshot({ path: join(shots, '02-d1-daily-closing-real-code.png'), fullPage: true })
  })

  test('QA-2 (D2) 원장 — 자유입력 거래처 필터가 502/503 을 만들지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/ledgers')
    await expect(page.getByTestId('general-ledger-page')).toBeVisible()

    const observed: string[] = []
    for (const value of ['50%', 'P/2026', 'P-2026-0001;', '..']) {
      await page.getByTestId('general-ledger-filter-partner').fill(value)
      await page.getByTestId('general-ledger-filter-search').click()
      await page.waitForTimeout(1400)
      const alerts = await alertTexts(page)
      const broken = alerts.filter((t) => /503|502|일시적으로|내부 인증/.test(t))
      observed.push(`[${value}] 배너=${JSON.stringify(alerts)}`)
      await page.screenshot({
        path: join(shots, `03-d2-general-ledger-${value.replace(/[^A-Za-z0-9]/g, '_')}.png`),
        fullPage: true,
      })
      expect(broken, `원장 [${value}] 에서 503/502 배너: ${broken.join(' / ')}`).toEqual([])
    }
    console.log('QA-2 D2 원장 결과:\n  ' + observed.join('\n  '))
  })

  test('QA-3 (D2) 거래처원장 — 자유입력 거래처 필터가 집계 실패를 만들지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/partner-ledger')
    await expect(page.getByTestId('partner-ledger-partner')).toBeVisible()

    const observed: string[] = []
    for (const value of ['50%', 'P/2026', 'P-2026-0001;']) {
      await page.getByTestId('partner-ledger-partner').fill(value)
      await page.getByTestId('partner-ledger-search').click()
      await page.waitForTimeout(1400)
      const alerts = await alertTexts(page)
      const broken = alerts.filter((t) => /503|502|일시적으로|내부 인증|집계 조회 실패/.test(t))
      observed.push(`[${value}] 배너=${JSON.stringify(alerts)}`)
      await page.screenshot({
        path: join(shots, `04-d2-partner-ledger-${value.replace(/[^A-Za-z0-9]/g, '_')}.png`),
        fullPage: true,
      })
      expect(broken, `거래처원장 [${value}] 에서 실패 배너: ${broken.join(' / ')}`).toEqual([])
    }
    console.log('QA-3 D2 거래처원장 결과:\n  ' + observed.join('\n  '))
  })

  test('QA-4 (R-1) 통장거래 — aria-controls 는 존재하는 요소만 가리킨다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/bank-transactions')
    await page.getByRole('table').first().waitFor({ state: 'visible', timeout: 60_000 })
    await page.waitForTimeout(1200)

    /**
     * R-1 은 <b>이 PR 이 건드린 표면</b>(통장거래 본문)의 계약이다. 앱 셸(사이드바
     * {@code #app-drawer} 의 SidebarGroupToggle)은 이 PR 밖의 선존재 표면이므로 단언에서
     * 제외하되, 실측 수치는 별도로 남겨 F2 에 보고한다.
     */
    const audit = async () =>
      page.evaluate(() => {
        const isChrome = (el: Element) => el.closest('#app-drawer') !== null
        const all = Array.from(document.querySelectorAll('[aria-controls]'))
        const content = all.filter((el) => !isChrome(el))
        const danglingOf = (list: Element[]) =>
          list
            .map((el) => ({ id: el.getAttribute('aria-controls') as string, testid: el.getAttribute('data-testid') }))
            .filter((x) => document.getElementById(x.id) === null)
        // R-1 의 대상은 통장거래 상세 토글이다 — 이 토글의 패널은 개방된 1행에만 렌더되므로
        // 닫힌 상태에서 aria-controls 를 선언하면 반드시 dangling(또는 남의 패널 지목)이다.
        // (패널이 항상 렌더되고 hidden 으로만 감춰지는 정상 disclosure 는 닫힌 상태에서도
        //  aria-controls 를 유지하는 것이 옳으므로 이 단언의 대상이 아니다.)
        const collapsedWithControls = document.querySelectorAll(
          'button[data-row-key][aria-expanded="false"][aria-controls]',
        ).length
        const otherContentAriaControls = Array.from(document.querySelectorAll('[aria-controls]'))
          .filter((el) => !isChrome(el) && !el.hasAttribute('data-row-key'))
          .map((el) => `${el.getAttribute('data-testid') ?? el.tagName}->#${el.getAttribute('aria-controls')}`)
        return {
          otherContentAriaControls,
          toggles: Array.from(document.querySelectorAll('button[aria-expanded]')).filter((el) => !isChrome(el)).length,
          ariaControls: content.length,
          dangling: danglingOf(content).length,
          danglingSample: danglingOf(content).slice(0, 3),
          collapsedWithControls,
          openPanels: document.querySelectorAll('section[role="region"][id^="bank-transaction-detail-"]').length,
          // 선존재 참고치 (단언 아님) — AppLayout 사이드바 그룹 토글.
          appShellAriaControls: all.length - content.length,
          appShellDangling: danglingOf(all.filter(isChrome)).length,
          appShellDanglingSample: danglingOf(all.filter(isChrome)).slice(0, 3),
        }
      })

    const before = await audit()
    console.log('QA-4 기본 화면:', JSON.stringify(before))
    await page.screenshot({ path: join(shots, '05-r1-bank-default.png'), fullPage: true })
    expect(before.dangling, `기본 화면 dangling: ${JSON.stringify(before.danglingSample)}`).toBe(0)
    expect(before.collapsedWithControls, '닫힌 토글이 aria-controls 를 선언함').toBe(0)

    const toggles = page.getByRole('button', { name: /상세 보기/ })
    const count = await toggles.count()
    expect(count, '상세 보기 토글이 없어 R-1 표면 미도달').toBeGreaterThan(0)
    await toggles.nth(Math.min(1, count - 1)).click()
    await page.waitForTimeout(700)

    const after = await audit()
    console.log('QA-4 개방 후:', JSON.stringify(after))
    await page.screenshot({ path: join(shots, '06-r1-bank-expanded.png'), fullPage: true })
    expect(after.openPanels, '패널이 열리지 않아 검증이 무의미').toBe(1)
    expect(after.dangling, `개방 후 dangling: ${JSON.stringify(after.danglingSample)}`).toBe(0)
    expect(after.collapsedWithControls, '닫힌 토글이 남의 패널을 자기 것으로 선언').toBe(0)
    expect(
      after.ariaControls - before.ariaControls,
      '개방으로 늘어난 aria-controls 는 정확히 1개(그 행)여야 한다',
    ).toBe(1)
  })

  test('QA-5 (②) off-page 상세 — 검증 못 한 마감 상태를 주장하지 않는다', async ({ page }) => {
    await installAuth(page, await realLogin(page))
    await gotoFresh(page, '/accounting/daily-closing')
    await expect(page.getByTestId('daily-closing-page')).toBeVisible()

    // 실 DB 에 이미 있는 21행 날짜(2031-05-15 SALES/TAX_INVOICE) — 읽기만 한다.
    await page.getByTestId('daily-closing-filter-date').fill('2031-05-15')
    await page.getByRole('radio', { name: '통합' }).click()
    await page.waitForTimeout(1500)

    const pagerBefore = await page.getByTestId('daily-closing-page-indicator').innerText()
    console.log('QA-5 통합 페이저(초기):', pagerBefore)
    expect(pagerBefore, '21건 이상 전제(2페이지) 미재현').toContain('/ 2')

    await page.getByTestId('daily-closing-page-next').click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(shots, '07-defect2-page2.png'), fullPage: true })

    const detailButtons = page.getByRole('button', { name: '상세 보기' })
    expect(await detailButtons.count(), '2페이지에 행이 없어 전제 미재현').toBeGreaterThan(0)
    await detailButtons.first().click()
    await page.waitForTimeout(1800)

    const pagerAfter = await page.getByTestId('daily-closing-page-indicator').innerText()
    const scope = page.getByTestId('daily-closing-selected-scope')
    await expect(scope, 'T2 무훼손 — 상세 카드 자체가 사라지면 안 된다').toBeVisible()
    const scopeText = await scope.innerText()
    console.log('QA-5 상세 클릭 후 페이저:', pagerAfter)
    console.log('QA-5 상세 요약 전문:', JSON.stringify(scopeText))
    await page.screenshot({ path: join(shots, '08-defect2-after-detail-click.png'), fullPage: true })

    const rowVisible = await detailButtons.count()
    if (pagerAfter.trim().startsWith('1') && rowVisible >= 0) {
      // S7 리셋으로 1페이지로 돌아왔고 대상 행이 그 페이지에 없다면 검증 불가 상태여야 한다.
      const unverified = page.getByTestId('daily-closing-selected-scope-unverified')
      const isUnverified = await unverified.count()
      console.log('QA-5 검증불가 안내 노출 =', isUnverified)
      if (isUnverified === 0) {
        // live 재도출에 성공한 경우 — 값은 서버가 방금 준 것이므로 정당하다.
        console.log('QA-5 live 재도출 성공 경로(값 표시가 정당)')
      } else {
        expect(scopeText, '검증 불가인데 마감 시각을 그대로 주장함').not.toMatch(/마감 시각\s+\d/)
      }
    }
    // 어느 경로든 "열림/마감" 두 주장이 동시에 보이면 안 된다.
    expect(
      /이전 마감 시각/.test(scopeText) && /(^|\s)마감 시각/.test(scopeText.replace(/이전 마감 시각/g, '')),
      '상세 요약이 모순된 두 라벨을 동시에 표시',
    ).toBeFalsy()
  })
})
