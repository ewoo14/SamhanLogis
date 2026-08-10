// @vitest-environment jsdom
import React from 'react'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { TaxInvoiceDetail } from '../api/taxInvoiceApi'

const mocks = vi.hoisted(() => ({
  createTaxInvoice: vi.fn(),
  getTaxInvoice: vi.fn(),
  issueTaxInvoice: vi.fn(),
  updateTaxInvoice: vi.fn(),
  searchPartners: vi.fn(),
  listAuditLogs: vi.fn(),
  revertToRevision: vi.fn(),
  realtimeSubscribe: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, variant: _variant, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Modal: ({ open, title, children, onClose }: {
    open: boolean
    title?: React.ReactNode
    children?: React.ReactNode
    onClose?: () => void
  }) => open ? (
    <div role="dialog">
      {title ? <h2>{title}</h2> : null}
      {onClose ? <button type="button" data-testid="mock-modal-close" onClick={onClose}>닫기</button> : null}
      {children}
    </div>
  ) : null,
  Input: ({ label, error, ...props }: any) => (
    <div>
      {label ? <span>{label}</span> : null}
      <input {...props} />
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
  PartnerAutocomplete: ({ value, onChange, label, disabled }: any) => (
    <label>
      {label ? <span>{label}</span> : null}
      <input
        data-testid="tax-invoice-partner-autocomplete"
        disabled={disabled}
        value={value?.name ?? ''}
        onChange={(event) => onChange({
          id: 'partner-uuid-from-search',
          partnerCode: 'P-SEARCH',
          name: event.target.value,
          bizNo: '999-99-99999',
        })}
      />
    </label>
  ),
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/taxInvoiceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/taxInvoiceApi')>()
  return {
    ...actual,
    createTaxInvoice: mocks.createTaxInvoice,
    getTaxInvoice: mocks.getTaxInvoice,
    issueTaxInvoice: mocks.issueTaxInvoice,
    updateTaxInvoice: mocks.updateTaxInvoice,
  }
})

vi.mock('../api/partnerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/partnerApi')>()
  return { ...actual, searchPartners: mocks.searchPartners }
})

vi.mock('../api/createAuditApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/createAuditApi')>()
  return {
    ...actual,
    taxInvoiceAuditApi: {
      listAuditLogs: mocks.listAuditLogs,
      revertToRevision: mocks.revertToRevision,
    },
  }
})

vi.mock('../realtime/AccountingRealtimeClient', () => ({
  TaxInvoiceRealtimeClient: {
    subscribe: (...args: unknown[]) => {
      mocks.realtimeSubscribe(...args)
      return { abort: vi.fn() }
    },
  },
}))

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

import { TaxInvoiceFormPage } from './TaxInvoiceFormPage'

function detailFor(id: string): TaxInvoiceDetail {
  return {
    id,
    taxInvoiceNo: null,
    status: 'DRAFT',
    invoiceType: 'SALES',
    partnerId: 'partner-uuid-existing',
    partnerCode: 'P-EXIST-001',
    partnerName: '기존거래처',
    partnerBusinessNo: '111-11-11111',
    partnerAddress: '서울시 강남구',
    supplyDate: '2026-07-01',
    description: '기존 세금계산서 비고',
    supplyAmount: '100000',
    vatAmount: '10000',
    totalAmount: '110000',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    eTaxExternalId: null,
    createdAt: '2026-07-01T09:00:00+09:00',
    lines: [
      {
        lineId: 'line-uuid-1',
        lineNo: 0,
        itemName: '공조설비 A',
        specification: '실외기',
        unit: null,
        quantity: '2',
        unitPrice: '50000',
        supplyAmount: '100000',
        vatAmount: '10000',
        memo: null,
      },
    ],
  } as unknown as TaxInvoiceDetail
}

function renderPage(path = '/accounting/tax-invoices/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.listAuditLogs.mockResolvedValue([])
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/accounting/tax-invoices/new" element={<TaxInvoiceFormPage />} />
            <Route path="/accounting/tax-invoices/:id/edit" element={<TaxInvoiceFormPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaxInvoiceFormPage', () => {
  it('편집 모드는 기존 세금계산서를 hydrate하고 임시저장 시 updateTaxInvoice를 호출한다', async () => {
    const detail = detailFor('tax-invoice-1')
    mocks.getTaxInvoice.mockResolvedValue(detail)
    mocks.updateTaxInvoice.mockResolvedValue(detail)

    renderPage('/accounting/tax-invoices/tax-invoice-1/edit')

    expect(await screen.findByTestId('tax-invoice-form-partner-name')).toHaveProperty('value', '기존거래처')
    expect(screen.getByTestId('tax-invoice-form-supply-date')).toHaveProperty('value', '2026-07-01')
    expect(screen.getByTestId('tax-invoice-form-line-0-item-name')).toHaveProperty('value', '공조설비 A')

    fireEvent.click(screen.getByTestId('tax-invoice-form-save-button'))
    await waitFor(() => expect(mocks.updateTaxInvoice).toHaveBeenCalledTimes(1))
    expect(mocks.updateTaxInvoice).toHaveBeenCalledWith('tax-invoice-1', expect.objectContaining({
      partnerId: 'partner-uuid-existing',
      partnerName: '기존거래처',
      supplyDate: '2026-07-01',
    }))
  })

  it('신규 작성 모드에서 거래처 미선택 상태로 저장하면 여전히 필수입력 오류를 표시한다 (정상 경로 검증 유지 — K2)', async () => {
    renderPage('/accounting/tax-invoices/new')
    await screen.findByTestId('tax-invoice-form-save-button')

    fireEvent.click(screen.getByTestId('tax-invoice-form-save-button'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('선택한 거래처의 식별자를 확인할 수 없습니다. 거래처를 다시 검색해 선택하세요.')
    expect(mocks.createTaxInvoice).not.toHaveBeenCalled()
  })

  it('미조회 상태를 0회로 표시하지 않고, endpoint 부재 404는 모달 재개방 때 재요청하지 않는다', async () => {
    const id = 'tax-invoice-audit-404'
    mocks.getTaxInvoice.mockResolvedValue(detailFor(id))
    const error = new AxiosError('HTTP 404', undefined, undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: {},
      data: {},
    })
    renderPage(`/accounting/tax-invoices/${id}/edit`)
    mocks.listAuditLogs.mockRejectedValue(error)
    await screen.findByTestId('tax-invoice-form-partner-name')

    expect(mocks.listAuditLogs).not.toHaveBeenCalled()
    expect(screen.getByTestId('tax-invoice-form-revision-count').textContent).toContain('수정 이력 미조회')

    fireEvent.click(screen.getByTestId('tax-invoice-form-version-history-open'))
    await screen.findByTestId('tax-invoice-form-version-history-error')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('mock-modal-close'))
    fireEvent.click(screen.getByTestId('tax-invoice-form-version-history-open'))
    await screen.findByTestId('tax-invoice-form-version-history-error')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)
  })

  it('정상 이력은 모달 재개방 때 재요청하지 않고 무효화 후 최신 이력을 다시 읽는다', async () => {
    const id = 'tax-invoice-audit-cache'
    mocks.getTaxInvoice.mockResolvedValue(detailFor(id))

    const { client } = renderPage(`/accounting/tax-invoices/${id}/edit`)
    mocks.listAuditLogs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        revisionNo: 2,
        field: 'description',
        beforeValue: '기존 세금계산서 비고',
        afterValue: '최신 비고',
        actorId: 'actor-2',
        actorName: '회계담당자',
        changedAt: '2026-08-10T17:00:00+09:00',
      }])
    await screen.findByTestId('tax-invoice-form-partner-name')

    fireEvent.click(screen.getByTestId('tax-invoice-form-version-history-open'))
    await screen.findByTestId('tax-invoice-form-version-history-empty')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('mock-modal-close'))
    fireEvent.click(screen.getByTestId('tax-invoice-form-version-history-open'))
    await screen.findByTestId('tax-invoice-form-version-history-empty')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('mock-modal-close'))
    await client.invalidateQueries({
      queryKey: ['accounting', 'tax-invoice', id, 'audit-logs'],
    })
    fireEvent.click(screen.getByTestId('tax-invoice-form-version-history-open'))
    await screen.findByTestId('tax-invoice-form-version-history-row-2')
    expect(mocks.listAuditLogs).toHaveBeenCalledTimes(2)
  })

  it('SSE 재조회(refetch)는 로컬 편집을 리셋한다(#825 R1 M1 기존 시맨틱 보존 — K4)', async () => {
    const detail = detailFor('tax-invoice-4')
    mocks.getTaxInvoice.mockResolvedValue(detail)

    const { client } = renderPage('/accounting/tax-invoices/tax-invoice-4/edit')
    expect(await screen.findByTestId('tax-invoice-form-partner-name')).toHaveProperty('value', '기존거래처')

    fireEvent.change(screen.getByTestId('tax-invoice-form-description'), { target: { value: '사용자 미저장 비고' } })
    expect(screen.getByTestId('tax-invoice-form-description')).toHaveProperty('value', '사용자 미저장 비고')

    // SSE invalidate → refetch 시뮬레이션 — react-query 는 구조적 공유(structural sharing)로
    // deep-equal 데이터는 참조를 재사용하므로(effect 의 deps 가 안 바뀌어 재실행되지 않음),
    // 실제로 뭔가 바뀐 refetch 를 표현하려고 무관한 필드(partnerAddress)를 하나 바꿔 새 참조를
    // 강제한다. #825 R1 M1: 외부 refetch 는 description 포함 미저장 수기 입력 전부를 폐기하는
    // 기존 시맨틱이므로, description 자체는 안 바뀌어도 서버 값으로 리셋되어야 한다. 이
    // 테스트는 K1 레이스 창을 재현하는 게 아니라 "결국 재하이드레이트되는지"만 보므로 waitFor
    // 로 충분히 settle 시킨다(act 가 effect flush 까지 기다려준다).
    client.setQueryData(['accounting', 'tax-invoice', 'tax-invoice-4'], {
      ...detail,
      partnerAddress: '서울시 강남구 (refetch 갱신)',
    })

    await waitFor(() => expect(screen.getByTestId('tax-invoice-form-description'))
      .toHaveProperty('value', '기존 세금계산서 비고'))
  })

  it('#831-hydrate 계열: detailQuery 커밋 직후 hydrate effect 가 아직 실행되지 않은 프레임에서 저장해도 초기값 기반 "필수 입력" 오류가 기존 세금계산서에 대해 뜨지 않는다 (K1/K3)', async () => {
    const id = 'tax-invoice-race'
    const detail = detailFor(id)
    // getTaxInvoice 를 영원히 pending 으로 둔다 — react-query 의 실 fetch 경로를 타지 않아야
    // "언제 commit 되는지" 완전히 통제할 수 있다(#831-hydrate H4 기법과 동일 —
    // client.setQueryData 로 캐시에 직접 주입).
    mocks.getTaxInvoice.mockImplementation(() => new Promise(() => {}))
    mocks.updateTaxInvoice.mockResolvedValue(detail)

    const { client } = renderPage(`/accounting/tax-invoices/${id}/edit`)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('세금계산서 불러오는 중'))

    client.setQueryData(['accounting', 'tax-invoice', id], detail)
    // 매크로태스크 — MessageChannel 로 직접 만든다. setTimeout(fn,0) 은 WHATWG 스펙상
    // "중첩 타이머 4ms 클램프" 대상이라 React 스케줄러의 MessageChannel 기반 flush 와 큐
    // 순서가 실행 컨텍스트(파일 내 이전 테스트 유무 등)에 따라 뒤집힐 수 있음을 실측
    // 확인했다(ProductFormPage #831-hydrate 테스트 설계 중 발견). React 스케줄러와 동일한
    // MessageChannel 매크로태스크를 직접 만들면 이 클램프 편차 없이 결정적이다.
    //
    // #831-hydrate 계열 4파일 통일 기법(2026-07-26 PM 지적) — 매크로태스크를 정확히 1틱씩
    // 만들고, 그때마다 마이크로태스크를 흘려 "커밋을 처음 관측하는 순간" 즉시 멈춘다(더
    // 돌리지 않는다 — pre-fix 코드에서 hydrate effect 의 매크로태스크까지 우연히 넘어가는
    // 일이 없다). CashReceiptFormPage 는 부수 상태가 더 많아 2틱이 필요했던 반면 이 파일은
    // 1틱으로 충분함을 실측했지만, 다른 실행 컨텍스트에서도 안전하도록 동일한 상한 있는
    // 재시도 루프 구조를 쓴다.
    let saveButton: HTMLElement | null = null
    for (let macroTick = 0; macroTick < 10 && !saveButton; macroTick++) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(undefined)
      })
      saveButton = screen.queryByTestId('tax-invoice-form-save-button')
      // 마이크로태스크만 정밀하게 추가로 흘려보낸다 — 매크로태스크는 섞이지 않으므로 구
      // hydrate effect 가 끼어들 수 없다.
      for (let microTick = 0; microTick < 300 && !saveButton; microTick++) {
        await Promise.resolve()
        saveButton = screen.queryByTestId('tax-invoice-form-save-button')
      }
    }
    if (!saveButton) {
      throw new Error('detailQuery 커밋을 관측하지 못했다 (매크로 10틱 + 매 틱마다 마이크로 300틱)')
    }

    fireEvent.click(saveButton)
    // handleSave→buildBody 의 동기 구간 + react-query 내부 마이크로태스크 전파가 정리되도록
    // 마이크로태스크만 추가로 흘려보낸다(매크로태스크 없음 — 구 hydrate effect 는 여전히
    // 끼어들 수 없다).
    for (let tick = 0; tick < 50; tick++) await Promise.resolve()

    // K1 — 아직 채워지지 않은 초기값(partner 미선택·partnerName='') 기준 오류가 실제
    // 세금계산서에 대해 뜨지 않는다.
    const alert = screen.queryByRole('alert')
    expect(alert).toBeNull()

    // 저장이 실제로 hydrate 된 값으로 정상 진행된다(막히지 않는다).
    await waitFor(() => expect(mocks.updateTaxInvoice).toHaveBeenCalledTimes(1))
    expect(mocks.updateTaxInvoice).toHaveBeenCalledWith(id, expect.objectContaining({
      partnerId: 'partner-uuid-existing',
      partnerName: '기존거래처',
      supplyDate: '2026-07-01',
    }))
  })
})
