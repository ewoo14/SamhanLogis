'use strict'

const assert = require('node:assert/strict')
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs')
const { join, relative, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')

const PROJECT_DIR = resolve(__dirname, '..')
const SENTINEL = 'SOL_BUNDLE_SENTINEL_1246_PLAINTEXT'

function runExport({ buildEnv, outputDir }) {
  const outputArg = process.platform === 'win32' ? relative(PROJECT_DIR, outputDir) : outputDir
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npx.cmd expo export --platform web --clear --output-dir ${outputArg}`]
    : ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', outputArg]
  return spawnSync(command, args, {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      BUILD_ENV: buildEnv,
      APP_VARIANT: 'sales',
      EXPO_PUBLIC_APP_VERSION: '2026/08/16-1246',
      EXPO_PUBLIC_SALES_ACCESS_TOKEN: SENTINEL,
    },
    encoding: 'utf8',
  })
}

function outputFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? outputFiles(file) : [file]
  })
}

function grepSentinel(directory) {
  return outputFiles(directory)
    .filter((file) => /\.(?:html|js|css|json|webmanifest)$/.test(file))
    .filter((file) => readFileSync(file, 'utf8').includes(SENTINEL))
}

test('production web export rejects a sales access token before it can enter the bundle', () => {
  const outputDir = mkdtempSync(join(PROJECT_DIR, '.tmp-mobile-staff-release-'))
  try {
    const result = runExport({ buildEnv: 'production', outputDir })
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(`${result.stdout}\n${result.stderr}`, /EXPO_PUBLIC_SALES_ACCESS_TOKEN|릴리스.*토큰|release.*token/i)
    assert.deepEqual(grepSentinel(outputDir), [])
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('preview sales web export rejects a sales access token before it can enter the bundle', () => {
  const outputDir = mkdtempSync(join(PROJECT_DIR, '.tmp-mobile-staff-preview-'))
  try {
    const result = runExport({ buildEnv: 'preview', outputDir })
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(`${result.stdout}\n${result.stderr}`, /EXPO_PUBLIC_SALES_ACCESS_TOKEN|릴리스.*토큰|release.*token/i)
    assert.deepEqual(grepSentinel(outputDir), [])
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('development web export still permits the sales access token for local QA', () => {
  const outputDir = mkdtempSync(join(PROJECT_DIR, '.tmp-mobile-staff-dev-'))
  try {
    const result = runExport({ buildEnv: 'development', outputDir })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.notDeepEqual(grepSentinel(outputDir), [])
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})
