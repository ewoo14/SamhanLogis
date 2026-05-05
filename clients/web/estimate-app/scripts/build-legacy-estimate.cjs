/* eslint-disable */
/**
 * 빌드 시 legacy estimate index.html 을 Vite 가 직접 서빙 가능한 정적 HTML 로 변환.
 *
 * <p>처리 단계:
 *   1) `migration/source/scripts/estimate/index.html` (18614 라인) 읽기
 *   2) Google Apps Script 템플릿 디렉티브 `<?!= include('X') ?>` 를 동일 디렉토리의 `X.html`
 *      파일 내용으로 inline 치환 (NanumGothic / NanumGothicBold / logo / stamp / samhan)
 *      — 단 NanumGothic / NanumGothicBold 는 6MB+ → public/fonts/ 로 외부화 + <link>/<script src> 참조
 *   3) `<?!= var ?>` (raw inline) 13종 → JS 표현식으로 변환:
 *        `<?!= homemulti ?>` → `(window.__SAMHAN_BOOTSTRAP__ && window.__SAMHAN_BOOTSTRAP__.homemulti) || '[]'`
 *      legacy 코드: `const HM_RAW = <?!= homemulti ?>;` → `const HM_RAW = (window.__SAMHAN_BOOTSTRAP__ && ...) || '[]';`
 *      → JSON.parse 호환 (이미 J() 함수가 string→array 처리). 빈 배열/객체 fallback.
 *   4) `<?= var ?>` (HTML escape) 5 site → JS 표현식으로 변환 후 inline:
 *        `<?= userEmail ?>` → `<span data-bs-key="userEmail"></span>` (head 의 main.ts 가 채움)
 *        단 JS 안 ("<?= userEmail ?>") 패턴은 `(window.__SAMHAN_BOOTSTRAP__.userEmail || '')` 로 변환
 *   5) `</head>` 직전에 `<script type="module" src="/src/main.ts"></script>` 삽입 (Vite entry)
 *   6) 결과를 `clients/web/estimate-app/index.html` 로 출력
 *
 * <p>실패 graceful:
 *   - source HTML 부재 시 → fallback minimal index.html 출력 (개발자 안내 + dev server 동작 보장)
 *
 * <p>호출:
 *   - `npm run prebuild:legacy` (manual)
 *   - `npm run dev` / `npm run build` 가 자동 prebuild step 으로 호출 (package.json scripts)
 *
 * <p>매핑 표는 `docs/dev-reports/legacy-rpc-mapping-estimate-app.md` 참고.
 *
 * <p>참조: clients/desktop/scripts/build-legacy-estimate.cjs (PR #51 — 동일 변환 패턴, 단
 * desktop 은 Electron webview 용 fallback shim 자동 주입, web 은 main.ts 가 ESM 으로 처리).
 */
const { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } = require('node:fs')
const { resolve, dirname } = require('node:path')

const ROOT = resolve(__dirname, '..', '..', '..', '..')
const SRC_DIR = resolve(ROOT, 'migration', 'source', 'scripts', 'estimate')
const SRC_INDEX = resolve(SRC_DIR, 'index.html')
const APP_ROOT = resolve(__dirname, '..')
const OUT_INDEX = resolve(APP_ROOT, 'index.html')
const PUBLIC_DIR = resolve(APP_ROOT, 'public')
const PUBLIC_FONTS_DIR = resolve(PUBLIC_DIR, 'fonts')
const PUBLIC_ASSETS_DIR = resolve(PUBLIC_DIR, 'legacy')

/**
 * Apps Script `<?!= include('NAME') ?>` 디렉티브 처리.
 *
 * <p>전략:
 * - NanumGothic / NanumGothicBold (6MB+ base64 폰트) → public/fonts/ 외부화 +
 *   `<link rel="stylesheet" href="/fonts/NanumGothic.css">` 참조 (Vite 가 그대로 서빙)
 * - logo / stamp / samhan (전역 var inline script) → public/legacy/ 외부화 +
 *   `<script src="/legacy/{name}.html"></script>` 참조 (HTML 파일이지만 <script> 태그 안 var 정의 → src 로 참조 불가)
 *   → 직접 inline 치환 (총 ~330KB, 부담 없음)
 */
function resolveIncludes(html, srcDir) {
  return html.replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (match, name) => {
    const includePath = resolve(srcDir, `${name}.html`)
    if (!existsSync(includePath)) {
      console.warn(`[build-legacy-estimate] include 파일 없음: ${name}.html — 빈 placeholder`)
      return `<!-- include('${name}') 없음 -->`
    }
    const content = readFileSync(includePath, 'utf8')
    const sizeKB = Math.round(content.length / 1024)

    // 폰트 (6MB+) — base64 ttf 데이터로 jsPDF VFS 등록 시점에만 사용 (line 11588~).
    // v1 단계: 폰트 inline = HTML +12MB (parsing 부담), 동적 fetch = parser-blocking 위험.
    // 절충안: public/fonts/{name}.html 로 외부화 + 인쇄 트리거 시점 lazy load.
    // legacy 는 `typeof NanumGothic !== 'undefined'` 체크로 graceful → 미주입 시 PDF 만 폰트 fallback.
    // v1 에서는 lazy 도 생략 — PDF 출력은 후속 v2 백엔드 (estimate-service /pdf endpoint) 가 책임.
    // 단 자료 동기화 위해 public/fonts 로 복사 (런타임 미사용, 후속 v2 lazy 사용 대비).
    if (name === 'NanumGothic' || name === 'NanumGothicBold') {
      ensureDir(PUBLIC_FONTS_DIR)
      const dstPath = resolve(PUBLIC_FONTS_DIR, `${name}.html`)
      writeFileSync(dstPath, content, 'utf8')
      console.log(
        `[build-legacy-estimate] include('${name}') → public/fonts/${name}.html (${sizeKB} KB) — 외부화 (런타임 미주입, 후속 v2 lazy 대비)`,
      )
      // legacy `typeof NanumGothic !== 'undefined'` 가 false 로 분기 → jsPDF 가 기본 폰트 사용
      return `<!-- include('${name}') v1 외부화: /fonts/${name}.html (lazy load 미구현, 후속 v2) -->`
    }

    // 그 외 (logo / stamp / samhan) — 외부화 (총 ~330KB inline 시 Edge headless 메모리 부담)
    // public/legacy/{name}.html 로 복사 + defer script 로 lazy load (BizGate 후 비동기 진입 OK)
    ensureDir(PUBLIC_ASSETS_DIR)
    const dstPath = resolve(PUBLIC_ASSETS_DIR, `${name}.html`)
    writeFileSync(dstPath, content, 'utf8')
    console.log(
      `[build-legacy-estimate] include('${name}') → public/legacy/${name}.html (${sizeKB} KB) — defer XHR inject`,
    )
    // defer XHR + regex 추출 (parse5 가 inline <script> 안 'script' 문자열을 닫는 태그로 오해해 빌드 실패 → 정규식 사용).
    // 단순 inject 가 아닌 `new Function(text)()` 회피 (CSP 호환) → script 태그 .textContent 사용.
    return `<script>
(function(){
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/legacy/${name}.html', true);
    x.onload = function(){
      if (x.status === 200) {
        // legacy include 파일은 <script>var X = "..."<\/script> 형태 — 정규식 추출 후 신규 script 태그로 inject.
        var TAG = String.fromCharCode(60) + 's' + 'cript';
        var ETAG = String.fromCharCode(60) + '/' + 's' + 'cript';
        var re = new RegExp(TAG + '[^>]*>([\\\\s\\\\S]*?)' + ETAG + '>', 'g');
        var m;
        while ((m = re.exec(x.responseText)) !== null) {
          var s = document.createElement(String.fromCharCode(115)+'cript');
          s.text = m[1];
          document.head.appendChild(s);
        }
      }
    };
    x.send();
  } catch(e) { console.warn('[legacy asset load] ${name}', e); }
})();
</script>`
  })
}

/**
 * `<?!= var ?>` (raw inline) 13종 → JS 표현식 변환.
 *
 * legacy 패턴:
 *   const HM_RAW = <?!= homemulti ?>;
 *
 * 변환 후:
 *   const HM_RAW = ((window.__SAMHAN_BOOTSTRAP__ && window.__SAMHAN_BOOTSTRAP__.homemulti) || '[]');
 *
 * <p>shim 의 fetchBootstrap 결과가 string (JSON 문자열) 또는 array 양쪽 모두 가능하도록
 * 빈 배열 fallback 은 string `'[]'` 을 사용 (legacy J() 가 string→array 처리).
 *
 * <p>config / specDetailMap / recommendData / priceInc 같은 객체형은 빈 객체 `'{}'` fallback —
 * legacy J() 가 동일하게 string→object 처리.
 */
function transformBracketBangVars(html) {
  // include('...') 외의 일반 변수 — array 형/object 형 분류
  const ARRAY_VARS = new Set([
    'homemulti',
    'singleSets',
    'singleParts',
    'commercialMulti',
    'commercialParts',
    'oldProducts',
  ])
  // 그 외 (homeDefaults / singleDefaults / singleMatPrices / config / specDetailMap /
  // recommendData / priceInc) 는 객체형
  return html.replace(/<\?!=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\?>/g, (match, varName) => {
    const fallback = ARRAY_VARS.has(varName) ? "'[]'" : "'{}'"
    return `((window.__SAMHAN_BOOTSTRAP__ && window.__SAMHAN_BOOTSTRAP__.${varName}) || ${fallback})`
  })
}

/**
 * `<?= var ?>` (HTML escape) → 두 가지 컨텍스트 분기:
 *
 * 1. JS 안 ("<?= userEmail ?>") — 따옴표 안에 위치 → `' + (window.__SAMHAN_BOOTSTRAP__.userEmail || '') + '`
 * 2. HTML 안 (<span><?= userEmail ?></span>) — `<span data-bs-key="userEmail"></span>` (DOM 진입 후 채움)
 *
 * <p>본 estimate index.html 에서는 모두 단순 변환 가능:
 *   - line 1248: `<span style="...">{{userEmail}}</span>` (HTML)
 *   - line 1257: `<div class="auth-msg">...{{userEmail}}</div>` (HTML)
 *   - line 2091: `JSON.parse('<?= authData ?>')` (JS 안 string)
 *   - line 8717: `const USER_EMAIL = "<?= userEmail ?>"` (JS 안 string)
 *   - line 18541: `alert('...접속 계정: <?= userEmail ?>)')` (JS 안 string)
 *
 * <p>JS 안 패턴은 따옴표 escape 안전성을 위해 함수 호출로 변환:
 *   `"<?= userEmail ?>"` → `(((window.__SAMHAN_BOOTSTRAP__ || {}).userEmail) || '')`
 *
 * 단 `JSON.parse('<?= authData ?>')` 는 → `JSON.stringify(((window.__SAMHAN_BOOTSTRAP__ || {}).authData) || {})` 로 치환 후
 * JSON.parse 호출 — authData 자체를 JSON object 로 가정.
 */
function transformBracketEqVars(html) {
  // 1. JSON.parse('<?= authData ?>') 특수 패턴 — authData 객체로 직접 변환
  html = html.replace(
    /JSON\.parse\(\s*'<\?=\s*authData\s*\?>'\s*\)/g,
    `(((window.__SAMHAN_BOOTSTRAP__ || {}).authData) || { authorized: false })`,
  )

  // 2. JS 안 따옴표 — "<?= var ?>" 또는 '<?= var ?>'
  html = html.replace(
    /"<\?=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\?>"/g,
    (m, v) => `(((window.__SAMHAN_BOOTSTRAP__ || {}).${v}) || '')`,
  )
  html = html.replace(
    /'<\?=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\?>'/g,
    (m, v) => `(((window.__SAMHAN_BOOTSTRAP__ || {}).${v}) || '')`,
  )

  // 3. 일반 string concat 안 (예: alert('... <?= userEmail ?>)') — JS context 안 inline → 함수 표현식
  // 위 따옴표 패턴 외의 잔여 — string template 처럼 ' + ... + ' 형태로 변환
  html = html.replace(
    /<\?=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\?>/g,
    (m, v) => {
      // HTML body 안일 가능성 — 안전하게 data-bs-key 로 mark + JS 가 채움
      // (단순 markup tagging; main.ts 가 DOMContentLoaded 후 채울 수 있도록)
      return `<span data-bs-key="${v}"></span>`
    },
  )

  return html
}

/**
 * `</head>` 직전에 Vite ESM entry script 삽입.
 *
 * <p>shim 이 `window.google.script.run` Proxy + `window.__SAMHAN_BOOTSTRAP__ = {}` 를
 * 동기 주입 — DOMContentLoaded 시점의 legacy init 보다 먼저 실행됨 (defer 모듈은 HTML parse
 * 완료 후 그러나 DOMContentLoaded 직전 실행).
 *
 * <p>또한 `data-bs-key` span 채움 helper 도 head 에 inline 으로 삽입 — main.ts 의 bootstrap-ready
 * 이벤트 listener 가 동작.
 */
function injectViteEntry(html) {
  const entryTag = `<script type="module" src="/src/main.ts"></script>
<script>
/* estimate-app v1 — data-bs-key span 채움 helper (build-legacy-estimate 가 transformBracketEqVars 로 생성한 marker) */
document.addEventListener('DOMContentLoaded', function(){
  function fillKeys(){
    var bs = window.__SAMHAN_BOOTSTRAP__ || {};
    var nodes = document.querySelectorAll('[data-bs-key]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-bs-key');
      var v = bs[key];
      if (v != null) nodes[i].textContent = String(v);
    }
  }
  fillKeys();
  document.addEventListener('samhan:bootstrap-ready', fillKeys);
});
</script>
`
  if (html.includes('</head>')) {
    return html.replace('</head>', `${entryTag}</head>`)
  }
  return entryTag + html
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** legacy 자료 부재 시 fallback HTML — dev server 가 항상 유효한 entry 보유. */
function writeFallback() {
  const fallback = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>종합견적서 (legacy 미반영)</title>
<style>
body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:0;}
.empty{max-width:640px;margin:80px auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;}
h1{margin-top:0;font-size:20px;}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;}
.hint{color:#475569;font-size:14px;line-height:1.6;}
</style>
<script type="module" src="/src/main.ts"></script>
</head>
<body>
<div class="empty">
<h1>legacy estimate 자료 미반영</h1>
<p class="hint">
<code>migration/source/scripts/estimate/</code> 가 비어 있어 본 entry 는 placeholder 로 표시됩니다.
<br/>해당 자료는 <code>feature/legacy-migration-discovery</code> 브랜치 머지 후 자동 반영됩니다.
</p>
<p class="hint">
빌드 단계에서 <code>scripts/build-legacy-estimate.cjs</code> 가 자료 존재 여부를 확인 후
실 HTML 또는 본 placeholder 를 생성합니다.
</p>
</div>
</body>
</html>
`
  writeFileSync(OUT_INDEX, fallback, 'utf8')
  console.log(`[build-legacy-estimate] fallback 출력: ${OUT_INDEX}`)
}

/** 메인 빌드 루틴. */
function main() {
  ensureDir(APP_ROOT)
  ensureDir(PUBLIC_DIR)

  if (!existsSync(SRC_INDEX)) {
    console.warn(`[build-legacy-estimate] source 없음: ${SRC_INDEX} — fallback 출력`)
    writeFallback()
    return
  }

  console.log(`[build-legacy-estimate] source 읽기: ${SRC_INDEX}`)
  let html = readFileSync(SRC_INDEX, 'utf8')
  const srcLines = html.split('\n').length
  console.log(`[build-legacy-estimate] source 라인: ${srcLines}`)

  console.log(`[build-legacy-estimate] include 5종 치환 중`)
  html = resolveIncludes(html, SRC_DIR)

  console.log(`[build-legacy-estimate] <?!= var ?> 13종 → JS 표현식 변환 중`)
  html = transformBracketBangVars(html)

  console.log(`[build-legacy-estimate] <?= var ?> 5 site → marker / 함수 표현식 변환 중`)
  html = transformBracketEqVars(html)

  console.log(`[build-legacy-estimate] Vite ESM entry + bootstrap helper 주입 중`)
  html = injectViteEntry(html)

  // 잔여 디렉티브 검사 (변환 누락 안전망)
  const remaining = (html.match(/<\?[!=]?[\s\S]*?\?>/g) || []).length
  if (remaining > 0) {
    console.warn(
      `[build-legacy-estimate] 경고: ${remaining}개 Apps Script 디렉티브 미변환 — 매핑 보강 필요`,
    )
  }

  writeFileSync(OUT_INDEX, html, 'utf8')
  console.log(
    `[build-legacy-estimate] 출력 완료: ${OUT_INDEX} (${html.length} bytes / ${html.split('\n').length} 라인)`,
  )
}

if (require.main === module) main()

module.exports = {
  resolveIncludes,
  transformBracketBangVars,
  transformBracketEqVars,
  injectViteEntry,
}
