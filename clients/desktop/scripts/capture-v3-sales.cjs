/* eslint-disable */
/**
 * dev-only — Vite dev server (mock 모드) + Edge headless 로 v3 [판매] 메뉴 8 화면 캡처.
 *
 * 활성화:
 *   1) cd clients/desktop && VITE_MOCK_MODE=1 npx vite (renderer만 부팅, 5173 포트)
 *   2) 별도 터미널에서 node scripts/capture-v3-sales.cjs
 *
 * 산출:
 *   docs/qa/migration-fe-desktop-v3/*.png (8 PNG)
 *
 * v3 캡처 8장 — 정정 #17/#18 검증:
 *   01 sidebar [판매] sub-route 4 + sub-nav 4
 *   02 라인 0건 → 카테고리 탭 X + cardOrderInfo X (메뉴 toolbar 만 표시)
 *   03 홈멀티 라인 1건 추가 → cardOrderInfo 자동 표시 + 거래처 검색 input focus
 *   04 라인 3건 + 거래처 선택 후 자동 채움
 *   05 legacy 메뉴 toolbar 5종 모두 표시
 *   06 인쇄 미리보기 (legacy 양식 + 복사/이미지/PDF 벡터 3 버튼)
 *   07 주문서 승인 status 6종 + dropdown + 비밀번호 초기화
 *   08 거래처 DC 설정 222 row + 인라인 수정
 */
const { spawnSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { resolve } = require('node:path')

const EDGE_PATH = process.env.EDGE_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const VITE_PORT = process.env.VITE_PORT || '5173'
const BASE_URL = `http://localhost:${VITE_PORT}`

const OUT_DIR = resolve(
  __dirname,
  '..', '..', '..',
  'docs', 'qa', 'migration-fe-desktop-v3',
)

const STEPS = [
  {
    file: '01-desktop-sales-menu-v3.png',
    hash: '#/sales/estimates',
  },
  {
    file: '02-desktop-estimate-form-empty.png',
    hash: '#/sales/estimates/new',
  },
  {
    file: '03-desktop-estimate-form-after-add-1.png',
    hash: '#/sales/estimates/new',
  },
  {
    file: '04-desktop-estimate-form-after-add-3.png',
    hash: '#/sales/estimates/new',
  },
  {
    file: '05-desktop-estimate-menu-toolbar.png',
    hash: '#/sales/estimates/new',
  },
  {
    file: '06-desktop-estimate-print.png',
    hash: '#/sales/estimates/2026%2F05%2F05%20-%200001/print',
  },
  {
    file: '07-desktop-order-approvals.png',
    hash: '#/sales/order-approvals',
  },
  {
    file: '08-desktop-partner-dc-config.png',
    hash: '#/sales/partner-dc-config',
  },
]

/** Edge headless 단일 캡처. */
function captureOne(url, file) {
  mkdirSync(OUT_DIR, { recursive: true })
  const target = resolve(OUT_DIR, file)
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,900',
    `--screenshot=${target}`,
    `--virtual-time-budget=8000`,
    url,
  ]
  console.log(`[capture] ${url} → ${target}`)
  const r = spawnSync(EDGE_PATH, args, { stdio: 'inherit', timeout: 30000 })
  if (r.status !== 0) {
    console.error(`[capture] Edge 실패 (${file})`)
  }
}

function main() {
  console.log('[capture] dev server 가 실행 중인지 확인:', BASE_URL)
  for (const step of STEPS) {
    const stepKey = step.file.split('-')[0]
    const url = `${BASE_URL}/?__capture=${stepKey}${step.hash}`
    captureOne(url, step.file)
  }
  console.log('[capture] 8 화면 산출 완료:', OUT_DIR)
}

if (require.main === module) main()
