const { existsSync, readdirSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

function releaseModeEnabled(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rendererJavaScriptFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return rendererJavaScriptFiles(path)
    return entry.name.endsWith('.js') ? [path] : []
  })
}

module.exports = async function validateDesktopRelease(context) {
  if (!releaseModeEnabled(process.env.SAMHAN_RELEASE_BUILD)) {
    throw new Error('electron-builder는 SAMHAN_RELEASE_BUILD=1 릴리스 모드에서만 실행할 수 있습니다.')
  }

  const appVersion = process.env.VITE_APP_VERSION?.trim()
  const artifactVersion = process.env.SAMHAN_RELEASE_ARTIFACT_VERSION?.trim()
  if (!appVersion) {
    throw new Error('electron-builder 실행 전에 VITE_APP_VERSION을 명시해야 합니다.')
  }
  if (!artifactVersion || artifactVersion !== appVersion.replaceAll('/', '-')) {
    throw new Error('SAMHAN_RELEASE_ARTIFACT_VERSION은 주입한 버전과 일치해야 합니다.')
  }

  const projectDir = resolve(context?.packager?.projectDir ?? process.cwd())
  const assetsDir = join(projectDir, 'out', 'renderer', 'assets')
  const currentVersionPattern = new RegExp(
    `CURRENT_VERSION\\s*=\\s*resolveBuildAppVersion\\(\\s*["']${escapeRegExp(appVersion)}["']`,
  )
  const matches = rendererJavaScriptFiles(assetsDir).filter((file) =>
    currentVersionPattern.test(readFileSync(file, 'utf8')))
  if (matches.length === 0) {
    throw new Error(`포장할 renderer가 VITE_APP_VERSION=${appVersion}으로 빌드되지 않았습니다.`)
  }

  console.log(`[release-build] electron-builder 입력 renderer 검증 완료: ${appVersion}`)
}
