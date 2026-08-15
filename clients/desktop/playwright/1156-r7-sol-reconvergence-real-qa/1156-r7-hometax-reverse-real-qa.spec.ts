import { expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUTH_API = 'http://127.0.0.1:8081'
const HEAD_API = 'http://127.0.0.1:28206'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1156-r7'))

test('R7 홈택스 실 사용자 경로 입력에서 거래처코드가 사업자번호로 숫자화된다', async ({ request }) => {
  let password: string
  let inspectorPassword: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    inspectorPassword = resolveQaCredential('QA_MASTER_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  const login = await request.post(`${AUTH_API}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(login.status()).toBe(200)
  const session = (await login.json()).data as { userId: string; role: string; groups?: Array<{ id: string }> }
  const headers = {
    'x-user-id': session.userId,
    'x-user-name': 'SOL 5.6 R7',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
  const inspectorLogin = await request.post(`${AUTH_API}/auth/login`, {
    data: { loginId: 'kimeunji', password: inspectorPassword },
  })
  expect(inspectorLogin.status()).toBe(200)
  const inspector = (await inspectorLogin.json()).data as { userId: string; role: string; groups?: Array<{ id: string }> }
  const inspectorHeaders = {
    'x-user-id': inspector.userId,
    'x-user-name': 'SOL 5.6 R7 inspector',
    'x-user-role': inspector.role,
    'x-user-groups': (inspector.groups ?? []).map((group) => group.id).join(','),
  }

  const listed = await request.get(`${HEAD_API}/slips?slipType=OUTBOUND&page=0&size=100`, { headers })
  expect(listed.status()).toBe(200)
  let source = ((await listed.json()).data.content as Array<Record<string, any>>)
    .find((row) => row.memo === 'R7 HOMETAX reverse partnerCode businessNumber')
  if (!source) {
    const inboundList = await request.get(`${HEAD_API}/slips?slipType=INBOUND&status=DRAFT&page=0&size=100`, { headers })
    expect(inboundList.status()).toBe(200)
    const inbound = ((await inboundList.json()).data.content as Array<Record<string, any>>)
      .find((row) => row.memo === 'R7 GUI persistence HEAD partnerCode axis')
    expect(inbound).toBeTruthy()
    const inboundDetail = await request.get(`${HEAD_API}/slips/${inbound!.id}`, { headers })
    expect(inboundDetail.status()).toBe(200)
    const partnerId = (await inboundDetail.json()).data.partnerId
    const created = await request.post(`${HEAD_API}/slips`, { headers, data: {
      slipType: 'OUTBOUND',
      sourceWarehouseId: '11111111-1111-1111-1111-000000000001',
      partnerId,
      partnerName: '(주)서울에어컨',
      memo: 'R7 HOMETAX reverse partnerCode businessNumber',
      lines: [{
        productId: '6fd28b44-f8e5-4e9d-96ba-d4b9ce9fac89',
        productName: '실외기_6HP 단배관', modelName: 'AJ060MXHNBC1', quantity: 1, unitPrice: 808,
      }],
    } })
    const raw = await created.text()
    expect(created.status(), raw).toBe(201)
    source = JSON.parse(raw).data
  }
  let slipResponse = await request.get(`${HEAD_API}/slips/${source!.id}`, { headers })
  expect(slipResponse.status()).toBe(200)
  let slip = (await slipResponse.json()).data as Record<string, any>

  const actionByStatus: Record<string, string> = {
    DRAFT: 'save', SAVED: 'send', SENT: 'accept', ACCEPTED: 'process',
    PROCESSING: 'complete', INSPECTING: 'inspect', COMPLETED: 'ship',
    SHIPPING: 'deliver', DELIVERED: 'confirm',
  }
  const lifecycle: Array<{ action: string; status: number; state: string }> = []
  while (slip.status !== 'CONFIRMED') {
    const action = actionByStatus[String(slip.status)]
    expect(action, `예상하지 못한 상태: ${slip.status}`).toBeTruthy()
    const response = await request.post(`${HEAD_API}/slips/${slip.id}/${action}`, {
      headers: action === 'inspect' ? inspectorHeaders : headers,
    })
    const raw = await response.text()
    expect(response.ok(), raw).toBeTruthy()
    slip = JSON.parse(raw).data
    lifecycle.push({ action, status: response.status(), state: String(slip.status) })
  }

  const query = await request.get(
    `${HEAD_API}/internal/slips/sales-query?from=2026-08-09&to=2026-08-10&page=0&size=200`,
    { headers: { 'X-Internal-Token': 'CHANGE_ME_LOCAL_ONLY' } },
  )
  expect(query.status()).toBe(200)
  const rows = (await query.json()).data.content as Array<Record<string, any>>
  const row = rows.find((candidate) => candidate.slipNo === slip.slipNo)
  expect(row).toBeTruthy()
  expect(row!.partnerCode).toBe('P-2026-0001')
  expect(row!.businessNumber).toBe('113-07-10031')
  const derivedBuyerRegNo = String(row!.partnerCode).replace(/[^0-9]/g, '')
  expect(derivedBuyerRegNo).toBe('20260001')
  expect(derivedBuyerRegNo).not.toBe(String(row!.businessNumber).replace(/[^0-9]/g, ''))

  fs.mkdirSync(SHOTS, { recursive: true })
  fs.writeFileSync(path.join(SHOTS, 'r7-hometax-reverse-evidence.json'), JSON.stringify({
    round: 'R7',
    slipNo: slip.slipNo,
    status: slip.status,
    partnerCode: row!.partnerCode,
    businessNumber: row!.businessNumber,
    currentCodeDerivedBuyerRegNo: derivedBuyerRegNo,
    expectedBuyerRegNo: String(row!.businessNumber).replace(/[^0-9]/g, ''),
    lifecycle,
    salesQuery: { status: query.status(), path: '/internal/slips/sales-query', mock: false },
    ids: '<redacted-uuid>',
  }, null, 2), 'utf8')
})
