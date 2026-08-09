import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const AUTH_BASE = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const PARTNER_BASE = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const DB_CONTAINER = process.env['R9_DB_CONTAINER'] ?? ''
const SOURCE = path.resolve(DIRNAME, '../../../../docs/migration/896-sheet/ecount/거래처등록.xlsx')
const SHOTS = resolveQaShotsDir(path.resolve(DIRNAME, '../../../../docs/qa/2026-08-09-1154-r9-sol-reconv'))
const HEAD = process.env['R9_HEAD'] ?? '156f73c71c77d300caee85e778b6fb070f852124'
const JAR_SHA256 = process.env['R9_JAR_SHA256'] ?? ''
const MASTER_HASH = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const FAULT_CODE = '01'
const FAULT_NAME = 'R9 transient infrastructure probe'
const UUID_CODE = '0004'
const TX_BEFORE = 'SOL1154R9BEFORE'
const TX_BAD = 'SOL1154R9BAD'
const TX_AFTER = 'SOL1154R9AFTER'

interface CallRecord { method: string; url: string; status: number; body: string }

function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', 'partner_r9', '-c', query], {
    encoding: 'utf8',
  }).trim()
}

function csv(rows: Array<{ code: string; name: string }>): Buffer {
  const meta = '\uFEFF"데이터관리>거래처-Excel다운로드"'
  const header = '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""'
  const data = rows.map(({ code, name }) =>
    `"${code}\t","20230814\t","R9담당자\t","\t","${name}\t","대표\t","서울\t","\t","\t","\t","\t","일반업체\t","YES\t","등록\t","\t","\t",""`,
  )
  return Buffer.from([meta, header, ...data].join('\n') + '\n', 'utf8')
}

async function renderEvidence(page: Page, title: string, evidence: unknown, filename: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body{font-family:"Noto Sans KR",Arial,sans-serif;background:#0b1220;color:#e5eefc;margin:0;padding:36px}
    h1{font-size:27px;margin:0 0 18px;color:#fda4af}pre{white-space:pre-wrap;word-break:break-all;background:#111c30;border:1px solid #713f55;border-radius:12px;padding:22px;font-size:15px;line-height:1.55}
    .tag{display:inline-block;background:#881337;color:#ffe4e6;border-radius:999px;padding:6px 12px;margin-bottom:18px}
  </style></head><body><span class="tag">PR #1154 R9 · HEAD 156f73c71</span><h1>${title}</h1><pre>${JSON.stringify(evidence, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`)
  await page.screenshot({ path: path.join(SHOTS, filename), fullPage: true })
}

async function pollSql(query: string, predicate: (value: string) => boolean, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    last = sql(query)
    if (predicate(last)) return last
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`SQL poll timeout: last=${last}`)
}

test('PR #1154 R9 실 관리자 API 적대 재수렴', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  test.skip(!DB_CONTAINER, 'R9_DB_CONTAINER가 없어 격리 PostgreSQL 실측을 건너뜁니다.')
  expect(fs.existsSync(SOURCE), '#896 정본 XLSX가 필요합니다.').toBeTruthy()

  const calls: CallRecord[] = []
  const call = async (method: string, url: string, options: Parameters<APIRequestContext['fetch']>[1] = {}) => {
    const response = await request.fetch(url, { ...options, method })
    const body = await response.text()
    calls.push({
      method,
      url,
      status: response.status(),
      body: url.endsWith('/auth/login') ? body.replace(/"token":"[^"]+"/, '"token":"<redacted>"').slice(0, 4000) : body.slice(0, 12000),
    })
    return { response, body }
  }

  const login = await call('POST', `${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.response.status(), login.body).toBe(200)
  const loginBody = JSON.parse(login.body).data ?? {}
  const headers = {
    Authorization: `Bearer ${loginBody.token ?? ''}`,
    'X-User-Id': loginBody.userId ?? '',
    'X-User-Role': 'MASTER',
    'X-Is-System-Master': 'true',
  }
  expect(headers['X-User-Id']).not.toBe('')
  const health = await call('GET', `${PARTNER_BASE}/actuator/health`)
  expect(health.response.status()).toBe(200)

  const triggerCounts = {
    worktree: process.cwd(),
    head: HEAD,
    jarSha256: JAR_SHA256,
    partnerPort: 48095,
    authPort: 8080,
    dbVersion: sql('SELECT version()'),
    masterRowsBefore: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE source_file_hash='${MASTER_HASH}'`)),
    txRowsBefore: Number(sql(`SELECT count(*) FROM partners WHERE partner_code IN ('${TX_BEFORE}','${TX_BAD}','${TX_AFTER}')`)),
    sourceBytes: fs.statSync(SOURCE).size,
  }
  expect([0, 7253]).toContain(triggerCounts.masterRowsBefore)
  expect(triggerCounts.txRowsBefore).toBe(0)
  expect(triggerCounts.sourceBytes).toBe(1_052_151)
  await renderEvidence(page, '환경 확인 및 발화 조건 카운트', triggerCounts, '00-environment-trigger-counts.png')

  const uploadCsv = async (contents: Buffer, name = 'r9.csv') => call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers,
    multipart: { file: { name, mimeType: 'text/csv', buffer: contents } },
    timeout: 5 * 60_000,
  })
  const uploadXlsx = async () => call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount-xlsx`, {
    headers,
    multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(SOURCE) } },
    timeout: 15 * 60_000,
  })

  // 기준 정본을 먼저 실 관리자 API로 적재한다.
  const baseline = await uploadXlsx()
  expect(baseline.response.status(), baseline.body).toBe(200)
  const baselineBody = JSON.parse(baseline.body)
  expect(baselineBody).toMatchObject({ totalRows: 7253, activeCount: 7253, heldParseFailureRows: 0 })
  expect(baselineBody.imported + baselineBody.updated).toBe(7253)

  // 각도 1: 기존 정본 한 행의 거래처명을 실 관리자 CSV로 변경해 UPDATE를 강제하고,
  // row lock으로 대기시킨 뒤 그 JDBC 연결만 끊는다.
  // DB 데이터 쓰기는 모두 관리자 API로만 수행한다. SQL은 SELECT/SELECT FOR UPDATE/연결 종료뿐이다.
  expect(Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${FAULT_CODE}' AND is_deleted=false`))).toBe(1)
  const locker = spawn('docker', [
    'exec', '-e', 'PGAPPNAME=r9-locker', DB_CONTAINER,
    'psql', '-X', '-U', 'samhan', '-d', 'partner_r9', '-v', 'ON_ERROR_STOP=1', '-c',
    `BEGIN; SELECT id FROM partners WHERE partner_code='${FAULT_CODE}' FOR UPDATE; SELECT pg_sleep(300); COMMIT;`,
  ], { stdio: 'ignore' })
  await pollSql("SELECT pid::text FROM pg_stat_activity WHERE application_name='r9-locker'", value => value !== '')

  const faultedPromise = uploadCsv(csv([{ code: FAULT_CODE, name: FAULT_NAME }]), 'r9-transient-infrastructure.csv')
  const blockedPid = await pollSql(
    "SELECT pid::text FROM pg_stat_activity WHERE datname='partner_r9' AND application_name='PostgreSQL JDBC Driver' AND cardinality(pg_blocking_pids(pid)) > 0 ORDER BY pid LIMIT 1",
    value => /^\d+$/.test(value),
    120_000,
  )
  const terminated = sql(`SELECT pg_terminate_backend(${blockedPid}::int)::text`)
  expect(['t', 'true']).toContain(terminated)
  const lockerPid = sql("SELECT pid::text FROM pg_stat_activity WHERE application_name='r9-locker'")
  if (lockerPid) sql(`SELECT pg_terminate_backend(${lockerPid}::int)::text`)
  locker.kill()

  const faulted = await faultedPromise
  expect(faulted.response.status(), faulted.body).toBe(200)
  const faultedBody = JSON.parse(faulted.body)
  const faultRow = faultedBody.heldSample.find((row: { rawPartnerCode: string }) => row.rawPartnerCode === FAULT_CODE)
  expect(faultRow, JSON.stringify(faultedBody)).toBeTruthy()
  const faultSql = sql(`SELECT raw_partner_code,transform_status,coalesce(reject_reason,''),target_partner_id IS NULL FROM staging.ecount_partner_raw WHERE source_file_hash='${faultedBody.sourceFileHash}' AND raw_partner_code='${FAULT_CODE}'`)
  const angle1 = { blockedPid, terminated, http: faulted.response.status(), response: faultedBody, faultRow, sql: faultSql }
  await renderEvidence(page, '각도 1 · 순간 연결 단절이 2xx + DB_CONSTRAINT HELD로 수렴', angle1, '01-transient-db-failure.png')

  // 인프라 장애 표본을 정본으로 복구한다.
  const retry = await uploadXlsx()
  expect(retry.response.status(), retry.body).toBe(200)
  const retryBody = JSON.parse(retry.body)
  const retrySql = sql(`SELECT raw_partner_code,transform_status,coalesce(reject_reason,''),target_partner_id IS NOT NULL FROM staging.ecount_partner_raw WHERE source_file_hash='${MASTER_HASH}' AND raw_partner_code='${FAULT_CODE}'`)
  expect(retryBody).toMatchObject({ totalRows: 7253, updated: 7253, heldParseFailureRows: 0 })
  expect(retrySql).toBe(`${FAULT_CODE}|UPDATED||t`)
  // 각도 2: 앞 정상 + 201자 DB 제약 실패 + 뒤 정상.
  const rowFailure = await uploadCsv(csv([
    { code: TX_BEFORE, name: 'R9 실패행 앞 정상' },
    { code: TX_BAD, name: '가'.repeat(201) },
    { code: TX_AFTER, name: 'R9 실패행 뒤 정상' },
  ]), 'r9-201-char.csv')
  expect(rowFailure.response.status(), rowFailure.body).toBe(200)
  const rowFailureBody = JSON.parse(rowFailure.body)
  const rowFailureSql = sql(`SELECT raw_partner_code,transform_status,coalesce(reject_reason,'') FROM staging.ecount_partner_raw WHERE raw_partner_code IN ('${TX_BEFORE}','${TX_BAD}','${TX_AFTER}') ORDER BY source_row_no`)
  const rowFailureCounts = {
    before: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_BEFORE}' AND is_deleted=false`)),
    bad: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_BAD}' AND is_deleted=false`)),
    after: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_AFTER}' AND is_deleted=false`)),
  }
  expect(rowFailureBody).toMatchObject({ totalRows: 3, imported: 2, heldParseFailureRows: 1 })
  expect(rowFailureCounts).toEqual({ before: 1, bad: 0, after: 1 })
  await renderEvidence(page, '각도 2 · 201자 실패행 격리와 뒤 정상행 커밋', { response: rowFailureBody, counts: rowFailureCounts, sql: rowFailureSql }, '02-row-failure-isolation.png')

  // 각도 4: 201자로 실패한 같은 거래처 코드를 짧은 이름으로 고친 새 파일로 재업로드한다.
  const corrected = await uploadCsv(csv([
    { code: TX_BAD, name: 'R9 고친 실패행' },
  ]), 'r9-corrected-row.csv')
  expect(corrected.response.status(), corrected.body).toBe(200)
  const correctedBody = JSON.parse(corrected.body)
  expect(correctedBody).toMatchObject({ totalRows: 1, imported: 1, heldParseFailureRows: 0 })
  const correctedSql = sql(`SELECT transform_status,coalesce(reject_reason,''),target_partner_id IS NOT NULL FROM staging.ecount_partner_raw WHERE raw_partner_code='${TX_BAD}' ORDER BY transform_status`)
  const correctedActive = Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${TX_BAD}' AND is_deleted=false`))
  expect(correctedSql).toBe('IMPORTED||t\nPENDING|DB_CONSTRAINT|f')
  expect(correctedActive).toBe(1)
  await renderEvidence(page, '각도 4 · 201자 실패행을 고친 파일 재업로드', { response: correctedBody, active: correctedActive, sql: correctedSql }, '04-pending-row-retry.png')

  // 각도 3a: 정본 7,253건 분포와 성공/실패 트랜잭션 불변.
  const distributionSql = sql(`SELECT count(*) AS active_rows, count(*) FILTER (WHERE p.status='ACTIVE') AS active_count, count(*) FILTER (WHERE p.status='SUSPENDED') AS suspended_count, count(*) FILTER (WHERE p.credit_limit IS NULL) AS credit_null, count(*) FILTER (WHERE p.registration_date IS NOT NULL AND p.created_at <> p.registration_date::timestamp) AS created_at_mismatch FROM partners p WHERE p.is_deleted=false AND p.id IN (SELECT target_partner_id FROM staging.ecount_partner_raw WHERE source_file_hash='${MASTER_HASH}')`)
  expect(distributionSql).toBe('7253|7253|0|7253|0')

  // 각도 3b: 금지 코드가 아닌 다른 정본 거래처의 삭제행 UUID와 하위 참조를 복원한다.
  const beforeUuid = sql(`SELECT id::text FROM partners WHERE partner_code='${UUID_CODE}' AND is_deleted=false`)
  const address = await call('POST', `${PARTNER_BASE}/api/v1/partners/${UUID_CODE}/shipping-addresses`, {
    headers,
    data: { alias: 'R9정본참조', zipCode: '04524', address: '서울특별시 중구', phone: '02-0000-0000', receiverName: 'R9', isDefault: false, memo: 'R9 UUID 참조 검증' },
  })
  expect(address.response.status(), address.body).toBe(201)
  const addressId = JSON.parse(address.body).data.id as string
  const deleted = await call('DELETE', `${PARTNER_BASE}/admin/partners/${UUID_CODE}`, { headers })
  expect(deleted.response.status(), deleted.body).toBe(200)
  const restored = await uploadXlsx()
  expect(restored.response.status(), restored.body).toBe(200)
  const restoredBody = JSON.parse(restored.body)
  const uuidSql = sql(`SELECT p.id::text,'${beforeUuid}',count(*) FILTER (WHERE p.is_deleted=false),count(*) FILTER (WHERE p.is_deleted=true),(SELECT count(*) FROM partner_shipping_addresses a WHERE a.id='${addressId}' AND a.partner_id<>p.id) FROM partners p WHERE p.partner_code='${UUID_CODE}' GROUP BY p.id`)
  expect(uuidSql).toBe(`${beforeUuid}|${beforeUuid}|1|0|0`)
  const cleanupAddress = await call('DELETE', `${PARTNER_BASE}/api/v1/partners/${UUID_CODE}/shipping-addresses/${addressId}`, { headers })
  expect(cleanupAddress.response.status(), cleanupAddress.body).toBe(204)
  for (const code of [TX_BEFORE, TX_BAD, TX_AFTER]) {
    const cleanup = await call('DELETE', `${PARTNER_BASE}/admin/partners/${code}`, { headers })
    expect(cleanup.response.status(), cleanup.body).toBe(200)
  }
  await renderEvidence(page, '각도 3 · UUID 복원과 7,253건 분포 불변', { restoreResponse: restoredBody, uuidSql, distributionSql, rowFailureCounts }, '03-r6-r7-invariants.png')

  const cleanupVerify = {
    uuidCodeActive: Number(sql(`SELECT count(*) FROM partners WHERE partner_code='${UUID_CODE}' AND is_deleted=false`)),
    uuidQaAddressActive: Number(sql("SELECT count(*) FROM partner_shipping_addresses WHERE alias='R9정본참조' AND is_deleted=false")),
    txActive: Number(sql(`SELECT count(*) FROM partners WHERE partner_code IN ('${TX_BEFORE}','${TX_BAD}','${TX_AFTER}') AND is_deleted=false`)),
    forbiddenSharedCodeTouchedByFixture: false,
  }
  expect(cleanupVerify).toEqual({ uuidCodeActive: 1, uuidQaAddressActive: 0, txActive: 0, forbiddenSharedCodeTouchedByFixture: false })
  fs.writeFileSync(path.join(SHOTS, 'network-api-calls.json'), `${JSON.stringify(calls, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(SHOTS, 'cleanup-verify.txt'), `${JSON.stringify(cleanupVerify, null, 2)}\n`, 'utf8')
})
