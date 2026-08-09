import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r22'))
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const prefix = 'SOL1154R22-'

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function csv(rows: number): Buffer {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}\t"`
  const lines = [
    '\uFEFF"데이터관리>거래처-Excel다운로드"',
    '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""',
  ]
  for (let index = 1; index <= rows; index += 1) {
    lines.push([`${prefix}${String(index).padStart(4, '0')}`, '20260810', 'R22', '', '', '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', '0', '', ''].map(quote).join(','))
  }
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8')
}

async function login(request: APIRequestContext, password: string) {
  const response = await request.post(`${authBase}/auth/login`, { data: { loginId: 'dev_master', password }, timeout: 30_000 })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  return { token: data.token ?? '', role: data.role ?? 'MASTER', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' }
}

async function installAuth(page: Page, auth: Record<string, string>): Promise<void> {
  await page.addInitScript((state) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => ({ token: state.token, role: state.role, userId: state.userId, fullName: state.displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined } })
  }, auth)
}

test('R22 우회 없는 적재 결과→보류 패널→페이지 넘김', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const auth = await login(request, password)
  const bytes = csv(201)
  const sourceFileHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
  const network: Array<Record<string, unknown>> = []
  await installAuth(page, auth)
  page.on('request', requestEvent => {
    if (requestEvent.url().includes('/admin/partners/imports/ecount')) network.push({ type: 'request', method: requestEvent.method(), url: requestEvent.url() })
  })
  page.on('response', response => {
    if (response.url().includes('/admin/partners/imports/ecount')) network.push({ type: 'response', status: response.status(), url: response.url() })
  })
  await page.goto(`${appBase}/#/admin/partners`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await expect(page.getByTestId('admin-partners-import-btn')).toBeVisible()
  await page.screenshot({ path: path.join(shots, '01-entry.png'), fullPage: true })
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R22-panel-201.csv', mimeType: 'text/csv', buffer: bytes })
  await expect(page.getByTestId('admin-partners-import-result')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('partner-import-rejections')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('보류·거부 행 (201건)')).toBeVisible()
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(shots, '02-first-page.png'), fullPage: true })
  const panel = page.getByTestId('partner-import-rejections')
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('3 / 3', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '다음' })).toBeDisabled()
  await page.screenshot({ path: path.join(shots, '03-last-page.png'), fullPage: true })
  saveJson('01-r22-live-panel.json', {
    sourceFileHash,
    totalRows: 201,
    totalPages: 3,
    network,
    credentials: '<redacted>',
    bypass: false,
  })
})
