import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resolveQaShotsDir } from './lib/qa-shots-dir.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/sp-07-google-sheets-quote-order-e2e/screenshots'))
const requireFromDesktop = createRequire(new URL('../clients/desktop/package.json', import.meta.url))
const { chromium } = requireFromDesktop('@playwright/test')

const palette = {
  bg: '#F5F7FA',
  ink: '#17202A',
  muted: '#667085',
  line: '#D7DEE8',
  navy: '#17212B',
  teal: '#168A83',
  blue: '#2563EB',
  green: '#16A34A',
  amber: '#D97706',
  card: '#FFFFFF',
}

const sidebar = [
  '견적서 관리',
  '주문서 관리',
  '시트 동기화',
  '품목 관리',
  '운영 검증',
  '보안 가드',
]

const screens = [
  {
    file: '01-live-spreadsheet-tab-inventory.png',
    active: '운영 검증',
    role: 'PM',
    title: '종합 견적서 live spreadsheet inventory',
    subtitle: '27개 tab을 connector로 확인하고 source / output / credential-bearing 폼을 분리',
    headers: ['분류', 'tab', '역할', 'Samhan Public 반영'],
    rows: [
      ['current source', '홈멀티_단가인상', '종합견적서 기본 단가', 'Product DB sync'],
      ['current source', '싱글 세트_단가인상', 'C열 모델명 / H열 납품가', 'Product DB sync'],
      ['current source', '상업멀티 구성_단가인상', 'B열 모델명 / F열 납품가', 'Product DB sync'],
      ['base source', '홈멀티 / 싱글 세트 / 상업멀티 구성', '인상 전 단가 + 주문서 base payload', 'PriceHistory / Bootstrap'],
      ['output/form', '종합견적서 / 전표업로드목록', '출력·업로드 조립 양식', '카탈로그 원본 제외'],
      ['credential-bearing', '전표생성폼', '인증키/계정값 보유 제어 폼', '문서·캡처 값 게시 금지'],
    ],
    cards: [
      ['Spreadsheet', ['종합 견적서', 'ID 1RJqO3jT-...IKXuVNQ', 'locale ko_KR / Asia-Seoul'], palette.teal],
      ['Tab count', ['27개 tab', '거래처 6992 rows', '템플릿/hidden tab 구분'], palette.blue],
      ['보안', ['credential-bearing 값 미게시', '개인 연락처 row 미게시', '제품 샘플만 문서화'], palette.green],
      ['정책', ['GAS UI/기능 그대로 유지', 'Notion 통신만 DB/API 치환', 'flat range override 기본 미사용'], palette.amber],
    ],
  },
  {
    file: '02-source-tabs-vs-output-forms.png',
    active: '보안 가드',
    role: 'Designer',
    title: 'Source tab과 output/control form 분리',
    subtitle: '견적서처럼 보이는 tab을 단가 원본으로 오인하지 않도록 PR 캡처와 테스트에 고정',
    headers: ['tab', 'connector 확인', '읽기 허용', '사유'],
    rows: [
      ['홈멀티_단가인상', 'AJ060MXHNBC1 / 납품가 1,611,115', '예', '제품 단가 source'],
      ['싱글 세트_단가인상', 'AC060CS6PBH1SY / 납품가 1,490,000', '예', '제품 단가 source'],
      ['상업멀티 구성_단가인상', 'AM080AXVHHH1 / 납품가 4,715,370', '예', '제품 단가 source'],
      ['종합견적서', '견 적 서 출력 양식', '아니오', 'output/form'],
      ['전표업로드목록', '전표 업로드 조립 영역', '아니오', 'output/form'],
      ['전표생성폼', 'credential-bearing 제어 폼', '아니오', 'secret guard'],
    ],
    cards: [
      ['UI 문구', ['source tab', 'output/form', 'credential-bearing'], palette.teal],
      ['리뷰 관점', ['캡처에서 원본/출력 구분', '민감값 없는 샘플', '긴 식별자 최소화'], palette.blue],
      ['Notion 원칙과 동일', ['외부 원천은 이관/검증용', '운영 통신은 우리 API', 'CRUD는 DB 기준'], palette.green],
      ['후속', ['품목 마스터 UI 후보', 'SA runtime 검증', 'flat catalog 사용 시 별도 승인'], palette.amber],
    ],
  },
  {
    file: '03-bootstrap-secure-range-map.png',
    active: '시트 동기화',
    role: 'Backend',
    title: 'Bootstrap secure range-map',
    subtitle: 'partner-order 부팅 prefetch는 GAS처럼 base payload와 단가인상 helper를 읽고 config는 DB seed fallback으로 처리',
    headers: ['cacheKey', 'range', '상태', '비고'],
    rows: [
      ['homemulti', '홈멀티!A1:Z', '허용', 'base source'],
      ['homeInc', '홈멀티_단가인상!A1:Z', '허용', '단가인상 helper'],
      ['singleSets', '싱글 세트!A1:Z', '허용', 'C열 모델명'],
      ['singleInc', '싱글 세트_단가인상!A1:Z', '허용', '단가인상 helper'],
      ['singleParts', '싱글 구성품!A1:Z', '허용', 'C열 모델명'],
      ['singlePartsInc', '싱글 구성품_단가인상!A1:Z', '허용', '단가인상 helper'],
      ['commercialMulti', '상업멀티!A1:Z', '허용', 'B열 모델명'],
      ['commInc', '상업멀티_단가인상!A1:Z', '허용', '단가인상 helper'],
      ['commercialParts', '상업멀티 구성!A1:Z', '허용', 'F열 납품가'],
      ['config', '설정!A1:Z', '제거', 'live tab 없음 + seed fallback'],
    ],
    cards: [
      ['변경 파일', ['partner-order application.yml', 'BootstrapServiceTest', 'SP-07 Playwright contract'], palette.teal],
      ['Secret guard', ['전표생성폼 미조회', '전표업로드목록 미조회', 'DC secret 9키 strip'], palette.blue],
      ['Fallback', ['sheet read 실패 시 V2 seed', 'config는 항상 safe copy', '부팅 차단 없음'], palette.green],
      ['회귀 테스트', ['config seed fallback 검증', 'never read bad ranges', '0 skip 기준'], palette.amber],
    ],
  },
  {
    file: '04-catalog-lookup-column-contract.png',
    active: '주문서 관리',
    role: 'Backend',
    title: '주문서 catalog lookup column 계약',
    subtitle: '기존 주문 UI/API는 유지하고 ProductCatalogLookupClient는 *_단가인상 tab으로 modelCode 단가 조회',
    headers: ['source tab', 'name col', 'model col', 'unit price col'],
    rows: [
      ['홈멀티_단가인상', 'A', 'B', 'F'],
      ['싱글 세트_단가인상', 'A', 'C', 'H'],
      ['싱글 구성품_단가인상', 'A', 'C', 'H'],
      ['상업멀티_단가인상', 'A', 'B', 'G'],
      ['상업멀티 구성_단가인상', 'A', 'B', 'F'],
      ['구형', 'A', 'B', 'F'],
    ],
    cards: [
      ['샘플', ['AC060CS6PBH1SY -> 1,490,000', 'AM080AXVHHH1 -> 4,715,370', 'AJ060MXHNBC1 -> 1,611,115'], palette.teal],
      ['금지', ['종합견적서!A2:C 기본 사용 금지', '전표업로드목록 lookup 금지', '전표생성폼 lookup 금지'], palette.blue],
      ['UI 원칙', ['새 priceBasis 옵션 없음', '기존 업로드 화면 유지', 'GAS 기능 변경 아님'], palette.green],
      ['테스트', ['ProductCatalogLookupClientTest', 'SP-07 static contract', 'live snapshot doc'], palette.amber],
    ],
  },
  {
    file: '05-product-db-sync-contract.png',
    active: '품목 관리',
    role: 'TM',
    title: 'Product DB sync contract',
    subtitle: 'product-service는 *_단가인상을 기본 단가로, base tab을 인상 전 단가 PriceHistory로 동기화',
    headers: ['tab', 'product category', 'model col', 'delivery price col'],
    rows: [
      ['홈멀티', 'HOME_MULTI', 'B', 'F'],
      ['홈멀티_단가인상', 'HOME_MULTI current', 'B', 'F'],
      ['싱글 세트', 'SINGLE_SET', 'C', 'H'],
      ['싱글 세트_단가인상', 'SINGLE_SET current', 'C', 'H'],
      ['싱글 구성품', 'SINGLE_PART', 'C', 'H'],
      ['상업멀티 구성', 'COMMERCIAL_PART', 'B', 'F'],
    ],
    cards: [
      ['DB 원칙', ['Google Sheet -> product DB sync', '화면/API는 product DB 조회', 'PriceHistory로 인상 전 단가 보존'], palette.teal],
      ['정합성', ['C열/H열 싱글 세트 회귀 방지', 'F열 상업멀티 구성 납품가', 'formatted value 파싱'], palette.blue],
      ['비노출', ['UUID/내부키 화면 노출 없음', 'modelCode/productName 중심', '가격은 업무값'], palette.green],
      ['검증', ['ProductSheetSyncServiceIT', 'Testcontainers PostgreSQL', 'skip 0 목표'], palette.amber],
    ],
  },
  {
    file: '06-verification-matrix.png',
    active: '운영 검증',
    role: 'QA',
    title: 'SP-07 verification matrix',
    subtitle: '라이브 connector evidence, static contract, backend targeted test, screenshot guard',
    headers: ['검증', '대상', '기대', 'skip'],
    rows: [
      ['connector', '종합 견적서 metadata/ranges', '27 tab + 안전 샘플 확인', '0'],
      ['static contract', 'sp-07-google-sheets-source', 'range-map / docs / mapping GREEN', '0'],
      ['backend', 'Bootstrap + Catalog lookup', 'config seed fallback + source tab lookup', '0'],
      ['backend IT', 'ProductSheetSyncServiceIT', 'DB sync column mapping GREEN', '0'],
      ['screenshots', 'PNG 6장', '민감값/개인 row 없음', '0'],
    ],
    cards: [
      ['PM 기준', ['GAS UI/기능 그대로 유지', 'Notion 통신만 DB/API 치환', '운영 CRUD는 Samhan DB/API'], palette.teal],
      ['CI', ['PR 생성 후 checks watch', 'fail 시 즉시 fix', 'green 후 PM 재점검'], palette.blue],
      ['PR 캡처', ['6장 이상 상세 첨부', 'raw SHA URL 사용', '모바일/데스크톱에서 잘 보이게'], palette.green],
      ['다음 후보', ['SP-08 권한/UUID 회귀', '품목 마스터 7탭 UI', 'SA runtime 검증'], palette.amber],
    ],
  },
]

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderScreen(screen) {
  const nav = sidebar
    .map(item => `<div class="nav ${item === screen.active ? 'active' : ''}">${escapeHtml(item)}</div>`)
    .join('')
  const rows = screen.rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const cards = screen.cards
    .map(([title, lines, accent]) => `
      <section class="card" style="--accent:${accent}">
        <h2>${escapeHtml(title)}</h2>
        ${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
      </section>
    `)
    .join('')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1280px; height: 900px; font-family: "Malgun Gothic", "Segoe UI", sans-serif; background: ${palette.bg}; color: ${palette.ink}; }
  .screen { width: 1280px; height: 900px; display: grid; grid-template-columns: 238px 1fr; }
  aside { background: ${palette.navy}; color: white; padding: 28px 18px; }
  .brand { font-weight: 900; font-size: 25px; margin-bottom: 4px; }
  .slug { font-size: 12px; color: #A8B3C2; font-weight: 800; letter-spacing: .08em; margin-bottom: 30px; }
  .nav { min-height: 36px; padding: 9px 14px; margin-bottom: 5px; color: #D0D8E4; font-size: 14px; }
  .nav.active { background: #1E3A3D; border-left: 4px solid ${palette.teal}; color: white; font-weight: 900; }
  main { padding: 34px 42px 28px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 22px; }
  h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.15; letter-spacing: 0; }
  .sub { margin: 0; color: ${palette.muted}; font-size: 16px; line-height: 1.45; }
  .role { background: ${palette.card}; border: 1px solid ${palette.line}; border-radius: 6px; padding: 10px 14px; font-weight: 900; color: ${palette.teal}; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; background: ${palette.card}; border: 1px solid ${palette.line}; border-radius: 8px; overflow: hidden; table-layout: fixed; }
  th { text-align: left; background: #EEF3F8; color: #344054; font-size: 13px; padding: 13px 14px; border-bottom: 1px solid ${palette.line}; }
  td { padding: 13px 14px; font-size: 13.5px; line-height: 1.35; border-bottom: 1px solid #E7ECF3; word-break: keep-all; overflow-wrap: anywhere; }
  tr:last-child td { border-bottom: 0; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 20px; }
  .card { background: ${palette.card}; border: 1px solid ${palette.line}; border-top: 5px solid var(--accent); border-radius: 8px; padding: 15px 14px; min-height: 150px; }
  .card h2 { margin: 0 0 10px; font-size: 17px; letter-spacing: 0; }
  .card p { margin: 7px 0; color: #344054; font-size: 13px; line-height: 1.38; }
  .footer { display: flex; justify-content: space-between; color: #7A8697; font-size: 12px; margin-top: 18px; }
</style>
</head>
<body>
  <div class="screen">
    <aside>
      <div class="brand">Samhan Public</div>
      <div class="slug">SP-07 QA CAPTURE</div>
      ${nav}
    </aside>
    <main>
      <div class="top">
        <div>
          <h1>${escapeHtml(screen.title)}</h1>
          <p class="sub">${escapeHtml(screen.subtitle)}</p>
        </div>
        <div class="role">${escapeHtml(screen.role)}</div>
      </div>
      <table>
        <thead><tr>${screen.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="grid">${cards}</div>
      <div class="footer"><span>2026-05-16 · Google Sheets live source validation</span><span>credential values intentionally omitted</span></div>
    </main>
  </div>
</body>
</html>`
}

await fs.mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  for (const screen of screens) {
    await page.setContent(renderScreen(screen), { waitUntil: 'networkidle' })
    await page.screenshot({ path: path.join(outDir, screen.file), fullPage: false })
  }
} finally {
  await browser.close()
}

// _local 격리(2026-07-27 재수렴 3차 W1 — outDir 는 이미 감쌌지만 체크리스트 .md 쓰기는
// 커밋 경로를 직접 가리켰다. 같은 resolveQaShotsDir 규약으로 감싼다).
const checklistDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/sp-07-google-sheets-quote-order-e2e'))
await fs.writeFile(
  path.join(checklistDir, 'screenshot-checklist.md'),
  `# SP-07 QA 캡처 체크리스트

| # | 파일 | 내용 |
|---|---|---|
${screens.map((screen, index) => `| ${String(index + 1).padStart(2, '0')} | \`${screen.file}\` | ${screen.title} |`).join('\n')}

모든 이미지는 1280x900 PNG이며, credential-bearing 값과 거래처 개인 연락처 row는 포함하지 않는다.
`,
  'utf8',
)

console.log(`generated ${screens.length} screenshots in ${outDir}`)
