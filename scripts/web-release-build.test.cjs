const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { test } = require('node:test')

const {
  createWebReleaseEnvironment,
  verifyViteReleaseOutput,
  writeAndVerifyServerReleaseManifest,
} = require('./web-release-build.cjs')

test('웹 릴리스 환경은 명시 버전 없이는 생성되지 않는다', () => {
  assert.throws(
    () => createWebReleaseEnvironment({ env: {} }),
    /VITE_APP_VERSION.*YYYY\/MM\/DD-번호|릴리스/,
  )
})

test('Vite 릴리스 산출물은 실제 주입 버전과 release marker를 모두 검증한다', () => {
  const root = mkdtempSync(join(tmpdir(), 'samhan-web-release-'))
  try {
    writeFileSync(join(root, 'index.html'), '<script src="assets/app.js"></script>')
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'assets/app.js'), 'const version = "2026/08/15-1"')

    const marker = verifyViteReleaseOutput({
      outputDir: root,
      appName: 'order-app',
      appVersion: '2026/08/15-1',
    })

    assert.equal(marker.appVersion, '2026/08/15-1')
    assert.equal(marker.release, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Express/EJS 릴리스는 서버 배포용 manifest에 실제 버전을 기록하고 재검증한다', () => {
  const root = mkdtempSync(join(tmpdir(), 'samhan-estimate-release-'))
  try {
    const manifestPath = join(root, 'release', '.samhan-release.json')
    const manifest = writeAndVerifyServerReleaseManifest({
      manifestPath,
      appName: 'estimate-app',
      appVersion: '2026/08/15-1',
    })

    assert.deepEqual(manifest, {
      appName: 'estimate-app',
      appVersion: '2026/08/15-1',
      release: true,
      artifact: 'server-runtime-manifest',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
