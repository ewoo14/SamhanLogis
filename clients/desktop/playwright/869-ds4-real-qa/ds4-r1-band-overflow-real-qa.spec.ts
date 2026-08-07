import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #869 DS-4 — R1 라이브 실측 QA (SONNET5 라운드 fix, 2026-07-23 H6′ 개정)
 *
 * 🚨 2026-07-23 개발책임자 결정으로 H6(잘라내기/고정 밴드) → **H6′(가변 밴드)** 로 대체됐다:
 * "저런 경우에는 가변설정도 넣어줘야지. 데이터에 맞게 다른 레이아웃이 자동으로 조정되도록 말야."
 * 잘라내기(overflow:hidden)·스크롤·"넘치면 경고"로 해결 금지 — 밴드가 내용에 맞춰 자라고 뒤 flow 가
 * 자동으로 밀려야 한다. 단, **H2(원점 불변)와 동시에** 성립해야 한다 — 밴드를 그냥 내용에 맞춰 늘리면
 * % 좌표의 기준(밴드 높이)이 내용에 따라 변해 원점이 흔들린다(라운드 2 회귀 재발).
 *
 * 이 스펙은 "짧은 문구일 때의 좌표 원점"과 "긴 문구로 밴드가 자란 뒤의 좌표 원점"을 **직접 비교**해
 * 원점이 흔들리지 않았음을 증명하고, 동시에 밴드/BODY 의 실측 높이가 실제로 늘었음을(자동 조정)
 * 증명한다.
 *
 * 기존 `ds4-body-layer-regression-real-qa.spec.ts` 가 재지 못하는 것을 잰다 — 그 스펙은 geometry 를
 * x10/y10/w30/h50 으로 고정하고 문구는 기본값 한 줄이라 요소 바닥이 ruler(24mm=91px) 안에 들어간다
 * — 즉 **겹칠 수 없는 입력**이고 `elementOverflowsLayerPx <= 0` 은 fix 와 무관하게 항상 참이다.
 * 또 BODY 의 legacy 3요소를 전부 지워서 레이어가 BODY 의 유일한 자식이 되므로 "밴드가 flow 중간에
 * 있을 때 뒤 legacy 섹션을 올바르게 밀어내는가" 를 구조적으로 지나지 않는다.
 *
 * 이 스펙은 반대로 간다(개발책임자 지시 — 겹칠 수 있는 입력을 약화시키지 말 것):
 *   ① legacy 요소를 **지우지 않고** 유지한다(실제 양식에 가까운 구성)
 *   ② 좌표 TEXT 를 **앞으로 이동**시켜 밴드를 flow 중간에 둔다
 *   ③ 문구를 여러 줄로 채워 요소가 24mm ruler 를 **실제로 넘게** 한다
 *   ④ "짧은 문구"(넘치기 전) 상태를 먼저 실측해 기준선(H1 그대로·원점)을 잡고,
 *      "긴 문구"(넘친 뒤) 상태와 비교해 H2(원점 불변)·H6′(자동 성장) 를 **동시에** 검증한다
 *   ⑤ 화면과 인쇄 미디어 양쪽에서 잰다
 *
 * 불변식:
 *   H6′ 좌표 요소의 내용이 예약 밴드를 넘으면 밴드가 내용에 맞게 자라고 뒤 flow 가 밀린다(잘라내기 금지)
 *   H2  좌표 원점은 밴드가 자라도(내용 길이와 무관하게) 흔들리지 않는다
 *   H1  넘치지 않는 한 밴드는 정확히 24mm(그 이상도 이하도 아님)
 *   H4  요소 수·상태와 무관하게 밴드당 하나의 예약만 존재한다(spacer 도 하나)
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다(그리고 real-qa 는 CI 미실행 — 이 사실 자체가
 * 이 라운드의 검증품질 발견이다).
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '908-r1-band-overflow-2026-07-23'))

/** 24mm @96dpi = 90.71px — ruler(좌표 원점의 기준)의 고정 높이. H2 의 "항상 같은 자". */
const RULER_PX = 90.71

test.use({ viewport: { width: 1600, height: 1100 } })

test('R1 — 좌표 요소가 24mm 밴드를 넘치면 밴드가 자라 뒤 내용을 밀어낸다 (H6′+H2, 실서버 편집기·화면/인쇄)', async ({ page }) => {
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
   * 좌표 밴드(ruler+spacer)와 그 자식, 그리고 밴드 "뒤에 오는 실제 형제들" 의 겹침을 잰다.
   *
   * `elRect.top - layerRect.top`(elementTopInLayer)은 뷰포트 스크롤과 무관한 상대값이라, fill()이
   * 스크롤을 바꿔도(다른 회귀 스펙의 주석 참고) 짧은/긴 문구 두 실측을 안전하게 비교할 수 있다.
   */
  const measure = async () => preview.evaluate((root) => {
    const layer = root.querySelector('[data-testid="document-template-v2-elements-body"]')
    if (!layer) return { error: '좌표 밴드가 렌더되지 않았다' }
    const el = layer.querySelector('[data-template-element]')
    if (!el) return { error: '좌표 요소가 렌더되지 않았다' }
    const layerRect = layer.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    // SONNET5 라운드 fix — `[data-testid$="-overflow-spacer"]`는 화면용(`…-overflow-spacer`)과
    // 인쇄용(`…-print-overflow-spacer`) 두 testid 모두와 매칭된다(둘 다 그 접미사로 끝난다).
    // querySelector(단수)는 DOM 순서상 항상 먼저 오는 화면 spacer를 집는다 — print 미디어에서는
    // 그 화면 spacer가 `@media print{display:none}`로 숨겨져 getBoundingClientRect()가 0을 반환해,
    // 실제로는 표시 중인 인쇄 spacer가 있어도 "spacer 없음"으로 잘못 관측된다. 현재 미디어에서
    // 실제로 표시되는(computed display !== 'none') 쪽을 고른다.
    const spacerCandidates = Array.from(layer.querySelectorAll<HTMLElement>('[data-testid$="-overflow-spacer"]'))
    const spacer = spacerCandidates.find((node) => getComputedStyle(node).display !== 'none') ?? null
    const spacerRect = spacer?.getBoundingClientRect()
    const body = layer.closest('.approval-doc-print-content')
    const bodyRect = body?.getBoundingClientRect()

    // 밴드 뒤에 오는 BODY 내부 형제(legacy 섹션 등) — 밴드가 자란 만큼 밀려났어야 한다.
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
      /** 초과분을 예약하는 spacer 실측(0 = spacer 미렌더 = 넘치지 않음). */
      spacerHeight: round2(spacerRect?.height ?? 0),
      elementHeight: round2(elRect.height),
      /** H2 — 밴드가 얼마나 자라든 이 값은 고정이어야 한다(ruler 는 항상 24mm). */
      elementTopInLayer: round2(elRect.top - layerRect.top),
      /** 🚨 H6′ 핵심 — 요소가 밴드(ruler+spacer 로 자란 실제 예약 공간) 아래로 넘친 양. 0 이하 = 잘리지
       * 않고 밴드가 자라 전부 담겼다는 뜻. */
      elementOverflowsLayerPx: round2(elRect.bottom - layerRect.bottom),
      bodyHeight: round2(bodyRect?.height ?? 0),
      inBodyAfter,
      maxInBodyOverlapY: inBodyAfter.reduce((m, s) => Math.max(m, s.overlapY), 0),
      dividerOverlapY: Math.max(0, round2(elRect.bottom - (dividerRect?.top ?? elRect.bottom))),
      closingOverlapY: Math.max(0, round2(elRect.bottom - (closingRect?.top ?? elRect.bottom))),
      /** 밴드 바로 뒤 형제의 상단을 찍었을 때 좌표 TEXT 가 잡히면 아직 덮고 있다는 뜻. */
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

  await test.step('좌표 TEXT 를 추가하고 x10/y10/w60/h50 을 준다(아직 기본 짧은 문구)', async () => {
    await page.getByRole('button', { name: '문구 추가' }).click()
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
    await shot('R1-01-좌표TEXT-짧은문구')
  })

  await test.step('🚨 밴드를 flow 중간으로 — 좌표 TEXT 를 legacy 섹션 앞으로 이동', async () => {
    const moveUp = page.getByRole('button', { name: /문구 요소 key: .+ 앞으로 이동/ })
    await expect(moveUp, '앞으로 이동 버튼을 찾지 못했다').toBeVisible()
    await moveUp.click()
    await moveUp.click()
    await page.waitForTimeout(300)
    await shot('R1-02-밴드-flow중간')
  })

  let shortM: Record<string, number | string | null | unknown[]>
  await test.step('짧은 문구 기준선 실측 — H1 그대로(정확히 24mm), 아직 넘치지 않는다', async () => {
    const result = await measure()
    expect((result as { error?: string }).error, String((result as { error?: string }).error)).toBeUndefined()
    shortM = result as Record<string, number | string | null | unknown[]>
    console.log(`■ [short] ${JSON.stringify(shortM)}`)
    expect(shortM['layerHeight'] as number, 'H1 위반 — 짧은 문구인데도 밴드가 24mm 가 아니다').toBeCloseTo(RULER_PX, 0)
    expect(shortM['spacerHeight'] as number, '짧은 문구인데 spacer 가 이미 생겼다(과잉 예약 — H1 위반)').toBe(0)
    expect(shortM['elementOverflowsLayerPx'] as number, '짧은 문구인데 이미 넘친다 — 시나리오 전제가 깨졌다').toBeLessThanOrEqual(0)
  })

  await test.step('문구를 8행으로 늘려 ruler(24mm)를 실제로 넘긴다', async () => {
    await page.getByRole('textbox', { name: '문구' }).fill(
      Array.from({ length: 8 }, (_, i) => `본 결재문서에 대한 부가 설명 문구 ${i + 1} 행입니다.`).join('\n'),
    )
    await page.waitForTimeout(300)
    await shot('R1-03-좌표TEXT-긴문구')
  })

  for (const media of ['screen', 'print'] as const) {
    await test.step(`🔴 ${media} 미디어 실측 — H6′(가변 밴드 자동 성장) + H2(원점 불변) 동시 단언`, async () => {
      if (media === 'print') {
        await page.emulateMedia({ media: 'print' })
        await expect(preview.locator('.paper')).toBeVisible()
      }
      const result = await measure()
      expect((result as { error?: string }).error, String((result as { error?: string }).error)).toBeUndefined()
      const longM = result as Record<string, number | string | null | unknown[]>
      console.log(`■ [${media}] ${JSON.stringify(longM)}`)
      await shot(`R1-04-${media}-긴문구실측`)

      const s = shortM
      const m = longM

      // H6′ ① — 밴드가 실제로 자랐다(잘라내기 아닌 자동 조정임을 증명).
      expect(
        m['layerHeight'] as number,
        `H6′ 위반 — 문구가 늘었는데 밴드가 자라지 않았다(${s['layerHeight']}px → ${m['layerHeight']}px)`,
      ).toBeGreaterThan((s['layerHeight'] as number) + 20)
      expect(m['spacerHeight'] as number, 'H6′ 위반 — 초과분을 예약하는 spacer 가 없다(자동 성장 미증명)').toBeGreaterThan(0)
      // BODY 전체도 함께 자라 뒤 flow 가 밀렸다(자동 조정이 실제로 화면에 반영됐다는 증거).
      expect(
        m['bodyHeight'] as number,
        `H6′ 위반 — BODY 전체 높이가 밴드 성장만큼 함께 늘지 않았다(${s['bodyHeight']}px → ${m['bodyHeight']}px)`,
      ).toBeGreaterThan((s['bodyHeight'] as number) + 20)

      // H6′ ② — 그런데도 요소는 (자란) 밴드를 넘지 않는다 — 잘리지 않고 전부 담겼다.
      expect(
        m['elementOverflowsLayerPx'] as number,
        `H6′ 위반 — 좌표 요소가 자란 밴드를 ${m['elementOverflowsLayerPx']}px 넘쳤다(잘라내지도 못 담지도 않음)`,
      ).toBeLessThanOrEqual(0)

      // H2 — 원점(top)은 밴드가 자라도 흔들리지 않는다. 짧은 문구 때와 같은 좌표를 가리켜야 한다.
      expect(
        Math.abs((m['elementTopInLayer'] as number) - (s['elementTopInLayer'] as number)),
        `H2 위반 — 밴드가 자라며 좌표 원점이 ${s['elementTopInLayer']}px → ${m['elementTopInLayer']}px 로 이동했다`,
      ).toBeLessThan(1)

      // 뒤 내용을 덮지 않는다(밴드가 자라 그만큼 밀어냈으므로) — 화면·인쇄 양쪽.
      expect(
        m['maxInBodyOverlapY'] as number,
        `H6′ 위반 — 좌표 요소가 BODY 안쪽 뒤 형제를 ${m['maxInBodyOverlapY']}px 덮는다: ${JSON.stringify(m['inBodyAfter'])}`,
      ).toBe(0)
      expect(
        m['hitAtFirstAfterTop'] as string | null,
        `H6′ 위반 — 밴드 뒤 형제 상단의 hit target 이 좌표 TEXT(${m['hitAtFirstAfterTop']})다`,
      ).toBeNull()
      expect(m['dividerOverlapY'] as number, `H6′ 위반 — 구분선을 ${m['dividerOverlapY']}px 덮는다`).toBe(0)
      expect(m['closingOverlapY'] as number, `H6′ 위반 — 맺음말을 ${m['closingOverlapY']}px 덮는다`).toBe(0)
    })
  }

  await page.emulateMedia({ media: 'screen' })
})
