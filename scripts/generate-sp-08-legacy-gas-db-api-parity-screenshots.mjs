import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resolveQaShotsDir } from './lib/qa-shots-dir.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/sp-08-legacy-gas-db-api-parity/screenshots'))
const requireFromDesktop = createRequire(new URL('../clients/desktop/package.json', import.meta.url))
const { chromium } = requireFromDesktop('@playwright/test')

const palette = {
  bg: '#F6F7F9',
  ink: '#17202A',
  muted: '#667085',
  line: '#D8DEE8',
  card: '#FFFFFF',
  navy: '#17212B',
  blue: '#2563EB',
  green: '#16A34A',
  teal: '#0F8A83',
  amber: '#D97706',
  red: '#DC2626',
}

const sidebar = [
  '견적서 관리',
  '주문서 관리',
  '거래처 DC 설정',
  '배차지역 관리',
  'DPS 입고 비교',
  '배차안내 문자',
  '회계 출력',
  '운영 검증',
]

const screens = [
  {
    file: '01-legacy-gas-coverage-matrix.png',
    active: '운영 검증',
    role: 'PM',
    title: 'Legacy GAS coverage matrix',
    subtitle: '18개 상위 GAS 프로그램 + nested 배치 2건을 Samhan DB/API 전환 대상으로 잠금',
    headers: ['그룹', 'legacy GAS', 'Samhan Public 기준', 'SP-08 상태'],
    rows: [
      ['견적/주문', '종합견적서 / 거래처 발송 주문서', 'partner-order + product DB', 'SP-07 기반 유지'],
      ['Notion 파생 마스터', '단톡방 / 발송금지 / 배차지역 / DC', 'notification / partner / arologis / dc-config DB', 'DB CRUD 회귀'],
      ['배차', '가배차 / 지방가배차 / 미배차 / 문자 / 운송사 비교', 'arologis + slip + notification API', '후속 parity 대상'],
      ['창고', 'DPS 입고기록 / 품목별 DPS', 'inventory DB/API', '후속 parity 대상'],
      ['회계', '원장 / 거래명세서 / 계산서 / 일마감', 'accounting + slip DB/API', '후속 parity 대상'],
      ['외부', '알리고 / 외부 연동', 'dry-run client + partner-order 연동', '후속 parity 대상'],
    ],
    cards: [
      ['원칙', ['UI와 기능은 legacy 그대로', 'Notion 통신만 DB/API로 교체', 'raw 원본은 read-only'], palette.teal],
      ['이번 잠금', ['Inde.html 오타 표면 포함', '노션 live 저장 문구 제거', '저장내역 기간 필터 복원'], palette.blue],
      ['비노출', ['UUID/secret/raw token 없음', '사업자번호/전표번호만 표시', 'PR 캡처 regex 검사'], palette.green],
      ['다음', ['DPS 저장내역', '배차문자 preview/send', '회계 인쇄 mock 제거'], palette.amber],
    ],
  },
  {
    file: '02-notion-db-api-source-map.png',
    active: '거래처 DC 설정',
    role: 'Backend',
    title: 'Notion-origin data source map',
    subtitle: 'Notion 표는 DB로 이관된 snapshot이며 운영 CRUD는 Samhan DB/API만 사용',
    headers: ['데이터셋', 'DB/API owner', '운영 UI', '검증'],
    rows: [
      ['단톡방리스트', 'notification-service', '단톡방 관리', 'list/add/import/delete'],
      ['발송금지리스트', 'partner-service', '발송금지 관리', 'list/block/import/unblock'],
      ['배차지역 분류표', 'arologis-service', '배차지역 관리', 'list/add/import/edit/delete'],
      ['거래처 DC정보', 'dc-config-service', '거래처 DC 설정', 'list/patch/import/audit'],
      ['주문서 저장내역', 'partner-order-service', '거래처 주문서', 'partner/date DB query'],
    ],
    cards: [
      ['Source of truth', ['Samhan Public DB', 'service-per-DB CRUD', 'gateway no-strip 유지'], palette.teal],
      ['UI copy', ['노션에 저장 제거', '기존 CSV / DB 이관 시드', '원본 생성 컬럼명'], palette.blue],
      ['Runtime guard', ['api.notion.com 미사용', 'Notion-Version 미사용', 'order/estimate active code 잠금'], palette.green],
      ['Import', ['CSV는 재이관 reference', '멱등 upsert', 'Soft Delete only'], palette.amber],
    ],
  },
  {
    file: '03-notion-derived-crud-four-pages.png',
    active: '배차지역 관리',
    role: 'Frontend',
    title: 'Notion-derived four CRUD pages',
    subtitle: '사용자 화면은 DB 관리 화면으로 보이고, legacy 원천명은 운영 CSV 의미로만 남긴다',
    headers: ['화면', '버튼/탭', '사용자 문구', 'UUID'],
    rows: [
      ['단톡방 관리', '단건 추가 / CSV 업로드 / 삭제', 'DB 이관 시드 / 원본 생성', '미노출'],
      ['발송금지 관리', '단건 차단 / CSV 업로드 / 해제', 'DB 이관 CSV', '미노출'],
      ['배차지역 관리', '단건 추가 / CSV 일괄 등록 / 수정', '기존 운영 CSV', '미노출'],
      ['거래처 DC 설정', '검색 / CSV 일괄 업로드 / 저장 / 이력', '기존 운영 CSV', '미노출'],
    ],
    cards: [
      ['권한', ['MASTER import/delete', 'MANAGER read/edit 일부', 'role 풀네임만 표기'], palette.teal],
      ['레이블', ['Notion 생성 -> 원본 생성', '노션 다운로드 -> 기존 운영 CSV', '노션 가져오기 -> DB 이관 CSV'], palette.blue],
      ['상태', ['SP-06 CRUD 유지', 'SP-08 문구 회귀 잠금', 'QA 캡처 포함'], palette.green],
      ['위험', ['CSV 컬럼명 drift', 'name-only alias', '중복 row soft delete'], palette.amber],
    ],
  },
  {
    file: '04-dispatch-gas-parity-flows.png',
    active: '배차안내 문자',
    role: 'Designer',
    title: 'Dispatch GAS parity flows',
    subtitle: '가배차/지방가배차/미배차/전표정리/문자/운송사 비교는 legacy 탭 순서와 표 헤더를 유지해야 함',
    headers: ['legacy 화면', '필수 흐름', '표시 식별자', '후속 구현'],
    rows: [
      ['가배차분류', '업로드 -> 분류 결과 -> 저장내역', '전표번호 / 거래처명', 'tabs/history 복원'],
      ['지방가배차', '권역 필터 -> 시도 분류', '지역명 / 분류 그룹', 'legacy 라벨 캡처'],
      ['미배차리스트', '필터 -> 결과 -> CSV/copy', '전표번호 / 거래처명', '3종 리스트 대조'],
      ['배차안내문자', '미리보기 -> dry-run/send -> 이력', '전표번호 / 카톡방명', 'SMS preview/send'],
      ['운송사 비교', '업로드 -> 실배차 대조 -> export', '배차번호 / 운송사명', 'Inde.html 포함'],
    ],
    cards: [
      ['UI 보존', ['새 마케팅형 화면 금지', '탭/버튼 순서 유지', '표 헤더 캡처'], palette.teal],
      ['DB/API', ['arologis DB', 'slip-service', 'notification-service'], palette.blue],
      ['업무번호', ['YYYY/MM/DD-N', 'T/TR prefix 금지', 'UUID 미노출'], palette.green],
      ['QA', ['desktop 1280x900', '여러 상세 PNG', 'skip 0'], palette.amber],
    ],
  },
  {
    file: '05-warehouse-dps-parity.png',
    active: 'DPS 입고 비교',
    role: 'QA',
    title: 'Warehouse DPS parity',
    subtitle: 'DPS 비교류는 단순 DB 표가 아니라 업로드, 비교결과, 품목 pivot, 저장내역까지 legacy 흐름을 검증',
    headers: ['프로그램', 'legacy controls', 'DB/API 전환', 'QA 포인트'],
    rows: [
      ['DPS 입고기록 비교', '파일 업로드 / 결과 / 저장', 'inventory API history', '좌우 비교 헤더'],
      ['품목별 DPS 입고내역 비교', '품목 pivot / 필터 / copy', 'inventory API pivot', '품목별 집계'],
      ['공통 저장내역', 'latest/history restore', 'legacy gas history/state', '수동 저장 복원'],
    ],
    cards: [
      ['현재 갭', ['저장/복원 탭 단순화', 'history/state 공통 API 필요', '후속 SP-08-2 후보'], palette.red],
      ['보존', ['업로드 -> 결과 -> 저장내역', 'copy/export', '권한 거부 상태'], palette.blue],
      ['데이터', ['inventory DB', 'legacy upload snapshot', '멱등 history'], palette.green],
      ['캡처', ['업로드 영역', '비교 결과 헤더', '저장내역 복원'], palette.amber],
    ],
  },
  {
    file: '06-accounting-gas-parity.png',
    active: '회계 출력',
    role: 'Backend',
    title: 'Accounting GAS parity',
    subtitle: '원장/거래명세서/계산서/일마감은 legacy 출력 양식과 옵션을 DB/API로 채워야 함',
    headers: ['legacy GAS', '필수 옵션', 'DB/API owner', '상태'],
    rows: [
      ['거래처별 원장', '기간 / 거래처 / 인쇄', 'accounting-service', '인쇄 mock 제거 필요'],
      ['일괄 거래명세서', '기간 / 거래처 / page-break', 'accounting-service', '인쇄 mock 제거 필요'],
      ['계산서일괄등록양식', '엑셀 업로드 / 제외코드 / history', 'accounting-service', 'Hometax 탭 양호'],
      ['일마감', '날짜 / 특이사항 / 역마감', 'accounting-service', '옵션 parity 확인'],
    ],
    cards: [
      ['금지', ['출력 양식 리디자인 금지', 'mock 상호/품목 최종 금지', 'hard delete 금지'], palette.red],
      ['표시', ['사업자번호 XXX-XX-XXXXX', '전표번호 YYYY/MM/DD-N', 'UUID 미노출'], palette.blue],
      ['테스트', ['print route screenshot', 'history restore', 'excluded code CRUD'], palette.green],
      ['문서', ['legacy 옵션 matrix', 'OpenAPI/Javadoc', 'dev-report'], palette.amber],
    ],
  },
  {
    file: '07-vendor-aligo-parity.png',
    active: '주문서 관리',
    role: 'Frontend',
    title: 'Vendor and Aligo parity',
    subtitle: '에어디자이너/제이시스템 주문 흐름과 알리고 업로드는 기존 UI 흐름을 보존하고 외부 호출은 dry-run/mock로 검증',
    headers: ['legacy', '컨트롤', 'DB/API 전환', '주의'],
    rows: [
      ['에어디자이너 주문서 흐름', 'PDF 다중 파일 / 담당자 / 미리보기 / 전송', 'partner-order 연동', 'UI parity 미흡'],
      ['제이시스템 주문서 흐름', '이미지 다중 파일 / 거래처 / 담당자 / 슬라이드 preview', 'partner-order 연동', 'UI parity 미흡'],
      ['알리고 자동 업로드', '주소록 sync / 그룹 선택 / 결과', 'notification dry-run', '실 키 비공개'],
    ],
    cards: [
      ['SP-07 유지', ['주문서는 *_단가인상 lookup', 'priceBasis UI 추가 금지', 'GAS 계산 흐름 유지'], palette.teal],
      ['외부 호출', ['Aligo key 미노출', 'dryRun 기본', 'RestClient mock'], palette.blue],
      ['화면 갭', ['vendor 라디오 단순화 상태', '다중 파일 preview 복원 필요', '담당자명 입력'], palette.red],
      ['QA', ['두 vendor 선택 캡처', 'preview/history 캡처', 'secret scan'], palette.amber],
    ],
  },
  {
    file: '08-quote-order-source-and-history.png',
    active: '주문서 관리',
    role: 'Backend',
    title: 'Quote/order source and snapshot history',
    subtitle: '견적/주문 UI는 그대로 두고, 저장내역은 legacy safeBizNo/date 인자를 DB API query로 전달',
    headers: ['기능', 'legacy 인자', 'Samhan API', 'SP-08 보정'],
    rows: [
      ['견적 저장', 'custName + snapshot', 'Samhan DB save', '노션 저장 문구 제거'],
      ['주문 저장내역', 'safeBizNo, sDate, eDate', 'GET /partner-orders/drafts', 'from/to만 query 전달'],
      ['draft backend', '거래처 + 기간', 'createdAt date range', 'optional filter 추가'],
      ['카탈로그', '_단가인상 기본', 'product DB / partner-order lookup', 'SP-07 유지'],
    ],
    cards: [
      ['호환', ['old callers still work', 'date params optional', 'partner header remains owner'], palette.green],
      ['UI', ['Samhan DB에 저장', '저장내역 기간 필터', '모바일 390px 추가 캡처 예정'], palette.blue],
      ['테스트', ['PartnerOrderDraftServiceIT', 'order-app typecheck', 'SP-08 static contract'], palette.teal],
      ['금지', ['Notion runtime read/write', '새 옵션 발명', 'secret-bearing tab read'], palette.amber],
    ],
  },
  {
    file: '09-uuid-hidden-scan.png',
    active: '운영 검증',
    role: 'QA',
    title: 'UUID hidden scan',
    subtitle: 'SP-08 캡처와 DOM 검증은 업무번호와 거래처 식별자만 노출해야 함',
    headers: ['대상', '허용 표시', '금지 표시', '검증'],
    rows: [
      ['전표/배차', 'YYYY/MM/DD-N', 'UUID / internal id', 'regex scan'],
      ['거래처', 'partnerCode / companyName / 사업자번호', 'row id UUID', 'DOM + screenshot'],
      ['주문/견적', 'orderNo / estimateNo / draftSeq', 'draftId UUID', 'aria/data-testid'],
      ['원천/secret', '환경변수명', 'API key / SA private key / Sheet id full value', 'grep guard'],
    ],
    cards: [
      ['현재', ['SP-03~07 UUID 가드 유지', 'SP-08 screenshot regex 예정', 'source id 전체 캡처 금지'], palette.teal],
      ['업무번호', ['전표/배차 번호 중복 허용', '메뉴별 속성으로 구분', 'UUID는 hidden PK'], palette.blue],
      ['역할', ['MASTER', 'MANAGER', 'DISPATCH', 'WAREHOUSE', 'ACCOUNTANT'], palette.green],
      ['PR', ['캡처 설명에 확인 결과 기재', 'raw URL inline', '0 skip'], palette.amber],
    ],
  },
  {
    file: '10-business-number-format-scan.png',
    active: '거래처 DC 설정',
    role: 'Designer',
    title: 'Business number format scan',
    subtitle: '사업자번호는 입력 정규화 후 사용자 화면에서 XXX-XX-XXXXX 형식을 유지',
    headers: ['화면', '입력', '표시', '검증'],
    rows: [
      ['거래처 주문서 gate', 'raw 10자리 / hyphen', 'XXX-XX-XXXXX', 'normalize + display'],
      ['거래처 DC 설정', 'partnerCode 검색', '상호 + 사업자번호', 'UUID 없음'],
      ['알리고 주소록', '이카운트 거래처', '사업자번호 format', 'secret 없음'],
      ['회계 출력', '거래명세서/계산서', '사업자번호 format', 'print capture'],
    ],
    cards: [
      ['원칙', ['raw input 허용', '표시는 hyphen format', '잘못된 값 reject 또는 normalize'], palette.teal],
      ['legacy', ['GAS 입력 습관 유지', '출력 양식은 그대로', '새 설명 텍스트 과다 금지'], palette.blue],
      ['테스트', ['order-app mobile width', 'desktop admin table', 'print preview'], palette.green],
      ['후속', ['거래처 생성 UI 누락 재점검', 'vendor master CRUD', 'partner-auth batch'], palette.amber],
    ],
  },
  {
    file: '11-no-skip-verification-summary.png',
    active: '운영 검증',
    role: 'QA',
    title: 'No-skip verification summary',
    subtitle: 'SP-08-1은 정적 계약 + targeted backend + typecheck로 시작하고 후속 parity는 같은 가드에 누적',
    headers: ['검증', '명령', '기대', 'skip'],
    rows: [
      ['static', 'sp-08-legacy-gas-db-api-parity.spec.ts', '6 passed', '0'],
      ['backend', 'PartnerOrderDraftServiceIT', '3 tests pass', '0'],
      ['desktop', 'npm run typecheck', 'pass', '0'],
      ['order-app', 'npm ci + npm run typecheck', 'pass', '0'],
      ['screenshots', 'generate-sp-08...', '11 PNG non-zero', '0'],
    ],
    cards: [
      ['CI 전', ['lint/build 추가 실행', 'git diff --check', 'skip XML scan'], palette.teal],
      ['PR', ['5-team review', 'TM 통합', 'Claude review', 'Codex review'], palette.blue],
      ['머지', ['checks watch', 'green 후 PM 재점검', 'delete branch'], palette.green],
      ['다음 PR', ['DPS/배차/회계/vendor 연동 PR 분해', '각 PR 상세 캡처'], palette.amber],
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
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1280px; height: 900px; font-family: Arial, "Malgun Gothic", sans-serif; background: ${palette.bg}; color: ${palette.ink}; }
    .shell { display: grid; grid-template-columns: 230px 1fr; height: 900px; }
    .side { background: ${palette.navy}; color: white; padding: 28px 18px; }
    .brand { font-weight: 800; font-size: 20px; margin-bottom: 8px; }
    .role { color: #B8C4D4; font-size: 12px; margin-bottom: 28px; }
    .nav { display: grid; gap: 8px; }
    .nav div { padding: 10px 12px; border-radius: 6px; color: #D7DEE8; font-size: 14px; }
    .nav .on { background: #FFFFFF18; color: white; border-left: 4px solid ${palette.teal}; }
    .main { padding: 30px; overflow: hidden; }
    .kicker { color: ${palette.teal}; font-weight: 800; font-size: 13px; margin-bottom: 8px; }
    h1 { margin: 0; font-size: 31px; line-height: 1.18; letter-spacing: 0; }
    .sub { margin-top: 8px; color: ${palette.muted}; font-size: 15px; line-height: 1.5; max-width: 920px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 22px 0 18px; }
    .card { background: ${palette.card}; border: 1px solid ${palette.line}; border-radius: 8px; padding: 14px 14px 12px; min-height: 118px; }
    .card h2 { margin: 0 0 9px; font-size: 14px; color: ${palette.ink}; display: flex; align-items: center; gap: 8px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .card p { margin: 5px 0; color: ${palette.muted}; font-size: 12px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid ${palette.line}; border-radius: 8px; overflow: hidden; table-layout: fixed; }
    th { text-align: left; background: #EEF2F7; color: #344054; font-size: 12px; padding: 11px 12px; border-bottom: 1px solid ${palette.line}; }
    td { padding: 10px 12px; border-bottom: 1px solid #EDF1F6; font-size: 13px; line-height: 1.35; word-break: keep-all; }
    tr:last-child td { border-bottom: 0; }
    .footer { margin-top: 14px; display: flex; justify-content: space-between; color: ${palette.muted}; font-size: 12px; }
    .stamp { color: ${palette.green}; font-weight: 800; }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="side">
      <div class="brand">Samhan Public</div>
      <div class="role">SP-08 / ${escapeHtml(screen.role)}</div>
      <div class="nav">
        ${sidebar.map((item) => `<div class="${item === screen.active ? 'on' : ''}">${escapeHtml(item)}</div>`).join('')}
      </div>
    </aside>
    <main class="main">
      <div class="kicker">Legacy GAS DB/API Parity</div>
      <h1>${escapeHtml(screen.title)}</h1>
      <div class="sub">${escapeHtml(screen.subtitle)}</div>
      <section class="cards">
        ${screen.cards.map(([title, lines, color]) => `
          <article class="card">
            <h2><span class="dot" style="background:${color}"></span>${escapeHtml(title)}</h2>
            ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
          </article>`).join('')}
      </section>
      <table>
        <thead><tr>${screen.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${screen.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      <div class="footer">
        <span>UI/기능 유지, Notion runtime 통신은 Samhan DB/API로 치환</span>
        <span class="stamp">UUID/secret hidden</span>
      </div>
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
    await page.setContent(renderScreen(screen), { waitUntil: 'load' })
    await page.screenshot({ path: path.join(outDir, screen.file), fullPage: false })
  }
} finally {
  await browser.close()
}

const files = await fs.readdir(outDir)
for (const file of files.filter((name) => name.endsWith('.png')).sort()) {
  const stat = await fs.stat(path.join(outDir, file))
  if (stat.size === 0) {
    throw new Error(`Empty screenshot generated: ${file}`)
  }
}

console.log(`Generated ${screens.length} SP-08 QA screenshots in ${outDir}`)
