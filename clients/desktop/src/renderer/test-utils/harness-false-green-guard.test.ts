/**
 * 하네스 거짓 green 회귀 가드 (2026-07-26 배치).
 *
 * 이 배치가 닫은 4종(H-1 해시라우팅 · H-2 확정 증거 덮어쓰기 · H-4 순서 의존 타이밍 ·
 * H-5 soft-pass)은 전부 "고쳐 놓으면 다시 스며드는" 종류다. 원인이 개별 스펙에 있지
 * 않고 **작성 관습**에 있기 때문이다. 그래서 각 fix 를 되돌리면 즉시 RED 가 되는 가드를
 * 둔다 — fix 가 진짜인지(B6) 를 이 파일이 증명한다.
 *
 * 실행: clients/desktop 에서 `npm test` (CI frontend-desktop 잡).
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
/** clients/desktop/src/renderer/test-utils → 레포 루트 */
const REPO_ROOT = path.resolve(_dirname, '../../../../..')
const PLAYWRIGHT_DIR = path.resolve(REPO_ROOT, 'clients/desktop/playwright')
const DESKTOP_SRC = path.resolve(REPO_ROOT, 'clients/desktop/src')

/** 자기 자신은 패턴 문자열을 담고 있으므로 스캔 대상에서 제외한다. */
const SELF = path.resolve(_dirname, 'harness-false-green-guard.test.ts')

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '_local') continue
      out.push(...walk(full, filter))
    } else if (filter(full)) {
      out.push(full)
    }
  }
  return out
}

function rel(p: string): string {
  return path.relative(PLAYWRIGHT_DIR, p).replace(/\\/g, '/')
}

/** 블록/라인 주석 제거 — 주석 안의 설명 문구가 패턴에 걸리는 것을 막는다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** `(` 부터 짝이 맞는 `)` 까지의 인자 텍스트. */
function balancedArgs(src: string, openParenIndex: number): string {
  let depth = 0
  for (let i = openParenIndex; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return src.slice(openParenIndex + 1, i)
    }
  }
  return src.slice(openParenIndex + 1)
}

/** 파일 안에서 "쓰기" 호출(screenshot/writeFileSync/mkdirSync)의 인자에 등장하는 식별자. */
function collectWriteTargetIdentifiers(src: string): Set<string> {
  const names = new Set<string>()
  const writeCall = /(?:\.screenshot|writeFileSync|mkdirSync)\s*\(/g
  for (const m of src.matchAll(writeCall)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const args = balancedArgs(src, open)
    for (const id of args.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) names.add(id[0])
  }
  return names
}

/** `const/let NAME = <초기화식>` 선언 목록 (초기화식은 괄호 균형까지 이어붙인다). */
function collectDeclarations(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const lines = src.split('\n')
  const declStart = /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(.*)$/
  for (let i = 0; i < lines.length; i++) {
    const m = declStart.exec(lines[i] ?? '')
    if (!m) continue
    let body = m[2] ?? ''
    let depth = (body.match(/\(/g) ?? []).length - (body.match(/\)/g) ?? []).length
    let j = i
    while (depth > 0 && j + 1 < lines.length) {
      j++
      const line = lines[j] ?? ''
      body += '\n' + line
      depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length
    }
    out.push({ name: m[1] ?? '', body })
  }
  return out
}

/**
 * playwright.config.ts 의 testIgnore 와 같은 규칙으로 "mock 회귀 게이트 대상" 을 고른다.
 * (실서버/수동 전용 스펙은 CI 게이트가 아니므로 이 가드의 대상도 아니다.)
 */
const IGNORED_DIRS = ['manual', 'full-qa', 'audit', 'full-menu-contract']
function isMockGateFile(p: string): boolean {
  const r = rel(p)
  const segments = r.split('/')
  if (segments.some((s) => IGNORED_DIRS.includes(s))) return false
  if (segments.slice(0, -1).some((s) => s.endsWith('-real-qa'))) return false
  const base = segments[segments.length - 1] ?? ''
  if (base.endsWith('-real-qa.spec.ts')) return false
  return true
}

const ALL_PW_TS = walk(PLAYWRIGHT_DIR, (p) => p.endsWith('.ts'))
const MOCK_GATE_TS = ALL_PW_TS.filter(isMockGateFile)

// 스캔 대상이 실제로 잡혔는지부터 확인한다 — 경로가 어긋나 0건이면 이 가드 전체가
// 조용히 통과하는(=또 다른 거짓 green) 사고가 나기 때문이다.
describe('하네스 거짓 green 가드', () => {
  it('스캔 대상 파일이 실제로 수집된다 (경로 오류로 인한 빈 스캔 방지)', () => {
    expect(ALL_PW_TS.length, 'playwright 스펙을 하나도 못 찾았다 — 경로 확인').toBeGreaterThan(100)
    expect(MOCK_GATE_TS.length, 'mock 게이트 스펙을 하나도 못 찾았다 — 경로 확인').toBeGreaterThan(50)
  })

  /**
   * H-1 — 렌더러는 createHashRouter 다(routes/index.tsx). Vite SPA fallback 이 어떤 경로에도
   * index.html 을 주므로 `${BASE_URL}/sales/new` 는 200 을 받고도 해시가 비어 홈으로 낙착한다.
   */
  it('H-1: 앱 대상 goto 는 전부 해시 경로다 (${BASE_URL}/경로 형태 0건)', () => {
    const gotoBaseUrl = new RegExp('\\.goto\\(\\s*`\\$\\{BASE_URL\\}/(?!#)([A-Za-z0-9_\\-$]+)', 'g')
    const violations: string[] = []
    for (const file of ALL_PW_TS) {
      const src = fs.readFileSync(file, 'utf-8')
      for (const m of src.matchAll(gotoBaseUrl)) {
        violations.push(`${rel(file)} → \${BASE_URL}/${m[1]}...`)
      }
    }
    expect(
      violations,
      `해시 없는 경로 goto 발견 — 해시라우터에서 홈으로 낙착한다. \`\${BASE_URL}/#/경로\` 로 진입할 것:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * H-2 — 스펙 재실행이 docs/qa 의 커밋된 확정 증거 PNG 를 덮어쓰면 안 된다.
   * 캡처 경로는 support/qa-screenshot-dir.ts 의 resolveQaShotsDir 를 반드시 경유한다
   * (기본 <dir>/_local, 승격은 QA_SHOTS_DIR opt-in).
   */
  it('H-2: 캡처 목적지로 쓰이는 docs/qa 경로 상수는 전부 resolveQaShotsDir 를 경유한다', () => {
    const violations: string[] = []
    for (const file of MOCK_GATE_TS) {
      const src = stripComments(fs.readFileSync(file, 'utf-8'))
      // ① 이 파일에서 "쓰기" 호출의 인자에 등장하는 식별자를 모은다.
      const writeTargets = collectWriteTargetIdentifiers(src)
      // ② docs/qa 를 가리키는 선언 중, 쓰기 목적지로 쓰이는 것만 래핑을 강제한다.
      //    (읽기 전용 참조 — 예: 커밋된 확정 증거의 존재 여부 검사 — 는 래핑 대상이 아니다.)
      for (const decl of collectDeclarations(src)) {
        // `'../../../../docs/qa/<slug>'` 형태와 `path.join(root, 'docs', 'qa', …)` 형태를 모두 잡는다.
        const pointsAtDocsQa =
          decl.body.includes('docs/qa') || /['"]docs['"]\s*,\s*['"]qa['"]/.test(decl.body)
        if (!pointsAtDocsQa) continue
        if (!writeTargets.has(decl.name)) continue
        if (decl.body.includes('resolveQaShotsDir')) continue
        violations.push(`${rel(file)} → const ${decl.name}`)
      }
    }
    expect(
      violations,
      `docs/qa 커밋 증거로 직접 캡처하는 경로 상수 발견 — resolveQaShotsDir() 경유 필수:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * H-4 — `setTimeout(fn, 0)` 은 WHATWG 중첩 타이머 4ms 클램프 대상이라 실행 컨텍스트에
   * 따라 React 스케줄러 큐와 순서가 뒤집힌다(격리=RED / 전체=GREEN 또는 그 반대, #933 실측).
   * 타이밍 재현은 test-utils/flush.ts 의 flushZeroDelayTasks() 로 만든다.
   */
  it('H-4: 테스트 파일에 0ms setTimeout 타이밍 재현이 없다', () => {
    const testFiles = walk(
      DESKTOP_SRC,
      (p) => (p.endsWith('.test.ts') || p.endsWith('.test.tsx')) && path.resolve(p) !== SELF,
    )
    // 자기 자신이 매치되지 않도록 패턴을 조립한다.
    const zeroTimer = new RegExp('setTimeout\\(' + '[^,)]*' + ',\\s*0\\s*\\)', 'g')
    const violations: string[] = []
    for (const file of testFiles) {
      // 주석은 제외한다 — #933 fix 파일들은 "setTimeout(fn,0) 을 쓰지 않는 이유" 를
      // 한국어 주석으로 길게 설명하고 있어 본문 스캔에 그대로 걸린다.
      const src = stripComments(fs.readFileSync(file, 'utf-8'))
      for (const m of src.matchAll(zeroTimer)) {
        violations.push(`${path.relative(REPO_ROOT, file).replace(/\\/g, '/')} → ${m[0]}`)
      }
    }
    expect(
      violations,
      `0ms setTimeout 타이밍 재현 발견 — flushZeroDelayTasks() 를 쓸 것:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * H-5 — "대상을 못 찾으면 console.warn 하고 통과" 는 게이트가 아니다.
   * 아래 목록은 **이번 배치에서 닫지 못하고 범위 판단으로 이월한 파일들**이다.
   * 새 파일이 목록에 추가되는 것은 금지 — 줄이는 방향으로만 수정한다.
   */
  it('H-5: mock 게이트 스펙의 soft-pass(console.warn) 는 이월 목록을 넘지 않는다', () => {
    // 이월 사유는 docs/dev-reports 및 PR 보고 참조. 실제 화면 구현이 없어 hard assert 로
    // 바꾸면 RED 가 되는 스펙들이라 harness 배치 범위를 벗어난다.
    const CARRIED_OVER = new Set<string>([
      'slip-form-v20/slip-form-v20-matching.spec.ts',
      'dps-by-product/dps-by-product.spec.ts',
      'sidebar-disabled/sidebar-disabled.spec.ts',
    ])
    const found: string[] = []
    for (const file of MOCK_GATE_TS) {
      const src = fs.readFileSync(file, 'utf-8')
      if (src.includes('console.warn(')) found.push(rel(file))
    }
    const unexpected = found.filter((f) => !CARRIED_OVER.has(f))
    expect(
      unexpected,
      `새 soft-pass(console.warn) 가 mock 게이트에 추가됐다 — 못 찾으면 RED 가 계약이다:\n${unexpected.join('\n')}`,
    ).toEqual([])
  })
})
