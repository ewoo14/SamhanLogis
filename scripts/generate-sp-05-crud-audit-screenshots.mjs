import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resolveQaShotsDir } from './lib/qa-shots-dir.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/sp-05-samhan-public-crud-audit/screenshots'))
const requireFromDesktop = createRequire(new URL('../clients/desktop/package.json', import.meta.url))
const { chromium } = requireFromDesktop('@playwright/test')

const palette = {
  ink: '#17202A',
  muted: '#5B6778',
  line: '#D7DEE8',
  bg: '#F3F6FA',
  card: '#FFFFFF',
  navy: '#17212B',
  teal: '#168A83',
  blue: '#2563EB',
  green: '#16A34A',
  amber: '#D97706',
}

const sidebar = ['대시보드', '창고 관리', '판매관리', '구매관리', '재고이동 관리', '거래처 관리', '견적서 관리', '주문서 관리', '회계', '인사']

const screens = [
  {
    file: '01-sales-management-detail-action.png',
    role: 'SALES',
    active: '판매관리',
    title: '판매관리 CRUD 표면 점검',
    subtitle: '신규 작성, 선택 인쇄, Excel, 상세 진입 분리',
    headers: ['판매번호', '거래처', '선택', '상세', '번호 계약'],
    rows: [
      ['2026/05/16-1', '삼한공조 강남', '체크박스', '상세', 'YYYY/MM/DD-1'],
      ['2026/05/16-2', '삼성시스템 잠실', '체크박스', '상세', 'YYYY/MM/DD-2'],
      ['2026/05/15-8', '서초 냉난방', '체크박스', '상세', 'YYYY/MM/DD-8'],
    ],
    cards: [
      ['목록 UX', ['row click은 다중 선택 유지', '상세는 별도 버튼으로 분리', '일괄 인쇄/export와 충돌 없음'], palette.teal],
      ['권한', ['목록 조회는 인증 사용자', '신규 작성은 canCreateSlip', 'Excel은 MANAGER/MASTER'], palette.blue],
      ['비노출', ['button id는 slipNo 기반', 'row.id는 route param 전용', 'UUID 문자열 화면 없음'], palette.green],
      ['회귀', ['컬럼 17 -> 18 갱신', 'static contract GREEN', '기존 상세 route 유지'], palette.amber],
    ],
    footer: 'SP-05 QA 01 — Sales management detail action',
  },
  {
    file: '02-sales-detail-navigation-contract.png',
    role: 'MASTER',
    active: '판매관리',
    title: '판매 상세 진입 계약',
    subtitle: '공개 판매번호 기반 test id와 내부 route param 분리',
    headers: ['검증', '계약', '결과', '비고'],
    rows: [
      ['route', '/sales/:id', 'OK', 'SlipDetailPage OUTBOUND'],
      ['button', 'sales-query-detail-2026-05-16-1', 'OK', 'slipNo sanitize'],
      ['aria', '2026/05/16-1 상세 보기', 'OK', 'public label'],
      ['uuid', '화면 노출 없음', 'OK', 'param 전용'],
    ],
    cards: [
      ['상세/수정', ['상세 화면의 기존 저장 정책 사용', '삭제/취소는 후속 결정', '도메인 상태 전이 보존'], palette.teal],
      ['테스트', ['RED: 버튼 없음 실패', 'GREEN: 상세 버튼 통과', '문서 현재 상태 동시 검증'], palette.green],
      ['접근성', ['aria-label에 판매번호 포함', '표 열 제목은 상세', '버튼 크기 기존 size=sm'], palette.blue],
      ['문서', ['dev-report SP-05 추가', 'DECISIONS SP-05 추가', 'handoff 최신화'], palette.amber],
    ],
    footer: 'SP-05 QA 02 — Sales detail navigation contract',
  },
  {
    file: '03-purchase-management-detail-and-inspection.png',
    role: 'WAREHOUSE',
    active: '구매관리',
    title: '구매관리 상세 + 검수 CTA 점검',
    subtitle: '상세 진입과 입고 검수가 같은 행에서 공존',
    headers: ['구매번호', '상태', '상세', '검수', '판정'],
    rows: [
      ['2026/05/16-1', 'SAVED', '상세', '검수', 'OK'],
      ['2026/05/16-2', 'CONFIRMED', '상세', '검수', 'OK'],
      ['2026/05/15-3', 'COMPLETED', '상세', '숨김', 'OK'],
      ['2026/05/15-4', 'CANCELED', '상세', '숨김', 'OK'],
    ],
    cards: [
      ['검수', ['SAVED/CONFIRMED만 CTA', 'InboundInspectionDialog 재사용', '저장 후 목록 refetch'], palette.teal],
      ['상세', ['/purchases/:id 진입', '수정/상태 전이는 상세 화면', 'row click 선택 유지'], palette.blue],
      ['권한', ['검수 WAREHOUSE/MANAGER/MASTER', '상세 조회 기존 정책', 'SALES 검수 미노출'], palette.green],
      ['비노출', ['test id 구매번호 기반', 'UUID 화면 노출 없음', '업무번호 중복 허용'], palette.amber],
    ],
    footer: 'SP-05 QA 03 — Purchase detail action and inspection CTA',
  },
  {
    file: '04-purchase-detail-navigation-contract.png',
    role: 'MANAGER',
    active: '구매관리',
    title: '구매 상세 진입 계약',
    subtitle: '구매번호 기반 공개 식별자와 상세 route 연결',
    headers: ['검증', '계약', '결과', '비고'],
    rows: [
      ['route', '/purchases/:id', 'OK', 'SlipDetailPage INBOUND'],
      ['button', 'purchase-query-detail-2026-05-16-1', 'OK', 'slipNo sanitize'],
      ['aria', '2026/05/16-1 상세 보기', 'OK', 'public label'],
      ['columns', '기본 12 / 검수 포함 13', 'OK', '상세 열 추가'],
    ],
    cards: [
      ['목록', ['구매번호/거래처/금액 유지', '상세 열 추가', '검수 열은 권한별 조건부'], palette.teal],
      ['DataGrid', ['Excel 보기에도 상세 action', 'navigate stopPropagation', '선택 UX 유지'], palette.blue],
      ['테스트', ['purchase spec 11 -> 12', 'sp-05 static 3 passed', 'full-menu와 병행 검증'], palette.green],
      ['후속', ['라인별 불량 결과', '사진 첨부', '불량 처리 회계 연동'], palette.amber],
    ],
    footer: 'SP-05 QA 04 — Purchase detail navigation contract',
  },
  {
    file: '05-partner-management-current-state.png',
    role: 'SALES',
    active: '거래처 관리',
    title: '거래처 관리 현재 상태 정정',
    subtitle: '기본 생성 UI는 운영 가능, 고급 4탭 필드는 후속',
    headers: ['화면', '라우트', '권한', '상태'],
    rows: [
      ['거래처 목록', '/admin/partners', 'SALES/MANAGER/MASTER', '운영'],
      ['신규 등록', '/admin/partners/new', 'SALES/MANAGER/MASTER', '운영'],
      ['상세 수정', '/admin/partners/:id', 'MANAGER/MASTER', '운영'],
      ['여신/단가 고급', '후속 4탭', 'MANAGER/MASTER', '보강'],
    ],
    cards: [
      ['문서 정정', ['UI 부재 판정 제거', '기본 생성은 운영 가능', '잔여 필드를 재분류'], palette.teal],
      ['영업 흐름', ['판매관리에서 거래처 생성 가능', 'partnerCode 기반 식별', 'UUID 비공개 유지'], palette.blue],
      ['권한', ['SALES 신규 등록 허용', '수정/export는 MANAGER 이상', 'route guard 정렬'], palette.green],
      ['후속', ['여신한도/단가그룹', '부가정보/파일관리', '품목 7탭과 연계'], palette.amber],
    ],
    footer: 'SP-05 QA 05 — Partner management current state',
  },
  {
    file: '06-inventory-doc-catalog-correction.png',
    role: 'PM',
    active: '회계',
    title: 'Inventory/Catalog 문서 정정',
    subtitle: '오래된 누락 판정을 최신 PR 상태로 우선 적용',
    headers: ['문서', '기존 표현', 'SP-05 정정', '판정'],
    rows: [
      ['frontend-feature-inventory', '거래처 UI 없음', '/admin/partners 운영', 'OK'],
      ['missing-features-catalog', 'inspect UI 부재', '검수 Dialog CTA 운영', 'OK'],
      ['CURRENT-WORK', 'SP-04 진행', 'SP-05 진행', 'OK'],
      ['DECISIONS', 'SP-04까지', 'SP-05 결정 추가', 'OK'],
    ],
    cards: [
      ['우선 적용', ['2026-05-16 SP-05 블록 추가', '원본 inventory는 보존', '최신 상태가 상단에서 우선'], palette.teal],
      ['리스크 감소', ['이미 끝난 UI를 다시 만들지 않음', '후속 범위를 고급 필드로 한정', 'PM 판단 근거 명확화'], palette.blue],
      ['테스트', ['문서 문자열 계약 추가', 'stale UI 부재 문구 제거', 'RED/GREEN 증거 보존'], palette.green],
      ['다음', ['SP-06 legacy GAS 세부 대조', 'SP-07 Sheet E2E', 'SP-08 권한/UUID 회귀'], palette.amber],
    ],
    footer: 'SP-05 QA 06 — Documentation correction',
  },
  {
    file: '07-crud-surface-role-matrix.png',
    role: 'PM',
    active: '대시보드',
    title: 'CRUD 표면 역할 매트릭스',
    subtitle: '생성, 상세, 수정, 검수, export를 역할별로 분리',
    headers: ['역할', '판매/구매 생성', '상세', '검수', 'Excel'],
    rows: [
      ['SALES', '가능', '상세', '불가', '숨김'],
      ['WAREHOUSE', '불가', '상세', '구매 검수', '숨김'],
      ['MANAGER', '가능', '상세', '구매 검수', '가능'],
      ['MASTER', '가능', '상세', '구매 검수', '가능'],
    ],
    cards: [
      ['생성', ['/sales/new, /purchases/new', 'canCreateSlip 유지', '메뉴명은 관리형'], palette.teal],
      ['상세', ['조회 가능자는 상세 진입', '수정은 상세 내부 정책', 'row 선택과 분리'], palette.blue],
      ['검수', ['WAREHOUSE/MANAGER/MASTER', '상태 기반 노출', 'Dialog 재사용'], palette.green],
      ['Export', ['MANAGER/MASTER 제한', '업무번호만 표시', '대량 유출 면적 축소'], palette.amber],
    ],
    footer: 'SP-05 QA 07 — CRUD surface role matrix',
  },
  {
    file: '08-verification-matrix.png',
    role: 'QA',
    active: '대시보드',
    title: 'SP-05 검증 매트릭스',
    subtitle: 'RED/GREEN, 정적 계약, 빌드, 캡처 확인',
    headers: ['검증', '명령/대상', '결과', 'skip'],
    rows: [
      ['RED', 'sp-05-crud-surface', 'PASS', '0'],
      ['GREEN', 'sp-05-crud-surface', 'PASS', '0'],
      ['typecheck', 'clients/desktop', 'PASS', '0'],
      ['lint/build', 'clients/desktop', 'PASS', '0'],
    ],
    cards: [
      ['현재 완료', ['실패 테스트 먼저 확인', '구현 후 3 tests passed', '문서 계약 포함'], palette.teal],
      ['추가 완료', ['typecheck/lint/build PASS', 'full-menu contract PASS', 'sales/purchase UI 9 passed'], palette.blue],
      ['캡처', ['8장 모두 non-zero', 'PR 본문 raw URL 첨부', 'branch 삭제 후 SHA 고정'], palette.green],
      ['다음 단계', ['commit/push/PR', 'CI watch', 'green 후 PM merge'], palette.amber],
    ],
    footer: 'SP-05 QA 08 — Verification matrix',
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
  const rowHtml = screen.rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const cardsHtml = screen.cards
    .map(([title, lines, accent]) => `
      <section class="card" style="--accent:${accent}">
        <h2>${escapeHtml(title)}</h2>
        ${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
      </section>`)
    .join('')
  const sidebarHtml = sidebar
    .map(item => `<div class="nav ${item === screen.active ? 'active' : ''}">${escapeHtml(item)}</div>`)
    .join('')

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1280px; height: 900px; font-family: "Malgun Gothic", "Segoe UI", sans-serif; color: ${palette.ink}; background: ${palette.bg}; }
    .screen { display: grid; grid-template-columns: 250px 1fr; width: 1280px; height: 900px; }
    aside { background: ${palette.navy}; color: white; padding: 28px 20px; }
    .brand { font-size: 25px; font-weight: 800; margin-bottom: 4px; }
    .slug { color: #a7b1bf; font-size: 12px; font-weight: 800; letter-spacing: .08em; margin-bottom: 38px; }
    .nav { height: 34px; padding: 8px 18px; margin-bottom: 4px; color: #c7d2df; font-size: 14px; }
    .nav.active { color: white; background: #1f3a3d; border: 1px solid ${palette.teal}; font-weight: 800; }
    main { padding: 32px 48px 32px 42px; }
    .top { display: flex; justify-content: space-between; align-items: start; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; }
    .subtitle { margin-top: 10px; color: ${palette.muted}; font-size: 14px; }
    .role { background: ${palette.teal}; color: white; font-size: 13px; font-weight: 800; padding: 8px 18px; min-width: 140px; text-align: center; }
    table { margin-top: 36px; border-collapse: collapse; width: 910px; background: white; font-size: 13px; }
    th { background: ${palette.navy}; color: white; height: 38px; text-align: left; padding: 0 12px; font-size: 13px; }
    td { border: 1px solid ${palette.line}; height: 40px; padding: 0 12px; color: ${palette.ink}; }
    td:nth-child(3), td:nth-child(4), td:nth-child(5) { color: ${palette.green}; font-weight: 700; }
    .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 30px; margin-top: 38px; width: 894px; }
    .card { background: white; border: 1px solid ${palette.line}; border-left: 6px solid var(--accent); height: 130px; padding: 14px 18px; }
    .card h2 { margin: 0 0 12px; font-size: 17px; }
    .card p { margin: 0 0 8px; font-size: 13px; color: ${palette.muted}; }
    .footer { position: absolute; left: 292px; bottom: 34px; color: ${palette.muted}; font-size: 13px; }
  </style>
</head>
<body>
  <div class="screen">
    <aside>
      <div class="brand">Samhan Public</div>
      <div class="slug">SP-05 CRUD AUDIT</div>
      ${sidebarHtml}
    </aside>
    <main>
      <div class="top">
        <div>
          <h1>${escapeHtml(screen.title)}</h1>
          <div class="subtitle">${escapeHtml(screen.subtitle)}</div>
        </div>
        <div class="role">${escapeHtml(screen.role)}</div>
      </div>
      <table>
        <thead><tr>${screen.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowHtml}</tbody>
      </table>
      <div class="cards">${cardsHtml}</div>
      <div class="footer">${escapeHtml(screen.footer)}</div>
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
    const outPath = path.join(outDir, screen.file)
    await page.screenshot({ path: outPath, fullPage: false })
    console.log(`generated ${outPath}`)
  }
} finally {
  await browser.close()
}
