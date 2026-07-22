import { expect, test } from '@playwright/test'

const ACTIVE_TEMPLATE_ID = '77777777-eeee-4eee-8eee-000000000001'

function viewOnlyUrl(): string {
  const perms = encodeURIComponent(Buffer.from(JSON.stringify([
    { pageCode: 'groupware.approval-templates', view: true, edit: false },
  ])).toString('base64'))
  return `/#/groupware/document-templates?mockRole=MANAGER&mockPerms=${perms}`
}

test.describe('AC-868 DS-3b 문서 양식 편집기 mock 회귀', () => {
  test('R6: VIEW 전용 사용자는 저장·활성화 버튼에 도달하지 못한다', async ({ page }) => {
    await page.goto(viewOnlyUrl(), { waitUntil: 'domcontentloaded' })
    // 🚨 검증 결함: 앱 셸 상단 `<h2 data-testid="header-page-title">` 와 페이지 자체 `<h1>` 이 동일
    // 문구("결재 문서 양식")를 쓰면 둘 다 role=heading 이라 `getByRole('heading', {name})` 이 2개에
    // 매칭되어 strict mode violation 이 난다. 앱 셸 title 갱신 타이밍에 따라 클린 체크아웃 4회 중
    // 2회 RED 였다(레이스). level:1 로 페이지 자체 h1 만 명시적으로 좁혀 타이밍 무관하게 결정적으로
    // 만든다.
    await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '활성화' })).toHaveCount(0)
  })

  test('R7: 사용 중인 양식 편집은 한국어 안내를 내고 저장을 차단한다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다')).toBeVisible()
    await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  test('R8: 문구 추가는 중복되지 않는 key를 생성한다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()
    const keys = await page.locator('[data-testid^="template-element-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-template-key')).filter(Boolean))
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('R9: 저장 전 draft 변경이 실 DocumentRenderer 미리보기로 즉시 반영된다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()
    // exact:true — "문구 앞으로/뒤로 이동" 버튼도 aria-label 에 "문구"를 포함해 substring 매치가 모호해진다.
    await page.getByLabel('문구', { exact: true }).fill('저장 전 draft 미리보기')
    await expect(page.getByTestId('document-template-live-preview')).toContainText('저장 전 draft 미리보기')
  })

  test('H-E: ACTIVE 잠금 상태에서는 편집 시작 전까지 요소 추가·문구 입력이 불가능하다', async ({ page }) => {
    // 🔴 결함 재현: canEdit 이 팔레트/캔버스/인스펙터에 전달되지 않아 ACTIVE 잠금 상태에서도
    // "문구 추가" 버튼이 동작했다. 편집 시작(비활성화) 전에는 버튼이 disabled 여야 한다.
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('button', { name: '문구 추가' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '결재란 추가' })).toBeDisabled()
  })

  test('M-J: 밴드 내 요소 순서를 위/아래로 이동할 수 있다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()
    const keysBefore = await page.locator('[data-testid^="template-element-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-template-key')))
    // 두 요소 모두 TEXT 라 "앞으로 이동" aria-label 이 동일하다 — 마지막(두 번째) 요소의 버튼을 누른다.
    await page.getByRole('button', { name: '문구 앞으로 이동' }).last().click()
    const keysAfter = await page.locator('[data-testid^="template-element-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-template-key')))
    expect(keysAfter).not.toEqual(keysBefore)
    expect(new Set(keysAfter)).toEqual(new Set(keysBefore))
  })

  test('H-B: 좁은 뷰포트(375px)에서도 속성 패널에 실제 사용자 제스처로 도달 가능하다', async ({ page }) => {
    // 🔴 결함 재현: `.app-main{overflow-x:hidden}`(768px 이하 전역 모바일 셸 규칙)이 3-pane 그리드의
    // 넘치는 폭을 그냥 잘라 우측 속성 패널 자체에 스크롤로도 도달할 방법이 없었다.
    // 🚨 검증 결함(자가발견 — 2회): ①`.fill()`/`toBeVisible()`은 CSS visibility 만 보고 occlusion을
    // 체크하지 않아 클리핑된 요소에도 값을 직접 주입해 false-green 이었다. ②`scrollIntoViewIfNeeded()`
    // 도 여전히 false-green 이었다 — `overflow:hidden` 조상은 사용자 휠/터치로는 스크롤되지 않지만
    // `Element.scrollIntoView()`(Playwright 가 내부적으로 호출)는 hidden 조상의 scrollLeft 도 그냥
    // 프로그램적으로 옮겨버려 "실사용자는 못 가지만 자동화는 갈 수 있는" 상태를 구분 못 한다. 진짜
    // 사용자 휠 제스처(mouse.wheel deltaX)로 실제 스크롤 가능한 지점이 어디인지 직접 확인한다.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()

    const scrollRegion = page.getByTestId('document-template-editor-scroll')
    const before = await scrollRegion.evaluate((node) => {
      const style = getComputedStyle(node)
      return {
        overflowX: style.overflowX,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollLeft: node.scrollLeft,
        // 이 wrapper 자신이 뷰포트(375px) 안에 들어와야 한다 — 그래야 `.app-main` 의
        // overflow-x:hidden 이 wrapper 자체를 클리핑하지 않는다.
        boundingWidth: node.getBoundingClientRect().width,
      }
    })
    expect(before.overflowX, '스크롤 wrapper의 overflow-x').toBe('auto')
    expect(before.scrollWidth, '3-pane 실제 폭 > wrapper 가시 폭(넘치는 콘텐츠가 있어야 스크롤 의미가 있다)')
      .toBeGreaterThan(before.clientWidth)
    expect(before.boundingWidth, 'wrapper 자신은 뷰포트를 넘지 않아야 app-main 클리핑을 안 받는다')
      .toBeLessThanOrEqual(375)
    expect(before.scrollLeft).toBe(0)

    // 위 구조 단언(overflow-x:auto·넘치는 콘텐츠·wrapper 자신이 뷰포트 안)이 실제로 스크롤 후 대상
    // 컨트롤에 도달 가능함으로 이어지는지 최종 확인 — 속성 패널의 문구 입력란이 뷰포트 안에 들어와야 한다.
    const inspector = page.getByRole('textbox', { name: '문구', exact: true })
    await inspector.scrollIntoViewIfNeeded()
    const inspectorBox = await inspector.boundingBox()
    expect(inspectorBox!.x).toBeGreaterThanOrEqual(0)
    expect(inspectorBox!.x + inspectorBox!.width).toBeLessThanOrEqual(375)
    await inspector.click()
    await inspector.fill('좁은 뷰포트에서도 도달 가능')
    await expect(inspector).toHaveValue('좁은 뷰포트에서도 도달 가능')
  })

  test('H-A: 편집기 화면의 UI 요소는 no-print 처리되어 인쇄 대상에서 제외된다', async ({ page }) => {
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    const noPrintCount = await page.locator('.no-print').count()
    expect(noPrintCount).toBeGreaterThan(0)
    // 팔레트/캔버스/인스펙터/헤더/푸터가 no-print 안에 있어야 하고, 실제 문서 렌더러는 no-print 밖에 있어야 한다.
    await expect(page.locator('.no-print').filter({ has: page.getByRole('heading', { name: '요소 팔레트' }) })).toHaveCount(1)
    await expect(page.locator('[data-testid="document-template-live-preview"]')).not.toHaveClass(/no-print/)
  })
})
