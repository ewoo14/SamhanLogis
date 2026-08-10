import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIRNAME, '../../../..')
const AUTH_BASE = process.env['AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const PARTNER_BASE = process.env['PARTNER_API_BASE'] ?? 'http://127.0.0.1:48095'
const ACCOUNTING_BASE = process.env['ACCOUNTING_API_BASE'] ?? 'http://127.0.0.1:28087'
const DB_CONTAINER = process.env['R15_DB_CONTAINER'] ?? 'sol1154-r9-db'
const SHOTS = resolveQaShotsDir(path.join(ROOT, 'docs/qa/2026-08-09-1154-r15'))
const RAW = path.join(SHOTS, 'raw')
const MASTER = path.join(ROOT, 'docs/migration/896-sheet/ecount/거래처등록.xlsx')
const MASTER_HASH = '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
const PREFIX = 'SOL1154R15-'

type Row = { code: string; name: string; creditLimit?: string }

function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-X', '-A', '-t', '-U', 'samhan', '-d', 'partner_r9', '-c', query], { encoding: 'utf8' }).trim()
}

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}\t"`
}

function csv(rows: Row[]): Buffer {
  const meta = '\uFEFF"데이터관리>거래처-Excel다운로드"'
  const header = '"거래처코드\t","등록일자\t","담당자명\t","종사업장번호\t","거래처명\t","대표자명\t","주소1\t","전화번호\t","핸드폰번호\t","검색창내용\t","특이사항\t","그룹\t","사용구분\t","이체정보\t","여신한도\t","최초작성일자\t",""'
  const data = rows.map(({ code, name, creditLimit = '' }) => [
    code, '20230814', 'R15담당자', '', name, '대표', '서울', '', '', '', '', '일반업체', 'YES', '등록', creditLimit, '', '',
  ].map(quoteCsv).join(','))
  return Buffer.from([meta, header, ...data].join('\n') + '\n', 'utf8')
}

function cp949LikeInvalidUtf8Csv(): Buffer {
  const marker = Buffer.from('R15_BYTE_SENTINEL', 'ascii')
  const source = csv([{ code: `${PREFIX}ENCODING`, name: marker.toString('ascii'), creditLimit: '-1' }])
  const offset = source.indexOf(marker)
  expect(offset).toBeGreaterThan(0)
  return Buffer.concat([source.subarray(0, offset), Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]), source.subarray(offset + marker.length)])
}

function jsonBody(raw: string): any {
  return JSON.parse(raw)
}

function hasUuid(value: unknown): boolean {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(JSON.stringify(value))
}

async function renderEvidence(page: Page, title: string, evidence: unknown, filename: string): Promise<void> {
  const escaped = JSON.stringify(evidence, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  await page.setContent(`<meta charset="utf-8"><style>body{font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc;padding:36px}h1{color:#fda4af}pre{white-space:pre-wrap;word-break:break-all;background:#111c30;padding:22px;border-radius:12px;line-height:1.45}</style><h1>${title}</h1><pre>${escaped}</pre>`)
  await page.screenshot({ path: path.join(SHOTS, filename), fullPage: true })
}

test('PR #1154 R15 실 관리자 API 적대검증과 정본 회귀', async ({ page, request, browserName }) => {
  expect(browserName).toBe('chromium')
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }

  fs.mkdirSync(RAW, { recursive: true })
  for (const file of fs.readdirSync(RAW)) fs.rmSync(path.join(RAW, file), { force: true })

  const call = async (method: string, url: string, options: Parameters<APIRequestContext['fetch']>[1] = {}) => {
    const response = await request.fetch(url, { ...options, method })
    const raw = await response.text()
    return { response, raw }
  }
  const login = await call('POST', `${AUTH_BASE}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.response.status(), login.raw).toBe(200)
  const loginData = jsonBody(login.raw).data ?? {}
  const headers = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const accountingHeaders = { Authorization: headers.Authorization, 'X-User-Id': headers['X-User-Id'], 'X-Is-System-Master': 'true' }
  const upload = (contents: Buffer, name: string, mimeType = 'text/csv') => call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers, multipart: { file: { name, mimeType, buffer: contents } }, timeout: 20 * 60_000,
  })
  const reimport = () => call('POST', `${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, { headers: accountingHeaders, timeout: 20 * 60_000 })
  const writeRaw = (name: string, contents: Buffer) => fs.writeFileSync(path.join(RAW, name), contents)
  const outputs: Record<string, unknown> = {}

  const cleanupActive = async () => {
    const codes = sql(`SELECT partner_code FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=false ORDER BY partner_code`).split(/\r?\n/).filter(Boolean)
    const statuses: number[] = []
    for (let offset = 0; offset < codes.length; offset += 20) {
      const batch = await Promise.all(codes.slice(offset, offset + 20).map(async code => {
        const result = await call('DELETE', `${PARTNER_BASE}/admin/partners/${code}`, { headers })
        return result.response.status()
      }))
      statuses.push(...batch)
    }
    return { requested: codes.length, ok200: statuses.filter(status => status === 200).length, other: statuses.filter(status => status !== 200) }
  }

  await cleanupActive()
  expect(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=false`)).toBe('0')
  try {
    const specialName = 'R15 따옴표 "JSON:{"key":"<&>"}\\slash\n실제개행\t탭 😀 끝'
    const longName = `R15-LONG-${'가'.repeat(500)}`
    const specialFile = '거래처-Excel다운로드_R15_SPECIAL.csv'
    const specialSeed = await upload(csv([{ code: `${PREFIX}SPECIAL-HELD`, name: specialName }]), 'r15-special-held-seed.csv')
    expect(specialSeed.response.status(), specialSeed.raw).toBe(200)
    const specialBytes = csv([
      { code: `${PREFIX}SPECIAL-BEFORE`, name: 'R15 특수문자 앞 정상' },
      { code: `${PREFIX}SPECIAL-HELD`, name: specialName, creditLimit: '-1' },
      { code: `${PREFIX}LONG-HELD`, name: longName },
      { code: `${PREFIX}SPECIAL-AFTER`, name: 'R15 특수문자 뒤 정상' },
    ])
    const specialDirect = await upload(specialBytes, specialFile)
    expect(specialDirect.response.status(), specialDirect.raw).toBe(200)
    writeRaw(specialFile, specialBytes)
    const specialAccounting = await reimport()
    expect(specialAccounting.response.status(), specialAccounting.raw).toBe(200)
    const specialDirectJson = jsonBody(specialDirect.raw)
    const specialAccountingJson = jsonBody(specialAccounting.raw)
    const specialDetail = specialAccountingJson.details.find((x: any) => x.fileName === specialFile)
    expect(specialDetail.heldParseFailureRows).toBe(2)
    expect(specialDetail.heldSample).toHaveLength(2)
    expect(specialDetail.message).toContain('SPECIAL-HELD')
    expect(specialAccountingJson.errors.filter((x: any) => x.fileName === specialFile)).toHaveLength(2)
    expect(hasUuid({ specialDirectJson, specialAccountingJson })).toBe(false)
    outputs.special = { directHttp: specialDirect.response.status(), directRaw: specialDirect.raw, accountingHttp: specialAccounting.response.status(), accountingRaw: specialAccounting.raw, messageLength: specialDetail.message.length, longNameLength: specialDetail.heldSample[1].rawName.length, uuidExposed: false }
    fs.writeFileSync(path.join(SHOTS, '01-special-and-long.json'), JSON.stringify(outputs.special, null, 2), 'utf8')
    await renderEvidence(page, 'R15 ① 특수문자·개행·긴 이름 실 HTTP', outputs.special, '01-special-and-long.png')

    const blankFile = '거래처-Excel다운로드_R15_BLANK.csv'
    const blankBytes = csv([{ code: `${PREFIX}BLANK-NAME`, name: '' }])
    const blankDirect = await upload(blankBytes, blankFile)
    expect(blankDirect.response.status(), blankDirect.raw).toBe(200)
    writeRaw(blankFile, blankBytes)
    const blankAccounting = await reimport()
    expect(blankAccounting.response.status(), blankAccounting.raw).toBe(200)
    const blankDirectJson = jsonBody(blankDirect.raw)
    const blankAccountingJson = jsonBody(blankAccounting.raw)
    const blankDetail = blankAccountingJson.details.find((x: any) => x.fileName === blankFile)
    outputs.blank = { directHttp: blankDirect.response.status(), directRaw: blankDirect.raw, accountingHttp: blankAccounting.response.status(), accountingRaw: blankAccounting.raw, detail: blankDetail, fileErrors: blankAccountingJson.errors.filter((x: any) => x.fileName === blankFile) }
    fs.writeFileSync(path.join(SHOTS, '02-blank-name.json'), JSON.stringify(outputs.blank, null, 2), 'utf8')
    await renderEvidence(page, 'R15 ① 빈 이름 실 HTTP', outputs.blank, '02-blank-name.png')

    const encodingFile = '거래처-Excel다운로드_R15_ENCODING.csv'
    const encodingBytes = cp949LikeInvalidUtf8Csv()
    const encodingSeed = await upload(csv([{ code: `${PREFIX}ENCODING`, name: 'R15 인코딩 seed' }]), 'r15-encoding-seed.csv')
    expect(encodingSeed.response.status(), encodingSeed.raw).toBe(200)
    const encodingDirect = await upload(encodingBytes, encodingFile)
    expect(encodingDirect.response.status(), encodingDirect.raw).toBe(200)
    writeRaw(encodingFile, encodingBytes)
    const encodingAccounting = await reimport()
    expect(encodingAccounting.response.status(), encodingAccounting.raw).toBe(200)
    const encodingDirectJson = jsonBody(encodingDirect.raw)
    const encodingAccountingJson = jsonBody(encodingAccounting.raw)
    const encodingDetail = encodingAccountingJson.details.find((x: any) => x.fileName === encodingFile)
    outputs.encoding = { directHttp: encodingDirect.response.status(), directRaw: encodingDirect.raw, accountingHttp: encodingAccounting.response.status(), accountingRaw: encodingAccounting.raw, decodedName: encodingDetail?.heldSample?.[0]?.rawName, replacementCharacterObserved: encodingDetail?.heldSample?.[0]?.rawName?.includes('�') ?? false }
    fs.writeFileSync(path.join(SHOTS, '03-invalid-utf8.json'), JSON.stringify(outputs.encoding, null, 2), 'utf8')
    await renderEvidence(page, 'R15 ① 비 UTF-8 바이트 실 HTTP', outputs.encoding, '03-invalid-utf8.png')

    const bulkFile = '거래처-Excel다운로드_R15_BULK_1000.csv'
    const bulkRows = Array.from({ length: 1000 }, (_, i) => ({ code: `${PREFIX}BULK-${String(i + 1).padStart(4, '0')}`, name: `R15 대량 보류 ${i + 1}`, creditLimit: '-1' }))
    const bulkSeedRows = bulkRows.map(({ code, name }) => ({ code, name }))
    const bulkSeed = await upload(csv(bulkSeedRows), 'r15-bulk-1000-seed.csv')
    expect(bulkSeed.response.status(), bulkSeed.raw).toBe(200)
    const bulkBytes = csv(bulkRows)
    const bulkDirect = await upload(bulkBytes, bulkFile)
    expect(bulkDirect.response.status(), bulkDirect.raw).toBe(200)
    writeRaw(bulkFile, bulkBytes)
    const bulkAccounting = await reimport()
    expect(bulkAccounting.response.status(), bulkAccounting.raw).toBe(200)
    const bulkDirectJson = jsonBody(bulkDirect.raw)
    const bulkAccountingJson = jsonBody(bulkAccounting.raw)
    const bulkDetail = bulkAccountingJson.details.find((x: any) => x.fileName === bulkFile)
    const bulkErrors = bulkAccountingJson.errors.filter((x: any) => x.fileName === bulkFile)
    outputs.bulk = { requestRows: 1000, requestBytes: bulkBytes.length, directHttp: bulkDirect.response.status(), directHeldRows: bulkDirectJson.heldParseFailureRows, directHeldSampleLength: bulkDirectJson.heldSample.length, accountingHttp: bulkAccounting.response.status(), accountingHeldRows: bulkDetail.heldParseFailureRows, accountingHeldSampleLength: bulkDetail.heldSample.length, accountingErrorLength: bulkErrors.length, accountingResponseBytes: Buffer.byteLength(bulkAccounting.raw, 'utf8'), firstError: bulkErrors[0], lastError: bulkErrors.at(-1), uuidExposed: hasUuid({ bulkDirectJson, bulkAccountingJson }) }
    fs.writeFileSync(path.join(SHOTS, '04-bulk-1000.json'), JSON.stringify(outputs.bulk, null, 2), 'utf8')
    await renderEvidence(page, 'R15 ② 대량 held 1,000건 실 HTTP', outputs.bulk, '04-bulk-1000.png')

    const master = await call('POST', `${PARTNER_BASE}/admin/partners/imports/ecount-xlsx`, {
      headers,
      multipart: { file: { name: path.basename(MASTER), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(MASTER) } },
      timeout: 20 * 60_000,
    })
    expect(master.response.status(), master.raw).toBe(200)
    const masterJson = jsonBody(master.raw)
    expect(masterJson).toMatchObject({ totalRows: 7253, rejectedNullName: 0, excludedTrailerRows: 1, heldParseFailureRows: 0, registrationDateParsedCount: 2423, createdAtLoadTimeCount: 4830, sourceFileHash: MASTER_HASH })
    outputs.master = { http: master.response.status(), raw: master.raw }
    fs.writeFileSync(path.join(SHOTS, '05-master-7253.json'), JSON.stringify(outputs.master, null, 2), 'utf8')
    await renderEvidence(page, 'R15 ④ 정본 7,253건 실 관리자 API', outputs.master, '05-master-7253.png')
  } finally {
    const cleanupResponses = await cleanupActive()
    const cleanup = {
      apiDeletes: cleanupResponses,
      active: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=false`)),
      softDeleted: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=true`)),
      staging: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE raw_partner_code LIKE '${PREFIX}%'`)),
    }
    fs.writeFileSync(path.join(SHOTS, '06-cleanup.json'), JSON.stringify(cleanup, null, 2), 'utf8')
    await renderEvidence(page, 'R15 cleanup 잔여 수치', cleanup, '06-cleanup.png')
    expect(cleanup.active).toBe(0)
  }
})

test('PR #1154 R15 대량 held 응답 원문 재캡처', async ({ request }) => {
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
  const partnerHeaders = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const accountingHeaders = { Authorization: partnerHeaders.Authorization, 'X-User-Id': partnerHeaders['X-User-Id'], 'X-Is-System-Master': 'true' }
  const file = fs.readFileSync(path.join(RAW, '거래처-Excel다운로드_R15_BULK_1000.csv'))
  const direct = await request.post(`${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers: partnerHeaders,
    multipart: { file: { name: '거래처-Excel다운로드_R15_BULK_1000.csv', mimeType: 'text/csv', buffer: file } },
    timeout: 20 * 60_000,
  })
  const directRaw = await direct.text()
  expect(direct.status(), directRaw).toBe(200)
  fs.writeFileSync(path.join(SHOTS, '04a-bulk-partner-raw.json'), directRaw, 'utf8')
  const accounting = await request.post(`${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, { headers: accountingHeaders, timeout: 20 * 60_000 })
  const accountingRaw = await accounting.text()
  expect(accounting.status(), accountingRaw).toBe(200)
  fs.writeFileSync(path.join(SHOTS, '04b-bulk-accounting-raw.json'), accountingRaw, 'utf8')
})

test('PR #1154 R15 20000자 첫 message 상한 실측', async ({ request }) => {
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
  const partnerHeaders = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const accountingHeaders = { Authorization: partnerHeaders.Authorization, 'X-User-Id': partnerHeaders['X-User-Id'], 'X-Is-System-Master': 'true' }
  const name = `R15-LONG-FIRST-${'장'.repeat(20_000)}`
  const fileName = '거래처-Excel다운로드_R15_LONG_FIRST.csv'
  const contents = csv([{ code: `${PREFIX}LONG-FIRST`, name }])
  const direct = await request.post(`${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers: partnerHeaders,
    multipart: { file: { name: fileName, mimeType: 'text/csv', buffer: contents } },
    timeout: 20 * 60_000,
  })
  const directRaw = await direct.text()
  expect(direct.status(), directRaw).toBe(200)
  fs.writeFileSync(path.join(SHOTS, '01a-long-first-partner-raw.json'), directRaw, 'utf8')
  fs.writeFileSync(path.join(RAW, fileName), contents)
  const accounting = await request.post(`${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, { headers: accountingHeaders, timeout: 20 * 60_000 })
  const accountingRaw = await accounting.text()
  expect(accounting.status(), accountingRaw).toBe(200)
  fs.writeFileSync(path.join(SHOTS, '01b-long-first-accounting-raw.json'), accountingRaw, 'utf8')
  const body = JSON.parse(accountingRaw)
  const detail = body.details.find((item: any) => item.fileName === fileName)
  const evidence = { inputNameLength: name.length, messageLength: detail.message.length, heldNameLength: detail.heldSample[0].rawName.length, errorMessageLength: body.errors.find((item: any) => item.fileName === fileName).message.length }
  fs.writeFileSync(path.join(SHOTS, '01c-long-first-lengths.json'), JSON.stringify(evidence, null, 2), 'utf8')
})

test('PR #1154 R15 괄호 쉼표 슬래시 상호 원문 중계', async ({ page, request }) => {
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
  const partnerHeaders = { Authorization: `Bearer ${loginData.token ?? ''}`, 'X-User-Id': loginData.userId ?? '', 'X-User-Role': 'MASTER', 'X-Is-System-Master': 'true' }
  const accountingHeaders = { Authorization: partnerHeaders.Authorization, 'X-User-Id': partnerHeaders['X-User-Id'], 'X-Is-System-Master': 'true' }
  const code = `${PREFIX}PUNCTUATION-HELD`
  const name = 'R15 한글English123 "quoted" (주)삼한, 대리점/본점\\창고'
  const fileName = '거래처-Excel다운로드_R15_PUNCTUATION.csv'
  const upload = (contents: Buffer, uploadName: string) => request.post(`${PARTNER_BASE}/admin/partners/imports/ecount`, {
    headers: partnerHeaders,
    multipart: { file: { name: uploadName, mimeType: 'text/csv', buffer: contents } },
    timeout: 20 * 60_000,
  })
  try {
    const seed = await upload(csv([{ code, name }]), 'r15-punctuation-seed.csv')
    expect(seed.status(), await seed.text()).toBe(200)
    const contents = csv([{ code, name, creditLimit: '-1' }])
    const direct = await upload(contents, fileName)
    const directRaw = await direct.text()
    expect(direct.status(), directRaw).toBe(200)
    fs.writeFileSync(path.join(RAW, fileName), contents)
    const accounting = await request.post(`${ACCOUNTING_BASE}/admin/ecount/reimport/mig-1`, {
      headers: accountingHeaders,
      timeout: 20 * 60_000,
    })
    const accountingRaw = await accounting.text()
    expect(accounting.status(), accountingRaw).toBe(200)
    const directJson = JSON.parse(directRaw)
    const accountingJson = JSON.parse(accountingRaw)
    const detail = accountingJson.details.find((item: any) => item.fileName === fileName)
    const fileErrors = accountingJson.errors.filter((item: any) => item.fileName === fileName)
    const observedName = name.replace('\\', '')
    expect(directJson.heldSample[0].rawName).toBe(observedName)
    expect(detail.heldSample[0].rawName).toBe(observedName)
    expect(detail.message).toContain(observedName)
    expect(fileErrors[0].message).toContain(observedName)
    expect(observedName).not.toBe(name)
    expect(hasUuid({ directJson, detail, fileErrors })).toBe(false)
    const evidence = { directHttp: direct.status(), directRaw, accountingHttp: accounting.status(), accountingRaw, inputName: name, observedName, backslashLost: true, uuidExposed: false }
    fs.writeFileSync(path.join(SHOTS, '01d-punctuation.json'), JSON.stringify(evidence, null, 2), 'utf8')
    await renderEvidence(page, 'R15 ① 괄호·쉼표·슬래시 상호 실 HTTP', evidence, '01d-punctuation.png')
  } finally {
    const cleanup = await request.delete(`${PARTNER_BASE}/admin/partners/${code}`, { headers: partnerHeaders })
    expect(cleanup.status(), await cleanup.text()).toBe(200)
  }
})

test('PR #1154 R15 최종 cleanup SELECT 캡처', async ({ page }) => {
  const previous = JSON.parse(fs.readFileSync(path.join(SHOTS, '06-cleanup.json'), 'utf8'))
  const cleanup = {
    apiDeletes: previous.apiDeletes,
    additionalApiDeletes: previous.additionalApiDeletes ?? 0,
    active: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=false`)),
    softDeleted: Number(sql(`SELECT count(*) FROM partners WHERE partner_code LIKE '${PREFIX}%' AND is_deleted=true`)),
    staging: Number(sql(`SELECT count(*) FROM staging.ecount_partner_raw WHERE raw_partner_code LIKE '${PREFIX}%'`)),
  }
  fs.writeFileSync(path.join(SHOTS, '06-cleanup.json'), JSON.stringify(cleanup, null, 2), 'utf8')
  await renderEvidence(page, 'R15 cleanup 최종 잔여 수치', cleanup, '06-cleanup.png')
  expect(cleanup.active).toBe(0)
})
