const assert = require('node:assert/strict')
const { test } = require('node:test')
const { classifyCertificateExpiry } = require('./certificate-expiry.cjs')

const NOW = new Date('2026-08-15T00:00:00.000Z')

test('미발급 상태의 빈 registry는 조용한 unknown이다', () => {
  assert.deepEqual(classifyCertificateExpiry({ status: 'pending-issuance', now: NOW }), {
    kind: 'unknown',
    alert: false,
    operationalIssue: false,
  })
})

test('발급 상태의 빈 registry는 운영 이상으로 구분된다', () => {
  assert.deepEqual(classifyCertificateExpiry({ status: 'issued', now: NOW }), {
    kind: 'unknown',
    alert: true,
    operationalIssue: true,
  })
})

test('만료 31일 전은 알림이 없고 30일 전부터 임박 알림이다', () => {
  assert.equal(classifyCertificateExpiry({ status: 'issued', notAfter: '2026-09-15T00:00:00.000Z', now: NOW }).kind, 'none')
  assert.equal(classifyCertificateExpiry({ status: 'issued', notAfter: '2026-09-14T00:00:00.000Z', now: NOW }).kind, 'expiring-soon')
})

test('만료 후에는 expired로 구분된다', () => {
  assert.deepEqual(classifyCertificateExpiry({ status: 'issued', notAfter: '2026-08-14T23:59:59.000Z', now: NOW }), {
    kind: 'expired',
    alert: true,
    operationalIssue: true,
  })
})
