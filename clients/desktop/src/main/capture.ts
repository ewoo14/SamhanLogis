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
import { hostname, networkInterfaces } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

/**
 * 이 머신에 실제로 바인딩된 non-internal IPv4 주소 전부(로컬 전용 조회 — 네트워크
 * I/O 없음). 2026-07-28 R5 재수렴 결함3 — 고정 별칭 목록은 "열거"라서 어댑터가 늘
 * 때마다 다시 뚫린다. 자세한 배경은 scripts/lib/qa-shots-dir.cjs 의 동명 함수 주석 참조.
 */
function getSelfLanAddresses(): string[] {
  const addresses: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4') addresses.push(entry.address.toLowerCase())
    }
  }
  return addresses
}

/**
 * 자기 자신을 가리키는 UNC admin-share(`\\localhost\D$\...`, `\\127.0.0.1\D$\...`,
 * `\\<컴퓨터명>\D$\...`, `\\<자기 LAN IP>\D$\...`)를 등가의 드라이브 문자 표기
 * (`D:\...`)로 통일한다(2026-07-28 R4 결함3 + R5 재수렴 결함3) — 자세한 배경은
 * scripts/lib/qa-shots-dir.cjs 의 동명 함수 주석 참조. 다른 호스트를 가리키는
 * admin-share 는 실제로 다른 물리 머신이므로 변환하지 않는다.
 */
function normalizeUncAdminShareToDrive(candidateDir: string): string {
  const match = /^\\\\([^\\]+)\\([A-Za-z])\$(\\.*)?$/.exec(candidateDir)
  if (!match) return candidateDir
  const host = (match[1] ?? '').toLowerCase()
  const isKnownAlias = host === 'localhost' || host === '127.0.0.1' || host === '.' || host === hostname().toLowerCase()
  const isSelf = isKnownAlias || getSelfLanAddresses().includes(host)
  if (!isSelf) return candidateDir
  return `${match[2]}:${match[3] ?? '\\'}`
}

function normalizePhysicalPath(candidateDir: string): string {
  const isWindows = process.platform === 'win32'
  const withoutExtendedPrefix = isWindows && candidateDir.startsWith('\\\\?\\UNC\\')
    ? `\\\\${candidateDir.slice('\\\\?\\UNC\\'.length)}`
    : isWindows && candidateDir.startsWith('\\\\?\\')
      ? candidateDir.slice('\\\\?\\'.length)
      : candidateDir
  const withoutUncAdminShare = isWindows ? normalizeUncAdminShareToDrive(withoutExtendedPrefix) : withoutExtendedPrefix
  const normalized = normalize(withoutUncAdminShare)
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
  // 2026-07-28 재수렴 — docs/qa 루트는 이 파일 자신의 물리 위치(__dirname) 기준으로 유도한다
  // (scripts/lib/qa-shots-dir.ps1 이 $PSScriptRoot 를 쓰는 것과 같은 이유). 이전에는
  // process.cwd()(메인 프로세스가 보통 clients/desktop 에서 뜬다는 가정)에 앵커했는데,
  // CAPTURE_MODE=1 이 clients/desktop 이 아닌 cwd(예: 저장소 루트에서 `electron .` 직접 실행)로
  // 뜨면 docsQaRoot 자체가 엉뚱한 경로로 계산되어 물리 판정이 "포함 아님" 으로 조용히
  // 통과해버린다 — 실측(스탠드얼론 repro): cwd=repoRoot 일 때 QA_SHOTS_DIR 를 커밋된
  // electron-skeleton-slice 경로 그대로 줘도 throw 없이 그 경로를 그대로 반환했다(커밋된
  // 01_login.png~05_slip_form.png 를 그대로 덮어쓸 수 있었다는 뜻). __dirname 은 번들 산출물
  // 위치(electron-vite outDir=out/main)에서도 소스 위치(src/main)와 동일하게 clients/desktop
  // 아래 2단계이므로(legacy-asset.ts:32 와 동일 관찰) 두 실행 형태 모두 동일한 상대 깊이
  // (4단계 위)로 저장소 루트에 도달한다. 패키징된 설치본은 이 dev-only 기능의 대상이 아니다
  // (docs/qa 자체가 패키지에 없어 문제되지 않음 — legacy-asset.ts 의 resourcesPath 폴백과
  // 달리 여기서는 그 경로를 별도 처리하지 않는다).
  const repoRootFromHere = resolve(__dirname, '..', '..', '..', '..')
  const committedDir = resolve(repoRootFromHere, 'docs', 'qa', 'electron-skeleton-slice', 'screenshots')
  const override = process.env['QA_SHOTS_DIR']
  const trimmed = override && override.trim().length > 0 ? override.trim() : undefined
  const directory = trimmed ? resolve(trimmed) : resolve(committedDir, '_local')
  const docsQaRoot = resolve(repoRootFromHere, 'docs', 'qa')

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
  // D-4 (2026-07-28 R1 적대검증): resolveOutputDir() 의 물리 경로 가드가 throw 하면
  // 이 함수 아래 app.quit() 에 도달하지 못해 자동화 호출자가 무한 대기했다(실측
  // exited-within-60s=False). try/finally 로 감싸 가드 차단을 포함한 모든 종료
  // 경로에서 앱이 스스로 꺼지도록 한다 — 에러 자체는 finally 이후에도 그대로
  // 전파되어 index.ts 의 .catch 로그는 그대로 유지된다.
  try {
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

    console.log('[capture] 모든 화면 캡처 완료.')
  } finally {
    app.quit()
  }
}
