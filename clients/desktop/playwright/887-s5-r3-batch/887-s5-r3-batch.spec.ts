import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function parseCssColor(value: string): [number, number, number, number] {
  const match = value.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+))?\s*\)/i)
  if (!match) throw new Error(`CSS 색상을 RGB로 해석할 수 없음: ${value}`)
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const linear = (channel: number) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

async function gotoMock(page: Page, path: string, readyTestId: string): Promise<void> {
  await page.goto(`${BASE_URL}/#${path}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 15_000 })
}

test.describe('#887 슬5 R3 잔여 3건 mock 회귀', () => {
  test('오류 힌트는 실제 렌더 색과 배경으로 측정해 자매 화면 위험색 기준을 충족한다', async ({ page }) => {
    await gotoMock(page, '/accounting/bank-transactions?mockRole=ACCOUNTANT', 'codef-import-type')
    await page.getByTestId('codef-import-from').fill('2026-07-02')
    await page.getByTestId('codef-import-to').fill('2026-07-01')

    const metrics = await page.locator('.codef-import-hint--error').first().evaluate((element) => {
      const parseColor = (value: string): [number, number, number, number] => {
        const match = value.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+))?\s*\)/i)
        if (!match) throw new Error(`CSS 색상을 RGB로 해석할 수 없음: ${value}`)
        return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
      }
      const elementStyle = getComputedStyle(element)
      let background = 'rgba(0, 0, 0, 0)'
      let current: HTMLElement | null = element as HTMLElement
      while (current) {
        const candidate = getComputedStyle(current).backgroundColor
        if (parseColor(candidate)[3] > 0) {
          background = candidate
          break
        }
        current = current.parentElement
      }
      const probe = document.createElement('span')
      probe.style.color = 'var(--color-danger-700)'
      document.body.append(probe)
      const referenceColor = getComputedStyle(probe).color
      probe.remove()
      return {
        color: elementStyle.color,
        referenceColor,
        background,
      }
    })
    const foreground = parseCssColor(metrics.color)
    const background = parseCssColor(metrics.background)
    const ratio = contrastRatio(
      [foreground[0], foreground[1], foreground[2]],
      [background[0], background[1], background[2]],
    )
    console.log(`[대비 실측] 전경=${metrics.color} 기준토큰=${metrics.referenceColor} 배경=${metrics.background} 대비=${ratio.toFixed(2)}:1`)
    expect(metrics.color, '오류 힌트가 자매 화면 위험색 토큰과 다른 실제 색을 사용함').toBe(metrics.referenceColor)
    expect(ratio, `실제 렌더 대비 미달: ${metrics.color} on ${metrics.background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })

  test('R1-2(#950) — CodefImportScopeForm 저장/가져오기 오류 토스트(.bank-transaction-toast--error)도 AA 대비를 충족한다', async ({ page }) => {
    // 이 토스트는 CodefImportScopeForm 자신의 오류 채널(저장 실패·가져오기 실패·충돌)이
    // BankTransactionPage 의 toast 상태로 올라와 렌더된다. 실 라운드트립(409 충돌 등)은
    // in-process mock 이 페이지(JS 컨텍스트) 단위로만 상태를 갖고 있어 단일 탭에서 결정적으로
    // 재현할 수 없다 — 대신 실제 컴포넌트가 렌더하는 것과 동일한 두 클래스 조합
    // (`bank-transaction-toast bank-transaction-toast--error`)을 가진 노드를 만들어 실제
    // 오류 토스트가 뜬 순간과 동일한 computed style(캐스케이드 포함)을 측정한다 — 위
    // `.codef-import-hint--error` 테스트가 이미 쓰는 합성 probe 기법과 동일 정당성.
    await gotoMock(page, '/accounting/bank-transactions?mockRole=ACCOUNTANT', 'codef-import-type')

    const metrics = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'bank-transaction-toast bank-transaction-toast--error'
      document.body.append(probe)
      const style = getComputedStyle(probe)
      const result = { color: style.color, background: style.backgroundColor }
      probe.remove()
      return result
    })
    const foreground = parseCssColor(metrics.color)
    const background = parseCssColor(metrics.background)
    const ratio = contrastRatio(
      [foreground[0], foreground[1], foreground[2]],
      [background[0], background[1], background[2]],
    )
    console.log(`[대비 실측] .bank-transaction-toast--error 전경=${metrics.color} 배경=${metrics.background} 대비=${ratio.toFixed(2)}:1`)
    expect(ratio, `실제 렌더 대비 미달: ${metrics.color} on ${metrics.background} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })

  test('CODEF 전체 범위 칩은 Enter와 Space로 켜고 끄는 왕복 조작이 된다', async ({ page }) => {
    await gotoMock(page, '/accounting/bank-transactions?mockRole=ACCOUNTANT', 'codef-scope-hint')
    const pressable = page.getByTestId('codef-all-scope-chip').locator('[role="button"]')

    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')
    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('codef-scope-hint')).toBeVisible()

    await pressable.press('Space')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')
    await pressable.press('Space')
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('codef-scope-hint')).toBeVisible()
  })

  test('R1-1(#950) — 전체 저장 후 해제→개별 선택 시 가져오기 잠금 사유가 화면에 남고 aria-describedby 는 실재 id만 가리킨다', async ({ page }) => {
    // 개발책임자 R1 브리핑 재현 그대로: ①'범위: 전체' 칩 선택 → ②저장 → ③칩을 다시 눌러
    // 해제 → ④계좌 목록에서 1건 체크.
    await gotoMock(page, '/accounting/bank-transactions?mockRole=ACCOUNTANT', 'codef-import-type')
    const pressable = page.getByTestId('codef-all-scope-chip').locator('[role="button"]')

    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible()

    await pressable.click()
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')

    const firstAccountCheckbox = page.getByTestId('codef-bank-account-0')
    await firstAccountCheckbox.waitFor({ state: 'visible' })
    await firstAccountCheckbox.check()
    await expect(firstAccountCheckbox).toBeChecked()

    const importButton = page.getByTestId('codef-import-button')
    await expect(importButton).toBeDisabled()
    const describedBy = await importButton.getAttribute('aria-describedby')
    expect(describedBy, 'R1-1 문제2 — 가져오기 버튼에 aria-describedby 가 아예 없음').toBeTruthy()
    for (const id of (describedBy ?? '').split(' ').filter(Boolean)) {
      const target = page.locator(`#${id}`)
      expect(await target.count(), `R1-1 문제2 — aria-describedby 대상 id가 DOM에 없음: ${id}`).toBeGreaterThan(0)
    }
    await expect(
      page.getByText('저장된 전체 범위의 유형을 바꾸려면 먼저 저장하세요.'),
      'R1-1 문제1 — 가져오기가 잠긴 이유가 화면 어디에도 보이지 않음',
    ).toBeVisible()
  })

  test('일마감 전체 범위 칩은 Enter와 Space로 켜고 끄는 왕복 조작이 된다', async ({ page }) => {
    await gotoMock(page, '/accounting/daily-closings?mockRole=MANAGER', 'daily-closing-page')
    const pressable = page.getByTestId('daily-closing-all-chip').locator('[role="button"]')

    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')
    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('daily-closing-scope-hint')).toBeVisible()

    await pressable.press('Space')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')
    await pressable.press('Space')
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('daily-closing-scope-hint')).toBeVisible()
  })

  test('안전재고 전체 범위 칩은 Enter와 Space로 켜고 끄는 왕복 조작이 된다', async ({ page }) => {
    await gotoMock(page, '/inventory/safety-stock-alerts?mockRole=MANAGER', 'safety-stock-alerts-page')
    const pressable = page.getByTestId('safety-stock-all-chip').locator('[role="button"]')

    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')
    await pressable.press('Enter')
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()

    await pressable.press('Space')
    await expect(pressable).toHaveAttribute('aria-pressed', 'true')
    await pressable.press('Space')
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()
  })

  test('CODEF 안내는 전체와 개별 항목 경로를 함께 명시한다', async ({ page }) => {
    await gotoMock(page, '/accounting/bank-transactions?mockRole=ACCOUNTANT', 'codef-scope-hint')
    await expect(page.getByTestId('codef-scope-hint')).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\. 특정 항목만 처리하려면 계좌·카드·대출 항목을 선택하세요\./)
  })

  test('일마감 안내는 전체와 거래처 경로를 함께 명시한다', async ({ page }) => {
    await gotoMock(page, '/accounting/daily-closings?mockRole=MANAGER', 'daily-closing-page')
    await expect(page.getByTestId('daily-closing-scope-hint')).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\. 특정 거래처만 처리하려면 거래처를 선택하세요\./)
  })

  test('안전재고 안내는 전체와 창고 경로를 함께 명시한다', async ({ page }) => {
    await gotoMock(page, '/inventory/safety-stock-alerts?mockRole=MANAGER', 'safety-stock-alerts-page')
    await expect(page.getByTestId('safety-stock-scope-hint')).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\. 특정 창고만 처리하려면 창고를 선택하세요\./)
  })
})
