// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// CollaborativeTextField 를 stub 으로 대체해 패널이 넘기는 props(배선)만 단언 — 실 provider/네트워크 회피.
vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: (props: {
    documentId: string
    basePath: string
    fieldName: string
    label: string
    readOnly?: boolean
  }) => (
    <div
      data-testid="memo-coedit-stub"
      data-document-id={props.documentId}
      data-base-path={props.basePath}
      data-field-name={props.fieldName}
      data-read-only={String(props.readOnly)}
    >
      {props.label}
    </div>
  ),
}))

vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/PartnerOrderCollabRealtimeClient', () => ({
  PartnerOrderCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/partnerOrderCollab', () => ({
  getPartnerOrderCollabComments: vi.fn(() => Promise.resolve([])),
  getPartnerOrderCollabEdits: vi.fn(() => Promise.resolve([])),
  addPartnerOrderCollabComment: vi.fn(),
  deletePartnerOrderCollabComment: vi.fn(),
  resolvePartnerOrderCollabComment: vi.fn(),
  commitPartnerOrderCollabEdit: vi.fn(),
}))

import { PartnerOrderCollaborationPanel } from './PartnerOrderCollaborationPanel'

function renderPanel(orderId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PartnerOrderCollaborationPanel
        orderId={orderId}
        currentValues={{ memo: null, dueDate: null, lines: [] }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('PartnerOrderCollaborationPanel coedit 메모 배선', () => {
  it('협업 메모 필드를 documentId/basePath(encodeURIComponent)/fieldName=memo 로 배선한다', () => {
    renderPanel('2099/06/27-COED-1')
    const stub = screen.getByTestId('memo-coedit-stub')
    expect(stub.textContent).toBe('협업 메모')
    expect(stub.getAttribute('data-document-id')).toBe('2099/06/27-COED-1')
    expect(stub.getAttribute('data-base-path')).toBe('/partner-orders/2099%2F06%2F27-COED-1')
    expect(stub.getAttribute('data-field-name')).toBe('memo')
    expect(stub.getAttribute('data-read-only')).toBe('false')
  })

  it('편집 권한이 없으면 협업 메모를 readOnly 로 배선한다', () => {
    canAccessMock.mockReturnValue(false)
    renderPanel('2099/06/27-COED-2')
    expect(screen.getByTestId('memo-coedit-stub').getAttribute('data-read-only')).toBe('true')
  })
})
