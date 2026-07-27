import { expect, test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  process.cwd(),
  '../../docs/qa/29-713-journal-form-save-contract/screenshots',
))

test.describe('분개 작성 거래처 드롭다운', () => {
  test('거래처 후보 목록은 grid overflow 밖 body portal 에 뜨고 클릭 선택된다', async ({ page }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

    await page.goto('/#/accounting/journals/new?mockRole=MASTER', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByTestId('header-page-title')).toHaveText('분개 작성')

    const partnerInput = page.getByRole('combobox', { name: '라인 1 거래처' })
    await partnerInput.click()
    await partnerInput.fill('엘에이')

    const listbox = page.getByRole('listbox', { name: '라인 1 거래처 목록' })
    await expect(listbox).toBeVisible()
    await expect(listbox.getByText('엘에이시스템에어')).toBeVisible()

    const portalState = await page.evaluate(() => {
      const listboxEl = document.querySelector('[role="listbox"][aria-label="라인 1 거래처 목록"]')
      const scrollEl = document.querySelector('.journal-line-grid-scroll')
      return {
        parentIsBody: listboxEl?.parentElement === document.body,
        insideGridScroll: scrollEl?.contains(listboxEl) ?? false,
      }
    })
    expect(portalState).toEqual({ parentIsBody: true, insideGridScroll: false })

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'journal-partner-dropdown-portal.png'),
      fullPage: false,
    })

    await listbox.getByText('엘에이시스템에어').click()
    await expect(partnerInput).toHaveValue('엘에이시스템에어')
  })
})
