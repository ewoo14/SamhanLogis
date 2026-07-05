import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import { getMockResponse } from './mock'
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

describe('mock manual journal contract', () => {
  it('GET /admin/partners/search 는 공유 admin 응답에 partnerId 를 노출하지 않는다', () => {
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
    expect(adminSearch.data.items[0]).not.toHaveProperty('partnerId')
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
    }) as MockEnvelope<{ fetchedCount: number; importedCount: number; duplicateSkippedCount: number; matchedCount: number }>

    expect(saved.data).toEqual(scopePayload)
    expect(loaded.data).toEqual(scopePayload)
    expect(imported.data.fetchedCount).toBe(4)
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

describe('mock public driver signature contract', () => {
  it('POST /public/batches/{token}/slips/{slipNo}/driver-signature accepts hyphen slip path id', () => {
    const signed = mockRequest({
      method: 'POST',
      url: '/public/batches/mock-token/slips/2026-05-04-2/driver-signature',
      data: {
        signaturePngBase64: 'data:image/png;base64,AAAA',
        clientHash: 'driver-hash',
      },
    }) as MockEnvelope<{ driverSignedAt: string; driverSignatureHash: string }>

    expect(signed.data.driverSignedAt).toEqual(expect.any(String))
    expect(signed.data.driverSignatureHash).toBe('driver-hash')
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

describe('mock permission matrix contract', () => {
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
})
