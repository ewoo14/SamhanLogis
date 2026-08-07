import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #868 DS-3b 점증분 — **레이아웃 개선 + 모바일 대응** 라이브 GUI QA (PM 직접 수행)
 *
 * SOL 검증품질 #1: 마지막 라이브QA 는 `535f96440` 기준이고 점증 커밋
 * (fc9230f46 · e67cfc878 · 304977f1f · 0f575df27) 은 그 이후라 새 모바일 스택과
 * 카드 목록이 실서버에서 검증된 적이 없다. 그 공백을 닫는다.
 *
 * mock 스위트(ac-868-*)는 동일 출처 + 목 데이터라 실 API·실 렌더 조건을 대신하지 못한다.
 * 여기서는 실 게이트웨이(:8080) + 실 렌더러로 각 브레이크포인트를 지난다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5190'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '868-ds3b-layout-mobile-live-qa-2026-07-23'))

/** 브레이크포인트 경계는 양쪽을 본다 — 한쪽만 보면 경계가 밀려도 통과한다. */
const VIEWPORTS = [
  { w: 1440, h: 900, label: '데스크톱-1440' },
  { w: 1100, h: 900, label: '경계상-1100' },
  { w: 1099, h: 900, label: '경계하-1099' },
  { w: 700, h: 900, label: '경계상-700' },
  { w: 699, h: 900, label: '경계하-699' },
  { w: 640, h: 900, label: '경계상-640' },
  { w: 639, h: 900, label: '경계하-639' },
  { w: 375, h: 812, label: '모바일-375' },
  { w: 320, h: 640, label: '최소폭-320' },
]

/** 실제 렌더 glyph rect를 세어 CSS/폰트 변화가 반영된 줄 수를 반환한다. */
async function renderedLineCount(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size
  })
}

async function authenticate(page: Page) {
  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })
}

test.describe('DS-3b 점증분 — 레이아웃·모바일 (실서버)', () => {
  test.beforeAll(() => { mkdirSync(SHOT_DIR, { recursive: true }) })

  for (const vp of VIEWPORTS) {
    test(`${vp.label} — 목록·편집기가 뷰포트 안에 들어오고 실제로 조작된다`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await authenticate(page)

      // ── 목록 ──────────────────────────────────────────────────────
      await page.goto(`${BASE_URL}/#/groupware/document-templates`)
      await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
      await page.waitForTimeout(800)
      await page.screenshot({ path: join(SHOT_DIR, `${vp.label}-01-목록.png`), fullPage: true })

      // 🚨 수평 오버플로: 페이지 본문이 뷰포트를 넘으면 사용자는 잘린 화면을 본다
      const listOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(listOverflow.scrollWidth,
        `목록이 수평으로 넘친다 (scroll ${listOverflow.scrollWidth} > client ${listOverflow.clientWidth})`)
        .toBeLessThanOrEqual(listOverflow.clientWidth + 1)

      // ── 편집기 진입 ────────────────────────────────────────────────
      // 기존 L1~L6 하네스와 같은 경로 — 신규 양식 진입 (실 데이터 의존 없음)
      await page.getByRole('button', { name: '신규 문서 양식' }).click()
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
      const preview = page.getByTestId('document-template-live-preview')
      await expect(preview).toBeVisible()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: join(SHOT_DIR, `${vp.label}-02-편집기.png`), fullPage: true })

      if (vp.w <= 639) {
        const title = preview.locator('.print-approval-doc-meta h1')
        const docNoLabel = preview.locator('.print-approval-doc-meta div').filter({ hasText: '문서번호' }).locator('span')
        const mobileHeader = await preview.locator('.print-approval-doc-header').evaluate((node) => ({
          flexDirection: getComputedStyle(node).flexDirection,
          titleLines: (() => {
            const titleNode = node.querySelector('.print-approval-doc-meta h1')
            if (!titleNode) return 0
            const range = document.createRange()
            range.selectNodeContents(titleNode)
            return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size
          })(),
        }))
        expect(mobileHeader.flexDirection, `${vp.w}px 모바일 헤더는 세로 적층이어야 한다`).toBe('column')
        expect(await renderedLineCount(title), `${vp.w}px 제목이 문자 단위로 쪼개지면 안 된다`).toBeLessThanOrEqual(2)
        expect(await renderedLineCount(docNoLabel), `${vp.w}px 문서번호 라벨이 한 줄이어야 한다`).toBe(1)
        expect(mobileHeader.titleLines, `${vp.w}px 제목 실제 glyph 줄 수가 과도하다`).toBeLessThanOrEqual(2)
      }

      const editOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(editOverflow.scrollWidth,
        `편집기가 수평으로 넘친다 (scroll ${editOverflow.scrollWidth} > client ${editOverflow.clientWidth})`)
        .toBeLessThanOrEqual(editOverflow.clientWidth + 1)

      // 🚨 실제 조작 가능성 — 프로그램 스크롤이 아니라 사용자 휠로 도달하고
      //    그 좌표의 hit target 이 정말 그 요소여야 한다(가려짐 차단).
      const palette = page.getByRole('button', { name: '문구 추가' })
      expect(await palette.count(), '요소 팔레트의 「문구 추가」 버튼이 없다').toBeGreaterThan(0)

      // 사용자 휠로만 이동한다(scrollIntoViewIfNeeded 금지 — 사용자가 못 하는 이동을
      // 테스트가 대신 해주면 false-green 이 된다). 이미 보이면 스크롤하지 않는다.
      for (let i = 0; i < 8; i++) {
        const b = await palette.boundingBox()
        if (b && b.y >= 0 && b.y + b.height <= vp.h) break
        await page.mouse.wheel(0, b && b.y < 0 ? -200 : 200)
        await page.waitForTimeout(250)
      }
      const box = await palette.boundingBox()
      console.log(`[${vp.label}] 팔레트 box = ${JSON.stringify(box)} / viewport ${vp.w}x${vp.h}`)
      expect(box, '팔레트 버튼의 bounding box 를 얻지 못했다').toBeTruthy()
      const cx = box!.x + box!.width / 2
      const cy = box!.y + box!.height / 2
      expect(cx, `팔레트가 수평으로 화면 밖이다 (x=${cx})`).toBeGreaterThanOrEqual(0)
      expect(cx, `팔레트가 수평으로 화면 밖이다 (x=${cx} > ${vp.w})`).toBeLessThanOrEqual(vp.w)
      expect(cy, `사용자 휠로 팔레트를 화면 안에 들일 수 없다 (y=${cy})`).toBeGreaterThanOrEqual(0)
      expect(cy, `사용자 휠로 팔레트를 화면 안에 들일 수 없다 (y=${cy} > ${vp.h})`).toBeLessThanOrEqual(vp.h)

      const hit = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        return { found: !!el, tag: el?.tagName ?? null, inside: !!el?.closest('button') }
      }, { x: cx, y: cy })
      expect(hit.found, '팔레트 버튼 좌표에 hit target 이 없다').toBeTruthy()
      expect(hit.inside, `팔레트 버튼이 다른 요소에 가려져 있다 (hit=${hit.tag})`).toBeTruthy()
      const elementsBeforeClick = await page.locator('[data-testid^="template-element-"]').count()
      await palette.click()
      await expect(page.locator('[data-testid^="template-element-"]')).toHaveCount(elementsBeforeClick + 1)
      await page.screenshot({ path: join(SHOT_DIR, `${vp.label}-03-편집기-조작확인.png`), fullPage: true })
    })
  }
})
