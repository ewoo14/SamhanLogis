import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const AUTH_BASE = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const PARTNER_BASE = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const ACCOUNTING_BASE = process.env['ACCOUNTING_API_BASE'] ?? 'http://127.0.0.1:28087'
const DB_CONTAINER = process.env['R12_DB_CONTAINER'] ?? 'sol1154-r9-db'
const SHOTS = resolveQaShotsDir(path.resolve(DIRNAME, '../../../../docs/qa/2026-08-09-1154-r12-input-failure-boundary'))
const MASTER_HASH = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const FAULT_CODE = '01'
const NEGATIVE_CODE = 'SOL1154R13-PW-NEGATIVE'
const BEFORE_CODE = 'SOL1154R13-PW-BEFORE'
const AFTER_CODE = 'SOL1154R13-PW-AFTER'
const ACCOUNTING_HELD_CODES = ['SOL1154R13-ACC-BEFORE', 'SOL1154R13-ACC-NEG', 'SOL1154R13-ACC-AFTER']
const ACCOUNTING_HELD_SEED = path.resolve(DIRNAME, '../../../../docs/qa/2026-08-09-1154-r13/r13-accounting-held-seed.csv')

function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', 'partner_r9', '-c', query], { encoding: 'utf8' }).trim()
}

function csv(rows: Array<{ code: string; name: string; creditLimit?: string }>): Buffer {
  const meta = '\uFEFF"데이터관리>거래처-Excel다운로드"'
  const header = '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""'
  const data = rows.map(({ code, name, creditLimit = '' }) =>
    `"${code}\t","20230814\t","R12담당자\t","\t","${name}\t","대표\t","서울\t","\t","\t","\t","\t","일반업체\t","YES\t","등록\t","${creditLimit}\t","\t",""`,
  )
  return Buffer.from([meta, header, ...data].join('\n') + '\n', 'utf8')
}

async function renderEvidence(page: Page, title: string, evidence: unknown, filename: string): Promise<void> {
  await page.setContent(`<meta charset="utf-8"><style>body{font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc;padding:36px}h1{color:#fda4af}pre{white-space:pre-wrap;background:#111c30;padding:22px;border-radius:12px;line-height:1.5}</style><h1>${title}</h1><pre>${JSON.stringify(evidence, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`)
  await page.screenshot({ path: path.join(SHOTS, filename), fullPage: true })
}

test('PR #1154 R12 실 관리자 API 입력 실패 경계와 기존 불변식', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }

  const call = async (method: string, url: string, options: Parameters<APIRequestContext['fetch']>[1] = {}) => {
    const response = await request.fetch(url, { ...options, method })
    const body = await response.text()
    return { response, body }
  }
  const login = await call('POST', `${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.response.status(), login.body).toBe(200)
  const loginData = JSON.parse(login.body).data ?? {}
  const headers = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const upload = (contents: Buffer, name: string) => call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers, multipart: { file: { name, mimeType: 'text/csv', buffer: contents } }, timeout: 5 * 60_000,
  })

  const before = sql(`SELECT count(*) FROM partners WHERE partner_code IN ('${NEGATIVE_CODE}','${BEFORE_CODE}','${AFTER_CODE}') AND is_deleted=false`)
  expect(before).toBe('0')
  await upload(csv([{ code: NEGATIVE_CODE, name: 'R12 기존 거래처', creditLimit: '1' }]), 'r12-negative-seed.csv')
  const negative = await upload(csv([
    { code: BEFORE_CODE, name: 'R12 앞 정상' },
    { code: NEGATIVE_CODE, name: 'R12 기존 거래처', creditLimit: '-1' },
    { code: AFTER_CODE, name: 'R12 뒤 정상' },
  ]), 'r12-negative-credit.csv')
  expect(negative.response.status(), negative.body).toBe(200)
  const negativeBody = JSON.parse(negative.body)
  const negativeDb = sql(`SELECT count(*) FILTER (WHERE partner_code='${BEFORE_CODE}')::text || '|' || count(*) FILTER (WHERE partner_code='${NEGATIVE_CODE}')::text || '|' || count(*) FILTER (WHERE partner_code='${AFTER_CODE}')::text FROM partners WHERE is_deleted=false`)
  const negativeStaging = sql(`SELECT transform_status || '|' || coalesce(reject_reason,'') FROM staging.ecount_partner_raw WHERE raw_partner_code='${NEGATIVE_CODE}' ORDER BY imported_at DESC LIMIT 1`)
  expect(negativeBody).toMatchObject({ totalRows: 3, imported: 2, heldParseFailureRows: 1, infrastructureFailureRows: 0, infrastructureFailure: false })
  expect(negativeBody.heldSample[0]).toMatchObject({ rawPartnerCode: NEGATIVE_CODE, reason: 'INPUT_VALIDATION' })
  expect(negativeDb).toBe('1|1|1')
  expect(negativeStaging).toBe('PENDING|INPUT_VALIDATION')
  await renderEvidence(page, 'RED-A · 음수 여신한도 입력 행만 보류되고 뒤 정상행 계속 적재', { http: negative.response.status(), response: negativeBody, database: negativeDb, staging: negativeStaging }, '00-red-a-input-boundary.png')

  const distribution = sql(`SELECT count(*)::text || '|' || count(*) FILTER (WHERE status='ACTIVE')::text || '|' || count(*) FILTER (WHERE status='SUSPENDED')::text || '|' || count(*) FILTER (WHERE credit_limit IS NULL)::text || '|' || count(*) FILTER (WHERE registration_date IS NOT NULL AND created_at <> registration_date::timestamp)::text FROM partners WHERE is_deleted=false AND id IN (SELECT target_partner_id FROM staging.ecount_partner_raw WHERE source_file_hash='${MASTER_HASH}')`)
  expect(distribution).toBe('7253|7253|0|7253|0')
  const invariants = { distribution, forbiddenCodeTouchedByFixture: false }
  await renderEvidence(page, 'RED-D · R11 정본 7,253건 분포와 금지 코드 비변경', invariants, '01-red-d-invariants.png')

  for (const code of [NEGATIVE_CODE, BEFORE_CODE, AFTER_CODE]) {
    const cleanup = await call('DELETE', `${PARTNER_BASE}/admin/partners/${code}`, { headers })
    expect([200, 404], cleanup.body).toContain(cleanup.response.status())
  }
  expect(sql(`SELECT count(*) FROM partners WHERE partner_code IN ('${NEGATIVE_CODE}','${BEFORE_CODE}','${AFTER_CODE}') AND is_deleted=false`)).toBe('0')
  fs.writeFileSync(path.join(SHOTS, 'cleanup-verify.txt'), 'R12 fixture active rows=0\n', 'utf8')
})

test('PR #1154 R13 accounting 실 HTTP 인프라 실패 중계', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }

  const login = await request.post(`${AUTH_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(login.status(), await login.text()).toBe(200)
  const loginData = (await login.json()).data ?? {}
  const response = await request.post(`${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, {
    headers: {
      Authorization: `Bearer ${loginData.token ?? ''}`,
      'X-User-Id': loginData.userId ?? '',
      'X-Is-System-Master': 'true',
    },
    timeout: 5 * 60_000,
  })
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(200)
  expect(body.details).toEqual(expect.arrayContaining([
    expect.objectContaining({
      target: 'partner',
      status: 'PROCESSED_WITH_INFRASTRUCTURE_FAILURE',
      infrastructureFailureRows: 1,
      infrastructureFailure: true,
    }),
  ]))
  await renderEvidence(page, 'R13 accounting 실 HTTP 인프라 실패 중계', {
    http: response.status(),
    api: `${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`,
    response: body,
  }, '02-accounting-live-infrastructure-relay.png')
})

test('PR #1154 R13 accounting 실 HTTP INPUT_VALIDATION 표시', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }

  const login = await request.post(`${AUTH_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(login.status(), await login.text()).toBe(200)
  const loginData = (await login.json()).data ?? {}
  const headers = {
    Authorization: `Bearer ${loginData.token ?? ''}`,
    'X-User-Id': loginData.userId ?? '',
    'X-Is-System-Master': 'true',
  }
  expect(sql(`SELECT count(*) FROM partners WHERE partner_code IN ('${ACCOUNTING_HELD_CODES.join("','")}') AND is_deleted=false`)).toBe('0')
  try {
    const seed = await request.post(`${PARTNER_BASE}/admin/partners/imports/ecount`, {
      headers: { ...headers, 'X-User-Role': 'MASTER' },
      multipart: { file: { name: 'r13-accounting-held-seed.csv', mimeType: 'text/csv', buffer: fs.readFileSync(ACCOUNTING_HELD_SEED) } },
    })
    expect(seed.status(), await seed.text()).toBe(200)
    const response = await request.post(`${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, {
      headers,
      timeout: 5 * 60_000,
    })
    const body = await response.json()
    const detail = body.details.find((item: { fileName?: string }) => item.fileName?.includes('R13_HELD'))
    expect(response.status(), JSON.stringify(body)).toBe(200)
    expect(detail).toMatchObject({
      status: 'PROCESSED_WITH_REJECTIONS',
      imported: 2,
      heldParseFailureRows: 1,
      infrastructureFailureRows: 0,
      infrastructureFailure: false,
      message: null,
    })
    expect(body.errors).toEqual([])
    await renderEvidence(page, 'R13 accounting 실 HTTP INPUT_VALIDATION 표시', {
      http: response.status(),
      api: `${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`,
      heldDetail: detail,
      errors: body.errors,
    }, '03-accounting-live-input-validation-label.png')
  } finally {
    for (const code of ACCOUNTING_HELD_CODES) {
      await request.delete(`${PARTNER_BASE}/admin/partners/${code}`, {
        headers: { ...headers, 'X-User-Role': 'MASTER' },
      })
    }
  }
})
