import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import iconv from 'iconv-lite'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const shots = resolveQaShotsDir(path.join(root, 'docs/qa/2026-08-10-1154-r24'))
const authBase = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const appBase = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'

function saveJson(filename: string, value: unknown): void {
  fs.mkdirSync(shots, { recursive: true })
  fs.writeFileSync(path.join(shots, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function csv(): Buffer {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}\t"`
  const rows = [
    ['SOL1154R24-ENC-BAD', '20260810', 'R24', '', 'R24 훼손 대상 상호', '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', '0', '', ''],
    ['SOL1154R24-ENC-GOOD', '20260810', 'R24', '', 'R24 읽을 수 있는 정상 상호', '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', '0', '', ''],
  ]
  const header = '\uFEFF"데이터관리>거래처-Excel다운로드"\n"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""\n'
  const source = Buffer.from(header + rows.map(row => row.map(quote).join(',')).join('\n') + '\n', 'utf8')
  const marker = Buffer.from('R24 훼손 대상 상호', 'utf8')
  const markerAt = source.indexOf(marker)
  return Buffer.concat([source.subarray(0, markerAt), Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]), source.subarray(markerAt + marker.length)])
}

async function login(request: APIRequestContext, password: string) {
  const response = await request.post(`${authBase}/auth/login`, { data: { loginId: 'dev_master', password } })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const data = JSON.parse(raw).data ?? {}
  return { token: data.token ?? '', role: data.role ?? 'MASTER', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' }
}

async function installDesktopHarness(page: Page, auth: Record<string, string>): Promise<void> {
  await page.addInitScript((state) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: { getToken: async () => ({ ...state, fullName: state.displayName, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined } })
    Object.defineProperty(window, 'samhanUpdater', { configurable: true, value: { onStatus: (callback: (status: { kind: string }) => void) => { setTimeout(() => callback({ kind: 'not-available' }), 0); return () => undefined }, check: async () => undefined, install: async () => undefined, quit: async () => undefined } })
  }, auth)
}

test('R24 혼합 인코딩 보류 화면은 응답 정본과 일치한다', async ({ request, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const auth = await login(request, password)
  await installDesktopHarness(page, auth)
  let responseBody: unknown
  page.on('response', async response => {
    if (response.request().method() === 'POST' && response.url().includes('/admin/partners/imports/ecount')) responseBody = await response.json()
  })
  await page.goto(`${appBase}/admin/partners`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('admin-partners-import-input')).toHaveCount(1)
  await page.getByTestId('admin-partners-import-input').setInputFiles({ name: 'R24-mixed-encoding.csv', mimeType: 'text/csv', buffer: csv() })
  const panel = page.getByTestId('partner-import-rejections')
  await expect(panel).toBeVisible()
  const visibleRows = await panel.locator('tbody tr').allTextContents()
  expect(visibleRows[0]).toContain('3')
  expect(visibleRows[0]).toContain('SOL1154R24-ENC-BAD')
  expect(visibleRows[0]).toContain('읽을 수 없음')
  expect(visibleRows[0]).not.toContain('����')
  await page.screenshot({ path: path.join(shots, '02-after-mixed-encoding.png'), fullPage: true })
  const search = page.getByRole('searchbox', { name: '코드 / 상호 / 사업자번호 / 전화 검색' })
  await search.fill('SOL1154R24-ENC-GOOD')
  await expect(page.getByTestId('admin-partners-row-SOL1154R24-ENC-GOOD')).toHaveText('R24 읽을 수 있는 정상 상호')
  await page.screenshot({ path: path.join(shots, '03-after-readable-row.png'), fullPage: true })
  const cleanup = await request.delete(`${authBase}/admin/partners/SOL1154R24-ENC-GOOD`, {
    headers: { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' },
  })
  expect(cleanup.status(), await cleanup.text()).toBe(200)
  saveJson('01-display-parity.json', { response: responseBody, visibleRows, readableRow: 'R24 읽을 수 있는 정상 상호', unreadableLabel: '읽을 수 없음', credentials: '<redacted>', transportAdapterBypass: false, appRoute: '/admin/partners' })
})
