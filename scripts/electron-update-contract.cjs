'use strict'

const ELECTRON_PUBLISHER = 'Samhan Internal Release'
const ELECTRON_UPDATE_CHANNEL = 'latest'
const ELECTRON_UPDATE_PREFIXES = Object.freeze({
  desktop: '/desktop',
  arologis: '/arologis',
  internalChat: '/internal-chat',
})

function requireSigningEnvironment(env = process.env) {
  const cscLink = String(env.CSC_LINK || '').trim()
  const cscKeyPassword = String(env.CSC_KEY_PASSWORD || '').trim()
  if (!cscLink || !cscKeyPassword) {
    throw new Error('CSC_LINK와 CSC_KEY_PASSWORD가 필요합니다. 서명 없는 Electron 릴리스는 허용하지 않습니다.')
  }
  return { publisherName: ELECTRON_PUBLISHER, cscLink, cscKeyPassword }
}

function createElectronReleaseEnvironment({ app, baseUrl, channel = 'stable' }) {
  const prefix = ELECTRON_UPDATE_PREFIXES[app]
  if (!prefix) throw new Error(`지원하지 않는 Electron 제품입니다: ${String(app)}`)
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(normalizedBaseUrl)) throw new Error('Electron update base URL은 http(s)여야 합니다.')
  const betaPrefix = channel === 'beta' ? `${prefix}/beta` : prefix
  return {
    app,
    channel: ELECTRON_UPDATE_CHANNEL,
    prefix: betaPrefix,
    updateUrl: `${normalizedBaseUrl}${betaPrefix}`,
  }
}

function requireUpdateFeedEnvironment(env, app, variable) {
  const prefix = ELECTRON_UPDATE_PREFIXES[app]
  const rawUrl = String(env[variable] || '').replace(/\/+$/, '')
  if (!prefix || !/^https?:\/\//i.test(rawUrl)) throw new Error(`${variable}은 http(s) feed URL이어야 합니다.`)
  const expected = env.SAMHAN_UPDATE_CHANNEL === 'beta' ? `${prefix}/beta` : prefix
  if (!new URL(rawUrl).pathname.endsWith(expected)) {
    throw new Error(`${variable}은 ${expected} 제품 prefix를 포함해야 합니다.`)
  }
  return { app, channel: ELECTRON_UPDATE_CHANNEL, prefix: expected, updateUrl: rawUrl }
}

function classifyUpdaterError(error) {
  const raw = error instanceof Error ? error.message : String(error || '')
  if (/invalid[_ ]signature|unknownerror|certificate chain|not trusted by the trust provider/i.test(raw)) {
    return { kind: 'trust', message: '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.' }
  }
  if (/checksum|hash mismatch|integrity|corrupt|damaged|blockmap/i.test(raw)) {
    return { kind: 'integrity', message: '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.' }
  }
  if (/net::|econn|enotfound|etimedout|timed out|network|socket|dns|http (?:4|5)\d\d/i.test(raw)) {
    return { kind: 'network', message: '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.' }
  }
  return { kind: 'unknown', message: '업데이트에 실패했습니다. 잠시 후 다시 확인해 주세요.' }
}

module.exports = {
  ELECTRON_PUBLISHER,
  ELECTRON_UPDATE_CHANNEL,
  ELECTRON_UPDATE_PREFIXES,
  classifyUpdaterError,
  createElectronReleaseEnvironment,
  requireUpdateFeedEnvironment,
  requireSigningEnvironment,
}
