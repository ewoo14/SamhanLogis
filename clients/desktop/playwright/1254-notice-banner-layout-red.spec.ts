import { test, expect, type Page } from '@playwright/test'

/** PR #1254 적대검증 RED — 실제 hit-test와 print 계산 스타일을 단정한다. */
const NOTICE_CSS = `
  .stack { position: fixed; inset: 16px 0 auto; z-index: 999; display: grid; gap: 12px; pointer-events: none; }
  .notice { position: relative; width: 920px; height: 120px; margin: 0 auto; padding: 16px; pointer-events: none; background: white; border: 1px solid #999; }
  .notice > * { pointer-events: none; }
  .actions { pointer-events: none; }
  .actions > button, .actions > a { pointer-events: auto; }
  .actions { min-height: 64px; }
  .actions button { width: 160px; }
  .modal { position: relative; z-index: 1000; margin: 16px auto 0; width: 720px; height: 240px; background: #eee; }
  @media (max-width: 1100px) { .stack { inset-block-start: 340px; } }
  @media print { .no-print, [data-print-exclude] { display: none !important; } }
`

async function installFixture(page: Page): Promise<void> {
  await page.setContent(`
    <style>${NOTICE_CSS}</style>
    <div class="stack" data-testid="stack">
      <aside class="notice no-print" data-print-exclude="notice" data-testid="notice">
        <h2>보안인증서 설치</h2><p>자동 업데이트 안내</p>
        <div class="actions"><button>보안인증서 설치</button></div>
      </aside>
    </div>
    <section class="modal" data-testid="blocking-modal"><h2>긴급 업데이트</h2><button>업데이트 다시 확인</button></section>
    <main style="margin-top: 240px"><input data-testid="under-banner-input" /></main>
  `)
}

test.describe('PR #1254 notice banner adversarial RED', () => {
  test('① 빈 actions 영역의 실제 elementFromPoint가 actions가 아니어야 한다', async ({ page }) => {
    await installFixture(page)
    const result = await page.evaluate(() => {
      const actions = document.querySelector<HTMLElement>('.actions')!
      const button = actions.querySelector('button')!
      const ar = actions.getBoundingClientRect()
      const br = button.getBoundingClientRect()
      const x = Math.min(ar.right - 1, br.right + 80)
      const y = ar.top + ar.height / 2
      const hit = document.elementFromPoint(x, y)
      return { hit: hit?.className || hit?.tagName, actions: ar.toJSON(), button: br.toJSON() }
    })
    console.log(`[GREEN-①] elementFromPoint=${String(result.hit)} actions=${JSON.stringify(result.actions)}`)
    expect(result.hit, '빈 actions 행이 본문 hit 영역이면 안 됨').not.toBe('actions')
  })

  test('② blocking modal이 notice stack보다 실제 hit-test에서 위여야 한다', async ({ page }) => {
    await installFixture(page)
    const result = await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>('[data-testid="blocking-modal"]')!
      const r = modal.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30)
      return { hit: hit?.closest('[data-testid]')?.getAttribute('data-testid'), modalZ: getComputedStyle(modal).zIndex, stackZ: getComputedStyle(document.querySelector('[data-testid="stack"]')!).zIndex }
    })
    console.log(`[GREEN-②] hit=${result.hit} modal.z-index=${result.modalZ} stack.z-index=${result.stackZ}`)
    expect(Number(result.modalZ), 'blocking modal은 notice stack보다 높은 stacking level이어야 함').toBeGreaterThan(Number(result.stackZ))
  })

  test('③ print media에서 no-print 배너의 계산 display가 none이어야 한다', async ({ page }) => {
    await installFixture(page)
    await page.emulateMedia({ media: 'print' })
    const result = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector<HTMLElement>('[data-testid="notice"]')!)
      return { display: style.display, visibility: style.visibility }
    })
    console.log(`[GREEN-③] print display=${result.display} visibility=${result.visibility}`)
    expect(result.display).toBe('none')
  })
})
