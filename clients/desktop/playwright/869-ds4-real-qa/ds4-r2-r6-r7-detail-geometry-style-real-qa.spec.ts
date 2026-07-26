/**
 * #908 DS-4 — R2·R6·R7 라이브 실측 QA (SONNET5 라운드 fix, B군)
 *
 * 세 발견 모두 `DocumentRenderer.tsx`의 `detailGeometryStyle()`(DETAIL 전용) 이 원인이라 한 라운드
 * fix·한 스펙으로 함께 잰다:
 *
 *   R2(H7) — `세로 위치(y,%)`가 `margin-top:Y%`로 렌더됐다. CSS 스펙상 margin-top 의 %는 항상
 *   containing block의 **폭** 기준이라(세로 오프셋인데도) 좌표 요소(FIELD/TEXT/IMAGE, `top:Y%`,
 *   24mm **높이** 기준)와 다른 축·다른 배율을 가리켰다(실측: y=20 이 폭 555px 기준 111px로 내려감
 *   — 24mm=90.71px 기준이면 18.1px 이어야 할 값의 6.1배).
 *   fix: y/h 를 저장 스키마의 24mm 밴드 기준으로 **미리 mm 로 계산**해 넘긴다(marginTop/minHeight 모두
 *   고정 mm — CSS 퍼센트 해석 자체를 쓰지 않는다).
 *
 *   R6(H9) — `세로 크기(h,%)`가 `min-height:h%` 였는데, 부모(`.document-template-detail-layer`)의
 *   높이가 auto(내용 의존)라 CSS 스펙상 "absolutely positioned 아닌 요소의 퍼센트 높이는 0" 규칙에
 *   걸려 h 값과 무관하게 언제나 표의 natural height 그대로였다(실측: h=80 이든 아니든 렌더 높이가
 *   테이블 자체 높이와 정확히 같았다).
 *   fix: 위와 동일하게 고정 mm 값으로 미리 계산 — 퍼센트 해석이 필요 없어져 항상 적용된다. H6′ 방향대로
 *   "최소 높이"로 해석한다(내용이 더 크면 정상 flow 로 더 자란다 — 잘라내지 않는다).
 *
 *   R7(H9) — `글꼴 크기`·`정렬`이 outer div 의 inline style 로만 실렸는데,
 *   `.document-template-detail table{font-size:9pt}`·`th,td{text-align:left}` 같은 CSS 직접
 *   선택자가 상속보다 항상 이겨 무효였다(실측: fontSize=16 지정해도 computed font-size 는 언제나
 *   12px=9pt). 금액 열 우측 정렬 수단이 없었다.
 *   fix: 같은 값을 `--detail-font-size`/`--detail-text-align` CSS 변수로도 실어, stylesheet 가
 *   `var(--detail-*, 기본값)`으로 참조하게 한다(global.css) — "그 규칙 자체가 그 값을 쓴다".
 *
 * DETAIL은 FIELD/TEXT/IMAGE 와 달리 애초에 position:absolute 를 쓰지 않는 정상 flow 요소라(주석
 * 참고) R1(H6′)의 ruler/spacer 분리가 필요 없다 — 이 세 fix 만으로 밴드가 이미 "내용에 맞춰 자라고
 * 뒤 flow 가 밀린다"를 만족한다(아래 회귀 확인 단계에서 다시 잰다).
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '908-r2-r6-r7-detail-2026-07-23')

/** 24mm @96dpi = 90.71px — 좌표 요소(FIELD/TEXT/IMAGE)와 DETAIL 이 공유해야 하는 세로 기준(H7). */
const BAND_PX = 90.71

test.use({ viewport: { width: 1600, height: 1400 } })

test('R2·R6·R7 — DETAIL 의 y/h/글꼴/정렬이 좌표 요소와 같은 축을 쓰고, h 가 실제로 최소 높이가 되고, CSS 가 무효화하지 않는다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  const preview = page.getByTestId('document-template-live-preview')

  const measureDetail = async () => preview.evaluate((root) => {
    const layer = root.querySelector('[data-testid="document-template-detail-layer"]')
    const detail = root.querySelector('[data-template-detail]')
    if (!layer || !detail) return { error: 'DETAIL이 렌더되지 않았다' }
    const layerRect = layer.getBoundingClientRect()
    const detailRect = detail.getBoundingClientRect()
    const th = detail.querySelector('th')
    const td = detail.querySelector('td')
    const table = detail.querySelector('table')
    const body = layer.closest('.approval-doc-print-content')
    const bodyRect = body?.getBoundingClientRect()
    const main = body?.closest('.print-approval-body')
    const divider = main?.nextElementSibling
    const dividerRect = divider?.getBoundingClientRect()
    const closing = divider?.nextElementSibling?.matches('.print-approval-closing') ? divider.nextElementSibling : null
    const closingRect = closing?.getBoundingClientRect()
    const round2 = (n: number) => Math.round(n * 100) / 100
    return {
      /** R2(H7) — margin-top 이 실제로 렌더된 세로 오프셋(px). 24mm 기준이어야 한다. */
      marginTopPx: round2(detailRect.top - layerRect.top),
      detailHeight: round2(detailRect.height),
      bodyHeight: round2(bodyRect?.height ?? 0),
      dividerOverlapY: Math.max(0, round2(detailRect.bottom - (dividerRect?.top ?? detailRect.bottom))),
      closingOverlapY: Math.max(0, round2(detailRect.bottom - (closingRect?.top ?? detailRect.bottom))),
      thFontSizePx: th ? Number.parseFloat(getComputedStyle(th).fontSize) : null,
      tdFontSizePx: td ? Number.parseFloat(getComputedStyle(td).fontSize) : null,
      tableFontSizePx: table ? Number.parseFloat(getComputedStyle(table).fontSize) : null,
      thTextAlign: th ? getComputedStyle(th).textAlign : null,
      tdTextAlign: td ? getComputedStyle(td).textAlign : null,
    }
  })

  await page.goto(`${BASE_URL}/#/groupware/document-templates/new/edit?mockDetailRows=1`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 30000 })
  await expect(preview).toBeVisible()
  await page.getByRole('button', { name: '품목행 추가' }).click()
  await expect(preview.locator('[data-template-detail]')).toBeVisible({ timeout: 10000 })
  await shot('R267-00-품목행-기본')

  await test.step('🔴 R6(H9) — h 가 자연 높이보다 큰 최소 높이로 실제 적용된다(1행뿐이라 자연 높이는 훨씬 작다)', async () => {
    for (const [label, value] of [
      ['가로 위치(x, %)', '0'],
      ['세로 위치(y, %)', '0'],
      ['가로 크기(w, %)', '100'],
      ['세로 크기(h, %)', '90'],
    ] as const) {
      await page.getByLabel(label).fill(value)
    }
    await page.waitForTimeout(200)
    const m = await measureDetail()
    console.log(`■ [R6 h=90·1행] ${JSON.stringify(m)}`)
    const floorPx = 0.9 * BAND_PX
    expect((m as { error?: string }).error).toBeUndefined()
    expect(
      (m as { detailHeight: number }).detailHeight,
      `H9 위반 — h=90(최소 ${floorPx.toFixed(1)}px 이어야 함)인데 실제 높이가 ${(m as { detailHeight: number }).detailHeight}px 로 자연 높이(1행)에 머물러 h 가 무효하다`,
    ).toBeGreaterThanOrEqual(floorPx - 2)
    await shot('R267-01-R6-최소높이')
  })

  await test.step('🔴 R2(H7) — y 가 폭이 아니라 24mm 밴드(좌표 요소와 같은 축)를 기준으로 렌더된다', async () => {
    for (const [label, value] of [
      ['세로 위치(y, %)', '20'],
      ['세로 크기(h, %)', '10'],
    ] as const) {
      await page.getByLabel(label).fill(value)
    }
    await page.waitForTimeout(200)
    const m = await measureDetail()
    console.log(`■ [R2 y=20] ${JSON.stringify(m)}`)
    const expectedPx = 0.2 * BAND_PX // 24mm 기준이면 y=20 → 18.14px
    const wrongWidthBasisPx = 0.2 * 554.8 // 이전 버그(폭 555px 기준)였다면 110.96px 근처
    const marginTopPx = (m as { marginTopPx: number }).marginTopPx
    expect((m as { error?: string }).error).toBeUndefined()
    expect(marginTopPx, `H7 위반 — y=20 이 24mm 기준(${expectedPx.toFixed(1)}px 근처)이 아니라 폭 기준(${wrongWidthBasisPx.toFixed(1)}px 근처)으로 렌더됐다: 실측 ${marginTopPx}px`)
      .toBeLessThan(30)
    expect(marginTopPx, `H7 위반 — y=20 이 24mm 기준(${expectedPx.toFixed(1)}px)에서 너무 벗어났다: 실측 ${marginTopPx}px`)
      .toBeGreaterThan(10)
    await shot('R267-02-R2-y축')
  })

  await test.step('🔴 R7(H9) — 글꼴 크기·정렬이 CSS 직접 선택자에 덮이지 않고 th/td 실제 computed style 에 반영된다', async () => {
    await page.getByLabel('글꼴 크기').fill('16')
    await page.getByLabel('정렬').selectOption('right')
    await page.waitForTimeout(200)
    const m = await measureDetail() as Record<string, number | string | null>
    console.log(`■ [R7 fontSize16·align right] ${JSON.stringify(m)}`)
    const expectedFontPx = 16 * 96 / 72 // 16pt → 21.33px
    expect(m['thFontSizePx'], `H9 위반 — th font-size 가 style.fontSize(16pt=${expectedFontPx.toFixed(2)}px)를 반영하지 않고 CSS 직접 선택자(9pt=12px)에 덮였다`)
      .toBeCloseTo(expectedFontPx, 0)
    expect(m['tdFontSizePx'], 'H9 위반 — td font-size 가 반영되지 않았다').toBeCloseTo(expectedFontPx, 0)
    expect(m['thTextAlign'], 'H9 위반 — th 정렬이 우측 정렬을 반영하지 않았다(금액 열 우측 정렬 불가)').toBe('right')
    expect(m['tdTextAlign'], 'H9 위반 — td 정렬이 우측 정렬을 반영하지 않았다(금액 열 우측 정렬 불가)').toBe('right')
    await shot('R267-03-R7-글꼴정렬')
  })

  await test.step('회귀 확인 — 위 fix 들을 적용한 채로도 DETAIL 은 여전히 뒤 flow(구분선·맺음말)를 덮지 않는다(R3 RED 불가와 별개로 항상 성립해야 함)', async () => {
    const m = await measureDetail() as Record<string, number>
    expect(m['dividerOverlapY'], `구분선을 ${m['dividerOverlapY']}px 덮는다`).toBe(0)
    expect(m['closingOverlapY'], `맺음말을 ${m['closingOverlapY']}px 덮는다`).toBe(0)
  })
})
