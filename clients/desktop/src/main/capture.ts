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
import * as fs from 'node:fs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path'

interface RouteSpec {
  /** HashRouter 경로 (`/`, `/login`, `/warehouses`, ...) */
  path: string
  /** 산출 PNG 파일명 (확장자 제외) */
  fileName: string
  /** 페이지 로드 후 추가 대기 ms — 데이터 로딩 등 */
  waitMs?: number
}

const ROUTES: RouteSpec[] = [
  { path: '/login', fileName: '01_login', waitMs: 800 },
  { path: '/', fileName: '02_dashboard', waitMs: 1500 },
  { path: '/warehouses', fileName: '03_warehouses', waitMs: 1500 },
  { path: '/slips', fileName: '04_slips_list', waitMs: 1500 },
  { path: '/slips/new', fileName: '05_slip_form', waitMs: 1500 },
]

/**
 * 출력 디렉토리 — worktree 루트 기준.
 *
 * CAPTURE_MODE 재실행은 커밋된 `01_login.png`~`05_slip_form.png`(5장, 파일명 완전 동일)를
 * 직접 덮어썼다(2026-07-26 하네스 재수렴 라운드 G3 — "최악 두 건" 중 하나로 지목). 다른 QA
 * 캡처 스크립트와 동일한 계약(QA_SHOTS_DIR opt-in override, 기본은 `_local/` 격리)을 그대로
 * 인라인한다 — Electron main 번들(src/main/**)에 playwright 전용 헬퍼를 새로 의존시키지
 * 않기 위해서다(패키징 함정 회피, [[feedback_electron_packaging_gotchas]]).
 */
function hasExplicitOverwriteIntent(): boolean {
  return ['1', 'true', 'yes'].includes(String(process.env['QA_ALLOW_OVERWRITE'] ?? '').trim().toLowerCase())
}

function resolvePhysicalPath(candidateDir: string): string {
  let current = resolve(candidateDir)
  const missingParts: string[] = []
  while (!fs.existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) return current
    missingParts.unshift(basename(current))
    current = parent
  }
  return join(fs.realpathSync.native(current), ...missingParts)
}

function normalizePhysicalPath(candidateDir: string): string {
  const isWindows = process.platform === 'win32'
  const withoutExtendedPrefix = isWindows && candidateDir.startsWith('\\\\?\\UNC\\')
    ? `\\\\${candidateDir.slice('\\\\?\\UNC\\'.length)}`
    : isWindows && candidateDir.startsWith('\\\\?\\')
      ? candidateDir.slice('\\\\?\\'.length)
      : candidateDir
  const normalized = normalize(withoutExtendedPrefix)
  const root = parse(normalized).root
  const comparable = normalized === root ? normalized : normalized.replace(/[\\/]+$/, '')
  return isWindows ? comparable.toLowerCase() : comparable
}

function isWithinPhysical(parentDir: string, candidateDir: string): boolean {
  const parent = normalizePhysicalPath(resolvePhysicalPath(parentDir))
  const candidate = normalizePhysicalPath(resolvePhysicalPath(candidateDir))
  const candidateRelative = relative(parent, candidate)
  return (
    candidateRelative === '' ||
    (candidateRelative !== '..' && !candidateRelative.startsWith(`..${sep}`) && !isAbsolute(candidateRelative))
  )
}

function resolveOutputDir(): string {
  // 메인 프로세스의 cwd 는 보통 clients/desktop. worktree 루트로 두 단계 위.
  const committedDir = resolve(process.cwd(), '..', '..', 'docs', 'qa', 'electron-skeleton-slice', 'screenshots')
  const override = process.env['QA_SHOTS_DIR']
  const trimmed = override && override.trim().length > 0 ? override.trim() : undefined
  const directory = trimmed ? resolve(trimmed) : resolve(committedDir, '_local')
  const docsQaRoot = resolve(process.cwd(), '..', '..', 'docs', 'qa')

  if (trimmed && isWithinPhysical(docsQaRoot, directory) && !hasExplicitOverwriteIntent()) {
    throw new Error(
      `[QA 출력 경로 가드] 커밋된 QA 증거 경로로 overwrite 시도를 차단했습니다: ${directory}. ` +
        '명시적으로 허용하려면 QA_ALLOW_OVERWRITE=1을 설정하십시오.',
    )
  }

  return directory
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
  const outDir = resolveOutputDir()
  mkdirSync(outDir, { recursive: true })

  // 첫 페이지 (Vite dev server 기준 `/`) 가 완전히 로드될 때까지 대기.
  await new Promise((resolve) => setTimeout(resolve, 4000))

  for (const route of ROUTES) {
    try {
      await captureRoute(window, route, outDir)
    } catch (err) {
      console.error(`[capture] ${route.path} 실패`, err)
    }
  }

  console.log('[capture] 모든 화면 캡처 완료. 앱 종료.')
  app.quit()
}
