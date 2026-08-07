/**
 * SP-08-8 자격 평문 비공개 가드 — QA Playwright RED Gate
 *
 * 목적: 자격 증명 평문(NOTION_TOKEN / AWS Access Key / OpenAI sk- / JWT 실값 /
 *       Google Sheet ID 실값 등)이 docs / fixture / tools 산출물 문서에
 *       잔존하지 않음을 정적 fs 재귀 탐색 + 정규식 패턴 검사로 잠금한다.
 *
 * T1 docs/qa/sp-08-* 파일         — 평문 secret 미포함 (NOTION_TOKEN/AKIA/sk-/실값 JWT/Sheet ID 등)
 * T2 docs/dev-reports/sp-08-*.md  — 동일
 * T3 docs/operational-validation/ — 동일
 * T4 clients/desktop/playwright/ fixture — 동일
 * T5 tools/operational-validation/ placeholder 분리 — 실값 미포함 확인
 *
 * 화이트리스트 (검사 제외):
 *   - clients/desktop/playwright/sp-08-8-credential-plaintext-guard/   → 본 테스트 파일 자체 (not.toMatch 단언)
 *   - node_modules / build / dist / .gradle / *.d.ts                    → 빌드 산출물
 *
 * 외부 의존 없음 — Node.js 내장 fs 모듈만 사용.
 */

import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

const DOC_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx',
  '.ps1', '.sh',
])

const SKIP_DIR_NAMES = new Set([
  'node_modules', 'build', 'dist', '.gradle', 'out',
  'playwright-report', 'test-results',
])

/**
 * 본 spec 파일 자신을 화이트리스트에 등록 (not.toMatch 단언 코드가 금지 패턴 문자열을 포함하므로).
 */
const WHITELIST_SUBPATHS = [
  path.join('clients', 'desktop', 'playwright', 'sp-08-8-credential-plaintext-guard'),
]

// ---------------------------------------------------------------------------
// 자격 증명 평문 금지 패턴 정의
// ---------------------------------------------------------------------------

/**
 * NOTION_TOKEN 실값 패턴:
 *   - "secret_" 로 시작하는 32자 이상 영숫자 문자열 (Notion integration token 포맷)
 *   - 단순 변수명 참조("NOTION_TOKEN", "${NOTION_TOKEN}" 등) 는 허용 — 실값 형태만 금지
 */
const NOTION_TOKEN_VALUE_PATTERN: RegExp[] = [
  /secret_[A-Za-z0-9]{30,}/,
]

/**
 * AWS Access Key ID 실값 패턴:
 *   - "AKIA" 또는 "ASIA" 로 시작하는 20자 대문자+숫자 문자열
 *   - 단순 주석 설명 문자열("AKIA..." 형태 예시 제외) 은 허용 — 실제 키 길이로 제한
 */
const AWS_KEY_PATTERNS: RegExp[] = [
  /AKIA[A-Z0-9]{16}/,
  /ASIA[A-Z0-9]{16}/,
]

/**
 * OpenAI API Key 실값 패턴:
 *   - "sk-" 로 시작하는 40자 이상 영숫자+하이픈 문자열
 */
const OPENAI_KEY_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9\-]{40,}/,
]

/**
 * Google Sheet ID 실값 패턴:
 *   - Google Sheets URL 내 /d/{spreadsheetId}/ 형태의 44자 영숫자+하이픈+언더스코어 ID
 *   - docs 문서에 URL 예시로 spreadsheets.google.com/d/<실ID> 가 포함되면 금지
 */
const GOOGLE_SHEET_ID_PATTERNS: RegExp[] = [
  /spreadsheets\.google\.com\/d\/[A-Za-z0-9_\-]{40,}/,
]

/**
 * JWT Bearer 토큰 실값 패턴:
 *   - "Bearer eyJ" 형태로 시작하는 JWT (3-segment base64url 최소 60자 이상)
 *   - 코드 주석이나 문서에 실 JWT를 하드코딩하는 경우만 차단
 */
const JWT_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]{20,}/,
  /eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/,
]

/**
 * 종합 평문 자격 증명 금지 패턴 (전 case 공통 사용)
 */
const ALL_CREDENTIAL_PATTERNS: RegExp[] = [
  ...NOTION_TOKEN_VALUE_PATTERN,
  ...AWS_KEY_PATTERNS,
  ...OPENAI_KEY_PATTERNS,
  ...GOOGLE_SHEET_ID_PATTERNS,
  ...JWT_VALUE_PATTERNS,
]

// ---------------------------------------------------------------------------
// 헬퍼: 파일 재귀 탐색 + 위반 수집
// ---------------------------------------------------------------------------

/**
 * 대상 디렉토리를 재귀 탐색하여 금지 패턴과 일치하는 행을 반환한다.
 *
 * @param absDir     절대 경로 (탐색 루트)
 * @param patterns   금지 정규식 목록
 * @param extensions 검사할 파일 확장자 Set (undefined 이면 DOC_EXTENSIONS 전체 사용)
 * @returns          위반 항목 문자열 배열 (repoRoot 기준 상대경로:라인번호: 내용)
 */
function collectViolations(
  absDir: string,
  patterns: RegExp[],
  extensions?: Set<string>,
): string[] {
  if (!fs.existsSync(absDir)) return []

  const ext = extensions ?? DOC_EXTENSIONS
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
      if (!ext.has(path.extname(entry.name))) continue
      if (entry.name.endsWith('.d.ts')) continue

      const relPath = path.relative(repoRoot, fullPath)

      const isWhitelisted = WHITELIST_SUBPATHS.some((wl) =>
        relPath.startsWith(wl),
      )
      if (isWhitelisted) continue

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
            violations.push(`${display}:${idx + 1}: ${line.trim().substring(0, 120)}`)
            break
          }
        }
      })
    }
  }

  walk(absDir)
  return violations
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

test.describe('SP-08-8 자격 평문 비공개 가드 — QA 정적 RED Gate', () => {
  /**
   * T1: docs/qa/sp-08-* 디렉토리 내 모든 .md / .txt 파일에
   *     NOTION_TOKEN 실값 / AWS Access Key / OpenAI sk- / JWT 실값 / Google Sheet ID 가 없음을 확인한다.
   *
   * 회귀 방지 근거: QA 리뷰 문서에 실 자격 증명이 삽입되는 경우 GitHub 공개 저장소에서
   *                 GitGuardian 탐지 + 즉시 유출 위험.
   */
  test('T1 docs/qa/sp-08-* — 평문 자격 증명 미포함', () => {
    const qaDir = path.join(repoRoot, 'docs', 'qa')
    if (!fs.existsSync(qaDir)) {
      // docs/qa 디렉토리 자체가 없으면 검사 대상 없음 — PASS
      return
    }

    // sp-08-* 패턴 디렉토리만 검사
    const sp08Dirs: string[] = []
    try {
      const entries = fs.readdirSync(qaDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && /^sp-08-/.test(entry.name)) {
          sp08Dirs.push(path.join(qaDir, entry.name))
        }
      }
    } catch {
      return
    }

    const allViolations: string[] = []
    const docOnly = new Set(['.md', '.txt'])
    for (const dir of sp08Dirs) {
      allViolations.push(...collectViolations(dir, ALL_CREDENTIAL_PATTERNS, docOnly))
    }

    if (allViolations.length > 0) {
      console.error('[T1 VIOLATION] docs/qa/sp-08-* 평문 자격 증명 발견:')
      allViolations.forEach((v) => console.error('  ', v))
    }

    expect(
      allViolations,
      `[T1] docs/qa/sp-08-* 에서 평문 자격 증명 ${allViolations.length}건 발견\n${allViolations.join('\n')}`,
    ).toHaveLength(0)
  })

  /**
   * T2: docs/dev-reports/sp-08-*.md 파일에 평문 자격 증명이 없음을 확인한다.
   *
   * 회귀 방지 근거: dev-report 에 curl 예시 등으로 실 Bearer 토큰이 삽입되는 패턴 차단.
   */
  test('T2 docs/dev-reports/sp-08-*.md — 평문 자격 증명 미포함', () => {
    const reportsDir = path.join(repoRoot, 'docs', 'dev-reports')
    if (!fs.existsSync(reportsDir)) return

    // sp-08-*.md 파일만 직접 수집
    const violations: string[] = []
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(reportsDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!/^sp-08-.*\.md$/.test(entry.name)) continue

      const fullPath = path.join(reportsDir, entry.name)
      const relPath = path.relative(repoRoot, fullPath).replace(/\\/g, '/')

      let content: string
      try {
        content = fs.readFileSync(fullPath, 'utf8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        for (const pat of ALL_CREDENTIAL_PATTERNS) {
          if (pat.test(line)) {
            violations.push(`${relPath}:${idx + 1}: ${line.trim().substring(0, 120)}`)
            break
          }
        }
      })
    }

    if (violations.length > 0) {
      console.error('[T2 VIOLATION] docs/dev-reports/sp-08-*.md 평문 자격 증명 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T2] docs/dev-reports/sp-08-*.md 에서 평문 자격 증명 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  /**
   * T3: docs/operational-validation/ 내 모든 .md 파일에 평문 자격 증명이 없음을 확인한다.
   *
   * 회귀 방지 근거: 운영 검증 가이드 문서에 실 API key 가 예시로 포함되는 패턴 차단.
   */
  test('T3 docs/operational-validation/ — 평문 자격 증명 미포함', () => {
    const opValDir = path.join(repoRoot, 'docs', 'operational-validation')
    const docOnly = new Set(['.md', '.txt'])
    const violations = collectViolations(opValDir, ALL_CREDENTIAL_PATTERNS, docOnly)

    if (violations.length > 0) {
      console.error('[T3 VIOLATION] docs/operational-validation/ 평문 자격 증명 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T3] docs/operational-validation/ 에서 평문 자격 증명 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  /**
   * T4: clients/desktop/playwright/ 디렉토리 내 fixture / helper 파일에
   *     평문 자격 증명이 없음을 확인한다.
   *
   * 화이트리스트: 본 spec 파일 자체(sp-08-8-credential-plaintext-guard/)는 제외.
   * 회귀 방지 근거: Playwright fixture 에 hardcoded bearer token / AWS key 삽입 차단.
   */
  test('T4 clients/desktop/playwright/ fixture — 평문 자격 증명 미포함', () => {
    const playwrightDir = path.join(repoRoot, 'clients', 'desktop', 'playwright')
    const violations = collectViolations(playwrightDir, ALL_CREDENTIAL_PATTERNS)

    if (violations.length > 0) {
      console.error('[T4 VIOLATION] clients/desktop/playwright/ 평문 자격 증명 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T4] clients/desktop/playwright/ 에서 평문 자격 증명 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  /**
   * T5: tools/operational-validation/ 스크립트에 평문 실값 자격 증명이 없음을 확인한다.
   *
   * 허용 패턴: $Password = $env:QA_MASTER_PASSWORD 같은 OrgChartSeeder seed 비밀번호는
   *            AWS key / OpenAI key / Notion token / JWT 실값에 해당하지 않으므로 패턴 미포함.
   * 회귀 방지 근거: run-smoke-tests.ps1 / import-notion-csv.ps1 에
   *                 AWS credential 또는 Notion integration token 실값 삽입 차단.
   */
  test('T5 tools/operational-validation/ — 평문 자격 증명(실값) 미포함', () => {
    const toolsDir = path.join(repoRoot, 'tools', 'operational-validation')
    const scriptExt = new Set(['.ps1', '.sh', '.js', '.ts', '.py'])
    const violations = collectViolations(toolsDir, ALL_CREDENTIAL_PATTERNS, scriptExt)

    if (violations.length > 0) {
      console.error('[T5 VIOLATION] tools/operational-validation/ 평문 자격 증명 발견:')
      violations.forEach((v) => console.error('  ', v))
    }

    expect(
      violations,
      `[T5] tools/operational-validation/ 에서 평문 자격 증명 ${violations.length}건 발견\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })
})
