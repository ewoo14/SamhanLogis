import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #908 DS-4 — R4 라이브 실측 QA (SONNET5 라운드 fix, H7)
 *
 * 회귀: HEADER 밴드 좌표 요소(IMAGE 등)의 `x/w` 퍼센트가 페이지 본문 폭(BODY 좌표 요소와 같은
 * `.approval-doc-print-content` 폭)이 아니라 `.print-approval-doc-headline`(결재란 박스 폭만큼
 * 좁아진 좌측 컬럼)을 기준으로 렌더됐다 — 같은 x=70% 입력이 밴드에 따라 다른 지점을 가리켰다(H7
 * 위반: "같은 입력칸은 요소 타입/밴드와 무관하게 같은 축·같은 기준 상자를 가리킨다").
 *
 * fix: `PrintLayout.tsx`에서 `headerExtra` 슬롯을 `.print-approval-doc-headline`(좌측 컬럼) 안에서
 * `<header>` 바깥(그러나 첫 divider 이전 — 여전히 "헤더 영역")으로 옮겼다. `.print-approval-doc`
 * (flex column, 기본 align-items:stretch)의 직계 자식이 되어 BODY 좌표 요소의 containing block인
 * `.approval-doc-print-content`와 같은 폭을 갖는다. headerExtra 가 없는 v1/레거시 문서는 이 슬롯이
 * 항상 null이라 출력이 한 글자도 바뀌지 않는다(G3 — vitest 165개 회귀로 확인).
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '908-r4-header-band-width-2026-07-23'))

test.use({ viewport: { width: 1600, height: 1100 } })

test('R4 — HEADER 밴드 좌표 요소가 BODY 와 같은(페이지 본문) 폭을 기준으로 렌더된다 (H7)', async ({ page }) => {
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
  await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 30000 })
  await expect(preview).toBeVisible()

  // 이미지/로고는 팔레트 기본값이 HEADER 밴드로 들어간다(bandKindForType) — HEADER 좌표 요소를
  // BE 저장 없이(스테일 컨테이너 회피) 클라이언트 미리보기만으로 확실히 재현하는 가장 쉬운 경로.
  await page.getByRole('button', { name: '이미지/로고 추가' }).click()
  await expect(preview.locator('[data-testid="document-template-v2-elements-header"] [data-template-image]')).toBeVisible({ timeout: 10000 })

  for (const [label, value] of [
    ['가로 위치(x, %)', '70'],
    ['세로 위치(y, %)', '0'],
    ['가로 크기(w, %)', '20'],
    ['세로 크기(h, %)', '15'],
  ] as const) {
    await page.getByLabel(label).fill(value)
  }
  await page.waitForTimeout(200)
  await shot('R4-00-헤더이미지-x70')

  const m = await preview.evaluate((root) => {
    const headerLayer = root.querySelector('[data-testid="document-template-v2-elements-header"]')
    const image = headerLayer?.querySelector('[data-template-image]')
    const bodyContent = root.querySelector('.approval-doc-print-content')
    const headline = headerLayer?.closest('.print-approval-doc-headline')
    if (!headerLayer || !image || !bodyContent) return { error: 'HEADER 좌표 요소 또는 BODY 기준 요소를 찾지 못했다' }
    const headerLayerRect = headerLayer.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    const bodyContentRect = bodyContent.getBoundingClientRect()
    const round2 = (n: number) => Math.round(n * 100) / 100
    return {
      /** 🚨 핵심 — HEADER 좌표 레이어의 실제 렌더 폭이 BODY 컨텐츠 폭과 같아야 한다(H7 동일 기준 상자). */
      headerLayerWidth: round2(headerLayerRect.width),
      bodyContentWidth: round2(bodyContentRect.width),
      /** x=70% 가 실제로 페이지 본문 폭의 70% 지점에 찍히는지(왼쪽 좁은 컬럼 폭의 70% 가 아니라). */
      imageLeftOffsetFromLayer: round2(imageRect.left - headerLayerRect.left),
      isStillInsideNarrowHeadline: headline !== null,
    }
  })
  console.log(`■ [R4] ${JSON.stringify(m)}`)

  expect((m as { error?: string }).error, String((m as { error?: string }).error)).toBeUndefined()
  const mm = m as Record<string, number | boolean>
  expect(
    mm['isStillInsideNarrowHeadline'],
    'H7 위반 — HEADER 좌표 레이어가 여전히 좌측 좁은 컬럼(.print-approval-doc-headline) 안에 있다',
  ).toBe(false)
  expect(
    Math.abs((mm['headerLayerWidth'] as number) - (mm['bodyContentWidth'] as number)),
    `H7 위반 — HEADER 좌표 레이어 폭(${mm['headerLayerWidth']}px)이 BODY 컨텐츠 폭(${mm['bodyContentWidth']}px)과 다르다(다른 기준 상자를 쓰고 있다)`,
  ).toBeLessThan(2)
  const expectedLeftPx = 0.7 * (mm['bodyContentWidth'] as number)
  expect(
    mm['imageLeftOffsetFromLayer'] as number,
    `H7 위반 — x=70%가 페이지 본문 폭 기준 70%(${expectedLeftPx.toFixed(1)}px) 지점이 아니라 ${mm['imageLeftOffsetFromLayer']}px 에 찍혔다`,
  ).toBeCloseTo(expectedLeftPx, 0)

  await test.step('회귀 확인 — 결재란 박스(우측 상단)는 여전히 정상 배치된다(헤더 구조 변경이 결재란을 깨지 않았다)', async () => {
    const grid = preview.locator('.print-approval-grid')
    await expect(grid).toBeVisible()
    await shot('R4-01-결재란-정상')
  })
})
