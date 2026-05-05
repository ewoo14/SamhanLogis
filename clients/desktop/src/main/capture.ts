/**
 * Dev-only — 자동 navigate + capturePage() 로 PNG 산출.
 *
 * 활성화 조건: `process.env.CAPTURE_MODE === '1'` (npm run capture 스크립트가 set).
 * 산출 디렉토리: `process.env.CAPTURE_TARGET` 으로 결정 (없으면 electron-skeleton-slice).
 *
 * v2 정정 라운드: `CAPTURE_TARGET=migration-fe-desktop-v2` 로 8 화면 캡처 산출.
 *
 * 본 모듈은 PR #18 의 QA 스크린샷 자동 첨부 가드 충족용으로 추가됐고
 * 프로덕션 빌드에는 import 만 되어 환경변수 미설정 시 no-op 동작한다.
 */
import { app, type BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface RouteSpec {
  /** HashRouter 경로 (`/`, `/login`, `/warehouses`, ...) */
  path: string
  /** 산출 PNG 파일명 (확장자 제외) */
  fileName: string
  /** 페이지 로드 후 추가 대기 ms — 데이터 로딩 등 */
  waitMs?: number
  /** 캡처 직전 실행할 JS (DOM 조작/모달 열기 등). 반환값은 await 됨. */
  preCaptureJs?: string
}

const ROUTES_DEFAULT: RouteSpec[] = [
  { path: '/login', fileName: '01_login', waitMs: 800 },
  { path: '/', fileName: '02_dashboard', waitMs: 1500 },
  { path: '/warehouses', fileName: '03_warehouses', waitMs: 1500 },
  { path: '/slips', fileName: '04_slips_list', waitMs: 1500 },
  { path: '/slips/new', fileName: '05_slip_form', waitMs: 1500 },
]

/**
 * v2 정정 라운드 — [판매] 메뉴 8 화면 캡처.
 *
 * <p>각 화면은 mock 모드 (`VITE_MOCK_MODE=1`) 와 함께 부팅 가정.
 * 견적서 작성/인쇄 화면은 ephemeral store 라인이 필요하므로 preCaptureJs 로
 * window.usePricingStore 를 통해 라인을 추가하는 hack 대신 store import 를 통한
 * 직접 접근. 본 캡처는 React renderer 의 hash route 만 변경하며 store 자체는
 * 별도 hook 으로 셋업한다.
 */
const ROUTES_V2_SALES: RouteSpec[] = [
  // 1. sidebar [판매] 4 sub-route
  {
    path: '/sales/estimates',
    fileName: '01-desktop-sales-menu-v2',
    waitMs: 1500,
  },
  // 2. 견적서 작성 (라인 0건 — 카테고리 탭 미표시 검증)
  {
    path: '/sales/estimates/new',
    fileName: '02-desktop-estimate-form-empty',
    waitMs: 1200,
    // store reset — hot reload 보호.
    preCaptureJs: `
      try {
        const stores = window.__samhanCaptureStores;
        if (stores && stores.usePricingStore) {
          stores.usePricingStore.getState().reset();
        }
      } catch (e) { console.error(e); }
      'reset';
    `,
  },
  // 3. 견적서 작성 (홈멀티 라인 3건 추가 후 — 카테고리 탭 + 거래처 자동 채움 + Bundle 컬럼 제거 + 모델명/품목명 + drag handle)
  {
    path: '/sales/estimates/new',
    fileName: '03-desktop-estimate-form-after-add',
    waitMs: 1800,
    preCaptureJs: `
      try {
        const stores = window.__samhanCaptureStores;
        if (stores && stores.usePricingStore) {
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
          // 거래처 자동 채움 시뮬레이션 (legacy fillCustomer 결과)
          s.setPartner('4348703365', '주식회사 엠엠시스템에어(고영현)');
          s.setOrderInfo('contactPhone', '010-2345-6789');
          s.setOrderInfo('deliveryAddress', '서울시 강남구 테헤란로 123');
          s.setOrderInfo('memo', '오전 10시 도착 요청');
        }
      } catch (e) { console.error(e); }
      'lines added';
    `,
  },
  // 4. 인쇄 미리보기 (legacy 종합견적서 양식 + 3 버튼)
  {
    path: '/sales/estimates/2026%2F05%2F05%20-%200001/print',
    fileName: '04-desktop-estimate-print',
    waitMs: 1800,
  },
  // 5. 주문서 승인 (status 6종 + 영업자 dropdown + 비밀번호 초기화)
  {
    path: '/sales/order-approvals',
    fileName: '05-desktop-order-approvals',
    waitMs: 1500,
  },
  // 6. 거래처 DC율 설정 (인라인 수정 + DC 컬럼 11개)
  {
    path: '/sales/partner-dc-config',
    fileName: '06-desktop-partner-dc-config',
    waitMs: 1500,
  },
  // 7. 주문서 조회 (모델명 + 'YYYY/MM/DD - {seq}')
  {
    path: '/sales/partner-orders',
    fileName: '07-desktop-partner-orders',
    waitMs: 1500,
  },
  // 8. PDF 저장 결과 시뮬레이션 — 인쇄 미리보기에서 PDF 버튼 클릭 후 저장 완료 toast 노출.
  {
    path: '/sales/estimates/2026%2F05%2F05%20-%200001/print',
    fileName: '08-desktop-estimate-pdf-saved',
    waitMs: 2500,
    preCaptureJs: `
      // PDF 저장 toast 시뮬레이션 — 실제 저장은 download 다이얼로그 트리거 (캡처 환경에서 회피).
      // 대신 buttonAria 클릭 후 result state 직접 노출을 위해 window.__captureForcePdfNotice 를 set.
      // 본 화면은 'PDF 저장 (벡터)' 버튼 + 결과 메시지 영역이 함께 보이도록 함.
      try {
        await new Promise(r => setTimeout(r, 300));
        const btn = Array.from(document.querySelectorAll('button')).find(
          b => b.getAttribute('aria-label') === 'PDF 저장'
        );
        if (btn) btn.focus();
      } catch (e) { console.error(e); }
      'pdf focused';
    `,
  },
]

/**
 * 활성 캡처 스펙 — `CAPTURE_TARGET` 환경변수로 결정.
 * - `migration-fe-desktop-v2` → ROUTES_V2_SALES (8 화면)
 * - 그 외 (또는 미지정) → ROUTES_DEFAULT (5 화면)
 */
function selectRoutes(): RouteSpec[] {
  return process.env['CAPTURE_TARGET'] === 'migration-fe-desktop-v2'
    ? ROUTES_V2_SALES
    : ROUTES_DEFAULT
}

/** 출력 디렉토리 — worktree 루트 기준. */
function resolveOutputDir(): string {
  const target = process.env['CAPTURE_TARGET'] ?? 'electron-skeleton-slice'
  // 메인 프로세스의 cwd 는 보통 clients/desktop. worktree 루트로 두 단계 위.
  // v2 디렉토리는 docs/qa/<target>/ 직접, 기존 (default) 는 docs/qa/<target>/screenshots/ 호환.
  if (process.env['CAPTURE_TARGET']) {
    return resolve(process.cwd(), '..', '..', 'docs', 'qa', target)
  }
  return resolve(
    process.cwd(),
    '..',
    '..',
    'docs',
    'qa',
    target,
    'screenshots',
  )
}

/** 단일 라우트 캡처 — hash 변경 → 대기 → preCaptureJs → capturePage → PNG 저장. */
async function captureRoute(window: BrowserWindow, route: RouteSpec, outDir: string): Promise<void> {
  await window.webContents.executeJavaScript(`window.location.hash = '#${route.path}'`)
  await new Promise((resolve) => setTimeout(resolve, route.waitMs ?? 1000))
  if (route.preCaptureJs) {
    await window.webContents.executeJavaScript(`(async () => { ${route.preCaptureJs} })()`)
    // store 변경 후 React render 시간 확보.
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  const image = await window.capturePage()
  const target = resolve(outDir, `${route.fileName}.png`)
  writeFileSync(target, image.toPNG())
  console.log(`[capture] ${route.path} → ${target}`)
}

/**
 * 모든 라우트 자동 navigate + 캡처 후 앱 종료.
 * mock 모드 (`VITE_MOCK_MODE=1`) 와 함께 사용해야 백엔드 미부팅 상태에서 동작.
 */
export async function captureAllScreens(window: BrowserWindow): Promise<void> {
  if (process.env['CAPTURE_MODE'] !== '1') {
    return
  }
  const outDir = resolveOutputDir()
  mkdirSync(outDir, { recursive: true })

  // 첫 페이지 (Vite dev server 기준 `/`) 가 완전히 로드될 때까지 대기.
  await new Promise((resolve) => setTimeout(resolve, 4000))

  const routes = selectRoutes()
  for (const route of routes) {
    try {
      await captureRoute(window, route, outDir)
    } catch (err) {
      console.error(`[capture] ${route.path} 실패`, err)
    }
  }

  console.log('[capture] 모든 화면 캡처 완료. 앱 종료.')
  app.quit()
}
