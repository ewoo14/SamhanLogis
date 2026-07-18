import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import { getMockResponse, MOCK_AUTH } from './mock'
import type { MonthlyIncomeStatementResponse } from './accounting'
import { querySlips } from './slip'
import {
  createSalesSlipDraft,
  MOCK_SALES_ACCOUNTING_SLIPS,
  type SalesAccountingSlipResponse,
} from './salesAccountingSlipApi'
import {
  createPurchaseSlipDraft,
  MOCK_PURCHASE_ACCOUNTING_SLIPS,
  type PurchaseAccountingSlipResponse,
} from './purchaseAccountingSlipApi'
import { listSlipAllocationSources } from './slipAllocationSourceApi'
import {
  createTaxInvoiceFromSalesSlips,
  registerInboundTaxInvoice,
} from './taxInvoiceAdminApi'
import { listInboundTaxInvoices } from './taxInvoiceInboundApi'

const DOCUMENT_NO_KEY_SET = new Set([
  'slipNo',
  'journalNo',
  'reverseJournalNo',
  'orderNo',
  'estimateNo',
  'taxInvoiceNo',
  'salesSlipNo',
  'purchaseSlipNo',
  'linkedSlipNo',
  'sourceSlipNo',
  'planNo',
  'auditNo',
  'refSlipNo',
  'voucherNo',
  'documentNo',
  'slipNumber',
])

const ALLOWED_NON_DOCUMENT_MARKERS = new Set([
  'SLIP-DISPATCHED',
  'SLIP-UNDISPATCHED',
  '소계',
  'STATUS-F-SLIP',
  ' 2026/05 ',
  '2026/05',
  '05/18-1',
])

type MockEnvelope<T> = {
  success: boolean
  data: T
}

type MockRole = {
  id: string
  documentType?: string
  sequence: number
  label: string
  stepType: 'CREATOR' | 'GROUP' | 'USER'
}

function mockRequest(config: AxiosRequestConfig): unknown {
  return getMockResponse(config)
}

function amount(raw: string | number): number {
  return typeof raw === 'number' ? raw : Number(raw)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('mock 결재양식 optionsJson 정규화', () => {
  it('실 BE와 동일하게 대소문자 변종을 dedup하지 않고 모두 보존한다', () => {
    const response = mockRequest({
      method: 'POST',
      url: '/admin/groupware/approval-templates',
      data: {
        code: 'S4_CASE_VARIANT_OPTIONS',
        name: '대소문자 옵션 검증',
        active: true,
        displayOrder: 999,
        fields: [{
          fieldKey: 'choice',
          label: '선택',
          fieldType: 'SELECT',
          required: true,
          displayOrder: 1,
          optionsJson: '["Apple", "apple", "BANANA", "banana"]',
          placeholder: null,
        }],
      },
    }) as {
      __mockStatus: number
      body: MockEnvelope<{ fields: Array<{ optionsJson: string }> }>
    }

    expect(response.__mockStatus).toBe(201)
    expect(JSON.parse(response.body.data.fields[0]!.optionsJson)).toEqual([
      'Apple',
      'apple',
      'BANANA',
      'banana',
    ])
  })

  it('FE 입력단에서 도달하지 않는 공백은 mock 경계의 로컬 방어로 trim·빈값 제거한다', () => {
    const response = mockRequest({
      method: 'POST',
      url: '/admin/groupware/approval-templates',
      data: {
        code: 'S4_MOCK_DEFENSIVE_OPTIONS',
        name: 'mock 방어 정규화 검증',
        active: true,
        displayOrder: 1000,
        fields: [{
          fieldKey: 'choice',
          label: '선택',
          fieldType: 'SELECT',
          required: true,
          displayOrder: 1,
          optionsJson: '[" Apple ", "", " BANANA "]',
          placeholder: null,
        }],
      },
    }) as {
      __mockStatus: number
      body: MockEnvelope<{ fields: Array<{ optionsJson: string }> }>
    }

    expect(response.__mockStatus).toBe(201)
    expect(JSON.parse(response.body.data.fields[0]!.optionsJson)).toEqual(['Apple', 'BANANA'])
  })
})

describe('mock 그룹웨어 결재 생성 요청 관찰', () => {
  it('POST handler가 받은 approverIds 순서를 QA 캡처에 그대로 보존한다', () => {
    const approverIds = [
      '00000000-0000-0000-0000-000000010003',
      '00000000-0000-0000-0000-000000010002',
    ]

    const response = mockRequest({
      method: 'POST',
      url: '/admin/groupware/approvals',
      data: {
        requesterId: '00000000-0000-0000-0000-000000010001',
        title: '결재자 순서 검증',
        approverIds,
      },
    }) as MockEnvelope<unknown>

    expect(response.success).toBe(true)
    expect((globalThis as unknown as Window)
      .__SAMHAN_MOCK_LAST_GROUPWARE_APPROVAL_CREATE_BODY__?.approverIds).toEqual(approverIds)
  })
})

describe('mock price memory contract', () => {
  it('POST /api/products/lookup 은 운영 BE 와 동일하게 products.list 조회 권한을 요구한다', () => {
    const originalRole = MOCK_AUTH.role
    try {
      MOCK_AUTH.role = 'DISPATCH'
      const denied = mockRequest({
        method: 'POST',
        url: '/api/products/lookup',
        data: { ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040'] },
      }) as { __mockStatus: number; body: { code: string } }

      expect(denied.__mockStatus).toBe(403)
      expect(denied.body.code).toBe('FORBIDDEN')
    } finally {
      MOCK_AUTH.role = originalRole
    }
  })

  it('lookupProductByModelName mock mirrors the BE id/name wire shape', () => {
    const response = mockRequest({
      method: 'GET',
      url: '/slips/lookup-product',
      params: { modelName: 'AJ040RXH4BC1' },
    }) as MockEnvelope<Record<string, unknown>>

    expect(response.data).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040',
      name: '시스템에어컨 4Way 4HP',
      modelName: 'AJ040RXH4BC1',
    })
    expect(response.data).not.toHaveProperty('productId')
    expect(response.data).not.toHaveProperty('productName')
  })

  it('single/bulk price memory handlers preserve hit-only partial response semantics', () => {
    const partnerA = '11111111-1111-4111-8111-111111111111'
    const partnerB = '22222222-2222-4222-8222-222222222222'
    const productA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040'
    const productB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb010'
    const single = mockRequest({
      method: 'GET',
      url: '/slips/price-memory',
      params: {
        partnerId: partnerA,
        productId: productA,
      },
    }) as MockEnvelope<{ unitPrice: number; updatedAt: string }>
    // R6-M3: updatedAt 은 실 wire(LocalDateTime, 오프셋 없음) 형식 — mock 값 형식도 BE parity.
    expect(single.data).toMatchObject({ unitPrice: 2035000, updatedAt: '2026-05-04T10:30:00' })
    expect(single.data.updatedAt).not.toMatch(/[+Z]/)

    const bulk = mockRequest({
      method: 'POST',
      url: '/slips/price-memory/bulk',
      data: {
        partnerId: partnerA,
        productIds: [productA, productB],
      },
    }) as MockEnvelope<Array<{ productId: string; unitPrice: number }>>
    expect(bulk.data).toEqual([
      expect.objectContaining({ productId: productA, unitPrice: 2035000 }),
    ])

    const isolatedMiss = mockRequest({
      method: 'GET',
      url: '/slips/price-memory',
      params: { partnerId: partnerB, productId: productA },
    }) as { __mockStatus: number; body: null }
    expect(isolatedMiss).toEqual({ __mockStatus: 204, body: null })
  })

  it.each([
    ['single missing partnerId', { method: 'GET', url: '/slips/price-memory', params: { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040' } }],
    ['single invalid product UUID', { method: 'GET', url: '/slips/price-memory', params: { partnerId: '11111111-1111-4111-8111-111111111111', productId: 'not-uuid' } }],
    ['bulk empty products', { method: 'POST', url: '/slips/price-memory/bulk', data: { partnerId: '11111111-1111-4111-8111-111111111111', productIds: [] } }],
    ['bulk over 100 products', { method: 'POST', url: '/slips/price-memory/bulk', data: { partnerId: '11111111-1111-4111-8111-111111111111', productIds: Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`) } }],
  ])('%s mirrors the real wire validation', (_name, config) => {
    const response = mockRequest(config) as { __mockStatus: number; body: { code: string } }
    expect(response.__mockStatus).toBe(400)
    expect(response.body.code).toBe('INVALID_INPUT')
  })

  it('version-less admin partner ids pass lenient UUID validation and reach the memory row', () => {
    // R6-M3: 실 BE 는 UUID 타입 바인딩(version/variant 미검증)이라 MOCK_ADMIN_PARTNERS 의
    // version-less id 도 200/204 다 — RFC-4122 version 강제는 mock 전용 400 을 만들어
    // 폼이 조용히 CATALOG 폴백하는 mock 회귀(false-green)를 낳았다. 거래처 검색 경로
    // (엘에이시스템에어 id)로 기억행이 도달하는지까지 함께 가드한다.
    const adminPartnerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const productA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040'

    const single = mockRequest({
      method: 'GET',
      url: '/slips/price-memory',
      params: { partnerId: adminPartnerId, productId: productA },
    }) as MockEnvelope<{ unitPrice: number; updatedAt: string }>
    expect(single.data).toMatchObject({ unitPrice: 2035000, updatedAt: '2026-05-04T10:30:00' })

    const bulk = mockRequest({
      method: 'POST',
      url: '/slips/price-memory/bulk',
      data: { partnerId: adminPartnerId, productIds: [productA] },
    }) as MockEnvelope<Array<{ productId: string; unitPrice: number }>>
    expect(bulk.data).toEqual([
      expect.objectContaining({ productId: productA, unitPrice: 2035000 }),
    ])

    // version-less 여도 대시 5그룹 형태가 아니면 여전히 400 (형태 자체 오류).
    const malformed = mockRequest({
      method: 'GET',
      url: '/slips/price-memory',
      params: { partnerId: 'aaaaaaaa-aaaa-aaaa-aaaa', productId: productA },
    }) as { __mockStatus: number; body: { code: string } }
    expect(malformed.__mockStatus).toBe(400)
    expect(malformed.body.code).toBe('INVALID_INPUT')
  })

  // [R8-FE-7] GET 과 POST 는 바인딩 경로가 달라 관대함이 다르다 — 하나의 regex 로 兼用하면
  // GET 이 실 wire 보다 엄격해진다. 라이브 실측: `partnerId=1-1-1-1-1` → 실 API 204 / mock 400.
  it('mock UUID validation matches each binding path: GET lenient (UUID.fromString) vs POST strict (Jackson)', () => {
    const shorthand = '1-1-1-1-1'
    const productA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa040'

    // GET `@RequestParam UUID` → Spring 이 UUID.fromString 호출 = 관대. 축약형을
    // 00000001-0001-0001-0001-000000000001 로 받아들이므로 400 이 아니라 **204(miss)** 여야 한다.
    const lenientGet = mockRequest({
      method: 'GET',
      url: '/slips/price-memory',
      params: { partnerId: shorthand, productId: productA },
    }) as { __mockStatus: number; body: null }
    expect(lenientGet.__mockStatus).toBe(204)

    // POST `@RequestBody` → Jackson UUIDDeserializer = 엄격(canonical 36자만). 400 이 정답이다.
    const strictPost = mockRequest({
      method: 'POST',
      url: '/slips/price-memory/bulk',
      data: { partnerId: shorthand, productIds: [productA] },
    }) as { __mockStatus: number; body: { code: string } }
    expect(strictPost.__mockStatus).toBe(400)
    expect(strictPost.body.code).toBe('INVALID_INPUT')

    // 축약형 productId 도 같은 비대칭을 따른다.
    const lenientGetProduct = mockRequest({
      method: 'GET',
      url: '/slips/price-memory',
      params: { partnerId: '11111111-1111-4111-8111-111111111111', productId: shorthand },
    }) as { __mockStatus: number }
    expect(lenientGetProduct.__mockStatus).toBe(204)
    const strictPostProduct = mockRequest({
      method: 'POST',
      url: '/slips/price-memory/bulk',
      data: { partnerId: '11111111-1111-4111-8111-111111111111', productIds: [shorthand] },
    }) as { __mockStatus: number }
    expect(strictPostProduct.__mockStatus).toBe(400)
  })

  // R6-H2: 전표 복사 서버 endpoint(POST /slips/{id}/duplicate) mock 이 새 계약을 미러하는지 가드.
  it('slip duplicate mock mirrors the server-copy contract (new DRAFT + today + verbatim lines)', () => {
    const now = new Date()
    const [yyyy, mm, dd] = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ]
    const raw = mockRequest({
      method: 'POST',
      url: '/slips/slip-001/duplicate',
    }) as { __mockStatus: number; body: MockEnvelope<{
      id: string
      slipNo: string
      slipDate: string
      status: string
      lines: Array<{
        id: string
        productId: string
        quantity: number
        unitPrice: string
        setHead: boolean
        parentSetModel: string | null
      }>
    }> }

    // [R8-FE-5] BE 는 @ResponseStatus(HttpStatus.CREATED) — envelope() 기본 200 은 계약 위반이었다.
    expect(raw.__mockStatus).toBe(201)
    const response = raw.body
    expect(response.data.id).not.toBe('slip-001')
    expect(response.data.status).toBe('DRAFT')
    expect(response.data.slipDate).toBe(`${yyyy}-${mm}-${dd}`)
    // 전표번호 슬래시 yyyy/MM/dd-N 신규 채번 (feedback_slip_order_number_format)
    expect(response.data.slipNo).toBe(`${yyyy}/${mm}/${dd}-99`)

    // [R8-FE-5] 🔴 종전 단언은 `lines.length > 0` 한 줄이었다 — 테스트명이 "verbatim lines" 라고
    // 주장하면서 실제로는 세트 계보를 전혀 보지 않아, 계보를 파괴하는 복사도 통과시켰다
    // (H2 원결함이 mock gate 통과).
    //
    // ⚠️ 정직 고지: 현재 duplicate mock 과 GET 상세는 같은 SAMPLE_LINES 참조를 반환하므로
    // 아래 toEqual 은 지금은 자명하게 참이다. 이 단언의 값은 "미래 회귀 차단" 에 있다 —
    // duplicate mock 이 라인을 재조립하는 순간(R4-F2 의 /1.1 재분리 패턴, H2 의 FE 재조립 패턴)
    // 즉시 RED 가 된다. 계보를 실제로 검증하는 건 그 아래 단언들이다.
    const source = mockRequest({
      method: 'GET',
      url: '/slips/slip-001',
    }) as MockEnvelope<{ lines: Array<Record<string, unknown>> }>
    expect(response.data.lines).toEqual(source.data.lines)

    // 계보가 fixture 에 실제로 존재하는지 — 이 단언이 없으면 위 toEqual 이 "둘 다 계보 없음" 으로
    // 공허하게 참이 된다(R8-FE-5 의 원인 그 자체).
    const head = response.data.lines.find((line) => line.setHead)
    expect(head).toBeDefined()
    expect(head!.parentSetModel).toBeTruthy()
    const component = response.data.lines.find(
      (line) => !line.setHead && line.parentSetModel === head!.parentSetModel,
    )
    expect(component).toBeDefined()
    expect(response.data.lines.some((line) => line.parentSetModel === null)).toBe(true)
  })

  // [R8-FE-4] duplicate mock 이 권한을 검사하는지 — 종전엔 mockRequirePermission() 이 존재함에도
  // duplicate 분기에서 호출되지 않아, 생성 권한 없는 역할도 복사에 성공(200)하고 실 BE 만 403 이었다.
  it('slip duplicate mock enforces create permission like the real backend (R8-FE-4)', () => {
    const originalRole = MOCK_AUTH.role
    try {
      // WAREHOUSE 는 sales.slip.create 미보유 → BE checkCreatePermission 이 403.
      MOCK_AUTH.role = 'WAREHOUSE'
      const denied = mockRequest({
        method: 'POST',
        url: '/slips/slip-001/duplicate',
      }) as { __mockStatus: number; body: { code: string } }
      expect(denied.__mockStatus).toBe(403)
      expect(denied.body.code).toBe('FORBIDDEN')

      // 404 는 403 보다 우선한다 — BE 가 resolveSlipType(id) 를 먼저 호출하므로,
      // 권한 없는 역할이 타 전표의 존재 여부를 403/404 차이로 탐지할 수 없다.
      const missing = mockRequest({
        method: 'POST',
        url: '/slips/no-such-slip/duplicate',
      }) as { __mockStatus: number; body: { code: string } }
      expect(missing.__mockStatus).toBe(404)

      // 생성 권한 보유 역할은 통과.
      MOCK_AUTH.role = 'SALES'
      const allowed = mockRequest({
        method: 'POST',
        url: '/slips/slip-001/duplicate',
      }) as { __mockStatus: number }
      expect(allowed.__mockStatus).toBe(201)
    } finally {
      MOCK_AUTH.role = originalRole
    }
  })

  it('slip duplicate mock returns 404 for a missing source', () => {
    const response = mockRequest({
      method: 'POST',
      url: '/slips/no-such-slip/duplicate',
    }) as { __mockStatus: number; body: { code: string } }

    expect(response.__mockStatus).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('mockEstimateDetail_partnerIdIsUuidAndEnablesPriceMemoryLookup', () => {
    const list = mockRequest({
      method: 'GET',
      url: '/api/v1/slips/estimates?page=0&size=20',
    }) as MockEnvelope<{ content: Array<{ id: string; partnerId: string }> }>
    const detail = mockRequest({
      method: 'GET',
      url: '/api/v1/slips/estimates/est-001',
    }) as MockEnvelope<{ partnerId: string }>
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    expect(list.data.content.find((row) => row.id === 'est-001')?.partnerId).toMatch(uuid)
    expect(detail.data.partnerId).toMatch(uuid)
    expect(detail.data.partnerId).toBe(
      list.data.content.find((row) => row.id === 'est-001')?.partnerId,
    )
  })
})

describe('mock journal cash receipt contract', () => {
  it('입금보고서 자동 분개는 post mock 은 허용하고 reverse mock 만 409로 차단한다', () => {
    const posted = mockRequest({
      method: 'POST',
      url: '/accounting/journals/jv-006/post',
    }) as MockEnvelope<{ status: string; sourceType: string }>

    expect(posted.data.status).toBe('POSTED')
    expect(posted.data.sourceType).toBe('CASH_RECEIPT')

    const reversed = mockRequest({
      method: 'POST',
      url: '/accounting/journals/jv-006/reverse',
      data: { reason: '취소' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string; message: string } }

    expect(reversed.__mockStatus).toBe(409)
    expect(reversed.body.code).toBe('CONFLICT')
    expect(reversed.body.message).toContain('입금보고서 자동 분개는 원장에서 직접 역분개할 수 없습니다')
  })
})

describe('mock 주문 목록 soft-delete parity (#757 STEP4 FE)', () => {
  // BE parity: includeDeleted 는 내부 관리자 opt-in — 미요청 시 활성행만(@SQLRestriction 모사),
  // 요청 시 삭제행 + deletedByName 포함. mock.ts 리팩터가 이 계약을 조용히 깨면 데모/오프라인 모드의
  // 취소선/복원 UI 가 회귀하므로 실 mock 핸들러로 고정한다(신규 리스트 로직 회귀망 공백 해소).
  type OrderRow = {
    orderNumber: string
    status: string
    totalAmount: number
    isDeleted?: boolean
    deletedAt?: string | null
    deletedByName?: string | null
  }
  const listOrders = (params: Record<string, unknown>): OrderRow[] => {
    const res = mockRequest({
      method: 'GET',
      url: '/api/v1/partner-orders',
      params,
    }) as MockEnvelope<{ content: OrderRow[] }>
    return res.data.content
  }

  it('includeDeleted 미요청(기본) 시 삭제행을 제외한다 (활성 전용)', () => {
    const rows = listOrders({ status: 'DRAFT' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.isDeleted !== true)).toBe(true)
    expect(rows.some((r) => r.orderNumber === '2026/05/31-5')).toBe(false)
  })

  it('includeDeleted=true 시 삭제행을 deletedByName·deletedAt 과 함께 포함한다', () => {
    const rows = listOrders({ status: 'DRAFT', includeDeleted: true })
    const deleted = rows.find((r) => r.orderNumber === '2026/05/31-5')
    expect(deleted).toBeDefined()
    expect(deleted?.isDeleted).toBe(true)
    expect(deleted?.deletedByName).toBe('오병승')
    expect(deleted?.deletedAt).toBeTruthy()
    // 상태·합계 parity — 삭제됐어도 원래 값 보존(중립 배지는 FE 렌더 책임).
    expect(deleted?.status).toBe('DRAFT')
    expect(deleted?.totalAmount).toBe(980000)
  })

  it('includeDeleted=true 여도 활성행은 삭제 메타(deletedByName)가 비어 있다', () => {
    const rows = listOrders({ status: 'DRAFT', includeDeleted: true })
    const active = rows.filter((r) => r.orderNumber !== '2026/05/31-5')
    expect(active.length).toBeGreaterThan(0)
    expect(active.every((r) => r.isDeleted !== true)).toBe(true)
    expect(active.every((r) => r.deletedByName == null)).toBe(true)
  })
})

describe('mock manual journal contract', () => {
  it('GET /admin/partners/search exposes partnerId as payload-only UUID', () => {
    const adminSearch = mockRequest({
      method: 'GET',
      url: '/admin/partners/search',
      params: { q: '엘에이' },
    }) as MockEnvelope<{ items: Array<Record<string, unknown>> }>

    expect(adminSearch.data.items.length).toBeGreaterThan(0)
    expect(adminSearch.data.items[0]).toMatchObject({
      partnerCode: '1234567890',
      name: '엘에이시스템에어',
    })
    // partnerId 는 화면 표시 금지, hidden state/API payload 전용 UUID 다.
    expect(adminSearch.data.items[0]).toHaveProperty('partnerId')
    expect(adminSearch.data.items[0]?.partnerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('POST /accounting/journals 는 BE DTO 필드명으로 라인을 저장하고 partnerId 는 partnerName 으로 enrich 한다', () => {
    const partnerSearch = mockRequest({
      method: 'GET',
      url: '/accounting/partners/search',
      params: { q: '엘에이', limit: 5 },
    }) as MockEnvelope<Array<{ partnerId: string; partnerCode: string; name: string }>>

    expect(partnerSearch.data[0]).toMatchObject({
      partnerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      partnerCode: '1234567890',
      name: '엘에이시스템에어',
    })

    const created = mockRequest({
      method: 'POST',
      url: '/accounting/journals',
      data: {
        journalDate: '2026-05-04',
        description: '수동 분개',
        lines: [
          {
            accountCode: '101',
            debitAmount: '1000',
            creditAmount: '0',
            partnerId: partnerSearch.data[0]?.partnerId,
            memo: '입금 메모',
          },
          {
            accountCode: '401',
            debitAmount: '0',
            creditAmount: '1000',
            partnerId: null,
          },
        ],
      },
    }) as MockEnvelope<{
      totalDebit: string
      totalCredit: string
      lines: Array<Record<string, unknown>>
    }>

    expect(created.data.totalDebit).toBe('1000')
    expect(created.data.totalCredit).toBe('1000')
    expect(created.data.lines[0]).toMatchObject({
      accountCode: '101',
      debitAmount: '1000',
      creditAmount: '0',
      partnerName: '엘에이시스템에어',
      memo: '입금 메모',
    })
    expect(created.data.lines[0]).not.toHaveProperty('debit')
    expect(created.data.lines[0]).not.toHaveProperty('credit')
    expect(created.data.lines[0]).not.toHaveProperty('note')
    expect(created.data.lines[0]).not.toHaveProperty('partnerId')
  })
})

describe('mock cash receipt list contract', () => {
  it('GET /accounting/cash-receipts 는 Page envelope 와 3종 kind 샘플을 반환하고 UUID/사업자번호 표시 필드는 필터 외 화면에서 쓰지 않는다', () => {
    const page = mockRequest({
      method: 'GET',
      url: '/accounting/cash-receipts',
      params: { page: 0, size: 20 },
    }) as MockEnvelope<{
      content: Array<Record<string, unknown>>
      totalElements: number
      totalPages: number
      number: number
      size: number
    }>

    expect(page.success).toBe(true)
    expect(page.data.number).toBe(0)
    expect(page.data.size).toBe(20)
    expect(page.data.totalElements).toBeGreaterThanOrEqual(3)
    expect(new Set(page.data.content.map((row) => row.kind))).toEqual(
      new Set(['DEPOSIT_REPORT', 'MANUAL_RECEIPT', 'BANK_LINKED']),
    )
    expect(page.data.content[0]).toMatchObject({
      slipNo: expect.any(String),
      partnerCode: expect.any(String),
      partnerName: expect.any(String),
      amount: expect.any(String),
      transactionDate: expect.any(String),
      journalNo: expect.any(String),
    })
  })

  it('GET /accounting/cash-receipts mock seed 금액은 BE 생성 검증처럼 0보다 크다', () => {
    const page = mockRequest({
      method: 'GET',
      url: '/accounting/cash-receipts',
      params: { page: 0, size: 50 },
    }) as MockEnvelope<{
      content: Array<{ slipNo: string; amount: string }>
    }>

    const invalidSlipNos = page.data.content
      .filter((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0)
      .map((row) => row.slipNo)

    expect(invalidSlipNos).toEqual([])
  })

  it('GET /accounting/cash-receipts mock seed 전표번호·분개번호는 BE 채번 형식(yyyy/MM/dd-N)을 따른다', () => {
    const page = mockRequest({
      method: 'GET',
      url: '/accounting/cash-receipts',
      params: { page: 0, size: 50 },
    }) as MockEnvelope<{
      content: Array<{ slipNo: string; journalNo: string | null }>
    }>

    // SlipNumberService/JournalNumberService = yyyy/MM/dd-N 슬래시, seq 선행 0 금지.
    const SLIP_FMT = /^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/
    const badSlip = page.data.content
      .filter((row) => !SLIP_FMT.test(row.slipNo))
      .map((row) => row.slipNo)
    const badJournal = page.data.content
      .filter((row) => row.journalNo != null && !SLIP_FMT.test(row.journalNo))
      .map((row) => row.journalNo)

    expect(badSlip).toEqual([])
    expect(badJournal).toEqual([])
  })

  it('partnerName/slipNo/kind/from/to/status 필터와 페이지네이션을 적용한다', () => {
    const filtered = mockRequest({
      method: 'GET',
      url: '/accounting/cash-receipts',
      params: {
        partnerName: '한빛',
        slipNo: '05/18-1',
        kind: 'MANUAL_RECEIPT',
        from: '2026-05-18',
        to: '2026-05-18',
        status: 'CONFIRMED',
        page: 0,
        size: 1,
      },
    }) as MockEnvelope<{
      content: Array<Record<string, unknown>>
      totalElements: number
      totalPages: number
      number: number
      size: number
      first: boolean
      last: boolean
    }>

    expect(filtered.data).toMatchObject({
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 1,
      first: true,
      last: true,
    })
    expect(filtered.data.content).toEqual([
      expect.objectContaining({
        slipNo: '2026/05/18-1',
        partnerName: '한빛상사',
        kind: 'MANUAL_RECEIPT',
        transactionDate: '2026-05-18',
        status: 'CONFIRMED',
      }),
    ])
  })
})

describe('mock business document number contract', () => {
  const DOCUMENT_NO_FMT = /^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/
  const OLD_PREFIX_FMT = /[A-Z]{2,}-20[0-9]{6}-/

  it('전표·분개·세금계산서 mock 번호는 BE 채번 형식과 seq 선행 0 금지를 따른다', async () => {
    vi.stubEnv('VITE_MOCK_MODE', '1')
    vi.spyOn(Date, 'now').mockReturnValue(1770000000001)

    const cashReceipts = mockRequest({
      method: 'GET',
      url: '/accounting/cash-receipts',
      params: { page: 0, size: 50 },
    }) as MockEnvelope<{
      content: Array<{ slipNo: string; journalNo: string | null }>
    }>
    const taxInvoicePage = mockRequest({
      method: 'GET',
      url: '/accounting/tax-invoices',
      params: { page: 0, size: 20 },
    }) as MockEnvelope<{
      content: Array<{ taxInvoiceNo: string | null }>
    }>
    const issuedTaxInvoice = mockRequest({
      method: 'POST',
      url: '/accounting/tax-invoices/ti-002/issue',
    }) as MockEnvelope<{ taxInvoiceNo: string }>

    const salesDraft = await createSalesSlipDraft({
      slipDate: '2026-05-20',
      partnerId: 'partner-sales',
      partnerCode: 'P-10021',
      partnerName: '삼한물류 안산센터',
      taxType: 'TAXABLE',
      lines: [],
    })
    const purchaseDraft = await createPurchaseSlipDraft({
      slipDate: '2026-05-20',
      partnerId: 'partner-purchase',
      partnerCode: 'V-30011',
      partnerName: '한빛포장',
      taxType: 'TAXABLE',
      lines: [],
    })
    const salesTaxInvoice = await createTaxInvoiceFromSalesSlips({
      salesSlipIds: [MOCK_SALES_ACCOUNTING_SLIPS[0]!.slipNo],
      issuedDate: '2026-05-20',
    })
    const inboundTaxInvoice = await registerInboundTaxInvoice({
      purchaseSlipIds: [MOCK_PURCHASE_ACCOUNTING_SLIPS[0]!.slipNo],
      issuedDate: '2026-05-20',
    })
    const inboundTaxInvoices = await listInboundTaxInvoices({
      from: '2026-05-20',
      to: '2026-05-20',
    })

    const collectedNos = [
      ...cashReceipts.data.content.flatMap((row) => [row.slipNo, row.journalNo].filter((v): v is string => v != null)),
      ...taxInvoicePage.data.content.map((row) => row.taxInvoiceNo).filter((v): v is string => v != null),
      issuedTaxInvoice.data.taxInvoiceNo,
      ...MOCK_SALES_ACCOUNTING_SLIPS.map((row) => row.slipNo),
      ...MOCK_PURCHASE_ACCOUNTING_SLIPS.map((row) => row.slipNo),
      salesDraft.slipNo,
      purchaseDraft.slipNo,
      salesTaxInvoice.taxInvoiceNo,
      inboundTaxInvoice.taxInvoiceNo,
      ...inboundTaxInvoices.map((row) => row.taxInvoiceNo),
    ]

    expect(collectedNos.filter((value) => !DOCUMENT_NO_FMT.test(value))).toEqual([])
    expect(collectedNos.filter((value) => OLD_PREFIX_FMT.test(value))).toEqual([])
  })

  it('매출·매입전표 allocation sourceSlipNo 는 source API slipNo 와 cross-file 일치한다', async () => {
    vi.stubEnv('VITE_MOCK_MODE', '1')

    const outboundSources = await listSlipAllocationSources({
      type: 'OUTBOUND',
      from: '2026-05-20',
      to: '2026-05-20',
    })
    const inboundSources = await listSlipAllocationSources({
      type: 'INBOUND',
      from: '2026-05-20',
      to: '2026-05-20',
    })

    const salesAllocationNos = allocationNos(MOCK_SALES_ACCOUNTING_SLIPS)
    const purchaseAllocationNos = allocationNos(MOCK_PURCHASE_ACCOUNTING_SLIPS)

    expect(salesAllocationNos.filter((value) => !DOCUMENT_NO_FMT.test(value))).toEqual([])
    expect(purchaseAllocationNos.filter((value) => !DOCUMENT_NO_FMT.test(value))).toEqual([])
    expect(new Set(salesAllocationNos)).toEqual(new Set(outboundSources.map((row) => row.slipNo)))
    expect(new Set(purchaseAllocationNos)).toEqual(new Set(inboundSources.map((row) => row.slipNo)))
  })

  it('ledger and statement mock endpoints use BE document number format', () => {
    const ledgers = mockRequest({
      method: 'GET',
      url: '/accounting/ledgers',
      params: { from: '2026-06-01', to: '2026-06-30' },
    })
    const partnerLedger = mockRequest({
      method: 'GET',
      url: '/accounting/journals/ledger-data',
      params: { from: '2026-04-01', to: '2026-04-30' },
    })
    const statementBatch = mockRequest({
      method: 'GET',
      url: '/accounting/statements/batch-data',
      params: { from: '2026-04-01', to: '2026-04-30' },
    })

    const collectedNos = [
      ...collectDocumentNumberValues(ledgers),
      ...collectDocumentNumberValues(partnerLedger),
      ...collectDocumentNumberValues(statementBatch),
    ]

    expect(collectedNos.filter((value) => !DOCUMENT_NO_FMT.test(value))).toEqual([])
    expect(collectedNos.filter((value) => OLD_PREFIX_FMT.test(value))).toEqual([])
  })

  it('renderer document-number field literals use standard format or explicit markers', () => {
    const rendererRoot = join(process.cwd(), 'src', 'renderer')
    const fieldPattern = Array.from(DOCUMENT_NO_KEY_SET).join('|')
    const literalPattern = new RegExp(`\\b(${fieldPattern}): *'([^']+)'`, 'g')
    const violations = listRendererSourceFiles(rendererRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return Array.from(source.matchAll(literalPattern))
        .map((match) => ({
          file: relative(process.cwd(), file).replace(/\\/g, '/'),
          field: match[1]!,
          value: match[2]!,
        }))
        .filter(({ value }) => !DOCUMENT_NO_FMT.test(value))
        .filter(({ value }) => !ALLOWED_NON_DOCUMENT_MARKERS.has(value))
    })

    expect(violations).toEqual([])
  })
})

function collectDocumentNumberValues(value: unknown): string[] {
  const values: string[] = []

  function visit(current: unknown): void {
    if (Array.isArray(current)) {
      current.forEach(visit)
      return
    }
    if (current == null || typeof current !== 'object') {
      return
    }
    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      if (DOCUMENT_NO_KEY_SET.has(key) && typeof entry === 'string') {
        values.push(entry)
      }
      visit(entry)
    }
  }

  visit(value)
  return values
}

function listRendererSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      return listRendererSourceFiles(fullPath)
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return []
    }
    return [fullPath]
  })
}

function allocationNos(
  rows: Array<SalesAccountingSlipResponse | PurchaseAccountingSlipResponse>,
): string[] {
  return rows.flatMap((row) =>
    row.lines.flatMap((line) => line.allocations.map((allocation) => allocation.sourceSlipNo)),
  )
}

describe('mock approval-line-config contract', () => {
  it('GROUPWARE 기본 결재자 resolve 는 USER 결재자만 sequence 순으로 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/auth/approval-line-configs/GROUPWARE_EXPENSE_REPORT/default-approvers',
    }) as MockEnvelope<Array<{ sequence: number; label: string; userId: string; displayName: string }>>

    expect(resolved.data).toEqual([
      { sequence: 2, label: '대표', userId: 'user-008', displayName: '정매니저' },
    ])
  })

  it('미설정 GROUPWARE 기본 결재자는 빈 배열을 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/auth/approval-line-configs/GROUPWARE_LEAVE_REQUEST/default-approvers',
    }) as MockEnvelope<unknown[]>

    expect(resolved.data).toEqual([])
  })

  it('GROUPWARE 결재 생성은 config 단계 뒤에 override 결재자를 추가한다', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/admin/groupware/approvals',
      data: {
        requesterId: 'user-003',
        title: `A2-G2 mock ${Date.now()}`,
        content: '본문',
        templateId: '77777777-dddd-4ddd-8ddd-000000000001',
        fieldValues: {
          expenseItem: '테스트',
          amount: '1000',
          accountCode: '소모품비',
          expenseDate: '2026-06-29',
        },
        approverIds: ['00000000-0000-0000-0000-000000010004'],
      },
    }) as MockEnvelope<{ steps: Array<Record<string, unknown>> }>

    expect(created.data.steps.map((step) => step.stepType)).toEqual(['USER', 'GROUP', 'USER', 'USER'])
    expect(created.data.steps[0]).toMatchObject({
      approverId: 'user-003',
      stepType: 'USER',
    })
    expect(created.data.steps[1]).toMatchObject({
      approverGroupId: '00000000-0000-0000-0000-000000000101',
      approverName: null,
    })
    expect(created.data.steps[2]).toMatchObject({
      approverId: 'user-008',
      approverName: '정매니저',
    })
    expect(created.data.steps[2]?.approverId).not.toBe(created.data.steps[0]?.approverId)
    expect(created.data.steps[3]).toMatchObject({
      approverId: '00000000-0000-0000-0000-000000010004',
      approverName: '박배차',
    })
  })

  it('GROUPWARE 문서의 sequence 0 GROUP 단계는 삭제할 수 있다', () => {
    const documentType = `GROUPWARE_TEST_${Date.now()}`
    const created = mockRequest({
      method: 'POST',
      url: '/auth/admin/approval-line-configs',
      data: { documentType, label: '검토자' },
    }) as MockEnvelope<MockRole>

    expect(created.data).toMatchObject({
      sequence: 0,
      label: '검토자',
      stepType: 'GROUP',
    })

    const deleted = mockRequest({
      method: 'DELETE',
      url: `/auth/admin/approval-line-configs/${encodeURIComponent(created.data.id)}`,
    }) as MockEnvelope<null>

    expect(deleted.success).toBe(true)
    expect(deleted.data).toBeNull()
  })

  it('전표 CREATOR 단계 삭제는 계속 거부한다', () => {
    const deleted = mockRequest({
      method: 'DELETE',
      url: '/auth/admin/approval-line-configs/mock-approval-line-slip-outbound-creator',
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string; message: string } }

    expect(deleted.__mockStatus).toBe(400)
    expect(deleted.body.code).toBe('INVALID_INPUT')
    expect(deleted.body.message).toContain('작성자 역할은 삭제할 수 없습니다')
  })
})

describe('mock slip redline contract', () => {
  it('임계통과 전표는 다층 redline fields 를 반환하고 UUID 원문은 노출하지 않는다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/api/v1/slips/slip-006/redline',
    }) as MockEnvelope<{
      anchored: boolean
      fields: Array<{ fieldPath: string; label: string; layers: Array<{ value: string | null; actorName: string | null }> }>
    }>

    expect(resolved.data.anchored).toBe(true)
    const memo = resolved.data.fields.find((field) => field.fieldPath === 'header.memo')
    expect(memo?.layers.map((layer) => layer.value)).toEqual(['임계 통과 원본 메모', '1차 수정 메모', '2차 수정 메모'])
    expect(JSON.stringify(resolved.data)).not.toContain('00000000-0000-0000-0000-000000000677')
  })

  it('드래프트 전표는 anchored=false 와 빈 fields 를 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/api/v1/slips/slip-001/redline',
    }) as MockEnvelope<{ anchored: boolean; fields: unknown[] }>

    expect(resolved.data).toEqual({ anchored: false, fields: [] })
  })

  it('redline에 라인 셀 fields(VAT포함 단가)가 포함된다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/api/v1/slips/slip-006/redline',
    }) as MockEnvelope<{ fields: Array<{ fieldPath: string; layers: Array<{ value: string | null }> }> }>

    const unitPrice = resolved.data.fields.find((field) => field.fieldPath === 'lines[0].unitPrice')
    expect(resolved.data.fields.some((field) => field.fieldPath === 'lines[0].quantity')).toBe(true)
    expect(unitPrice?.layers.map((layer) => layer.value)).toEqual(['1815000', '2035000'])
  })
})

describe('mock monthly income statement contract', () => {
  it('실 BE 월별손익분석 행 순서와 영업외손익 소계 자기정합을 유지한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/accounting/reports/income-statement/monthly',
      params: { year: 2027 },
    }) as MockEnvelope<MonthlyIncomeStatementResponse>

    const rows = resolved.data.rows

    expect(rows.map((row) => row.accountName)).toEqual([
      '상품매출',
      '매출액 합계',
      '상품매출원가',
      '매출원가 합계',
      '매출총이익',
      '직원급여(판)',
      '판매비와관리비 합계',
      '영업이익',
      '이자비용',
      '영업외손익 합계',
      '법인세차감전순이익',
      '법인세비용',
      '당기순이익',
    ])

    const nonOperatingAccounts = rows.filter((row) => row.section === 'NON_OPERATING' && row.rowKind === 'ACCOUNT')
    const nonOperatingSubtotal = rows.find((row) => row.accountName === '영업외손익 합계')

    expect(nonOperatingSubtotal).toMatchObject({
      rowKind: 'SUBTOTAL',
      section: 'NON_OPERATING',
      accountCode: null,
      category: null,
      sortOrder: 9899,
    })

    const expectedMonthly = resolved.data.months.map((_, index) =>
      nonOperatingAccounts.reduce((sum, row) => sum + amount(row.monthlyAmounts[index] ?? 0), 0),
    )

    expect(nonOperatingSubtotal?.monthlyAmounts.map(amount)).toEqual(expectedMonthly)
    expect(amount(nonOperatingSubtotal?.annualTotal ?? 0)).toBe(
      expectedMonthly.reduce((sum, value) => sum + value, 0),
    )
    expect(amount(nonOperatingSubtotal?.priorYearTotal ?? 0)).toBe(
      nonOperatingAccounts.reduce((sum, row) => sum + amount(row.priorYearTotal), 0),
    )
    expect(amount(nonOperatingSubtotal?.difference ?? 0)).toBe(
      amount(nonOperatingSubtotal?.annualTotal ?? 0) - amount(nonOperatingSubtotal?.priorYearTotal ?? 0),
    )
  })
})

describe('mock slip query edit history contract', () => {
  it('판매/구매조회 mock 은 querySlips params 경로로 상태의존 전표수정내역 카운트 룰을 반영한다', async () => {
    vi.stubEnv('VITE_MOCK_MODE', '1')
    const baseOptions = {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      page: 0,
      size: 50,
    } as const

    const outbound = await querySlips({ ...baseOptions, slipType: 'OUTBOUND' })
    const inbound = await querySlips({ ...baseOptions, slipType: 'INBOUND' })
    const inboundPage = await querySlips({ ...baseOptions, slipType: 'INBOUND', page: 1, size: 3 })
    const searched = await querySlips({
      ...baseOptions,
      slipType: 'OUTBOUND',
      searchSlipNo: '2026/05/10-1',
    })

    for (const row of outbound.content) {
      if (['DRAFT', 'SAVED', 'SENT', 'ACCEPTED', 'PROCESSING', 'INSPECTING', 'REJECTED', 'CANCELED'].includes(row.status)) {
        expect(row.editHistoryCount).toBe(0)
      }
    }
    for (const row of inbound.content) {
      if (['DRAFT', 'SAVED', 'REJECTED', 'CANCELED'].includes(row.status)) {
        expect(row.editHistoryCount).toBe(0)
      }
    }

    // 양방향 잠금(false-green 방지): 빈 결과 공허통과 차단 + 임계통과 행은 편집 시 N건 표시 가능해야 한다.
    // (전 행을 0 으로 만들면 'N건' 렌더 경로 mock 이 소실되는데 단방향 단언만으론 green 통과 — N1 보강)
    expect(outbound.content.length).toBeGreaterThan(0)
    expect(inbound.content.length).toBeGreaterThan(0)
    expect(
      outbound.content.some(
        (row) =>
          ['COMPLETED', 'SHIPPING', 'DELIVERED', 'CONFIRMED'].includes(row.status) && row.editHistoryCount > 0,
      ),
    ).toBe(true)
    expect(
      inbound.content.some(
        (row) =>
          ['SENT', 'ACCEPTED', 'PROCESSING', 'INSPECTING', 'COMPLETED', 'SHIPPING', 'DELIVERED', 'CONFIRMED'].includes(
            row.status,
          ) && row.editHistoryCount > 0,
      ),
    ).toBe(true)
    expect(inboundPage.number).toBe(1)
    expect(inboundPage.size).toBe(3)
    expect(inboundPage.content).toHaveLength(3)
    expect(searched.content.map((row) => row.slipNo)).toEqual(['2026/05/10-1'])
  })
})

describe('mock dispatch restore contract', () => {
  it('그룹 cascade 복원은 발송된 전표 tombstone 을 복원하지 않는다', async () => {
    const { isMockDispatchGroupSlipRestorable } = await import('./mock')

    expect(isMockDispatchGroupSlipRestorable({
      id: 'mapping-dispatched',
      slipId: 'slip-dispatched',
      sequence: 1,
      isDeleted: true,
      deletedAt: '2026-07-02T10:20:00',
      deletedByName: '배차담당',
      slip: {
        slipNo: 'SLIP-DISPATCHED',
        partnerCode: 'P-DISPATCHED',
        partnerName: '발송완료거래처',
        deliveryAddress: null,
        recipientPhone: null,
        dispatchStatus: 'DISPATCHED',
      },
    }, false)).toBe(false)

    expect(isMockDispatchGroupSlipRestorable({
      id: 'mapping-undispatched',
      slipId: 'slip-undispatched',
      sequence: 1,
      isDeleted: true,
      deletedAt: '2026-07-02T10:20:00',
      deletedByName: '배차담당',
      slip: {
        slipNo: 'SLIP-UNDISPATCHED',
        partnerCode: 'P-UNDISPATCHED',
        partnerName: '미발송거래처',
        deliveryAddress: null,
        recipientPhone: null,
        dispatchStatus: 'UNDISPATCHED',
      },
    }, false)).toBe(true)
  })
})

describe('mock CODEF account selection BC3 contract', () => {
  it('연결 식별자로 계좌/카드/대출 목록을 envelope 로 반환한다', () => {
    const accounts = mockRequest({
      method: 'GET',
      url: '/accounting/codef/bank-accounts',
      params: { connectedId: 'connected-main' },
    }) as MockEnvelope<{ accounts: Array<{ ref: string; name: string; bankName: string; accountNumber: string }> }>
    const cards = mockRequest({
      method: 'GET',
      url: '/accounting/codef/cards',
      params: { connectedId: 'connected-main' },
    }) as MockEnvelope<{ cards: Array<{ ref: string; name: string; issuerName: string; cardNumber: string }> }>
    const loans = mockRequest({
      method: 'GET',
      url: '/accounting/codef/loans',
      params: { connectedId: 'connected-main' },
    }) as MockEnvelope<{ loans: Array<{ ref: string; name: string; lenderName: string; loanType: string }> }>

    expect(accounts.data.accounts).toEqual([
      { ref: '국민 123456-78-901234', name: '국민 운영계좌', bankName: '국민은행', accountNumber: '123456-78-901234' },
      { ref: '하나 987-654321-001', name: '하나 정산계좌', bankName: '하나은행', accountNumber: '987-654321-001' },
      { ref: '우리 1002-345-678901', name: '우리 급여계좌', bankName: '우리은행', accountNumber: '1002-345-678901' },
    ])
    expect(cards.data.cards[0]).toEqual({ ref: '삼한 물류카드', name: '삼한 물류카드', issuerName: '신한카드', cardNumber: '9400-****-****-1201' })
    expect(loans.data.loans[0]).toEqual({ ref: '운전자금 대출', name: '운전자금 대출', lenderName: '국민은행', loanType: '운전자금' })
  })

  it('scope 저장 후 조회하고 import-scoped 는 선택된 refs 기준으로 거래를 적재한다', () => {
    const scopePayload = {
      connectedId: 'connected-main',
      accountRefs: ['하나 987-654321-001'],
      cardRefs: ['삼한 정비카드'],
      loanRefs: [],
      defaultImportType: 'ALL',
    }

    const saved = mockRequest({
      method: 'PUT',
      url: '/accounting/codef/scopes',
      data: scopePayload,
    }) as MockEnvelope<typeof scopePayload>
    const loaded = mockRequest({
      method: 'GET',
      url: '/accounting/codef/scopes',
      params: { connectedId: 'connected-main' },
    }) as MockEnvelope<typeof scopePayload>
    const imported = mockRequest({
      method: 'POST',
      url: '/accounting/codef/import-scoped',
      data: {
        connectedId: 'connected-main',
        from: '2026-06-01',
        to: '2026-06-26',
        type: 'ALL',
        accountRefs: saved.data.accountRefs,
        cardRefs: saved.data.cardRefs,
        loanRefs: saved.data.loanRefs,
      },
    }) as MockEnvelope<{
      fetchedCount: number
      importedCount: number
      duplicateSkippedCount: number
      matchedCount: number
      staleSkippedCount: number
      staleNormalizedNames: string[]
      unavailableSkippedCount: number
      unavailableNames: string[]
    }>

    expect(saved.data).toEqual(scopePayload)
    expect(loaded.data).toEqual(scopePayload)
    expect(imported.data.fetchedCount).toBe(4)
    // #810 R3 (L2-M1) additive 계약 — stale(영구)과 unavailable(일시장애 재시도 대상) 필드가
    // 항상 존재한다. mock 은 일시장애 경로가 없어 0/빈 배열 기본값이다.
    expect(imported.data.staleSkippedCount).toBe(0)
    expect(imported.data.staleNormalizedNames).toEqual([])
    expect(imported.data.unavailableSkippedCount).toBe(0)
    expect(imported.data.unavailableNames).toEqual([])
  })

  it('CSV import 응답도 stale·unavailable additive 계약 필드를 포함한다 (#810 R3 L2-M1)', () => {
    const bankAccountLabel = `국민 계약필드 ${Date.now()}`
    const imported = mockRequest({
      method: 'POST',
      url: '/accounting/bank-transactions/import',
      data: { bankAccountLabel },
    }) as MockEnvelope<Record<string, unknown>>

    expect(imported.data).toMatchObject({
      staleSkippedCount: 0,
      staleNormalizedNames: [],
      unavailableSkippedCount: 0,
      unavailableNames: [],
    })
    expect(Number(imported.data.totalRows)).toBeGreaterThan(0)
  })

  it('scope 미저장 조회는 200 envelope + empty scope 를 반환한다', () => {
    const connectedId = `missing-connected-${Date.now()}`
    const missing = mockRequest({
      method: 'GET',
      url: '/accounting/codef/scopes',
      params: { connectedId },
    }) as MockEnvelope<{
      connectedId: string
      accountRefs: string[]
      cardRefs: string[]
      loanRefs: string[]
      defaultImportType: 'ALL'
    }>

    expect(missing.success).toBe(true)
    expect(missing.data).toEqual({
      connectedId,
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
    })
  })

  it('저장된 scope 가 있지만 refs 가 모두 비어 있으면 import-scoped 는 INVALID_INPUT 을 반환한다', () => {
    const connectedId = `empty-scope-${Date.now()}`
    mockRequest({
      method: 'PUT',
      url: '/accounting/codef/scopes',
      data: {
        connectedId,
        accountRefs: [],
        cardRefs: [],
        loanRefs: [],
        defaultImportType: 'ALL',
      },
    })

    const imported = mockRequest({
      method: 'POST',
      url: '/accounting/codef/import-scoped',
      data: {
        connectedId,
        from: '2026-06-01',
        to: '2026-06-26',
        type: 'ALL',
        accountRefs: [],
        cardRefs: [],
        loanRefs: [],
      },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string; message: string } }

    expect(imported.__mockStatus).toBe(400)
    expect(imported.body.code).toBe('INVALID_INPUT')
    expect(imported.body.message).toContain('저장된 가져오기 선택이 비어 있습니다')
  })
})

describe('mock notes receivable transition contract', () => {
  it('forces BOARDING on register even when final status is posted', () => {
    const noteNo = `NR-MOCK-FINAL-${Date.now()}`
    const created = mockRequest({
      method: 'POST',
      url: '/accounting/notes-receivable',
      data: {
        partnerCode: 'P-2026-0001',
        noteNo,
        issueDate: '2026-06-01',
        maturityDate: '2026-07-01',
        amount: '1000',
        noteType: 'PROMISSORY',
        status: 'SETTLED',
      },
    }) as MockEnvelope<{ noteNo: string; status: string }>

    expect(created.data).toMatchObject({ noteNo, status: 'BOARDING' })
  })

  it('rejects terminal and reverse transitions with 409 envelope', () => {
    const settledNoteNo = `NR-MOCK-SETTLED-${Date.now()}`
    mockRequest({
      method: 'POST',
      url: '/accounting/notes-receivable',
      data: {
        partnerCode: 'P-2026-0001',
        noteNo: settledNoteNo,
        issueDate: '2026-06-01',
        maturityDate: '2026-07-01',
        amount: '1000',
        noteType: 'PROMISSORY',
      },
    })
    mockRequest({
      method: 'PATCH',
      url: `/accounting/notes-receivable/${encodeURIComponent(settledNoteNo)}/status`,
      data: { status: 'SETTLED' },
    })

    const reverse = mockRequest({
      method: 'PATCH',
      url: `/accounting/notes-receivable/${encodeURIComponent(settledNoteNo)}/status`,
      data: { status: 'COLLECTING' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(reverse.__mockStatus).toBe(409)
    expect(reverse.body.code).toBe('CONFLICT')

    const doubleSettle = mockRequest({
      method: 'PATCH',
      url: `/accounting/notes-receivable/${encodeURIComponent(settledNoteNo)}/status`,
      data: { status: 'SETTLED' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(doubleSettle.__mockStatus).toBe(409)
    expect(doubleSettle.body.code).toBe('CONFLICT')

    const dishonoredNoteNo = `NR-MOCK-DISHONORED-${Date.now()}`
    mockRequest({
      method: 'POST',
      url: '/accounting/notes-receivable',
      data: {
        partnerCode: 'P-2026-0001',
        noteNo: dishonoredNoteNo,
        issueDate: '2026-06-01',
        maturityDate: '2026-07-01',
        amount: '1000',
        noteType: 'PROMISSORY',
      },
    })
    mockRequest({
      method: 'PATCH',
      url: `/accounting/notes-receivable/${encodeURIComponent(dishonoredNoteNo)}/status`,
      data: { status: 'DISHONORED' },
    })

    const resurrect = mockRequest({
      method: 'PATCH',
      url: `/accounting/notes-receivable/${encodeURIComponent(dishonoredNoteNo)}/status`,
      data: { status: 'SETTLED' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(resurrect.__mockStatus).toBe(409)
    expect(resurrect.body.code).toBe('CONFLICT')
  })
})

describe('mock app version management contract', () => {
  it('GET /app/version은 clientType별 latestVersion과 forceLevel을 envelope로 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/app/version',
      params: { clientType: 'DESKTOP', currentVersion: '0.1.0' },
    }) as MockEnvelope<{
      latestVersion: string
      minSupportedVersion: string
      forceLevel: string
      releaseNotes: string
      releasedAt: string
    }>

    expect(resolved.success).toBe(true)
    expect(resolved.data.latestVersion).toBeTruthy()
    expect(['NONE', 'MINOR', 'MAJOR', 'CRITICAL']).toContain(resolved.data.forceLevel)
  })

  it('POST/PUT/DELETE /app/releases는 in-memory 목록에 반영한다', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/app/releases',
      data: {
        clientType: 'WEB',
        version: `0.3.${Date.now()}`,
        minSupportedVersion: '0.1.0',
        forceLevel: 'MINOR',
        releaseNotes: 'Playwright mock 검증',
        releasedAt: '2026-06-27T10:00:00',
      },
    }) as MockEnvelope<{ id: string; forceLevel: string; releasedAt: string; isPublished: boolean }>

    expect(created.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(created.data.releasedAt).toBe('2026-06-27T10:00:00')
    expect(created.data.isPublished).toBe(false)

    const updated = mockRequest({
      method: 'PUT',
      url: `/app/releases/${created.data.id}`,
      data: {
        clientType: 'WEB',
        version: '0.3.1',
        minSupportedVersion: '0.1.0',
        forceLevel: 'MAJOR',
        releaseNotes: '수정된 릴리스',
        releasedAt: '2026-06-27T10:00:00',
      },
    }) as MockEnvelope<{ id: string; forceLevel: string; releaseNotes: string; releasedAt: string }>

    expect(updated.data.forceLevel).toBe('MAJOR')
    expect(updated.data.releaseNotes).toBe('수정된 릴리스')
    expect(updated.data.releasedAt).toBe('2026-06-27T10:00:00')

    const deleted = mockRequest({
      method: 'DELETE',
      url: `/app/releases/${created.data.id}`,
    }) as MockEnvelope<null>

    expect(deleted.success).toBe(true)
    expect(deleted.data).toBeNull()
  })

  it('POST /app/releases/:id/publish 와 /unpublish는 배포 상태와 버전 게이트 노출을 전환한다', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/app/releases',
      data: {
        clientType: 'WEB',
        version: `8.8.${Date.now()}`,
        minSupportedVersion: '0.1.0',
        forceLevel: 'MAJOR',
        releaseNotes: '테스트 릴리스',
        releasedAt: '2026-06-27T10:00:00',
      },
    }) as MockEnvelope<{ id: string; version: string; isPublished: boolean }>

    expect(created.data.isPublished).toBe(false)

    const gateAfterCreate = mockRequest({
      method: 'GET',
      url: '/app/version',
      params: { clientType: 'WEB', currentVersion: '0.1.0' },
    }) as MockEnvelope<{ latestVersion: string }>
    expect(gateAfterCreate.data.latestVersion).not.toBe(created.data.version)

    const unpublished = mockRequest({
      method: 'POST',
      url: `/app/releases/${created.data.id}/unpublish`,
    }) as MockEnvelope<{ id: string; version: string; isPublished: boolean }>

    expect(unpublished.data.isPublished).toBe(false)

    const gateAfterUnpublish = mockRequest({
      method: 'GET',
      url: '/app/version',
      params: { clientType: 'WEB', currentVersion: '0.1.0' },
    }) as MockEnvelope<{ latestVersion: string }>
    expect(gateAfterUnpublish.data.latestVersion).not.toBe(created.data.version)

    const published = mockRequest({
      method: 'POST',
      url: `/app/releases/${created.data.id}/publish`,
    }) as MockEnvelope<{ id: string; version: string; isPublished: boolean }>

    expect(published.data.isPublished).toBe(true)

    const gateAfterPublish = mockRequest({
      method: 'GET',
      url: '/app/version',
      params: { clientType: 'WEB', currentVersion: '0.1.0' },
    }) as MockEnvelope<{ latestVersion: string }>
    expect(gateAfterPublish.data.latestVersion).toBe(created.data.version)
  })

  it('POST /app/releases는 releasedAt offset 포함 payload를 BE LocalDateTime 계약처럼 거부한다', () => {
    const rejected = mockRequest({
      method: 'POST',
      url: '/app/releases',
      data: {
        clientType: 'WEB',
        version: `0.3.${Date.now()}`,
        minSupportedVersion: '0.1.0',
        forceLevel: 'MINOR',
        releaseNotes: 'offset 거부 검증',
        releasedAt: '2026-06-27T10:00:00+09:00',
      },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(rejected.__mockStatus).toBe(400)
    expect(rejected.body.code).toBe('INVALID_INPUT')
  })
})

describe('mock collection plan contract', () => {
  it('creates PLANNED plans and rejects terminal or reverse transitions', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/accounting/collection-plans',
      data: {
        partnerCode: 'P-2026-0001',
        plannedDate: '2026-08-01',
        plannedAmount: '1500000',
        basis: 'MANUAL',
      },
    }) as MockEnvelope<{ planNo: string; status: string }>

    expect(created.data.status).toBe('PLANNED')
    expect(created.data.planNo).toMatch(/^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/)
    expect(created.data.planNo.startsWith('CP-')).toBe(false)

    const overdue = mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${created.data.planNo.replace(/\//g, '-')}/status`,
      data: { status: 'OVERDUE' },
    }) as MockEnvelope<{ status: string }>
    expect(overdue.data.status).toBe('OVERDUE')

    const reverse = mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${created.data.planNo.replace(/\//g, '-')}/status`,
      data: { status: 'PLANNED' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(reverse.__mockStatus).toBe(409)
    expect(reverse.body.code).toBe('CONFLICT')

    mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${created.data.planNo.replace(/\//g, '-')}/status`,
      data: { status: 'COLLECTED' },
    })

    const doubleCollect = mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${created.data.planNo.replace(/\//g, '-')}/status`,
      data: { status: 'COLLECTED' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(doubleCollect.__mockStatus).toBe(409)
    expect(doubleCollect.body.code).toBe('CONFLICT')
  })

  it('returns suggestions and forecast without UUID fields', () => {
    const suggestions = mockRequest({
      method: 'GET',
      url: '/accounting/collection-plans/suggestions',
      params: { partnerCode: 'P-2026-0001' },
    }) as MockEnvelope<Array<Record<string, unknown>>>

    expect(suggestions.data.length).toBeGreaterThan(0)
    expect(suggestions.data[0]).not.toHaveProperty('id')
    expect(suggestions.data[0]).not.toHaveProperty('partnerId')

    const forecast = mockRequest({
      method: 'GET',
      url: '/accounting/collection-plans/forecast',
      params: { from: '2026-07-01', to: '2026-08-31' },
    }) as MockEnvelope<{ months: Array<{ month: string; plannedAmount: string }>; totalAmount: string }>

    expect(forecast.data.months.map((row) => row.month)).toEqual(['2026-07', '2026-08'])
    expect(Number(forecast.data.totalAmount)).toBeGreaterThan(0)
  })
})

describe('mock public signature contract', () => {
  it('POST /api/public/batches/{token}/slips/{slipNo}/signature accepts hyphen slip path id', () => {
    const signed = mockRequest({
      method: 'POST',
      url: '/api/public/batches/mock-token/slips/2026-05-04-2/signature',
      data: {
        signerName: '김인수',
        signaturePngBase64: 'data:image/png;base64,AAAA',
        clientHash: 'signer-hash',
      },
    }) as MockEnvelope<{
      signedAt: string
      shareToken: string
      shareTokenExpiresAt: string
      signatureHash: string
    }>

    expect(signed.data.signedAt).toEqual(expect.any(String))
    expect(signed.data.shareToken).toEqual(expect.any(String))
    expect(signed.data.signatureHash).toBe('signer-hash')
  })

  it('POST /api/public/batches/{token}/slips/{slipNo}/driver-signature accepts hyphen slip path id', () => {
    const signed = mockRequest({
      method: 'POST',
      url: '/api/public/batches/mock-token/slips/2026-05-04-2/driver-signature',
      data: {
        signaturePngBase64: 'data:image/png;base64,AAAA',
        clientHash: 'driver-hash',
      },
    }) as MockEnvelope<{ driverSignedAt: string; driverSignatureHash: string }>

    expect(signed.data.driverSignedAt).toEqual(expect.any(String))
    expect(signed.data.driverSignatureHash).toBe('driver-hash')
  })

  it('GET /api/public/signatures/{shareToken} returns share view without UUID fields', () => {
    const shared = mockRequest({
      method: 'GET',
      url: '/api/public/signatures/mock-share-token',
    }) as MockEnvelope<{
      slip: { slipNo: string }
      signature: { signerName: string }
    }>

    expect(shared.data.slip.slipNo).toEqual(expect.any(String))
    expect(shared.data.signature.signerName).toEqual(expect.any(String))
    expect(shared.data.slip).not.toHaveProperty('id')
    expect(shared.data.signature).not.toHaveProperty('id')
  })
})

describe('mock inventory audit contract', () => {
  it('GET /inventory/audits returns slash auditNo without legacy AU prefix', () => {
    const page = mockRequest({
      method: 'GET',
      url: '/inventory/audits',
      params: { page: 0, size: 20 },
    }) as MockEnvelope<{
      content: Array<{ auditNo: string }>
    }>

    expect(page.data.content.length).toBeGreaterThan(0)
    for (const row of page.data.content) {
      expect(row.auditNo).toMatch(/^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/)
      expect(row.auditNo.startsWith('AU-')).toBe(false)
    }
  })
})

describe('mock tax invoice e-Tax contract', () => {
  it('rejects e-Tax emit for non-issued tax invoices with Korean status labels', () => {
    const rejected = mockRequest({
      method: 'POST',
      url: '/accounting/tax-invoices/ti-002/emit-nts',
      data: { submitMethod: 'DRY_RUN' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string; message: string } }

    expect(rejected.__mockStatus).toBe(422)
    expect(rejected.body.code).toBe('TAX_INVOICE_NOT_EMITTABLE')
    expect(rejected.body.message).toContain('발행 상태')
    expect(rejected.body.message).toContain('임시저장')
    expect(rejected.body.message).not.toContain('ISSUED')
    expect(rejected.body.message).not.toContain('DRAFT')
  })
})

/**
 * [#825 재수렴 #6] tax-invoice create/update mock 의 partnerId/partnerCode payload 반영.
 *
 * <p>BE TaxInvoiceService.create/update 는 request.partnerId()/partnerCode() 를 저장 후
 * 응답(TaxInvoiceDetailResponse)에 왕복한다 (#825 CH1·CM-a — update 는 전체 교체 계약,
 * partnerCode 미전송이면 null 로 갱신). mock 이 이를 미반영하면 "FE 가 partnerCode 를
 * 전송하지 않게 되는 회귀" 가 mock 화면에서 기존값으로 위장돼 false-green 이 된다
 * (in-process mock 3원칙 — BE parity).
 */
describe('mock tax invoice create/update partner payload contract (#825 재수렴 #6)', () => {
  it('POST /accounting/tax-invoices 응답이 payload partnerId/partnerCode 를 그대로 왕복한다', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/accounting/tax-invoices',
      data: {
        partnerId: 'partner-uuid-0009',
        partnerCode: 'P-NEW-009',
        partnerName: '신규거래처',
        supplyDate: '2026-07-18',
        lines: [],
      },
    }) as MockEnvelope<Record<string, unknown>>

    expect(created.data['partnerId']).toBe('partner-uuid-0009')
    expect(created.data['partnerCode']).toBe('P-NEW-009')
    expect(created.data['partnerName']).toBe('신규거래처')
  })

  it('POST partnerCode 미전송이면 BE 저장 계약과 동일하게 null 로 응답한다 (기존값 위장 금지)', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/accounting/tax-invoices',
      data: {
        partnerId: 'partner-uuid-0010',
        partnerName: '코드미전송거래처',
        supplyDate: '2026-07-18',
        lines: [],
      },
    }) as MockEnvelope<Record<string, unknown>>

    expect(created.data['partnerCode']).toBeNull()
  })

  it('PUT /accounting/tax-invoices/{id} 가 거래처 교체 payload 의 partnerId/partnerCode 를 응답에 반영한다', () => {
    const updated = mockRequest({
      method: 'PUT',
      url: '/accounting/tax-invoices/ti-002',
      data: {
        partnerId: 'partner-uuid-0001',
        partnerCode: 'P-LASYS-001',
        partnerBusinessNo: '123-45-67890',
        partnerName: '엘에이시스템에어',
        supplyDate: '2026-05-09',
        lines: [],
      },
    }) as MockEnvelope<Record<string, unknown>>

    // ti-002 fixture 원값(partner-uuid-0002 / P-GANGNAM-002)이 아닌 교체 거래처로 왕복
    expect(updated.data['partnerId']).toBe('partner-uuid-0001')
    expect(updated.data['partnerCode']).toBe('P-LASYS-001')
    expect(updated.data['partnerName']).toBe('엘에이시스템에어')
  })

  it('PUT partnerCode 미전송이면 BE 전체 교체 계약과 동일하게 null 로 갱신한다', () => {
    const updated = mockRequest({
      method: 'PUT',
      url: '/accounting/tax-invoices/ti-002',
      data: {
        partnerId: 'partner-uuid-0002',
        partnerName: '강남에어솔루션',
        supplyDate: '2026-05-09',
        lines: [],
      },
    }) as MockEnvelope<Record<string, unknown>>

    expect(updated.data['partnerCode']).toBeNull()
  })
})

describe('mock bank transaction matching contract', () => {
  it('stores filter preferences per user and applies source-aware account filter selectively', () => {
    const userId = `mock-user-${Date.now()}`
    const bankAccountLabel = `국민 다중필터 ${Date.now()}`
    const otherBankAccountLabel = `신한 다중필터 ${Date.now()}`
    const excludedLabel = `우리 제외 ${Date.now()}`
    for (const label of [bankAccountLabel, otherBankAccountLabel, excludedLabel]) {
      mockRequest({
        method: 'POST',
        url: '/accounting/bank-transactions/import',
        data: { bankAccountLabel: label },
      })
    }

    const saved = mockRequest({
      method: 'PUT',
      url: '/accounting/bank-transactions/filter-preferences',
      headers: { 'X-User-Id': userId },
      data: {
        accountLabels: [bankAccountLabel, bankAccountLabel, otherBankAccountLabel],
        cardLabels: ['삼한 물류카드'],
      },
    }) as MockEnvelope<{ accountLabels: string[]; cardLabels: string[] }>
    const loaded = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions/filter-preferences',
      headers: { 'X-User-Id': userId },
    }) as MockEnvelope<{ accountLabels: string[]; cardLabels: string[] }>
    const filtered = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions',
      params: { accountLabels: [bankAccountLabel, otherBankAccountLabel] },
    }) as MockEnvelope<Array<Record<string, unknown>>>

    // 저장은 정규화(중복 제거) 후 per-user 로 저장/복원한다.
    expect(saved.data.accountLabels).toEqual([bankAccountLabel, otherBankAccountLabel])
    expect(loaded.data).toEqual(saved.data)

    // 계좌 소스행은 선택 label 만 통과하고 미선택 계좌(excludedLabel)는 제외한다.
    // (대출/카드 등 비계좌 소스의 필터 면제는 BankTransactionControllerIT#list_filtersAccountLabelsSourceAware
    //  / list_filtersCardLabelsSourceAware 가 실데이터로 권위 검증한다.)
    const accountRows = filtered.data.filter((row) =>
      ['CSV_IMPORT', 'CODEF_BANK'].includes(String(row.source)))
    expect(new Set(accountRows.map((row) => row.bankAccountLabel))).toEqual(
      new Set([bankAccountLabel, otherBankAccountLabel]),
    )
  })

  it('returns account/card filter labels and unregisters CODEF institutions by natural key', () => {
    mockRequest({
      method: 'POST',
      url: '/accounting/codef/import-scoped',
      data: {
        connectedId: 'connected-main',
        from: '2026-06-01',
        to: '2026-06-26',
        accountRefs: ['국민 123456-78-901234'],
        cardRefs: ['삼한 물류카드'],
        loanRefs: [],
      },
    })
    const labels = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions/filter-labels',
    }) as MockEnvelope<{ accountLabels: string[]; cardLabels: string[] }>
    expect(labels.data.accountLabels).toContain('국민 123456-78-901234')
    expect(labels.data.cardLabels).toContain('삼한 물류카드')

    mockRequest({
      method: 'POST',
      url: '/accounting/codef/connection/institutions',
      data: {
        businessType: 'BANK',
        organization: '0004',
        loginType: '1',
        credentials: { id: 'mock', password: 'secret' },
      },
    })
    const removed = mockRequest({
      method: 'PATCH',
      url: '/accounting/codef/connection/institutions/unregister',
      data: { businessType: 'BANK', organizationCode: '0004' },
    }) as MockEnvelope<{ businessType: string; organizationCode: string }>
    const institutions = mockRequest({
      method: 'GET',
      url: '/accounting/codef/connection/institutions',
    }) as MockEnvelope<{ institutions: Array<{ businessType: string; organizationCode: string }> }>

    expect(removed.data).toMatchObject({ businessType: 'BANK', organizationCode: '0004' })
    expect(institutions.data.institutions).not.toContainEqual(
      expect.objectContaining({ businessType: 'BANK', organizationCode: '0004' }),
    )
  })

  it('does not expose vendor/source keywords in imported transaction descriptions', () => {
    const bankAccountLabel = `국민 적요테스트 ${Date.now()}`
    mockRequest({
      method: 'POST',
      url: '/accounting/bank-transactions/import',
      data: { bankAccountLabel },
    })

    const imported = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions',
      params: { bankAccountLabel },
    }) as MockEnvelope<Array<Record<string, unknown>>>

    const userVisibleText = imported.data
      .flatMap((row) => [row.description, row.counterpartyName])
      .filter((value): value is string => typeof value === 'string')

    expect(userVisibleText.join(' ')).not.toMatch(/\b(?:CSV|CODEF)\b/)
  })

  it('matches and clears a partner by 4-key natural key without UUID fields', () => {
    const bankAccountLabel = `국민 매칭테스트 ${Date.now()}`
    mockRequest({
      method: 'POST',
      url: '/accounting/bank-transactions/import',
      data: { bankAccountLabel },
    })

    const transactedAt = '2026-06-23T09:10:00'
    const amount = '150000'
    const externalRef = `mock-csv-${bankAccountLabel}-1`
    const wrongAmount = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner',
      data: {
        bankAccountLabel,
        transactedAt,
        amount: '999999',
        externalRef,
        partnerCode: '1234567890',
      },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(wrongAmount.__mockStatus).toBe(404)
    expect(wrongAmount.body.code).toBe('NOT_FOUND')

    const matched = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner',
      data: {
        bankAccountLabel,
        transactedAt,
        amount,
        externalRef,
        partnerCode: '1234567890',
      },
    }) as MockEnvelope<Record<string, unknown>>

    expect(matched.data).toMatchObject({
      bankAccountLabel,
      externalRef,
      matchStatus: 'UNREFLECTED',
      matchedPartnerCode: '1234567890',
      matchedBizNo: '1234567890',
      matchedPartnerName: '엘에이시스템에어',
    })
    expect(matched.data).not.toHaveProperty('matchedPartnerId')

    const filtered = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions',
      params: { matchStatus: 'UNREFLECTED', bankAccountLabel },
    }) as MockEnvelope<Array<Record<string, unknown>>>

    expect(filtered.data.find((row) => row.externalRef === externalRef)).toMatchObject({
      matchedPartnerCode: '1234567890',
      matchedPartnerName: '엘에이시스템에어',
    })

    // 재지정(덮어쓰기) — 미반영 거래는 다른 거래처로 재매칭 허용
    const rematched = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner',
      data: { bankAccountLabel, transactedAt, amount, externalRef, partnerCode: '2345678901' },
    }) as MockEnvelope<Record<string, unknown>>
    expect(rematched.data).toMatchObject({ externalRef, matchedPartnerCode: '2345678901' })

    const cleared = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner/clear',
      data: { bankAccountLabel, transactedAt, amount, externalRef },
    }) as MockEnvelope<Record<string, unknown>>

    expect(cleared.data).toMatchObject({
      externalRef,
      matchedPartnerCode: null,
      matchedBizNo: null,
      matchedPartnerName: null,
    })
    expect(cleared.data).not.toHaveProperty('matchedPartnerId')
  })

  it('keeps reflected and forced rows immutable for partner matching', () => {
    const forced = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner',
      data: {
        bankAccountLabel: '국민 123-456',
        transactedAt: '2026-06-22T15:40:00',
        amount: '45000',
        externalRef: 'mock-bank-20260622-002',
        partnerCode: '1234567890',
      },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(forced.__mockStatus).toBe(409)
    expect(forced.body.code).toBe('CONFLICT')
  })
})

describe('mock depositor mapping contract', () => {
  it('매핑 CRUD는 정규화 key 충돌과 soft delete 이력을 실제 상태로 처리한다', () => {
    const suffix = String(Date.now())
    const rawName = `  ac\tme ${suffix}  `
    const normalizedName = `AC ME ${suffix}`
    const created = mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName, partnerCode: '1234567890', reason: '초기 자동 매핑' },
    }) as MockEnvelope<Record<string, unknown>>

    expect(created.data).toMatchObject({
      rawName: rawName.trim(),
      normalizedName,
      partnerCode: '1234567890',
      partnerName: '엘에이시스템에어',
      active: true,
    })
    expect(created.data).not.toHaveProperty('id')

    const duplicate = mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName: `AC  ME ${suffix}`, partnerCode: '2345678901' },
    }) as { __mockStatus: number; body: { code: string } }
    expect(duplicate.__mockStatus).toBe(409)
    expect(duplicate.body.code).toBe('CONFLICT')

    // BE 계약(#810): update/delete 는 경로변수가 아닌 `?normalizedName=` 쿼리파라미터.
    const updated = mockRequest({
      method: 'PUT',
      url: `/accounting/deposit-mappings?normalizedName=${encodeURIComponent(normalizedName)}`,
      data: { rawName: `Acme Updated ${suffix}`, partnerCode: '2345678901', reason: '거래처 변경' },
    }) as MockEnvelope<Record<string, unknown>>
    expect(updated.data).toMatchObject({
      normalizedName: `ACME UPDATED ${suffix}`,
      partnerCode: '2345678901',
      partnerName: '강남에어솔루션',
    })

    const history = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings/history',
      params: { normalizedName: `ACME UPDATED ${suffix}` },
    }) as MockEnvelope<Array<Record<string, unknown>>>
    expect(history.data.length).toBeGreaterThan(0)
    expect(history.data[0]).toEqual(expect.objectContaining({ actor: expect.any(String), entryKey: expect.any(String) }))
    // #810 R3 (L4-M2): BE recordBatch 대칭 — 한 작업(update)의 전 필드행이 revisionNo 1개와
    // changedAt 1개를 공유한다(필드별 회차 분리 금지). fieldName 은 BE mapping.* 필드셋(L4-L1).
    const updateRows = history.data.filter((row) => row.revisionNo === 2)
    expect(new Set(updateRows.map((row) => row.fieldName))).toEqual(new Set([
      'mapping.rawName', 'mapping.normalizedName', 'mapping.partnerCode', 'mapping.reason',
    ]))
    expect(new Set(updateRows.map((row) => row.changedAt)).size).toBe(1)
    expect(updateRows.find((row) => row.fieldName === 'mapping.reason')).toMatchObject({ newValue: '거래처 변경' })
    // rename 후에도 entity 이력이 절단되지 않는다 — 생성 배치(rev 1, reason 기본 포함 4행)가
    // 새 키 조회에 포함된다(BE entityId 역추적 대칭).
    const createRows = history.data.filter((row) => row.revisionNo === 1)
    expect(createRows.map((row) => String(row.fieldName)).sort()).toEqual([
      'mapping.normalizedName', 'mapping.partnerCode', 'mapping.rawName', 'mapping.reason',
    ])
    expect(createRows.find((row) => row.fieldName === 'mapping.reason')).toMatchObject({ newValue: '초기 자동 매핑' })

    const deleted = mockRequest({
      method: 'DELETE',
      url: `/accounting/deposit-mappings?normalizedName=${encodeURIComponent(`ACME UPDATED ${suffix}`)}`,
      params: { reason: '더 이상 사용하지 않음' },
    }) as MockEnvelope<null>
    expect(deleted.data).toBeNull()

    // #810 R3 (L4-L1): 삭제 이력은 mock 전용 'active' 행이 아니라 BE 표현 —
    // rawName·partnerCode(old→null) + reason 한 배치. normalizedName 은 불변이라 행이 없다.
    const afterDelete = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings/history',
      params: { normalizedName: `ACME UPDATED ${suffix}` },
    }) as MockEnvelope<Array<Record<string, unknown>>>
    const deleteRows = afterDelete.data.filter((row) => row.revisionNo === 3)
    expect(deleteRows.map((row) => String(row.fieldName)).sort()).toEqual([
      'mapping.partnerCode', 'mapping.rawName', 'mapping.reason',
    ])
    expect(deleteRows.find((row) => row.fieldName === 'mapping.rawName')).toMatchObject({ newValue: null })
    expect(deleteRows.find((row) => row.fieldName === 'mapping.reason')).toMatchObject({ newValue: '더 이상 사용하지 않음' })
    expect(afterDelete.data.some((row) => row.fieldName === 'active')).toBe(false)

    const listed = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings',
    }) as MockEnvelope<Array<Record<string, unknown>>>
    expect(listed.data.some((row) => row.normalizedName === `ACME UPDATED ${suffix}`)).toBe(false)
  })

  // #810 R3 (L4-M1): 같은 키의 삭제+재생성 시 revisionNo 는 entity 단위 채번이라 전역 비단조 —
  // BE(와 mock)는 changedAt desc 로 반환하고 FE 는 이 순서를 재정렬 없이 신뢰해야 한다.
  it('삭제+재생성 이력은 changedAt desc 순서이고 신 entity rev 1이 구 entity rev 2보다 앞이다', () => {
    const suffix = String(Date.now())
    const key = `REBIRTH ${suffix}`
    mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName: `Rebirth ${suffix}`, partnerCode: '1234567890' },
    })
    mockRequest({
      method: 'DELETE',
      url: `/accounting/deposit-mappings?normalizedName=${encodeURIComponent(key)}`,
    })
    mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName: `Rebirth ${suffix}`, partnerCode: '2345678901' },
    })

    const history = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings/history',
      params: { normalizedName: key },
    }) as MockEnvelope<Array<Record<string, unknown>>>

    // 응답이 changedAt desc(최신 작업 먼저)로 정렬되어 있다.
    const times = history.data.map((row) => String(row.changedAt))
    expect([...times].sort().reverse()).toEqual(times)

    const recreateIndex = history.data.findIndex((row) =>
      row.fieldName === 'mapping.partnerCode' && row.newValue === '2345678901')
    const deleteIndex = history.data.findIndex((row) =>
      row.fieldName === 'mapping.partnerCode' && row.newValue === null && row.oldValue === '1234567890')
    expect(recreateIndex).toBeGreaterThanOrEqual(0)
    expect(deleteIndex).toBeGreaterThanOrEqual(0)
    // 최신 작업(재생성)이 구 entity 삭제 행보다 앞 — 회차 크기(1 < 2)와 무관하게 시간순.
    expect(recreateIndex).toBeLessThan(deleteIndex)
    expect(history.data[recreateIndex]).toMatchObject({ revisionNo: 1 })
    expect(history.data[deleteIndex]).toMatchObject({ revisionNo: 2 })

    // #810 R3 (S4-M3): entryKey 계약 — 삭제+재생성으로 entity 가 2개여도(구 조합 키
    // revisionNo+changedAt+fieldName 이 충돌 가능한 시나리오) 전 행 유일·비어있지 않은
    // opaque 문자열이며, UUID 형태가 아니다(사용자 비노출 가드).
    const entryKeys = history.data.map((row) => String(row.entryKey))
    expect(entryKeys.every((key) => key.length > 0 && key !== 'undefined')).toBe(true)
    expect(new Set(entryKeys).size).toBe(history.data.length)
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(entryKeys.some((key) => UUID_PATTERN.test(key))).toBe(false)

    // entryKey 안정성 — 같은 조회를 반복해도 행별 키가 변하지 않는다(생성 시 1회 채번).
    const historyAgain = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings/history',
      params: { normalizedName: key },
    }) as MockEnvelope<Array<Record<string, unknown>>>
    expect(historyAgain.data.map((row) => String(row.entryKey))).toEqual(entryKeys)
  })

  it('통장거래 provenance를 반환하고 두 해제 endpoint의 의미를 분리한다', () => {
    const autoRow = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions',
      params: { bankAccountLabel: '국민 123-456' },
    }) as MockEnvelope<Array<Record<string, unknown>>>
    expect(autoRow.data.find((row) => row.externalRef === 'mock-bank-20260623-001')).toMatchObject({
      partnerMatchSource: 'DEPOSITOR_MAPPING',
      appliedMappingRawName: '삼한상사',
      appliedMappingNormalizedName: '삼한상사',
    })

    const naturalKey = {
      bankAccountLabel: '국민 123-456',
      transactedAt: '2026-06-23T09:10:00',
      amount: '1500000',
      externalRef: 'mock-bank-20260623-001',
    }
    const clearedOnly = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner/clear',
      data: naturalKey,
    }) as MockEnvelope<Record<string, unknown>>
    expect(clearedOnly.data).toMatchObject({
      matchedPartnerCode: null,
      partnerMatchSource: null,
    })

    const mappingStillExists = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings',
    }) as MockEnvelope<Array<Record<string, unknown>>>
    expect(mappingStillExists.data.some((row) => row.normalizedName === '삼한상사')).toBe(true)

    const deletedMapping = mockRequest({
      method: 'PATCH',
      url: '/accounting/bank-transactions/match-partner/clear-and-delete-mapping',
      data: {
        bankAccountLabel: '국민 123-456',
        transactedAt: '2026-06-24T10:05:00',
        amount: '2500000',
        externalRef: 'mock-bank-20260624-004',
      },
    }) as MockEnvelope<Record<string, unknown>>
    expect(deletedMapping.data).toMatchObject({
      matchedPartnerCode: null,
      partnerMatchSource: null,
    })
    const mappingAfterDelete = mockRequest({
      method: 'GET',
      url: '/accounting/deposit-mappings',
    }) as MockEnvelope<Array<Record<string, unknown>>>
    expect(mappingAfterDelete.data.some((row) => row.normalizedName === '삼한상사')).toBe(false)
  })

  // 정규화 공유 계약 — BE DepositorNameNormalizerTest(services/accounting-service
  // .../util/DepositorNameNormalizerTest.java)와 동일 입력셋을 mock 공개 API 로 검증한다.
  // 특수문자는 escape 변형 사고를 막기 위해 String.fromCharCode 로 명시 구성한다.
  // BOM(U+FEFF)은 JS/Java 공백 판정이 달라 공통 케이스에서 제외한다 — 정렬 방향은 개발책임자 확인 사항(#810).
  it('mock 정규화는 BE DepositorNameNormalizer와 동일 입력셋에서 같은 key를 만든다 (BOM 제외 공통 케이스)', () => {
    const suffix = String(Date.now())
    const TAB = String.fromCharCode(0x09)
    const LF = String.fromCharCode(0x0a)
    const FILE_SEPARATOR = String.fromCharCode(0x1c) // Java isWhitespace 전용(정보 구분자)
    const NBSP = String.fromCharCode(0xa0)
    const EM_SPACE = String.fromCharCode(0x2003)
    const FIGURE_SPACE = String.fromCharCode(0x2007)
    const NARROW_NBSP = String.fromCharCode(0x202f)
    const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000)

    // BE 케이스 1: NBSP/tab/em space/개행/전각 공백 축약 + 대문자화 → 'HAN RIVER CO'
    const spaced = mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: {
        rawName: NBSP + '  Han' + TAB + EM_SPACE + ' River' + LF + IDEOGRAPHIC_SPACE + ' Co' + suffix + '  ',
        partnerCode: '1234567890',
      },
    }) as MockEnvelope<Record<string, unknown>>
    expect(spaced.data.normalizedName).toBe('HAN RIVER CO' + suffix)

    // BE 케이스 2: 괄호·특수문자·전각 문자는 제거하지 않는다 → '(주) ＡＢＣ·CO.,LTD'
    const preserved = mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName: '  (주) ＡＢＣ·Co.,Ltd' + suffix + '  ', partnerCode: '1234567890' },
    }) as MockEnvelope<Record<string, unknown>>
    expect(preserved.data.normalizedName).toBe('(주) ＡＢＣ·CO.,LTD' + suffix)

    // Java Character.isWhitespace 는 정보 구분자(U+001C~U+001F)도 공백으로 본다 — mock parity.
    const separator = mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName: 'Han' + FILE_SEPARATOR + 'Separator' + suffix, partnerCode: '1234567890' },
    }) as MockEnvelope<Record<string, unknown>>
    expect(separator.data.normalizedName).toBe('HAN SEPARATOR' + suffix)

    // BE 케이스 3: 공백 전용 입력은 빈 key — 생성 API 는 400 으로 거부한다.
    const blankOnly = mockRequest({
      method: 'POST',
      url: '/accounting/deposit-mappings',
      data: { rawName: FIGURE_SPACE + NARROW_NBSP, partnerCode: '1234567890' },
    }) as { __mockStatus: number; body: { code: string } }
    expect(blankOnly.__mockStatus).toBe(400)
  })

  // 계약 pin(#810 L2-M1/L3-M1): 실제 자동매핑 대상일 때 두 권한을 요구하고,
  // 무매핑 대상은 BE deleteByIdIfPermitted(null)과 같이 거래만 해제한다.
  it('clear-and-delete-mapping은 무매핑 대상을 권한검사 없이 200으로 해제한다', () => {
    const perms = [
      { pageCode: 'accounting.bank-matching', view: true, edit: true },
      { pageCode: 'accounting.deposit-mapping', view: true, edit: false },
    ]
    const encoded = Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
    vi.stubGlobal('window', { location: { search: `?mockPerms=${encodeURIComponent(encoded)}`, hash: '' } })
    try {
      const naturalKey = {
        bankAccountLabel: '국민 123-456',
        transactedAt: '2026-06-23T09:10:00',
        amount: '1500000',
        externalRef: 'mock-bank-20260623-001',
      }
      const denied = mockRequest({
        method: 'PATCH',
        url: '/accounting/bank-transactions/match-partner/clear-and-delete-mapping',
        data: naturalKey,
      }) as MockEnvelope<Record<string, unknown>>
      expect(denied.data).toMatchObject({ matchedPartnerCode: null })

      // 대조군: 같은 권한으로 일반 해제(clear)는 bank-matching:update 만 요구하므로 통과한다
      // — 위 403 이 deposit-mapping:delete 게이트에서 났음을 증명.
      const cleared = mockRequest({
        method: 'PATCH',
        url: '/accounting/bank-transactions/match-partner/clear',
        data: naturalKey,
      }) as MockEnvelope<Record<string, unknown>>
      expect(cleared.data).toMatchObject({ matchedPartnerCode: null })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('mock permission matrix contract', () => {
  it('입금자명 매핑은 V87처럼 MASTER/MANAGER/ACCOUNTANT CRUD만 허용한다', () => {
    const manager = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-manager',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>
    const sales = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-sales',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>
    const accountant = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-accountant',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>

    const expected = {
      view: true,
      create: true,
      update: true,
      delete: true,
      restore: false,
      download: false,
      print: false,
    }
    expect(manager.data['accounting.deposit-mapping']).toEqual(expected)
    expect(accountant.data['accounting.deposit-mapping']).toEqual(expected)
    expect(sales.data['accounting.deposit-mapping']).toEqual({
      view: false,
      create: false,
      update: false,
      delete: false,
      restore: false,
      download: false,
      print: false,
    })
  })

  it('입금 매칭 기본 권한은 auth seed role_page_permissions 와 일치한다', () => {
    const manager = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-manager',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>
    const sales = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-sales',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>
    const accountantGroup = mockRequest({
      method: 'GET',
      url: '/auth/admin/permission-groups/00000000-0000-0000-0000-000000000104/permissions',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>

    expect(manager.data['accounting.deposit-match']).toEqual({
      view: true,
      create: false,
      update: false,
      delete: false,
      restore: false,
      download: true,
      print: true,
    })
    expect(sales.data['accounting.deposit-match']).toEqual({
      view: false,
      create: false,
      update: false,
      delete: false,
      restore: false,
      download: false,
      print: false,
    })
    expect(accountantGroup.data['accounting.deposit-match']).toEqual({
      view: true,
      create: true,
      update: true,
      delete: true,
      restore: false,
      download: true,
      print: true,
    })
  })

  it('외부기사/배송사 권한 매트릭스는 V69 action seed 와 같은 액션만 반환한다', () => {
    const matrix = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-dispatch',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>

    expect(matrix.data['dispatch.external-carriers']).toEqual({
      view: true,
      create: true,
      update: true,
      delete: true,
      restore: true,
      download: false,
      print: false,
    })
  })

  // #759 STEP4 HIGH-2 fix — E2 견적 목록 mock 3역할(MASTER/MANAGER/SALES) 복원권한 parity.
  // BE V85(services/auth-service V85__seed_estimate_list_restore_permission.sql)는
  // MASTER/MANAGER/SALES 3역할에 estimates.list can_restore=TRUE 만 additive grant 한다
  // (V10+V39 backfill 기준 can_download/can_print 는 estimates.list 가 preserve 목록에
  // 없어 이미 FALSE — 본 fix 는 그 값을 보존한 채 RESTORE 만 추가한다).
  it('estimates.list 계정 매트릭스는 MANAGER/SALES 에 RESTORE 를 부여하고 DOWNLOAD/PRINT 는 V39 seed(FALSE)를 그대로 보존한다', () => {
    const manager = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-manager',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>
    const sales = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/account/mock-account-sales',
    }) as MockEnvelope<Record<string, Record<string, boolean>>>

    const expected = {
      view: true,
      create: true,
      update: true,
      delete: true,
      restore: true,
      download: false,
      print: false,
    }
    expect(manager.data['estimates.list']).toEqual(expected)
    expect(sales.data['estimates.list']).toEqual(expected)
  })

  it('GET /auth/admin/permissions/my (기본 role=MANAGER) 의 estimates.list 액션에 RESTORE 를 포함한다', () => {
    // mock.ts _resolveMockRole() 은 window.location 의 ?mockRole= override 가 없으면
    // 'MANAGER' 를 기본 반환한다(vitest node 환경 — window undefined 로 override 불가 경로와
    // 동일 기본값). 이 테스트는 그 기본 role 로 실제 /my 응답을 실측한다.
    const myPermissions = mockRequest({
      method: 'GET',
      url: '/auth/admin/permissions/my',
    }) as MockEnvelope<Record<string, string[]>>

    expect(myPermissions.data['estimates.list']).toEqual([
      'VIEW',
      'CREATE',
      'UPDATE',
      'DELETE',
      'RESTORE',
    ])
  })
})
