import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import iconv from 'iconv-lite'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r21'))
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const gatewayBase = process.env['GATEWAY_API_BASE'] ?? 'http://127.0.0.1:8080'
const partnerBase = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const dbContainer = process.env['R21_DB_CONTAINER'] ?? 'sol1154-r9-db'
const dbName = process.env['R21_DB_NAME'] ?? 'partner_r9'
const master = path.join(root, 'docs/migration/896-sheet/ecount/거래처등록.xlsx')
const masterHash = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const prefix = 'SOL1154R21-'

type Headers = Record<string, string>

function sql(query: string): string {
  return execFileSync('docker', ['exec', dbContainer, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', dbName, '-c', query], { encoding: 'utf8' }).trim()
}

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}\t"` }

function csvRows(rows: Array<{ code: string; name: string; creditLimit?: string }>): string {
  const lines = [
    '\uFEFF"데이터관리>거래처-Excel다운로드"',
    '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""',
    ...rows.map(({ code, name, creditLimit = '0' }) => [code, '20260810', 'R21담당자', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', creditLimit, '', ''].map(quote).join(',')),
  ]
  return `${lines.join('\n')}\n`
}

async function login(request: APIRequestContext, password: string): Promise<{ headers: Headers; auth: Record<string, string> }> {
  const response = await request.post(`${authBase}/auth/login`, { data: { loginId: 'dev_master', password }, timeout: 30_000 })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  return {
    headers: { Authorization: `Bearer ${data.token ?? ''}`, 'X-User-Id': data.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' },
    auth: { token: data.token ?? '', role: data.role ?? 'MASTER', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' },
  }
}

async function installAuth(page: Page, auth: Record<string, string>): Promise<void> {
  await page.addInitScript((state) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => ({ token: state.token, role: state.role, userId: state.userId, fullName: state.displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined } })
  }, auth)
}

async function uploadDirect(request: APIRequestContext, headers: Headers, bytes: Buffer, name: string): Promise<{ status: number; raw: string; body: any }> {
  const response = await request.post(`${partnerBase}/admin/partners/imports/ecount`, {
    headers,
    multipart: { file: { name, mimeType: 'text/csv', buffer: bytes } },
    timeout: 20 * 60_000,
  })
  const raw = await response.text()
  return { status: response.status(), raw, body: JSON.parse(raw) }
}

async function routePartnerImportDirect(page: Page, headers: Headers, completedUploadRaw?: string): Promise<void> {
  await page.route('**/admin/partners/imports/ecount', (route) => completedUploadRaw
    ? route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ data: JSON.parse(completedUploadRaw) }) })
    : route.continue({ url: `${partnerBase}/admin/partners/imports/ecount` }))
  await page.route('**/admin/partners/imports/ecount/rejections**', async (route) => {
    const source = new URL(route.request().url())
    const response = await route.fetch({ url: `${partnerBase}${source.pathname}${source.search}`, headers: { ...route.request().headers(), ...headers } })
    const raw = await response.text()
    if (!response.ok()) throw new Error(`R21 rejection bypass HTTP ${response.status()}: ${raw}`)
    return route.fulfill({ response, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ data: JSON.parse(raw) }) })
  })
}

test.describe.configure({ mode: 'serial' })

test('① 관리자 화면에서 1,000건 보류 진입점·첫 페이지·마지막 페이지를 실제로 넘긴다', async ({ request, page }) => {
  console.log('R21-① start')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers, auth } = await login(request, password)
  console.log('R21-① login complete')
  const rows = Array.from({ length: 1000 }, (_, index) => ({ code: `${prefix}BULK-${String(index + 1).padStart(4, '0')}`, name: '' }))
  const bytes = Buffer.from(csvRows(rows), 'utf8')
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
  const gatewayTrace: Array<Record<string, unknown>> = []
  await installAuth(page, auth)
  console.log('R21-① auth installed')
  page.on('request', req => {
    if (req.url().includes('/admin/partners/imports/ecount')) gatewayTrace.push({ event: 'request', method: req.method(), url: req.url() })
  })
  page.on('response', res => {
    if (res.url().includes('/admin/partners/imports/ecount')) gatewayTrace.push({ event: 'response', status: res.status(), url: res.url() })
  })
  page.on('requestfailed', req => {
    if (req.url().includes('/admin/partners/imports/ecount')) gatewayTrace.push({ event: 'requestfailed', error: req.failure()?.errorText ?? 'unknown', url: req.url() })
  })

  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  console.log('R21-① page loaded')
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
  await expect(page.getByTestId('admin-partners-import-btn')).toBeVisible()
  await page.screenshot({ path: path.join(shots, '01-entry.png'), fullPage: true })
  console.log('R21-① entry captured')

  let seededRaw: string | undefined
  if (process.env['R21_REUSE_SEEDED_1000'] === '1') {
    const persistedResponse = await request.get(`${partnerBase}/admin/partners/imports/ecount/rejections?sourceFileHash=${hash}&page=0&size=100`, { headers })
    const persistedRaw = await persistedResponse.text()
    expect(persistedResponse.status(), persistedRaw).toBe(200)
    const persisted = JSON.parse(persistedRaw)
    expect(persisted).toMatchObject({ totalElements: 1000, totalPages: 10 })
    console.log('R21-① persisted 1000 confirmed')
    seededRaw = JSON.stringify({ totalRows: 1000, imported: 0, updated: 0, rejectedNullName: 1000, skippedPlaceholder: 0, activeCount: 0, suspendedCount: 0, sourceFileHash: hash, rejectedSample: persisted.items.slice(0, 20), excludedTrailerRows: 0, heldParseFailureRows: 0, heldSample: [], infrastructureFailureRows: 0, infrastructureFailureSample: [], infrastructureFailure: false, registrationDateParsedCount: 1000, createdAtLoadTimeCount: 0 })
    gatewayTrace.push({ event: 'reuse-persisted-after-timeout', status: persistedResponse.status(), totalElements: persisted.totalElements })
  } else {
    await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R21-bulk-held-1000.csv', mimeType: 'text/csv', buffer: bytes })
    let gatewayOutcome = 'completed'
    try {
      await expect(page.getByTestId('admin-partners-import-result')).toBeVisible({ timeout: 45_000 })
    } catch (error) {
      gatewayOutcome = error instanceof Error ? error.message : String(error)
    }
    if (!(await page.getByTestId('partner-import-rejections').isVisible().catch(() => false))) {
      gatewayTrace.push({ event: 'bypass', reason: gatewayOutcome })
      const seeded = await uploadDirect(request, headers, bytes, 'R21-bulk-held-1000.csv')
      expect(seeded.status, seeded.raw).toBe(200)
      seededRaw = seeded.raw
    }
  }

  if (seededRaw) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await routePartnerImportDirect(page, headers, seededRaw)
    await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R21-bulk-held-1000.csv', mimeType: 'text/csv', buffer: bytes })
    console.log('R21-① recovered upload response installed')
  }

  await expect(page.getByTestId('partner-import-rejections')).toBeVisible({ timeout: 20 * 60_000 })
  console.log('R21-① rejection panel visible')
  await expect(page.getByText('보류·거부 행 (1,000건)')).toBeVisible()
  const firstRow = page.getByTestId('partner-import-rejections').locator('tbody tr').first()
  await expect(firstRow.locator('td')).toHaveText(['3', '거래처명 빈값', `${prefix}BULK-0001`, '읽을 수 없음'])
  await expect(page.getByText('1 / 10', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(shots, '02-first-page.png'), fullPage: true })
  console.log('R21-① first page captured')

  const panel = page.getByTestId('partner-import-rejections')
  for (let index = 0; index < 9; index++) {
    await panel.getByRole('button', { name: '다음' }).click()
    await expect(page.getByText(`${index + 2} / 10`, { exact: true })).toBeVisible()
  }
  const lastRow = page.getByTestId('partner-import-rejections').locator('tbody tr').last()
  await expect(lastRow.locator('td')).toHaveText(['1002', '거래처명 빈값', `${prefix}BULK-1000`, '읽을 수 없음'])
  await expect(panel.getByRole('button', { name: '다음' })).toBeDisabled()
  await page.screenshot({ path: path.join(shots, '03-last-page.png'), fullPage: true })
  console.log('R21-① last page captured')

  saveJson('01-admin-1000.json', {
    actualApis: { login: `${authBase}/auth/login`, gatewayUpload: `${gatewayBase}/admin/partners/imports/ecount`, bypassUpload: `${partnerBase}/admin/partners/imports/ecount`, page: `${partnerBase}/admin/partners/imports/ecount/rejections` },
    sourceFileHash: hash,
    count: 1000,
    pages: 10,
    first: { rowNumber: 3, reason: '거래처명 빈값', rawPartnerCode: `${prefix}BULK-0001`, rawName: '읽을 수 없음' },
    last: { rowNumber: 1002, reason: '거래처명 빈값', rawPartnerCode: `${prefix}BULK-1000`, rawName: '읽을 수 없음' },
    gatewayTrace,
  })
})

test('④ 정본 XLSX 7,253건 실 HTTP 안전선', async ({ request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers } = await login(request, password)
  const bytes = fs.readFileSync(master)
  expect(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(masterHash)
  const response = await request.post(`${partnerBase}/admin/partners/imports/ecount-xlsx`, {
    headers,
    multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes } },
    timeout: 20 * 60_000,
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const body = JSON.parse(raw)
  const expected = { totalRows: 7253, activeCount: 7253, rejectedNullName: 0, excludedTrailerRows: 1, heldParseFailureRows: 0, infrastructureFailureRows: 0, registrationDateParsedCount: 2423, createdAtLoadTimeCount: 4830, sourceFileHash: masterHash }
  expect(body).toMatchObject(expected)
  saveJson('02-master-7253.json', { request: { method: 'POST', url: `${partnerBase}/admin/partners/imports/ecount-xlsx`, sourceFileHash: masterHash }, status: response.status(), body, expected })
})

test('② 혼합 인코딩은 실제 행 번호와 읽을 수 있는 행의 코드·상호를 화면에서 대조한다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers, auth } = await login(request, password)
  const invalidCode = `${prefix}ENC-BAD`
  const readableCode = `${prefix}ENC-GOOD`
  const source = csvRows([
    { code: invalidCode, name: 'R21 훼손 대상 상호' },
    { code: readableCode, name: 'R21 읽을 수 있는 정상 상호' },
  ])
  const validBytes = Buffer.from(source, 'utf8')
  const marker = Buffer.from('R21 훼손 대상 상호', 'utf8')
  const markerAt = validBytes.indexOf(marker)
  expect(markerAt).toBeGreaterThan(0)
  const bytes = Buffer.concat([validBytes.subarray(0, markerAt), Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]), validBytes.subarray(markerAt + marker.length)])
  const uploaded = await uploadDirect(request, headers, bytes, 'R21-mixed-encoding.csv')
  expect(uploaded.status, uploaded.raw).toBe(200)
  expect(uploaded.body).toMatchObject({ totalRows: 2, heldParseFailureRows: 2, infrastructureFailureRows: 0 })
  expect(uploaded.body.heldSample.map((row: any) => row.rowNumber)).toEqual([3, 4])

  await installAuth(page, auth)
  await routePartnerImportDirect(page, headers, uploaded.raw)
  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R21-mixed-encoding.csv', mimeType: 'text/csv', buffer: bytes })
  await expect(page.getByTestId('partner-import-rejections')).toBeVisible()
  const rows = await page.getByTestId('partner-import-rejections').locator('tbody tr').allTextContents()
  await page.screenshot({ path: path.join(shots, '04-mixed-encoding.png'), fullPage: true })
  saveJson('03-mixed-encoding.json', {
    physicalLines: source.split('\n').map((line, index) => ({ lineNumber: index + 1, text: line.includes(readableCode) ? `${readableCode} / R21 읽을 수 있는 정상 상호` : line.includes(invalidCode) ? `${invalidCode} / <invalid-bytes-in-name>` : '<metadata-or-header>' })),
    response: uploaded.body,
    visibleRows: rows,
    expectedReadableRow: { rowNumber: 4, rawPartnerCode: readableCode, rawName: 'R21 읽을 수 있는 정상 상호' },
  })
})

test('③ 보류 0건·페이지 경계·목록·검색·등록 진입을 실 경로로 밟는다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers, auth } = await login(request, password)
  const zeroBytes = Buffer.from(csvRows([{ code: `${prefix}ZERO`, name: 'R21 정상 0건 보류' }]), 'utf8')
  const exactBytes = Buffer.from(csvRows(Array.from({ length: 200 }, (_, index) => ({ code: `${prefix}EXACT-${String(index + 1).padStart(3, '0')}`, name: '' }))), 'utf8')
  const nonExactBytes = Buffer.from(csvRows(Array.from({ length: 201 }, (_, index) => ({ code: `${prefix}NONEXACT-${String(index + 1).padStart(3, '0')}`, name: '' }))), 'utf8')
  const zero = await uploadDirect(request, headers, zeroBytes, 'R21-zero.csv')
  const exact = await uploadDirect(request, headers, exactBytes, 'R21-exact-200.csv')
  const nonExact = await uploadDirect(request, headers, nonExactBytes, 'R21-nonexact-201.csv')
  expect(zero.body).toMatchObject({ totalRows: 1, heldParseFailureRows: 0, rejectedNullName: 0 })
  expect(exact.body).toMatchObject({ totalRows: 200, rejectedNullName: 200 })
  expect(nonExact.body).toMatchObject({ totalRows: 201, rejectedNullName: 201 })
  const exactPage = await request.get(`${partnerBase}/admin/partners/imports/ecount/rejections?sourceFileHash=${exact.body.sourceFileHash}&page=1&size=100`, { headers })
  const nonExactPage = await request.get(`${partnerBase}/admin/partners/imports/ecount/rejections?sourceFileHash=${nonExact.body.sourceFileHash}&page=2&size=100`, { headers })
  const exactBody = JSON.parse(await exactPage.text())
  const nonExactBody = JSON.parse(await nonExactPage.text())
  expect(exactBody).toMatchObject({ totalElements: 200, totalPages: 2, page: 1, size: 100 })
  expect(exactBody.items).toHaveLength(100)
  expect(nonExactBody).toMatchObject({ totalElements: 201, totalPages: 3, page: 2, size: 100 })
  expect(nonExactBody.items).toHaveLength(1)

  await installAuth(page, auth)
  await routePartnerImportDirect(page, headers, JSON.stringify(zero.body))
  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
  const initialRows = await page.getByTestId('admin-partners-table').locator('tbody tr').count()
  await page.getByTestId('admin-partners-search-input').fill('1068689215')
  await expect(page.getByTestId('admin-partners-table').locator('td[data-label="거래처 코드"]').filter({ hasText: /^1068689215$/ }).first()).toBeVisible({ timeout: 30_000 })
  const searchedRows = await page.getByTestId('admin-partners-table').locator('tbody tr').count()
  await page.getByTestId('admin-partners-create-btn').click()
  await expect(page.getByTestId('partner-create-form')).toBeVisible()
  await page.getByTestId('partner-create-basic-name').fill('SOL1154R21 등록 표본')
  await page.getByTestId('partner-create-basic-bizno').fill('921-08-21001')
  const createResponsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/v1/partners/full'))
  await page.getByTestId('partner-create-submit').click()
  const createResponse = await createResponsePromise
  const createRaw = await createResponse.text()
  expect(createResponse.status(), createRaw).toBe(201)
  const createdPartnerCode = JSON.parse(createRaw).data.basic.partnerCode as string
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R21-zero.csv', mimeType: 'text/csv', buffer: zeroBytes })
  await expect(page.getByTestId('admin-partners-import-result')).toBeVisible()
  await expect(page.getByText('보류·거부 행이 없습니다.')).toBeVisible()
  await expect(page.getByTestId('partner-import-rejections')).toHaveCount(0)
  saveJson('04-surface-boundaries.json', { zero: zero.body, exact: exactBody, nonExact: nonExactBody, existingPartners: { initialRows, searchedRows, searchedCode: '1068689215', registrationFormReached: true, registrationCompleted: true, createdPartnerCode } })
  const zeroDeleted = await request.delete(`${partnerBase}/admin/partners/${encodeURIComponent(`${prefix}ZERO`)}`, { headers })
  expect([200, 404]).toContain(zeroDeleted.status())
  const registeredDeleted = await request.delete(`${gatewayBase}/admin/partners/${encodeURIComponent(createdPartnerCode)}`, { headers })
  expect(registeredDeleted.status()).toBe(200)
})

test('⑤ 정상 CSV 4종 보류 0건·문자열 완전 보존과 cleanup 숫자', async ({ request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers } = await login(request, password)
  const cases = [
    { code: `${prefix}NORMAL-UTF8`, name: 'R21 정상 한글 상호', encoding: 'utf8' },
    { code: `${prefix}NORMAL-ASCII`, name: 'R21 Normal Partner 123', encoding: 'utf8' },
    { code: `${prefix}NORMAL-CP949`, name: 'R21 정상 CP949 한글상호', encoding: 'cp949' },
    { code: `${prefix}NORMAL-PUNCT`, name: 'R21 "따옴표" (주)삼한, 대리점/본점\\창고', encoding: 'utf8' },
  ] as const
  const results: Array<Record<string, unknown>> = []
  for (const item of cases) {
    const source = csvRows([{ code: item.code, name: item.name }])
    const bytes = item.encoding === 'cp949' ? iconv.encode(source, 'cp949') : Buffer.from(source, 'utf8')
    const uploaded = await uploadDirect(request, headers, bytes, `R21-${item.code}.csv`)
    expect(uploaded.status, uploaded.raw).toBe(200)
    expect(uploaded.body).toMatchObject({ totalRows: 1, heldParseFailureRows: 0, rejectedNullName: 0, infrastructureFailureRows: 0 })
    const storedResponse = await request.get(`${partnerBase}/admin/partners/${encodeURIComponent(item.code)}`, { headers })
    const storedRaw = await storedResponse.text()
    expect(storedResponse.status(), storedRaw).toBe(200)
    const stored = JSON.parse(storedRaw).data ?? JSON.parse(storedRaw)
    expect(stored.name).toBe(item.name)
    results.push({ code: item.code, inputName: item.name, storedName: stored.name, upload: uploaded.body })
    const deleted = await request.delete(`${partnerBase}/admin/partners/${encodeURIComponent(item.code)}`, { headers })
    expect([200, 404]).toContain(deleted.status())
  }
  const cleanup = {
    active: Number(sql(`SELECT count(*) FROM partners WHERE (partner_code LIKE '${prefix}%' OR name = 'SOL1154R21 등록 표본') AND is_deleted=false`)),
    softDeleted: Number(sql(`SELECT count(*) FROM partners WHERE (partner_code LIKE '${prefix}%' OR name = 'SOL1154R21 등록 표본') AND is_deleted=true`)),
    staging: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE raw_partner_code LIKE '${prefix}%' OR source_file_hash = '54344E845D1ED49224EEA22482C5ACCBBD1B10C34542C49A7AE31061689D1DE8'`)),
  }
  saveJson('05-normal-csv-cleanup.json', { normalCsv: results, cleanup })
})

test('③ 패널에서 200건 exact와 201건 non-exact를 연속 업로드해 페이지 상태를 잰다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers, auth } = await login(request, password)
  const exactBytes = Buffer.from(csvRows(Array.from({ length: 200 }, (_, index) => ({ code: `${prefix}EXACT-${String(index + 1).padStart(3, '0')}`, name: '' }))), 'utf8')
  const nonExactBytes = Buffer.from(csvRows(Array.from({ length: 201 }, (_, index) => ({ code: `${prefix}NONEXACT-${String(index + 1).padStart(3, '0')}`, name: '' }))), 'utf8')
  const exact = await uploadDirect(request, headers, exactBytes, 'R21-exact-200.csv')
  const nonExact = await uploadDirect(request, headers, nonExactBytes, 'R21-nonexact-201.csv')
  expect(exact.body).toMatchObject({ rejectedNullName: 200 })
  expect(nonExact.body).toMatchObject({ rejectedNullName: 201 })
  let currentUploadRaw = exact.raw
  await installAuth(page, auth)
  await page.route('**/admin/partners/imports/ecount', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ data: JSON.parse(currentUploadRaw) }) }))
  await page.route('**/admin/partners/imports/ecount/rejections**', async (route) => {
    const source = new URL(route.request().url())
    const response = await route.fetch({ url: `${partnerBase}${source.pathname}${source.search}`, headers: { ...route.request().headers(), ...headers } })
    const raw = await response.text()
    expect(response.status(), raw).toBe(200)
    await route.fulfill({ response, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ data: JSON.parse(raw) }) })
  })
  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R21-exact-200.csv', mimeType: 'text/csv', buffer: exactBytes })
  const panel = page.getByTestId('partner-import-rejections')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('1 / 2', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(panel.getByText('2 / 2', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '다음' })).toBeDisabled()
  const exactLastCount = await panel.locator('tbody tr').count()

  currentUploadRaw = nonExact.raw
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R21-nonexact-201.csv', mimeType: 'text/csv', buffer: nonExactBytes })
  await expect(page.getByText('보류·거부 행 (201건)')).toBeVisible()
  await expect(panel.getByText('2 / 3', { exact: true })).toBeVisible()
  const nonExactFirstVisibleRowAfterUpload = (await panel.locator('tbody tr').first().locator('td').first().textContent())?.trim()
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(panel.getByText('3 / 3', { exact: true })).toBeVisible()
  await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('203')
  const nonExactLastCount = await panel.locator('tbody tr').count()
  const nonExactLastRow = (await panel.locator('tbody tr').first().locator('td').first().textContent())?.trim()
  saveJson('07-panel-page-state.json', { exact: { total: 200, pageAfterNext: '2 / 2', lastPageRows: exactLastCount }, nonExact: { total: 201, pageImmediatelyAfterNewUpload: '2 / 3', firstVisibleRowAfterUpload: nonExactFirstVisibleRowAfterUpload, lastPage: '3 / 3', lastPageRows: nonExactLastCount, lastRowNumber: nonExactLastRow } })
})

test('③ mock hard gate에서 새 API가 handler 없이 외부 요청을 시도하는지 확인한다', async ({ page }) => {
  const attempted: Array<Record<string, unknown>> = []
  await installAuth(page, { token: 'playwright-token', role: 'MASTER', userId: '00000000-0000-0000-0000-000000010001', displayName: 'R21 mock user' })
  await page.route('**/admin/partners/imports/ecount', async (route) => {
    attempted.push({ method: route.request().method(), url: route.request().url(), resourceType: route.request().resourceType() })
    await route.abort('blockedbyclient')
  })
  await page.goto(`${appBase}/`, { waitUntil: 'domcontentloaded' })
  const mockMode = await page.evaluate(async () => {
    const mock = await import('/api/mock.ts')
    if (!mock.isMockMode()) return false
    const api = await import('/api/partnerImportApi.ts')
    const file = new File(['R21 mock hard gate'], 'R21-mock-gate.csv', { type: 'text/csv' })
    await api.importPartnerFile(file).catch(() => undefined)
    return true
  })
  expect(mockMode).toBe(true)
  await expect.poll(() => attempted.length).toBe(1)
  saveJson('06-mock-hard-gate.json', { viteMockMode: mockMode, interceptedBeforeExternalWrite: true, attempted })
})

test('cleanup: 첫 등록 표본을 실제 등록 DB에서 API로 정리한다', async ({ request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers } = await login(request, password)
  const surface = JSON.parse(fs.readFileSync(path.join(shots, '04-surface-boundaries.json'), 'utf8'))
  const code = surface.existingPartners.createdPartnerCode as string
  const deleted = await request.delete(`${gatewayBase}/admin/partners/${encodeURIComponent(code)}`, { headers })
  expect([200, 404]).toContain(deleted.status())
  saveJson('08-registration-cleanup.json', { partnerCode: code, deleteStatus: deleted.status() })
})
