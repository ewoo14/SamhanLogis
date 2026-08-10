// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EditWarehouseModal } from './EditWarehouseModal'
import * as adminApi from '../api/adminApi'

vi.mock('../api/adminApi', () => ({
  listWarehouseAuditLogs: vi.fn(),
  revertAdminWarehouseRevision: vi.fn(),
  updateAdminWarehouse: vi.fn(),
}))

vi.mock('../realtime/WarehouseRealtimeClient', () => ({
  WarehouseRealtimeClient: {
    subscribe: vi.fn(() => ({ abort: vi.fn() })),
  },
}))

vi.mock('@samhan/design-system', () => {
  const FormGrid = Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { Full: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
  )
  return { FormGrid }
}, { virtual: true })

const ACTOR_UUID = '123e4567-e89b-12d3-a456-426614174000'
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

const WAREHOUSE: adminApi.AdminWarehouse = {
  id: 'warehouse-1',
  code: 'WH-001',
  name: '본사 창고',
  type: 'HEADQUARTERS',
  address: null,
  displayOrder: 1,
  description: null,
  createdAt: '2026-08-10T00:00:00',
  modifiedAt: '2026-08-10T00:00:00',
}

function auditRow(overrides: Partial<adminApi.WarehouseAuditLog> = {}): adminApi.WarehouseAuditLog {
  return {
    id: 'audit-1',
    entityId: WAREHOUSE.id,
    revisionNo: 1,
    actorId: ACTOR_UUID,
    actorName: null,
    actorColor: null,
    fieldName: 'name',
    oldValue: '이전 창고명',
    newValue: '새 창고명',
    changedAt: '2026-08-10T00:00:00',
    ...overrides,
  }
}

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <EditWarehouseModal warehouse={WAREHOUSE} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>,
  )
}

async function openAudit() {
  renderModal()
  fireEvent.click(screen.getByTestId('edit-warehouse-audit-toggle'))
  return screen.findByTestId('edit-warehouse-audit-revision-1')
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EditWarehouseModal 감사 변경자 표시', () => {
  it('actorName 없는 이력 행은 actorId UUID 전체·부분을 표시하지 않는다', async () => {
    vi.mocked(adminApi.listWarehouseAuditLogs).mockResolvedValue([auditRow()])

    const revision = await openAudit()

    expect(revision.textContent).toContain('변경자 미상')
    expect(revision.textContent).not.toContain(ACTOR_UUID)
    expect(revision.textContent).not.toContain(ACTOR_UUID.slice(0, 8))
  })

  it('과거 actorName 에 남은 UUID도 화면에 표시하지 않는다', async () => {
    vi.mocked(adminApi.listWarehouseAuditLogs).mockResolvedValue([
      auditRow({ actorName: ACTOR_UUID }),
    ])

    const revision = await openAudit()

    expect(revision.textContent).toContain('변경자 미상')
    expect(revision.textContent).not.toContain(ACTOR_UUID)
  })

  it('SYSTEM_ACTOR_ID 는 계속 시스템으로 표시한다', async () => {
    vi.mocked(adminApi.listWarehouseAuditLogs).mockResolvedValue([
      auditRow({ actorId: SYSTEM_ACTOR_ID }),
    ])

    const revision = await openAudit()

    expect(revision.textContent).toContain('시스템')
    expect(revision.textContent).not.toContain(SYSTEM_ACTOR_ID)
  })

  it('정상 actorName 이 있는 이력 행은 이름을 그대로 표시한다', async () => {
    vi.mocked(adminApi.listWarehouseAuditLogs).mockResolvedValue([
      auditRow({ actorName: '김감사' }),
    ])

    const revision = await openAudit()

    expect(revision.textContent).toContain('김감사')
    expect(revision.textContent).not.toContain(ACTOR_UUID.slice(0, 8))
  })

  it('되돌리기 버튼 조건은 fieldName 이 있고 isDeleted 가 아닌 경우로 유지한다', async () => {
    vi.mocked(adminApi.listWarehouseAuditLogs).mockResolvedValue([
      auditRow({ revisionNo: 1, fieldName: 'name' }),
      auditRow({ id: 'audit-2', revisionNo: 2, fieldName: 'isDeleted' }),
    ])

    renderModal()
    fireEvent.click(screen.getByTestId('edit-warehouse-audit-toggle'))

    expect(await screen.findByTestId('edit-warehouse-audit-revert-1')).toBeTruthy()
    expect(screen.queryByTestId('edit-warehouse-audit-revert-2')).toBeNull()
  })
})
