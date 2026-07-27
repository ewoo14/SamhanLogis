/* eslint-disable */
/**
 * dev-only — Vite dev server (mock 모드) + Edge headless 로 v4 [판매] 메뉴 6 화면 캡처.
 *
 * 활성화 (수동):
 *   1) cd clients/desktop && cross-env VITE_MOCK_MODE=1 npx vite
 *      (renderer 만 부팅, 5173 포트. Electron 부팅 X — webview tag 는 표시 placeholder 만)
 *   2) 별도 터미널에서 node scripts/capture-v4-sales.cjs
 *
 * 산출:
 *   docs/qa/migration-fe-desktop-v4/*.png (6 PNG)
 *
 * v4 캡처 6장 (Plan §QA 캡처 6장):
 *   01 sidebar [판매] 4 sub-route + sub-nav (legacy 견적서 / 주문서 조회 / 주문서 승인 / DC 설정)
 *   02 견적서 작성 진입 → legacy estimate webview 로드 (placeholder + 상단 sub-nav)
 *   03 동일 webview — dom-ready 후 (mock 환경에서는 fallback HTML 또는 about:blank)
 *   04 견적서 인쇄 미리보기 (legacy `pageFinal` 양식 — webview 내부)
 *   05 주문서 승인 (status 6종 + 비밀번호 초기화 버튼)
 *   06 거래처 DC 설정 (222 row 시뮬레이션, 인라인 수정)
 *
 * 주의: Electron webview 는 Chromium 환경 외에서는 동작하지 않으므로 02~04 캡처는
 * SalesSubNav + EstimateLegacyWebviewPage 의 placeholder + 안내문구 캡처. 실 webview
 * 검증은 `npm run dev` (Electron) + 수동 캡처 권장.
 */
const { spawnSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { resolve } = require('node:path')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const EDGE_PATH =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const VITE_PORT = process.env.VITE_PORT || '5173'
const BASE_URL = `http://localhost:${VITE_PORT}`

// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(
  resolve(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'qa',
    'migration-fe-desktop-v4',
  ),
)

const STEPS = [
  { file: '01-desktop-sales-menu-v4.png', hash: '#/sales/estimates' },
  { file: '02-desktop-estimate-legacy-webview-init.png', hash: '#/sales/estimates/legacy' },
  { file: '03-desktop-estimate-legacy-webview-after-add.png', hash: '#/sales/estimates/legacy' },
  { file: '04-desktop-estimate-legacy-print.png', hash: '#/sales/estimates/legacy' },
  { file: '05-desktop-order-approvals.png', hash: '#/sales/order-approvals' },
  { file: '06-desktop-partner-dc-config.png', hash: '#/sales/partner-dc-config' },
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
  console.log('[capture] 6 화면 산출 완료:', OUT_DIR)
}

if (require.main === module) main()
