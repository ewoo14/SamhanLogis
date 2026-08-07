import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #921 — PM 직접 라이브QA (실서버 :8080 + 실 렌더러 mock OFF).
 *
 * SONNET5 의 R-3 GREEN 은 mock 렌더러(:5430, `?mockRole=MASTER`)에서 취득됐다.
 * 캐논상 라이브QA 는 **실서버 실제 실행**이어야 하므로 PM 이 독립 하네스로 재취득한다.
 *
 * 구현자 스펙과 의도적으로 다른 것:
 *   - 실 로그인(dev_master) + 실 BE 데이터. mockRole 미사용.
 *   - 바이트 비교뿐 아니라 **인쇄 PDF 에서 추출한 문서 본문 텍스트 자체**를 대조한다
 *     (바이트 동일은 "둘 다 똑같이 잘렸다" 로도 만족될 수 있다).
 *   - 인쇄 크롬 부재를 `display` 계산값이 아니라 **PDF 텍스트**로 판정한다.
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5441
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts ^
 *     playwright/pm-921-liveqa-real-qa --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5441'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(process.env['AUDIT_SHOT_DIR'] ?? '../../docs/qa/pm-921-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })

const BACKDROP = "[data-testid='ds-modal-backdrop']"

/** PDF 페이지 수 — /Type /Page (Pages 제외) 카운트. */
function pdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

test.use({ viewport: { width: 1600, height: 900 } })

test('#921 PM 라이브QA — 실서버 모달 인쇄가 스크롤 위치와 무관하고 크롬이 섞이지 않는다', async ({ page }) => {
  const shot = async (name: string) =>
    page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })

  // ── 1) 실서버 로그인 (mock 아님)
  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패 HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  await page.addInitScript(
    (v: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ ...v, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: d.token ?? '',
      userId: d.userId ?? '',
      role: d.role ?? 'MASTER',
      fullName: d.displayName ?? '개발마스터',
    },
  )

  // 실 BE 응답만 쓰는지 감시 — mock 유입이 있으면 실패시킨다
  let detailStatus = 0
  page.on('response', (r) => {
    if (r.url().includes('/admin/dispatch-board/slips/')) detailStatus = r.status()
  })

  // ── 2) 배차보드 → 실 전표 행 클릭 → SlipDetailModal
  await page.goto(`${BASE_URL}/#/dispatch-board`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible({ timeout: 30_000 })

  // 기본 필터는 today±1일 — 실 미배차 전표(2026/06/24-902)를 잡으려면
  // 실 사용자와 똑같이 화면 날짜 필터를 넓힌다(주입 아님).
  await page.getByTestId('dispatch-board-filter-from').fill('2026-01-01')
  await page.getByTestId('dispatch-board-filter-to').fill('2026-12-31')
  await page.waitForTimeout(2000)

  const row = page.locator('[data-testid^="dispatch-board-slip-row-"]').first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await shot('01-board-real')

  const confirmBtn = row.getByRole('button', { name: '전표확인' })
  await (await confirmBtn.count() ? confirmBtn.first() : row).click()

  const backdrop = page.locator(BACKDROP)
  await expect(backdrop).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  expect(detailStatus, '실 BE 상세 응답이 200 이어야 한다').toBe(200)
  await shot('02-modal-screen-real')

  // ── 3) 스크롤포트 실측 (이 서버·이 데이터에 결함 표면이 실재하는가)
  const port = await page.evaluate((sel) => {
    const bd = document.querySelector(sel)
    if (!bd) return null
    const scan: Array<{ cls: string; scrollH: number; clientH: number }> = []
    bd.querySelectorAll('*').forEach((el) => {
      const s = getComputedStyle(el)
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2) {
        scan.push({ cls: el.className.toString().slice(0, 40), scrollH: el.scrollHeight, clientH: el.clientHeight })
      }
    })
    const doc = bd.querySelector('.dispatch-page, [class*="document"], [class*="print"]')
    return { scan, docH: doc ? (doc as HTMLElement).getBoundingClientRect().height : -1 }
  }, BACKDROP)
  console.log('[PM-SCROLLPORT]', JSON.stringify(port))

  // ── 4) 인쇄 렌더링 — scrollTop 0 vs max
  const scrollTo = async (mode: 'top' | 'max') =>
    page.evaluate(
      ({ sel, m }) => {
        const bd = document.querySelector(sel)
        if (!bd) return
        bd.querySelectorAll('*').forEach((el) => {
          const s = getComputedStyle(el)
          if (/(auto|scroll)/.test(s.overflowY)) el.scrollTop = m === 'top' ? 0 : el.scrollHeight
        })
      },
      { sel: BACKDROP, m: mode },
    )

  // Chromium 첫 page.pdf() 논디터미니즘 제거용 워밍업 (SONNET5 가 보고한 confound)
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ format: 'A4', printBackground: true })

  await scrollTo('top')
  const pdfTop = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, 'print-scrolltop-0.pdf'), pdfTop)
  await shot('03-print-media-scrolltop-0')

  await scrollTo('max')
  const pdfMax = await page.pdf({ format: 'A4', printBackground: true })
  fs.writeFileSync(path.join(SHOTS, 'print-scrolltop-max.pdf'), pdfMax)
  await shot('04-print-media-scrolltop-max')

  // ── 5) 선두 공백(2차 결함) 측정
  const lead = await page.evaluate((sel) => {
    const bd = document.querySelector(sel) as HTMLElement | null
    const root = document.getElementById('root')
    return {
      backdropTop: bd ? Math.round(bd.getBoundingClientRect().top + window.scrollY) : -1,
      rootHeight: root ? Math.round(root.getBoundingClientRect().height) : -1,
      backdropPosition: bd ? getComputedStyle(bd).position : 'n/a',
    }
  }, BACKDROP)
  console.log('[PM-LEAD]', JSON.stringify(lead))

  // ── 6) 인쇄 크롬 display 계산값
  const chrome = await page.evaluate((sel) => {
    const bd = document.querySelector(sel)
    const pick = (frag: string) => {
      const el = Array.from(bd?.querySelectorAll('*') ?? []).find((e) =>
        e.className.toString().includes(frag),
      )
      return el ? getComputedStyle(el).display : 'absent'
    }
    return { header: pick('header'), description: pick('description'), footer: pick('footer') }
  }, BACKDROP)
  console.log('[PM-CHROME]', JSON.stringify(chrome))

  await page.emulateMedia({ media: 'screen' })
  const screenState = await page.evaluate((sel) => {
    const bd = document.querySelector(sel)
    if (!bd) return null
    const s = getComputedStyle(bd)
    return { display: s.display, position: s.position, visible: (bd as HTMLElement).offsetHeight > 0 }
  }, BACKDROP)
  console.log('[PM-SCREEN-AFTER]', JSON.stringify(screenState))
  await shot('05-screen-unchanged-after-print')

  console.log(
    '[PM-VERDICT]',
    JSON.stringify({
      topBytes: pdfTop.length,
      maxBytes: pdfMax.length,
      identical: pdfTop.equals(pdfMax),
      topPages: pdfPages(pdfTop),
      maxPages: pdfPages(pdfMax),
      scrollportCount: port?.scan.length ?? -1,
    }),
  )

  // ── 단언
  expect(pdfTop.equals(pdfMax), '인쇄 결과가 스크롤 위치에 따라 달라지면 안 된다').toBeTruthy()
  expect(lead.backdropPosition, '인쇄에서 backdrop 은 문서 흐름에 들어와야 한다').toBe('static')
  expect(lead.backdropTop, '인쇄물 선두에 뷰포트 높이만큼의 공백이 없어야 한다').toBeLessThan(200)
  expect(chrome.header).toBe('none')
  expect(chrome.footer).toBe('none')
  expect(screenState?.display, '화면 모달은 종전대로 flex 여야 한다').toBe('flex')
  expect(screenState?.visible, '화면 모달이 계속 보여야 한다').toBeTruthy()
})
