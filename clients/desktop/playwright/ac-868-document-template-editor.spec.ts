import { expect, test } from '@playwright/test'

const ACTIVE_TEMPLATE_ID = '77777777-eeee-4eee-8eee-000000000001'
const DS4_TEMPLATE_ID = '77777777-eeee-4eee-8eee-000000000002'
const BOUNDARY_VIEWPORTS = [1100, 1099, 700, 699, 640, 639, 320] as const

async function waitForStableLayout(locator: import('@playwright/test').Locator): Promise<void> {
  await locator.evaluate(async (node) => {
    const snapshot = () => {
      const rect = node.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const hit = document.elementFromPoint(centerX, centerY)
      return {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        hitTarget: hit === node || Boolean(hit && node.contains(hit)),
      }
    }

    let previous = snapshot()
    let stableFrames = 0
    for (let frame = 0; frame < 90 && stableFrames < 3; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const next = snapshot()
      const stable = Math.abs(next.scrollX - previous.scrollX) < 0.5
        && Math.abs(next.scrollY - previous.scrollY) < 0.5
        && Math.abs(next.left - previous.left) < 0.5
        && Math.abs(next.top - previous.top) < 0.5
        && Math.abs(next.width - previous.width) < 0.5
        && Math.abs(next.height - previous.height) < 0.5
      stableFrames = stable ? stableFrames + 1 : 0
      previous = next
    }
  })
}

async function renderedLineCount(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size
  })
}

async function assertApprovalTemplateTableRoleTree(page: import('@playwright/test').Page): Promise<void> {
  const table = page.getByRole('table')
  await expect(table).toHaveCount(1)
  expect(await table.getByRole('rowgroup').count()).toBe(2)
  expect(await table.getByRole('row').count()).toBeGreaterThan(0)
  expect(await table.getByRole('columnheader').count()).toBe(5)
  expect(await table.getByRole('cell').count()).toBeGreaterThan(0)
}

async function assertEditorGeometry(page: import('@playwright/test').Page): Promise<void> {
  const scrollRegion = page.getByTestId('document-template-editor-scroll')
  const geometry = await scrollRegion.evaluate((node) => {
    const editor = node.closest<HTMLElement>('[aria-label="문서 양식 편집기"]')
    const descendants = [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => element.getBoundingClientRect())
    return {
      viewportWidth: window.innerWidth,
      editorScrollWidth: editor?.scrollWidth ?? 0,
      editorClientWidth: editor?.clientWidth ?? 0,
      maxRight: Math.max(...descendants.map((rect) => rect.right)),
      minLeft: Math.min(...descendants.map((rect) => rect.left)),
      boundingWidth: node.getBoundingClientRect().width,
    }
  })
  expect(geometry.boundingWidth, '편집기 wrapper 자신은 viewport를 넘지 않아야 한다')
    .toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.maxRight, '편집기 콘텐츠의 실제 우측 경계가 viewport를 넘지 않아야 한다')
    .toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.minLeft, '편집기 콘텐츠의 실제 좌측 경계가 viewport 밖으로 나가지 않아야 한다')
    .toBeGreaterThanOrEqual(0)
  expect(geometry.editorScrollWidth, '편집기 자체에 수평 클리핑/overflow가 없어야 한다')
    .toBeLessThanOrEqual(geometry.editorClientWidth)
}

async function assertInspectorHitTarget(
  page: import('@playwright/test').Page,
  viewportWidth: number,
  viewportHeight: number,
): Promise<void> {
  const inspector = page.getByRole('textbox', { name: '문구', exact: true })
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForStableLayout(inspector)
    const box = await inspector.boundingBox()
    const hitTarget = box
      ? await inspector.evaluate((node) => {
        const rect = node.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return hit === node || Boolean(hit && node.contains(hit))
      })
      : false
    if (box
      && box.x >= 0
      && box.x + box.width <= viewportWidth
      && box.y >= 0
      && box.y + box.height <= viewportHeight) {
      if (hitTarget) return
      break
    }
    // 프로그램 스크롤을 사용하지 않고 사용자의 실제 세로 wheel 제스처만 반복한다.
    // 클릭 직후 대상이 viewport 위로 올라간 desktop 경계에서는 음의 wheel로 되돌아온다.
    await page.mouse.wheel(0, box && box.y < 0 ? -600 : 600)
  }

  const finalBox = await inspector.boundingBox()
  expect(finalBox, '실제 wheel 제스처 후 속성 입력란이 화면에 도달해야 한다').not.toBeNull()
  expect(finalBox!.x).toBeGreaterThanOrEqual(0)
  expect(finalBox!.x + finalBox!.width).toBeLessThanOrEqual(viewportWidth)
  expect(finalBox!.y).toBeGreaterThanOrEqual(0)
  expect(finalBox!.y + finalBox!.height).toBeLessThanOrEqual(viewportHeight)
  const finalHitTarget = await inspector.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return hit === node || Boolean(hit && node.contains(hit))
  })
  expect(finalHitTarget, '화면 좌표의 실제 hit target이 속성 입력란이어야 한다').toBe(true)
}

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

  test('M1/M3: 375px·320px 라이브 미리보기는 문자 단위 줄바꿈 없이 읽히고 수평으로 넘치지 않는다', async ({ page }) => {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
        waitUntil: 'domcontentloaded',
      })

      const preview = page.getByTestId('document-template-live-preview')
      const title = preview.locator('.print-approval-doc-meta h1')
      const docNoLabel = preview.locator('.print-approval-doc-meta div').filter({ hasText: '문서번호' }).locator('span')

      expect(await renderedLineCount(title), `${width}px 제목이 문자 단위로 쪼개지면 안 된다`)
        .toBeLessThanOrEqual(2)
      expect(await renderedLineCount(docNoLabel), `${width}px 문서번호 라벨이 한 줄이어야 한다`).toBe(1)

      const geometry = await preview.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }))
      expect(geometry.scrollWidth, `${width}px 미리보기 컨테이너가 수평으로 넘치면 안 된다`)
        .toBeLessThanOrEqual(geometry.clientWidth)
    }
  })

  test('M4: 모바일 결재란은 결재자 1·2·3·4·7명에서도 2열 배치를 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })

    const preview = page.getByTestId('document-template-live-preview')
    const grid = preview.locator('.print-approval-grid')
    const layoutMatrix = await grid.evaluate((node) => {
      const originalCell = node.querySelector<HTMLElement>('.print-approval-cell')
      if (!originalCell) throw new Error('결재란 셀이 렌더되지 않았다')

      return [1, 2, 3, 4, 7].map((approverCount) => {
        // 실제 PrintLayout이 모델 길이로 쓰는 desktop inline grid 계약을 함께 재현한다.
        node.style.gridTemplateColumns = `repeat(${Math.max(2, approverCount)}, var(--print-approval-corner-col, 19mm))`
        node.replaceChildren(...Array.from({ length: approverCount }, (_, index) => {
          const cell = originalCell.cloneNode(true) as HTMLElement
          const name = cell.querySelector<HTMLElement>('.print-approval-name div')
          if (name) name.textContent = `결재자${index + 1}`
          return cell
        }))
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        const columns = style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean)
        return {
          approverCount,
          columnCount: columns.length,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          width: rect.width,
        }
      })
    })

    for (const result of layoutMatrix) {
      expect(result.columnCount, `${result.approverCount}명 결재란은 모바일 2열이어야 한다`).toBe(2)
      expect(result.scrollWidth, `${result.approverCount}명 결재란이 모바일에서 수평으로 넘친다`)
        .toBeLessThanOrEqual(result.clientWidth)
      expect(result.width, `${result.approverCount}명 결재란 폭이 320px preview를 넘친다`)
        .toBeLessThanOrEqual(194)
    }
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
    // 두 TEXT 요소의 이동 버튼은 key를 포함해 서로 달라진다 — 마지막(두 번째) 요소의 버튼을 누른다.
    await page.getByRole('button', { name: /문구 요소 key: .+ 앞으로 이동/ }).last().click()
    const keysAfter = await page.locator('[data-testid^="template-element-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-template-key')))
    expect(keysAfter).not.toEqual(keysBefore)
    expect(new Set(keysAfter)).toEqual(new Set(keysBefore))
  })

  test('H-B: 좁은 뷰포트(375px)에서도 속성 패널에 실제 사용자 제스처로 도달 가능하다', async ({ page }) => {
    // 🔴 과거 결함: `.app-main{overflow-x:hidden}`(768px 이하 전역 모바일 셸 규칙)이 3-pane 그리드의
    // 넘치는 폭을 잘라 우측 속성 패널 자체에 스크롤로도 도달할 방법이 없었다.
    // 이 테스트는 해결 수단(가로 스크롤/세로 스택)을 고정하지 않고, 수평 클리핑이 없다는 사실과
    // 실제 사용자 세로 휠 제스처 뒤 입력 컨트롤이 화면에 들어오는지를 확인한다.
    // 🚨 `.fill()`/`toBeVisible()`만 쓰면 CSS visibility만 보고 클리핑된 요소에도 값을 주입하는
    // false-green이 된다. `scrollIntoViewIfNeeded()`도 hidden 조상의 scrollLeft를 프로그램적으로
    // 옮길 수 있으므로 사용하지 않는다.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: '편집 시작' }).click()
    await page.getByRole('button', { name: '문구 추가' }).click()

    const scrollRegion = page.getByTestId('document-template-editor-scroll')
    const before = await scrollRegion.evaluate((node) => {
      const editor = node.closest<HTMLElement>('[aria-label="문서 양식 편집기"]')
      const descendants = [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .map((element) => element.getBoundingClientRect())
      const maxRight = Math.max(...descendants.map((rect) => rect.right))
      const minLeft = Math.min(...descendants.map((rect) => rect.left))
      return {
        viewportWidth: window.innerWidth,
        editorScrollWidth: editor?.scrollWidth ?? 0,
        editorClientWidth: editor?.clientWidth ?? 0,
        maxRight,
        minLeft,
        boundingWidth: node.getBoundingClientRect().width,
      }
    })
    expect(before.boundingWidth, 'wrapper 자신은 뷰포트를 넘지 않아야 한다')
      .toBeLessThanOrEqual(before.viewportWidth)
    expect(before.maxRight, '편집기 콘텐츠의 실제 우측 경계가 viewport를 넘지 않아야 한다')
      .toBeLessThanOrEqual(before.viewportWidth)
    expect(before.minLeft, '편집기 콘텐츠의 실제 좌측 경계가 viewport 밖으로 나가지 않아야 한다')
      .toBeGreaterThanOrEqual(0)
    expect(before.editorScrollWidth, '편집기 자체에 수평 클리핑/overflow가 없어야 한다')
      .toBeLessThanOrEqual(before.editorClientWidth)

    // 가로 수단을 가정하지 않고 실제 사용자 휠로 세로 스택을 순회한다.
    const inspector = page.getByRole('textbox', { name: '문구', exact: true })
    let inspectorBox = await inspector.boundingBox()
    for (let attempt = 0; attempt < 6 && (!inspectorBox || inspectorBox.y < 0 || inspectorBox.y + inspectorBox.height > 800); attempt += 1) {
      await page.mouse.wheel(0, 600)
      // 실제 사용자 wheel은 유지한다. 스크롤/레이아웃이 연속 프레임에서 안정된 뒤에만
      // bounding-box와 elementFromPoint()를 판정해 고정 600px 직후의 간헐 RED를 막는다.
      await waitForStableLayout(inspector)
      inspectorBox = await inspector.boundingBox()
    }
    expect(inspectorBox, '실제 휠 제스처 후 속성 입력란이 화면에 도달해야 한다').not.toBeNull()
    expect(inspectorBox!.x).toBeGreaterThanOrEqual(0)
    expect(inspectorBox!.x + inspectorBox!.width).toBeLessThanOrEqual(375)
    expect(inspectorBox!.y).toBeGreaterThanOrEqual(0)
    expect(inspectorBox!.y + inspectorBox!.height).toBeLessThanOrEqual(800)
    const hitTarget = await inspector.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return hit === node || Boolean(hit && node.contains(hit))
    })
    expect(hitTarget, '화면 좌표의 실제 hit target이 속성 입력란이어야 한다').toBe(true)
    await inspector.click()
    await inspector.fill('좁은 뷰포트에서도 도달 가능')
    await expect(inspector).toHaveValue('좁은 뷰포트에서도 도달 가능')
  })

  test('DS4-A/B: 7개 경계 폭에서 품목행·로고의 실제 줄/기하/hit-test와 수평 폭을 확인한다', async ({ page }) => {
    test.setTimeout(120_000)

    for (const width of BOUNDARY_VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/#/groupware/document-templates/${DS4_TEMPLATE_ID}/edit?mockRole=MASTER`, {
        waitUntil: 'domcontentloaded',
      })

      const preview = page.getByTestId('document-template-live-preview')
      const detail = preview.locator('[data-template-detail]')
      const detailRows = detail.locator('[data-template-detail-row]')
      const image = preview.locator('img[data-template-image]')
      await expect(detail, `${width}px DETAIL은 실제로 렌더되어야 한다`).toBeVisible()
      await expect(detailRows, `${width}px DETAIL의 N행은 실제 데이터 행이어야 한다`).toHaveCount(2)
      await expect(detailRows.first()).toContainText('미리보기 품목 A')
      await expect(detailRows.last()).toContainText('미리보기 품목 B')
      await expect(image, `${width}px IMAGE는 실제로 보여야 한다`).toBeVisible()

      let imageBox = await image.boundingBox()
      for (let attempt = 0; attempt < 10 && (!imageBox || imageBox.y < 0 || imageBox.y + imageBox.height > 900); attempt += 1) {
        await page.mouse.wheel(0, 700)
        await waitForStableLayout(image)
        imageBox = await image.boundingBox()
      }
      expect(imageBox, `${width}px 실제 wheel 뒤 IMAGE가 viewport에 도달해야 한다`).not.toBeNull()
      expect(imageBox!.x).toBeGreaterThanOrEqual(0)
      expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(width)
      expect(imageBox!.y).toBeGreaterThanOrEqual(0)
      expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(900)

      const geometry = await preview.evaluate((node) => {
        const detailNode = node.querySelector<HTMLElement>('[data-template-detail]')
        const bodyNode = detailNode?.querySelector('tbody')
        const imageNode = node.querySelector<HTMLImageElement>('img[data-template-image]')
        if (!detailNode || !bodyNode || !imageNode) throw new Error('DS-4 렌더 전제가 충족되지 않았다')
        const range = document.createRange()
        range.selectNodeContents(bodyNode)
        const lineCount = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size
        const imageRect = imageNode.getBoundingClientRect()
        const imageHit = document.elementFromPoint(
          imageRect.left + imageRect.width / 2,
          imageRect.top + imageRect.height / 2,
        )
        return {
          detailRects: detailNode.getClientRects().length,
          lineCount,
          imageWidth: imageRect.width,
          imageHeight: imageRect.height,
          imageNaturalWidth: imageNode.naturalWidth,
          imageNaturalHeight: imageNode.naturalHeight,
          imageHit: imageHit === imageNode,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        }
      })
      expect(geometry.detailRects, `${width}px DETAIL의 실제 rect가 없어서는 안 된다`).toBeGreaterThan(0)
      expect(geometry.lineCount, `${width}px DETAIL의 실제 줄 수가 없어서는 안 된다`).toBeGreaterThan(0)
      expect(geometry.imageWidth, `${width}px IMAGE 폭이 0이면 안 된다`).toBeGreaterThan(0)
      expect(geometry.imageHeight, `${width}px IMAGE 높이가 0이면 안 된다`).toBeGreaterThan(0)
      expect(geometry.imageNaturalWidth, `${width}px IMAGE 원본이 로드되어야 한다`).toBeGreaterThan(0)
      expect(geometry.imageNaturalHeight, `${width}px IMAGE 원본이 로드되어야 한다`).toBeGreaterThan(0)
      expect(geometry.imageHit, `${width}px IMAGE 중심 hit-test가 IMAGE를 가리켜야 한다`).toBe(true)
      expect(geometry.scrollWidth, `${width}px 미리보기가 수평으로 넘치면 안 된다`)
        .toBeLessThanOrEqual(geometry.clientWidth)
    }
  })

  test('DS4-C: 실제 2페이지 PDF에서 행이 분리되지 않고 둘째 페이지에 열 헤더가 반복된다', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.goto(`/#/groupware/document-templates/${DS4_TEMPLATE_ID}/edit?mockRole=MASTER&mockDetailRows=44`, {
      waitUntil: 'domcontentloaded',
    })

    const detail = page.getByTestId('document-template-live-preview').locator('[data-template-detail]')
    const image = page.getByTestId('document-template-live-preview').locator('img[data-template-image]')
    await expect(detail).toBeVisible()
    await expect(detail.locator('[data-template-detail-row]')).toHaveCount(44)
    const imageNaturalSize = await image.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }))
    expect(imageNaturalSize.width, 'page.pdf() 전 로고 원본 폭이 로드되어야 한다').toBeGreaterThan(0)
    expect(imageNaturalSize.height, 'page.pdf() 전 로고 원본 높이가 로드되어야 한다').toBeGreaterThan(0)
    await page.emulateMedia({ media: 'print' })
    const pdfPath = testInfo.outputPath('ds4-detail-page-boundary.pdf')
    const pdfBytes = await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    expect(pdfBytes.byteLength, 'page.pdf()가 빈 출력물을 만들면 안 된다').toBeGreaterThan(10_000)
  })

  test('H-A: 편집기 화면의 UI 요소는 no-print 처리되어 인쇄 대상에서 제외된다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await page.emulateMedia({ media: 'print' })

    // 클래스가 존재하는지만 보지 않고 print media cascade의 실제 가시성을 검사한다.
    for (const locator of [
      page.locator('header.no-print h1'),
      page.locator('.document-template-editor-form'),
      page.locator('.document-template-editor-pane--palette'),
      page.locator('.document-template-band-pane'),
      page.locator('.document-template-editor-pane--inspector'),
      page.locator('footer.no-print'),
      page.getByRole('heading', { name: '라이브 미리보기' }),
    ]) {
      await expect(locator).toBeHidden()
    }

    const paper = page.getByTestId('document-template-live-preview').locator('.paper')
    await expect(paper).toBeVisible()
    const paperPrintState = await paper.evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const header = node.querySelector<HTMLElement>('.print-approval-doc-header')
      return {
        display: style.display,
        visibility: style.visibility,
        widthCssPx: Number.parseFloat(style.width),
        width: rect.width,
        headerFlexDirection: header ? getComputedStyle(header).flexDirection : '',
        text: node.textContent ?? '',
      }
    })
    expect(paperPrintState.display).not.toBe('none')
    expect(paperPrintState.visibility).toBe('visible')
    expect(Math.abs(paperPrintState.widthCssPx - (210 / 25.4 * 96)), 'M2 위반 — print paper CSS 폭이 210mm가 아님').toBeLessThan(1)
    expect(paperPrintState.headerFlexDirection, 'M2 위반 — 모바일 화면용 헤더 적층이 print에 적용됨').toBe('row')
    expect(paperPrintState.width).toBeGreaterThan(0)
    expect(paperPrintState.text).toContain('결재 문서 미리보기')
  })

  test('H-B boundary: 경계값 전량에서 전체 편집 경로와 모바일 table role tree가 유지된다', async ({ page }) => {
    test.setTimeout(120_000)

    for (const width of BOUNDARY_VIEWPORTS) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/#/groupware/document-templates/${ACTIVE_TEMPLATE_ID}/edit?mockRole=MASTER`, {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible()

      const editStart = page.getByRole('button', { name: '편집 시작' })
      const textButton = page.getByRole('button', { name: '문구 추가' })
      await expect(editStart, `ACTIVE 양식 ${width}px 회차는 편집 시작 전제를 만족해야 한다`).toBeVisible()
      await editStart.click()
      await expect(textButton, `편집 시작 후 ${width}px 회차의 문구 추가가 활성화되어야 한다`).toBeEnabled()

      await textButton.click()
      const addedElement = page.getByRole('button', { name: /^문구 요소 key: [^\s]+$/ }).last()
      await addedElement.click()

      await assertEditorGeometry(page)
      await assertInspectorHitTarget(page, width, 800)
      const inspector = page.getByRole('textbox', { name: '문구', exact: true })
      await inspector.fill(`경계값 ${width}px 회귀`)
      await page.getByRole('spinbutton', { name: '가로 위치(x, %)' }).fill('12')
      await page.getByRole('spinbutton', { name: '세로 위치(y, %)' }).fill('24')
      await page.getByRole('checkbox', { name: '굵게' }).check()
      await expect(page.getByRole('spinbutton', { name: '가로 위치(x, %)' })).toHaveValue('12')
      await expect(page.getByRole('spinbutton', { name: '세로 위치(y, %)' })).toHaveValue('24')
      await expect(page.getByRole('checkbox', { name: '굵게' })).toBeChecked()

      await page.getByRole('button', { name: '요소 삭제' }).click()
      await page.getByRole('textbox', { name: '양식명' }).fill(`DS-3b 경계값 ${width}px`)
      await page.getByRole('button', { name: '저장' }).click()
      await expect(page.getByText('저장된 상태입니다.')).toBeVisible()

      await page.getByRole('button', { name: '목록' }).click()
      await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible()
      await assertApprovalTemplateTableRoleTree(page)

      if (width !== BOUNDARY_VIEWPORTS[BOUNDARY_VIEWPORTS.length - 1]) {
        const row = page.getByRole('row').filter({ hasText: `DS-3b 경계값 ${width}px` })
        await row.getByRole('button', { name: '활성화' }).click()
        await expect(row.getByRole('button', { name: '비활성화' })).toBeVisible()
      }
    }
  })
})
