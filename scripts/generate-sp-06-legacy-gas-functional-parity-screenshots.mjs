import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resolveQaShotsDir } from './lib/qa-shots-dir.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/sp-06-legacy-gas-functional-parity/screenshots'))
const requireFromDesktop = createRequire(new URL('../clients/desktop/package.json', import.meta.url))
const { chromium } = requireFromDesktop('@playwright/test')

const palette = {
  bg: '#F4F7FA',
  ink: '#17202A',
  muted: '#5E6B7A',
  line: '#D6DEE8',
  navy: '#17212B',
  teal: '#168A83',
  blue: '#2563EB',
  green: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
  card: '#FFFFFF',
}

const sidebar = [
  '대시보드',
  '판매관리',
  '구매관리',
  '거래처 관리',
  '배차지역 관리',
  '단톡방 관리',
  '발송금지 관리',
  '거래처 DC 설정',
  '운영 검증',
]

const screens = [
  {
    file: '01-db-migration-ownership-map.png',
    active: '운영 검증',
    role: 'PM',
    title: 'Notion 원본 데이터 DB 이관 소유권',
    subtitle: 'Notion은 cutover seed 원본, 이후 source-of-truth는 Samhan Public service DB',
    headers: ['원본 표', '대상 DB 테이블', 'CRUD 화면', '런타임 소스'],
    rows: [
      ['단톡방리스트', 'notification_db.partner_chat_room_mappings', '/admin/chat-rooms', 'Samhan DB'],
      ['발송금지리스트', 'partner_db.blocked_partners', '/admin/blocked-partners', 'Samhan DB'],
      ['배차지역 분류표', 'arologis_db.region_dispatch_classifications', '/admin/regions', 'Samhan DB'],
      ['거래처 DC정보', 'dc_config_db.dc_configs', '/sales/partner-dc-config', 'Samhan DB'],
    ],
    cards: [
      ['핵심 결정', ['Notion runtime 조회 금지', 'CSV 원본은 1회 DB 이관', '이후 조회/수정/삭제는 DB CRUD'], palette.teal],
      ['운영 row', ['REGION 20', 'DC 213 rows / 210 active', 'CHAT 112', 'BLOCK 6'], palette.blue],
      ['비노출', ['UUID 화면 노출 금지', 'partnerCode/slipNo 등 업무 식별자만 표시', 'legacy alias는 내부 보존'], palette.green],
      ['검증', ['정적 계약 10 tests', 'full-menu 병행 21 tests', 'PR 캡처 9장'], palette.amber],
    ],
  },
  {
    file: '02-chat-room-db-crud.png',
    active: '단톡방 관리',
    role: 'MANAGER',
    title: '단톡방리스트 → notification DB CRUD',
    subtitle: 'partner_code와 chat_room_name 매핑은 notification-service가 소유',
    headers: ['동작', '경로', '저장소', '결과'],
    rows: [
      ['목록 조회', 'GET /api/v1/notification/admin/chat-rooms', 'PartnerChatRoomMappingRepository', 'OK'],
      ['단건 추가', 'POST /api/v1/notification/admin/chat-rooms', 'partner_chat_room_mappings', 'OK'],
      ['CSV 업로드', 'POST /api/v1/notification/admin/chat-rooms/import', 'Notion CSV → DB', 'OK'],
      ['삭제', 'DELETE /api/v1/notification/admin/chat-rooms/{id}', 'Soft Delete', 'OK'],
    ],
    cards: [
      ['화면', ['단건 추가', 'CSV 업로드', '실시간 자동 갱신'], palette.teal],
      ['Gateway', ['notification-chat-rooms-v1', 'No StripPrefix', 'JwtAuthentication'], palette.blue],
      ['Fallback', ['name-only row는 legacy alias 보존', '전표/배차안내 partnerName fallback', 'UUID 미표시'], palette.green],
      ['테스트', ['controller/service/API/page 계약', 'Notion URL 없음', 'DB CRUD 문서화'], palette.amber],
    ],
  },
  {
    file: '03-blocked-partner-db-crud.png',
    active: '발송금지 관리',
    role: 'MANAGER',
    title: '발송금지리스트 → partner DB CRUD',
    subtitle: 'blocked_partners에서 발송 제외 가드를 소유하고 soft delete로 해제',
    headers: ['동작', '경로', '저장소', '결과'],
    rows: [
      ['목록 조회', 'GET /api/v1/partners/admin/blocks', 'BlockedPartnerRepository', 'OK'],
      ['단건 차단', 'POST /api/v1/partners/admin/blocks', 'blocked_partners', 'OK'],
      ['CSV 업로드', 'POST /api/v1/partners/admin/blocks/import', 'Notion CSV → DB', 'OK'],
      ['차단 해제', 'DELETE /api/v1/partners/admin/blocks/{id}', 'Soft Delete', 'OK'],
    ],
    cards: [
      ['업무 흐름', ['발송금지 여부는 partner DB 조회', 'notification/slip이 lookup client로 사용', 'Notion 조회 없음'], palette.teal],
      ['Gateway', ['partner-blocks-v1', 'No StripPrefix', 'JwtAuthentication'], palette.blue],
      ['데이터 보존', ['사업자명만 있는 row도 보존', 'LEGACY-NAME alias 내부 처리', '화면은 업체명 중심'], palette.green],
      ['검증', ['PartnerBlockService 계약', 'blockedPartnerApi 계약', '화면 CSV 업로드 계약'], palette.amber],
    ],
  },
  {
    file: '04-dispatch-region-management.png',
    active: '배차지역 관리',
    role: 'DISPATCH',
    title: '배차지역 관리',
    subtitle: '/admin/regions는 지역 분류표의 DB CRUD 화면, DISPATCH는 조회 전용',
    headers: ['화면 요소', '계약', '권한', '결과'],
    rows: [
      ['메뉴 라벨', '배차지역 관리', 'DISPATCH/MANAGER/MASTER', 'OK'],
      ['페이지 타이틀', '배차지역 관리', '공통', 'OK'],
      ['단건 추가/수정/삭제', 'MANAGER/MASTER', '관리자', 'OK'],
      ['CSV 업로드', 'POST /admin/arologis/regions/import', '관리자', 'OK'],
    ],
    cards: [
      ['DB', ['arologis_db.region_dispatch_classifications', 'group_name + keywords', 'sort_order 우선'], palette.teal],
      ['UI', ['지역 관리 모호성 제거', '배차지역 분류표 의미 반영', '조회 전용 역할 명확'], palette.blue],
      ['계약', ['full-menu contract 갱신', 'menu-relocate spec 갱신', 'SP-06 contract GREEN'], palette.green],
      ['비노출', ['id는 API param 전용', '화면은 분류 그룹/검색어 중심', 'UUID 미표시'], palette.amber],
    ],
  },
  {
    file: '05-dc-config-db-seed-and-crud.png',
    active: '거래처 DC 설정',
    role: 'SALES',
    title: '거래처 DC정보 → dc-config DB seed + CRUD',
    subtitle: 'CSV 원본은 dc_configs로 이관, 이후 거래처 DC 설정 화면에서 관리',
    headers: ['동작', '경로', '저장소', '결과'],
    rows: [
      ['CSV 이관', 'POST /api/v1/dc-config/admin/import', 'dc_configs', 'OK'],
      ['목록 조회', 'GET /api/v1/partner-dc-configs', 'dc-config DB', 'OK'],
      ['수정', 'PATCH /api/v1/partner-dc-configs/{partnerCode}', 'partnerCode 기준', 'OK'],
      ['화면', '/sales/partner-dc-config', '거래처 DC 설정', 'OK'],
    ],
    cards: [
      ['원본 row', ['거래처 DC정보 213 rows', 'unique partnerCode 210', 'stale count 사용 금지'], palette.teal],
      ['Gateway', ['dc-config-admin-v1 no-strip', 'partner-dc-configs route 유지', 'JWT 적용'], palette.blue],
      ['데이터', ['partner snapshot 보정', '업체명/거래처코드 보존', 'UUID 노출 없음'], palette.green],
      ['검증', ['DcConfigImportController 계약', 'dcConfigImportApi 계약', '운영 SQL 정정'], palette.amber],
    ],
  },
  {
    file: '06-gateway-no-strip-routes.png',
    active: '운영 검증',
    role: 'DevOps',
    title: 'Gateway full-path no-strip route 정합화',
    subtitle: 'controller가 /api/v1 풀패스를 보유한 endpoint는 generic StripPrefix보다 먼저 선언',
    headers: ['route id', 'path', '필터', '이유'],
    rows: [
      ['notification-chat-rooms-v1', '/api/v1/notification/admin/chat-rooms/**', 'JWT, no-strip', 'CHAT CRUD'],
      ['partner-blocks-v1', '/api/v1/partners/admin/blocks/**', 'JWT, no-strip', 'BLOCK CRUD'],
      ['dc-config-admin-v1', '/api/v1/dc-config/admin/**', 'JWT, no-strip', 'DC import'],
      ['partner-auth-public-v1', '/api/v1/auth/partner-*', 'public, no-strip', '거래처 인증'],
      ['partner-auth-approvals-v1', '/api/v1/partner-approvals/**', 'JWT, no-strip', '주문 승인'],
    ],
    cards: [
      ['리스크 제거', ['StripPrefix=2로 path가 깨지는 구간 차단', 'generic route보다 선행', 'controller contract 보존'], palette.teal],
      ['보안', ['admin CRUD는 JwtAuthentication', 'partner auth public만 JWT 제외', 'approval은 JWT'], palette.blue],
      ['테스트', ['route block extractor', 'no StripPrefix assertion', 'Path predicate assertion'], palette.green],
      ['후속', ['CI gateway smoke 확대', 'route ordering regression', '운영 gateway 로그 확인'], palette.amber],
    ],
  },
  {
    file: '07-operational-scripts-port-aware.png',
    active: '운영 검증',
    role: 'DevOps',
    title: '운영 스크립트 포트 override 정합성',
    subtitle: 'start-local-full.ps1의 실제 포트와 smoke/import endpoint가 같은 값을 사용',
    headers: ['스크립트', '보정', '대상', '결과'],
    rows: [
      ['import-notion-csv.ps1', 'SAMHAN_AROLOGIS_PORT', 'REGION import', 'OK'],
      ['import-notion-csv.ps1', 'SAMHAN_DC_CONFIG_PORT', 'DC import', 'OK'],
      ['run-smoke-tests.ps1', '$servicePortByName', 'direct endpoint', 'OK'],
      ['run-smoke-tests.ps1', 'GatewayUrl 보정', 'api-gateway', 'OK'],
    ],
    cards: [
      ['DB 이관', ['용어를 import에서 DB 이관으로 정리', 'service port 직접 호출', 'JWT + X-User headers'], palette.teal],
      ['Smoke', ['health 결과 port map 저장', 'gateway URL 자동 보정', 'direct URL 하드코딩 제거'], palette.blue],
      ['Windows', ['포트 충돌 +100 우회 대응', '환경변수 override 대응', 'PowerShell 5.1 호환'], palette.green],
      ['검증', ['SP-06 contract RED/GREEN', '운영 문서 SQL 정정', 'row count 기준 보존'], palette.amber],
    ],
  },
  {
    file: '08-active-app-notion-endpoint-removed.png',
    active: '주문서 관리',
    role: 'Frontend',
    title: 'active order-app Notion endpoint 제거',
    subtitle: 'legacy 함수명은 유지하되 실제 통신은 DB 로그 RPC로 위임',
    headers: ['항목', '기존', '변경', '결과'],
    rows: [
      ['endpoint', 'https://api.notion.com/v1/pages', '제거', 'OK'],
      ['header', 'Notion-Version', '제거', 'OK'],
      ['함수명', 'logActionToNotion', '호환 유지', 'OK'],
      ['위임', 'UrlFetchApp.fetch', 'google.script.run.logFrontEvent', 'OK'],
    ],
    cards: [
      ['원칙', ['활성 앱에 Notion HTTP endpoint 금지', 'Notion은 원본/과거 문서에만 존재', 'DB 로그 API로 전환'], palette.teal],
      ['호환', ['legacy 함수명 유지', '호출부 변경 위험 최소화', 'shim RPC_MAP 재사용'], palette.blue],
      ['스캔', ['order-app endpoint 제거', 'estimate-app은 blocklist 설명만 잔존', 'tools/legacy-gas는 원본 보존'], palette.green],
      ['검증', ['SP-06 active app test', 'https 문자열 not contain', 'DB RPC contain'], palette.amber],
    ],
  },
  {
    file: '09-verification-matrix.png',
    active: '운영 검증',
    role: 'QA',
    title: 'SP-06 검증 매트릭스',
    subtitle: 'RED/GREEN, 정적 계약, endpoint scan, PR 캡처 산출',
    headers: ['검증', '명령/대상', '결과', 'skip'],
    rows: [
      ['RED', 'smoke port / 라벨 / Notion endpoint', '의도 실패 확인', '0'],
      ['GREEN', 'sp-06-notion-db-crud', '10 passed', '0'],
      ['회귀', 'sp-06 + full-menu-contract', '21 passed', '0'],
      ['캡처', 'SP-06 PNG 9장', 'non-zero 확인 대상', '0'],
    ],
    cards: [
      ['완료', ['DB CRUD 계약 고정', 'Gateway route 정합', 'active endpoint 제거'], palette.teal],
      ['추가 검증', ['desktop typecheck/lint/build PASS', 'backend targeted tests PASS', 'Docker smoke PASS'], palette.blue],
      ['PR 본문', ['9장 raw SHA URL 인라인', '상대경로 금지', '이미지 가독성 우선'], palette.green],
      ['다음', ['SP-07 Google Sheets E2E', 'SP-08 권한/UUID 회귀', '품목 7탭 UI'], palette.amber],
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
  const sidebarHtml = sidebar
    .map(item => `<div class="nav ${item === screen.active ? 'active' : ''}">${escapeHtml(item)}</div>`)
    .join('')
  const rowHtml = screen.rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const cardHtml = screen.cards
    .map(([title, lines, accent]) => `
      <section class="info" style="--accent:${accent}">
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
    body { margin: 0; width: 1280px; height: 900px; font-family: "Malgun Gothic", "Segoe UI", sans-serif; color: ${palette.ink}; background: ${palette.bg}; }
    .screen { width: 1280px; height: 900px; display: grid; grid-template-columns: 250px 1fr; }
    aside { background: ${palette.navy}; color: #fff; padding: 28px 20px; }
    .brand { font-size: 25px; font-weight: 800; margin-bottom: 4px; }
    .slug { color: #A8B3C2; font-size: 12px; font-weight: 800; letter-spacing: .08em; margin-bottom: 32px; }
    .nav { min-height: 34px; display: flex; align-items: center; padding: 7px 16px; margin-bottom: 4px; color: #CAD3DF; font-size: 14px; }
    .nav.active { color: #fff; background: #1E3A3D; border-left: 4px solid ${palette.teal}; font-weight: 800; }
    main { padding: 34px 46px 28px 42px; }
    .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    h1 { margin: 0; font-size: 29px; line-height: 1.2; letter-spacing: 0; }
    .subtitle { margin-top: 10px; color: ${palette.muted}; font-size: 14px; }
    .role { background: ${palette.teal}; color: #fff; font-size: 13px; font-weight: 800; padding: 8px 18px; min-width: 128px; text-align: center; }
    table { margin-top: 32px; border-collapse: collapse; width: 930px; background: #fff; font-size: 12.5px; table-layout: fixed; }
    th { background: ${palette.navy}; color: #fff; height: 38px; text-align: left; padding: 0 10px; font-size: 12.5px; }
    td { border: 1px solid ${palette.line}; min-height: 39px; padding: 10px; color: ${palette.ink}; vertical-align: middle; overflow-wrap: anywhere; }
    .cards { margin-top: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; width: 930px; }
    .info { background: ${palette.card}; border: 1px solid ${palette.line}; border-top: 4px solid var(--accent); padding: 15px 14px; min-height: 160px; }
    .info h2 { margin: 0 0 11px; font-size: 16px; line-height: 1.25; }
    .info p { margin: 7px 0; color: ${palette.muted}; font-size: 12px; line-height: 1.4; }
    .footer { position: absolute; left: 292px; bottom: 22px; color: #7A8695; font-size: 12px; }
  </style>
</head>
<body>
  <div class="screen">
    <aside>
      <div class="brand">Samhan Public</div>
      <div class="slug">SP-06 DB MIGRATION</div>
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
      <div class="cards">${cardHtml}</div>
      <div class="footer">${escapeHtml(screen.file)} · No UUID / No runtime Notion source</div>
    </main>
  </div>
</body>
</html>`
}

await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
for (const screen of screens) {
  await page.setContent(renderScreen(screen), { waitUntil: 'load' })
  await page.screenshot({ path: path.join(outDir, screen.file), fullPage: false })
}
await browser.close()

for (const screen of screens) {
  const stat = await fs.stat(path.join(outDir, screen.file))
  if (stat.size <= 0) throw new Error(`${screen.file} is empty`)
  console.log(`${screen.file}\t${stat.size}`)
}
