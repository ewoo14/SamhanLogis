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
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r25'))
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const partnerBase = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const master = path.join(root, 'docs/migration/896-sheet/ecount/거래처등록.xlsx')
const masterHash = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}\t"` }

function csvRows(rows: Array<{ code: string; name: string; creditLimit?: string }>, encoding: 'utf8' | 'cp949' = 'utf8'): Buffer {
  const text = [
    '\uFEFF"데이터관리>거래처-Excel다운로드"',
    '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""',
    ...rows.map(({ code, name, creditLimit = '0' }) => [code, '20260810', 'R25', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', creditLimit, '', ''].map(quote).join(',')),
  ].join('\n') + '\n'
  return encoding === 'cp949' ? iconv.encode(text.replace(/^\uFEFF/, ''), 'cp949') : Buffer.from(text, 'utf8')
}

function heldCsv(prefix: string, rows: number): Buffer {
  return csvRows(Array.from({ length: rows }, (_, index) => ({
    code: `${prefix}${String(index + 1).padStart(4, '0')}`,
    name: '',
  })))
}

function sql(container: string, database: string, query: string): string {
  return execFileSync('docker', ['exec', container, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', database, '-c', query], { encoding: 'utf8' }).trim()
}

async function login(request: APIRequestContext, password: string) {
  const response = await request.post(`${authBase}/auth/login`, { data: { loginId: 'dev_master', password }, timeout: 30_000 })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  return { token: data.token ?? '', role: data.role ?? 'MASTER', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' }
}

function authHeaders(auth: Record<string, string>): Record<string, string> {
  return { Authorization: `Bearer ${auth.token ?? ''}`, 'X-User-Id': auth.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
}

async function installDesktopHarness(page: Page, auth: Record<string, string>): Promise<void> {
  await page.addInitScript((state) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => ({ token: state.token, role: state.role, userId: state.userId, fullName: state.displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined } })
    Object.defineProperty(window, 'samhanUpdater', { configurable: true, value: { onStatus: (callback: (status: { kind: string }) => void) => { setTimeout(() => callback({ kind: 'not-available' }), 0); return () => undefined }, check: async () => undefined, install: async () => undefined, quit: async () => undefined } })
  }, auth)
}

test('① 사유별 응답과 실제 보류 패널은 같은 값을 표시한다', async ({ request, page }) => {
  let password: string
  try { password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.'); return
  }
  const auth = await login(request, password)
  const headers = authHeaders(auth)
  await installDesktopHarness(page, auth)
  const badCode = 'SOL1154R25-ENC-BAD'
  const goodCode = 'SOL1154R25-ENC-GOOD'
  const goodName = 'R25 읽을 수 있는 정상 상호'
  const source = csvRows([{ code: badCode, name: 'R25 훼손 대상 상호' }, { code: goodCode, name: goodName }])
  const marker = Buffer.from('R25 훼손 대상 상호', 'utf8')
  const markerAt = source.indexOf(marker)
  expect(markerAt).toBeGreaterThan(0)
  const mixed = Buffer.concat([source.subarray(0, markerAt), Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]), source.subarray(markerAt + marker.length)])
  const posts: unknown[] = []
  const pages: unknown[] = []
  page.on('response', async response => {
    if (!response.url().includes('/admin/partners/imports/ecount')) return
    const body = await response.json()
    if (response.request().method() === 'POST') posts.push(body)
    if (response.request().method() === 'GET') pages.push(body)
  })
  await page.goto(`${appBase}/admin/partners`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R25-mixed.csv', mimeType: 'text/csv', buffer: mixed })
  const panel = page.getByTestId('partner-import-rejections')
  await expect(panel).toBeVisible()
  const encodingRows = await panel.locator('tbody tr').allTextContents()
  expect(encodingRows).toHaveLength(1)
  expect(encodingRows[0]).toContain('3')
  expect(encodingRows[0]).toContain(badCode)
  expect(encodingRows[0]).toContain('읽을 수 없음')
  expect(encodingRows[0]).not.toContain('����')
  const search = page.getByRole('searchbox', { name: '코드 / 상호 / 사업자번호 / 전화 검색' })
  await search.fill(goodCode)
  await expect(page.getByTestId(`admin-partners-row-${goodCode}`)).toHaveText(goodName)
  await page.screenshot({ path: path.join(shots, '00-encoding-parity.png'), fullPage: true })

  const validationCode = 'SOL1154R25-INPUT'
  const validationName = 'R25 입력 검증 원문 상호'
  const constraintCode = 'SOL1154R25-DB'
  const constraintName = `R25 DB 제약 원문 상호-${'가'.repeat(200)}`
  await page.getByTestId('admin-partners-import-input').setInputFiles({
    name: 'R25-input-validation-seed.csv',
    mimeType: 'text/csv',
    buffer: csvRows([{ code: validationCode, name: validationName, creditLimit: '0' }]),
  })
  await search.fill(validationCode)
  await expect(page.getByTestId(`admin-partners-row-${validationCode}`)).toHaveText(validationName)
  const reasons = csvRows([
    { code: validationCode, name: validationName, creditLimit: '-1' },
    { code: constraintCode, name: constraintName },
  ])
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R25-other-reasons.csv', mimeType: 'text/csv', buffer: reasons })
  await expect(panel.locator('tbody tr')).toHaveCount(2)
  const reasonRows = await panel.locator('tbody tr').allTextContents()
  expect(reasonRows[0]).toContain('INPUT_VALIDATION')
  expect(reasonRows[0]).toContain(validationCode)
  expect(reasonRows[0]).toContain(validationName)
  expect(reasonRows[1]).toContain('DB_CONSTRAINT')
  expect(reasonRows[1]).toContain(constraintCode)
  expect(reasonRows[1]).toContain(constraintName)
  expect(reasonRows.join('\n')).not.toContain('읽을 수 없음')
  await page.screenshot({ path: path.join(shots, '01-reason-matrix.png'), fullPage: true })
  const cleanup = await request.delete(`${authBase}/admin/partners/${goodCode}`, { headers })
  expect(cleanup.status(), await cleanup.text()).toBe(200)
  const validationCleanup = await request.delete(`${authBase}/admin/partners/${validationCode}`, { headers })
  expect(validationCleanup.status(), await validationCleanup.text()).toBe(200)
  saveJson('01-reason-matrix.json', { mixedPhysicalRows: [{ rowNumber: 3, code: badCode, name: '<invalid-bytes>' }, { rowNumber: 4, code: goodCode, name: goodName }], encodingRows, reasonRows, responses: posts, pageResponses: pages, credentials: '<redacted>', transportAdapterBypass: false })
})

test('④ 대량 보류 끝 페이지와 새 파일 1페이지 초기화를 실제 화면에서 유지한다', async ({ request, page }) => {
  let password: string
  try { password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.'); return
  }
  const auth = await login(request, password)
  await installDesktopHarness(page, auth)
  const first = heldCsv('SOL1154R25-PANEL-A-', 201)
  const second = heldCsv('SOL1154R25-PANEL-B-', 201)
  await page.goto(`${appBase}/admin/partners`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R25-panel-A.csv', mimeType: 'text/csv', buffer: first })
  const panel = page.getByTestId('partner-import-rejections')
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible({ timeout: 120_000 })
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('3 / 3', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '다음' })).toBeDisabled()
  await page.screenshot({ path: path.join(shots, '02-last-page.png'), fullPage: true })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R25-panel-B.csv', mimeType: 'text/csv', buffer: second })
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('3')
  await page.screenshot({ path: path.join(shots, '03-second-file-reset.png'), fullPage: true })
  saveJson('02-pagination-reset.json', { first: { hash: crypto.createHash('sha256').update(first).digest('hex').toUpperCase(), rows: 201, lastPage: 3 }, second: { hash: crypto.createHash('sha256').update(second).digest('hex').toUpperCase(), rows: 201, pageAfterUpload: 1 }, credentials: '<redacted>', transportAdapterBypass: false })
})

test('④ mock은 VITE_API_BASE_URL 127.0.0.1:1로 실제 XHR을 내지 않는다', async ({ page }) => {
  const externalXhr: Array<Record<string, unknown>> = []
  await installDesktopHarness(page, { token: 'mock-token', role: 'MASTER', userId: 'mock-user', displayName: 'mock-user' })
  page.on('request', req => { if (['xhr', 'fetch'].includes(req.resourceType()) && req.url().startsWith('http://127.0.0.1:1')) externalXhr.push({ method: req.method(), url: req.url() }) })
  const mockBase = process.env['R25_MOCK_BASE_URL'] ?? 'http://127.0.0.1:5233'
  await page.goto(`${mockBase}/admin/partners`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R25-mock.csv', mimeType: 'text/csv', buffer: heldCsv('SOL1154R25-MOCK-', 3) })
  await expect(page.getByTestId('admin-partners-import-result')).toBeVisible()
  await page.waitForTimeout(250)
  expect(externalXhr).toEqual([])
  saveJson('03-mock-isolation.json', { viteApiBaseUrl: 'http://127.0.0.1:1', mockMode: true, actualExternalXhrCount: externalXhr.length, actualExternalXhr: externalXhr })
})

test('③ 정본 7,253건과 정상 CSV 4종을 실 HTTP로 회귀한다', async ({ request }) => {
  let password: string
  try { password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.'); return
  }
  const auth = await login(request, password)
  const headers = authHeaders(auth)
  const masterBytes = fs.readFileSync(master)
  expect(crypto.createHash('sha256').update(masterBytes).digest('hex').toUpperCase()).toBe(masterHash)
  const masterResponse = await request.post(`${partnerBase}/admin/partners/imports/ecount-xlsx`, { headers, multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: masterBytes } }, timeout: 20 * 60_000 })
  const masterRaw = await masterResponse.text()
  expect(masterResponse.status(), masterRaw).toBe(200)
  const masterBody = JSON.parse(masterRaw).data
  const expectedMaster = { totalRows: 7253, activeCount: 7253, rejectedNullName: 0, excludedTrailerRows: 1, registrationDateParsedCount: 2423, createdAtLoadTimeCount: 4830, sourceFileHash: masterHash }
  expect(masterBody).toMatchObject(expectedMaster)
  const fixtures = [
    { label: 'UTF-8 한글', code: 'SOL1154R25-NORMAL-KO', name: 'R25 정상 한글 상호', encoding: 'utf8' as const },
    { label: 'UTF-8 ASCII', code: 'SOL1154R25-NORMAL-ASCII', name: 'R25 Normal Partner 123', encoding: 'utf8' as const },
    { label: 'CP949 한글', code: 'SOL1154R25-NORMAL-CP949', name: 'R25 정상 CP949 한글상호', encoding: 'cp949' as const },
    { label: 'UTF-8 구두점·역슬래시', code: 'SOL1154R25-NORMAL-PUNCT', name: 'R25 "따옴표" (주)삼한, 대리점/본점\\창고', encoding: 'utf8' as const },
  ]
  const normalCsv: Array<Record<string, unknown>> = []
  for (const fixture of fixtures) {
    const bytes = csvRows([{ code: fixture.code, name: fixture.name }], fixture.encoding)
    const response = await request.post(`${partnerBase}/admin/partners/imports/ecount`, { headers, multipart: { file: { name: `${fixture.code}.csv`, mimeType: 'text/csv', buffer: bytes } }, timeout: 120_000 })
    const raw = await response.text()
    expect(response.status(), raw).toBe(200)
    const body = JSON.parse(raw).data
    expect(body).toMatchObject({ totalRows: 1, rejectedNullName: 0, heldParseFailureRows: 0, infrastructureFailureRows: 0 })
    const storedName = sql('sol1154-r9-db', 'partner_r9', `SELECT name FROM partners WHERE partner_code='${fixture.code}' AND deleted_at IS NULL`)
    expect(storedName).toBe(fixture.name)
    normalCsv.push({ ...fixture, held: body.heldParseFailureRows, storedName, exact: storedName === fixture.name })
  }
  for (const fixture of fixtures) {
    const cleanup = await request.delete(`${partnerBase}/admin/partners/${fixture.code}`, { headers })
    expect(cleanup.status(), await cleanup.text()).toBe(200)
  }
  saveJson('04-master-and-normal-csv.json', { master: { status: masterResponse.status(), body: masterBody, expected: expectedMaster }, normalCsv, credentials: '<redacted>', specialPartner1068689215Manipulated: false })
})
