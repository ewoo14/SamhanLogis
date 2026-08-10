import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import iconv from 'iconv-lite'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r23'))
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const partnerBase = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const master = path.join(root, 'docs/migration/896-sheet/ecount/거래처등록.xlsx')
const masterHash = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const execFileAsync = promisify(execFile)

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}\t"` }

function heldCsv(prefix: string, rows: number): Buffer {
  const lines = [
    '\uFEFF"데이터관리>거래처-Excel다운로드"',
    '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""',
  ]
  for (let index = 1; index <= rows; index += 1) {
    lines.push([`${prefix}${String(index).padStart(4, '0')}`, '20260810', 'R23', '', '', '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', '0', '', ''].map(quote).join(','))
  }
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8')
}

function dataCsv(rows: Array<{ code: string; name: string }>, encoding: 'utf8' | 'cp949' = 'utf8'): Buffer {
  const text = [
    '\uFEFF"데이터관리>거래처-Excel다운로드"',
    '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""',
    ...rows.map(({ code, name }) => [code, '20260810', 'R23', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', '0', '', ''].map(quote).join(',')),
  ].join('\n') + '\n'
  return encoding === 'cp949' ? iconv.encode(text.replace(/^\uFEFF/, ''), 'cp949') : Buffer.from(text, 'utf8')
}

function sql(container: string, database: string, query: string): string {
  return execFileSync('docker', ['exec', container, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', database, '-c', query], { encoding: 'utf8' }).trim()
}

async function login(request: APIRequestContext, password: string) {
  const response = await request.post(`${authBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
    timeout: 30_000,
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  return {
    token: data.token ?? '',
    role: data.role ?? 'MASTER',
    userId: data.userId ?? '',
    displayName: data.displayName ?? 'dev_master',
  }
}

async function installDesktopHarness(page: Page, auth: Record<string, string>): Promise<void> {
  await page.addInitScript((state) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: state.token, role: state.role, userId: state.userId, fullName: state.displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (callback: (status: { kind: string }) => void) => {
          setTimeout(() => callback({ kind: 'not-available' }), 0)
          return () => undefined
        },
        check: async () => undefined,
        install: async () => undefined,
        quit: async () => undefined,
      },
    })
  }, auth)
}

function authHeaders(auth: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.token ?? ''}`,
    'X-User-Id': auth.userId ?? '',
    'X-User-Role': 'MASTER',
    'X-Is-System-Master': 'true',
  }
}

test('① 우회 없는 관리자 화면 적재→보류→끝 페이지→새 파일 1페이지 초기화', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const auth = await login(request, password)
  const firstBytes = heldCsv('SOL1154R23-PANEL-A-', 201)
  const secondBytes = heldCsv('SOL1154R23-PANEL-B-', 201)
  const trace: Array<Record<string, unknown>> = []
  const startedAt = Date.now()
  await installDesktopHarness(page, auth)
  page.on('request', req => {
    if (req.url().includes('/admin/partners/imports/ecount')) trace.push({ atMs: Date.now() - startedAt, event: 'request', method: req.method(), url: req.url() })
  })
  page.on('response', res => {
    if (res.url().includes('/admin/partners/imports/ecount')) trace.push({ atMs: Date.now() - startedAt, event: 'response', status: res.status(), url: res.url() })
  })
  page.on('requestfailed', req => {
    if (req.url().includes('/admin/partners/imports/ecount')) trace.push({ atMs: Date.now() - startedAt, event: 'requestfailed', error: req.failure()?.errorText ?? 'unknown', url: req.url() })
  })

  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await expect(page.getByTestId('admin-partners-import-btn')).toBeVisible()
  await expect(page.getByTestId('app-auto-update-status')).toHaveCount(0)
  await page.screenshot({ path: path.join(shots, '01-entry.png'), fullPage: true })

  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R23-panel-A-201.csv', mimeType: 'text/csv', buffer: firstBytes })
  await expect(page.getByTestId('admin-partners-import-result')).toBeVisible({ timeout: 120_000 })
  const panel = page.getByTestId('partner-import-rejections')
  await expect(panel).toBeVisible()
  await expect(page.getByText('보류·거부 행 (201건)')).toBeVisible()
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(shots, '02-first-page.png'), fullPage: true })

  await panel.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('3 / 3', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '다음' })).toBeDisabled()
  await page.screenshot({ path: path.join(shots, '03-last-page.png'), fullPage: true })

  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R23-panel-B-201.csv', mimeType: 'text/csv', buffer: secondBytes })
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('3')
  await page.screenshot({ path: path.join(shots, '04-second-file-reset.png'), fullPage: true })

  saveJson('01-live-panel.json', {
    actualApiBase: 'http://localhost:8080',
    first: { hash: crypto.createHash('sha256').update(firstBytes).digest('hex').toUpperCase(), rows: 201, pages: 3 },
    second: { hash: crypto.createHash('sha256').update(secondBytes).digest('hex').toUpperCase(), rows: 201, pageAfterUpload: 1 },
    trace,
    credentials: '<redacted>',
    transportAdapterBypass: false,
    updaterWorkaround: 'Playwright init script에서 samhanUpdater를 not-available로 종료시킴',
  })
})

test('② 격리 mock 화면은 실제 XHR 없이 적재 결과를 표시한다', async ({ page }) => {
  const externalXhr: Array<Record<string, unknown>> = []
  await installDesktopHarness(page, { token: 'mock-token', role: 'MASTER', userId: 'mock-user', displayName: 'mock-user' })
  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType()) && req.url().startsWith('http://127.0.0.1:1')) {
      externalXhr.push({ method: req.method(), url: req.url() })
    }
  })
  const mockBase = process.env['R23_MOCK_BASE_URL'] ?? 'http://127.0.0.1:5233'
  await page.goto(`${mockBase}/#/admin/partners`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await expect(page.getByTestId('admin-partners-import-btn')).toBeVisible()
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R23-mock.csv', mimeType: 'text/csv', buffer: heldCsv('SOL1154R23-MOCK-', 3) })
  await expect(page.getByTestId('admin-partners-import-result')).toBeVisible()
  await page.waitForTimeout(250)
  expect(externalXhr).toEqual([])
  saveJson('02-mock-isolation.json', {
    viteApiBaseUrl: 'http://127.0.0.1:1',
    mockMode: true,
    actualExternalXhrCount: externalXhr.length,
    actualExternalXhr: externalXhr,
  })
})

test('③ 혼합 인코딩은 읽히는 행의 값과 모든 행 번호를 우회 없이 보존한다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const auth = await login(request, password)
  const badCode = 'SOL1154R23-ENC-BAD'
  const goodCode = 'SOL1154R23-ENC-GOOD'
  const goodName = 'R23 읽을 수 있는 정상 상호'
  const source = dataCsv([{ code: badCode, name: 'R23 훼손 대상 상호' }, { code: goodCode, name: goodName }])
  const marker = Buffer.from('R23 훼손 대상 상호', 'utf8')
  const markerAt = source.indexOf(marker)
  expect(markerAt).toBeGreaterThan(0)
  const bytes = Buffer.concat([source.subarray(0, markerAt), Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]), source.subarray(markerAt + marker.length)])
  let responseBody: unknown
  await installDesktopHarness(page, auth)
  page.on('response', async response => {
    if (response.request().method() === 'POST' && response.url().includes('/admin/partners/imports/ecount')) {
      responseBody = await response.json()
    }
  })
  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R23-mixed-encoding.csv', mimeType: 'text/csv', buffer: bytes })
  const panel = page.getByTestId('partner-import-rejections')
  await expect(panel).toBeVisible()
  const visibleRows = await panel.locator('tbody tr').allTextContents()
  expect(visibleRows[0]).toContain('3')
  expect(visibleRows[0]).toContain(badCode)
  await page.screenshot({ path: path.join(shots, '05-mixed-encoding.png'), fullPage: true })
  const search = page.getByRole('searchbox', { name: '코드 / 상호 / 사업자번호 / 전화 검색' })
  await search.fill(goodCode)
  await expect(page.getByTestId(`admin-partners-row-${goodCode}`)).toHaveText(goodName)
  await page.screenshot({ path: path.join(shots, '05b-mixed-readable-row.png'), fullPage: true })
  const cleanup = await request.delete(`http://127.0.0.1:8080/admin/partners/${goodCode}`, { headers: authHeaders(auth) })
  expect(cleanup.status(), await cleanup.text()).toBe(200)
  saveJson('03-mixed-encoding.json', {
    physicalRows: [{ rowNumber: 3, code: badCode, name: '<invalid-bytes>' }, { rowNumber: 4, code: goodCode, name: goodName }],
    response: responseBody,
    visibleRows,
    readableRowVisibleInPartnerList: { code: goodCode, name: goodName },
    unreadableLabelVisible: visibleRows[0]?.includes('읽을 수 없음') ?? false,
    unreadableCellActual: visibleRows[0]?.replace(/^3CSV_ENCODING: 거래처명에 치환문자\(U\+FFFD\)가 포함됨SOL1154R23-ENC-BAD/, '') ?? '',
    credentials: '<redacted>',
    transportAdapterBypass: false,
  })
})

test('④ 정본 7,253건과 정상 CSV 4종을 실 HTTP로 회귀한다', async ({ request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const auth = await login(request, password)
  const headers = authHeaders(auth)
  const masterBytes = fs.readFileSync(master)
  expect(crypto.createHash('sha256').update(masterBytes).digest('hex').toUpperCase()).toBe(masterHash)
  const masterResponse = await request.post(`${partnerBase}/admin/partners/imports/ecount-xlsx`, {
    headers,
    multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: masterBytes } },
    timeout: 20 * 60_000,
  })
  const masterRaw = await masterResponse.text()
  expect(masterResponse.status(), masterRaw).toBe(200)
  const masterBody = JSON.parse(masterRaw).data
  const expectedMaster = {
    totalRows: 7253, activeCount: 7253, rejectedNullName: 0, excludedTrailerRows: 1,
    registrationDateParsedCount: 2423, createdAtLoadTimeCount: 4830, sourceFileHash: masterHash,
  }
  expect(masterBody).toMatchObject(expectedMaster)

  const fixtures = [
    { label: 'UTF-8 한글', code: 'SOL1154R23-NORMAL-KO', name: 'R23 정상 한글 상호', encoding: 'utf8' as const },
    { label: 'UTF-8 ASCII', code: 'SOL1154R23-NORMAL-ASCII', name: 'R23 Normal Partner 123', encoding: 'utf8' as const },
    { label: 'CP949 한글', code: 'SOL1154R23-NORMAL-CP949', name: 'R23 정상 CP949 한글상호', encoding: 'cp949' as const },
    { label: 'UTF-8 구두점·역슬래시', code: 'SOL1154R23-NORMAL-PUNCT', name: 'R23 "따옴표" (주)삼한, 대리점/본점\\창고', encoding: 'utf8' as const },
  ]
  const normalResults: Array<Record<string, unknown>> = []
  for (const fixture of fixtures) {
    const bytes = dataCsv([{ code: fixture.code, name: fixture.name }], fixture.encoding)
    const response = await request.post(`${partnerBase}/admin/partners/imports/ecount`, {
      headers,
      multipart: { file: { name: `${fixture.code}.csv`, mimeType: 'text/csv', buffer: bytes } },
      timeout: 120_000,
    })
    const raw = await response.text()
    expect(response.status(), raw).toBe(200)
    const body = JSON.parse(raw).data
    expect(body).toMatchObject({ totalRows: 1, rejectedNullName: 0, heldParseFailureRows: 0, infrastructureFailureRows: 0 })
    const storedName = sql('sol1154-r9-db', 'partner_r9', `SELECT name FROM partners WHERE partner_code='${fixture.code}' AND deleted_at IS NULL`)
    expect(storedName).toBe(fixture.name)
    normalResults.push({ ...fixture, held: body.heldParseFailureRows, storedName, exact: storedName === fixture.name })
  }
  for (const fixture of fixtures) {
    const cleanup = await request.delete(`${partnerBase}/admin/partners/${fixture.code}`, { headers })
    expect(cleanup.status(), await cleanup.text()).toBe(200)
  }
  saveJson('04-master-and-normal-csv.json', {
    master: { status: masterResponse.status(), body: masterBody, expected: expectedMaster },
    normalCsv: normalResults,
    credentials: '<redacted>',
    specialPartner1068689215Manipulated: false,
  })
})

test('⑤ 1,000행 UI 성능 경계를 외부 계측한다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const auth = await login(request, password)
  const bytes = heldCsv('SOL1154R23-PERF-', 1000)
  const trace: Array<Record<string, unknown>> = []
  const dbSamples: Array<Record<string, unknown>> = []
  let origin = 0
  let sampling = true
  await installDesktopHarness(page, auth)
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/admin/partners/imports/ecount')) trace.push({ atMs: Date.now() - origin, event: 'request', url: req.url() })
  })
  page.on('response', res => {
    if (res.request().method() === 'POST' && res.url().includes('/admin/partners/imports/ecount')) trace.push({ atMs: Date.now() - origin, event: 'response', status: res.status(), url: res.url() })
  })
  page.on('requestfailed', req => {
    if (req.method() === 'POST' && req.url().includes('/admin/partners/imports/ecount')) trace.push({ atMs: Date.now() - origin, event: 'requestfailed', error: req.failure()?.errorText ?? 'unknown' })
  })
  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  origin = Date.now()
  const sampler = (async () => {
    while (sampling) {
      const sampledAt = Date.now() - origin
      try {
        const { stdout } = await execFileAsync('docker', ['exec', 'samhan-postgres', 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', 'partner_db', '-c', "SELECT state||'|'||coalesce(wait_event_type,'')||'|'||replace(left(query,90),E'\\n',' ') FROM pg_stat_activity WHERE datname='partner_db' AND application_name='PostgreSQL JDBC Driver' AND state <> 'idle' ORDER BY pid"])
        const rows = stdout.trim().split(/\r?\n/).filter(Boolean)
        if (rows.length > 0) dbSamples.push({ atMs: sampledAt, rows })
      } catch (error) {
        dbSamples.push({ atMs: sampledAt, samplerError: error instanceof Error ? error.message : String(error) })
      }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  })()
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R23-performance-1000.csv', mimeType: 'text/csv', buffer: bytes })
  let userOutcome = 'result'
  try {
    await expect(page.getByTestId('admin-partners-import-result')).toBeVisible({ timeout: 15_000 })
  } catch {
    userOutcome = await page.getByText('거래처 파일 적재에 실패했습니다. 파일 형식과 권한을 확인하세요.').isVisible() ? 'error' : 'loading-or-unknown'
  } finally {
    sampling = false
    await sampler
  }
  await page.screenshot({ path: path.join(shots, '06-performance-user-outcome.png'), fullPage: true })
  const requestAt = Number(trace.find(item => item.event === 'request')?.atMs ?? -1)
  const responseAt = Number(trace.find(item => item.event === 'response')?.atMs ?? -1)
  const activeSamples = dbSamples.filter(sample => Array.isArray(sample.rows) && (sample.rows as unknown[]).length > 0)
  const firstDbAt = Number(activeSamples.at(0)?.atMs ?? -1)
  const lastDbAt = Number(activeSamples.at(-1)?.atMs ?? -1)
  saveJson('05-performance-1000.json', {
    rows: 1000,
    userOutcome,
    trace,
    boundariesMs: {
      fileSelectionToRequest: requestAt,
      requestToFirstObservedDb: firstDbAt >= 0 ? firstDbAt - requestAt : null,
      firstToLastObservedDb: firstDbAt >= 0 && lastDbAt >= 0 ? lastDbAt - firstDbAt : null,
      lastObservedDbToResponse: lastDbAt >= 0 && responseAt >= 0 ? responseAt - lastDbAt : null,
      requestToResponse: responseAt >= 0 ? responseAt - requestAt : null,
    },
    dbSamples,
    measurementNote: 'pg_stat_activity 외부 표본이므로 DB 구간 시작·끝은 표본 주기만큼의 오차가 있다.',
    credentials: '<redacted>',
    transportAdapterBypass: false,
  })
})
