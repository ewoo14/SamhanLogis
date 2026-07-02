// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DISPATCH_BOARD_QUERY_KEY } from './useUnDispatchedSlipsQuery'

const apiMocks = vi.hoisted(() => ({
  restoreVehicleGroup: vi.fn(() => Promise.resolve()),
  restoreSlipFromGroup: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../../api/dispatchTask', async () => {
  const actual = await vi.importActual<typeof import('../../../api/dispatchTask')>(
    '../../../api/dispatchTask',
  )
  return {
    ...actual,
    restoreVehicleGroup: apiMocks.restoreVehicleGroup,
    restoreSlipFromGroup: apiMocks.restoreSlipFromGroup,
  }
})

import {
  dispatchTaskQueryKey,
  useRestoreSlipFromGroupMutation,
  useRestoreVehicleGroupMutation,
} from './useDispatchTask'

afterEach(() => {
  cleanup()
  apiMocks.restoreVehicleGroup.mockClear()
  apiMocks.restoreSlipFromGroup.mockClear()
})

describe('dispatch restore mutations', () => {
  it('차량 그룹 복원 성공 시 상세/보드/완료배차 목록 3키를 invalidate 한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    let restore: ReturnType<typeof useRestoreVehicleGroupMutation> | null = null

    function Harness() {
      restore = useRestoreVehicleGroupMutation('task-1')
      return null
    }

    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    )

    await act(async () => {
      await restore!.mutateAsync('group-1')
    })

    await waitFor(() => expect(apiMocks.restoreVehicleGroup).toHaveBeenCalledWith('task-1', 'group-1'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: dispatchTaskQueryKey('task-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DISPATCH_BOARD_QUERY_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dispatchTasks'] })
  })

  it('전표 매핑 복원 성공 시 상세/보드/완료배차 목록 3키를 invalidate 한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    let restore: ReturnType<typeof useRestoreSlipFromGroupMutation> | null = null

    function Harness() {
      restore = useRestoreSlipFromGroupMutation('task-1')
      return null
    }

    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    )

    await act(async () => {
      await restore!.mutateAsync({ groupId: 'group-1', slipId: 'slip-1' })
    })

    await waitFor(() =>
      expect(apiMocks.restoreSlipFromGroup).toHaveBeenCalledWith('task-1', 'group-1', 'slip-1'),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: dispatchTaskQueryKey('task-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: DISPATCH_BOARD_QUERY_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dispatchTasks'] })
  })
})
