'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const noticeSource = fs.readFileSync(
  path.join(__dirname, '..', 'clients', 'desktop', 'src', 'renderer', 'components', 'common', 'CertificateExpiryNotice.tsx'),
  'utf8',
)

test('CertificateExpiryNotice does not request named exports from CommonJS modules in Vite dev', () => {
  assert.doesNotMatch(noticeSource, /from\s*['"][^'"]*certificate-expiry\.cjs['"]/) 
  assert.doesNotMatch(noticeSource, /from\s*['"][^'"]*certificate-expiry-fixtures\.cjs['"]/) 
})
