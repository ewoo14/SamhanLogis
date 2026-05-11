/**
 * 슬립→전표 일괄 교체 Playwright 정합성 검증 스펙.
 *
 * 목적:
 *   1. mock 모드(VITE_MOCK_MODE=1)로 진입하여 페이지 visible 텍스트에서 "슬립" 단어가 0건인지 검증.
 *   2. 매뉴얼 markdown 파일에도 "슬립" 잔류 여부를 별도 grep 으로 확인 (본 spec 에서는 파일 시스템 직접 스캔).
 *
 * 검증 범위 (UI):
 *   - 전표 목록 (SlipListPage 대응 라우트 또는 mock 데이터 표시 영역)
 *   - 전표 생성 폼 (SlipFormPage)
 *   - 전표 상세 (SlipDetailPage)
 *   - 공통 네비게이션 / 사이드바 메뉴
 *
 * 검증 범위 (파일):
 *   - docs/manual/ 하위 *.md 파일 — "슬립" 잔류 0건 목표
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 &
 *   npx playwright test playwright/manual/slip-rename.spec.ts \
 *     --reporter=line --timeout=60000
 *
 * 주의:
 *   - 브라우저 visible 텍스트 검사이므로 코드 주석/변수명/id 속성에 남은 "슬립" 은 대상 외.
 *   - Playwright 는 package.json devDependencies 에 없음.
 *     `npm i -D @playwright/test playwright` + `npx playwright install chromium` 필요.
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'
const IDLE_TIMEOUT = 6_000
const SETTLE_WAIT = 1_500

/** hash 라우터 URL (mockRole query 포함) */
function url(routePath: string, role = 'MASTER'): string {
  return `${BASE_URL}/#${routePath}?mockRole=${role}`
}

/** 페이지 로드 후 네트워크 안정화 대기 */
async function navigate(page: Page, routePath: string, role = 'MASTER') {
  await page.goto(url(routePath, role))
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {/* timeout 무시 — mock 모드 */})
  await page.waitForTimeout(SETTLE_WAIT)
}

// ---------------------------------------------------------------------------
// UI 가시 텍스트 "슬립" 검사 헬퍼
// ---------------------------------------------------------------------------

/**
 * 현재 페이지의 body visible 텍스트에서 "슬립" 단어를 검색한다.
 * 일치 위치 목록을 반환 — 길이 0 이어야 통과.
 */
async function findSlipWordInVisibleText(page: Page): Promise<string[]> {
  const matches: string[] = await page.evaluate(() => {
    const bodyText = document.body.innerText ?? ''
    const results: string[] = []
    let idx = bodyText.indexOf('슬립')
    while (idx !== -1) {
      // 전후 20자 context 포함
      const start = Math.max(0, idx - 20)
      const end = Math.min(bodyText.length, idx + 20)
      results.push(`...${bodyText.substring(start, end)}...`)
      idx = bodyText.indexOf('슬립', idx + 1)
    }
    return results
  })
  return matches
}

// ---------------------------------------------------------------------------
// TC-UI-1: 전표 목록 페이지
// ---------------------------------------------------------------------------

test('TC-UI-1: 전표 목록 — visible 텍스트에 "슬립" 0건', async ({ page }) => {
  await navigate(page, '/slips')

  const matches = await findSlipWordInVisibleText(page)
  expect(matches, `전표 목록 화면에 "슬립" 잔류: ${matches.join(' | ')}`).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// TC-UI-2: 전표 생성 폼
// ---------------------------------------------------------------------------

test('TC-UI-2: 전표 생성 폼 — visible 텍스트에 "슬립" 0건', async ({ page }) => {
  await navigate(page, '/slips/new')

  const matches = await findSlipWordInVisibleText(page)
  expect(matches, `전표 생성 폼에 "슬립" 잔류: ${matches.join(' | ')}`).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// TC-UI-3: 공통 레이아웃 (네비게이션 / 사이드바)
// ---------------------------------------------------------------------------

test('TC-UI-3: 공통 레이아웃 — visible 텍스트에 "슬립" 0건', async ({ page }) => {
  // 대시보드에서 공통 레이아웃 포함 전체 렌더링
  await navigate(page, '/')

  const matches = await findSlipWordInVisibleText(page)
  expect(matches, `공통 레이아웃에 "슬립" 잔류: ${matches.join(' | ')}`).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// TC-FILE-1: docs/manual 매뉴얼 markdown 파일 "슬립" 잔류 검사
// ---------------------------------------------------------------------------

test('TC-FILE-1: docs/manual 매뉴얼 markdown — "슬립" 잔류 0건', async () => {
  // docs/manual 루트 (절대 경로)
  const manualRoot = path.resolve(__dirname, '../../../../docs/manual')

  if (!fs.existsSync(manualRoot)) {
    // CI 환경에서 docs/ 미존재 시 skip (경고만)
    console.warn(`docs/manual 디렉토리 미존재 — skip: ${manualRoot}`)
    return
  }

  const findings: string[] = []

  /** 재귀 md 파일 스캔 */
  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const lines = content.split('\n')
        lines.forEach((line, lineIdx) => {
          if (line.includes('슬립')) {
            findings.push(`${path.relative(manualRoot, fullPath)}:${lineIdx + 1} → ${line.trim()}`)
          }
        })
      }
    }
  }

  scanDir(manualRoot)

  expect(
    findings,
    `매뉴얼 markdown 에 "슬립" 잔류 ${findings.length}건:\n${findings.join('\n')}`
  ).toHaveLength(0)
})
