import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const UI_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5225'
const AUTH_BASE = process.env['AUTH_API_BASE'] ?? 'http://localhost:8080'
const PARTNER_BASE = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:38095'
const DB_CONTAINER = process.env['R7_DB_CONTAINER'] ?? ''
const SOURCE = path.resolve(DIRNAME, '../../../../docs/migration/896-sheet/ecount/거래처등록.xlsx')
const SHOTS = resolveQaShotsDir(path.resolve(DIRNAME, '../../../../docs/qa/2026-08-09-1154-r7-sol-reconv'))

const UUID_CODE = 'SOL1154R7UUID'
const TX_BEFORE = 'SOL1154R7TXBEFORE'
const TX_BAD = 'SOL1154R7TXBAD'
const TX_AFTER = 'SOL1154R7TXAFTER'

interface LoginResult { token: string; role: string; userId: string; displayName: string }
interface CallRecord { method: string; url: string; status: number; body: string }

function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', 'partner_r7', '-c', query], {
    encoding: 'utf8',
  }).trim()
}

function csv(rows: Array<{ code: string; name: string; credit?: string }>): Buffer {
  const meta = '\uFEFF"데이터관리>거래처-Excel다운로드"'
  const header = '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""'
  const data = rows.map(({ code, name, credit = '' }) =>
    `"${code}\t","20230814\t","R7담당자\t","\t","${name}\t","대표\t","서울\t","\t","\t","\t","\t","일반업체\t","YES\t","등록\t","${credit}\t","\t",""`,
  )
  return Buffer.from([meta, header, ...data].join('\n') + '\n', 'utf8')
}

async function renderEvidence(page: Page, title: string, evidence: unknown, filename: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body{font-family:"Noto Sans KR",Arial,sans-serif;background:#0b1220;color:#e5eefc;margin:0;padding:36px}
    h1{font-size:27px;margin:0 0 18px;color:#7dd3fc}pre{white-space:pre-wrap;word-break:break-all;background:#111c30;border:1px solid #2b466e;border-radius:12px;padding:22px;font-size:15px;line-height:1.55}
    .tag{display:inline-block;background:#164e63;color:#cffafe;border-radius:999px;padding:6px 12px;margin-bottom:18px}
  </style></head><body><span class="tag">PR #1154 R7 · HEAD 877796842</span><h1>${title}</h1><pre>${JSON.stringify(evidence, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`)
  await page.screenshot({ path: path.join(SHOTS, filename), fullPage: true })
}

test('PR #1154 R7 실 관리자 API 재수렴', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')

  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  test.skip(!DB_CONTAINER, 'R7_DB_CONTAINER가 없어 격리 PostgreSQL 실측을 건너뜁니다.')
  expect(fs.existsSync(SOURCE), '#896 정본 XLSX가 필요합니다.').toBeTruthy()

  const calls: CallRecord[] = []
  const call = async (method: string, url: string, options: Parameters<APIRequestContext['fetch']>[1] = {}) => {
    const response = await request.fetch(url, { ...options, method })
    const body = await response.text()
    const evidenceBody = url.endsWith('/auth/login')
      ? body.replace(/"token":"[^"]+"/, '"token":"<redacted>"')
      : body
    calls.push({ method, url, status: response.status(), body: evidenceBody.slice(0, 4000) })
    return { response, body }
  }

  const login = await call('POST', `${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.response.ok(), `실 auth 로그인 실패: ${login.body}`).toBeTruthy()
  const loginBody = JSON.parse(login.body).data ?? {}
  const auth: LoginResult = {
    token: loginBody.token ?? '', role: loginBody.role ?? 'MASTER', userId: loginBody.userId ?? '', displayName: loginBody.displayName ?? 'dev_master',
  }
  expect(auth.userId).not.toBe('')
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'X-User-Id': auth.userId,
    'X-User-Role': 'MASTER',
    'X-Is-System-Master': 'true',
  }

  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' })
  const health = await call('GET', `${PARTNER_BASE}/actuator/health`)
  expect(health.response.status()).toBe(200)

  // 발화 조건을 쓰기 전에 먼저 계수한다.
  const triggerCounts = {
    uuidFixtureActiveBefore: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${UUID_CODE}' AND is_deleted=false`)),
    txFixtureRowsBefore: Number(sql(`SELECT count(*) FROM partners WHERE partner_code IN ('${TX_BEFORE}','${TX_BAD}','${TX_AFTER}')`)),
    sourceBytes: fs.statSync(SOURCE).size,
  }
  expect(triggerCounts.uuidFixtureActiveBefore).toBe(0)
  expect(triggerCounts.txFixtureRowsBefore).toBe(0)
  expect(triggerCounts.sourceBytes).toBeGreaterThan(0)
  await renderEvidence(page, '환경 및 발화 조건 카운트', { browserName, UI_BASE, AUTH_BASE, PARTNER_BASE, DB_CONTAINER, triggerCounts }, '00-environment-trigger-counts.png')

  const uploadCsv = async (contents: Buffer) => call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers,
    multipart: { file: { name: 'r7.csv', mimeType: 'text/csv', buffer: contents } },
    timeout: 120_000,
  })
  const uploadXlsx = async () => call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount-xlsx`, {
    headers,
    multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(SOURCE) } },
    timeout: 10 * 60_000,
  })

  // 각도 1: 생성→사용자 하위자원 생성→관리자 삭제→정본 재적재.
  const uuidCsv = csv([{ code: UUID_CODE, name: 'R7 UUID 복원 검증', credit: '100000' }])
  const firstUuidImport = await uploadCsv(uuidCsv)
  expect(firstUuidImport.response.status(), firstUuidImport.body).toBe(200)
  const beforeUuid = sql(`SELECT id::text FROM partners WHERE partner_code='${UUID_CODE}' AND is_deleted=false`)
  const address = await call('POST', `${PARTNER_BASE}/api/v1/partners/${UUID_CODE}/shipping-addresses`, {
    headers, data: { alias: 'R7참조', zipCode: '04524', address: '서울특별시 중구', phone: '02-0000-0000', receiverName: 'R7', isDefault: true, memo: 'R7 UUID 참조 검증' },
  })
  expect(address.response.status(), address.body).toBe(201)
  const addressId = JSON.parse(address.body).data.id as string
  const deleteUuid = await call('DELETE', `${PARTNER_BASE}/admin/partners/${UUID_CODE}`, { headers })
  expect(deleteUuid.response.status(), deleteUuid.body).toBe(200)
  const restoreImport = await uploadCsv(uuidCsv)
  expect(restoreImport.response.status(), restoreImport.body).toBe(200)
  const angle1Sql = sql(`SELECT p.id::text AS active_uuid, '${beforeUuid}' AS before_uuid, count(*) FILTER (WHERE p.is_deleted=false) AS active_rows, count(*) FILTER (WHERE p.is_deleted=true) AS deleted_rows, (SELECT count(*) FROM partner_shipping_addresses a WHERE a.partner_id <> p.id AND a.alias='R7참조') AS orphan_rows FROM partners p WHERE p.partner_code='${UUID_CODE}' GROUP BY p.id`)
  expect(angle1Sql).toContain(`${beforeUuid}|${beforeUuid}|1|0|0`)
  await renderEvidence(page, '각도 1 · 삭제 후 재적재 UUID 및 참조', { beforeUuid, firstResponse: JSON.parse(firstUuidImport.body), restoreResponse: JSON.parse(restoreImport.body), sql: angle1Sql }, '01-uuid-reference-restore.png')

  const cleanupAddress = await call('DELETE', `${PARTNER_BASE}/api/v1/partners/${UUID_CODE}/shipping-addresses/${addressId}`, { headers })
  expect(cleanupAddress.response.status(), cleanupAddress.body).toBe(204)
  const cleanupPartner = await call('DELETE', `${PARTNER_BASE}/admin/partners/${UUID_CODE}`, { headers })
  expect(cleanupPartner.response.status(), cleanupPartner.body).toBe(200)
  const angle1Cleanup = `CLEANUP_VERIFY UUID_CODE active=${sql(`SELECT count(*) FROM partners WHERE partner_code='${UUID_CODE}' AND is_deleted=false`)} active_child=${sql("SELECT count(*) FROM partner_shipping_addresses WHERE alias='R7참조' AND is_deleted=false")}`
  expect(angle1Cleanup).toContain('active=0 active_child=0')

  // 각도 2: 유효 헤더/행 순서에서 DB 길이 제약을 넘는 단일 실패행을 실제 업로드한다.
  const failureCsv = csv([
    { code: TX_BEFORE, name: 'R7 실패행 앞 정상' },
    { code: TX_BAD, name: '가'.repeat(201) },
    { code: TX_AFTER, name: 'R7 실패행 뒤 정상' },
  ])
  const failureImport = await uploadCsv(failureCsv)
  expect(failureImport.response.status()).toBeGreaterThanOrEqual(500)
  const angle2Sql = sql(`SELECT partner_code, count(*) FILTER (WHERE is_deleted=false) FROM partners WHERE partner_code IN ('${TX_BEFORE}','${TX_BAD}','${TX_AFTER}') GROUP BY partner_code ORDER BY partner_code`)
  const angle2Counts = {
    before: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_BEFORE}' AND is_deleted=false`)),
    bad: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_BAD}' AND is_deleted=false`)),
    after: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_AFTER}' AND is_deleted=false`)),
    stagingRows: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE raw_partner_code IN ('${TX_BEFORE}','${TX_BAD}','${TX_AFTER}')`)),
  }
  expect(angle2Counts).toEqual({ before: 1, bad: 0, after: 0, stagingRows: 2 })
  await renderEvidence(page, '각도 2 · 행 실패 격리 실측', { responseStatus: failureImport.response.status(), responseBody: failureImport.body, counts: angle2Counts, sql: angle2Sql }, '02-row-failure-isolation.png')
  const cleanupTx = await call('DELETE', `${PARTNER_BASE}/admin/partners/${TX_BEFORE}`, { headers })
  expect(cleanupTx.response.status(), cleanupTx.body).toBe(200)

  // 각도 3: 정본 7,253건을 두 번 적재하고 응답/SQL 분포를 함께 고정한다.
  const firstFull = await uploadXlsx()
  expect(firstFull.response.status(), firstFull.body).toBe(200)
  const firstFullBody = JSON.parse(firstFull.body)
  const secondFull = await uploadXlsx()
  expect(secondFull.response.status(), secondFull.body).toBe(200)
  const secondFullBody = JSON.parse(secondFull.body)
  const fullHash = firstFullBody.sourceFileHash as string
  const angle3Sql = sql(`SELECT count(*) AS active_rows, count(*) FILTER (WHERE status='ACTIVE') AS active_count, count(*) FILTER (WHERE status='SUSPENDED') AS suspended_count, count(*) FILTER (WHERE credit_limit IS NULL) AS credit_null, count(*) FILTER (WHERE registration_date IS NOT NULL) AS registration_present, count(*) FILTER (WHERE registration_date IS NULL) AS registration_null, count(*) FILTER (WHERE registration_date IS NOT NULL AND created_at <> registration_date::timestamp) AS created_at_mismatch FROM partners p WHERE p.is_deleted=false AND p.id IN (SELECT target_partner_id FROM staging.ecount_partner_raw WHERE source_file_hash='${fullHash}')`)
  expect(firstFullBody.totalRows).toBe(7253)
  expect(firstFullBody.imported).toBe(7253)
  expect(secondFullBody.imported).toBe(0)
  expect(secondFullBody.updated).toBe(7253)
  expect(angle3Sql).toContain(`${7253}|`)
  await renderEvidence(page, '각도 3 · 정본 7,253건 분포 및 교정', { firstResponse: firstFullBody, secondResponse: secondFullBody, sql: angle3Sql }, '03-master-7253-distribution.png')

  fs.writeFileSync(path.join(SHOTS, 'network-api-calls.json'), `${JSON.stringify(calls, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(SHOTS, 'cleanup-verify.txt'), `${angle1Cleanup}\nCLEANUP_VERIFY TX_BEFORE active=${sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_BEFORE}' AND is_deleted=false`)}\n`, 'utf8')
})

test('PR #1154 R7 정본 XLSX 삭제행 UUID 복원', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  test.skip(!DB_CONTAINER, 'R7_DB_CONTAINER가 없어 격리 PostgreSQL 실측을 건너뜁니다.')

  const sourceHash = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
  const candidateCount = Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE source_file_hash='${sourceHash}' AND target_partner_id IS NOT NULL AND raw_partner_code <> '1068689215'`))
  expect(candidateCount, '정본 적재 후보가 0이면 판정 불가').toBeGreaterThan(0)
  const candidate = sql(`SELECT raw_partner_code FROM staging.ecount_partner_raw WHERE source_file_hash='${sourceHash}' AND target_partner_id IS NOT NULL AND raw_partner_code <> '1068689215' AND raw_partner_code ~ '^[0-9]{2,}$' ORDER BY raw_partner_code LIMIT 1`)
  expect(candidate).not.toBe('')

  const loginResponse = await request.post(`${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(loginResponse.ok()).toBeTruthy()
  const loginBody = (await loginResponse.json()).data ?? {}
  const headers = {
    Authorization: `Bearer ${loginBody.token ?? ''}`,
    'X-User-Id': loginBody.userId ?? '',
    'X-User-Role': 'MASTER',
    'X-Is-System-Master': 'true',
  }
  const encodedCandidate = encodeURIComponent(candidate)
  const beforeUuid = sql(`SELECT id::text FROM partners WHERE partner_code='${candidate}' AND is_deleted=false`)

  const addressResponse = await request.post(`${PARTNER_BASE}/api/v1/partners/${encodedCandidate}/shipping-addresses`, {
    headers,
    data: { alias: 'R7정본참조', zipCode: '04524', address: '서울특별시 중구', phone: '02-0000-0000', receiverName: 'R7', isDefault: false, memo: 'R7 정본 UUID 참조 검증' },
  })
  expect(addressResponse.status(), await addressResponse.text()).toBe(201)
  const addressId = ((await addressResponse.json()).data ?? {}).id as string
  const deleteResponse = await request.delete(`${PARTNER_BASE}/admin/partners/${encodedCandidate}`, { headers })
  expect(deleteResponse.status(), await deleteResponse.text()).toBe(200)
  const restoreResponse = await request.post(`${PARTNER_BASE}/admin/partners/imports/ecount-xlsx`, {
    headers,
    multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(SOURCE) } },
    timeout: 10 * 60_000,
  })
  const restoreBody = await restoreResponse.json()
  expect(restoreResponse.status(), JSON.stringify(restoreBody)).toBe(200)
  expect(restoreBody.updated).toBe(7253)

  const angle1Sql = sql(`SELECT p.id::text AS active_uuid, '${beforeUuid}' AS before_uuid, count(*) FILTER (WHERE p.is_deleted=false) AS active_rows, count(*) FILTER (WHERE p.is_deleted=true) AS deleted_rows, (SELECT count(*) FROM partner_shipping_addresses a WHERE a.id='${addressId}' AND a.partner_id <> p.id) AS orphan_rows FROM partners p WHERE p.partner_code='${candidate}' GROUP BY p.id`)
  expect(angle1Sql).toContain(`${beforeUuid}|${beforeUuid}|1|0|0`)
  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' })
  await renderEvidence(page, '각도 1 · 정본 XLSX 삭제 후 UUID 및 참조', { candidateCount, candidate, beforeUuid, restoreResponse: restoreBody, sql: angle1Sql }, '01-uuid-reference-restore.png')

  const cleanupAddress = await request.delete(`${PARTNER_BASE}/api/v1/partners/${encodedCandidate}/shipping-addresses/${addressId}`, { headers })
  expect(cleanupAddress.status()).toBe(204)
  const cleanup = `CLEANUP_VERIFY MASTER_CANDIDATE code=${candidate} active=${sql(`SELECT count(*) FROM partners WHERE partner_code='${candidate}' AND is_deleted=false`)} active_child=${sql("SELECT count(*) FROM partner_shipping_addresses WHERE alias='R7정본참조' AND is_deleted=false")}`
  expect(cleanup).toContain('active=1 active_child=0')
  fs.appendFileSync(path.join(SHOTS, 'cleanup-verify.txt'), `${cleanup}\n`, 'utf8')
  fs.writeFileSync(path.join(SHOTS, 'angle1-master-network-api-calls.json'), `${JSON.stringify([
    { method: 'POST', status: loginResponse.status(), url: `${AUTH_BASE}/auth/login`, body: '<token redacted>' },
    { method: 'POST', status: addressResponse.status(), url: `${PARTNER_BASE}/api/v1/partners/${candidate}/shipping-addresses` },
    { method: 'DELETE', status: deleteResponse.status(), url: `${PARTNER_BASE}/admin/partners/${candidate}` },
    { method: 'POST', status: restoreResponse.status(), url: `${PARTNER_BASE}/admin/partners/imports/ecount-xlsx` },
    { method: 'DELETE', status: cleanupAddress.status(), url: `${PARTNER_BASE}/api/v1/partners/${candidate}/shipping-addresses/<redacted-id>` },
  ], null, 2)}\n`, 'utf8')
})
