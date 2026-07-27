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
