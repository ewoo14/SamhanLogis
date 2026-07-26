import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

async function installAuth(page: import('@playwright/test').Page): Promise<void> {
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

test('LUNA B-1 — DETAIL screen/print style parity at mobile and desktop', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await installAuth(page)
    await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
    const preview = page.getByTestId('document-template-live-preview')
    await page.getByRole('button', { name: '품목행 추가' }).click()
    await page.locator('fieldset').filter({ hasText: '스타일' }).locator('input[type="number"]').fill('20')
    const measure = () => preview.locator('[data-template-detail]').evaluate((node) => {
      const table = node.querySelector('table')!
      const cell = node.querySelector('td')!
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(table)
      return { fontSize: style.fontSize, padding: getComputedStyle(cell).padding, height: rect.height }
    })
    const screen = await measure()
    await page.emulateMedia({ media: 'print' })
    const print = await measure()
    console.log(`LUNA B-1 width=${width} screen=${JSON.stringify(screen)} print=${JSON.stringify(print)}`)
    expect(Math.abs(parseFloat(screen.fontSize) - parseFloat(print.fontSize)), `DETAIL font drift at ${width}px`).toBeLessThan(1)
    expect(Math.abs(parseFloat(screen.padding) - parseFloat(print.padding)), `DETAIL padding drift at ${width}px`).toBeLessThan(0.1)
    await page.emulateMedia({ media: 'screen' })
  }
})

/**
 * R7 REVERT (2026-07-23 개발책임자 결정) — 구 LUNA B-2 는 폐기한다.
 *
 * 구 B-2 는 `emulateMedia({media:'print'})` + 좁은 편집기 뷰포트(375px) 조합을 "print" 측정으로
 * 취급했는데, 이 조합은 실사용자 경로가 아니다 — 실제 인쇄/PDF는 `.document-template-preview .paper`
 * 가 `@media print`에서 `width:210mm`(≈794px, A4 용지 상자)로 고정되므로 항상 그 폭에서 레이아웃되고,
 * `page.pdf()` 마커 실험으로 `@media print and (max-width:639px)` 가 죽은 규칙임이 확증됐다
 * (base와 +narrow639 산출물이 바이트까지 동일). 구 B-2 는 375px·1280px 딱 두 폭만 스윕했는데
 * 그 두 폭이 정확히 "겹침 없음" 구간이라 HIGH 결함(전 폭 스윕 시 최대 +156px 헤더 넘침)을 통과시켰다.
 *
 * 이 fix 는 H8 pin(31.5mm/50mm 고정 height)을 제거해 `.print-approval-doc-header`가 다시
 * 전역 규칙(`min-height:28mm`, 실 결재문서와 동일 선택자)만 따르는 자연 flow 로 복귀시킨다.
 * 자연 flow 에서는 박스 높이가 항상 내용에 맞춰지므로 넘침/겹침이 구조적으로 불가능해야 한다 —
 * 아래는 그 주장을 12개 폭(H17: 320·360·375·639·640·1100·1140·1152·1180·1280·1440·1600) ×
 * 화면/인쇄(H16: 인쇄는 실제 인쇄 폭인 A4 고정폭에서 측정) 로 실측 확인한다.
 */
test('R7 REVERT — HEADER 은 12폭 스윕(H17)에서 넘침·겹침이 없고, 인쇄는 항상 A4 고정폭(H16)이며, 자연 높이가 28mm 로 복귀했다', async ({ page }) => {
  await installAuth(page)
  const WIDTHS = [320, 360, 375, 639, 640, 1100, 1140, 1152, 1180, 1280, 1440, 1600]
  const MM_PX = 96 / 25.4 // CSS 절대단위 mm→px 환산(브라우저 고정 상수, 96dpi 기준)
  const A4_WIDTH_PX = 210 * MM_PX

  interface Measure {
    headerHeight: number
    headerOverflowPx: number
    dividerOverlapPx: number | null
    bodyOverlapPx: number | null
    minHeightPx: number
    paperWidth: number | null
  }

  const measure = (): Promise<Measure> => page.getByTestId('document-template-live-preview').evaluate((root) => {
    const header = root.querySelector<HTMLElement>('.print-approval-doc-header')!
    const headline = root.querySelector<HTMLElement>('.print-approval-doc-headline')
    const grid = root.querySelector<HTMLElement>('.print-approval-section')
    const divider = root.querySelector<HTMLElement>('.print-approval-divider')
    const body = root.querySelector<HTMLElement>('.print-approval-body')
    const paper = root.querySelector<HTMLElement>('.paper')
    const headerBox = header.getBoundingClientRect()
    const bottoms = [headline, grid]
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => el.getBoundingClientRect().bottom)
    const headerContentBottom = bottoms.length > 0 ? Math.max(...bottoms) : headerBox.bottom
    return {
      headerHeight: headerBox.height,
      headerOverflowPx: headerContentBottom - headerBox.bottom,
      dividerOverlapPx: divider ? headerContentBottom - divider.getBoundingClientRect().top : null,
      bodyOverlapPx: body ? headerContentBottom - body.getBoundingClientRect().top : null,
      minHeightPx: parseFloat(getComputedStyle(header).minHeight),
      paperWidth: paper ? paper.getBoundingClientRect().width : null,
    }
  })

  const rows: Array<{ width: number; screen: Measure; print: Measure }> = []

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1400 })
    await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
    await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })

    const screen = await measure()
    await page.emulateMedia({ media: 'print' })
    const print = await measure()
    await page.emulateMedia({ media: 'screen' })
    rows.push({ width, screen, print })
    console.log(`R7 width=${width} screen=${JSON.stringify(screen)} print=${JSON.stringify(print)}`)

    for (const [label, m] of [['screen', screen], ['print', print]] as const) {
      expect(m.headerOverflowPx, `헤더 넘침 width=${width} ${label}`).toBeLessThan(0.5)
      if (m.dividerOverlapPx !== null) {
        expect(m.dividerOverlapPx, `구분선 겹침 width=${width} ${label}`).toBeLessThan(0.5)
      }
      if (m.bodyOverlapPx !== null) {
        expect(m.bodyOverlapPx, `본문 겹침 width=${width} ${label}`).toBeLessThan(0.5)
      }
      // H16: 죽은 width-gated print 규칙이 재도입되면 A4 고정폭이 흔들린다 — 편집기 on-screen 폭과
      // 무관하게 print media 에서는 항상 210mm(A4 용지 상자) 이어야 실인쇄 경로와 일치한다.
      if (label === 'print') {
        expect(m.paperWidth, `print paper width null at ${width}px`).not.toBeNull()
        expect(Math.abs((m.paperWidth as number) - A4_WIDTH_PX), `print paper width != 210mm at ${width}px`).toBeLessThan(2)
      }
    }

    // 편집기 미리보기 헤더는 이제 실 결재문서와 같은 전역 규칙(min-height:28mm)만 따른다 —
    // 12폭 전부에서 editor-only 오버라이드가 남아있지 않음을 computed style 로 재확인한다.
    expect(Math.abs(screen.minHeightPx - 28 * MM_PX), `screen min-height != 28mm at ${width}px`).toBeLessThan(0.5)
    expect(Math.abs(print.minHeightPx - 28 * MM_PX), `print min-height != 28mm at ${width}px`).toBeLessThan(0.5)
  }

  // 1600px(줄바꿈 없이 한 줄로 들어가는 가장 넓은 스윕 폭)에서는 자연 높이가 28mm 플로어에 근접해야
  // 한다 — "편집기 미리보기 헤더 높이 == 실 결재문서 헤더 높이(28mm)" 주장의 가장 가까운 실측 근사.
  const wide = rows.find((r) => r.width === 1600)!
  expect(Math.abs(wide.screen.headerHeight - 28 * MM_PX), '1600px 자연 헤더 높이 != 28mm').toBeLessThan(5)
})

test('LUNA B-4 — IMAGE inspector does not expose non-rendering text controls', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '이미지/로고 추가' }).click()
  const inspector = page.getByRole('region', { name: '속성 패널' })
  await expect(inspector.getByText('글꼴 크기')).toHaveCount(0)
  await expect(inspector.getByText('굵게')).toHaveCount(0)
  await expect(inspector.getByText('정렬')).toHaveCount(0)
  await expect(inspector.getByText('테두리')).toBeVisible()
})
