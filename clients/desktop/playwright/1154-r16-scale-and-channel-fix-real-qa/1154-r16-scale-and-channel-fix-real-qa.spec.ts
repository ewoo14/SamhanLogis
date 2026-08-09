import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const auth = process.env.AUTH_API_BASE ?? 'http://127.0.0.1:8080'
const partner = process.env.PARTNER_API_BASE ?? 'http://127.0.0.1:48095'
const accounting = process.env.ACCOUNTING_API_BASE ?? 'http://127.0.0.1:28087'
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-09-1154-r16'))

async function call(request: APIRequestContext, method: string, url: string, headers: Record<string, string>, options: any = {}) {
  const response = await request.fetch(url, { ...options, method, headers })
  return { status: response.status(), contentType: response.headers()['content-type'] ?? '', raw: await response.text() }
}

async function capture(page: Page, model: unknown) {
  await page.setContent(`<meta charset="utf-8"><style>body{font:16px Arial;background:#0b1220;color:#e5eefc;padding:32px}h1{color:#86efac}pre{white-space:pre-wrap;word-break:break-all;background:#111c30;padding:20px}</style><h1>R16 관리자 1000건 보류 행 페이지 조회</h1><pre>${JSON.stringify(model, null, 2)}</pre>`)
  await page.screenshot({ path: path.join(shots, '01-r16-live-1000-pages.png'), fullPage: true })
}

test('PR #1154 R16 실 HTTP와 관리자 화면에서 1000건 전량 확인', async ({ request, page, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try { password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') } catch (error) { test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.'); return }
  fs.mkdirSync(shots, { recursive: true })
  const rawDir = path.join(root, 'docs/qa/2026-08-09-1154-r15/raw')
  const r16File = path.join(rawDir, '거래처-Excel다운로드_R16_BULK_1000.csv')
  fs.writeFileSync(r16File, Buffer.concat([fs.readFileSync(path.join(rawDir, '거래처-Excel다운로드_R15_BULK_1000.csv')), Buffer.from('\n'.repeat(1 + (Date.now() % 997)), 'utf8')]))
  const r16BlankFile = path.join(rawDir, '거래처-Excel다운로드_R16_BLANK.csv')
  fs.writeFileSync(r16BlankFile, Buffer.concat([fs.readFileSync(path.join(rawDir, '거래처-Excel다운로드_R15_BLANK.csv')), Buffer.from('\n'.repeat(1 + (Date.now() % 997)), 'utf8')]))
  const login = await request.post(`${auth}/auth/login`, { data: { loginId: 'dev_master', password } })
  const loginRaw = await login.text(); expect(login.status(), loginRaw).toBe(200)
  const data = JSON.parse(loginRaw).data ?? {}
  const headers = { Authorization: `Bearer ${data.token ?? ''}`, 'X-User-Id': data.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const accountingHeaders = { Authorization: headers.Authorization, 'X-User-Id': headers['X-User-Id'], 'X-Is-System-Master': 'true' }
  const reimport = await call(request, 'POST', `${accounting}/admin/ecount/reimport/mig-1`, accountingHeaders, { timeout: 20 * 60_000 })
  expect(reimport.status, reimport.raw).toBe(200)
  const result = JSON.parse(reimport.raw); const bulk = result.details.find((item: any) => item.fileName?.includes('R16_BULK_1000'))
  fs.writeFileSync(path.join(shots, '00-r16-accounting-before-assert.json'), reimport.raw, 'utf8')
  expect(bulk.status, reimport.raw).not.toBe('FAILED'); expect(bulk.heldParseFailureRows).toBe(1000)
  expect(result.errors.filter((item: any) => item.fileName === bulk.fileName)).toHaveLength(20)
  const pages: any[] = []
  for (let pageNo = 0; pageNo < 10; pageNo++) { const response = await call(request, 'GET', `${partner}/admin/partners/imports/ecount/rejections?sourceFileHash=${bulk.sourceFileHash}&page=${pageNo}&size=100`, headers); expect(response.status, response.raw).toBe(200); pages.push(JSON.parse(response.raw)) }
  expect(pages[0].totalElements).toBe(1000); expect(pages.flatMap(item => item.items)).toHaveLength(1000)
  expect(pages[0].items[0]).toMatchObject({ rowNumber: 3, reason: 'INPUT_VALIDATION' }); expect(pages[9].items[99]).toMatchObject({ rowNumber: 1002, reason: 'INPUT_VALIDATION' })
  const blank = result.details.find((item: any) => item.fileName?.includes('R16_BLANK')); expect(blank.rejectedSample).toContainEqual({ rowNumber: 3, reason: 'REJECT_NAME_NULL', rawPartnerCode: 'SOL1154R15-BLANK-NAME', rawName: '' })
  await capture(page, { accountingHttp: reimport, pageSummary: { totalElements: pages[0].totalElements, pages: pages.length, firstRow: pages[0].items[0], lastRow: pages[9].items[99] }, blankName: blank.rejectedSample })
  fs.writeFileSync(path.join(shots, '01-r16-live-1000-pages.json'), JSON.stringify({ reimport, bulk, pages, blank }, null, 2), 'utf8')
})
