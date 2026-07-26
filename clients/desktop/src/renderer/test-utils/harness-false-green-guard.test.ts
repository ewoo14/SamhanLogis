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
/** G3/G5(2026-07-26 재수렴 라운드) — 가드 관할을 clients/desktop/playwright 밖으로 넓힌다. */
const DESKTOP_SCRIPTS = path.resolve(REPO_ROOT, 'clients/desktop/scripts')
/** G3 — clients/** 와 루트 scripts/ 의 캡처 목적지도 커밋 증거를 덮어쓰면 안 된다. */
const G3_ROOTS = [
  path.resolve(REPO_ROOT, 'clients/desktop/scripts'),
  path.resolve(REPO_ROOT, 'clients/desktop'), // 루트 산개 스크립트(qa-formula-f1-*.mjs) — 비재귀
  path.resolve(REPO_ROOT, 'clients/mobile/scripts'),
  path.resolve(REPO_ROOT, 'clients/mobile-staff/scripts'),
  path.resolve(REPO_ROOT, 'clients/web/estimate-app/scripts'),
  path.resolve(REPO_ROOT, 'clients/web/order-app/scripts'),
  path.resolve(REPO_ROOT, 'scripts'),
]
function walkG3Sources(): string[] {
  const out: string[] = []
  for (const root of G3_ROOTS) {
    const shallow = root === path.resolve(REPO_ROOT, 'clients/desktop')
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!shallow && entry.isDirectory()) continue // 하위 client 앱 소스까지 재귀하지 않는다
      if (entry.isDirectory()) continue
      const full = path.join(root, entry.name)
      if (/\.(?:cjs|mjs|js)$/.test(entry.name) && !full.includes(`${path.sep}lib${path.sep}`)) out.push(full)
    }
  }
  return out
}

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

/**
 * 블록/라인 주석 제거 — 문자 단위 상태기계로 처리한다.
 *
 * 2026-07-26 재수렴 라운드 G1 — 기존 2-pass 정규식(블록 먼저 제거 → 라인 제거)은 원문
 * 텍스트를 그대로 스캔하므로 "`//` 라인주석 안에 등장하는 `/*` 시퀀스"(예: 주석 문구에
 * `docs/qa/**` 처럼 별표가 연속되는 경로 표기)를 블록주석 시작으로 오인했다. 그러면
 * 그 뒤 가장 먼저 나오는 아무 `*​/`(다음 JSDoc 블록 등)까지 사이의 실 코드가 통째로
 * 삭제되어, 그 안에 있는 캡처 경로 선언이 가드 시야에서 사라졌다(실측 삭제 코드줄
 * 1,426 — 920-codef-scope-lock-real-qa.spec.ts 등). 문자열/템플릿 리터럴 내부의
 * `//`·`/*` 도 주석으로 오인하지 않는다. 중첩 템플릿 보간(`` `${ `x` }` ``) 안의 주석은
 * 다루지 않는다 — 이 저장소의 실 위반 파일 어디에도 그 형태가 없다(정적 근사 한계).
 */
function stripComments(src: string): string {
  let out = ''
  let mode: 'code' | 'line' | 'block' | 'str' | 'tmpl' = 'code'
  let quote = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? ''
    const c2 = src[i + 1] ?? ''
    if (mode === 'line') {
      if (c === '\n') { out += c; mode = 'code' }
      continue
    }
    if (mode === 'block') {
      if (c === '*' && c2 === '/') { i++; mode = 'code' }
      continue
    }
    if (mode === 'str' || mode === 'tmpl') {
      out += c
      if (c === '\\') { out += c2; i++; continue }
      if ((mode === 'str' && c === quote) || (mode === 'tmpl' && c === '`')) mode = 'code'
      continue
    }
    // mode === 'code'
    if (c === '/' && c2 === '/' && src[i - 1] !== ':') { mode = 'line'; i++; continue }
    if (c === '/' && c2 === '*') { mode = 'block'; i++; continue }
    if (c === '"' || c === "'") { mode = 'str'; quote = c; out += c; continue }
    if (c === '`') { mode = 'tmpl'; out += c; continue }
    out += c
  }
  return out
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

/**
 * 파일 안에서 "쓰기" 호출의 인자에 등장하는 식별자.
 *
 * 2026-07-26 재수렴 라운드 G1 — 두 가지를 확장했다:
 *  ① 대상 호출 3종(`.screenshot`/`writeFileSync`/`mkdirSync`)뿐이었던 정규식에
 *     `appendFileSync`(로그) · `.pdf`(PDF 저장) · `.saveAs`(다운로드) 를 추가한다
 *     (트리 실측: appendFileSync 5건 · page.pdf({path}) 58건 · saveAs() 10건).
 *  ② `decls` 를 받아 1홉(이상) 간접을 추적한다 — 쓰기 호출에 직접 등장하는 식별자가
 *     그 자체로 지역 `const/let` 선언이면, 그 선언의 초기화식에 나오는 식별자도
 *     전이적으로(fixed-point) 합류시킨다. 예:
 *       const SCREENSHOT_DIR = path.resolve(..., 'docs/qa/...')
 *       const filePath = path.join(SCREENSHOT_DIR, `SUPP-${name}.png`)
 *       await page.screenshot({ path: filePath })
 *     기존 코드는 `.screenshot()` 인자 텍스트만 봐서 `filePath` 까지만 잡고
 *     `SCREENSHOT_DIR` 를 놓쳤다(1홉 간접 실측: print-supplement-real-qa.spec.ts).
 *     템플릿 리터럴 보간(`` `${OUT}/...` ``)도 동일 메커니즘으로 잡힌다(실측:
 *     partner-restore-qa/capture.mjs).
 */
function collectWriteTargetIdentifiers(
  src: string,
  decls: { name: string; body: string }[],
): Set<string> {
  const names = new Set<string>()
  const writeCall = /(?:\.screenshot|\.pdf|writeFileSync|appendFileSync|mkdirSync|\.saveAs)\s*\(/g
  for (const m of src.matchAll(writeCall)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const args = balancedArgs(src, open)
    for (const id of args.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) names.add(id[0])
  }
  // 지역변수 간접 — 전이적 폐포(transitive closure). names 는 단조 증가만 하므로 종료된다.
  // 단, 선언 자체가 이미 resolveQaShotsDir(...) 로 래핑됐다면 그 인자(원본 커밋 경로)까지
  // 거슬러 올라가지 않는다 — 그 인자가 무엇이든 resolveQaShotsDir 가 이미 안전하게
  // 만들고, "안전한 이름"(예: QA_DIR)만 실제로 쓰기 호출에 쓰이기 때문이다. 거슬러 올라가면
  // `const QA_DIR = resolveQaShotsDir(COMMITTED_QA_DIR)` 의 COMMITTED_QA_DIR 까지 오탐으로
  // 잡힌다(slip-form-v20-matching.spec.ts 실측 — 이미 올바르게 래핑된 파일의 거짓 위반).
  let changed = true
  while (changed) {
    changed = false
    for (const decl of decls) {
      if (!names.has(decl.name)) continue
      if (decl.body.includes('resolveQaShotsDir')) continue
      for (const id of decl.body.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        if (!names.has(id[0])) { names.add(id[0]); changed = true }
      }
    }
  }
  return names
}

/**
 * `const/let NAME = <초기화식>` 선언 목록.
 *
 * 2026-07-26 재수렴 라운드 G1 — 기존 코드는 괄호 `()` 불균형이 있을 때만 다음 줄을
 * 이어붙였다. 그런데 실 위반 파일들의 다음줄-연속 초기화식은 괄호 불균형 없이
 * 연산자(`??`/`?`/`:`)로만 이어진다:
 *   const SHOT_DIR = process.env['AUDIT_SHOT_DIR']       // 대괄호는 세지 않음 → depth 0
 *     ?? join(process.cwd(), ..., 'docs', 'qa', '...')   // 다음 줄이 `??` 로 시작
 *   const SHOTS = process.env['AUDIT_SHOT_DIR']          // depth 0
 *     ? path.resolve(...)                                // 다음 줄이 `?` 로 시작(삼항)
 *     : path.resolve('../../docs/qa/choreb-opus-b')
 * 그래서 depth 기반 연속에 더해 "현재 줄이 연산자로 끝나는가" · "다음 줄이 연산자로
 * 시작하는가"를 함께 본다. 괄호/대괄호/중괄호를 전부 depth 에 포함해 다음 줄 계속
 * 여부에도 반영한다. (한계: 문자열 리터럴 안의 괄호류 문자는 구분하지 않는다 — 이
 * 저장소의 실 위반 형태에는 없는 조합이라 정적 근사로 남긴다.)
 */
function collectDeclarations(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const lines = src.split('\n')
  const declStart = /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(.*)$/
  const bracketDepth = (s: string) => (s.match(/[([{]/g) ?? []).length - (s.match(/[)\]}]/g) ?? []).length
  const endsWithOperator = /(?:\?\?|\|\||&&|[?:+.]|=>)\s*$/
  const startsWithOperator = /^(?:\?\?|\?|:|\|\||&&|[.+])/
  for (let i = 0; i < lines.length; i++) {
    const m = declStart.exec(lines[i] ?? '')
    if (!m) continue
    let body = m[2] ?? ''
    let depth = bracketDepth(body)
    let j = i
    while (j + 1 < lines.length) {
      const curTrim = (lines[j] ?? '').trim()
      const nextTrim = (lines[j + 1] ?? '').trim()
      // 선언 줄이 `=` 뒤에 아무것도 남기지 않는 형태(초기화식 전체가 다음 줄부터 시작 —
      // 예: `const SCREENSHOT_DIR =\n  process.env['QA_SHOTS'] ??\n  path.resolve(...)`,
      // external-carriers-real-qa.spec.ts 실측)는 대괄호 균형·연산자 신호 둘 다 없어
      // 별도로 강제 계속해야 한다.
      const continues = depth > 0 || body.trim() === '' || endsWithOperator.test(curTrim) || startsWithOperator.test(nextTrim)
      if (!continues) break
      j++
      const line = lines[j] ?? ''
      body += '\n' + line
      depth += bracketDepth(line)
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
 * real-qa 스펙 22개다(PR #938 fix 라운드 — 1차 적대검증 A-1 블라스트 반경 정정 19개 +
 * 2026-07-26 재수렴 라운드 G6 에서 자기진술("BrowserRouter") vs 미등재 불일치로 찾은 3개:
 * 825-s4-chip-real-qa·877-opus-review-real-qa(둘 다 PM 1차 적대검증 원 지적)·
 * 832-mock-parity-real-qa(같은 grep 으로 이번에 추가 발견)). 그 외 전부(mock 게이트 +
 * 나머지 real-qa 다수)는 HashRouter 하네스로 실행되는 것으로 이미 검증돼 있다(H-1a). 새
 * real-qa 스펙을 vite.web.config.ts 로 작성했다면 이 목록에 추가할 것 — 반대로 하네스
 * 없이 이 목록에서 빼면 안 된다(A-1 재발과 동일 사고). G6 테스트가 "BrowserRouter" 자기
 * 진술 파일의 등재 누락을 잡아주므로, 새 파일도 그 문구를 쓰면 자동으로 강제된다.
 */
const WEB_DEPLOY_REAL_QA = new Set<string>([
  '773-resolvebylabel-bulk-real-qa/773-bulk-real-qa.spec.ts',
  '773-s4-daily-closing-render-real-qa/773-s4-real-qa.spec.ts',
  '773-s5-purchase-render-real-qa/773-s5-real-qa.spec.ts',
  '809-price-memory-real-qa/price-memory-r2-live-real-qa.spec.ts',
  '809-price-memory-real-qa/price-memory-r8-adversarial-real-qa.spec.ts',
  '825-s4-chip-real-qa/825-s4-chip-real-qa.spec.ts',
  '832-mock-parity-real-qa/832-mock-parity-real-qa.spec.ts',
  '845-ds2-document-template-real-qa/845-ds2-real-qa.spec.ts',
  '869-ds4-real-qa/869-ds4-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r1-band-overflow-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r2-r6-r7-detail-geometry-style-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r4-header-band-width-basis-real-qa.spec.ts',
  '869-ds4-real-qa/ds4-r5-activation-gate-warning-real-qa.spec.ts',
  '869-ds4-real-qa/luna-r6-red-real-qa.spec.ts',
  '877-opus-review-real-qa/877-opus-review-real-qa.spec.ts',
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

  /**
   * G6 (2026-07-26 재수렴 라운드) — 목록이 실제 모집단을 덮는지는 파일 자신의 진술과
   * 대조해야 안다. `825-s4-chip-real-qa`·`877-opus-review-real-qa` 는 각각 goto 헬퍼
   * 주석에 "앱은 BrowserRouter(history) 기반"이라고 스스로 밝히면서도 WEB_DEPLOY_REAL_QA
   * 에는 없었다 — H-1a 는 `${BASE_URL}${route}`(변수 연결, 리터럴 `/` 없음)를 원래도
   * 못 잡는 갭이라 이 두 파일을 해시형으로 "고쳐도" H-1a/H-1b 모두 GREEN 을 유지했다
   * (교정이 목록 미등재를 못 드러낸다). 같은 grep 으로 `832-mock-parity-real-qa` 도
   * 동일 진술("웹 렌더러는 createBrowserRouter")을 하면서 미등재였다(이번 라운드에서
   * 추가로 발견 — 이 파일은 goto 가 bare `${BASE_URL}/` 하나뿐이라 H-1a/H-1b 어느 쪽도
   * 오늘은 차이를 못 느끼지만, 향후 경로 goto 가 추가되면 즉시 같은 함정이 재발한다).
   */
  it('G6: 파일이 스스로 BrowserRouter 하네스라고 밝히면 WEB_DEPLOY_REAL_QA 에도 등재돼 있다', () => {
    const missing: string[] = []
    for (const file of ALL_PW_TS) {
      const r = rel(file)
      if (WEB_DEPLOY_REAL_QA.has(r)) continue
      const src = fs.readFileSync(file, 'utf-8')
      if (src.includes('BrowserRouter')) missing.push(r)
    }
    expect(
      missing,
      `파일이 스스로 BrowserRouter 하네스라고 밝혔는데 WEB_DEPLOY_REAL_QA 에 없다 — H-1a/H-1b 판정에서 빠진다:\n${missing.join('\n')}`,
    ).toEqual([])
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
      // ① 이 파일의 선언 목록을 먼저 모으고(1홉 간접 해소에도 재사용), "쓰기" 호출의
      // 인자에 등장하는 식별자를 모은다.
      const decls = collectDeclarations(src)
      const writeTargets = collectWriteTargetIdentifiers(src, decls)
      // ② docs/qa 또는 playwright/**/screenshots 를 가리키는 선언 중, 쓰기 목적지로
      // 쓰이는 것만 래핑을 강제한다.
      //    (읽기 전용 참조 — 예: 커밋된 확정 증거의 존재 여부 검사 — 는 래핑 대상이 아니다.)
      for (const decl of decls) {
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

  /**
   * G1 (2026-07-26 재수렴 라운드) — H-2 가드 자체의 사각지대를 뮤테이션 매트릭스로 확증한다.
   * 각 케이스는 레포에 실존하는 위반 파일에서 그대로 뽑은 최소 재현 조각이다. fix 전에는
   * 전부 RED(가드가 실제 위반을 "안 보이는 것"으로 취급) — 이 자체가 결함의 증거다.
   */
  describe('G1: 가드 3기전 결함 (뮤테이션 매트릭스)', () => {
    it('M1 대조군 — 단일행 선언 + 직접 참조는 원래도 잡힌다', () => {
      const src = "const SHOTS = path.resolve('../../docs/qa/m1-control')\nfs.mkdirSync(SHOTS, { recursive: true })"
      const decls = collectDeclarations(src)
      const shots = decls.find((d) => d.name === 'SHOTS')
      expect(shots?.body).toContain('docs/qa/m1-control')
      const targets = collectWriteTargetIdentifiers(src, decls)
      expect([...targets]).toContain('SHOTS')
    })

    it('M2 — 삼항 초기화식(다음 줄 ?/:)을 온전히 이어붙인다 (opusb/choreb 실제 형태)', () => {
      const src = [
        "const SHOTS = process.env['AUDIT_SHOT_DIR']",
        "  ? path.resolve(process.env['AUDIT_SHOT_DIR'])",
        "  : path.resolve('../../docs/qa/choreb-opus-b')",
      ].join('\n')
      const decls = collectDeclarations(src)
      const shots = decls.find((d) => d.name === 'SHOTS')
      expect(shots, 'SHOTS 선언 자체를 못 찾음(다음 줄 삼항 미접속)').toBeTruthy()
      expect(shots?.body ?? '').toContain('docs/qa/choreb-opus-b')
    })

    it('M3 — `??` 다음줄 초기화식을 온전히 이어붙인다 (909-auto-update/external-* 실제 형태)', () => {
      const src = [
        "const SHOT_DIR = process.env['AUDIT_SHOT_DIR']",
        "  ?? join(process.cwd(), '..', '..', 'docs', 'qa', '909-opus-reconv2-2026-07-24')",
      ].join('\n')
      const decls = collectDeclarations(src)
      const shotDir = decls.find((d) => d.name === 'SHOT_DIR')
      expect(shotDir, 'SHOT_DIR 선언 자체를 못 찾음(다음 줄 ?? 미접속)').toBeTruthy()
      expect(shotDir?.body ?? '').toContain('909-opus-reconv2-2026-07-24')
    })

    it('M4 — 지역변수 1홉 간접(path.join 결과를 write 호출에 넘김)까지 추적한다 (print-supplement 실제 형태)', () => {
      const src = [
        "const SCREENSHOT_DIR = path.resolve(_dirname, '../../../../docs/qa/supplier-profile-bank-stamp/screenshots')",
        'const filePath = path.join(SCREENSHOT_DIR, `SUPP-${name}.png`)',
        'await page.screenshot({ path: filePath, fullPage: false })',
      ].join('\n')
      const decls = collectDeclarations(src)
      const targets = collectWriteTargetIdentifiers(src, decls)
      expect([...targets], 'SCREENSHOT_DIR 가 1홉 간접(filePath 경유)으로 안 잡힘').toContain('SCREENSHOT_DIR')
    })

    it('M4b — 템플릿 리터럴 보간(${OUT}/...) 간접도 추적한다 (partner-restore-qa capture.mjs 실제 형태)', () => {
      const src = [
        "const OUT = resolve(__dirname, '../../../../docs/qa/phase-2-3-partner-restore')",
        'const file = `${OUT}/${String(step).padStart(2, \'0\')}-${name}.png`',
        'await page.screenshot({ path: file, fullPage: true })',
      ].join('\n')
      const decls = collectDeclarations(src)
      const targets = collectWriteTargetIdentifiers(src, decls)
      expect([...targets], 'OUT 이 템플릿 보간 간접으로 안 잡힘').toContain('OUT')
    })

    it('M5 — `//` 주석 안의 `/*` 시퀀스를 블록주석 시작으로 오인해 실 코드를 삭제하지 않는다 (920-codef 실제 형태)', () => {
      // 실제 파일과 동일 구조: "docs/qa/**" 안의 `/*` 가 오인되면, 뒤에 나오는 아무 JSDoc
      // 블록 주석의 `*/` 까지 그 사이 실 코드(SHOTS 선언 포함)가 통째로 삭제된다.
      const src = [
        '// K5 라이브 재검증 전용 하위폴더 — docs/qa/** 기존 커밋 파일(01~04*, r3-*, r4-verify/*,',
        '// rA-closing/*, rB-bound-revert/*) 절대 미접촉(덮어쓰기 금지 컨벤션).',
        "const SHOTS = path.resolve(_dirname, '../../../../docs/qa/920-codef-scope-lock/k5-live')",
        'fs.mkdirSync(SHOTS, { recursive: true })',
        '',
        '/** 로그인 헬퍼 */',
        'async function realLogin(page) { return null }',
      ].join('\n')
      const stripped = stripComments(src)
      expect(stripped, '주석 안 /* 오인으로 SHOTS 선언 실 코드가 삭제됨').toContain('920-codef-scope-lock/k5-live')
      expect(stripped, 'mkdirSync 호출도 함께 삭제됨').toContain('mkdirSync(SHOTS')
      // 삭제되지 않았다는 것 자체보다 더 직접적으로: stripComments 이후에도 collectDeclarations 가 여전히 찾는다.
      const decls = collectDeclarations(stripped)
      expect(decls.find((d) => d.name === 'SHOTS')?.body ?? '').toContain('920-codef-scope-lock/k5-live')
    })

    it('M3b — 선언 줄이 `=` 뒤 공백뿐이고 초기화식 전체가 다음 줄부터 시작해도 이어붙인다 (external-carriers-real-qa 실제 형태)', () => {
      const src = [
        'const SCREENSHOT_DIR =',
        "  process.env['QA_SHOTS'] ??",
        "  path.resolve(_dirname, '../../../../docs/qa/external-carriers-s2')",
        'fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })',
      ].join('\n')
      const decls = collectDeclarations(src)
      const dir = decls.find((d) => d.name === 'SCREENSHOT_DIR')
      expect(dir, 'SCREENSHOT_DIR 선언 자체를 못 찾음(빈 몸체 뒤 다음 줄 미접속)').toBeTruthy()
      expect(dir?.body ?? '').toContain('docs/qa/external-carriers-s2')
    })

    it('M4c — 이미 resolveQaShotsDir 로 래핑된 선언의 원본 인자까지 거슬러 올라가 오탐하지 않는다 (회귀 방지, slip-form-v20 실측)', () => {
      const src = [
        "const COMMITTED_QA_DIR = path.resolve(_dirname, '../../../../docs/qa/slip-form-v20-and-menu-relocate')",
        'const QA_DIR = resolveQaShotsDir(COMMITTED_QA_DIR)',
        'await page.screenshot({ path: path.join(QA_DIR, name) })',
      ].join('\n')
      const decls = collectDeclarations(src)
      const targets = collectWriteTargetIdentifiers(src, decls)
      expect(
        [...targets],
        'COMMITTED_QA_DIR 가 이미 안전한 QA_DIR 경유로 오탐 포함됨',
      ).not.toContain('COMMITTED_QA_DIR')
    })

    it('M5b — 정상 블록/라인 주석은 여전히 제거된다 (회귀 방지)', () => {
      const src = [
        '/* 평범한 블록 주석',
        '   여러 줄 */',
        'const X = 1 // 평범한 라인 주석',
        'const Y = 2',
      ].join('\n')
      const stripped = stripComments(src)
      expect(stripped).not.toContain('평범한 블록 주석')
      expect(stripped).not.toContain('평범한 라인 주석')
      expect(stripped).toContain('const X = 1')
      expect(stripped).toContain('const Y = 2')
    })

    it('M5c — 문자열/템플릿 리터럴 안의 `//`·`/*` 는 주석으로 취급하지 않는다 (회귀 방지)', () => {
      const src = "const RAW_ERROR = 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header'"
      const stripped = stripComments(src)
      expect(stripped).toContain('https://intranet.example/latest.yml')
    })

    it('쓰기 호출 집합이 appendFileSync·page.pdf·download.saveAs 도 잡는다 (3종뿐이던 정규식 확장)', () => {
      expect([...collectWriteTargetIdentifiers('fs.appendFileSync(RAW_LOG, line)', [])]).toContain('RAW_LOG')
      expect([...collectWriteTargetIdentifiers('await page.pdf({ path: PDF_OUT })', [])]).toContain('PDF_OUT')
      expect([...collectWriteTargetIdentifiers('await download.saveAs(DL_TARGET)', [])]).toContain('DL_TARGET')
    })
  })

  /**
   * G5 (2026-07-26 재수렴 라운드) — `clients/desktop/scripts/*.cjs` 라이브QA 하네스는
   * H-1 계열(ALL_PW_TS = playwright/**\/*.ts)의 관할 밖이다. 이 스크립트들은 전부
   * `http://localhost:5175`(vite.renderer.dev.config.ts, VITE_PLATFORM 미정의 →
   * HashRouter)를 하드코딩하면서 해시 없는 경로로 goto 한다 — 로그인 화면만 찍고
   * `rows=0`인데 `QA_DONE`/exit 0 으로 끝난다(실측: mobile-s3-datatable-card-qa.cjs
   * "1.모바일 거래처(카드): /admin/partners rows=0" → 그래도 QA_DONE).
   *
   * 두 표기 형태를 모두 잡는다 — 템플릿 리터럴(`` .goto(`${BASE}...`) ``, 11개 파일)과
   * 문자열 연결(`.goto('http://localhost:5175' + x)`, card-shot.cjs·diag-detail.cjs
   * 2개 — PM 이 지목한 11개 목록에는 없었다. "파일명이 아니라 쓰기 목적지·하네스
   * 판정 지점" 스윕 원칙으로 찾았다).
   */
  /**
   * G3 (2026-07-26 재수렴 라운드) — `clients/desktop/playwright` 밖(clients/**\/scripts,
   * clients/desktop 산개 스크립트, 루트 scripts/)의 캡처 스크립트도 커밋된 QA 증거를
   * 덮어쓰지 않는다. H-2 와 동일한 collectDeclarations/collectWriteTargetIdentifiers/
   * stripComments 를 재사용하고, "안전"의 기준도 H-2 와 동일하게 resolveQaShotsDir(...)
   * 함수명이다 — 이 파일들은 서로 다른 패키지에 흩어져 있어 support/qa-screenshot-dir 대신
   * 각자 scripts/lib/qa-shots-dir.{cjs,mjs} 를 상대경로로 불러오지만, 두 구현 모두 함수명은
   * resolveQaShotsDir 로 통일했다.
   */
  it('G3a: clients/**/scripts·루트 scripts/ 의 JS/CJS/MJS 캡처 목적지도 _local 격리를 거친다', () => {
    const files = walkG3Sources()
    const violations: string[] = []
    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf-8')
      const src = stripComments(raw)
      const decls = collectDeclarations(src)
      const writeTargets = collectWriteTargetIdentifiers(src, decls)
      const name = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
      for (const decl of decls) {
        const pointsAtQa =
          decl.body.includes('docs/qa') ||
          decl.body.includes('docs/manual') ||
          /['"]docs['"]\s*,\s*['"]qa['"]/.test(decl.body) ||
          /screenshots/i.test(decl.body)
        if (!pointsAtQa) continue
        if (!writeTargets.has(decl.name)) continue
        // scripts/lib/qa-shots-dir.{cjs,mjs} 도 함수명은 resolveQaShotsDir 로 통일했다 —
        // H-2 와 동일 기준(어느 패키지에서 상대경로로 불러왔든 호출부 텍스트는 같다).
        if (decl.body.includes('resolveQaShotsDir')) continue
        violations.push(`${name} → const ${decl.name}`)
      }
    }
    expect(
      violations,
      `커밋 QA 증거로 직접 쓰는 경로 상수 발견(clients/**/scripts, 루트 scripts/) — _local 격리 필수:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  it('G3b: 위 스크립트가 이 저장소의 특정 절대경로(C:/dev/Samhan-Public 등)를 하드코딩하지 않는다', () => {
    const files = walkG3Sources()
    const violations: string[] = []
    for (const file of files) {
      // 주석에서 "이전에는 이 절대경로를 썼다" 처럼 이력을 남기는 것까지 위반으로 잡으면
      // 안 된다 — 실행되는 코드만 본다.
      const src = stripComments(fs.readFileSync(file, 'utf-8'))
      if (/C:[\\/]+dev[\\/]+Samhan-Public/.test(src)) {
        violations.push(path.relative(REPO_ROOT, file).replace(/\\/g, '/'))
      }
    }
    expect(
      violations,
      `이 체크아웃 하나에만 유효한 절대경로 하드코딩 발견 — 워크트리에서 실행하면 메인 체크아웃을 오염시킨다:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * G3c — `.ps1` 스크립트는 JS 파서로 스캔할 수 없어 별도의 가벼운 텍스트 휴리스틱을 쓴다
   * (완전한 PowerShell 파서가 아니라는 한계를 명시한다 — 이 저장소의 실 위반 형태
   * `$OutDir = Join-Path $PSScriptRoot '...docs\qa...'` 를 잡는 데는 충분하다).
   */
  it('G3c: 루트 scripts/*.ps1 의 docs/qa OutDir 도 _local 격리 마커가 있다', () => {
    const scriptsRoot = path.resolve(REPO_ROOT, 'scripts')
    const ps1Files = fs.existsSync(scriptsRoot)
      ? fs
          .readdirSync(scriptsRoot, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith('.ps1'))
          .map((e) => path.join(scriptsRoot, e.name))
      : []
    const violations: string[] = []
    // 두 표기 형태 모두 잡는다: `$OutDir = Join-Path $PSScriptRoot '...docs\qa...'` (sp-01~04,
    // generate-samhan-*, generate-d-ax-*, generate-arologis-* 실제 형태) 그리고
    // `[string]$OutputDir = "docs/qa/.../screenshots"` (sp-08-4-1 등 파라미터 기본값 형태 —
    // 처음엔 전자만 잡아 12개만 나왔다, 후자 추가 후 25개 전수).
    const outDirDecl = /\$Out(?:put)?Dir\s*=\s*(?:Join-Path\s+\$PSScriptRoot\s+)?['"][^'"]*docs[\\/]qa[^'"]*['"]/i
    for (const file of ps1Files) {
      const src = fs.readFileSync(file, 'utf-8')
      if (!outDirDecl.test(src)) continue
      if (src.includes('_local') || src.includes('QA_SHOTS_DIR')) continue
      violations.push(path.relative(REPO_ROOT, file).replace(/\\/g, '/'))
    }
    expect(
      violations,
      `docs/qa OutDir 를 _local 격리·QA_SHOTS_DIR override 없이 직접 쓰는 .ps1 발견:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  it('G5: clients/desktop/scripts 의 5175 라이브QA 하네스는 해시 없는 goto 를 쓰지 않는다', () => {
    const scriptFiles = walk(DESKTOP_SCRIPTS, (p) => p.endsWith('.cjs'))
    const templateForm = /\.goto\(\s*`\$\{BASE\}(?!\/#)/g
    const concatForm = /\.goto\(\s*'http:\/\/localhost:5175'\s*\+(?!\s*'\/#')/g
    const violations: string[] = []
    for (const file of scriptFiles) {
      const src = fs.readFileSync(file, 'utf-8')
      if (!src.includes('5175')) continue // 이 하네스(HashRouter) 대상이 아닌 스크립트는 대상 밖
      const name = path.relative(DESKTOP_SCRIPTS, file).replace(/\\/g, '/')
      for (const _m of src.matchAll(templateForm)) violations.push(`${name} (템플릿 리터럴)`)
      for (const _m of src.matchAll(concatForm)) violations.push(`${name} (문자열 연결)`)
    }
    expect(
      violations,
      `5175(HashRouter) 하네스에 해시 없는 goto 발견 — 로그인/대시보드로 낙착해 rows=0 인데도 성공 종료한다:\n${violations.join('\n')}`,
    ).toEqual([])
  })
})
