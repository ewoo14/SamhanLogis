import { describe, expect, it } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import { getMockResponse } from './mock'
import type { MonthlyIncomeStatementResponse } from './accounting'

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

describe('mock approval-line-config contract', () => {
  it('GROUPWARE 기본 결재자 resolve 는 USER 결재자만 sequence 순으로 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/auth/approval-line-configs/GROUPWARE_EXPENSE_REPORT/default-approvers',
    }) as MockEnvelope<Array<{ sequence: number; label: string; userId: string; displayName: string }>>

    expect(resolved.data).toEqual([
      { sequence: 1, label: '검토자', userId: 'user-002', displayName: '이정훈' },
      { sequence: 2, label: '승인자', userId: 'user-005', displayName: '홍지수' },
    ])
  })

  it('미설정 GROUPWARE 기본 결재자는 빈 배열을 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/auth/approval-line-configs/GROUPWARE_LEAVE_REQUEST/default-approvers',
    }) as MockEnvelope<unknown[]>

    expect(resolved.data).toEqual([])
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

    const overdue = mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${encodeURIComponent(created.data.planNo)}/status`,
      data: { status: 'OVERDUE' },
    }) as MockEnvelope<{ status: string }>
    expect(overdue.data.status).toBe('OVERDUE')

    const reverse = mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${encodeURIComponent(created.data.planNo)}/status`,
      data: { status: 'PLANNED' },
    }) as { __mockStatus: number; body: MockEnvelope<null> & { code: string } }

    expect(reverse.__mockStatus).toBe(409)
    expect(reverse.body.code).toBe('CONFLICT')

    mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${encodeURIComponent(created.data.planNo)}/status`,
      data: { status: 'COLLECTED' },
    })

    const doubleCollect = mockRequest({
      method: 'PATCH',
      url: `/accounting/collection-plans/${encodeURIComponent(created.data.planNo)}/status`,
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

describe('mock bank transaction matching contract', () => {
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
