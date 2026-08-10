import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import iconv from 'iconv-lite'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dirname, '../../../..')
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const partnerBase = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const accountingBase = process.env['ACCOUNTING_API_BASE'] ?? 'http://127.0.0.1:28087'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const dbContainer = process.env['R19_DB_CONTAINER'] ?? 'sol1154-r9-db'
const dbName = process.env['R19_DB_NAME'] ?? 'partner_r9'
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r19'))
const rawDir = path.join(shots, 'raw')
const master = path.join(root, 'docs/migration/896-sheet/ecount/거래처등록.xlsx')
const masterHash = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const prefix = 'SOL1154R19-'

type AuthHeaders = Record<string, string>

function sql(query: string): string {
  return execFileSync('docker', ['exec', dbContainer, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', dbName, '-c', query], { encoding: 'utf8' }).trim()
}

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function evidence(page: Page, title: string, value: unknown, filename: string): Promise<void> {
  const escaped = JSON.stringify(value, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  await page.setContent(`<meta charset="utf-8"><style>body{font:16px Arial;background:#0b1220;color:#e5eefc;padding:34px}h1{color:#86efac}pre{white-space:pre-wrap;word-break:break-word;background:#111c30;padding:20px;border-radius:12px;line-height:1.45}</style><h1>${title}</h1><pre>${escaped}</pre>`)
  await page.screenshot({ path: path.join(shots, filename), fullPage: true })
}

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}\t"`
}

function csvRows(rows: Array<{ code: string; name: string; creditLimit?: string }>): string {
  const meta = '\uFEFF"데이터관리>거래처-Excel다운로드"'
  const header = '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""'
  const data = rows.map(({ code, name, creditLimit = '' }) => [code, '20230814', 'R19담당자', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', creditLimit, '', ''].map(quoteCsv).join(','))
  return [meta, header, ...data].join('\n') + '\n'
}

async function login(request: APIRequestContext, password: string): Promise<{ headers: AuthHeaders; accountingHeaders: AuthHeaders; auth: Record<string, string> }> {
  const response = await request.post(`${authBase}/auth/login`, { data: { loginId: 'dev_master', password } })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  const headers = { Authorization: `Bearer ${data.token ?? ''}`, 'X-User-Id': data.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  return {
    headers,
    accountingHeaders: { Authorization: headers.Authorization, 'X-User-Id': headers['X-User-Id'], 'X-Is-System-Master': 'true' },
    auth: { token: data.token ?? '', role: data.role ?? 'MASTER', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' },
  }
}

async function uploadCsv(request: APIRequestContext, headers: AuthHeaders, bytes: Buffer, filename: string) {
  const response = await request.post(`${partnerBase}/admin/partners/imports/ecount`, {
    headers,
    multipart: { file: { name: filename, mimeType: 'text/csv', buffer: bytes } },
    timeout: 20 * 60_000,
  })
  const raw = await response.text()
  return { status: response.status(), raw, body: response.status() === 200 ? JSON.parse(raw) : null }
}

async function deleteCodes(request: APIRequestContext, headers: AuthHeaders, codes: string[]): Promise<Array<{ code: string; status: number }>> {
  const results: Array<{ code: string; status: number }> = []
  for (const code of codes) {
    const response = await request.delete(`${partnerBase}/admin/partners/${encodeURIComponent(code)}`, { headers })
    results.push({ code, status: response.status() })
    expect([200, 404]).toContain(response.status())
  }
  return results
}

test.describe.configure({ mode: 'serial' })

test('③ 정본 XLSX 7,253건 실 HTTP 안전선', async ({ request, page }) => {
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
  const output = { request: { method: 'POST', url: `${partnerBase}/admin/partners/imports/ecount-xlsx`, fileName: '거래처등록.xlsx', sourceFileHash: masterHash }, response: { status: response.status(), raw }, expected }
  saveJson('01-master-7253-http.json', output)
  await evidence(page, 'R19 정본 XLSX 7,253건 실 HTTP', output, '01-master-7253-http.png')
})

test('① R15 5건과 ② R17 반대급부를 실 HTTP·실 관리자 화면으로 재현', async ({ request, page, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  fs.mkdirSync(rawDir, { recursive: true })
  const { headers, accountingHeaders, auth } = await login(request, password)
  const runNonce = '\n'.repeat(1 + (Date.now() % 997))
  const bulkCodes = Array.from({ length: 1000 }, (_, index) => `${prefix}BULK-${String(index + 1).padStart(4, '0')}`)
  const normalCases = [
    { code: `${prefix}NORMAL-UTF8`, name: 'R19 정상 한글 상호', encoding: 'utf8' },
    { code: `${prefix}NORMAL-ASCII`, name: 'R19 Normal Partner 123', encoding: 'utf8' },
    { code: `${prefix}NORMAL-CP949`, name: 'R19 정상 CP949 한글상호', encoding: 'cp949' },
    { code: `${prefix}NORMAL-PUNCT`, name: 'R19 "따옴표" (주)삼한, 대리점/본점\\창고', encoding: 'utf8' },
  ] as const
  const blankCode = `${prefix}BLANK-NAME`
  const allActiveCodes = [...bulkCodes, ...normalCases.map(item => item.code)]
  await deleteCodes(request, headers, allActiveCodes)

  let cleanup: unknown = null
  try {
    const normalResults: Array<Record<string, unknown>> = []
    for (const item of normalCases) {
      const filename = `거래처-Excel다운로드_R19_${item.code.slice(prefix.length)}.csv`
      const source = csvRows([{ code: item.code, name: item.name, creditLimit: '0' }]) + runNonce
      const bytes = item.encoding === 'cp949' ? iconv.encode(source, 'cp949') : Buffer.from(source, 'utf8')
      fs.writeFileSync(path.join(rawDir, filename), bytes)
      const result = await uploadCsv(request, headers, bytes, filename)
      expect(result.status, result.raw).toBe(200)
      expect(result.body).toMatchObject({ totalRows: 1, rejectedNullName: 0, skippedPlaceholder: 0, heldParseFailureRows: 0, infrastructureFailureRows: 0 })
      expect(result.body.imported + result.body.updated).toBe(1)
      const storedResponse = await request.get(`${partnerBase}/admin/partners/${encodeURIComponent(item.code)}`, { headers })
      const storedRaw = await storedResponse.text()
      expect(storedResponse.status(), storedRaw).toBe(200)
      const stored = JSON.parse(storedRaw).data ?? JSON.parse(storedRaw)
      expect(stored.name).toBe(item.name)
      normalResults.push({ ...item, upload: result, storedName: stored.name })
    }

    const bulkSeedBytes = Buffer.from(csvRows(bulkCodes.map(code => ({ code, name: `R19 대량 정상 ${code}`, creditLimit: '0' }))), 'utf8')
    const bulkHeldBytes = Buffer.from(csvRows(bulkCodes.map(code => ({ code, name: `R19 대량 정상 ${code}`, creditLimit: '-1' }))) + runNonce, 'utf8')
    const bulkSeed = await uploadCsv(request, headers, bulkSeedBytes, '거래처-Excel다운로드_R19_BULK_1000_SEED.csv')
    expect(bulkSeed.status, bulkSeed.raw).toBe(200)
    expect(bulkSeed.body).toMatchObject({ totalRows: 1000, heldParseFailureRows: 0, infrastructureFailureRows: 0 })
    expect(bulkSeed.body.imported + bulkSeed.body.updated).toBe(1000)
    const bulkFilename = '거래처-Excel다운로드_R19_BULK_1000.csv'
    fs.writeFileSync(path.join(rawDir, bulkFilename), bulkHeldBytes)
    const bulkHeld = await uploadCsv(request, headers, bulkHeldBytes, bulkFilename)
    expect(bulkHeld.status, bulkHeld.raw).toBe(200)
    expect(bulkHeld.body).toMatchObject({ totalRows: 1000, heldParseFailureRows: 1000, infrastructureFailureRows: 0 })

    const blankFilename = '거래처-Excel다운로드_R19_BLANK.csv'
    const blankBytes = Buffer.from(csvRows([{ code: blankCode, name: '' }]) + runNonce, 'utf8')
    fs.writeFileSync(path.join(rawDir, blankFilename), blankBytes)
    const blank = await uploadCsv(request, headers, blankBytes, blankFilename)
    expect(blank.status, blank.raw).toBe(200)
    expect(blank.body.rejectedSample).toContainEqual({ rowNumber: 3, reason: 'REJECT_NAME_NULL', rawPartnerCode: blankCode, rawName: '' })

    const mixedValid = Buffer.from(csvRows([{ code: `${prefix}ENCODING`, name: 'R19 인코딩 표본', creditLimit: '-1' }]), 'utf8')
    const marker = Buffer.from('R19 인코딩 표본', 'utf8')
    const markerAt = mixedValid.indexOf(marker)
    expect(markerAt).toBeGreaterThan(0)
    const invalidBytes = Buffer.concat([mixedValid.subarray(0, markerAt), Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]), mixedValid.subarray(markerAt + marker.length)])
    const invalidEncoding = await uploadCsv(request, headers, invalidBytes, '거래처-Excel다운로드_R19_INVALID_ENCODING.csv')
    expect(invalidEncoding.status, invalidEncoding.raw).toBe(200)
    expect(invalidEncoding.body).toMatchObject({ heldParseFailureRows: 1, infrastructureFailureRows: 0 })
    expect(invalidEncoding.raw).not.toContain('����')
    expect(invalidEncoding.body.heldSample).toContainEqual({ rowNumber: 0, reason: 'CSV_ENCODING', rawPartnerCode: '', rawName: '' })

    const punctuation = normalCases[3]
    const punctuationHeldFilename = '거래처-Excel다운로드_R19_PUNCTUATION_HELD.csv'
    const punctuationHeldBytes = Buffer.from(csvRows([{ code: punctuation.code, name: punctuation.name, creditLimit: '-1' }]) + runNonce, 'utf8')
    fs.writeFileSync(path.join(rawDir, punctuationHeldFilename), punctuationHeldBytes)
    const punctuationHeld = await uploadCsv(request, headers, punctuationHeldBytes, punctuationHeldFilename)
    expect(punctuationHeld.status, punctuationHeld.raw).toBe(200)
    expect(punctuationHeld.body.heldSample[0].rawName).toBe(punctuation.name)

    const reimport = await request.post(`${accountingBase}/admin/ecount/reimport/mig-1`, { headers: accountingHeaders, timeout: 20 * 60_000 })
    const reimportRaw = await reimport.text()
    expect(reimport.status(), reimportRaw).toBe(200)
    const reimportBody = JSON.parse(reimportRaw)
    saveJson('02a-accounting-reimport-raw.json', { status: reimport.status(), raw: reimportRaw })
    const bulkDetail = reimportBody.details.find((item: any) => item.fileName === bulkFilename)
    const blankDetail = reimportBody.details.find((item: any) => item.fileName === blankFilename)
    expect(bulkDetail).toMatchObject({ status: 'PROCESSED_WITH_REJECTIONS', heldParseFailureRows: 1000 })
    expect(blankDetail.rejectedSample).toContainEqual({ rowNumber: 3, reason: 'REJECT_NAME_NULL', rawPartnerCode: blankCode, rawName: '' })
    expect(reimportBody.errors).toContainEqual(expect.objectContaining({
      fileName: blankFilename,
      errorCode: 'REJECT_NAME_NULL',
      message: expect.stringContaining(`row=3 reason=REJECT_NAME_NULL partnerCode=${blankCode}`),
    }))

    const pages: any[] = []
    for (let pageNo = 0; pageNo < 10; pageNo++) {
      const response = await request.get(`${partnerBase}/admin/partners/imports/ecount/rejections?sourceFileHash=${bulkDetail.sourceFileHash}&page=${pageNo}&size=100`, { headers })
      const raw = await response.text()
      expect(response.status(), raw).toBe(200)
      pages.push(JSON.parse(raw))
    }
    const allRows = pages.flatMap(item => item.items)
    expect(pages[0].totalElements).toBe(1000)
    expect(allRows).toHaveLength(1000)
    expect(allRows[0]).toMatchObject({ rowNumber: 3, rawPartnerCode: bulkCodes[0], reason: 'INPUT_VALIDATION' })
    expect(allRows[999]).toMatchObject({ rowNumber: 1002, rawPartnerCode: bulkCodes[999], reason: 'INPUT_VALIDATION' })

    await page.addInitScript((state) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: { getToken: async () => ({ token: state.token, role: state.role, userId: state.userId, fullName: state.displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
      })
    }, auth)
    const uiNetwork: Array<{ method: string; status: number; url: string }> = []
    page.on('response', response => {
      if (response.url().includes('/admin/partners')) uiNetwork.push({ method: response.request().method(), status: response.status(), url: response.url().replace(/([?&](?:token|password)=)[^&]+/gi, '$1<redacted>') })
    })
    await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('admin-partners-table')).toBeVisible({ timeout: 30_000 })
    const visibleText = (await page.locator('body').innerText()).replaceAll(password, '<redacted>')
    const interactiveLabels = await page.locator('button, a, input, select').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, text: (node.textContent ?? '').trim(), aria: node.getAttribute('aria-label'), testid: node.getAttribute('data-testid'), type: node.getAttribute('type') })))
    const uiHasImportSurface = /업로드|가져오기|보류 행|거부 행/.test(visibleText) || interactiveLabels.some(item => /upload|import|reject|rejection|held/i.test(`${item.text} ${item.aria} ${item.testid}`))
    expect(uiHasImportSurface).toBe(false)
    const ui = { url: page.url(), title: await page.title(), uiHasImportSurface, interactiveLabels, network: uiNetwork, sourceConsumerGrep: 0, apiPagesReadByQa: pages.length, apiRowsReadByQa: allRows.length }
    await page.screenshot({ path: path.join(shots, '03-admin-partners-no-rejection-ui.png'), fullPage: true })

    const results = {
      normalCsv: normalResults,
      bulk: { direct: bulkHeld, accountingHttp: { status: reimport.status(), raw: reimportRaw }, detail: bulkDetail, pageSummary: { pages: pages.length, totalElements: pages[0].totalElements, rowsRead: allRows.length, first: allRows[0], last: allRows[999] } },
      blankName: { direct: blank, accounting: blankDetail },
      invalidEncoding,
      punctuation: { inputName: punctuation.name, normalStoredName: normalResults[3].storedName, heldObservedName: punctuationHeld.body.heldSample[0].rawName },
      adminUi: ui,
    }
    saveJson('02-r15-five-and-r17-countertrade-http.json', results)
    saveJson('03-admin-partners-no-rejection-ui.json', ui)
    await evidence(page, 'R19 R15 5건 + R17 반대급부 실측', results, '02-r15-five-and-r17-countertrade-http.png')
  } finally {
    const deleted = await deleteCodes(request, headers, allActiveCodes)
    cleanup = {
      deleteRequests: deleted.length,
      deleteHttp200: deleted.filter(item => item.status === 200).length,
      deleteHttp404: deleted.filter(item => item.status === 404).length,
      active: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${prefix}%' AND is_deleted=false`)),
      softDeleted: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${prefix}%' AND is_deleted=true`)),
      staging: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE raw_partner_code LIKE '${prefix}%'`)),
    }
    saveJson('04-cleanup.json', cleanup)
    expect((cleanup as any).active).toBe(0)
  }
})
