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

  it('GROUPWARE 결재라인 roles resolve 는 CREATOR/USER/GROUP 단계를 반환한다', () => {
    const resolved = mockRequest({
      method: 'GET',
      url: '/auth/internal/approval-line/roles?documentType=GROUPWARE_EXPENSE_REPORT',
    }) as MockEnvelope<{ configured: boolean; roles: Array<Record<string, unknown>> }>

    expect(resolved.data.configured).toBe(true)
    expect(resolved.data.roles).toEqual([
      expect.objectContaining({ sequence: 0, label: '작성자', stepType: 'CREATOR' }),
      expect.objectContaining({ sequence: 1, label: '회계 검토', stepType: 'GROUP', approverGroupId: 'mock-group-custom-accounting' }),
      expect.objectContaining({ sequence: 2, label: '승인자', stepType: 'USER', approverUserIds: ['user-005'] }),
    ])
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
        approverIds: ['user-008'],
      },
    }) as MockEnvelope<{ steps: Array<Record<string, unknown>> }>

    expect(created.data.steps.map((step) => step.stepType)).toEqual(['USER', 'GROUP', 'USER', 'USER'])
    expect(created.data.steps[0]).toMatchObject({
      approverId: 'user-003',
      stepType: 'USER',
    })
    expect(created.data.steps[1]).toMatchObject({
      approverGroupId: 'mock-group-custom-accounting',
      approverName: null,
    })
    expect(created.data.steps[3]).toMatchObject({
      approverId: 'user-008',
      approverName: '정매니저',
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
