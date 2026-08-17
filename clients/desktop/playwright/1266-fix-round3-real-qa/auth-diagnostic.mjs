import fs from 'node:fs'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const env = {}
for (const line of fs.readFileSync('infrastructure/.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
}

const login = await fetch('http://127.0.0.1:8080/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') }),
})
const loginBody = await login.json()
const setCookie = login.headers.get('set-cookie') ?? ''
const token = (setCookie.match(/access_token=([^;]+)/) ?? [])[1] ?? ''
const claims = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) : {}
console.log(`LOGIN status=${login.status} bodyKeys=${Object.keys(loginBody).join(',')}`)
console.log(`COOKIE access_token=${Boolean(token)}`)
console.log(`JWT payload keys=${Object.keys(claims).join(',')}`)
console.log(`JWT sub present=${Boolean(claims.sub)} groupsType=${typeof claims.groups} isSystemMaster=${String(claims.isSystemMaster)}`)

const headers = {
  'X-Samhan-Gateway-Attestation': env.SAMHAN_GATEWAY_ATTESTATION,
  'X-User-Id': String(claims.sub ?? ''),
  'X-User-Groups': typeof claims.groups === 'string' ? claims.groups : '',
  'X-Is-System-Master': String(claims.isSystemMaster ?? false),
  authorization: `Bearer ${token}`,
  cookie: `access_token=${token}`,
}
const save = await fetch('http://127.0.0.1:28086/slips/cleanup/history', {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    programType: 'SLIP_CLEANUP',
    saveMode: 'MANUAL_NAMED',
    topic: 'PR1266-R3 실제 복원 검증',
    requestParams: { from: '2026-08-01', to: '2026-08-18' },
    responsePayload: { from: '2026-08-01', to: '2026-08-18', totalSlips: 1, totalAmount: '125000', byStatus: [{ status: 'SAVED', count: 1 }], byPartner: [{ partnerCode: 'QA1266', partnerName: '복원 검증 거래처', count: 1 }], entries: [{ id: '00000000-0000-0000-0000-000000001266', slipNo: 'QA-1266-R3', slipDate: '2026-08-18', status: 'SAVED', partnerCode: 'QA1266', partnerName: '복원 검증 거래처', classifiedRegionGroup: '서울', lineCount: 1, totalAmount: '125000', partnerCodeMissing: false, amountZero: false, linesMissing: false, regionMissing: false }] },
  }),
})
console.log(`SAVE status=${save.status} body=${await save.text()}`)
for (const url of [
  'http://127.0.0.1:28086/slips/cleanup/history?programType=SLIP_CLEANUP&mode=MANUAL_NAMED&page=0&size=50',
  'http://127.0.0.1:8080/slips/cleanup/history?programType=SLIP_CLEANUP&mode=MANUAL_NAMED&page=0&size=50',
]) {
  const response = await fetch(url, { headers })
  console.log(`URL=${url} status=${response.status} body=${await response.text()}`)
}
