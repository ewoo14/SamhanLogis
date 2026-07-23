/**
 * #869 DS-4 — R1 라이브 실측 QA (PM 직접 수행, 2026-07-23 재수렴 라운드)
 *
 * 🚨 기존 `ds4-body-layer-regression-real-qa.spec.ts` 가 재지 못하는 것을 잰다.
 * 그 스펙은 geometry 를 x10/y10/w30/h50 으로 고정하고 문구는 기본값 한 줄이라
 * 요소 바닥이 54px 로 밴드(24mm=91px) 안에 들어간다 — 즉 **겹칠 수 없는 입력**이고
 * `elementClosingOverlapY === 0` 은 fix 와 무관하게 항상 참이다.
 * 또 BODY 의 legacy 3요소를 전부 지워서 레이어가 BODY 의 유일한 자식이 되므로
 * "레이어가 flow 중간에 있을 때 뒤 legacy 섹션을 덮는가" 를 구조적으로 지나지 않는다.
 *
 * 이 스펙은 반대로 간다:
 *   ① legacy 요소를 **지우지 않고** 유지한다(실제 양식에 가까운 구성)
 *   ② 좌표 TEXT 를 **앞으로 이동**시켜 레이어를 flow 중간에 둔다
 *   ③ 문구를 여러 줄로 채워 요소가 24mm 밴드를 **실제로 넘게** 한다
 *   ④ 화면과 인쇄 미디어 양쪽에서 rect·겹침·hit-test 를 잰다
 *
 * 불변식 H6: 좌표 요소의 내용이 예약된 밴드를 넘어 뒤 내용을 덮지 않는다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다(그리고 real-qa 는 CI 미실행 — 이 사실 자체가
 * 이 라운드의 검증품질 발견이다).
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '908-r1-band-overflow-2026-07-23')

/** 24mm @96dpi = 90.71px — 레이어가 예약하는 밴드 높이. */
const BAND_PX = 90.71

test.use({ viewport: { width: 1600, height: 1100 } })

test('R1 — 좌표 요소가 24mm 밴드를 넘쳐 뒤 내용을 덮는다 (실서버 편집기·화면/인쇄)', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...v, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  const preview = page.getByTestId('document-template-live-preview')

  /**
   * 좌표 레이어와 그 자식, 그리고 레이어 "뒤에 오는 실제 형제들" 의 겹침을 잰다.
   *
   * 기존 하네스는 BODY 의 nextElementSibling(=구분선)만 봤다. 레이어가 flow 중간에 있으면
   * 덮이는 것은 BODY **안쪽** 형제(legacy 섹션)이므로 그것도 함께 재야 한다.
   */
  const measure = async () => preview.evaluate((root) => {
    const layer = root.querySelector('[data-testid="document-template-v2-elements-body"]')
    if (!layer) return { error: '좌표 레이어가 렌더되지 않았다' }
    const el = layer.querySelector('[data-template-element]')
    if (!el) return { error: '좌표 요소가 렌더되지 않았다' }
    const layerRect = layer.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const body = layer.closest('.approval-doc-print-content')
    const bodyRect = body?.getBoundingClientRect()

    // 레이어 뒤에 오는 BODY 내부 형제(legacy 섹션 등)
    const inBodyAfter: Array<{ tag: string; text: string; overlapY: number }> = []
    let sib = layer.nextElementSibling
    while (sib) {
      const r = sib.getBoundingClientRect()
      inBodyAfter.push({
        tag: sib.tagName + (sib.className ? `.${String(sib.className).split(' ')[0]}` : ''),
        text: (sib.textContent ?? '').trim().slice(0, 24),
        overlapY: Math.max(0, Math.round((elRect.bottom - r.top) * 100) / 100),
      })
      sib = sib.nextElementSibling
    }

    // BODY 바깥 — 구분선/맺음말
    const main = body?.closest('.print-approval-body')
    const divider = main?.nextElementSibling
    const dividerRect = divider?.getBoundingClientRect()
    const closing = divider?.nextElementSibling?.matches('.print-approval-closing')
      ? divider.nextElementSibling
      : null
    const closingRect = closing?.getBoundingClientRect()

    const probe = (r?: DOMRect) => (r
      ? document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(8, r.height / 2))
      : null)
    const hitFirstAfter = inBodyAfter.length > 0 && layer.nextElementSibling
      ? probe(layer.nextElementSibling.getBoundingClientRect())
      : null

    const round2 = (n: number) => Math.round(n * 100) / 100
    return {
      layerHeight: round2(layerRect.height),
      elementHeight: round2(elRect.height),
      elementTopInLayer: round2(elRect.top - layerRect.top),
      /** 🚨 핵심 — 요소가 레이어(예약 밴드) 아래로 넘친 양. 0 이하여야 한다. */
      elementOverflowsLayerPx: round2(elRect.bottom - layerRect.bottom),
      bodyHeight: round2(bodyRect?.height ?? 0),
      inBodyAfter,
      maxInBodyOverlapY: inBodyAfter.reduce((m, s) => Math.max(m, s.overlapY), 0),
      dividerOverlapY: Math.max(0, round2(elRect.bottom - (dividerRect?.top ?? elRect.bottom))),
      closingOverlapY: Math.max(0, round2(elRect.bottom - (closingRect?.top ?? elRect.bottom))),
      /** 레이어 바로 뒤 형제의 상단을 찍었을 때 좌표 TEXT 가 잡히면 덮고 있다는 뜻. */
      hitAtFirstAfterTop: hitFirstAfter?.closest('[data-template-element]')?.getAttribute('data-template-element') ?? null,
    }
  })

  // 웹(vite) 하네스는 BrowserRouter — `#/…` 해시는 무시되고 홈이 렌더된다(실측). 경로로 이동한다.
  await page.goto(`${BASE_URL}/groupware/document-templates`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: '신규 문서 양식' }).click()
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
  await expect(preview).toBeVisible()
  await shot('R1-00-초기-legacy요소-유지')

  await test.step('좌표 TEXT 를 추가하고 밴드를 넘길 수 있는 내용·좌표를 준다', async () => {
    await page.getByRole('button', { name: '문구 추가' }).click()
    await page.getByRole('textbox', { name: '문구' }).fill(
      Array.from({ length: 8 }, (_, i) => `본 결재문서에 대한 부가 설명 문구 ${i + 1} 행입니다.`).join('\n'),
    )
    for (const [label, value] of [
      ['가로 위치(x, %)', '10'],
      ['세로 위치(y, %)', '10'],
      ['가로 크기(w, %)', '60'],
      ['세로 크기(h, %)', '50'],
    ] as const) {
      await page.getByLabel(label).fill(value)
    }
    await expect(preview.locator('[data-testid="document-template-v2-elements-body"] [data-template-element]'))
      .toHaveCount(1, { timeout: 10000 })
    await shot('R1-01-좌표TEXT-추가')
  })

  await test.step('🚨 레이어를 flow 중간으로 — 좌표 TEXT 를 legacy 섹션 앞으로 이동', async () => {
    const moveUp = page.getByRole('button', { name: '문구 앞으로 이동' })
    await expect(moveUp, '앞으로 이동 버튼을 찾지 못했다').toBeVisible()
    await moveUp.click()
    await moveUp.click()
    await page.waitForTimeout(300)
    await shot('R1-02-레이어-flow중간')
  })

  let screenM: Awaited<ReturnType<typeof measure>>
  await test.step('화면 미디어 실측', async () => {
    screenM = await measure()
    console.log(`■ [screen] ${JSON.stringify(screenM)}`)
    expect((screenM as { error?: string }).error, String((screenM as { error?: string }).error)).toBeUndefined()
  })

  await test.step('🔴 인쇄 미디어 실측 — H6(밴드 containment) 단언', async () => {
    await page.emulateMedia({ media: 'print' })
    await expect(preview.locator('.paper')).toBeVisible()
    const printM = await measure()
    console.log(`■ [print ] ${JSON.stringify(printM)}`)
    await shot('R1-03-인쇄미디어')

    const m = printM as Record<string, number | string | null | unknown[]>
    console.log(`■ 예약 밴드 = ${BAND_PX}px · 레이어 실측 = ${m['layerHeight']}px · 요소 높이 = ${m['elementHeight']}px`)

    expect(
      m['elementOverflowsLayerPx'] as number,
      `H6 위반 — 좌표 요소가 예약 밴드를 ${m['elementOverflowsLayerPx']}px 넘쳤다`,
    ).toBeLessThanOrEqual(0)
    expect(
      m['maxInBodyOverlapY'] as number,
      `H6 위반 — 좌표 요소가 BODY 안쪽 뒤 형제를 ${m['maxInBodyOverlapY']}px 덮는다: ${JSON.stringify(m['inBodyAfter'])}`,
    ).toBe(0)
    expect(
      m['hitAtFirstAfterTop'] as string | null,
      `H6 위반 — 레이어 뒤 형제 상단의 hit target 이 좌표 TEXT(${m['hitAtFirstAfterTop']})다`,
    ).toBeNull()
    expect(m['dividerOverlapY'] as number, `H6 위반 — 구분선을 ${m['dividerOverlapY']}px 덮는다`).toBe(0)
    expect(m['closingOverlapY'] as number, `H6 위반 — 맺음말을 ${m['closingOverlapY']}px 덮는다`).toBe(0)
  })
})
