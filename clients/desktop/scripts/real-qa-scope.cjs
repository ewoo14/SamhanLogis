const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REAL_QA_ROOT = 'clients/desktop/playwright'
const REAL_QA_SUFFIX = '-real-qa.spec.ts'

function normalizeRepoPath(value) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function walkFiles(root, relative = '') {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) return []

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const nextRelative = path.join(relative, entry.name)
    if (entry.isDirectory()) return walkFiles(root, nextRelative)
    return entry.isFile() && entry.name.endsWith(REAL_QA_SUFFIX) ? [nextRelative] : []
  })
}

function listDiskRealQaFiles({ repoRoot }) {
  return walkFiles(repoRoot, REAL_QA_ROOT)
    .map(normalizeRepoPath)
    .sort()
}

function listTrackedRealQaFiles({ repoRoot }) {
  const result = spawnSync('git', ['ls-files', '--cached', '--', REAL_QA_ROOT], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`
    throw new Error(`[real-QA 추적 집합 판정 실패] git ls-files --cached 를 실행하지 못했습니다: ${detail}`)
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => normalizeRepoPath(line.trim()))
    .filter((file) => file.endsWith(REAL_QA_SUFFIX))
    .sort()
}

function compareRealQaScope({ diskFiles, trackedFiles }) {
  const disk = new Set(diskFiles.map(normalizeRepoPath))
  const tracked = new Set(trackedFiles.map(normalizeRepoPath))

  return {
    diskFiles: [...disk].sort(),
    trackedFiles: [...tracked].sort(),
    untrackedFiles: [...disk].filter((file) => !tracked.has(file)).sort(),
    missingFiles: [...tracked].filter((file) => !disk.has(file)).sort(),
  }
}

function getRealQaScope({ repoRoot }) {
  return compareRealQaScope({
    diskFiles: listDiskRealQaFiles({ repoRoot }),
    trackedFiles: listTrackedRealQaFiles({ repoRoot }),
  })
}

function formatScopeMismatch(scope) {
  const sections = ['[real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.']
  if (scope.untrackedFiles.length > 0) {
    sections.push(
      '디스크에는 있지만 Git 추적 목록에는 없는 스펙(공식 수치에 섞이지 않음):',
      ...scope.untrackedFiles.map((file) => `- ${file}`),
    )
  }
  if (scope.missingFiles.length > 0) {
    sections.push(
      'Git 추적 목록에는 있지만 디스크에 없는 스펙(추적 집합 누락):',
      ...scope.missingFiles.map((file) => `- ${file}`),
    )
  }
  sections.push(
    '의도적으로 미추적 로컬 스펙만 실행하려면 REAL_QA_ALLOW_UNTRACKED=1 을 설정하고 명시 경로를 전달하십시오.',
  )
  return sections.join('\n')
}

function assertRealQaScope({ repoRoot, allowUntracked = false }) {
  const scope = getRealQaScope({ repoRoot })
  const mismatch = scope.untrackedFiles.length > 0 || scope.missingFiles.length > 0
  if (mismatch && !allowUntracked) throw new Error(formatScopeMismatch(scope))

  if (mismatch && allowUntracked) {
    process.stderr.write(
      `${formatScopeMismatch(scope)}\n[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.\n`,
    )
  }
  return scope
}

function walkSourceFiles(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) return walkSourceFiles(absolute)
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return []
    if (/\.(?:test|spec|stories)\.(?:ts|tsx)$/.test(entry.name)) return []
    return [absolute]
  })
}

function newestMtime(files) {
  return files.reduce((latest, file) => Math.max(latest, fs.statSync(file).mtimeMs), 0)
}

function describeMtime(file) {
  return fs.existsSync(file) ? new Date(fs.statSync(file).mtimeMs).toISOString() : '없음'
}

function checkFreshArtifact({ artifact, sourceRoots, label, command }) {
  if (!fs.existsSync(artifact)) {
    return `${label}이(가) 없습니다: ${path.relative(process.cwd(), artifact)}. ${command}`
  }

  const sourceFiles = sourceRoots.flatMap(walkSourceFiles)
  const sourceMtime = newestMtime(sourceFiles)
  const artifactMtime = fs.statSync(artifact).mtimeMs
  if (sourceMtime > artifactMtime) {
    const newestSource = sourceFiles
      .filter((file) => fs.statSync(file).mtimeMs === sourceMtime)
      .map((file) => path.relative(process.cwd(), file))[0]
    return [
      `${label}이(가) 소스보다 오래됐습니다: ${path.relative(process.cwd(), artifact)}`,
      `산출물=${describeMtime(artifact)}, 최신 소스=${newestSource ?? '확인 불가'} (${new Date(sourceMtime).toISOString()})`,
      `코드 오류로 단정하지 말고 먼저 ${command}`,
    ].join('\n')
  }
  return null
}

function checkInstalledElectronUpdater({ desktopRoot }) {
  const packageJsonPath = path.join(desktopRoot, 'package.json')
  const lockPath = path.join(desktopRoot, 'package-lock.json')
  const installedPath = path.join(desktopRoot, 'node_modules/electron-updater/package.json')
  if (!fs.existsSync(installedPath)) {
    return 'electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.'
  }

  const installedVersion = JSON.parse(fs.readFileSync(installedPath, 'utf8')).version
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  const lockedVersion = lock.packages?.['node_modules/electron-updater']?.version
  const declaredRange = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).dependencies?.['electron-updater']
  if (lockedVersion && installedVersion !== lockedVersion) {
    return `electron-updater 설치 버전(${installedVersion})이 package-lock 버전(${lockedVersion})과 다릅니다. clients/desktop에서 npm ci 를 실행하십시오.`
  }
  if (!declaredRange) return 'package.json에 electron-updater 의존성 선언이 없습니다.'
  return null
}

function assertDerivedArtifactsFresh({ repoRoot, phase }) {
  const desktopRoot = path.join(repoRoot, 'clients/desktop')
  const issues = [
    checkInstalledElectronUpdater({ desktopRoot }),
    checkFreshArtifact({
      artifact: path.join(repoRoot, 'clients/web/design-system/dist/index.d.ts'),
      sourceRoots: [path.join(repoRoot, 'clients/web/design-system/src')],
      label: 'file: 의존 design-system dist',
      command: 'cd clients/web/design-system; npm run build',
    }),
  ].filter(Boolean)

  if (phase === 'test') {
    issues.push(
      checkFreshArtifact({
        artifact: path.join(desktopRoot, 'out/main/index.js'),
        sourceRoots: [
          path.join(desktopRoot, 'src/main'),
          path.join(desktopRoot, 'src/preload'),
        ],
        label: 'Electron main 빌드 산출물 out/main/index.js',
        command: 'npm run build',
      }),
    )
  }

  const actualIssues = issues.filter(Boolean)
  if (actualIssues.length > 0) {
    throw new Error(
      [
        '[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.',
        ...actualIssues.flatMap((issue) => [`- ${issue}`]),
      ].join('\n'),
    )
  }
}

if (require.main === module) {
  const phase = process.argv.includes('--phase=test') ? 'test' : 'typecheck'
  try {
    assertDerivedArtifactsFresh({ repoRoot: path.resolve(__dirname, '../../..'), phase })
    process.stdout.write(`[로컬 파생물 신선도] ${phase} 대상 산출물 확인 완료\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  REAL_QA_ROOT,
  REAL_QA_SUFFIX,
  assertDerivedArtifactsFresh,
  assertRealQaScope,
  compareRealQaScope,
  formatScopeMismatch,
  getRealQaScope,
  listDiskRealQaFiles,
  listTrackedRealQaFiles,
}
