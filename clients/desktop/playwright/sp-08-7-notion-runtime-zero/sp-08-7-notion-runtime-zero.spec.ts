/**
 * SP-08-7 Notion Runtime Zero — QA Playwright RED Gate
 *
 * 목적: Notion API 런타임 호출 의존이 코드베이스 내 잔존하지 않음을
 *       정적 fs 재귀 탐색 + 정규식 패턴 검사로 잠금한다.
 *
 * T1 clients/web 소스        — api.notion.com / Notion-Version / @notionhq/client 미포함
 * T2 clients/desktop/src 소스 — 동일
 * T3 clients/mobile-staff/src 소스 — 동일
 * T4 services (src/main) 소스 — 동일
 * T5 전 영역: NOTION_TOKEN / NOTION_API_KEY 환경변수 코드 참조 미포함
 *
 * 화이트리스트 (검사 제외):
 *   - clients/web/estimate-app/lib/apps-script-shim.js  → noop 차단 구현체
 *   - clients/desktop/playwright/                        → 테스트 단언 코드 (not.toContain)
 *   - node_modules / build / dist / .gradle / *.d.ts     → 빌드 산출물
 *
 * 외부 의존 없음 — Node.js 내장 fs 모듈만 사용.
 */

import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.java', '.kt',
  '.yml', '.yaml', '.properties',
])

const SKIP_DIR_NAMES = new Set([
  'node_modules', 'build', 'dist', '.gradle', 'out',
  'playwright-report', 'test-results',
])

const WHITELIST_SUBPATHS = [
  // noop 차단 shim — api.notion.com 은 차단 목록 선언으로만 존재
  path.join('clients', 'web', 'estimate-app', 'lib', 'apps-script-shim.js'),
  // Playwright 테스트 단언 코드 (not.toContain / not.toMatch 형태)
  path.join('clients', 'desktop', 'playwright'),
]

/**
 * 재귀적으로 파일을 수집하여 금지 패턴과 매칭되는 위반 목록을 반환한다.
 *
 * @param absDir      절대 경로 (탐색 루트)
 * @param patterns    금지 정규식 목록
 * @param srcMainOnly true 이면 파일 경로에 /src/main/ 이 포함된 것만 검사
 * @returns           위반 항목 문자열 배열 (repoRoot 기준 상대경로:라인:내용)
 */
function collectViolations(
  absDir: string,
  patterns: RegExp[],
  srcMainOnly = false,
): string[] {
  if (!fs.existsSync(absDir)) return []

  const violations: string[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue
        walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
      // *.d.ts 제외
      if (entry.name.endsWith('.d.ts')) continue

      const relPath = path.relative(repoRoot, fullPath)

      // 화이트리스트 경로 제외
      const isWhitelisted = WHITELIST_SUBPATHS.some((wl) =>
        relPath.startsWith(wl),
      )
      if (isWhitelisted) continue

      // services 는 src/main 경로만 검사
      if (srcMainOnly) {
        const normalized = relPath.replace(/\\/g, '/')
        if (!normalized.includes('/src/main/')) continue
      }

      let content: string
      try {
        content = fs.readFileSync(fullPath, 'utf8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        for (const pat of patterns) {
          if (pat.test(line)) {
            const display = relPath.replace(/\\/g, '/')
            violations.push(`${display}:${idx + 1}: ${line.trim()}`)
            break
          }
        }
      })
    }
  }

  walk(absDir)
  return violations
}

/**
 * SP-08-7 Notion API 런타임 금지 패턴
 * api.notion.com / Notion-Version 헤더 / @notionhq/client 패키지 / notion-sdk
 */
const NOTION_API_PATTERNS: RegExp[] = [
  /api\.notion\.com/,
  /Notion-Version/,
  /@notionhq\/client/,
  /notion-sdk/,
]

/**
 * Notion 환경변수 런타임 참조 금지 패턴
 * 환경변수 선언이 아닌 코드 내 runtime 참조 (process.env.* / System.getenv)
 */
const NOTION_ENV_PATTERNS: RegExp[] = [
  /process\.env\.NOTION_TOKEN/,
  /process\.env\.NOTION_API_KEY/,
  /process\.env\.NOTION_KEY/,
  /System\.getenv\s*\(\s*["']NOTION_TOKEN["']\s*\)/,
  /System\.getenv\s*\(\s*["']NOTION_API_KEY["']\s*\)/,
  /\$\{NOTION_TOKEN\}/,
  /\$\{NOTION_API_KEY\}/,
]

test.describe('SP-08-7 Notion Runtime Zero — QA 정적 RED Gate', () => {
  test('T1 clients/web 소스: Notion API 금지 패턴 미포함', () => {
    const dir = path.join(repoRoot, 'clients', 'web')
    const violations = collectViolations(dir, NOTION_API_PATTERNS, false)

    if (violations.length > 0) {
      console.error('[T1 VIOLATION] clients/web Notion API 패턴 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T1] clients/web 에서 Notion API 패턴 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  test('T2 clients/desktop/src 소스: Notion API 금지 패턴 미포함', () => {
    const dir = path.join(repoRoot, 'clients', 'desktop', 'src')
    const violations = collectViolations(dir, NOTION_API_PATTERNS, false)

    if (violations.length > 0) {
      console.error('[T2 VIOLATION] clients/desktop/src Notion API 패턴 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T2] clients/desktop/src 에서 Notion API 패턴 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  test('T3 clients/mobile-staff/src 소스: Notion API 금지 패턴 미포함', () => {
    const dir = path.join(repoRoot, 'clients', 'mobile-staff', 'src')
    const violations = collectViolations(dir, NOTION_API_PATTERNS, false)

    if (violations.length > 0) {
      console.error('[T3 VIOLATION] clients/mobile-staff/src Notion API 패턴 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T3] clients/mobile-staff/src 에서 Notion API 패턴 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  test('T4 services/*/src/main 소스: Notion API 금지 패턴 미포함', () => {
    const dir = path.join(repoRoot, 'services')
    const violations = collectViolations(dir, NOTION_API_PATTERNS, true)

    if (violations.length > 0) {
      console.error('[T4 VIOLATION] services/*/src/main Notion API 패턴 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T4] services/*/src/main 에서 Notion API 패턴 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  test('T5 전 영역: NOTION_TOKEN / NOTION_API_KEY 환경변수 코드 참조 미포함', () => {
    const scanTargets: Array<{ dir: string; srcMainOnly: boolean }> = [
      { dir: path.join(repoRoot, 'clients', 'web'), srcMainOnly: false },
      { dir: path.join(repoRoot, 'clients', 'desktop', 'src'), srcMainOnly: false },
      { dir: path.join(repoRoot, 'clients', 'mobile-staff', 'src'), srcMainOnly: false },
      { dir: path.join(repoRoot, 'services'), srcMainOnly: true },
    ]

    const allViolations: string[] = []
    for (const { dir, srcMainOnly } of scanTargets) {
      allViolations.push(...collectViolations(dir, NOTION_ENV_PATTERNS, srcMainOnly))
    }

    if (allViolations.length > 0) {
      console.error('[T5 VIOLATION] NOTION 환경변수 코드 참조 발견:')
      allViolations.forEach((v) => console.error('  ', v))
    }

    expect(
      allViolations,
      `[T5] NOTION 환경변수 코드 참조 ${allViolations.length}건 발견\n${allViolations.join('\n')}`,
    ).toHaveLength(0)
  })
})
