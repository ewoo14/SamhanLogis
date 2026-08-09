import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r20'))
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const partnerBase = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const dbContainer = process.env['R20_DB_CONTAINER'] ?? 'sol1154-r9-db'
const dbName = process.env['R20_DB_NAME'] ?? 'partner_r9'
const prefix = 'SOL1154R20-'

type Headers = Record<string, string>

function sql(query: string): string {
  return execFileSync('docker', ['exec', dbContainer, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', dbName, '-c', query], { encoding: 'utf8' }).trim()
}

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}\t"` }

function csv(rows: Array<{ code: string; name: string; credit: string }>): Buffer {
  const lines = [
    '\uFEFF"데이터관리>거래처-Excel다운로드"',
    '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""',
    ...rows.map(({ code, name, credit }) => [code, '20260810', 'R20담당자', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', credit, '', ''].map(quote).join(',')),
  ]
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8')
}

async function login(request: APIRequestContext, password: string): Promise<{ headers: Headers; auth: Record<string, string> }> {
  const response = await request.post(`${authBase}/auth/login`, { data: { loginId: 'dev_master', password }, timeout: 30_000 })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  const headers = { Authorization: `Bearer ${data.token ?? ''}`, 'X-User-Id': data.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  return { headers, auth: { token: data.token ?? '', role: data.role ?? 'MASTER', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' } }
}

test('R20 관리자 화면에서 1,000건 보류 페이지와 혼합 인코딩 실제 줄 번호를 확인한다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const { headers, auth } = await login(request, password)
  const rows = Array.from({ length: 1000 }, (_, index) => ({ code: `${prefix}BULK-${String(index + 1).padStart(4, '0')}`, name: '', credit: '0' }))
  const bulkBytes = csv(rows)
  let cleanup: Record<string, unknown> = {}
  try {
    await page.addInitScript((state) => {
      Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => ({ token: state.token, role: state.role, userId: state.userId, fullName: state.displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined } })
    }, auth)
    await page.route('**/admin/partners/imports/ecount', (route) => route.continue({ url: `${partnerBase}/admin/partners/imports/ecount` }))
    await page.route('**/admin/partners/imports/ecount/rejections**', (route) => route.continue({ url: `${partnerBase}${new URL(route.request().url()).pathname}${new URL(route.request().url()).search}` }))
    await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'commit', timeout: 30_000 })
    console.log('R20 page loaded', page.url())
    await expect(page.getByTestId('admin-partners-import-btn')).toBeVisible()
    console.log('R20 import button visible')
    await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R20-bulk-held.csv', mimeType: 'text/csv', buffer: bulkBytes })
    console.log('R20 bulk file selected')
    await expect(page.getByTestId('partner-import-rejections')).toBeVisible({ timeout: 20 * 60_000 })
    await expect(page.getByText('보류·거부 행 (1,000건)')).toBeVisible()
    await expect(page.getByText('3', { exact: true })).toBeVisible()
    await expect(page.getByText('CSV_ENCODING', { exact: true })).toHaveCount(0)
    await expect(page.getByText('REJECT_NAME_NULL', { exact: true })).toBeVisible()
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: '다음' }).click()
    await expect(page.getByText('1002', { exact: true })).toBeVisible()
    await page.screenshot({ path: path.join(shots, '01-admin-visibility-1000.png'), fullPage: true })
    saveJson('01-admin-visibility-1000.json', { pages: 10, totalElements: 1000, firstRowNumber: 3, lastRowNumber: 1002 })
    const hash = crypto.createHash('sha256').update(bulkBytes).digest('hex').toUpperCase()
    const rejection = await request.get(`${partnerBase}/admin/partners/imports/ecount/rejections?sourceFileHash=${hash}&page=9&size=100`, { headers })
    expect(rejection.status()).toBe(200)
    const rejectionBody = JSON.parse(await rejection.text()).data
    expect(rejectionBody.items.at(-1)).toMatchObject({ rowNumber: 1002, reason: 'REJECT_NAME_NULL' })
    saveJson('02-api-last-page.json', { sourceFileHash: hash, response: rejectionBody })
  } finally {
    const active = Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${prefix}%' AND is_deleted=false`))
    const softDeleted = Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${prefix}%' AND is_deleted=true`))
    const bulkHash = crypto.createHash('sha256').update(bulkBytes).digest('hex').toUpperCase()
    const staging = Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE source_file_hash = '${bulkHash}'`))
    cleanup = { active, softDeleted, staging }
    saveJson('03-cleanup.json', cleanup)
  }
})
