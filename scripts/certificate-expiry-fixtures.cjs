'use strict'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Renderer QA 전용 인증서 상태 fixture.
 * 운영 renderer는 allowFixture=false를 전달하므로 URL로 registry를 바꿀 수 없다.
 */
function resolveCertificateMetadata(canonical, search, allowFixture, now = new Date()) {
  if (!allowFixture || typeof search !== 'string') return canonical
  const fixture = new URLSearchParams(search).get('certificateFixture')
  if (!fixture) return canonical

  const nowMs = new Date(now).getTime()
  const atDays = (days) => new Date(nowMs + days * DAY_MS).toISOString()
  const issued = { ...canonical, status: 'issued' }
  if (fixture === 'none') return { ...issued, notAfter: atDays(31) }
  if (fixture === 'soon') return { ...issued, notAfter: atDays(30) }
  if (fixture === 'expired') return { ...issued, notAfter: atDays(-1) }
  if (fixture === 'issued-unknown') return { ...issued, notAfter: '' }
  return canonical
}

function resolveCertificateFixtureQuery(isPackaged, fixture) {
  if (isPackaged || typeof fixture !== 'string' || !/^(?:none|soon|expired|issued-unknown)$/.test(fixture)) return undefined
  return { certificateFixture: fixture }
}

module.exports = { resolveCertificateMetadata, resolveCertificateFixtureQuery }
