// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalLineDefaultApprover, ApprovalLineStructure } from '../api/approvalLineConfigApi'
import type { ApprovalTemplate } from '../api/groupwareApprovalTemplate'

const mocks = vi.hoisted(() => ({
  createGroupwareApproval: vi.fn(),
  addApprovalAttachmentReference: vi.fn(),
  uploadApprovalAttachmentFile: vi.fn(),
  fetchApprovalLineStructure: vi.fn(),
  fetchDefaultApprovers: vi.fn(),
  listActiveApprovalTemplates: vi.fn(),
  searchApprovers: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, loading: _loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  FormField: ({ label, render: renderField }: {
    label: string
    render: (props: { id: string; ariaDescribedBy?: string; invalid: boolean }) => React.ReactNode
  }) => (
    <label>
      {label}
      {renderField({ id: `field-${label}`, invalid: false })}
    </label>
  ),
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
  Select: ({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) => (
    <label>
      {label}
      <select {...props}>{children}</select>
    </label>
  ),
  Spinner: ({ label }: { label?: string }) => <span role="status">{label ?? '로딩 중'}</span>,
  TagChip: ({ label, value, onRemove, removeLabel: _removeLabel, ...props }: {
    label?: string
    value: string
    onRemove?: () => void
    removeLabel?: string
    'data-testid'?: string
  }) => (
    <span {...props}>
      {label ? `${label}: ` : ''}{value}
      {onRemove ? <button type="button" onClick={onRemove}>{value} 제거</button> : null}
    </span>
  ),
  MultiSelectAutocomplete: ({
    selected,
    onAdd,
    onRemove,
    search,
    renderOption,
    renderChip,
    getOptionKey,
    inputTestId,
    ariaLabel,
    listboxLabel,
  }: {
    selected: Array<{ userId: string }>
    onAdd: (item: { userId: string; name: string; department: string | null }) => void
    onRemove: (item: { userId: string }, index: number) => void
    search: (query: string) => Promise<Array<{ userId: string; name: string; department: string | null }>>
    renderOption: (item: { userId: string; name: string; department: string | null }) => React.ReactNode
    renderChip: (item: { userId: string; name: string; department: string | null }, index: number, onRemove: () => void) => React.ReactNode
    getOptionKey: (item: { userId: string }) => string
    inputTestId: string
    ariaLabel: string
    listboxLabel: string
  }) => {
    const [options, setOptions] = React.useState<Array<{ userId: string; name: string; department: string | null }>>([])
    return (
      <div>
        {selected.map((item, index) => (
          <React.Fragment key={item.userId}>
            {renderChip(item as { userId: string; name: string; department: string | null }, index, () => onRemove(item, index))}
          </React.Fragment>
        ))}
        <input
          data-testid={inputTestId}
          aria-label={ariaLabel}
          onChange={(event) => {
            void search(event.target.value).then(setOptions)
          }}
        />
        {options.length > 0 ? (
          <div role="listbox" aria-label={listboxLabel}>
            {options.map((option) => (
              <div
                key={getOptionKey(option)}
                role="option"
                aria-selected="false"
                onMouseDown={() => {
                  onAdd(option)
                  setOptions([])
                }}
              >
                {renderOption(option)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  },
}))

vi.mock('../api/groupwareApproval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/groupwareApproval')>()
  return { ...actual, createGroupwareApproval: mocks.createGroupwareApproval }
})
vi.mock('../api/groupwareApprovalAttachment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/groupwareApprovalAttachment')>()
  return {
    ...actual,
    addApprovalAttachmentReference: mocks.addApprovalAttachmentReference,
    uploadApprovalAttachmentFile: mocks.uploadApprovalAttachmentFile,
  }
})

vi.mock('../api/approvalLineConfigApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/approvalLineConfigApi')>()
  return {
    ...actual,
    fetchApprovalLineStructure: mocks.fetchApprovalLineStructure,
    fetchDefaultApprovers: mocks.fetchDefaultApprovers,
  }
})
vi.mock('../api/groupwareApprovalTemplate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/groupwareApprovalTemplate')>()
  return { ...actual, listActiveApprovalTemplates: mocks.listActiveApprovalTemplates }
})
vi.mock('../api/groupwareApprovalApprover', () => ({ searchApprovers: mocks.searchApprovers }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}))
vi.mock('../auth/authProvider', () => ({
  getAuthProvider: () => ({ getSession: vi.fn().mockResolvedValue({ userId: 'requester-1' }) }),
  isElectronPlatform: false,
  isCapacitorPlatform: false,
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

import { GroupwareApprovalCreatePage } from './GroupwareApprovalCreatePage'

const templates: ApprovalTemplate[] = [
  {
    id: 'template-expense',
    code: 'EXPENSE_REPORT',
    name: '지출결의서',
    description: null,
    active: true,
    displayOrder: 1,
    fields: [],
  },
  {
    id: 'template-leave',
    code: 'LEAVE_REQUEST',
    name: '휴가신청서',
    description: null,
    active: true,
    displayOrder: 2,
    fields: [],
  },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <GroupwareApprovalCreatePage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

async function selectTemplate(templateId: string): Promise<void> {
  const select = await screen.findByTestId('groupware-approval-create-template')
  fireEvent.change(select, { target: { value: templateId } })
}

async function addApprover(name: string): Promise<void> {
  const input = await screen.findByTestId('approver-search-input')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: name } })
  const option = await screen.findByRole('option', { name: new RegExp(name) }, { timeout: 3_000 })
  fireEvent.mouseDown(option)
}

beforeEach(() => {
  mocks.listActiveApprovalTemplates.mockResolvedValue(templates)
  mocks.searchApprovers.mockResolvedValue([
    { userId: 'user-manual', name: '김은지', department: '회계팀' },
  ])
  mocks.fetchDefaultApprovers.mockResolvedValue([
    { sequence: 1, label: '기본 결재자', userId: 'user-default', displayName: '기본결재자' },
  ])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GroupwareApprovalCreatePage 결재자 prefill 경합', () => {
  it('구조 조회 로딩 중 추가한 결재자를 조회 완료 뒤에도 유지한다', async () => {
    const structure = deferred<ApprovalLineStructure[]>()
    mocks.fetchApprovalLineStructure.mockReturnValue(structure.promise)
    const { client } = renderPage()

    await selectTemplate('template-expense')
    await addApprover('김은지')
    expect((await screen.findByTestId('approver-chip')).textContent).toContain('김은지')

    await act(async () => {
      structure.resolve([])
      await structure.promise
    })

    await waitFor(() => expect(mocks.fetchDefaultApprovers).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('approver-chip').textContent).toContain('김은지')
    expect(screen.queryByText('기본결재자')).toBeNull()
    client.clear()
  })

  it('사용자 수정이 없으면 중앙 결재선이 없는 템플릿의 기본 결재자를 적용하고 템플릿 전환 시 교체한다', async () => {
    mocks.fetchApprovalLineStructure.mockResolvedValue([])
    mocks.fetchDefaultApprovers.mockImplementation(async (documentType: string) => (
      documentType === 'GROUPWARE_EXPENSE_REPORT'
        ? [{ sequence: 1, label: '기본 결재자', userId: 'user-expense', displayName: '지출기본결재자' }]
        : [{ sequence: 1, label: '기본 결재자', userId: 'user-leave', displayName: '휴가기본결재자' }]
    ))
    const { client } = renderPage()

    await selectTemplate('template-expense')
    await waitFor(() => expect(screen.getByTestId('approver-chip').textContent).toContain('지출기본결재자'))

    await selectTemplate('template-leave')
    await waitFor(() => expect(screen.getByTestId('approver-chip').textContent).toContain('휴가기본결재자'))
    expect(screen.getByTestId('approver-chip').textContent).not.toContain('지출기본결재자')
    client.clear()
  })

  it('사용자 결재자를 추가한 뒤 템플릿을 전환하면 기존 결재자를 즉시 초기화하고 새 기본 결재자를 적용한다', async () => {
    const leaveDefaults = deferred<ApprovalLineDefaultApprover[]>()
    mocks.fetchApprovalLineStructure.mockResolvedValue([])
    mocks.fetchDefaultApprovers.mockImplementation((documentType: string) => (
      documentType === 'GROUPWARE_EXPENSE_REPORT'
        ? Promise.resolve([])
        : leaveDefaults.promise
    ))
    const { client } = renderPage()

    await selectTemplate('template-expense')
    await waitFor(() => expect(mocks.fetchDefaultApprovers).toHaveBeenCalledWith('GROUPWARE_EXPENSE_REPORT'))
    await addApprover('김은지')
    expect(screen.getByTestId('approver-chip').textContent).toContain('김은지')

    await selectTemplate('template-leave')
    await waitFor(() => expect(mocks.fetchDefaultApprovers).toHaveBeenCalledWith('GROUPWARE_LEAVE_REQUEST'))
    expect(screen.queryByTestId('approver-chip')).toBeNull()

    await act(async () => {
      leaveDefaults.resolve([
        { sequence: 1, label: '기본 결재자', userId: 'user-leave', displayName: '휴가기본결재자' },
      ])
      await leaveDefaults.promise
    })

    await waitFor(() => expect(screen.getByTestId('approver-chip').textContent).toContain('휴가기본결재자'))
    expect(screen.getByTestId('approver-chip').textContent).not.toContain('김은지')
    client.clear()
  })

  it('A에서 사용자 편집으로 증가한 버전을 B 전환 시 재베이스해 B 기본 결재자를 막지 않는다', async () => {
    mocks.fetchApprovalLineStructure.mockResolvedValue([])
    mocks.fetchDefaultApprovers.mockImplementation(async (documentType: string) => (
      documentType === 'GROUPWARE_EXPENSE_REPORT'
        ? []
        : [{ sequence: 1, label: '기본 결재자', userId: 'user-leave', displayName: '휴가기본결재자' }]
    ))
    const { client } = renderPage()

    await selectTemplate('template-expense')
    await waitFor(() => expect(mocks.fetchDefaultApprovers).toHaveBeenCalledWith('GROUPWARE_EXPENSE_REPORT'))
    await addApprover('김은지')
    expect(screen.getByTestId('approver-chip').textContent).toContain('김은지')

    await selectTemplate('template-leave')

    await waitFor(() => expect(screen.getByTestId('approver-chip').textContent).toContain('휴가기본결재자'))
    expect(screen.getByTestId('approver-chip').textContent).not.toContain('김은지')
    client.clear()
  })
})

describe('GroupwareApprovalCreatePage 원자적 참조 생성', () => {
  it('참조 목록을 결재 생성 요청에 포함하고 생성 후 정산 참조 endpoint를 순차 호출하지 않는다', async () => {
    mocks.fetchApprovalLineStructure.mockResolvedValue([])
    mocks.fetchDefaultApprovers.mockResolvedValue([])
    mocks.createGroupwareApproval.mockResolvedValue({ approvalId: 'approval-1' })
    const { client } = renderPage()

    await selectTemplate('template-expense')
    const title = await screen.findByTestId('groupware-approval-create-title')
    fireEvent.change(title, { target: { value: '정산 결재' } })
    await addApprover('김은지')
    fireEvent.click(await screen.findByTestId('groupware-approval-create-submit'))

    await waitFor(() => expect(mocks.createGroupwareApproval).toHaveBeenCalledTimes(1))
    expect(mocks.createGroupwareApproval).toHaveBeenCalledWith(expect.objectContaining({ references: [] }))
    expect(mocks.addApprovalAttachmentReference).not.toHaveBeenCalled()
    client.clear()
  })
})
