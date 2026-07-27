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

/**
 * 가드 관할 루트 1건의 명세.
 *
 * 🚨 2026-07-27 재수렴 4차 X2 — **관할 루트 집합 자체가 이 가드의 일곱 번째 사각이었다.**
 * 앞선 여섯 라운드가 고친 축(하네스 대수·게이트 종류·스캔 깊이·확장자·디렉토리·글롭)은
 * 전부 "정해진 루트 **안에서**" 무엇이 달라질 수 있는가의 변주였고, 루트 목록 자체는 한
 * 번도 도출된 적이 없다 — 결함이 발견된 자리마다 반응적으로 한 줄씩 덧붙었다(53ae9e560
 * clients/desktop/playwright · af1ee384f clients/**\/scripts+scripts/ · 6c49d39ad
 * tools/manual-capture+docs/qa). 각 walker 는 "스캔 대상이 잡혔다(count > N)" 만 단언해서
 * **루트가 통째로 빠져도 조용히 GREEN** 이었다. 그래서 루트를 문자열 목록이 아니라
 * **명세 배열**로 바꾸고(아래 GUARD_ROOTS), 모든 walker 와 커버리지 검사(G8c)가 같은
 * 진실원을 읽게 한다 — 루트 하나를 빼면 G8c 가 즉시 RED 다(M9 뮤테이션 참조).
 */
interface GuardRootSpec {
  /** REPO_ROOT 기준 상대 디렉토리. */
  readonly dir: string
  /** true 면 하위 디렉토리까지(walk 가 node_modules/_local 은 자동 skip). */
  readonly recursive: boolean
  /** 이 루트에서 스캔할 확장자. */
  readonly exts: RegExp
  /** 이 루트를 실제로 검사하는 테스트 이름(커버리지 보고용). */
  readonly label: string
}

const JS_CAPTURE_EXT = /\.(?:cjs|mjs|js)$/

/** G3 — clients/** 와 루트 scripts/ 의 캡처 목적지도 커밋 증거를 덮어쓰면 안 된다. */
const G3_ROOTS: GuardRootSpec[] = [
  { dir: 'clients/desktop/scripts', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  // 루트 산개 스크립트(qa-formula-f1-*.mjs) — 비재귀
  { dir: 'clients/desktop', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  { dir: 'clients/mobile/scripts', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  { dir: 'clients/mobile-staff/scripts', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  { dir: 'clients/web/estimate-app/scripts', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  { dir: 'clients/web/order-app/scripts', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  { dir: 'scripts', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  // H1(2026-07-27 하네스 흡수) — tools/manual-capture/*.js 가 docs/manual/screenshots 로
  // 직접 쓰던 12파일. 평탄 디렉토리(node_modules/output 서브폴더는 walkG3Sources 가
  // 디렉토리라 자동 skip)라 G3 와 동일한 비재귀 스캔으로 충분하다 — 새 워커 불필요.
  { dir: 'tools/manual-capture', recursive: false, exts: JS_CAPTURE_EXT, label: 'G3a' },
  // 🚨 X1(2026-07-27 재수렴 4차) — `qa/playwright` 는 `clients/desktop/playwright` 와 이름만
  // 비슷한 **별도 최상위 트리**다(자체 package.json·playwright.config.ts, CI 는 qa-e2e.yml 에서
  // working-directory: qa/playwright 로 돌린다). 44d718491 커밋 메시지의 "qa/** 는 DOCS_QA_ROOT
  // 스코프상 물리적으로 도달 불가" 는 **가드가 거기 못 간다**는 뜻이었지 **거기 스크립트가 커밋
  // 증거에 못 간다**는 뜻이 아니었다 — 실제로는 정반대였다. scripts/generate-*.mjs 9개가
  // `path.join(repoRoot, 'docs/qa/<slug>/screenshots')` 로 tracked PNG 68장을 직접 덮어썼다.
  // 이 트리는 재귀 + `.ts` 포함으로 잡는다(tests/·utils/ 에도 쓰기 호출이 있다).
  { dir: 'qa/playwright', recursive: true, exts: /\.(?:cjs|mjs|js|ts)$/, label: 'G3a' },
]

function walkG3Sources(): string[] {
  const out: string[] = []
  for (const spec of G3_ROOTS) {
    const root = path.resolve(REPO_ROOT, spec.dir)
    if (!fs.existsSync(root)) continue
    if (spec.recursive) {
      out.push(...walk(root, (p) => spec.exts.test(p) && !p.includes(`${path.sep}lib${path.sep}`)))
      continue
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) continue // 하위 client 앱 소스까지 재귀하지 않는다
      const full = path.join(root, entry.name)
      if (spec.exts.test(entry.name) && !full.includes(`${path.sep}lib${path.sep}`)) out.push(full)
    }
  }
  return out
}

/**
 * 이 가드가 실제로 검사하는 **관할 루트 전수**(단일 진실원).
 *
 * 각 walker 는 여기서 자기 몫을 읽고, G8c 는 "레포에서 증거를 쓸 수 있는 파일 전수" 가
 * 이 목록에 덮이는지를 검사한다. 새 트리가 생기거나 여기서 한 줄이 빠지면 G8c 가 RED 다.
 * (H-4 는 타이밍 축이라 증거 쓰기 관할이 아니다 — 여기 넣지 않는다.)
 */
const GUARD_ROOTS: GuardRootSpec[] = [
  { dir: 'clients/desktop/playwright', recursive: true, exts: /\.(?:ts|tsx|js|mjs|cjs)$/, label: 'H-2' },
  { dir: 'docs/qa', recursive: true, exts: /\.(?:js|cjs|mjs|ts)$/, label: 'H2b' },
  { dir: 'docs/qa', recursive: true, exts: /\.py$/, label: 'H2-py' },
  { dir: 'docs/qa', recursive: true, exts: /\.sh$/, label: 'H2-sh' },
  { dir: 'scripts', recursive: false, exts: /\.ps1$/, label: 'G3c' },
  ...G3_ROOTS,
]

/** 절대경로가 어느 관할 루트에 속하는지 — 아무 데도 안 속하면 null. */
function guardRootFor(abs: string): GuardRootSpec | null {
  for (const spec of GUARD_ROOTS) {
    const root = path.resolve(REPO_ROOT, spec.dir)
    if (!abs.startsWith(root + path.sep)) continue
    if (!spec.recursive && path.dirname(abs) !== root) continue
    if (!spec.exts.test(abs)) continue
    if (spec.exts === JS_CAPTURE_EXT && abs.includes(`${path.sep}lib${path.sep}`)) continue
    return spec
  }
  return null
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
 *  ③ (2026-07-27 H1/H2 흡수) `copyFileSync` · `.toFile` 를 쓰기호출 집합에 추가한다 — 이전
 *     6종 정규식(screenshot/pdf/writeFileSync/appendFileSync/mkdirSync/saveAs) 그 무엇에도
 *     안 걸렸다. `copyFileSync` 는 tools/manual-capture/sync-screenshots.js 의
 *     `fs.copyFileSync(captured, dest)` 실측(dest 가 커밋된 docs/manual/screenshots 를 직접
 *     가리켜도 미탐지). `.toFile` 은 sharp 의 비동기 PNG 저장 API — tools/manual-capture 9개
 *     파일이 `sharp(...).png().toFile(outPath)` 로 쓰는데(annotate.js·capture-manual-all.js·
 *     capture-pr-{g1,h1,h2,h3,h4b,h4c}.js·generate-mobile-placeholders.js·
 *     generate-placeholder.js, 실측 12건) 정규식에 없어 이 트리 전체가 가드 사각이었다
 *     (RED 재현: G3_ROOTS 에 tools/manual-capture 추가 직후 fix 전 원본으로 되돌려 G3a 를
 *     돌리면, `.screenshot`/`copyFileSync` 만으로는 `OUT_DIR`/`OUT_ROOT` 가 전혀 안 잡혀
 *     "위반 0" 으로 조용히 통과했다 — pointsAtQa 는 참이어도 writeTargets 에 없어 3중 필터의
 *     2번째에서 탈락). G3a/H-2/H2b 전부 이 공유 정규식을 쓰므로 한 번에 이득.
 *  ④ (2026-07-27 재수렴 3차 W1 흡수) `writeFile`(비-Sync, `node:fs/promises`) 를 추가한다 —
 *     이전 8종 정규식 그 무엇에도 안 걸렸다. `scripts/generate-sp-07-google-sheets-source-
 *     screenshots.mjs` 실측: 10행 `outDir`(screenshots/) 은 resolveQaShotsDir 로 감쌌지만
 *     256행 아래 같은 파일의 `await fs.writeFile(path.join(repoRoot, 'docs/qa/.../
 *     screenshot-checklist.md'), …)` 는 안 감쌌다. `writeFileSync` 와 시작 문자열을
 *     공유하지만 alternation 뒤 `\s*\(` 를 강제하므로 "writeFileSync(" 에서 "writeFile" 이
 *     오매치되지 않는다("Sync(" 가 `\s*\(` 에 안 걸려 엔진이 "writeFileSync" 대안으로 재시도).
 *     이 정규식은 collectInlineLiteralWriteViolations(아래) 와도 공유한다 — 목적지가
 *     `const` 선언이 아니라 인라인 인자인 경우(바로 위 실측 사례) 는 collectDeclarations 가
 *     애초에 볼 decl 자체가 없어 이 함수(식별자 기반)만으로는 못 잡는다.
 */
const WRITE_CALL = /(?:\.screenshot|\.pdf|writeFileSync|writeFile|appendFileSync|mkdirSync|\.saveAs|copyFileSync|\.toFile)\s*\(/g

/**
 * 백틱 템플릿 리터럴 구간 중 **개행을 포함하는 것만** 내용을 공백으로 지운다(백틱·개행
 * 자체와 전체 길이는 보존 — 인덱스 계산에 영향 없게).
 *
 * (2026-07-27 재수렴 3차 W1 흡수, `writeFile` 추가의 부작용 fix) `collectWriteTargetIdentifiers`
 * 는 쓰기 호출의 인자 텍스트 전체에서 식별자를 뽑는다 — 이 저장소의 기존 관례상 경로를
 * 조립하는 템플릿 리터럴(`` `${OUT}/${name}.png` ``, M4b 실측)은 항상 한 줄이라 문제가
 * 없었지만, `writeFile` 을 추가하자 generate-sp-07-google-sheets-source-screenshots.mjs 의
 * 2번째 인자(커밋 체크리스트 **본문**, 여러 줄 마크다운 템플릿)까지 스캔 대상이 됐다. 그 본문
 * 안의 `${screens.map(...)}` 보간이 `screens` 를 writeTargets 에 얹었고, `screens` 배열의 한
 * 행 데이터 `['screenshots', 'PNG 6장', …]`(경로가 아니라 검증 매트릭스 표의 라벨 문자열)가
 * 기존 G3a `/screenshots/i` 휴리스틱과 우연히 일치해 오탐(`const screens`)이 났다 — 실측
 * RED: 이 함수 fix 전에는 G3a 가 `screens` 를 가짜 위반으로 보고했다(아래 M8 뮤테이션 참조).
 * 경로 조립용 한 줄 템플릿은 그대로 두고(M4b 회귀 없음), 여러 줄 "본문 콘텐츠" 템플릿만
 * 식별자 추출에서 제외한다.
 */
function stripMultilineTemplateContent(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c !== '`') { out += c; i++; continue }
    let j = i + 1
    while (j < text.length && text[j] !== '`') {
      if (text[j] === '\\') j += 2
      else j++
    }
    const span = text.slice(i, Math.min(j + 1, text.length))
    out += span.includes('\n') ? span.replace(/[^\n`]/g, ' ') : span
    i = j + 1
  }
  return out
}

function collectWriteTargetIdentifiers(
  src: string,
  decls: { name: string; body: string }[],
): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(WRITE_CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const args = stripMultilineTemplateContent(balancedArgs(src, open))
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

/** 텍스트에서 문자열/템플릿 리터럴 내용만 뽑는다(따옴표 밖 식별자와 섞이지 않도록). */
function extractLiterals(text: string): string {
  const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  return (text.match(re) ?? []).join('\n')
}

/**
 * 쓰기 호출의 인자 "텍스트 자체"에 docs/qa(또는 docs/manual) 문자열 리터럴이 직접 등장하는데
 * resolveQaShotsDir 로 감싸지 않은 경우를 잡는다 — collectWriteTargetIdentifiers +
 * collectDeclarations 조합은 목적지가 `const`로 이름 붙여진 경우만 본다(그 이름을 decls 에서
 * 찾아 body 를 검사). 실 위반(2026-07-27 재수렴 3차 W1, generate-sp-07-google-sheets-source-
 * screenshots.mjs)은 `fs.writeFile(path.join(repoRoot, 'docs/qa/.../screenshot-checklist.md'),
 * …)` 처럼 목적지 리터럴이 그 호출의 인자 안에 바로 등장하고 별도 const 로 추출되지 않는다 —
 * collectDeclarations 시야 밖(애초에 대상 decl 이 없다). 이 함수는 decls 를 전혀 거치지 않고
 * 각 쓰기 호출의 인자에서 문자열/템플릿 리터럴만 뽑아 직접 검사한다.
 *
 * `/screenshots/i` 휴리스틱(H-2/G3a/H2b 의 decl 기반 pointsAtQa 가 쓰는 것과 동일)은 여기서는
 * 의도적으로 **뺐다** — 안전하게 resolveQaShotsDir 로 감싼 디렉토리 상수(예: `SHOT_DIR`)를 쓰기
 * 호출의 인자에 그대로 넘기는 것이 표준 패턴이라, 그 식별자 이름 자체가 대소문자 무관
 * "screenshots" 부분일치를 갖는 경우가 흔하다(레포 전수: `SHOT_DIR`/`SCREENSHOT_DIR`/
 * `SCREENSHOTS_DIR` 수백 건). decl 기반 검사는 decl **선언부의** body 만 보므로 이미 안전하지만,
 * 이 함수는 매 호출부의 인자 텍스트를 보므로 원문 그대로 적용하면 안전한 기존 호출 수백 건이
 * 오탐 폭발한다(호출부 자신은 `resolveQaShotsDir` 문구를 갖지 않는 게 정상 — 그건 몇 줄 위
 * decl 선언부에 있다). `docs/qa`/`docs/manual` 리터럴은 슬래시를 포함해 식별자로 나올 수 없으므로
 * (JS 식별자 문법 위반) 이 오탐 위험이 없다 — 그래서 이 리터럴 신호만 쓴다.
 */
function collectInlineLiteralWriteViolations(
  src: string,
  opts: { includeDocsManual?: boolean } = {},
): string[] {
  const violations: string[] = []
  for (const m of src.matchAll(WRITE_CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const args = balancedArgs(src, open)
    if (args.includes('resolveQaShotsDir')) continue
    const literal = extractLiterals(args)
    const pointsAtQa =
      literal.includes('docs/qa') ||
      (opts.includeDocsManual === true && literal.includes('docs/manual')) ||
      /['"]docs['"]\s*,\s*['"]qa['"]/.test(args)
    if (!pointsAtQa) continue
    const callName = m[0].replace(/\s*\($/, '')
    violations.push(`${callName}(...) → 인라인 리터럴 목적지(선언 없이 직접 등장)`)
  }
  return violations
}

/**
 * 쓰기 호출 인자에 **인라인 리터럴로** 등장하는 `docs/qa`·`docs/manual` 목적지 전수
 * (collectInlineLiteralWriteViolations 는 "위반 문구"를, 이쪽은 "경로 그 자체"를 준다).
 * G8d 가 이월 사유의 생존을 검사할 때 쓴다.
 */
function collectInlineLiteralDestinations(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(WRITE_CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1
    const args = balancedArgs(src, open)
    if (args.includes('resolveQaShotsDir')) continue
    for (const lit of extractLiterals(args).split('\n')) {
      const body = lit.slice(1, -1)
      if (/^docs[/\\](?:qa|manual)[/\\]/.test(body)) out.push(body)
    }
  }
  return out
}

/**
 * G8d 이월 — **cwd 상대경로** 인라인 목적지를 가진 파일.
 *
 * `qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts` 의 14개
 * `page.screenshot({ path: 'docs/qa/sp-10-2-…/screenshots/QA-N-*.png' })` 는 레포 루트
 * 앵커(`repoRoot`/`__dirname`) 없이 **실행 cwd 기준**으로 해석된다. CI(qa-e2e.yml,
 * `working-directory: qa/playwright`)에서는 `qa/playwright/docs/qa/…` 로 떨어져 커밋 증거를
 * 침범하지 않는다(tracked 0건 확인). 커밋 증거 침범이 아니므로 이번 라운드 fix 대상이
 * 아니다(PM 정정, 2026-07-27 재수렴 4차).
 *
 * 🚨 다만 **정적 면제로 두지 않는다** — 이 목록은 "이 파일을 안 본다" 가 아니라 "이 파일의
 * 인라인 목적지 경로에 파일이 실재하지 않는다" 를 G8d 가 매 실행 재확인한다는 뜻이다.
 * 목적지에 파일이 나타나는 순간 G8d 가 RED 다(tracked 면 이월 사유 소멸, 미추적이면 로컬
 * 실행 잔여물 — G8d 메시지가 둘을 구분해 안내한다). 목록은 줄이는 방향으로만
 * 수정한다(H-5 CARRIED_OVER 와 동일 규약).
 */
const INLINE_RELATIVE_CARRIED_OVER = new Set<string>([
  'qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts',
])

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
 * real-qa 스펙 28개다(PR #938 fix 라운드 — 1차 적대검증 A-1 블라스트 반경 정정 19개 +
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
  '937-fix3-real-qa/937-fix3-real-qa.spec.ts',
  '937-fix5-price-authority-real-qa/937-fix5-price-authority-real-qa.spec.ts',
  '937-fix6-price-domain-real-qa/937-fix6-price-domain-real-qa.spec.ts',
  '937-fix7-history-total-domain-real-qa/937-fix7-history-total-domain-real-qa.spec.ts',
  '937-r3-vat-domain-real-qa/937-r3-vat-domain-real-qa.spec.ts',
  '937-r4-unit-price-domain-real-qa/937-r4-unit-price-domain-real-qa.spec.ts',
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
      // ③ (2026-07-27 재수렴 3차 W1 흡수) 목적지가 애초에 const 로 이름 붙지 않고 쓰기 호출의
      // 인자에 리터럴로 바로 등장하는 경우 — ①②의 decl 순회 시야 밖.
      for (const v of collectInlineLiteralWriteViolations(src)) {
        violations.push(`${rel(file)} → ${v}`)
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

    it('MH2 (2026-07-27 H1/H2 흡수) — fs.copyFileSync() 도 쓰기 호출로 잡는다 (sync-screenshots.js 실제 형태, 기존 6종 정규식 사각)', () => {
      // fix 전 RED 재현 — 이전 정규식(screenshot/pdf/writeFileSync/appendFileSync/mkdirSync/saveAs)
      // 은 copyFileSync 를 모른다. 아래는 그 사각을 그대로 문자열로 재현한다.
      const oldWriteCall = /(?:\.screenshot|\.pdf|writeFileSync|appendFileSync|mkdirSync|\.saveAs)\s*\(/g
      const src = "fs.copyFileSync(captured, path.join(SCREENSHOTS_DIR, mp))"
      expect([...src.matchAll(oldWriteCall)], '이전 정규식이 이미 copyFileSync 를 잡고 있었다면 이 사각은 실재하지 않았다').toHaveLength(0)
      // fix 후 GREEN — 현재 정규식(collectWriteTargetIdentifiers 가 실제로 쓰는 것)은 잡는다.
      expect([...collectWriteTargetIdentifiers(src, [])], 'copyFileSync 인자의 SCREENSHOTS_DIR 가 안 잡힘').toContain('SCREENSHOTS_DIR')
    })

    it('M6 (2026-07-27 재수렴 3차 W1 흡수) — fs.writeFile(비-Sync) 도 쓰기 호출로 잡는다 (generate-sp-07-* 실제 형태, 기존 8종 정규식 사각)', () => {
      // fix 전 RED 재현 — 이전 정규식(screenshot/pdf/writeFileSync/appendFileSync/mkdirSync/
      // saveAs/copyFileSync/toFile) 은 writeFile(비-Sync) 를 모른다.
      const oldWriteCall = /(?:\.screenshot|\.pdf|writeFileSync|appendFileSync|mkdirSync|\.saveAs|copyFileSync|\.toFile)\s*\(/g
      const src = "await fs.writeFile(path.join(repoRoot, 'docs/qa/x/y.md'), body, 'utf8')"
      expect([...src.matchAll(oldWriteCall)], '이전 정규식이 이미 writeFile 을 잡고 있었다면 이 사각은 실재하지 않았다').toHaveLength(0)
      // fix 후 GREEN — 현재 WRITE_CALL(fix 후 collectWriteTargetIdentifiers 가 쓰는 것)은 잡는다.
      expect([...src.matchAll(WRITE_CALL)].length, '현재(fix 후) WRITE_CALL 이 fs.writeFile 을 못 잡음').toBeGreaterThan(0)
      // writeFileSync 텍스트에서 "writeFile" 이 오매치되어 이중 카운트되지 않는지도 함께 확인한다
      // (alternation 뒤 `\s*\(` 강제 — 문서화된 안전성 근거).
      const syncSrc = "fs.writeFileSync(dest, body)"
      expect([...syncSrc.matchAll(WRITE_CALL)].length, 'writeFileSync 호출이 writeFile+writeFileSync 이중으로 잡혀 카운트가 어긋남').toBe(1)
    })

    it('M7 (2026-07-27 재수렴 3차 W1 흡수) — 목적지가 const 선언이 아니라 인라인 인자여도 잡는다 (generate-sp-07-* 실제 형태, collectDeclarations 시야 밖)', () => {
      const src = [
        "const repoRoot = path.resolve(__dirname, '..')",
        "await fs.writeFile(",
        "  path.join(repoRoot, 'docs/qa/sp-07-google-sheets-quote-order-e2e/screenshot-checklist.md'),",
        "  body,",
        "  'utf8',",
        ")",
      ].join('\n')
      // decls 기반 경로로는 못 잡는다는 것부터 확인한다 — repoRoot 선언 본문 자체는 docs/qa 를
      // 언급하지 않으므로(그냥 __dirname 한 단계 위) pointsAtQa 가 false 라 애초에 대상이 아니다.
      const decls = collectDeclarations(src)
      const repoRootDecl = decls.find((d) => d.name === 'repoRoot')
      expect(repoRootDecl?.body ?? '', 'repoRoot 선언 자체가 docs/qa 를 언급하면 이 사각은 실재하지 않았다').not.toContain('docs/qa')
      // fix 전 RED 재현 — collectInlineLiteralWriteViolations 가 없으면(또는 무력화되면) 0건.
      const violations = collectInlineLiteralWriteViolations(src)
      expect(violations.length, '인라인 path.join(...) 리터럴 목적지가 collectInlineLiteralWriteViolations 로 안 잡힘').toBeGreaterThan(0)
    })

    it('M8 (2026-07-27 재수렴 3차 W1 회귀 방지) — 여러 줄 템플릿 리터럴 "본문" 안의 우연한 식별자는 writeTargets 로 오탐하지 않는다 (M6 fix 의 부작용 실측)', () => {
      // 실제 형태 축약 — generate-sp-07-*.mjs 의 2번째 인자(체크리스트 본문)는 여러 줄
      // 템플릿이고, 그 안 표 데이터 행 하나가 우연히 'screenshots' 문자열을 담고 있어
      // (검증 매트릭스 표의 라벨, 경로 아님) 그 배열을 참조하는 `screens` 식별자가
      // writeTargets 에 얹히면 G3a 의 기존 /screenshots/i 휴리스틱과 충돌해 가짜 위반이 났다.
      const src = [
        "const screens = [['screenshots', 'PNG 6장', '민감값 없음', '0']]",
        'await fs.writeFile(',
        '  dest,',
        '  `# 체크리스트',
        '${screens.map((s) => s[0]).join(", ")}',
        '`,',
        "  'utf8',",
        ')',
      ].join('\n')
      const decls = collectDeclarations(src)
      const targets = collectWriteTargetIdentifiers(src, decls)
      expect([...targets], '여러 줄 템플릿 본문 안의 식별자(screens)가 writeTargets 로 오탐 포함됨').not.toContain('screens')
      // 한 줄짜리 경로 조립 템플릿(M4b 형태)은 여전히 잡혀야 한다 — 과잉 수정 회귀 방지.
      const pathSrc = "const OUT = 'x'\nawait page.screenshot({ path: `${OUT}/${name}.png` })"
      const pathDecls = collectDeclarations(pathSrc)
      const pathTargets = collectWriteTargetIdentifiers(pathSrc, pathDecls)
      expect([...pathTargets], '한 줄 템플릿 보간(OUT)까지 같이 지워짐(과잉 수정)').toContain('OUT')
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
   *
   * 🚨 정직 신고 — 이 축이 **보장하지 않는 것**(2026-07-27 재수렴 4차 X3, 실행 반증됨).
   * G5 fix 로 각 스크립트에 들어간 런타임 단언(14개 파일의
   * `if (!page.url().includes('/#'+path)) throw` 형태)은 **`goto` 직후의 URL 문자열 검사**다.
   * 따라서 잡는 것은 "작성자가 해시를 빠뜨렸다"(자기 뮤테이션) 하나뿐이고,
   * **목표 화면에 실제로 도달했는지는 재지 않는다**. 5175 에 BrowserRouter 하네스
   * (`vite.web.config.ts`)를 대신 띄우면 앱이 해시를 무시하고 대시보드로 낙착하는데도
   * URL 에는 해시가 남아 있어 단언이 통과한다 — 실측:
   * `1.모바일 거래처(카드): /admin/partners rows=0 … QA_DONE  EXIT=0`
   * (대조군: 정상 하네스 `rows=20`/exit 0 · 서버 down `QA_FAIL`/exit 1).
   * 즉 "라이브QA 스크립트가 목표 화면에 도달하지 못하면 성공으로 끝나지 않는다" 는
   * **과장**이고, 정확한 진술은 "해시 없는 goto 는 정적으로도 런타임으로도 막힌다" 다.
   * 실 도달 측정(페이지별 DOM 마커 단언)은 이 배치의 축(관할 루트 집합)과 다른 축이라
   * 여기서 손대지 않는다 — 오늘 이 약점이 가리는 실 제품 결함은 없다(도달성 0).
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
      // (2026-07-27 재수렴 3차 W1 흡수) 목적지가 const 로 이름 붙지 않고 쓰기 호출의 인자에
      // 리터럴로 바로 등장하는 경우 — 실측: generate-sp-07-google-sheets-source-screenshots.mjs
      // 의 `fs.writeFile(path.join(repoRoot, 'docs/qa/.../screenshot-checklist.md'), …)`.
      // cwd 상대 인라인 목적지 이월분은 G8d 가 "사유 생존" 으로 따로 검사한다(면제 아님).
      if (INLINE_RELATIVE_CARRIED_OVER.has(name)) continue
      for (const v of collectInlineLiteralWriteViolations(src, { includeDocsManual: true })) {
        violations.push(`${name} → ${v}`)
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

  /**
   * H2 (2026-07-27 하네스 흡수 배치, PR #938) — G3 라운드가 "G3 불변식(clients/**\/scripts,
   * 루트 scripts/) 문언 밖"이라는 이유로 미착수로 남긴 docs/qa/**\/*.{js,cjs,mjs,py,sh} 를
   * 흡수한다(H1 = tools/manual-capture 는 G3_ROOTS 에 한 줄만 추가해 기존 G3a/G3b 가 그대로
   * 관할 — 위의 G3_ROOTS 선언 참조).
   *
   * 이 파일들은 전부 docs/qa/** 내부에 물리적으로 위치한다 — 즉 `__dirname` 자체가 이미
   * 커밋 경로다. 그래서 문자열 리터럴("docs/qa")이 소스에 아예 등장하지 않는 게 정상이고,
   * H-2/G3a 의 pointsAtQa 휴리스틱(리터럴 매치)은 이 형태를 원천적으로 못 잡는다(sp-09-1~5·
   * sp-d1 6파일 실측: `const HERE = __dirname` 뒤 `path.join(HERE, `${slug}.png`)`).
   * pointsAtQaRecursive 는 `__dirname` 도 신호로 추가한다 — 이 규칙은 관할이 docs/qa/** 로
   * 고정된 이 재귀 스캔에만 적용한다(G3_ROOTS 같은 범용 목록에 넣으면 tools/manual-capture/
   * capture-desktop.js 의 무해한 `path.resolve(__dirname, 'output')` 까지 오탐한다).
   */
  const DOCS_QA_ROOT = path.resolve(REPO_ROOT, 'docs/qa')

  /**
   * (2026-07-27 재수렴 3차 W2 흡수) `.ts` 를 확장자 필터에 추가한다 — 이전 필터(js/cjs/mjs)는
   * docs/qa 안의 `.ts` 캡처 스펙을 원천적으로 스캔 대상에서 뺐다. 실측:
   * docs/qa/coedit-s3-5-dispatch/capture-dispatch-coedit.spec.ts 가
   * `const SS_DIR = path.resolve(__dirname)` 로 자기 자신이 속한 커밋 디렉토리(01-login.png 등
   * 3장이 이미 tracked)에 직접 스크린샷을 쓰는데, 확장자 필터가 `.ts` 를 몰라 `files` 목록에
   * 아예 들어오지 못했다 — H2b 의 다른 안전장치(pointsAtQaRecursive 의 __dirname 신호 등)가
   * 전부 정상이어도 무의미했다. `docs/qa/coedit-s3-5-dispatch/playwright.config.ts` 도 이 필터로
   * 함께 들어오지만 쓰기 호출이 없어(config 파일) 위반 0 을 유지한다 — 확장 자체가 새 오탐을
   * 만들지 않는다는 근거(스캔 대상이 실제로 잡혔다 테스트가 카운트 증가로 확인한다).
   * `qa/playwright/**`(top-level, docs/qa 와 무관한 별도 트리) 는 DOCS_QA_ROOT 관할 밖이라
   * 이 확장으로도 스캔되지 않는다 — #851 후속 슬라이스 경계 유지.
   */
  function walkDocsQaJsSources(): string[] {
    return walk(DOCS_QA_ROOT, (p) => /\.(?:js|cjs|mjs|ts)$/.test(p))
  }

  /** H2b 전용 — 일반 G3a/H-2 의 pointsAtQa 에 `__dirname` 신호를 더한다(주석 위 설명 참조). */
  function pointsAtQaRecursive(body: string): boolean {
    return (
      body.includes('docs/qa') ||
      body.includes('__dirname') ||
      /['"]docs['"]\s*,\s*['"]qa['"]/.test(body) ||
      /screenshots/i.test(body)
    )
  }

  it('H2b: docs/qa/**/*.{js,cjs,mjs,ts} 의 캡처 목적지도 _local 격리를 거친다 (자기 자신의 형제 PNG 를 덮어쓰는 형태)', () => {
    const files = walkDocsQaJsSources()
    const violations: string[] = []
    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf-8')
      const src = stripComments(raw)
      const decls = collectDeclarations(src)
      const writeTargets = collectWriteTargetIdentifiers(src, decls)
      const name = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
      for (const decl of decls) {
        if (!pointsAtQaRecursive(decl.body)) continue
        if (!writeTargets.has(decl.name)) continue
        if (decl.body.includes('resolveQaShotsDir')) continue
        violations.push(`${name} → const ${decl.name}`)
      }
      // (2026-07-27 재수렴 3차 W1 흡수) 목적지가 const 로 이름 붙지 않는 인라인 리터럴 형태.
      for (const v of collectInlineLiteralWriteViolations(src)) {
        violations.push(`${name} → ${v}`)
      }
    }
    expect(
      violations,
      `docs/qa 안의 스크립트가 자기 자신이 속한 커밋 디렉토리(__dirname 포함)에 직접 쓴다 — resolveQaShotsDir() 경유 필수:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  it('스캔 대상이 실제로 잡혔다 (docs/qa JS 재귀 스캔이 빈 스캔으로 조용히 통과하는 사고 방지)', () => {
    expect(walkDocsQaJsSources().length, 'docs/qa 안에서 .js/.cjs/.mjs 를 하나도 못 찾았다 — 경로 확인').toBeGreaterThan(10)
  })

  it('MH1 대조군 — __dirname 기반 쓰기 목적지는 pointsAtQaRecursive 에서만 잡힌다 (sp-09/sp-d1 계열 fix 전 실제 형태)', () => {
    const src = ['const HERE = __dirname;', 'const png = path.join(HERE, `${slug}.png`);', 'await page.screenshot({ path: png });'].join('\n')
    const decls = collectDeclarations(src)
    const targets = collectWriteTargetIdentifiers(src, decls)
    const here = decls.find((d) => d.name === 'HERE')
    expect(here, 'HERE 선언 자체를 못 찾음').toBeTruthy()
    expect([...targets], 'HERE 가 쓰기 목적지로 안 잡힘').toContain('HERE')
    // fix 전 RED 재현 — 기존(G3a/H-2) pointsAtQa 는 문자열 리터럴만 보므로 __dirname 만으로는
    // 이 선언을 "docs/qa 를 가리킨다" 고 판단하지 못한다(사각의 원인 그 자체).
    const legacyPointsAtQa =
      (here?.body ?? '').includes('docs/qa') || /screenshots/i.test(here?.body ?? '')
    expect(legacyPointsAtQa, 'G3a/H-2 의 기존 리터럴 매치가 __dirname 선언을 잡는다면 이 사각은 실재하지 않았다').toBe(false)
    // fix 후 GREEN — pointsAtQaRecursive 는 __dirname 신호를 추가로 봐서 잡는다.
    expect(pointsAtQaRecursive(here?.body ?? ''), '__dirname 신호를 추가했는데도 여전히 못 잡음').toBe(true)
  })

  it('MH1b 회귀 방지 — resolveQaShotsDir 로 이미 래핑된 선언은 위반으로 오탐하지 않는다 (capture-pr-f1.js fix 후 실제 형태)', () => {
    const src = [
      "const OUT_DIR = resolveQaShotsDir(path.resolve(__dirname, '..', '..', 'docs', 'qa', 'phase-10-step-12-gas-cd-vendor'));",
      'const png = path.join(OUT_DIR, `${name}.png`);',
      'await page.screenshot({ path: png });',
    ].join('\n')
    const decls = collectDeclarations(src)
    const targets = collectWriteTargetIdentifiers(src, decls)
    const outDir = decls.find((d) => d.name === 'OUT_DIR')
    expect(outDir?.body ?? '').toContain('resolveQaShotsDir')
    expect([...targets]).toContain('OUT_DIR')
    // pointsAtQaRecursive 는 __dirname/docs/qa 신호가 다 있어 true — 그럼에도 resolveQaShotsDir
    // 포함이라 실 검사 루프의 세 번째 필터에서 skip 된다(위반 아님).
    expect(pointsAtQaRecursive(outDir?.body ?? ''), '__dirname·docs/qa 신호가 있는데도 pointsAtQaRecursive 가 false').toBe(true)
  })

  it('MH1c 회귀 방지 — __dirname 을 별도 변수(HERE)로 한 번 거친 뒤 resolveQaShotsDir 로 래핑해도 오탐하지 않는다 (sp-09/sp-d1 fix 후 실제 형태)', () => {
    const src = ['const HERE = __dirname;', 'const OUT_DIR = resolveQaShotsDir(HERE);', 'const png = path.join(OUT_DIR, `${slug}.png`);', 'await page.screenshot({ path: png });'].join('\n')
    const decls = collectDeclarations(src)
    const writeTargets = collectWriteTargetIdentifiers(src, decls)
    const violations: string[] = []
    for (const decl of decls) {
      if (!pointsAtQaRecursive(decl.body)) continue
      if (!writeTargets.has(decl.name)) continue
      if (decl.body.includes('resolveQaShotsDir')) continue
      violations.push(decl.name)
    }
    // OUT_DIR 자체는 pointsAtQaRecursive 가 false(body 에 __dirname 리터럴이 없음, HERE 를
    // 경유)라 1번 필터에서 이미 제외된다 — resolveQaShotsDir 절까지 갈 필요조차 없다.
    // HERE 는 pointsAtQaRecursive 가 true(__dirname 포함) 지만 애초에 writeTargets 에 없다
    // (html 읽기에만 쓰이고 png 쓰기 호출에는 OUT_DIR 만 등장 — sp-09 fix 의 read/write 분리
    // 그 자체가 검증된다). 둘 다 위반 0 이 정답.
    expect(violations, `HERE/OUT_DIR 분리 패턴이 오탐 발생: ${violations.join(', ')}`).toEqual([])
  })

  it('MH5 (2026-07-27 재수렴 3차 W2 흡수) — docs/qa/**/*.ts 도 H2b 스캔 대상이다 (capture-dispatch-coedit.spec.ts 실제 형태, 기존 js/cjs/mjs 전용 확장자 사각)', () => {
    // fix 전 RED 재현 — 이전 확장자 필터(js/cjs/mjs)는 .ts 를 몰랐다.
    const oldExt = /\.(?:js|cjs|mjs)$/
    expect(oldExt.test('capture-dispatch-coedit.spec.ts'), '이전 필터가 이미 .ts 를 잡고 있었다면 이 사각은 실재하지 않았다').toBe(false)
    // fix 후 GREEN — 현재 walkDocsQaJsSources() 의 확장자 필터는 .ts 를 포함한다.
    const newExt = /\.(?:js|cjs|mjs|ts)$/
    expect(newExt.test('capture-dispatch-coedit.spec.ts'), '현재(fix 후) 필터가 여전히 .ts 를 놓침').toBe(true)
    // 필터 정규식만이 아니라 실제 스캔 결과 목록에도 반영되는지 확인한다 — 정규식만 고치고
    // walkDocsQaJsSources 호출부를 안 고치는 부분 fix 를 잡기 위함.
    const files = walkDocsQaJsSources()
    const found = files.some((f) => f.endsWith(`coedit-s3-5-dispatch${path.sep}capture-dispatch-coedit.spec.ts`))
    expect(found, '.ts 확장 후에도 실 위반 파일이 walkDocsQaJsSources() 스캔 목록에 없음').toBe(true)
  })

  /**
   * .py/.sh 는 JS 파서(collectDeclarations 등)를 쓸 수 없다 — G3c(.ps1) 와 동일 원칙의 경량
   * 텍스트 휴리스틱이다(완전한 파서가 아니라는 한계는 G3c 와 동일하게 명시한다).
   */
  function pyWritesEvidence(src: string): boolean {
    // choreb-sonnet-r1/r2 의 pdf_text_check.py 류(PdfReader 로 읽기만 함)는 대상 밖으로 걸러야
    // 오탐이 없다 — 실제 PNG/이미지 저장 호출이 있는 스크립트만 검사한다.
    return /\.save\(|savefig\(/.test(src)
  }

  it('스캔 대상이 실제로 잡혔다 (docs/qa .py 스캔이 빈 스캔으로 조용히 통과하는 사고 방지)', () => {
    const pyFiles = walk(DOCS_QA_ROOT, (p) => p.endsWith('.py'))
    expect(pyFiles.length, 'docs/qa 안에서 .py 를 하나도 못 찾았다 — 경로 확인').toBeGreaterThanOrEqual(4)
    const writers = pyFiles.filter((f) => pyWritesEvidence(fs.readFileSync(f, 'utf-8')))
    expect(writers.length, 'PNG 를 저장하는 .py 가 0건 — pyWritesEvidence 필터가 전부 걸렀다면 아래 H2-py 는 항상 무의미하게 GREEN 이다').toBeGreaterThanOrEqual(2)
  })

  it('H2-py: docs/qa 의 PNG 를 저장하는 .py 스크립트도 _local 격리 마커가 있다', () => {
    const files = walk(DOCS_QA_ROOT, (p) => p.endsWith('.py'))
    const violations: string[] = []
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf-8')
      if (!pyWritesEvidence(src)) continue
      if (src.includes('_local') || src.includes('QA_SHOTS_DIR') || src.includes('resolve_qa_shots_dir')) continue
      violations.push(path.relative(REPO_ROOT, file).replace(/\\/g, '/'))
    }
    expect(
      violations,
      `PNG 를 저장하는 .py 스크립트가 _local 격리 마커(resolve_qa_shots_dir/QA_SHOTS_DIR) 없이 커밋 경로에 직접 쓴다:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  it('MH3 — pyWritesEvidence 는 read-only PDF 검사 스크립트를 오탐하지 않는다 (choreb-sonnet-r1/r2 대조군, fix 전 gen_pngs.py 실제 형태로 RED 재현)', () => {
    const readOnly = ['from pypdf import PdfReader', 'def extract_text(p):', '    return PdfReader(str(p)).pages[0].extract_text()'].join('\n')
    expect(pyWritesEvidence(readOnly), 'PdfReader 읽기 전용 스크립트가 쓰기 위험으로 오판됨(오탐)').toBe(false)
    const writerFixedFormat = "img.save(f'{OUT}/01-daily-closing-screen.png')" // sp-08-6-5 실제 형태
    expect(pyWritesEvidence(writerFixedFormat), 'img.save() 가 쓰기 위험으로 인식되지 않음(RED 원인)').toBe(true)
    const writerConvertFormat = "img1.convert('RGB').save(os.path.join(OUT_DIR, '01-x.png'), 'PNG')" // sp-08-6-3 실제 형태
    expect(pyWritesEvidence(writerConvertFormat), '.convert().save() 체이닝이 쓰기 위험으로 인식되지 않음(RED 원인)').toBe(true)
  })

  it('스캔 대상이 실제로 잡혔다 (docs/qa .sh 스캔이 빈 스캔으로 조용히 통과하는 사고 방지)', () => {
    const shFiles = walk(DOCS_QA_ROOT, (p) => p.endsWith('.sh'))
    expect(shFiles.length, 'docs/qa 안에서 .sh 를 하나도 못 찾았다 — 경로 확인').toBeGreaterThanOrEqual(1)
  })

  it('H2-sh: docs/qa 의 .sh 스크립트도 _local 격리 마커가 있다', () => {
    const files = walk(DOCS_QA_ROOT, (p) => p.endsWith('.sh'))
    const violations: string[] = []
    const outAssign = /\bOUT="[^"]*docs\/qa[^"]*"/
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf-8')
      if (!outAssign.test(src)) continue
      if (src.includes('_local') || src.includes('QA_SHOTS_DIR') || src.includes('resolve_qa_shots_dir')) continue
      violations.push(path.relative(REPO_ROOT, file).replace(/\\/g, '/'))
    }
    expect(
      violations,
      `docs/qa 커밋 경로를 직접 가리키는 OUT= 을 가진 .sh 스크립트가 _local 격리 마커 없이 있다:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  it('MH4 대조군 — OUT="...docs/qa..." 하드코딩을 잡는다 (dev-menu-dev2/backend-qa.sh fix 전 실제 형태로 RED 재현)', () => {
    const src = ['OUT="C:/dev/Samhan-Public/docs/qa/dev-menu-dev2"', 'mkdir -p "$OUT"'].join('\n')
    const outAssign = /\bOUT="[^"]*docs\/qa[^"]*"/
    expect(outAssign.test(src), 'OUT= 하드코딩 커밋 경로 패턴이 안 잡힘(RED 원인)').toBe(true)
    const fixed = ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'source "$SCRIPT_DIR/../../../scripts/lib/qa-shots-dir.sh"', 'OUT="$(resolve_qa_shots_dir "$SCRIPT_DIR")"'].join('\n')
    expect(fixed.includes('resolve_qa_shots_dir'), 'fix 후 형태에 resolve_qa_shots_dir 마커가 없음').toBe(true)
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * G8 (2026-07-27 재수렴 4차) — **관할 루트 집합이 모집단을 덮는가**.
   *
   * 여섯 번의 재수렴이 전부 "루트 안에서의 변주"(하네스 대수 → mock 게이트 → 1행 정적
   * 스캔 → 확장자 → 디렉토리 → 확장자 글롭)를 고쳤고, 일곱 번째는 **루트 목록 자체**였다.
   * 기존 walker 는 전부 "스캔 대상이 잡혔다(count > N)" 만 단언했다 — 그 단언은 **이미
   * 등재된** 루트가 비지 않았다는 뜻일 뿐이라, 루트가 통째로 빠져 있으면 아무 말도 하지
   * 않는다. 실측: `qa/playwright/scripts/generate-*.mjs` 9개가 `path.join(repoRoot,
   * 'docs/qa/<slug>/screenshots')` 로 tracked PNG 68장을 직접 덮어쓰는데도 전 walker 가
   * GREEN 이었다(재현: 무수정 실행 → 커밋 PNG 재기록, sentinel 30B → 91,813B 로 파괴).
   *
   * 그래서 아래 세 테스트는 **가드가 무엇을 못 보는가**를 직접 센다. 모집단은 손으로 적은
   * 목록이 아니라 레포에서 매번 도출한다 — 새 트리가 생기면 자동으로 RED 다.
   * ─────────────────────────────────────────────────────────────────────────────
   */
  const REPO_SKIP_DIRS = new Set([
    'node_modules', '.git', '_local', 'dist', 'build', 'out', 'bin', 'coverage',
    'playwright-report', 'test-results', '.gradle', '.next', '.turbo', 'target',
    'venv', '.venv', '__pycache__', 'worktrees',
  ])

  function walkRepo(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return out
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (REPO_SKIP_DIRS.has(entry.name)) continue
        walkRepo(full, filter, out)
      } else if (filter(full)) {
        out.push(full)
      }
    }
    return out
  }

  /** 커밋 증거 트리를 가리키는 리터럴 신호(경로 구분자 양쪽 표기 + `'docs','qa'` 분해형). */
  const EVIDENCE_LITERAL = /docs[/\\]qa|docs[/\\]manual/
  const EVIDENCE_SPLIT = /['"]docs['"]\s*,\s*['"](?:qa|manual)['"]/

  /**
   * JS 계열 파일이 "커밋 증거를 쓸 수 있는가" — 가드 본체와 **같은 machinery** 로 판정한다
   * (WRITE_CALL · stripComments · collectDeclarations · collectWriteTargetIdentifiers).
   * 새 판정 규칙을 발명하지 않는 것이 요점이다: 모집단과 판정이 어긋나면 그 틈이 여덟
   * 번째 사각이 된다.
   */
  function jsWritesEvidence(src: string, abs: string): boolean {
    const decls = collectDeclarations(src)
    const targets = collectWriteTargetIdentifiers(src, decls)
    const insideEvidenceTree =
      abs.startsWith(path.resolve(REPO_ROOT, 'docs/qa') + path.sep) ||
      abs.startsWith(path.resolve(REPO_ROOT, 'docs/manual') + path.sep)
    for (const decl of decls) {
      if (!targets.has(decl.name)) continue
      // 파일 자신이 증거 트리 안에 있으면 `__dirname` 자체가 이미 커밋 경로다(H2b 근거).
      if (EVIDENCE_LITERAL.test(decl.body) || EVIDENCE_SPLIT.test(decl.body)) return true
      if (insideEvidenceTree && decl.body.includes('__dirname')) return true
    }
    for (const m of src.matchAll(WRITE_CALL)) {
      const open = (m.index ?? 0) + m[0].length - 1
      const args = balancedArgs(src, open)
      if (EVIDENCE_LITERAL.test(extractLiterals(args)) || EVIDENCE_SPLIT.test(args)) return true
    }
    return false
  }

  /** 레포 전수에서 "증거를 쓸 수 있는 파일" 을 도출한다(언어별 판정은 각 walker 와 동일). */
  function derivedEvidenceWriters(): string[] {
    const found: string[] = []
    const jsFiles = walkRepo(REPO_ROOT, (p) => /\.(?:js|cjs|mjs|ts|tsx)$/.test(p))
    for (const file of jsFiles) {
      if (path.resolve(file) === SELF) continue // 가드 자신은 패턴 문자열 보관소다
      let raw: string
      try {
        raw = fs.readFileSync(file, 'utf-8')
      } catch {
        continue
      }
      const inEvidenceTree =
        file.startsWith(path.resolve(REPO_ROOT, 'docs/qa') + path.sep) ||
        file.startsWith(path.resolve(REPO_ROOT, 'docs/manual') + path.sep)
      if (!EVIDENCE_LITERAL.test(raw) && !EVIDENCE_SPLIT.test(raw) && !inEvidenceTree) continue
      if (jsWritesEvidence(stripComments(raw), file)) found.push(file)
    }
    // .ps1 / .sh / .py — G3c·H2-sh·H2-py 와 동일한 경량 텍스트 휴리스틱(파서 없음).
    for (const file of walkRepo(REPO_ROOT, (p) => p.endsWith('.ps1'))) {
      const src = fs.readFileSync(file, 'utf-8')
      if (/\$Out(?:put)?Dir\s*=\s*(?:Join-Path\s+\$PSScriptRoot\s+)?['"][^'"]*docs[\\/]qa[^'"]*['"]/i.test(src)) found.push(file)
    }
    for (const file of walkRepo(REPO_ROOT, (p) => p.endsWith('.sh'))) {
      const src = fs.readFileSync(file, 'utf-8')
      if (/\bOUT="[^"]*docs\/qa[^"]*"/.test(src)) found.push(file)
    }
    for (const file of walkRepo(REPO_ROOT, (p) => p.endsWith('.py'))) {
      const src = fs.readFileSync(file, 'utf-8')
      const inEvidenceTree = file.startsWith(path.resolve(REPO_ROOT, 'docs/qa') + path.sep)
      if (pyWritesEvidence(src) && (inEvidenceTree || EVIDENCE_LITERAL.test(src))) found.push(file)
    }
    return found
  }

  it('G8a: 관할 루트 명세가 전부 실존하고 실제로 파일을 잡는다 (오타/이동으로 조용히 0건이 되는 사고 방지)', () => {
    const empty: string[] = []
    for (const spec of GUARD_ROOTS) {
      const root = path.resolve(REPO_ROOT, spec.dir)
      if (!fs.existsSync(root)) {
        empty.push(`${spec.label} ${spec.dir} → 디렉토리 자체가 없다`)
        continue
      }
      const files = spec.recursive
        ? walk(root, (p) => spec.exts.test(p))
        : fs
            .readdirSync(root, { withFileTypes: true })
            .filter((e) => !e.isDirectory() && spec.exts.test(e.name))
            .map((e) => path.join(root, e.name))
      if (files.length === 0) empty.push(`${spec.label} ${spec.dir} (${String(spec.exts)}) → 0건`)
    }
    expect(
      empty,
      `관할 루트가 파일을 하나도 안 잡는다 — 경로 오타/이동이면 그 루트는 있으나 마나다:\n${empty.join('\n')}`,
    ).toEqual([])
  })

  it('G8b: 증거를 쓸 수 있는 파일이 레포에 실제로 다수 존재한다 (모집단 도출이 0건이면 G8c 는 항상 무의미하게 GREEN)', () => {
    expect(
      derivedEvidenceWriters().length,
      '모집단 도출이 사실상 0건 — 도출 로직이 깨졌다면 G8c 커버리지 검사가 통째로 거짓 green 이다',
    ).toBeGreaterThan(200)
  })

  it('G8c: 증거를 쓸 수 있는 레포 전 파일이 가드 관할 안에 있다 (루트 집합 누락 = RED)', () => {
    const uncovered = derivedEvidenceWriters()
      .filter((f) => guardRootFor(f) === null)
      .map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/'))
      .sort()
    expect(
      uncovered,
      `커밋 증거를 쓸 수 있는데 어떤 가드 walker 의 관할에도 없는 파일 — GUARD_ROOTS 에 루트를 추가할 것\n` +
        `(이 목록이 비어 있지 않으면 그 파일들은 위반이어도 조용히 GREEN 이다):\n${uncovered.join('\n')}`,
    ).toEqual([])
  })

  /**
   * G8d — 이월(INLINE_RELATIVE_CARRIED_OVER)은 **면제가 아니라 조건부 유예**다.
   * 유예 사유("cwd 상대경로라 커밋 증거를 침범하지 않는다")가 여전히 참인지를 매 실행
   * 재확인한다 — 목적지 경로에 파일이 나타나는 순간 RED.
   *
   * ⚠️ 이 검사가 쓰는 것은 `fs.existsSync` 라 **tracked/untracked 를 구분하지 않는다**
   * (2026-07-27 재수렴 5차). 즉 "커밋 파일이 실재한다" 가 아니라 "그 경로에 파일이
   * 실재한다" 까지만 판정한다. 레포 루트를 cwd 로 sp-10-2 스펙을 로컬 실행하면 미추적
   * 잔여물이 같은 경로에 생겨 즉시 RED 인데, 그건 이월 사유 소멸이 아니라 실행 잔여물이다.
   * CI 는 `working-directory: qa/playwright` 로 돌고 서버 부재 시 hard-fail 이라 이 경로가
   * 생기지 않는다(무해함 실행 확인). 판정을 좁히지 않고 **메시지를 판정에 맞춘다** —
   * git 조회를 테스트에 끌어들이면 가드가 VCS 상태에 의존하게 되어 더 나빠진다.
   */
  it('G8d: 이월된 cwd-상대 인라인 목적지 경로에 파일이 실재하지 않는다 (이월 사유 생존 검사 — existsSync 라 tracked/untracked 는 구분하지 않는다)', () => {
    const violations: string[] = []
    for (const relFile of INLINE_RELATIVE_CARRIED_OVER) {
      const abs = path.resolve(REPO_ROOT, relFile)
      if (!fs.existsSync(abs)) {
        violations.push(`${relFile} → 이월 목록의 파일이 없다(이동/삭제?) — 목록을 갱신할 것`)
        continue
      }
      const src = stripComments(fs.readFileSync(abs, 'utf-8'))
      const dests = collectInlineLiteralDestinations(src)
      if (dests.length === 0) {
        violations.push(`${relFile} → 인라인 목적지 0건 — 이미 고쳐졌다면 이월 목록에서 뺄 것`)
        continue
      }
      for (const dest of dests) {
        if (fs.existsSync(path.resolve(REPO_ROOT, dest))) {
          violations.push(
            `${relFile} → ${dest} (이 경로에 파일이 실재한다. ` +
              `이 판정은 fs.existsSync 라 tracked/untracked 를 구분하지 않는다 — ` +
              `git ls-files 로 tracked 면 이월 사유 소멸이니 즉시 fix, ` +
              `아니면 레포 루트를 cwd 로 로컬 실행해 생긴 미추적 잔여물이니 지울 것)`,
          )
        }
      }
    }
    expect(
      violations,
      `이월 사유의 생존 검사가 걸렸다 — 각 줄의 판정 근거를 확인해 고치거나 목록에서 뺄 것:\n${violations.join('\n')}`,
    ).toEqual([])
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * G9 (2026-07-27 재수렴 5차 R-2) — **가드가 검사하는 표면 × 워크플로 트리거**.
   *
   * G8c 까지의 축은 "관할 루트가 가드 안에 다 들어왔는가" 였다. 그런데 관할 안에 있어도
   * **그 파일을 바꾸는 PR 이 CI 를 발동시키지 않으면 가드는 한 번도 안 돈다** — 관할은
   * 완전한데 실행이 0인 상태다. 실측(2026-07-27):
   *
   *   ci.yml   `pull_request.paths-ignore` 에 `docs/**`  → docs/qa 변경은 CI 자체가 skip
   *   qa-e2e.yml `pull_request.paths` 는 `qa/**`(≠ `docs/qa/**`) · `clients/**` · 서비스 3종
   *   그 외 워크플로는 arologis/estimate-app/order-app 전용 또는 schedule·tag 전용
   *
   * ⟹ `docs/qa/<slug>/capture.mjs` 만 추가하는 PR 은 **어떤 워크플로도** 돌지 않는다. 그
   * 파일의 관할자인 H2b·H2-py·H2-sh 는 6c49d39ad·44d718491 에서 관할로 편입됐는데, 정작
   * 그 관할을 건드리는 PR 이 게이트를 안 탄다.
   *
   * 그래서 손으로 적은 목록이 아니라 **가드가 실제로 스캔하는 파일 전수**를 GitHub Actions
   * 경로 필터 문법으로 직접 대조한다. 정적 근사의 한계는 파서 sanity 테스트가 지킨다.
   * ─────────────────────────────────────────────────────────────────────────────
   */
  const WORKFLOW_DIR = path.resolve(REPO_ROOT, '.github/workflows')

  /**
   * GitHub Actions 경로 필터 글롭 → 정규식.
   *
   * 공식 문법(Workflow syntax — 필터 패턴 치트시트)을 그대로 옮긴다:
   *   `*`  = `/` 를 **제외한** 0자 이상
   *   `**` = `/` 를 **포함한** 0자 이상
   * 그래서 `docs/qa/**.mjs` 는 `docs/qa/x.mjs` 와 `docs/qa/a/b/x.mjs` 를 모두 잡는다.
   *
   * ⚠️ 2026-07-27 정정 — 이 함수 원본 주석에 있던 "`docs/qa/**​/*.mjs` 형태는 `**` 가 0자일 때
   * 슬래시가 겹쳐 최상위 파일을 놓친다" 는 **사실이 아니다**. GitHub 공식 치트시트의
   * `docs/**​/*.md` 행이 드는 예시 매치가 바로 `docs/README.md`(=`**` 0 디렉토리)다. 그
   * 잘못된 근거로 `**.<ext>` 형태만 채택했었는데, 그 형태야말로 이 레포 전 이력에서 전례가
   * 없다(`c044cf652` 가 최초). 아래 `conservativeGlobToRegExp` 와 함께 쓰는 이유를 참조.
   *
   * `!` 부정 패턴은 이 레포가 쓰지 않으므로 다루지 않는다 — 새로 쓰이면 아래 sanity 가
   * 아니라 이 함수부터 고쳐야 한다.
   */
  function ghGlobToRegExp(glob: string): RegExp {
    let out = ''
    for (let i = 0; i < glob.length; i++) {
      const c = glob[i] as string
      if (c === '*') {
        if (glob[i + 1] === '*') {
          out += '.*'
          i++
        } else {
          out += '[^/]*'
        }
        continue
      }
      out += /[.+^${}()|[\]\\?]/.test(c) ? `\\${c}` : c
    }
    return new RegExp(`^${out}$`)
  }

  /**
   * ─── ① 글롭 해석 축 (2026-07-27 재수렴 6차) ──────────────────────────────────
   *
   * **보수적** 글롭 → 정규식. `**` 가 **경로 세그먼트 전체**일 때만 `/` 를 넘고, 세그먼트
   * 내부(`**.mjs`)에서는 `*` 로 강등된다 — Node 생태계 표준 구현인 minimatch 의 semantics 다.
   *
   * 왜 두 해석을 다 두는가:
   *   - GitHub **공식 치트시트**는 `'**.js'` 가 `js/index.js`·`src/js/app.js` 를 잡는다고 적는다
   *     (= `ghGlobToRegExp` 쪽). 그런데 같은 패턴을 minimatch 로 실측하면 `src/app.js` 는
   *     **미매치**다. 즉 두 구현이 실제로 갈린다.
   *   - GitHub 의 경로 필터는 서버측 구현이라 이 레포에서 **실행해 확인할 수 없다**(push 없이는
   *     워크플로 발동 여부를 측정할 방법이 없다). 문서는 `docs/qa/**.mjs` 를 지지하지만,
   *     `prefix/**.<ext>` 형태는 치트시트에 행이 없고 이 레포 전 이력에도 전례가 0이다.
   *   - ⟹ **측정 불가**이므로 안 덮일 수 있는 쪽(보수적 해석)을 기준으로 센다. 트리거가 두
   *     형태를 병기하면 어느 해석이 참이든 관할 파일이 전부 발동한다. 이것이 불변식이다.
   *
   * 이 함수는 위에서 실측한 minimatch 결과를 재현해야 한다 — 아래 sanity 가 그걸 고정한다.
   */
  function conservativeGlobToRegExp(glob: string): RegExp {
    const segs = glob.split('/')
    let out = ''
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i] as string
      const last = i === segs.length - 1
      if (seg === '**') {
        // 마지막 세그먼트면 나머지 전부, 아니면 "0개 이상 디렉토리".
        out += last ? '.*' : '(?:[^/]+/)*'
        continue
      }
      let body = ''
      for (let j = 0; j < seg.length; j++) {
        const c = seg[j] as string
        if (c === '*') {
          // 세그먼트 내부 `**` 는 `*` 로 강등(= minimatch).
          if (seg[j + 1] === '*') j++
          body += '[^/]*'
          continue
        }
        body += /[.+^${}()|[\]\\?]/.test(c) ? `\\${c}` : c
      }
      out += body + (last ? '' : '/')
    }
    return new RegExp(`^${out}$`)
  }

  /** `on:` 아래 2칸 들여쓰기 이벤트(pull_request 등) 블록 본문만 잘라낸다. */
  function eventBlock(yml: string, event: string): string {
    const lines = yml.split(/\r?\n/)
    const start = lines.findIndex((l) => new RegExp(`^  ${event}:\\s*$`).test(l))
    if (start < 0) return ''
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i] ?? ''
      if (l.trim() === '') continue
      if (!/^\s{3,}/.test(l)) {
        end = i
        break
      }
    }
    return lines.slice(start + 1, end).join('\n')
  }

  /** 블록 안 `<key>:` 시퀀스의 인용 문자열 항목 전수(주석/빈 줄 skip). */
  function yamlSeq(block: string, key: string): string[] {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => new RegExp(`^\\s*${key}:\\s*$`).test(l))
    if (start < 0) return []
    const base = (lines[start]?.match(/^\s*/)?.[0] ?? '').length
    const out: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i] ?? ''
      if (l.trim() === '' || /^\s*#/.test(l)) continue
      if ((l.match(/^\s*/)?.[0] ?? '').length <= base) break
      const m = l.match(/^\s*-\s*'([^']*)'\s*(?:#.*)?$/) ?? l.match(/^\s*-\s*"([^"]*)"\s*(?:#.*)?$/)
      if (m) out.push(m[1] ?? '')
    }
    return out
  }

  function ciPullRequestIgnores(): string[] {
    const yml = fs.readFileSync(path.join(WORKFLOW_DIR, 'ci.yml'), 'utf-8')
    return yamlSeq(eventBlock(yml, 'pull_request'), 'paths-ignore')
  }

  /**
   * ─── ② 커버리지 = 실행 (2026-07-27 재수렴 6차) ────────────────────────────────
   *
   * 이 자리에는 원래 `yml.includes('harness-false-green-guard')` 가 있었다. **문자열이 있는가**만
   * 봤기 때문에, 마커를 **주석에만** 적고 `echo` 만 하는 워크플로로 바꿔치기해도 G9 가 통과했다
   * (2026-07-27 실측: 그 상태로 `45 passed`. 대조군인 "워크플로 파일 삭제" 는 sanity·G9 둘 다 RED).
   *
   * 그래서 커버리지 인정 조건을 **"그 가드를 실제로 실행하는 `run:` 명령이 있는가"** 로 올린다.
   * 주석은 제거하고 보며, 블록 스칼라(`run: |`) 본문까지 이어 붙여 판정한다.
   */
  function stripYamlComments(yml: string): string {
    return yml
      .split(/\r?\n/)
      .map((l) => l.replace(/(^|\s)#.*$/, '$1'))
      .join('\n')
  }

  /** 워크플로의 모든 `run:` 명령 본문(주석 제거 · 블록 스칼라 병합). */
  function runCommands(yml: string): string[] {
    const lines = stripYamlComments(yml).split(/\r?\n/)
    const out: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const m = (lines[i] ?? '').match(/^(\s*)(?:-\s+)?run:\s*(\|[-+]?|>[-+]?)?\s*(.*)$/)
      if (!m) continue
      const indent = (m[1] ?? '').length
      let cmd = m[3] ?? ''
      if (m[2]) {
        for (let j = i + 1; j < lines.length; j++) {
          const b = lines[j] ?? ''
          if (b.trim() !== '' && (b.match(/^\s*/)?.[0] ?? '').length <= indent) break
          cmd += `\n${b}`
        }
      }
      out.push(cmd)
    }
    return out
  }

  interface WorkflowTrigger {
    readonly name: string
    /** `pull_request.paths`. 블록은 있는데 `paths` 가 없으면 전 경로 발동이라 `['**']`. */
    readonly paths: string[]
    /** `push.paths` — 같은 규칙. */
    readonly pushPaths: string[]
  }

  function eventPaths(yml: string, event: string): string[] {
    const block = eventBlock(yml, event)
    if (block.trim() === '') return []
    const paths = yamlSeq(block, 'paths')
    // `paths` 도 `paths-ignore` 도 없으면 그 이벤트는 전 경로에서 발동한다.
    return paths.length > 0 || yamlSeq(block, 'paths-ignore').length > 0 ? paths : ['**']
  }

  /**
   * `matches(runCommand)` 가 참인 `run:` 을 가진 워크플로들. ci.yml 은 제외한다 — ci.yml 은
   * 무시 목록을 **제공하는** 쪽이라 커버리지 계산의 대상이 아니다(`npm test` 로 전 vitest 를
   * 돌려 스펙 이름이 안 나오기도 한다).
   */
  function workflowsExecuting(matches: (cmd: string) => boolean): WorkflowTrigger[] {
    const out: WorkflowTrigger[] = []
    for (const name of fs.readdirSync(WORKFLOW_DIR)) {
      if (!/\.ya?ml$/.test(name) || name === 'ci.yml') continue
      const yml = fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf-8')
      if (!runCommands(yml).some(matches)) continue
      out.push({ name, paths: eventPaths(yml, 'pull_request'), pushPaths: eventPaths(yml, 'push') })
    }
    return out
  }

  const GUARD_SPEC_MARKER = 'harness-false-green-guard'

  /**
   * 테스트 러너 **호출**인가.
   *
   * 🚨 2026-07-27 뮤테이션 M2 가 잡은 구멍 — 처음엔 `\b(?:vitest|playwright|…)\b` 로 썼는데,
   * `playwright/sp-07-…/….spec.ts` 라는 **인자 경로 자체**가 `\bplaywright\b` 에 걸렸다.
   * 그래서 실행 줄을 `npx playwright test …` → `echo …` 로 바꿔치기해도 커버리지로 인정됐다
   * (= G9b 가 막으려던 "마커만 있고 실행은 안 함" 의 재발 형태). 러너 이름 뒤에 `/` 나
   * 단어문자가 오면 그건 경로지 명령이 아니다.
   */
  const RUNNER_INVOCATION =
    /\bplaywright\s+test(?![\w/])|\bvitest(?![\w/])|\bnode\s+--test(?![\w/])|\bnpm\s+(?:run\s+)?test(?![\w/])|\bjest(?![\w/])/

  /** 하네스 가드를 **실행**하는 명령인가 — 테스트 러너 호출 + 스펙 경로 둘 다 있어야 한다. */
  const RUNS_HARNESS_GUARD = (cmd: string): boolean =>
    RUNNER_INVOCATION.test(cmd) && cmd.includes(`test-utils/${GUARD_SPEC_MARKER}.test.ts`)

  function guardRunningWorkflowPaths(): string[] {
    return workflowsExecuting(RUNS_HARNESS_GUARD).flatMap((w) => w.paths)
  }

  /**
   * `files` 중 **ci.yml 이 무시**하는데(=ci.yml 이 안 돎) `runnerPaths` 중 어느 것도
   * 발동시키지 않는 것들. 무시 판정은 넓은 해석(공식 문서), 커버리지 판정은 **좁은 해석**
   * (보수적) — 두 축에서 최악을 잡아야 "어느 글롭 구현이든 덮인다" 를 보장한다.
   */
  function ungatedFiles(files: string[], runnerPaths: string[]): string[] {
    const ignored = ciPullRequestIgnores().map(ghGlobToRegExp)
    const covered = runnerPaths.map(conservativeGlobToRegExp)
    return files.filter((f) => ignored.some((re) => re.test(f)) && !covered.some((re) => re.test(f)))
  }

  /** 가드가 실제로 스캔하는 파일 전수(REPO_ROOT 상대, 슬래시 정규화) — guardRootFor 와 동일 규칙. */
  function guardScannedFiles(): string[] {
    const out = new Set<string>()
    for (const spec of GUARD_ROOTS) {
      const root = path.resolve(REPO_ROOT, spec.dir)
      if (!fs.existsSync(root)) continue
      const files = spec.recursive
        ? walk(root, (p) => spec.exts.test(p))
        : fs
            .readdirSync(root, { withFileTypes: true })
            .filter((e) => !e.isDirectory() && spec.exts.test(e.name))
            .map((e) => path.join(root, e.name))
      for (const f of files) {
        if (spec.exts === JS_CAPTURE_EXT && f.includes(`${path.sep}lib${path.sep}`)) continue
        out.add(path.relative(REPO_ROOT, f).replace(/\\/g, '/'))
      }
    }
    return [...out].sort()
  }

  it('G9 파서 sanity: 워크플로 트리거 파싱과 글롭 변환이 실제로 동작한다 (파싱이 깨지면 G9 는 항상 무의미하게 GREEN)', () => {
    expect(
      ciPullRequestIgnores().length,
      'ci.yml pull_request.paths-ignore 파싱 0건 — YAML 구조가 바뀌었다면 eventBlock/yamlSeq 부터 고칠 것',
    ).toBeGreaterThanOrEqual(5)
    expect(
      guardRunningWorkflowPaths().length,
      `이 가드를 실행하는 별도 워크플로의 pull_request.paths 파싱 0건 — YAML 구조가 바뀌었거나 ` +
        `그 워크플로가 사라졌다(${GUARD_SPEC_MARKER} 문자열로 식별한다)`,
    ).toBeGreaterThanOrEqual(5)
    expect(guardScannedFiles().length, '가드 스캔 파일 도출이 사실상 0건').toBeGreaterThan(50)
    // 글롭 변환 자기검사 — GitHub 문법(`*`=슬래시 제외, `**`=슬래시 포함)을 지키는지.
    expect(ghGlobToRegExp('docs/**').test('docs/qa/a/b.mjs'), '`**` 가 슬래시를 못 넘는다').toBe(true)
    expect(ghGlobToRegExp('docs/qa/**.mjs').test('docs/qa/a/b.mjs'), '중첩 경로 확장자 글롭 미매치').toBe(true)
    expect(ghGlobToRegExp('docs/qa/**.mjs').test('docs/qa/top.mjs'), '`**` 0자(최상위 파일) 미매치').toBe(true)
    expect(ghGlobToRegExp('docs/qa/**.mjs').test('docs/qa/a/b.js'), '확장자 구분이 안 된다').toBe(false)
    expect(ghGlobToRegExp('qa/**').test('docs/qa/a.mjs'), '`qa/**` 가 `docs/qa/**` 를 잘못 덮는다').toBe(false)

    // 보수적 변환 자기검사 — minimatch 실측치(2026-07-27, clients/desktop 의 minimatch)를 재현해야
    // 한다. 이게 넓은 해석과 같아져 버리면 아래 G9 의 "어느 해석이든" 축이 통째로 무의미해진다.
    const conservativeCases: [string, string, boolean][] = [
      ['docs/qa/**.mjs', 'docs/qa/a/b.mjs', false],
      ['docs/qa/**.mjs', 'docs/qa/a/b/c/d.mjs', false],
      ['docs/qa/**.mjs', 'docs/qa/top.mjs', true],
      ['docs/qa/**/*.mjs', 'docs/qa/a/b.mjs', true],
      ['docs/qa/**/*.mjs', 'docs/qa/a/b/c/d.mjs', true],
      ['docs/qa/**/*.mjs', 'docs/qa/top.mjs', true],
      ['docs/**', 'docs/qa/a/b.mjs', true],
      ['**.js', 'src/app.js', false],
    ]
    for (const [glob, file, want] of conservativeCases) {
      expect(
        conservativeGlobToRegExp(glob).test(file),
        `보수적 글롭 변환이 minimatch 실측과 다르다: ${glob} vs ${file}`,
      ).toBe(want)
    }

    // 러너 판정 자기검사 — 주석에만 마커가 있는 워크플로를 커버리지로 인정하면 안 된다.
    const commentOnly = [
      'name: probe',
      '# clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts 를 커버한다(주장)',
      'jobs:',
      '  x:',
      '    steps:',
      '      - run: echo "가드 안 돎"',
    ].join('\n')
    expect(
      runCommands(commentOnly).some(RUNS_HARNESS_GUARD),
      '주석에만 마커가 있는 워크플로가 커버리지로 인정된다 — 실행 여부를 안 보고 문자열만 본 것',
    ).toBe(false)
    const realRun = [
      'jobs:',
      '  x:',
      '    steps:',
      '      - run: npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts',
    ].join('\n')
    expect(runCommands(realRun).some(RUNS_HARNESS_GUARD), '실제 실행 명령을 못 알아본다').toBe(true)
    const blockScalar = ['jobs:', '  x:', '    steps:', '      - run: |', '          bash scripts/check-credential-plaintext.sh'].join('\n')
    expect(
      runCommands(blockScalar).some((c) => c.includes('scripts/check-credential-plaintext.sh')),
      '블록 스칼라(run: |) 본문을 못 읽는다',
    ).toBe(true)
  })

  it('G9: 가드가 스캔하는 파일 중 ci.yml 이 무시하는 것은 다른 워크플로가 반드시 발동시킨다 (게이트 0 표면 = RED)', () => {
    const ungated = ungatedFiles(guardScannedFiles(), guardRunningWorkflowPaths())
    expect(
      ungated,
      `가드 관할인데 **이 파일만 바뀌는 PR 은 어떤 워크플로도 돌지 않는다** — 가드가 실행되지 않으므로\n` +
        `위반이어도 조용히 GREEN 이다. ci.yml 의 paths-ignore 에서 빼거나(순수 문서 PR·QA 스크린샷\n` +
        `커밋까지 14 서비스 BE 매트릭스를 통째로 돌리게 된다), 그 구간만 여는 경량 워크플로를 둘 것.\n` +
        `⚠️ 커버리지는 **보수적 글롭 해석**으로 센다 — GitHub 서버 필터의 세그먼트 내부 \`**\` 처리를\n` +
        `이 레포에서 실측할 수 없으므로, 두 형태(\`p/**.ext\` · \`p/**/*.ext\`)를 병기해야 통과한다:\n${ungated.join('\n')}`,
    ).toEqual([])
  })

  it('G9b: 커버리지로 인정하는 워크플로는 그 가드를 실제로 실행한다 (마커가 주석에만 있는 워크플로는 인정 불가)', () => {
    const runners = workflowsExecuting(RUNS_HARNESS_GUARD)
    expect(
      runners.map((w) => w.name),
      `이 가드를 실행하는 별도 워크플로가 0건 — ci.yml 이 무시하는 구간이 통째로 게이트 0 이 된다`,
    ).not.toEqual([])
    for (const w of runners) {
      const yml = fs.readFileSync(path.join(WORKFLOW_DIR, w.name), 'utf-8')
      const cmds = runCommands(yml).filter(RUNS_HARNESS_GUARD)
      for (const cmd of cmds) {
        const spec = cmd.match(/\S*test-utils\/harness-false-green-guard\.test\.ts/)?.[0] ?? ''
        // 워크플로가 지정한 스펙 경로가 실재해야 한다 — 파일이 옮겨가면 잡은 즉시 RED 여야지,
        // "이름만 남은 워크플로" 로 조용히 살아 있으면 안 된다.
        expect(
          fs.existsSync(path.resolve(REPO_ROOT, 'clients/desktop', spec)),
          `${w.name} 이 실행한다는 스펙 경로가 실재하지 않는다: ${spec}`,
        ).toBe(true)
      }
    }
  })

  it('G10: 하네스 가드 워크플로는 push 와 pull_request 에서 같은 경로를 발동시킨다 (한쪽만 지워도 RED)', () => {
    for (const w of workflowsExecuting(RUNS_HARNESS_GUARD)) {
      expect(
        [...w.pushPaths].sort(),
        `${w.name}: push.paths 와 pull_request.paths 가 다르다 — G9 는 pull_request 만 읽어서\n` +
          `\`push:\` 블록이 통째로 사라져도 못 잡는다(2026-07-27 실측). 두 이벤트를 같이 유지할 것`,
      ).toEqual([...w.paths].sort())
    }
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * G11·G12 (2026-07-27 재수렴 6차) — **가드는 하네스 가드 하나가 아니다.**
   *
   * G9 는 `harness-false-green-guard.test.ts` 한 개의 관할만 본다. 그런데 같은 형태의 공백이
   * 다른 가드에도 있었다(실측):
   *
   *   D-1 `scripts/check-credential-plaintext.sh` — `docs/qa`·`docs/dev-reports`·
   *       `docs/operational-validation` 을 스캔하는데(.md/.mdx/.log 포함) 유일 러너가
   *       ci.yml 이고, ci.yml 의 `paths-ignore` 가 `docs/**` 다. 실제 main 커밋
   *       `fa678d63a`(docs/qa 전용 10파일) 의 check-runs 는 **total_count = 0** 이었다.
   *   D-2 `clients/desktop/scripts/round-910-contract.test.cjs` — 본문에서
   *       `docs/dev-reports/2026-07-25-910-app-client-identity.md` 를 단언하는데 러너가
   *       ci.yml `frontend-desktop` 이라 docs 전용 PR 은 skip 된다. 문서에 금지 서술 1줄을
   *       추가하면 로컬에선 RED(실측) 인데 CI 는 조용히 green 이다.
   * ─────────────────────────────────────────────────────────────────────────────
   */
  it('G11 (D-1, 보안): 자격 평문 가드가 관할하는 표면을 바꾸는 PR 은 그 가드를 실행한다', () => {
    const sh = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/check-credential-plaintext.sh'), 'utf-8')
    /** `CODE_DIRS=( ... )` / `DOC_DIRS=( ... )` 배열의 인용 항목 전수. */
    const scanDirs = ['CODE_DIRS', 'DOC_DIRS'].flatMap((name) => {
      const body = sh.match(new RegExp(`${name}=\\(([^)]*)\\)`))?.[1] ?? ''
      return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string)
    })
    expect(scanDirs.length, '자격 평문 가드의 스캔 디렉토리 파싱 0건 — 스크립트 구조가 바뀌었다').toBeGreaterThanOrEqual(8)

    // 각 스캔 루트의 최상위·중첩 대표 경로. 이 가드는 docs 하위에서 .md/.mdx/.log 도 본다.
    const probes = scanDirs.flatMap((d) => [`${d}/probe.md`, `${d}/nested/deep/probe.md`])
    const runnerPaths = workflowsExecuting((cmd) =>
      /\bbash\s+scripts\/check-credential-plaintext\.sh\b/.test(cmd),
    ).flatMap((w) => w.paths)
    const ungated = ungatedFiles(probes, runnerPaths)
    expect(
      ungated,
      `자격 평문 가드 관할인데 **그 경로만 바꾸는 PR 은 가드를 한 번도 돌리지 않는다** — 실 자격이\n` +
        `커밋돼도 조용히 머지된다(보안). ci.yml 의 paths-ignore 가 막는 구간을, 이 스크립트를 실제로\n` +
        `실행하는 경량 워크플로가 덮어야 한다:\n${ungated.join('\n')}`,
    ).toEqual([])
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * G12 (2026-07-27 재수렴 7차) — **열거를 도출로 바꾼다.**
   *
   * 재수렴 6차의 G12 는 여기서 `const rel = 'clients/desktop/scripts/round-910-contract.test.cjs'`
   * 로 **파일 하나를 손으로 적었다**. 같은 손 열거가 docs-guard.yml 헤더에도 있었다
   * ("`docs/**` 를 관할로 삼는 가드가 **두 개** 있다"). 둘 다 좁았다 — 레포에서 도출하면
   * 문서 본문을 단언하는 검사는 6개고, 그중 5개가 게이트 0 인 경로를 읽었다:
   *
   *   docs/handoff/CURRENT-WORK.md       ← sp-08-3-dispatch-parity.spec.ts (secret-like 마커 스캔)
   *   docs/planning/2026-05-16_…md       ← 같은 스펙
   *   docs/manual/inventory/*.md         ← sp-05-crud-surface.spec.ts
   *   docs/manual/02-창고/06-구매조회.md  ← purchase-inspection-cta.spec.ts
   *   docs/operational-validation/*.md   ← sp-06-notion-db-crud · sp-07-google-sheets-source
   *
   * 실측 ①(트리거가 0) — `docs/handoff/CURRENT-WORK.md` 단독 커밋 2건(cbfe2bea2 · a1aefdd20)의
   *   check-runs 는 `total_count: 0` 이었다. 이 파일은 CLAUDE.md 가 "PC 이동 직전 반드시 갱신"
   *   으로 규정한 **매 세션 main 직행 경로**이고, 그 자격 스캔을 담당하는 유일한 장치가 바로
   *   위 게이트 0 인 스펙이었다(셸 가드 DOC_DIRS 에도 없어 AWS 액세스 키 형태 주입 시 EXIT=0).
   * 실측 ②(트리거는 열렸는데 러너가 없다) — `docs/operational-validation/README.md` 의 한 구절을
   *   바꾸면 docs-guard.yml 두 잡은 EXIT=0(green) 인데 sp-07 스펙은 `1 failed / 5 passed` 다.
   *   ⟹ **트리거를 여는 것과 러너를 두는 것은 별개 축이고, 둘 다 필요하다.**
   *
   * ⚠️ 도출의 한계(주장하지 않는 것) — 아래 `docsAssertingChecks()` 는
   *   ⓐ `*.spec.ts` / `*.test.*` 네이밍을 따르는 파일만 본다(그 밖의 가드는 안 보인다),
   *   ⓑ **실재하는** `docs/…<확장자>` 문자열 리터럴만 센다(경로를 조립·보간하거나 아직 없는
   *      파일을 가리키는 읽기는 안 보인다),
   *   ⓒ 리터럴이 읽기 인자인지 쓰기 대상인지는 구분하지 않는다(파일에 읽기 primitive 가
   *      있으면 그 파일의 docs 리터럴을 전부 관할로 본다 — 과대 포함 쪽으로 틀린다),
   *   ⓓ desktop playwright 스위트의 `testIgnore` 만 반영한다(다른 스위트의 제외 규칙은 모른다).
   *   ⓔ 네이밍 미준수(`.cjs`/인라인)·config `testIgnore` 드리프트 사각은 가드 완전성
   *      미결정 문제로 2026-07-27 개발책임자 수용 — migration/ 갭만 이 PR에서 닫는다.
   * ─────────────────────────────────────────────────────────────────────────────
   */

  /** 실재 파일을 가리키는 `docs/**` 또는 `migration/**` 문자열 리터럴(글롭/치환자 형태는 존재 검사에서 탈락). */
  const DOCS_FILE_LITERAL = /['"`]((?:docs|migration)\/[^'"`\n]*?\.[A-Za-z0-9]+)['"`]/g

  /**
   * 문서 본문을 단언하는 **검사 파일 전수**를 네이밍 컨벤션에서 도출한다(손 열거 아님).
   * 자기 자신은 제외한다 — 이 파일의 `docs/…` 리터럴은 글롭 sanity 케이스와 합성 픽스처이고,
   * 이 파일이 스캔하는 표면은 G9 가 따로 검사한다.
   */
  function docsAssertingChecks(): { reader: string; docs: string[] }[] {
    const files = walkRepo(
      REPO_ROOT,
      (p) =>
        /\.test\.(?:ts|tsx|cjs|mjs|js)$/.test(p) ||
        (/\.spec\.ts$/.test(p) && (!p.startsWith(PLAYWRIGHT_DIR + path.sep) || isMockGateFile(p))),
    )
    const out: { reader: string; docs: string[] }[] = []
    for (const abs of files) {
      if (abs === SELF) continue
      const src = stripComments(fs.readFileSync(abs, 'utf-8'))
      if (!/readFileSync|readFile\s*\(/.test(src)) continue
      const docs = [...new Set([...src.matchAll(DOCS_FILE_LITERAL)].map((m) => m[1] as string))]
        .filter((f) => fs.existsSync(path.resolve(REPO_ROOT, f)))
        .sort()
      if (docs.length > 0) out.push({ reader: rel2(abs), docs })
    }
    return out.sort((a, b) => a.reader.localeCompare(b.reader))
  }

  function rel2(abs: string): string {
    return path.relative(REPO_ROOT, abs).replace(/\\/g, '/')
  }

  /**
   * `cmd` 가 `reader` 를 **직접 지목해 실행**하는가.
   * 러너 호출이 있어야 하고, 경로는 `working-directory` 를 파싱하지 않도록 "디렉토리 1개 이상 +
   * 파일명" 접미사 일치로 본다(`clients/desktop` 기준 상대 호출 대응).
   * ⚠️ 인자 없는 스위트 통짜 호출(`npx playwright test`)은 **커버리지로 세지 않는다** — 어떤
   * 스펙이 실제로 돌지 정적으로 알 수 없고, 그 낙관이 6차의 실패 형태였다.
   */
  function commandRunsReader(cmd: string, reader: string): boolean {
    if (!RUNNER_INVOCATION.test(cmd)) return false
    const segs = reader.split('/')
    for (let i = 0; i <= segs.length - 2; i++) {
      if (cmd.includes(segs.slice(i).join('/'))) return true
    }
    return false
  }

  it('G12 (도출식): 문서 본문을 단언하는 검사 전수를, 그 문서만 바꾸는 PR 이 실제로 실행한다', () => {
    const contracts = docsAssertingChecks()
    expect(
      contracts.length,
      '문서 단언 검사 도출 0건 — 도출 규칙(네이밍 컨벤션/리터럴 정규식)이 깨졌다면 이 테스트는 항상 무의미하게 GREEN 이다',
    ).toBeGreaterThanOrEqual(5)

    // 도출 자기검사 — 2026-07-27 에 실측한 두 표면을 실제로 잡아야 한다(회귀 앵커).
    const allDocs = new Set(contracts.flatMap((c) => c.docs))
    for (const anchor of [
      'docs/handoff/CURRENT-WORK.md',
      'docs/operational-validation/README.md',
      'migration/decisions/DECISIONS.md',
    ]) {
      expect(allDocs.has(anchor), `도출이 ${anchor} 를 놓쳤다 — 재수렴 7차의 실측 표면이다`).toBe(true)
    }

    // 러너 판정 자기검사 (뮤테이션 M2 회귀 울타리) — **인자 경로**에 러너 이름이 들어 있다는
    // 이유로 커버리지를 인정하면 안 된다. 실측: 이 구분이 없을 때 실행 줄을 `echo` 로 바꿔도
    // G12 가 통과했다(= 아무것도 안 돌리는데 green).
    const target = 'clients/desktop/playwright/sp-07-x/sp-07-x.spec.ts'
    const args = '\n            playwright/sp-07-x/sp-07-x.spec.ts'
    expect(
      commandRunsReader(`echo 가드-안-돎 \\${args}`, target),
      '실행 명령이 아닌데 인자 경로의 `playwright/` 때문에 러너로 인정된다',
    ).toBe(false)
    expect(
      commandRunsReader(`npx playwright test --reporter=line \\${args}`, target),
      '실제 playwright 실행 명령을 못 알아본다',
    ).toBe(true)
    expect(
      commandRunsReader(
        "node --test --test-name-pattern='문서는' clients/desktop/scripts/round-910-contract.test.cjs",
        'clients/desktop/scripts/round-910-contract.test.cjs',
      ),
      '`node --test` 호출을 못 알아본다',
    ).toBe(true)

    const violations: string[] = []
    for (const { reader, docs } of contracts) {
      const runners = workflowsExecuting((cmd) => commandRunsReader(cmd, reader))
      for (const f of ungatedFiles(docs, runners.flatMap((w) => w.paths))) {
        violations.push(`${f}\n      ← ${reader}`)
      }
    }
    expect(
      violations,
      `문서 본문을 단언하는 검사가 있는데 **그 문서만 바꾸는 PR 은 그 검사를 한 번도 돌리지 않는다**.\n` +
        `트리거만 여는 것으로는 부족하다 — 그 경로를 발동시키는 워크플로가 **그 검사를 실행**해야 한다\n` +
        `(docs-guard.yml 두 잡이 green 인 채로 sp-07 계약이 깨지는 것을 2026-07-27 실측했다):\n` +
        `${violations.join('\n')}`,
    ).toEqual([])

    for (const { reader, docs } of contracts) {
      const runners = workflowsExecuting((cmd) => commandRunsReader(cmd, reader)).filter((w) =>
        docs.some((f) => w.paths.some((g) => conservativeGlobToRegExp(g).test(f))),
      )
      // push 와 pull_request 가 갈리면 `docs/handoff/CURRENT-WORK.md` 처럼 **main 직행 push** 로
      // 갱신되는 파일이 통째로 미검사가 된다(PR 로만 오지 않는다).
      for (const w of runners) {
        expect(
          [...w.pushPaths].sort(),
          `${w.name}: push.paths 와 pull_request.paths 가 다르다 — 위 커버리지는 pull_request 만 읽는다`,
        ).toEqual([...w.paths].sort())
      }

      // 러너가 이름으로 좁혀 돈다면, 문서를 단언하는 테스트가 그 필터에 실제로 걸려야 한다 —
      // 안 걸리면 "0건 실행 후 exit 0" 이라는 새 거짓 green 이 된다.
      const src = fs.readFileSync(path.resolve(REPO_ROOT, reader), 'utf-8')
      const blocks = [...src.matchAll(/\b(?:test|it)\(\s*'([^']+)'/g)]
      const docAssertingNames = blocks
        .map((m, i) => ({
          name: m[1] as string,
          body: src.slice(m.index ?? 0, blocks[i + 1]?.index ?? src.length),
        }))
        .filter((t) => /['"`](?:docs|migration)\//.test(t.body))
        .map((t) => t.name)
      for (const w of runners) {
        const yml = fs.readFileSync(path.join(WORKFLOW_DIR, w.name), 'utf-8')
        for (const cmd of runCommands(yml).filter((c) => commandRunsReader(c, reader))) {
          const pattern = cmd.match(/--(?:test-name-pattern|grep)[= ]'([^']+)'/)?.[1]
          if (!pattern) continue
          const re = new RegExp(pattern)
          for (const name of docAssertingNames) {
            expect(
              re.test(name),
              `${w.name} 의 --test-name-pattern='${pattern}' 이 ${reader} 의 문서 단언 테스트\n` +
                `("${name}")를 안 잡는다 — 0건 실행 후 exit 0 이라 잡은 green 인데 아무것도 검사하지 않는다`,
            ).toBe(true)
          }
        }
      }
    }
  })
})
