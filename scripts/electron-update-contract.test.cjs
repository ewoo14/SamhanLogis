'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const {
  ELECTRON_PUBLISHER,
  ELECTRON_UPDATE_CHANNEL,
  ELECTRON_UPDATE_PREFIXES,
  classifyUpdaterError,
  createElectronReleaseEnvironment,
  requireUpdateFeedEnvironment,
  requireSigningEnvironment,
} = require('./electron-update-contract.cjs')

test('3개 Electron 앱은 서로 다른 제품 prefix와 같은 latest 채널을 사용한다', () => {
  assert.deepEqual(ELECTRON_UPDATE_PREFIXES, {
    desktop: '/desktop',
    arologis: '/arologis',
    internalChat: '/internal-chat',
  })
  assert.equal(ELECTRON_UPDATE_CHANNEL, 'latest')
  assert.equal(ELECTRON_PUBLISHER, 'Samhan Internal Release')
  for (const file of ['clients/desktop/electron-builder.yml', 'clients/arologis-desktop/electron-builder.yml', 'clients/internal-chat-desktop/electron-builder.yml']) {
    const config = readFileSync(resolve(__dirname, '..', file), 'utf8')
    assert.match(config, /forceCodeSigning:\s*true/)
    assert.match(config, /publisherName:\s*Samhan Internal Release/)
    assert.match(config, /channel:\s*latest/)
  }
})

test('beta는 stable prefix를 오염시키지 않고 별도 prefix를 사용한다', () => {
  const release = createElectronReleaseEnvironment({
    app: 'desktop',
    baseUrl: 'https://updates.example.test',
    channel: 'beta',
  })
  assert.equal(release.updateUrl, 'https://updates.example.test/desktop/beta')
  assert.equal(release.channel, 'latest')
})

test('서명 환경이 없으면 Linux에서도 릴리스 계약이 실패한다', () => {
  assert.throws(
    () => requireSigningEnvironment({}),
    /CSC_LINK.*CSC_KEY_PASSWORD/,
  )
})

test('서명 환경이 있으면 signer와 publisher 계약을 반환한다', () => {
  assert.deepEqual(requireSigningEnvironment({ CSC_LINK: 'release.pfx', CSC_KEY_PASSWORD: 'secret' }), {
    publisherName: ELECTRON_PUBLISHER,
    cscLink: 'release.pfx',
    cscKeyPassword: 'secret',
  })
})

test('feed URL은 앱별 prefix를 강제하고 잘못된 앱 feed를 거부한다', () => {
  assert.equal(
    requireUpdateFeedEnvironment({ DESKTOP_UPDATE_URL: 'https://updates.example.test/desktop' }, 'desktop', 'DESKTOP_UPDATE_URL').updateUrl,
    'https://updates.example.test/desktop',
  )
  assert.throws(
    () => requireUpdateFeedEnvironment({ DESKTOP_UPDATE_URL: 'https://updates.example.test/arologis' }, 'desktop', 'DESKTOP_UPDATE_URL'),
    /DESKTOP_UPDATE_URL.*\/desktop/,
  )
})

test('updater 오류는 인증서·무결성·네트워크 3계열로만 사용자에게 매핑된다', () => {
  assert.equal(classifyUpdaterError('ERR_UPDATER_INVALID_SIGNATURE UnknownError').kind, 'trust')
  assert.equal(classifyUpdaterError('ERR_UPDATER_CHECKSUM_MISMATCH').kind, 'integrity')
  assert.equal(classifyUpdaterError('net::ERR_CONNECTION_TIMED_OUT').kind, 'network')
  for (const raw of ['UnknownError', 'ERR_UPDATER_INVALID_SIGNATURE', '/internal-chat/latest.yml', '550e8400-e29b-41d4-a716-446655440000']) {
    assert.equal(classifyUpdaterError(raw).message.includes(raw), false)
  }
})
