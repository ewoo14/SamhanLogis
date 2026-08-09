import { chromium, request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs'

const require = createRequire(import.meta.url)
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const out = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1123-s33-live-qa/screenshots'))
fs.mkdirSync(out, { recursive: true })

const FRONT = process.env.S33_FRONT ?? 'http://127.0.0.1:51124'
const API = process.env.S33_API ?? 'http://127.0.0.1:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const PRODUCT_ID = '974d6ed1-d048-4cbb-8868-bc3b80f0b7c6'
const SOURCE_WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001'
const CLOSED_DATE = '2026-08-09'
const OPEN_DATE = '2026-08-10'
const BASELINE_DATE = '2026-08-10'

const evidence = { environment: { front: FRONT, api: API }, network: [], observations: [] }
const redact = (value) => String(value ?? '')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <REDACTED>')

async function readResponse(res) {
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status(), text: redact(text), json }
}

function record(name, method, url, result) {
  const safeUrl = redact(url)
  const row = { name, method, url: safeUrl, status: result.status, body: result.text }
  evidence.observations.push(row)
  console.log(`${name}|${method}|${safeUrl}|HTTP ${result.status}|${result.text}`)
  return row
}

async function login(api, loginId) {
  const res = await api.post(`${API}/api/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  const result = await readResponse(res)
  if (result.status !== 200 || !result.json?.data?.token) {
    throw new Error(`login failed ${loginId}: HTTP ${result.status} ${result.text}`)
  }
  return {
    loginId,
    token: result.json.data.token,
    role: result.json.data.role,
    displayName: result.json.data.displayName,
  }
}

function authHeaders(session) {
  return { Authorization: `Bearer ${session.token}` }
}

async function call(api, session, name, method, url, data) {
  const res = await api.fetch(`${API}${url}`, {
    method,
    headers: authHeaders(session),
    data,
  })
  const result = await readResponse(res)
  record(name, method, url, result)
  return result
}

function linePayload(line) {
  return {
    productId: line.productId,
    productName: line.productName,
    modelName: line.modelName,
    specification: line.specification,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    note: line.note,
    lineId: line.id,
  }
}

function createPayload(date, memo, deliveryTag = null) {
  return {
    slipType: 'OUTBOUND',
    slipDate: date,
    sourceWarehouseId: SOURCE_WAREHOUSE_ID,
    deliveryTag,
    memo,
    lines: [{
      productId: PRODUCT_ID,
      productName: '판넬 2Way',
      modelName: 'PC2NWSK1N',
      quantity: 1,
      unitPrice: 11000,
      priceVatInclusive: true,
    }],
  }
}

async function show(page, file, title, detail) {
  await page.evaluate(({ title, detail }) => {
    document.querySelector('#s33-live-evidence')?.remove()
    const panel = document.createElement('section')
    panel.id = 's33-live-evidence'
    panel.style.cssText = 'position:fixed;z-index:2147483647;left:20px;right:20px;bottom:20px;max-height:62vh;overflow:auto;background:#07111f;color:#e6edf3;border:2px solid #38bdf8;border-radius:12px;padding:18px;box-shadow:0 12px 40px #000b;font:14px/1.45 Consolas,monospace;white-space:pre-wrap'
    const heading = document.createElement('h2')
    heading.textContent = title
    heading.style.cssText = 'margin:0 0 10px;color:#7dd3fc;font:700 20px system-ui'
    const pre = document.createElement('pre')
    pre.textContent = detail
    pre.style.margin = '0'
    panel.append(heading, pre)
    document.body.appendChild(panel)
  }, { title, detail: redact(detail) })
  await page.screenshot({ path: path.join(out, file), fullPage: true })
}

async function main() {
  const api = await request.newContext()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('response', (res) => {
    if (res.url().startsWith(API)) {
      evidence.network.push({ method: res.request().method(), url: redact(res.url()), status: res.status() })
    }
  })

  let baselineId = null
  try {
    await page.goto(FRONT, { waitUntil: 'networkidle' })
    await page.screenshot({ path: path.join(out, '01-real-app-login.png'), fullPage: true })
    await page.getByTestId('login-id-input').fill('dev_master')
    await page.getByTestId('login-password-input').fill(PASSWORD)
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/auth/login') && r.status() === 200),
      page.getByTestId('login-submit-button').click(),
    ])
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(out, '02-real-app-master-home.png'), fullPage: true })

    await page.goto(`${FRONT}/#/admin/permission-matrix`, { waitUntil: 'networkidle' })
    await page.getByText('마감일 예외 생성', { exact: true }).waitFor({ timeout: 15000 })
    await page.getByText('마감 기준선 관리', { exact: true }).waitFor({ timeout: 15000 })
    await page.screenshot({ path: path.join(out, '03-real-permission-ui.png'), fullPage: true })

    const sessions = {}
    for (const id of ['dev_master', 'dev_accountant', 'dev_manager', 'dev_sales']) {
      sessions[id] = await login(api, id)
      evidence.observations.push({ name: `LOGIN_${id}`, status: 200, role: sessions[id].role })
    }

    const pre = await call(api, sessions.dev_master, 'PRECONDITION_BASELINES', 'GET', '/admin/slip-closing-baselines')
    await show(page, '04-precondition-baseline-zero.png', 'S33 발화 조건 — 실 관리자 API', `GET /admin/slip-closing-baselines\nHTTP ${pre.status}\n${pre.text}`)

    const baseline = await call(api, sessions.dev_master, 'CREATE_BASELINE', 'POST', '/admin/slip-closing-baselines', {
      slipType: 'OUTBOUND', baselineDate: BASELINE_DATE,
    })
    baselineId = baseline.json?.data?.id ?? null
    await show(page, '05-create-baseline-real-api.png', 'S33 기준선 생성 — DB 직접 조작 없음', `POST /admin/slip-closing-baselines\nHTTP ${baseline.status}\n${baseline.text}`)

    const closedNormal = await call(api, sessions.dev_sales, 'A_CREATE_CLOSED_SALES', 'POST', '/api/v1/slips', createPayload(CLOSED_DATE, 'S33-closed-normal-blocked'))
    await show(page, '06-a-closed-create-blocked.png', '(a) 마감 날짜 일반 사용자 생성', `POST /api/v1/slips\nHTTP ${closedNormal.status}\n${closedNormal.text}`)

    const closedMaster = await call(api, sessions.dev_master, 'B_MASTER_CLOSED_CREATE', 'POST', '/api/v1/slips', createPayload(CLOSED_DATE, 'S33-master-closed-pass'))
    const closedSlip = closedMaster.json?.data
    if (closedMaster.status !== 201 || !closedSlip?.id) throw new Error(`MASTER closed create did not succeed: ${closedMaster.text}`)
    await show(page, '07-b-master-closed-pass.png', '(b) MASTER 마감 예외 생성', `POST /api/v1/slips\nHTTP ${closedMaster.status}\n${closedMaster.text}`)

    const openCreated = await call(api, sessions.dev_sales, 'B_OPEN_CREATE', 'POST', '/api/v1/slips', createPayload(OPEN_DATE, 'S33-open-normal-path'))
    const openSlip = openCreated.json?.data
    if (openCreated.status !== 201 || !openSlip?.id) throw new Error(`open create did not succeed: ${openCreated.text}`)

    const closedId = closedSlip.id
    const closedLineId = closedSlip.lines?.[0]?.id
    const closedUpdatedAt = closedSlip.updatedAt
    const blocked = []
    blocked.push(await call(api, sessions.dev_sales, 'A1_HEADER', 'PATCH', `/api/v1/slips/${closedId}/header`, { memo: 'S33-blocked-header' }))
    blocked.push(await call(api, sessions.dev_sales, 'A2_DRIVER', 'PATCH', `/api/v1/slips/${closedId}/driver`, { driverName: 'S33-기사', driverPhone: '010-3300-0001' }))
    blocked.push(await call(api, sessions.dev_sales, 'A3_V20', 'PATCH', `/api/v1/slips/${closedId}/v20`, { projectName: 'S33-blocked-v20' }))
    blocked.push(await call(api, sessions.dev_sales, 'A4_ADD_LINE', 'POST', `/api/v1/slips/${closedId}/lines`, {
      productId: PRODUCT_ID, productName: '판넬 2Way', modelName: 'PC2NWSK1N', quantity: 1, unitPrice: 11000,
    }))
    blocked.push(await call(api, sessions.dev_sales, 'A5_REMOVE_LINE', 'DELETE', `/api/v1/slips/${closedId}/lines/${closedLineId}`))
    blocked.push(await call(api, sessions.dev_sales, 'A6_OVERLAY', 'PATCH', `/api/v1/slips/${closedId}/audit/overlay`, { fieldName: 'memo', newValue: 'S33-blocked-overlay' }))
    blocked.push(await call(api, sessions.dev_sales, 'A7_COLLAB_BATCH', 'POST', `/api/v1/slips/${closedId}/collab/edits`, {
      changeSet: JSON.stringify({ memo: { before: 'S33-master-closed-pass', after: 'S33-blocked-collab' } }), reason: 'S33-closed-guard',
    }))
    blocked.push(await call(api, sessions.dev_sales, 'A8_USER_DELETE', 'DELETE', `/api/v1/slips/${closedId}/sales`, { updatedAt: closedUpdatedAt }))
    await show(page, '08-a-eight-mutations-blocked.png', '(a) S27 실사용 mutation 8경로', blocked.map((r, i) => `${i + 1}. HTTP ${r.status} ${r.text}`).join('\n\n'))

    const openId = openSlip.id
    const normal = []
    normal.push(await call(api, sessions.dev_sales, 'B1_OPEN_HEADER', 'PATCH', `/api/v1/slips/${openId}/header`, { memo: 'S33-open-header-ok' }))
    normal.push(await call(api, sessions.dev_sales, 'B2_OPEN_DRIVER', 'PATCH', `/api/v1/slips/${openId}/driver`, { driverName: 'S33-정상기사', driverPhone: '010-3300-0002' }))
    normal.push(await call(api, sessions.dev_sales, 'B3_OPEN_V20', 'PATCH', `/api/v1/slips/${openId}/v20`, { projectName: 'S33-open-v20-ok' }))
    const added = await call(api, sessions.dev_sales, 'B4_OPEN_ADD_LINE', 'POST', `/api/v1/slips/${openId}/lines`, {
      productId: PRODUCT_ID, productName: '판넬 2Way', modelName: 'PC2NWSK1N', quantity: 1, unitPrice: 11000,
    })
    normal.push(added)
    const addedLine = added.json?.data?.lines?.at(-1)?.id
    normal.push(await call(api, sessions.dev_sales, 'B5_OPEN_REMOVE_LINE', 'DELETE', `/api/v1/slips/${openId}/lines/${addedLine}`))
    normal.push(await call(api, sessions.dev_sales, 'B6_OPEN_OVERLAY', 'PATCH', `/api/v1/slips/${openId}/audit/overlay`, { fieldName: 'memo', newValue: 'S33-open-overlay-ok' }))
    normal.push(await call(api, sessions.dev_sales, 'B7_OPEN_COLLAB_BATCH', 'POST', `/api/v1/slips/${openId}/collab/edits`, {
      changeSet: JSON.stringify({ memo: { before: 'S33-open-overlay-ok', after: 'S33-open-collab-ok' } }), reason: 'S33-open-normal',
    }))
    await show(page, '09-b-open-mutations-pass.png', '(b) 열린 날짜 정상 mutation', normal.map((r, i) => `${i + 1}. HTTP ${r.status} ${r.text}`).join('\n\n'))

    const deleteCreated = await call(api, sessions.dev_sales, 'B_OPEN_DELETE_FIXTURE_CREATE', 'POST', '/api/v1/slips', createPayload(OPEN_DATE, 'S33-open-delete-fixture'))
    const deleteFresh = await call(api, sessions.dev_sales, 'B_OPEN_DELETE_FRESH_GET', 'GET', `/api/v1/slips/${deleteCreated.json.data.id}`)
    const deleteResult = await call(api, sessions.dev_sales, 'B_OPEN_DELETE', 'DELETE', `/api/v1/slips/${deleteCreated.json.data.id}/sales`, { updatedAt: deleteFresh.json.data.updatedAt })
    await show(page, '10-b-open-delete-pass.png', '(b) 열린 날짜 신규 전표 삭제', `DELETE /api/v1/slips/<S33-ID>/sales\nHTTP ${deleteResult.status}\n${deleteResult.text}`)

    const forbidden = await call(api, sessions.dev_accountant, 'C_FORBIDDEN_PRECEDES_CLOSED', 'POST', '/api/v1/slips', createPayload(CLOSED_DATE, 'S33-accountant-forbidden'))
    await show(page, '11-c-forbidden-403.png', '(c) 권한 없음 우선', `POST /api/v1/slips\nHTTP ${forbidden.status}\n${forbidden.text}`)

    const afterCutoff = await call(api, sessions.dev_master, 'D_AFTER_CUTOFF_DAY', 'POST', '/api/v1/slips', createPayload(CLOSED_DATE, 'S33-cutoff-after-blocked', 'DAY'))
    const beforeCutoff = await call(api, sessions.dev_master, 'D_BEFORE_CUTOFF_PARCEL', 'POST', '/api/v1/slips', createPayload(CLOSED_DATE, 'S33-cutoff-before-pass', 'GYEONGDONG_PARCEL'))
    await show(page, '12-d-cutoff-before-after.png', '(d) 배송태그별 당일 마감시각', `DAY(00:01)\nHTTP ${afterCutoff.status}\n${afterCutoff.text}\n\n경동택배(15:00)\nHTTP ${beforeCutoff.status}\n${beforeCutoff.text}`)

    const concurrencyCreated = await call(api, sessions.dev_sales, 'E_CONCURRENCY_FIXTURE_CREATE', 'POST', '/api/v1/slips', createPayload(OPEN_DATE, 'S33-concurrency-fixture'))
    const c = concurrencyCreated.json.data
    const putBody = {
      updatedAt: c.updatedAt,
      memo: 'S33-concurrency-first',
      lines: c.lines.map(linePayload),
      lineIdContract: true,
    }
    const firstPut = await call(api, sessions.dev_sales, 'E_FIRST_PUT', 'PUT', `/api/v1/slips/${c.id}/sales`, putBody)
    const secondPut = await call(api, sessions.dev_sales, 'E_STALE_SECOND_PUT', 'PUT', `/api/v1/slips/${c.id}/sales`, { ...putBody, memo: 'S33-concurrency-stale-second' })
    await show(page, '13-e-optimistic-lock.png', '(e) 동일 버전 두 번 수정', `첫 PUT\nHTTP ${firstPut.status}\n${firstPut.text}\n\n같은 updatedAt 재사용 PUT\nHTTP ${secondPut.status}\n${secondPut.text}`)

    await show(page, '14-network-real-gateway.png', '실 앱 네트워크 — mock 아님', evidence.network.map((n) => `${n.method} ${n.status} ${n.url}`).join('\n'))
  } finally {
    if (baselineId) {
      try {
        const cleanupApi = await request.newContext()
        const master = await login(cleanupApi, 'dev_master')
        await call(cleanupApi, master, 'CLEANUP_S33_BASELINE', 'DELETE', `/admin/slip-closing-baselines/${baselineId}`)
        await cleanupApi.dispose()
      } catch (error) {
        evidence.observations.push({ name: 'CLEANUP_S33_BASELINE_FAILED', error: redact(error?.message) })
      }
    }
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8')
    await context.close()
    await browser.close()
    await api.dispose()
  }
}

await main()
