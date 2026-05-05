/**
 * Dev-only — 5 화면 자동 navigate + capturePage() 로 PNG 5장 산출.
 *
 * 활성화 조건: `process.env.CAPTURE_MODE === '1'` (npm run capture 스크립트가 set).
 * 산출 위치: `<repo>/docs/qa/electron-skeleton-slice/screenshots/`.
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
}

const ROUTES_DEFAULT: RouteSpec[] = [
  { path: '/login', fileName: '01_login', waitMs: 800 },
  { path: '/', fileName: '02_dashboard', waitMs: 1500 },
  { path: '/warehouses', fileName: '03_warehouses', waitMs: 1500 },
  { path: '/slips', fileName: '04_slips_list', waitMs: 1500 },
  { path: '/slips/new', fileName: '05_slip_form', waitMs: 1500 },
]

/**
 * migration-fe-desktop-sales 슬라이스 — Phase 6 [판매] 메뉴 캡처 6장.
 *
 * 사용법: `CAPTURE_MODE=1 CAPTURE_SLICE=migration-fe-desktop npm run dev`.
 * docs/qa/migration-fe-desktop/ 에 PNG 6장 산출. 백엔드 미배포 상태에서도 빈 목록
 * 안내 화면을 캡처해 visual regression 검증 가능.
 */
const ROUTES_MIGRATION_FE_DESKTOP: RouteSpec[] = [
  { path: '/sales/estimates', fileName: '01-desktop-sales-menu', waitMs: 1500 },
  { path: '/sales/estimates', fileName: '02-desktop-estimate-list', waitMs: 1500 },
  { path: '/sales/estimates/new', fileName: '03-desktop-estimate-form-home', waitMs: 1500 },
  {
    path: '/sales/estimates/SAMPLE-2026-0001/print',
    fileName: '04-desktop-estimate-print',
    waitMs: 1500,
  },
  { path: '/sales/partner-orders', fileName: '05-desktop-partner-orders', waitMs: 1500 },
  { path: '/sales/long-pending', fileName: '06-desktop-long-pending', waitMs: 1500 },
]

/** 출력 디렉토리 — worktree 루트 기준. */
function resolveOutputDir(slice: string): string {
  // 메인 프로세스의 cwd 는 보통 clients/desktop. worktree 루트로 두 단계 위.
  return resolve(process.cwd(), '..', '..', 'docs', 'qa', slice)
}

/** 단일 라우트 캡처 — hash 변경 → 대기 → capturePage → PNG 저장. */
async function captureRoute(window: BrowserWindow, route: RouteSpec, outDir: string): Promise<void> {
  await window.webContents.executeJavaScript(`window.location.hash = '#${route.path}'`)
  await new Promise((resolve) => setTimeout(resolve, route.waitMs ?? 1000))
  const image = await window.capturePage()
  const target = resolve(outDir, `${route.fileName}.png`)
  writeFileSync(target, image.toPNG())
  console.log(`[capture] ${route.path} → ${target}`)
}

/**
 * 5 라우트 자동 navigate + 캡처 후 앱 종료.
 * mock 모드 (`VITE_MOCK_MODE=1`) 와 함께 사용해야 백엔드 미부팅 상태에서 동작.
 */
export async function captureAllScreens(window: BrowserWindow): Promise<void> {
  if (process.env['CAPTURE_MODE'] !== '1') {
    return
  }
  // CAPTURE_SLICE 환경변수로 슬라이스별 라우트 집합 분기.
  // 미설정 시 default (electron-skeleton-slice 5 화면).
  const slice = process.env['CAPTURE_SLICE'] ?? 'electron-skeleton-slice/screenshots'
  const routes = slice === 'migration-fe-desktop' ? ROUTES_MIGRATION_FE_DESKTOP : ROUTES_DEFAULT
  const outDir = resolveOutputDir(slice)
  mkdirSync(outDir, { recursive: true })

  // 첫 페이지 (Vite dev server 기준 `/`) 가 완전히 로드될 때까지 대기.
  await new Promise((resolve) => setTimeout(resolve, 4000))

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
