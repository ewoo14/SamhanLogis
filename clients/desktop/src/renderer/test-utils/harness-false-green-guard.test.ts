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
const ALL_PW_SOURCES = walk(
  PLAYWRIGHT_DIR,
  (p) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(p),
)
const MOCK_GATE_TS = ALL_PW_TS.filter(isMockGateFile)

/**
 * H-1 재발(2026-07-26 1차 적대검증 A-1) — "렌더러는 항상 createHashRouter" 는 틀렸다.
 * routes/index.tsx:1726-1727 이 하네스별로 라우터를 가른다:
 *   const isWebDeploy = import.meta.env['VITE_PLATFORM'] === 'web'
 *   const createPlatformRouter = isWebDeploy ? createBrowserRouter : createHashRouter
 * · vite.config.ts(mock 게이트 + VITE_PLATFORM 미정의 real-qa 다수) → HashRouter → `#/경로` 가 정답.
 * · vite.web.config.ts(define 으로 VITE_PLATFORM='web' 고정) → BrowserRouter → 해시는 무시되고
 *   대시보드로 낙착 — 경로 그대로가 정답.
 * 둘 다 Vite SPA fallback 이 "틀린 쪽" 요청에도 200(index.html)을 주므로 조용히 홈 화면에서
 * 통과하는 게 이 함정의 핵심이다.
 *
 * 아래 WEB_DEPLOY_REAL_QA 는 vite.web.config.ts(BrowserRouter) 하네스를 쓴다고 각 파일 자체
 * 근거(포트 상속·config 상속·npm 실행 커맨드 주석·845-ds2 는 docs/qa 커밋 스크린샷)로 확정된
 * real-qa 스펙 19개다(PR #938 fix 라운드 — 1차 적대검증 A-1 블라스트 반경 정정). 그 외 전부
 * (mock 게이트 + 나머지 real-qa 다수)는 HashRouter 하네스로 실행되는 것으로 이미 검증돼 있다
 * (H-1a). 새 real-qa 스펙을 vite.web.config.ts 로 작성했다면 이 목록에 추가할 것 — 반대로
 * 하네스 없이 이 목록에서 빼면 안 된다(A-1 재발과 동일 사고).
 */
const WEB_DEPLOY_REAL_QA = new Set<string>([
  '773-resolvebylabel-bulk-real-qa/773-bulk-real-qa.spec.ts',
  '773-s4-daily-closing-render-real-qa/773-s4-real-qa.spec.ts',
  '773-s5-purchase-render-real-qa/773-s5-real-qa.spec.ts',
  '809-price-memory-real-qa/price-memory-r2-live-real-qa.spec.ts',
  '809-price-memory-real-qa/price-memory-r8-adversarial-real-qa.spec.ts',
  '845-ds2-document-template-real-qa/845-ds2-real-qa.spec.ts',
  '869-ds4-real-qa/869-ds4-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r1-band-overflow-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r2-r6-r7-detail-geometry-style-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r4-header-band-width-basis-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r5-activation-gate-warning-real-qa.spec.ts',
  '869-ds4-real-qa/luna-r6-red-real-qa.spec.ts',
  '902-slip-line-ecount-real-qa/902-amount-input-real-qa.spec.ts',
  '902-slip-line-ecount-real-qa/902-amount-policy-real-qa.spec.ts',
  '902-slip-line-ecount-real-qa/902-d3-roundtrip-real-qa.spec.ts',
  '902-slip-line-ecount-real-qa/902-slip-line-ecount-real-qa.spec.ts',
  '910-app-client-identity-real-qa/910-identity-real-qa.spec.ts',
  '924-lookup-unavailable-real-qa/924-lookup-unavailable-real-qa.spec.ts',
])

// 스캔 대상이 실제로 잡혔는지부터 확인한다 — 경로가 어긋나 0건이면 이 가드 전체가
// 조용히 통과하는(=또 다른 거짓 green) 사고가 나기 때문이다.
describe('하네스 거짓 green 가드', () => {
  it('스캔 대상 파일이 실제로 수집된다 (경로 오류로 인한 빈 스캔 방지)', () => {
    expect(ALL_PW_TS.length, 'playwright 스펙을 하나도 못 찾았다 — 경로 확인').toBeGreaterThan(100)
    expect(MOCK_GATE_TS.length, 'mock 게이트 스펙을 하나도 못 찾았다 — 경로 확인').toBeGreaterThan(50)
  })

  it('WEB_DEPLOY_REAL_QA 목록의 파일이 전부 실존한다 (이름 변경/삭제로 조용히 빠지는 사고 방지)', () => {
    const allRel = new Set(ALL_PW_TS.map(rel))
    const missing = [...WEB_DEPLOY_REAL_QA].filter((f) => !allRel.has(f))
    expect(
      missing,
      `WEB_DEPLOY_REAL_QA 에 등재된 파일을 찾지 못했다(이름 변경/이동/삭제?) — 목록을 갱신할 것:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  /**
   * H-1a — HashRouter 하네스(mock 게이트 전부 + WEB_DEPLOY_REAL_QA 에 없는 real-qa) 대상 goto 는
   * 전부 해시 경로여야 한다. `${BASE_URL}/sales/new` 는 200 을 받고도 해시가 비어 홈으로 낙착한다.
   *
   * 🚨 커버리지 한계(정직 신고 — 1차 적대검증 B-4) — 이 정규식은 `.goto(\`${BASE_URL}/...\`)` 템플릿
   * 리터럴을 **직접** 쓴 경우만 잡는다. 아래는 이 가드가 못 잡는다(레포에 실제로 존재하는 형태):
   *   · `buildUrl(...)` 헬퍼 반환값을 넘기는 goto(예: admin-hr, sidebar-disabled, audit,
   *     development-menu-dev1~dev3, version-management-v1b — 전부 HashRouter 하네스 대상이고
   *     함수 본문이 이미 `#` 를 반환해 현재는 정답이지만 이 가드가 검증하지 않는다)
   *   · `` `${BASE_URL}${route}` `` (중간에 `/` 리터럴이 없는 연결) · `BASE_URL + '/x'` 문자열 연결
   *   · `goto(변수)` — 리터럴이 아닌 변수/식을 그대로 넘기는 호출
   *   · BASE_URL 을 거치지 않는 하드코딩 절대 URL
   * 이 갭을 닫는 것은 별도 배치다(가드를 일반적인 정적 URL 흐름분석기로 넓히는 작업 — 위험 대비
   * 이득이 이 fix 라운드 범위를 벗어난다). 여기서는 "못 잡으면서 잡는 척" 하지 않도록 이 사실을
   * 명시한다.
   */
  it('H-1a: 해시라우터 하네스 대상 goto 는 전부 해시 경로다 (${BASE_URL}/경로 형태 0건)', () => {
    const gotoBaseUrl = new RegExp('\\.goto\\(\\s*`\\$\\{BASE_URL\\}/(?!#)([A-Za-z0-9_\\-$]+)', 'g')
    const violations: string[] = []
    for (const file of ALL_PW_TS) {
      if (WEB_DEPLOY_REAL_QA.has(rel(file))) continue
      const src = fs.readFileSync(file, 'utf-8')
      for (const m of src.matchAll(gotoBaseUrl)) {
        violations.push(`${rel(file)} → \${BASE_URL}/${m[1]}...`)
      }
    }
    expect(
      violations,
      `해시 없는 경로 goto 발견 — 이 하네스는 해시라우터라 홈으로 낙착한다. \`\${BASE_URL}/#/경로\` 로 진입할 것:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * H-1b — WEB_DEPLOY_REAL_QA(vite.web.config.ts, BrowserRouter 확정)는 반대다. 해시를 쓰면
   * 해시가 무시되고 대시보드로 낙착한다(1차 적대검증 A-1 실측: `/#/accounting/bank-transactions`
   * → heading:"대시보드"). 경로 그대로가 정답이므로 해시 goto 는 여기서 위반이다.
   */
  it('H-1b: BrowserRouter 하네스로 확정된 real-qa 는 해시 경로 goto 를 쓰지 않는다', () => {
    const gotoHash = new RegExp('\\.goto\\(\\s*`\\$\\{BASE_URL\\}/#', 'g')
    const violations: string[] = []
    for (const file of ALL_PW_TS) {
      const r = rel(file)
      if (!WEB_DEPLOY_REAL_QA.has(r)) continue
      const src = fs.readFileSync(file, 'utf-8')
      for (const _m of src.matchAll(gotoHash)) {
        violations.push(r)
      }
    }
    expect(
      violations,
      `이 하네스는 BrowserRouter(vite.web.config.ts) — 해시가 무시되고 대시보드로 낙착한다. 경로로 이동할 것:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * H-2 — 스펙 재실행이 커밋된 QA 확정 증거를 덮어쓰면 안 된다.
   * 캡처 경로는 support/qa-screenshot-dir.ts 의 resolveQaShotsDir 를 반드시 경유한다
   * (기본 <dir>/_local, 승격은 QA_SHOTS_DIR opt-in).
   */
  it('H-2: 캡처 목적지로 쓰이는 docs/qa 경로 상수는 전부 resolveQaShotsDir 를 경유한다', () => {
    const violations: string[] = []
    for (const file of ALL_PW_SOURCES) {
      const src = stripComments(fs.readFileSync(file, 'utf-8'))
      // ① 이 파일에서 "쓰기" 호출의 인자에 등장하는 식별자를 모은다.
      const writeTargets = collectWriteTargetIdentifiers(src)
      // ② docs/qa 또는 playwright/**/screenshots 를 가리키는 선언 중, 쓰기 목적지로
      // 쓰이는 것만 래핑을 강제한다.
      //    (읽기 전용 참조 — 예: 커밋된 확정 증거의 존재 여부 검사 — 는 래핑 대상이 아니다.)
      for (const decl of collectDeclarations(src)) {
        // `'../../../../docs/qa/<slug>'` 형태와 `path.join(root, 'docs', 'qa', …)` 형태를 모두 잡는다.
        const pointsAtQa =
          decl.body.includes('docs/qa') ||
          /['"]docs['"]\s*,\s*['"]qa['"]/.test(decl.body) ||
          /screenshots/i.test(decl.body)
        if (!pointsAtQa) continue
        if (!writeTargets.has(decl.name)) continue
        if (decl.body.includes('resolveQaShotsDir')) continue
        violations.push(`${rel(file)} → const ${decl.name}`)
      }
    }
    expect(
      violations,
      `커밋 QA 증거로 직접 쓰는 경로 상수 발견 — resolveQaShotsDir() 경유 필수:\n${violations.join('\n')}`,
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
   *
   * 2026-07-26 R2: slip-form-v20-matching.spec.ts 는 셀렉터 전면 교정(aria-label/실
   * data-testid 기반) + soft-pass 전량 제거로 이 목록에서 뺀다 — PM 정정(필드는 실제
   * DOM 에 있으나 셀렉터가 틀렸다) 반영, TC-V1~V5 전부 하드 단정으로 재작성.
   */
  it('H-5: mock 게이트 스펙의 soft-pass(console.warn) 는 이월 목록을 넘지 않는다', () => {
    // 이월 사유는 docs/dev-reports 및 PR 보고 참조. 실제 화면 구현이 없어 hard assert 로
    // 바꾸면 RED 가 되는 스펙들이라 harness 배치 범위를 벗어난다.
    const CARRIED_OVER = new Set<string>([
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
