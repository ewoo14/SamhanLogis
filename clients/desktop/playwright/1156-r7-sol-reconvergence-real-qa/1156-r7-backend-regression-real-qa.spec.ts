import { expect, test, type APIRequestContext } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUTH_API = 'http://127.0.0.1:8081'
const HEAD_API = 'http://127.0.0.1:28206'
const TIMEOUT_API = 'http://127.0.0.1:28207'
const PARTNER_A_ID = '3fd9b72d-84f4-4777-9faf-252f0bfa5f9f'
const PRODUCT_ID = '6fd28b44-f8e5-4e9d-96ba-d4b9ce9fac89'
const WAREHOUSE_ID = '11111111-1111-1111-1111-000000000001'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r7'))

type Session = { userId: string; role: string; groups?: Array<{ id: string }> }
type ApiResult = { status: number; elapsedMs: number; data: Record<string, any> }

async function call(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch',
  url: string,
  headers: Record<string, string>,
  data?: Record<string, unknown>,
): Promise<ApiResult> {
  const started = Date.now()
  const response = await request[method](url, { headers, data })
  const raw = await response.text()
  expect(response.ok(), `${method.toUpperCase()} ${new URL(url).pathname}: ${raw}`).toBeTruthy()
  const body = raw ? JSON.parse(raw) : {}
  return { status: response.status(), elapsedMs: Date.now() - started, data: body.data ?? {} }
}

test('R7 R2·R3 backend 실 HTTP 회귀', async ({ request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  const login = await request.post(`${AUTH_API}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(login.status()).toBe(200)
  const session = (await login.json()).data as Session
  const headers = {
    'x-user-id': session.userId,
    'x-user-name': 'SOL 5.6 R7',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }

  const list = await call(request, 'get', `${HEAD_API}/slips?slipType=INBOUND&status=DRAFT&page=0&size=100`, headers)
  const headGui = (list.data.content as Array<Record<string, any>>)
    .find((row) => row.memo === 'R7 GUI persistence HEAD partnerCode axis')
  expect(headGui).toBeTruthy()
  const detail = await call(request, 'get', `${HEAD_API}/slips/${headGui!.id}`, headers)
  const partnerBId = detail.data.partnerId as string

  const body = (memo: string) => ({
    slipType: 'INBOUND',
    destinationWarehouseId: WAREHOUSE_ID,
    partnerId: PARTNER_A_ID,
    partnerName: '파인씨엔디',
    memo,
    lines: [{
      productId: PRODUCT_ID,
      productName: 'AJ060MXHNBC1',
      modelName: 'AJ060MXHNBC1',
      quantity: 1,
      unitPrice: 707,
    }],
  })

  const mutation = await call(request, 'post', `${HEAD_API}/slips`, headers, body('R7 BACKEND partner mutation regression'))
  expect(mutation.status).toBe(201)
  expect(mutation.data.partnerCode).toBe('00')
  const same = await call(request, 'patch', `${HEAD_API}/slips/${mutation.data.id}/v20`, headers, {
    partnerId: PARTNER_A_ID,
    projectName: 'R7 same partner resend',
  })
  expect(same.data.partnerCode).toBe('00')
  const omitted = await call(request, 'patch', `${HEAD_API}/slips/${mutation.data.id}/v20`, headers, {
    projectName: 'R7 partner omitted',
  })
  expect(omitted.data.partnerCode).toBe('00')
  const changed = await call(request, 'patch', `${HEAD_API}/slips/${mutation.data.id}/v20`, headers, {
    partnerId: partnerBId,
    projectName: 'R7 A to B',
  })
  expect(changed.data.partnerCode).toBe('P-2026-0001')

  const timeout = await call(request, 'post', `${TIMEOUT_API}/slips`, headers, body('R7 TIMEOUT SEND fail-open'))
  expect(timeout.status).toBe(201)
  expect(timeout.data.partnerCode ?? null).toBeNull()
  const lifecycle: Array<{ action: string; status: number; elapsedMs: number; state: string; partnerCode: string | null }> = []
  for (const action of ['save', 'send', 'accept', 'process', 'complete', 'inspect', 'confirm']) {
    const result = await call(request, 'post', `${TIMEOUT_API}/slips/${timeout.data.id}/${action}`, headers)
    lifecycle.push({
      action,
      status: result.status,
      elapsedMs: result.elapsedMs,
      state: String(result.data.status),
      partnerCode: result.data.partnerCode ?? null,
    })
  }
  expect(lifecycle.find((row) => row.action === 'send')?.state).toBe('SENT')
  expect(lifecycle.find((row) => row.action === 'confirm')?.state).toBe('CONFIRMED')

  const backfill = await call(request, 'post', `${TIMEOUT_API}/slips`, headers, body('R7 DRAFT TO SENT backfill'))
  expect(backfill.data.partnerCode ?? null).toBeNull()
  await call(request, 'post', `${TIMEOUT_API}/slips/${backfill.data.id}/save`, headers)
  const sent = await call(request, 'post', `${HEAD_API}/slips/${backfill.data.id}/send`, headers)
  expect(sent.data.status).toBe('SENT')
  expect(sent.data.partnerCode).toBe('00')

  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(path.join(SHOTS, 'r7-backend-regression-evidence.json'), JSON.stringify({
    round: 'R7',
    headApi: '127.0.0.1:28206',
    timeoutApi: '127.0.0.1:28207',
    mutation: {
      slipNo: mutation.data.slipNo,
      create: { status: mutation.status, partnerCode: mutation.data.partnerCode },
      samePartner: { status: same.status, partnerCode: same.data.partnerCode },
      partnerOmitted: { status: omitted.status, partnerCode: omitted.data.partnerCode },
      partnerChanged: { status: changed.status, partnerCode: changed.data.partnerCode },
    },
    timeout: { slipNo: timeout.data.slipNo, lifecycle },
    backfill: { slipNo: backfill.data.slipNo, status: sent.data.status, partnerCode: sent.data.partnerCode },
    ids: '<redacted-uuid>',
  }, null, 2), 'utf8')
})
