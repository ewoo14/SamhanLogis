const assert = require('node:assert/strict')
const { test } = require('node:test')
const { resolveCertificateMetadata, resolveCertificateFixtureQuery } = require('./certificate-expiry-fixtures.cjs')

const canonical = {
  certificateId: 'samhan-internal-release',
  status: 'pending-issuance',
  notAfter: '',
  warningDays: 30,
}
const NOW = new Date('2026-08-15T00:00:00.000Z')

test('운영 모드에서는 URL fixture가 있어도 정본 registry를 그대로 쓴다', () => {
  assert.deepEqual(resolveCertificateMetadata(canonical, '?certificateFixture=expired', false), canonical)
})

test('개발 모드 fixture는 31일 이상 상태를 선택한다', () => {
  const result = resolveCertificateMetadata(canonical, '?certificateFixture=none', true, NOW)
  assert.equal(result.status, 'issued')
  assert.equal(result.notAfter, '2026-09-15T00:00:00.000Z')
})

test('개발 모드 fixture는 expiring-soon, expired, issued-unknown을 구분한다', () => {
  assert.equal(resolveCertificateMetadata(canonical, '?certificateFixture=soon', true, NOW).notAfter, '2026-09-14T00:00:00.000Z')
  assert.equal(resolveCertificateMetadata(canonical, '?certificateFixture=expired', true, NOW).notAfter, '2026-08-14T00:00:00.000Z')
  assert.deepEqual(resolveCertificateMetadata(canonical, '?certificateFixture=issued-unknown', true, NOW), {
    ...canonical,
    status: 'issued',
    notAfter: '',
  })
})

test('패키지된 운영 앱에는 fixture query가 주입되지 않는다', () => {
  assert.equal(resolveCertificateFixtureQuery(true, 'expired'), undefined)
  assert.deepEqual(resolveCertificateFixtureQuery(false, 'expired'), { certificateFixture: 'expired' })
  assert.equal(resolveCertificateFixtureQuery(false, 'arbitrary'), undefined)
})
