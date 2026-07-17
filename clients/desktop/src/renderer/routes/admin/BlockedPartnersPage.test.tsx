// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listBlockedPartnersMock = vi.fn()
const addBlockedPartnerMock = vi.fn()
vi.mock('../../api/blockedPartnerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/blockedPartnerApi')>()
  return {
    ...actual,
    listBlockedPartners: (...args: unknown[]) => listBlockedPartnersMock(...args),
    addBlockedPartner: (...args: unknown[]) => addBlockedPartnerMock(...args),
    unblockPartner: vi.fn(),
    importBlockedPartnersCsv: vi.fn(),
  }
})

const searchPartnersMock = vi.fn()
vi.mock('../../api/partnerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/partnerApi')>()
  return {
    ...actual,
    searchPartners: (...args: unknown[]) => searchPartnersMock(...args),
  }
})

import { BlockedPartnersPage } from './BlockedPartnersPage'

const emptyPage = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

const PARTNER_LA = { partnerCode: '1234567890', name: '엘에이시스템에어', bizNo: '123-45-67890' }
const PARTNER_MIRAE = { partnerCode: '4567890123', name: '미래시스템', bizNo: '456-78-90123' }

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BlockedPartnersPage />
    </QueryClientProvider>,
  )
}

/**
 * 단건 차단 다이얼로그를 열고 Modal initialFocusRef 계약(rAF 실포커스)이 소진될 때까지
 * 대기한다 — 대기 없이 draft 를 타이핑하면 뒤늦은 rAF focus 가 handleFocus 로 draft/검색을
 * 리셋해 후보가 뜨지 않는 경합이 생긴다 (#825 CM3 계약을 테스트 결정성에 재사용).
 */
async function openAddDialog(): Promise<HTMLInputElement> {
  fireEvent.click(screen.getByTestId('admin-blocked-add-button'))
  const partnerInput = (await screen.findByTestId(
    'admin-blocked-add-partner-code-input',
  )) as HTMLInputElement
  await waitFor(() => expect(document.activeElement).toBe(partnerInput))
  return partnerInput
}

async function typeAndPick(partnerInput: HTMLInputElement, query: string, optionName: RegExp) {
  fireEvent.focus(partnerInput)
  fireEvent.change(partnerInput, { target: { value: query } })
  fireEvent.mouseDown(await screen.findByRole('option', { name: optionName }))
}

afterEach(() => {
  cleanup()
  listBlockedPartnersMock.mockReset()
  addBlockedPartnerMock.mockReset()
  searchPartnersMock.mockReset()
})

/**
 * [#825 재수렴 #5] 발송금지 단건 등록 미확정 draft 가드 (DailyClosingPage #4 와 동일 root).
 *
 * <p>AsyncAutocomplete 는 목록 선택 전까지 onChange 미발화 — P1 선택 후 P2 검색어를
 * 타이핑만 한 채(또는 재포커스로 입력이 비워진 채) '차단 등록'을 누르면 draft 가 무시되고
 * 확정 선택(P1) payload 로 차단된다(오대상). 등록 시점 입력 표시값과 확정 선택의 불일치를
 * 차단(FormField role=alert 안내)하고, 목록 선택으로 정합이 회복되면 등록이 통과됨을 고정한다.
 */
describe('BlockedPartnersPage 단건 차단 미확정 draft 가드 (#825 재수렴 #5)', () => {
  it('P1 선택 후 P2 검색어 타이핑 중(미선택) 등록하면 P1 오대상 차단을 막고, 목록 선택 확정 후 등록은 P2 payload 로 통과한다', async () => {
    listBlockedPartnersMock.mockResolvedValue(emptyPage)
    addBlockedPartnerMock.mockResolvedValue({
      id: 'block-vitest-001',
      partnerCode: PARTNER_MIRAE.partnerCode,
      businessNameSnapshot: PARTNER_MIRAE.name,
      blockReason: null,
      blockedAt: '2026-07-18T10:00:00',
      source: 'MANUAL',
    })
    searchPartnersMock.mockImplementation((q: string) =>
      Promise.resolve(q.includes('미래') ? [PARTNER_MIRAE] : [PARTNER_LA]),
    )

    renderPage()
    const partnerInput = await openAddDialog()

    // P1(엘에이시스템에어) 선택 확정
    await typeAndPick(partnerInput, '엘에이', /엘에이/)
    expect(partnerInput.value).toBe('엘에이시스템에어')

    // P2 검색어를 타이핑만 (후보 표시·미선택 draft)
    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '미래' } })
    await screen.findByRole('option', { name: /미래/ })

    // 등록 → 차단: P1 payload 로 조용히 차단되지 않는다 + role=alert 안내(목록 선택 유도)
    fireEvent.click(screen.getByRole('button', { name: '차단 등록' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('목록에서 선택한 뒤 등록하세요')
    expect(addBlockedPartnerMock).not.toHaveBeenCalled()

    // 목록에서 P2 선택 확정 → 안내 즉시 소거(onChange 소거 경로)
    fireEvent.mouseDown(screen.getByRole('option', { name: /미래/ }))
    expect(partnerInput.value).toBe('미래시스템')
    expect(screen.queryByRole('alert')).toBeNull()

    // 재등록 → 통과 + 확정 선택(P2) partnerCode payload → 성공 시 다이얼로그 닫힘
    // (mutationFn 직접 참조라 TanStack 이 2번째 인자(context)를 덧붙임 — 1번째 인자만 단언)
    fireEvent.click(screen.getByRole('button', { name: '차단 등록' }))
    await waitFor(() => expect(addBlockedPartnerMock).toHaveBeenCalledTimes(1))
    expect(addBlockedPartnerMock.mock.calls[0]![0]).toEqual({ partnerCode: '4567890123' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('선택(P1) 후 재포커스로 입력이 비워진 채(빈 draft) 등록하면 잔존 선택 오대상 차단을 막고 재선택을 안내한다', async () => {
    listBlockedPartnersMock.mockResolvedValue(emptyPage)
    addBlockedPartnerMock.mockResolvedValue({
      id: 'block-vitest-002',
      partnerCode: PARTNER_LA.partnerCode,
      businessNameSnapshot: PARTNER_LA.name,
      blockReason: null,
      blockedAt: '2026-07-18T10:00:00',
      source: 'MANUAL',
    })
    searchPartnersMock.mockResolvedValue([PARTNER_LA])

    renderPage()
    const partnerInput = await openAddDialog()

    // P1 선택 확정
    await typeAndPick(partnerInput, '엘에이', /엘에이/)
    expect(partnerInput.value).toBe('엘에이시스템에어')

    // 재포커스 — AsyncAutocomplete 가 draft 를 '' 로 초기화해 표시가 비워진다 (선택은 잔존)
    fireEvent.focus(partnerInput)
    expect(partnerInput.value).toBe('')

    // 등록 → 차단: 화면은 빈 입력인데 P1 payload 로 조용히 차단되지 않는다.
    // 안내는 잔존 선택(P1 상호)을 드러내고 목록 재선택을 유도한다.
    fireEvent.click(screen.getByRole('button', { name: '차단 등록' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('엘에이시스템에어')
    expect(alert.textContent).toContain('다시 선택한 뒤 등록하세요')
    expect(addBlockedPartnerMock).not.toHaveBeenCalled()

    // 목록에서 다시 선택해 화면=상태 정합 회복 → 등록 통과(P1 payload)
    await typeAndPick(partnerInput, '엘에이', /엘에이/)
    expect(partnerInput.value).toBe('엘에이시스템에어')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '차단 등록' }))
    await waitFor(() => expect(addBlockedPartnerMock).toHaveBeenCalledTimes(1))
    expect(addBlockedPartnerMock.mock.calls[0]![0]).toEqual({ partnerCode: '1234567890' })
  })
})
