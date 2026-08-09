import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import iconv from 'iconv-lite'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIRNAME, '../../../..')
const AUTH_BASE = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const PARTNER_BASE = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const ACCOUNTING_BASE = process.env['ACCOUNTING_API_BASE'] ?? 'http://127.0.0.1:28087'
const DB_CONTAINER = process.env['R17_DB_CONTAINER'] ?? 'sol1154-r9-db'
const SHOTS = resolveQaShotsDir(path.join(ROOT, 'docs/qa/2026-08-09-1154-r17'))
const RAW = path.join(SHOTS, 'raw')
const ACCOUNTING_RAW = resolveQaShotsDir(process.env['R17_ACCOUNTING_RAW_DIR'] ?? path.join(ROOT, 'docs/qa/2026-08-09-1154-r15/raw'))
const PREFIX = 'SOL1154R17-'
const MASTER = path.join(ROOT, 'docs/migration/896-sheet/ecount/거래처등록.xlsx')
const MASTER_HASH = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const EXPECT_FIXED = process.env['R17_EXPECT_FIXED'] === 'true'

function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', 'partner_r9', '-c', query], { encoding: 'utf8' }).trim()
}

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}\t"`
}

function csv(code: string, name: string, creditLimit = ''): string {
  const meta = '\uFEFF"데이터관리>거래처-Excel다운로드"'
  const header = '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""'
  const cells = [code, '20230814', 'R17담당자', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', creditLimit, '', '']
  return [meta, header, cells.map(quoteCsv).join(',')].join('\n') + '\n'
}

async function evidence(page: Page, title: string, value: unknown, filename: string): Promise<void> {
  const escaped = JSON.stringify(value, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  await page.setContent(`<meta charset="utf-8"><style>body{font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc;padding:36px}h1{color:#fda4af}pre{white-space:pre-wrap;word-break:break-all;background:#111c30;padding:22px;border-radius:12px;line-height:1.45}</style><h1>${title}</h1><pre>${escaped}</pre>`)
  await page.screenshot({ path: path.join(SHOTS, filename), fullPage: true })
}

test(`PR #1154 R17 실 HTTP 입력 충실도 (${EXPECT_FIXED ? 'fix 후' : 'fix 전'})`, async ({ page, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }

  fs.mkdirSync(RAW, { recursive: true })
  const login = await request.post(`${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.status(), await login.text()).toBe(200)
  const loginData = (await login.json()).data ?? {}
  const headers = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const accountingHeaders = { Authorization: headers.Authorization, 'X-User-Id': headers['X-User-Id'], 'X-Is-System-Master': 'true' }
  const callUpload = async (contents: Buffer, filename: string) => request.post(`${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers, multipart: { file: { name: filename, mimeType: 'text/csv', buffer: contents } }, timeout: 20 * 60_000,
  })
  const codes = [`${PREFIX}ENCODING`, `${PREFIX}PUNCTUATION`]
  const cleanup = async () => {
    for (const code of codes) {
      const response = await request.delete(`${PARTNER_BASE}/admin/partners/${code}`, { headers })
      expect([200, 404]).toContain(response.status())
    }
  }

  await cleanup()
  try {
    const cp949Name = 'R17 CP949 한글상호'
    const punctuationName = 'R17 (주)삼한, 대리점/본점\\창고 "A"'
    const cases = [
      { code: codes[0], name: cp949Name, bytes: iconv.encode(csv(codes[0], cp949Name, '-1'), 'cp949'), filename: '거래처-Excel다운로드_R17_CP949.csv' },
      { code: codes[1], name: punctuationName, bytes: Buffer.from(csv(codes[1], punctuationName, '-1'), 'utf8'), filename: '거래처-Excel다운로드_R17_PUNCTUATION.csv' },
    ]
    const outputs: Record<string, unknown> = {}
    for (const item of cases) {
      const seed = await callUpload(Buffer.from(csv(item.code, item.name, '0'), 'utf8'), `${item.filename}.seed.csv`)
      expect(seed.status(), await seed.text()).toBe(200)
      const direct = await callUpload(item.bytes, item.filename)
      const directRaw = await direct.text()
      if (!EXPECT_FIXED && direct.status() !== 200) {
        outputs[item.code] = { inputName: item.name, directHttp: direct.status(), directRaw, fixed: false, heldByHttpError: true }
        continue
      }
      expect(direct.status(), directRaw).toBe(200)
      fs.writeFileSync(path.join(RAW, item.filename), item.bytes)
      fs.writeFileSync(path.join(ACCOUNTING_RAW, item.filename), item.bytes)
      const accounting = await request.post(`${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, { headers: accountingHeaders, timeout: 20 * 60_000 })
      const accountingRaw = await accounting.text()
      expect(accounting.status(), accountingRaw).toBe(200)
      const directJson = JSON.parse(directRaw)
      const accountingJson = JSON.parse(accountingRaw)
      const detail = accountingJson.details.find((x: any) => x.fileName === item.filename)
      const observed = directJson.heldSample?.[0]?.rawName ?? detail?.heldSample?.[0]?.rawName ?? ''
      outputs[item.code] = { inputName: item.name, directHttp: direct.status(), directRaw, accountingHttp: accounting.status(), accountingRaw, observedName: observed, fixed: EXPECT_FIXED }
      if (EXPECT_FIXED) expect(observed).toBe(item.name)
      else expect(observed).not.toBe(item.name)
    }
    const outputPath = path.join(SHOTS, EXPECT_FIXED ? '01-after.json' : '00-before.json')
    fs.writeFileSync(outputPath, JSON.stringify(outputs, null, 2), 'utf8')
    await evidence(page, `R17 입력 충실도 실 HTTP — ${EXPECT_FIXED ? 'fix 후' : 'fix 전'}`, outputs, EXPECT_FIXED ? '01-after.png' : '00-before.png')
  } finally {
    await cleanup()
    const remaining = {
      active: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=false`)),
      softDeleted: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=true`)),
      staging: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE raw_partner_code LIKE '${PREFIX}%'`)),
    }
    fs.writeFileSync(path.join(SHOTS, EXPECT_FIXED ? '02-cleanup-after.json' : '00-cleanup-before.json'), JSON.stringify(remaining, null, 2), 'utf8')
    expect(remaining.active).toBe(0)
  }
})

test('PR #1154 R17 정본 XLSX 7253건 실 HTTP 회귀', async ({ page, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  const login = await request.post(`${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.status(), await login.text()).toBe(200)
  const loginData = (await login.json()).data ?? {}
  const headers = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const response = await request.post(`${PARTNER_BASE}/admin/partners/imports/ecount-xlsx`, {
    headers,
    multipart: { file: { name: '거래처등록.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(MASTER) } },
    timeout: 20 * 60_000,
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const body = JSON.parse(raw)
  expect(body).toMatchObject({ totalRows: 7253, activeCount: 7253, rejectedNullName: 0, excludedTrailerRows: 1, heldParseFailureRows: 0, registrationDateParsedCount: 2423, createdAtLoadTimeCount: 4830, sourceFileHash: MASTER_HASH })
  const evidenceBody = { http: response.status(), raw, expected: { totalRows: 7253, activeCount: 7253, rejectedNullName: 0, excludedTrailerRows: 1, registrationDateParsedCount: 2423, createdAtLoadTimeCount: 4830, sourceFileHash: MASTER_HASH } }
  fs.writeFileSync(path.join(SHOTS, '03-master-after.json'), JSON.stringify(evidenceBody, null, 2), 'utf8')
  await evidence(page, 'R17 정본 XLSX 7,253건 실 HTTP 회귀', evidenceBody, '03-master-after.png')
})
