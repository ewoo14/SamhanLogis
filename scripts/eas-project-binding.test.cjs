'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const { resolve } = require('node:path')

const bindings = [
  {
    app: 'mobile',
    slug: 'samhan-mobile',
    projectId: '8fe0a7e7-3330-490c-bd01-05b4899c6cbd',
  },
  {
    app: 'mobile-staff',
    slug: 'samhan-estimate',
    projectId: 'e0a532b1-4728-44a2-8349-5738894392a1',
  },
  {
    app: 'arologis-mobile',
    slug: 'arologis-driver',
    projectId: '82dd1163-99b6-4055-bf70-84dc76feabee',
  },
]

function loadConfig(app) {
  const configPath = resolve(__dirname, '..', 'clients', app, 'app.config.js')
  const script = `const config = require(${JSON.stringify(configPath)}); process.stdout.write(JSON.stringify(config.expo))`
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BUILD_ENV: 'production',
      EAS_PROJECT_ID: '',
      EXPO_PUBLIC_APP_VERSION: '2026/08/15-910',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

for (const binding of bindings) {
  test(`${binding.app} slug가 자기 EAS projectId에만 연결된다`, () => {
    const expo = loadConfig(binding.app)
    assert.equal(expo.slug, binding.slug)
    assert.equal(expo.extra.eas.projectId, binding.projectId)
    assert.equal(expo.updates.url, `https://u.expo.dev/${binding.projectId}`)
    assert.equal(expo.updates.enabled, true)
    assert.deepEqual(expo.runtimeVersion, { policy: 'appVersion' })
  })
}

test('EAS_PROJECT_ID 환경변수 override는 기본 배선을 덮어쓸 수 있다', () => {
  const configPath = resolve(__dirname, '..', 'clients', 'mobile', 'app.config.js')
  const override = '11111111-2222-3333-4444-555555555555'
  const script = `const config = require(${JSON.stringify(configPath)}); process.stdout.write(JSON.stringify(config.expo))`
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BUILD_ENV: 'production',
      EAS_PROJECT_ID: override,
      EXPO_PUBLIC_APP_VERSION: '2026/08/15-910',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  const expo = JSON.parse(result.stdout)
  assert.equal(expo.extra.eas.projectId, override)
  assert.equal(expo.updates.url, `https://u.expo.dev/${override}`)
})
