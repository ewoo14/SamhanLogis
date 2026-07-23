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
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const MARKER = 'PR914-LUNA-20260723'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '914-luna-impl-2026-07-23')
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
    const element = layer?.querySelector<HTMLElement>('[data-template-element]')
    const spacer = layer?.querySelector<HTMLElement>('[data-testid$="-overflow-spacer"]')
    const printSpacer = layer?.querySelector<HTMLElement>('[data-testid$="-print-overflow-spacer"]')
    const printMeasure = layer?.querySelector<HTMLElement>('.document-template-v2-elements-print-measure')
    const printMeasureChild = printMeasure?.querySelector<HTMLElement>('[data-template-element]')
    if (!layer || !element) return { error: '좌표 레이어/요소 없음' }
    const layerRect = layer.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const closingRect = root.querySelector<HTMLElement>('.print-approval-closing')?.getBoundingClientRect()
    return {
      paperWidth: root.querySelector<HTMLElement>('.paper')?.getBoundingClientRect().width ?? 0,
      layerHeight: layerRect.height,
      spacerHeight: spacer?.getBoundingClientRect().height ?? 0,
      printSpacerHeight: Number.parseFloat(printSpacer?.style.height ?? '0') || 0,
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
    await page.screenshot({ path: join(SHOT_DIR, 'C-RED-00-screen-before-print.png'), fullPage: true })

    const screenMetrics = await measure(page)
    console.log(`■ [C RED sizing] ${JSON.stringify(await page.evaluate(() => {
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
    console.log(`■ [C RED screen] ${JSON.stringify(screenMetrics)}`)

    const pdfPath = join(SHOT_DIR, 'C-RED-02-direct-print.pdf')
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true })
    const pdfMetrics = JSON.parse(execFileSync('python', ['-c', `
import json, sys
from pypdf import PdfReader
marker_max = -1
items = []
for page_no, page in enumerate(PdfReader(sys.argv[1]).pages, 1):
    def visitor(text, cm, tm, font_dict, font_size):
        if text.strip():
            items.append((page_no, float(tm[5]), text))
    page.extract_text(visitor_text=visitor)
for page_no, y, text in items:
    if 'FLOWMARK' in text or 'WRAPWORD' in text:
        marker_max = max(marker_max, y)
footer = [y for page_no, y, text in items if y > 800 and y > marker_max]
print(json.dumps({'markerMaxY': marker_max, 'footerY': min(footer) if footer else -1, 'itemCount': len(items)}))
`, pdfPath], {
      encoding: 'utf8',
      timeout: 10_000,
    }) as string)
    const printMetrics = { paperWidth: 210 / 25.4 * 96, pdfBytes: statSync(pdfPath).size, ...pdfMetrics }
    console.log(`■ [C RED print] ${JSON.stringify(printMetrics)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'C-RED-01-print-before-fix.png'), fullPage: true })

    expect(printMetrics.paperWidth, '인쇄 레이아웃은 A4 폭이어야 한다').toBeCloseTo(210 / 25.4 * 96, 0)
    expect(printMetrics.markerMaxY, 'P3: 인쇄 PDF에 좌표 문구 marker가 있어야 한다').toBeGreaterThan(0)
    const printSpacer = page.getByTestId('document-template-live-preview')
      .locator('[data-testid$="-print-overflow-spacer"]')
    const printSpacerHeight = await printSpacer.count() > 0
      ? await printSpacer.evaluate((node) => Number.parseFloat((node as HTMLElement).style.height) || 0)
      : 0
    console.log(`■ [C RED print spacer] ${JSON.stringify({ screen: screenMetrics.spacerHeight, print: printSpacerHeight })}`)
    expect(printMetrics.footerY, 'P2 RED: 인쇄 PDF에서 맺음말이 좌표 문구 뒤에 있어야 한다')
      .toBeGreaterThan(printMetrics.markerMaxY)

    await page.emulateMedia({ media: 'print' })
    const printDomMetrics = await measure(page)
    console.log(`■ [C print DOM] ${JSON.stringify(printDomMetrics)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'C-GREEN-03-print-media.png'), fullPage: true })
    expect(printDomMetrics.paperWidth, 'P3: print media paper가 A4 폭이어야 한다').toBeCloseTo(210 / 25.4 * 96, 0)
    expect(printSpacerHeight, 'P1: A4 고정 폭으로 미리 계산한 print spacer가 있어야 한다')
      .toBeGreaterThan(0)
    expect(printDomMetrics.printSpacerHeight, 'P1: print media에서 A4 spacer가 표시돼야 한다').toBeGreaterThan(0)
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
      const screen = await measure(page)
      await page.emulateMedia({ media: 'print' })
      const print = await measure(page)
      await page.emulateMedia({ media: 'screen' })
      rows.push({
        width,
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
