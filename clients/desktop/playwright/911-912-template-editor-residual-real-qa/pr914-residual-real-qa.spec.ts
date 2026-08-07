import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #914 라이브 RED 하네스.
 *
 * 실제 게이트웨이와 groupware_db에 마커 throwaway DRAFT만 생성한다.
 * 시작/종료 시 API 정리와 동기 psql soft-delete를 함께 수행해 timeout 이후에도 잔재를 회수한다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const MARKER = 'PR914-LUNA-20260723'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '914-luna-impl-2026-07-23'))
mkdirSync(SHOT_DIR, { recursive: true })

const DOCUMENT = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'pr914-header', kind: 'HEADER', elements: [
      { key: 'pr914-title', type: 'TITLE' },
      { key: 'pr914-meta', type: 'META_ROWS' },
      { key: 'pr914-approval', type: 'APPROVAL_GRID' },
    ] },
    { key: 'pr914-body', kind: 'BODY', elements: [
      { key: 'pr914-content', type: 'CONTENT_PARAGRAPHS' },
      { key: 'pr914-fields', type: 'FIELD_TABLE' },
      { key: 'pr914-attachments', type: 'ATTACHMENT_TABLE' },
    ] },
    { key: 'pr914-footer', kind: 'FOOTER', elements: [{ key: 'pr914-closing', type: 'CLOSING' }] },
  ],
} as const

interface LoginResult {
  token: string
  userId: string
  role: string
  displayName: string
}

function syncCleanup(): void {
  try {
    execFileSync('docker', [
      'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'groupware_db', '-c',
      `UPDATE document_templates SET is_deleted = true WHERE name LIKE '${MARKER}%' AND is_deleted = false;`,
    ], { encoding: 'utf8', timeout: 10_000 })
  } catch (error) {
    console.warn(`동기 throwaway 정리 실패: ${String(error)}`)
  }
}

async function login(page: Page): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(response.ok(), `실서버 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? 'MASTER',
    displayName: data.displayName ?? '개발책임자',
  }
}

async function installAuth(page: Page, auth: LoginResult): Promise<void> {
  await page.addInitScript((value: LoginResult) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...value, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

async function createDraft(page: Page, auth: LoginResult, docType: string): Promise<string> {
  const response = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      docType,
      name: `${MARKER}-${docType}`,
      schemaVersion: 2,
      document: DOCUMENT,
    },
  })
  expect(response.ok(), `throwaway 양식 생성 실패: HTTP ${response.status()}`).toBeTruthy()
  return (await response.json()).data.id as string
}

async function openEditor(page: Page, id: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 1080 })
  // N-7(Q-2) fix: 같은 hash URL로 반복 goto하면(폭 스윕처럼 같은 id를 여러 폭에서 여는 경우)
  // same-document 내비게이션이라 실제로 리로드되지 않아 이전 반복의 draft(addOverflowText로 추가한
  // 요소)가 그대로 누적된다 — 폭 14개를 쟀는데 실은 서로 다른 개수의 요소를 가진 서로 다른 문서를
  // 쟀다는 뜻이라 각 측정이 독립이지 않다. about:blank를 먼저 거치면 그다음 목표 URL로의 이동은
  // Playwright/Chromium이 항상 실제 문서 로드로 처리한다(URL 동일 여부와 무관) — 매 호출을 완전히
  // 새 문서 상태로 격리한다.
  await page.goto('about:blank')
  await page.goto(`${BASE_URL}/#/groupware/document-templates/${id}/edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('document-template-live-preview')).toBeVisible()
}

async function addOverflowText(page: Page): Promise<void> {
  await page.getByRole('button', { name: '문구 추가' }).click()
  await page.getByRole('textbox', { name: '문구' }).fill(
    'FLOWMARK-001 ' + 'WRAPWORD103MMM '.repeat(90),
  )
  for (const [label, value] of [
    ['가로 위치(x, %)', '0'],
    ['세로 위치(y, %)', '0'],
    ['가로 크기(w, %)', '100'],
    ['세로 크기(h, %)', '11'],
  ] as const) {
    await page.getByLabel(label).fill(value)
  }
}

async function measure(page: Page) {
  return page.getByTestId('document-template-live-preview').evaluate((root) => {
    const layer = root.querySelector<HTMLElement>('[data-testid="document-template-v2-elements-body"]')
    // N-7(Q-1) fix: 화면(실제) 사본은 여전히 data-template-element를 쓴다.
    const element = layer?.querySelector<HTMLElement>('[data-template-element]')
    const spacer = layer?.querySelector<HTMLElement>('[data-testid$="-overflow-spacer"]')
    const printSpacer = layer?.querySelector<HTMLElement>('[data-testid$="-print-overflow-spacer"]')
    const printMeasure = layer?.querySelector<HTMLElement>('.document-template-v2-elements-print-measure')
    // N-7(Q-1) fix: 인쇄 측정 사본은 이제 data-template-print-element(FIELD/TEXT)를 쓴다 —
    // IMAGE의 data-template-print-image와 대칭. 이전에는 data-template-element로 화면 사본과
    // 같은 속성을 썼기 때문에 이 querySelector가 이 subtree 밖의 노드가 아니라 실제로는 늘 undefined를
    // 반환하지 않았을 뿐, [data-template-element] 전역 쿼리가 항상 2개를 매칭하는 원인이었다.
    const printMeasureChild = printMeasure?.querySelector<HTMLElement>('[data-template-print-element], [data-template-print-image]')
    if (!layer || !element) return { error: '좌표 레이어/요소 없음' }
    const layerRect = layer.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const closingRect = root.querySelector<HTMLElement>('.print-approval-closing')?.getBoundingClientRect()
    return {
      paperWidth: root.querySelector<HTMLElement>('.paper')?.getBoundingClientRect().width ?? 0,
      layerHeight: layerRect.height,
      spacerHeight: spacer?.getBoundingClientRect().height ?? 0,
      // N-7(Q-5) fix: 인라인 style.height는 CSS(`@media print{ …-print-overflow-spacer{display:block} }`)가
      // 통째로 삭제돼도 그대로 값을 유지한다(React가 항상 그 스타일을 쓰기 때문) — 그 CSS 규칙이
      // 실제로 이 요소를 표시하는지는 절대 검증하지 못한다. getBoundingClientRect().height는 그 CSS
      // 규칙이 없으면(display:none 유지) 0을 반환하므로 화면용 spacerHeight와 같은 방식으로 통일한다.
      printSpacerHeight: printSpacer?.getBoundingClientRect().height ?? 0,
      printMeasureWidth: printMeasure?.getBoundingClientRect().width ?? 0,
      printMeasureHeight: printMeasure?.getBoundingClientRect().height ?? 0,
      printMeasureTop: printMeasure?.getBoundingClientRect().top ?? 0,
      printMeasureChildTop: printMeasureChild?.getBoundingClientRect().top ?? 0,
      printMeasureChildHeight: printMeasureChild?.getBoundingClientRect().height ?? 0,
      printMeasureChildWidth: printMeasureChild?.getBoundingClientRect().width ?? 0,
      printMeasureChildBottom: printMeasureChild?.getBoundingClientRect().bottom ?? 0,
      elementBottomOverLayer: elementRect.bottom - layerRect.bottom,
      elementHeight: elementRect.height,
      elementBottom: elementRect.bottom,
      closingTop: closingRect?.top ?? 0,
    }
  })
}

test.describe.configure({ mode: 'serial' })

test('PR #912 A 라이브 — geometry 없는 좌표는 빈 값이고 사용자가 0을 입력하면 absolute가 된다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, `GROUPWARE_${MARKER}-A`)
  try {
    await openEditor(page, id, 1440)
    await page.getByRole('button', { name: '문구 추가' }).click()
    const x = page.getByRole('spinbutton', { name: '가로 위치(x, %)' })
    await expect(x).toHaveValue('')
    await expect(page.getByRole('spinbutton', { name: '세로 위치(y, %)' })).toHaveValue('')
    await page.screenshot({ path: join(SHOT_DIR, 'A-01-geometry-없음-빈값.png'), fullPage: true })

    await x.fill('0')
    await expect(page.locator('[data-template-element]').last()).toHaveAttribute('style', /position:\s*absolute/)
    await page.screenshot({ path: join(SHOT_DIR, 'A-02-geometry-0-입력-absolute.png'), fullPage: true })
  } finally {
    syncCleanup()
  }
})

test('PR #912 B 라이브 — 현재 결재유형의 본문 필드를 선택해 실제 미리보기 값을 렌더한다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, 'GROUPWARE_EXPENSE_REPORT')
  try {
    await openEditor(page, id, 1440)
    await page.getByRole('button', { name: '필드 추가' }).click()
    const binding = page.getByRole('combobox', { name: '표시할 값' })
    await expect(binding.locator('option', { hasText: '본문 필드 · 지출항목' })).toHaveCount(1, { timeout: 15_000 })
    await page.screenshot({ path: join(SHOT_DIR, 'B-01-실서버-본문필드-선택지.png'), fullPage: true })
    await binding.selectOption('body.fieldRow[expenseItem]')
    await expect(page.getByTestId('document-template-live-preview')).toContainText('미리보기 지출항목')
    await expect(page.getByLabel('본문 필드 키')).toHaveCount(0)
    await page.screenshot({ path: join(SHOT_DIR, 'B-02-본문필드-선택-미리보기.png'), fullPage: true })
  } finally {
    syncCleanup()
  }
})

// N-7(Q-3/Q-4) fix: PDF 텍스트 추출로 맺음말↔marker 겹침을 "직접" 잰다. 이전 스크립트는
// `footer = [y for … if y > marker_max]`로 후보를 만든 뒤 `min(footer) > marker_max`를 단언했다 —
// 그 리스트 자체가 `y > marker_max` 조건으로 걸러진 것이라 비어있지 않은 한 항상 참인 동어반복이었고,
// 맺음말인지 식별하지도 겹침을 재지도 않았다("y > 800"도 매직넘버). 실측(2026-07-23, 이 스펙의 실제
// PDF 산출물): 이 Chrome print-to-PDF + pypdf 조합에서는 tm[5]가 아래로 갈수록 "커진다"(표준 PDF
// bottom-left 원점과 반대) — title(y≈0)→header→본문 문단→marker(y 230~566)→맺음말(y≈1039)→
// 전자서명 안내(y≈1073) 순으로 DOM 순서와 일치해 실측으로 방향을 확정했다. 한글은 음절 단위로
// fragment가 쪼개져("품"/"의"/"하"/"오"/"니" 각각 별도 text) 단일 fragment에서 "품의하오니"를
// 찾으면 항상 실패한다 — 같은 (page, y) 줄의 fragment를 렌더 순서대로 이어붙여 실제 줄 텍스트를
// 복원한 뒤 찾는다. marker 하단(가장 큰 y)과 맺음말 줄의 y를 페이지 번호까지 포함해 비교해 실제
// 겹침량(pt)을 계산한다 — 다른(뒤) 페이지면 겹치지 않음(0), 같은 페이지에서 맺음말이 marker 하단보다
// 위(작은 y)면 그 차이만큼 겹친다.
const PDF_OVERLAP_SCRIPT = `
import json, sys
from pypdf import PdfReader

items = []  # (page_no, y, text)
for page_no, page in enumerate(PdfReader(sys.argv[1]).pages, 1):
    def visitor(text, cm, tm, font_dict, font_size):
        if text.strip():
            items.append((page_no, round(float(tm[5]), 1), text))
    page.extract_text(visitor_text=visitor)

marker_hits = [(p, y) for p, y, t in items if 'FLOWMARK' in t or 'WRAPWORD' in t]
marker_found = len(marker_hits) > 0
marker_bottom_page, marker_bottom_y = max(marker_hits, key=lambda pair: (pair[0], pair[1])) if marker_found else (-1, -1.0)

lines = {}
for p, y, t in items:
    lines[(p, y)] = lines.get((p, y), '') + t
closing_hits = sorted(
    ((p, y) for (p, y), text in lines.items() if '품의하오니' in text),
    key=lambda pair: (pair[0], pair[1]),
)
closing_found = len(closing_hits) > 0
closing_page, closing_y = closing_hits[0] if closing_found else (-1, -1.0)

if not marker_found or not closing_found:
    overlap_pt = -1.0
elif closing_page < marker_bottom_page:
    overlap_pt = 999.0  # 맺음말이 marker보다 앞 페이지 — 순서 자체가 뒤집힘(심각)
elif closing_page > marker_bottom_page:
    overlap_pt = 0.0  # 뒤 페이지 — 겹치지 않음
else:
    overlap_pt = max(0.0, marker_bottom_y - closing_y)

print(json.dumps({
    'markerFound': marker_found,
    'markerBottomPage': marker_bottom_page,
    'markerBottomY': marker_bottom_y,
    'closingFound': closing_found,
    'closingPage': closing_page,
    'closingY': closing_y,
    'overlapPt': overlap_pt,
    'itemCount': len(items),
}))
`

test('PR #914 C 라이브 — 1920px 화면에서 만든 spacer가 A4 인쇄 폭 초과분을 따라간다', async ({ page }) => {
  page.on('console', (message) => {
    if (message.text().includes('PR914 print overflow measure')) console.log(`■ [renderer] ${message.text()}`)
  })
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, `GROUPWARE_${MARKER}`)

  try {
    await openEditor(page, id, 1920)
    await addOverflowText(page)
    await page.screenshot({ path: join(SHOT_DIR, 'C-screen-01-overflow-text-added.png'), fullPage: true })

    const screenMetrics = await measure(page)
    console.log(`■ [C sizing] ${JSON.stringify(await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      context.font = '10pt Pretendard'
      return {
        wrapWordWidth: context.measureText('WRAPWORD103 ').width,
        actualWordWidth: context.measureText('WRAPWORD103MMM ').width,
        layerWidth: document.querySelector<HTMLElement>('[data-testid="document-template-v2-elements-body"]')?.getBoundingClientRect().width ?? 0,
        elementHeight: document.querySelector<HTMLElement>('[data-template-element]')?.getBoundingClientRect().height ?? 0,
      }
    }))}`)
    console.log(`■ [C screen] ${JSON.stringify(screenMetrics)}`)

    // N-7(Q-11) fix: 파일명에서 RED/GREEN/before-fix를 뺀다 — 이 스펙은 매 실행마다 현재 체크아웃된
    // 코드 한 벌만 대상으로 돈다(같은 실행 안에서 fix 전/후 코드를 각각 캡처하지 않는다). "RED"·
    // "before-fix"·"GREEN" 라벨은 실제로는 성립하지 않는 서사를 파일명에 새겨 넣는 것이었다(실측:
    // C-RED-01은 screen 미디어였고 이 라운드의 fix가 이미 반영된 빌드에서 캡처됐다). 매체(screen/print)와
    // 촬영 순서만 파일명에 담는다.
    const pdfPath = join(SHOT_DIR, 'C-direct-print.pdf')
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
    const pdfMetrics = JSON.parse(execFileSync('python', ['-c', PDF_OVERLAP_SCRIPT, pdfPath], {
      encoding: 'utf8',
      timeout: 10_000,
    }) as string)
    const printMetrics = { paperWidth: 210 / 25.4 * 96, pdfBytes: statSync(pdfPath).size, ...pdfMetrics }
    console.log(`■ [C print] ${JSON.stringify(printMetrics)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'C-screen-02-after-pdf-export.png'), fullPage: true })

    expect(printMetrics.paperWidth, '인쇄 레이아웃은 A4 폭이어야 한다').toBeCloseTo(210 / 25.4 * 96, 0)
    expect(printMetrics.markerFound, 'P3: 인쇄 PDF에 좌표 문구 marker가 있어야 한다').toBeTruthy()
    expect(printMetrics.closingFound, 'P2: 인쇄 PDF에 맺음말 텍스트가 있어야 한다').toBeTruthy()
    console.log(`■ [C print spacer] ${JSON.stringify({ screen: screenMetrics.spacerHeight })}`)
    expect(printMetrics.overlapPt, `P2: 인쇄 PDF에서 맺음말이 marker와 겹치지 않아야 한다(겹침량=${printMetrics.overlapPt}pt, marker하단=${printMetrics.markerBottomY}@p${printMetrics.markerBottomPage}, 맺음말=${printMetrics.closingY}@p${printMetrics.closingPage})`)
      .toBeLessThanOrEqual(0)

    await page.emulateMedia({ media: 'print' })
    const printDomMetrics = await measure(page)
    console.log(`■ [C print DOM] ${JSON.stringify(printDomMetrics)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'C-print-03-media-emulated.png'), fullPage: true })
    expect(printDomMetrics.paperWidth, 'P3: print media paper가 A4 폭이어야 한다').toBeCloseTo(210 / 25.4 * 96, 0)
    // N-7(Q-5) fix: printSpacerHeight는 이제 getBoundingClientRect().height다 — `@media print`
    // 규칙(.document-template-v2-elements-print-overflow-spacer{display:block})이 통째로 지워지면
    // display:none이 유지되어 0이 되므로, 이 CSS 규칙의 존재 자체를 검증한다(이전 .style.height는
    // React가 항상 쓰는 인라인 속성이라 그 CSS 규칙이 있든 없든 값이 그대로였다).
    expect(printDomMetrics.printSpacerHeight, 'P1: print media에서 A4 spacer가 실제로 표시돼야 한다(CSS 규칙 자체를 검증)').toBeGreaterThan(0)
    expect(printDomMetrics.elementBottomOverLayer, 'P2: print media에서 좌표 요소가 밴드를 넘지 않아야 한다')
      .toBeLessThanOrEqual(0.5)
    await page.emulateMedia({ media: 'screen' })
  } finally {
    syncCleanup()
  }
})

test('PR #914 C 폭 스윕 — 실제 미리보기와 A4 인쇄 폭의 14개 경계를 측정한다', async ({ page }) => {
  syncCleanup()
  const auth = await login(page)
  await installAuth(page, auth)
  const id = await createDraft(page, auth, `GROUPWARE_${MARKER}-WIDTH-SWEEP`)
  const widths = [320, 360, 375, 639, 640, 1100, 1140, 1152, 1180, 1280, 1440, 1600, 1920, 2560]
  const rows: Array<Record<string, number>> = []

  try {
    for (const width of widths) {
      await openEditor(page, id, width)
      await addOverflowText(page)
      await page.waitForFunction(() => {
        const node = document.querySelector<HTMLElement>('[data-testid$="-print-overflow-spacer"]')
        return Boolean(node && Number.parseFloat(node.style.height) > 0)
      }, undefined, { timeout: 15_000 })
      // N-7(Q-2) fix — 하네스는 결함이 발생할 수 있는 입력에서 잰다: 각 반복이 실제로 독립인지(이전
      // 반복이 추가한 "문구" 요소가 남아있지 않은지) 스펙 스스로 확증한다. openEditor의 about:blank
      // 리로드가 실패하면(예: 회귀로 다시 same-document 내비게이션이 되면) 여기서 즉시 드러난다 —
      // spacer 높이만으로는 우연히 같은 값이 나올 수 있어(A4 고정폭 print ruler는 실제로 뷰포트와
      // 무관하게 항상 같은 값이 정상이다) 독립성의 직접 증거가 아니다.
      const elementCount = await page.locator('[data-template-element]').count()
      const screen = await measure(page)
      await page.emulateMedia({ media: 'print' })
      const print = await measure(page)
      await page.emulateMedia({ media: 'screen' })
      rows.push({
        width,
        elementCount,
        paperWidth: Number(screen.paperWidth.toFixed(3)),
        screenSpacer: Number(screen.spacerHeight.toFixed(3)),
        printSpacer: Number(print.printSpacerHeight.toFixed(3)),
        printElementOverLayer: Number(print.elementBottomOverLayer.toFixed(3)),
      })
      if (width === 1920 || width === 2560) {
        await page.screenshot({ path: join(SHOT_DIR, `C-width-${width}.png`), fullPage: true })
      }
    }
    console.log(`■ [C width sweep] ${JSON.stringify(rows)}`)
    expect(rows).toHaveLength(14)
    expect(rows.every((row) => row.elementCount === 1), `P4: 매 반복이 독립이어야 한다 — 요소 1개가 아니면 이전 반복의 draft가 누적된 것이다. elementCount=${JSON.stringify(rows.map((r) => r.elementCount))}`)
      .toBeTruthy()
    expect(rows.every((row) => row.printSpacer > 0), 'P1: 모든 폭에서 A4 print spacer가 계산돼야 한다').toBeTruthy()
    expect(rows.every((row) => row.printElementOverLayer <= 0.5), 'P2: 모든 폭의 print 레이아웃에서 요소가 밴드를 넘지 않아야 한다').toBeTruthy()
  } finally {
    syncCleanup()
  }
})

test('실 결재문서 인쇄 대조군 — 기존 지출결의서가 700/1024/1600/2560 폭에서 온전하다', async ({ page }) => {
  const approvalId = 'd16da703-e914-4bd0-bdd2-43a715e6e418'
  const widths = [700, 1024, 1600, 2560]
  const rows: Array<Record<string, number>> = []
  const auth = await login(page)
  await installAuth(page, auth)

  for (const width of widths) {
    await page.setViewportSize({ width, height: 1080 })
    await page.goto(`${BASE_URL}/#/groupware/approvals/${approvalId}/print`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.paper')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.approval-doc-print-content')).toBeVisible({ timeout: 30_000 })
    const dom = await page.evaluate(() => ({
      paperWidth: document.querySelector<HTMLElement>('.paper')?.getBoundingClientRect().width ?? 0,
      contentHeight: document.querySelector<HTMLElement>('.approval-doc-print-content')?.getBoundingClientRect().height ?? 0,
      textLength: document.querySelector<HTMLElement>('.approval-doc-print-content')?.innerText.length ?? 0,
      closingCount: document.querySelectorAll('.print-approval-closing').length,
    }))
    const pdfPath = join(SHOT_DIR, `control-approval-${width}.pdf`)
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
    const pdfPages = Number(execFileSync('python', ['-c', `
from pypdf import PdfReader
import sys
print(len(PdfReader(sys.argv[1]).pages))
`, pdfPath], { encoding: 'utf8', timeout: 10_000 }).trim())
    rows.push({ width, ...dom, pdfPages })
    if (width === 700 || width === 2560) {
      await page.screenshot({ path: join(SHOT_DIR, `control-approval-${width}.png`), fullPage: true })
    }
  }
  console.log(`■ [실 결재문서 control] ${JSON.stringify(rows)}`)
  expect(rows).toHaveLength(4)
  expect(rows.every((row) => Math.abs(row.paperWidth - 793.701) < 1), '실 결재문서도 A4 용지 폭이어야 한다').toBeTruthy()
  expect(rows.every((row) => row.contentHeight > 0 && row.textLength > 0 && row.closingCount === 1 && row.pdfPages >= 1), '실 결재문서 인쇄 DOM/PDF가 비어 있거나 맺음말이 유실되지 않아야 한다').toBeTruthy()
})
