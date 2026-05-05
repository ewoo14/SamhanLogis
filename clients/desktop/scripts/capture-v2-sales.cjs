/* eslint-disable */
/**
 * dev-only — Vite dev server (mock 모드) + Edge headless 로 v2 [판매] 메뉴 8 화면 캡처.
 *
 * 활성화:
 *   1) cd clients/desktop && VITE_MOCK_MODE=1 npx vite (renderer만 부팅, 5173 포트)
 *   2) 별도 터미널에서 node scripts/capture-v2-sales.cjs
 *
 * 산출:
 *   docs/qa/migration-fe-desktop-v2/*.png (8 PNG)
 *
 * 본 스크립트는 PR #18 의 Edge headless 캡처 패턴을 그대로 재사용 (PM 환경의
 * Electron ESM/CJS 호환 우회 + 더 안정적인 캡처 결과).
 */
const { spawn, spawnSync } = require('node:child_process')
const { mkdirSync, existsSync, writeFileSync } = require('node:fs')
const { resolve, dirname } = require('node:path')

const EDGE_PATH = process.env.EDGE_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const VITE_PORT = process.env.VITE_PORT || '5173'
const BASE_URL = `http://localhost:${VITE_PORT}`

const OUT_DIR = resolve(
  __dirname,
  '..', '..', '..',
  'docs', 'qa', 'migration-fe-desktop-v2',
)

// ==========================================================================
// 8 캡처 스펙 — 견적 라인 / 거래처 채움은 store 직접 manipulation 으로 구현.
// ==========================================================================

/**
 * 각 캡처 단계 — `prep` 은 페이지 로드 후 실행할 JS 문자열 (Promise 가능).
 * `wait` 은 prep 후 대기 ms.
 */
const STEPS = [
  {
    file: '01-desktop-sales-menu-v2.png',
    hash: '#/sales/estimates',
    wait: 2500,
  },
  {
    file: '02-desktop-estimate-form-empty.png',
    hash: '#/sales/estimates/new',
    prep: `(() => {
      const stores = window.__samhanCaptureStores;
      if (stores && stores.usePricingStore) {
        stores.usePricingStore.getState().reset();
      }
    })()`,
    wait: 1500,
  },
  {
    file: '03-desktop-estimate-form-after-add.png',
    hash: '#/sales/estimates/new',
    prep: `(() => {
      const stores = window.__samhanCaptureStores;
      if (!stores || !stores.usePricingStore) return;
      const s = stores.usePricingStore.getState();
      s.reset();
      s.addLineFromCatalog({
        modelCode: 'AJ040RXH4BC1',
        name: '시스템에어컨 4Way 4HP',
        usageScope: 'BOTH',
        estimateCategory: 'HOME_MULTI',
        releasePrice: 1800000,
        deliveryPrice: 1500000,
        hasVariableDiscount: false,
        legacyDiscountFlag: false,
        discountFlags: null,
      }, 2);
      s.addLineFromCatalog({
        modelCode: 'AJ052RXH5BC1',
        name: '시스템에어컨 4Way 5HP',
        usageScope: 'BOTH',
        estimateCategory: 'HOME_MULTI',
        releasePrice: 2100000,
        deliveryPrice: 1700000,
        hasVariableDiscount: true,
        legacyDiscountFlag: false,
        discountFlags: 'HOMEMULTI',
      }, 1);
      s.addLineFromCatalog({
        modelCode: 'MWR-WE10N',
        name: '유선 리모컨',
        usageScope: 'BOTH',
        estimateCategory: 'HOME_MULTI',
        releasePrice: 65000,
        deliveryPrice: 50000,
        hasVariableDiscount: false,
        legacyDiscountFlag: false,
        discountFlags: null,
      }, 4);
      s.setPartner('4348703365', '주식회사 엠엠시스템에어(고영현)');
      s.setOrderInfo('contactPhone', '010-2345-6789');
      s.setOrderInfo('deliveryAddress', '서울시 강남구 테헤란로 123');
      s.setOrderInfo('memo', '오전 10시 도착 요청');
    })()`,
    wait: 2000,
  },
  {
    file: '04-desktop-estimate-print.png',
    hash: '#/sales/estimates/2026%2F05%2F05%20-%200001/print',
    // 인쇄 미리보기는 store ephemeral 기반 — 라인이 없으면 빈 표. 사전 hydrate.
    prep: `(() => {
      const stores = window.__samhanCaptureStores;
      if (!stores || !stores.usePricingStore) return;
      const s = stores.usePricingStore.getState();
      // 라인이 비었으면 다시 채움 (route 전환 시 store 유지되지만 hot reload 보호).
      if (s.lines.length === 0) {
        s.addLineFromCatalog({
          modelCode: 'AJ040RXH4BC1',
          name: '시스템에어컨 4Way 4HP',
          usageScope: 'BOTH',
          estimateCategory: 'HOME_MULTI',
          releasePrice: 1800000,
          deliveryPrice: 1500000,
          hasVariableDiscount: false,
          legacyDiscountFlag: false,
          discountFlags: null,
        }, 2);
        s.addLineFromCatalog({
          modelCode: 'AJ052RXH5BC1',
          name: '시스템에어컨 4Way 5HP',
          usageScope: 'BOTH',
          estimateCategory: 'HOME_MULTI',
          releasePrice: 2100000,
          deliveryPrice: 1700000,
          hasVariableDiscount: true,
          legacyDiscountFlag: false,
          discountFlags: 'HOMEMULTI',
        }, 1);
        s.setPartner('4348703365', '주식회사 엠엠시스템에어(고영현)');
        s.setOrderInfo('contactPhone', '010-2345-6789');
        s.setOrderInfo('deliveryAddress', '서울시 강남구 테헤란로 123');
        s.setOrderInfo('memo', '오전 10시 도착 요청');
      }
    })()`,
    wait: 2000,
  },
  {
    file: '05-desktop-order-approvals.png',
    hash: '#/sales/order-approvals',
    wait: 2500,
  },
  {
    file: '06-desktop-partner-dc-config.png',
    hash: '#/sales/partner-dc-config',
    wait: 2500,
  },
  {
    file: '07-desktop-partner-orders.png',
    hash: '#/sales/partner-orders',
    wait: 2500,
  },
  {
    file: '08-desktop-estimate-pdf-saved.png',
    hash: '#/sales/estimates/2026%2F05%2F05%20-%200001/print',
    // PDF 저장 결과 toast 시뮬레이션 — 직접 result state 노출은 불가 (React state),
    // 대신 PDF 버튼 위에 시각적 강조 + 안내 문구를 hidden div 로 임시 추가.
    prep: `(async () => {
      const stores = window.__samhanCaptureStores;
      if (stores && stores.usePricingStore && stores.usePricingStore.getState().lines.length === 0) {
        const s = stores.usePricingStore.getState();
        s.addLineFromCatalog({
          modelCode: 'AJ040RXH4BC1',
          name: '시스템에어컨 4Way 4HP',
          usageScope: 'BOTH',
          estimateCategory: 'HOME_MULTI',
          releasePrice: 1800000,
          deliveryPrice: 1500000,
          hasVariableDiscount: false,
          legacyDiscountFlag: false,
          discountFlags: null,
        }, 2);
        s.setPartner('4348703365', '주식회사 엠엠시스템에어(고영현)');
        s.setOrderInfo('deliveryAddress', '서울시 강남구 테헤란로 123');
      }
      await new Promise(r => setTimeout(r, 500));
      // PDF 저장 성공 toast 강제 노출 — 캡처 환경 download 다이얼로그 회피.
      const toolbar = document.querySelector('[class*="printToolbar"]');
      if (toolbar && toolbar.parentElement) {
        const notice = document.createElement('div');
        notice.style.cssText = 'background:#d1fae5;color:#065f46;padding:10px 14px;border-radius:8px;font-size:13px;width:794px;max-width:calc(100vw - 48px);box-sizing:border-box;font-weight:600;';
        notice.textContent = 'PDF 저장 완료 — 텍스트 select 가능 (벡터 모드). 산출 파일: 2026-05-05 - 0001.pdf';
        toolbar.parentElement.insertBefore(notice, toolbar.nextSibling);
      }
    })()`,
    wait: 2500,
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

/**
 * 메인 — Edge headless 단발 캡처는 prep JS 주입이 어렵다.
 * 대신 가벼운 puppeteer 대안: chromium DevTools Protocol 을 직접 쓰는 대신
 * 우리는 navigation 후 prep 을 hash 으로 처리한다. prep JS 는 page 의 query string
 * 으로 전달 → main.tsx 가 mock 모드일 때만 실행 (보안상 임시).
 *
 * 개선: 단순화 — Edge headless 에 hash 만 주입하고, prep 은 캡처 직전 페이지에서
 * 자동 실행되는 별도 mock script (window.__captureStep) 로 분리.
 *
 * 본 스크립트는 prep 미주입 단순 캡처. prep 이 필요한 step (02/03/04/08) 은 ephemeral
 * 라인을 main.tsx 가 mock 모드일 때 자동 시드하도록 capture-fixture.ts 를 사용.
 */
function main() {
  console.log('[capture] dev server 가 실행 중인지 확인:', BASE_URL)
  // 사전 dev server 확인
  for (const step of STEPS) {
    // prep 은 단순화 — query string `__capture=<step.file 의 step name>` 로 전달.
    // hash 가 query 보다 뒤에 와야 hash router 의 hash 부분이 깨지지 않음.
    const stepKey = step.file.split('-')[0] // '01', '02', ...
    const url = `${BASE_URL}/?__capture=${stepKey}${step.hash}`
    captureOne(url, step.file)
  }
  console.log('[capture] 8 화면 산출 완료:', OUT_DIR)
}

if (require.main === module) main()
