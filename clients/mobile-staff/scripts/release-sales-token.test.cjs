'use strict'

const assert = require('node:assert/strict')
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs')
const { join, relative, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')

const PROJECT_DIR = resolve(__dirname, '..')
const SENTINEL = 'SOL_BUNDLE_SENTINEL_1246_PLAINTEXT'

function runExport({ buildEnv, appVariant = 'sales', outputDir }) {
  const outputArg = process.platform === 'win32' ? relative(PROJECT_DIR, outputDir) : outputDir
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npx.cmd expo export --platform web --clear --output-dir ${outputArg}`]
    : ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', outputArg]
  return spawnSync(command, args, {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      ...(buildEnv === undefined ? { BUILD_ENV: undefined } : { BUILD_ENV: buildEnv }),
      ...(appVariant === undefined ? { APP_VARIANT: undefined } : { APP_VARIANT: appVariant }),
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

test('sales release export rejects a token when BUILD_ENV is not specified', () => {
  const outputDir = mkdtempSync(join(PROJECT_DIR, '.tmp-mobile-staff-unset-build-env-'))
  try {
    const result = runExport({ buildEnv: undefined, outputDir })
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.deepEqual(grepSentinel(outputDir), [])
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('release export rejects a token when APP_VARIANT is not specified', () => {
  const outputDir = mkdtempSync(join(PROJECT_DIR, '.tmp-mobile-staff-unset-app-variant-'))
  try {
    const result = runExport({ buildEnv: 'production', appVariant: undefined, outputDir })
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.deepEqual(grepSentinel(outputDir), [])
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('release guard sweep blocks every non-explicit-development environment and preserves development', () => {
  const cases = [
    { label: 'BUILD_ENV unset / APP_VARIANT sales', buildEnv: undefined, appVariant: 'sales', blocked: true },
    { label: 'BUILD_ENV production / APP_VARIANT unset', buildEnv: 'production', appVariant: undefined, blocked: true },
    { label: 'BUILD_ENV PRODUCTION / APP_VARIANT SALES', buildEnv: 'PRODUCTION', appVariant: 'SALES', blocked: true },
    { label: 'BUILD_ENV space-prod / APP_VARIANT space-sales', buildEnv: ' prod ', appVariant: ' sales ', blocked: true },
    { label: 'BUILD_ENV preview / APP_VARIANT staff', buildEnv: 'preview', appVariant: 'staff', blocked: true },
    { label: 'BUILD_ENV empty / APP_VARIANT empty', buildEnv: '', appVariant: '', blocked: true },
    { label: 'BUILD_ENV space-development / APP_VARIANT sales', buildEnv: ' development ', appVariant: 'sales', blocked: false },
    { label: 'BUILD_ENV DEVELOPMENT / APP_VARIANT staff', buildEnv: 'DEVELOPMENT', appVariant: 'staff', blocked: false },
  ]

  const results = cases.map(({ label, buildEnv, appVariant, blocked }) => {
    const outputDir = mkdtempSync(join(PROJECT_DIR, '.tmp-mobile-staff-sweep-'))
    try {
      const result = runExport({ buildEnv, appVariant, outputDir })
      const actualBlocked = result.status !== 0 && grepSentinel(outputDir).length === 0
      assert.equal(actualBlocked, blocked, `${label}\n${result.stdout}\n${result.stderr}`)
      return { label, blocked: actualBlocked }
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  assert.equal(results.filter(({ blocked }) => blocked).length, 6)
  assert.equal(results.filter(({ blocked }) => !blocked).length, 2)
})
