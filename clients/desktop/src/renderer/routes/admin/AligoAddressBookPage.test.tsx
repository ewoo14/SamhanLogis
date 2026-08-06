// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const permissionState = vi.hoisted(() => ({ canSync: true }))
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccess: () => permissionState.canSync,
    isLoading: false,
  }),
}))
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const syncAligoAddressBookMock = vi.fn()
vi.mock('../../api/aligoAddressBookApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/aligoAddressBookApi')>()
  return {
    ...actual,
    syncAligoAddressBook: (...args: unknown[]) => syncAligoAddressBookMock(...args),
  }
})

import { AligoAddressBookPage } from './AligoAddressBookPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const buildUi = () => (
    <QueryClientProvider client={queryClient}>
      <AligoAddressBookPage />
    </QueryClientProvider>
  )
  const view = render(buildUi())
  return {
    ...view,
    rerenderPage: () => view.rerender(buildUi()),
  }
}

afterEach(() => {
  cleanup()
  permissionState.canSync = true
  syncAligoAddressBookMock.mockReset()
})

describe('AligoAddressBookPage 권한·오류 상태', () => {
  it('VIEW 전용 사용자는 실행 불가 원인을 보고 실행 안내를 받지 않는다', () => {
    permissionState.canSync = false

    renderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('admin-aligo-csv-btn') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeTruthy()
    expect(screen.queryByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toBeNull()

    const syncButton = screen.getByTestId('admin-aligo-sync-btn')
    fireEvent.click(syncButton)
    fireEvent.keyDown(syncButton, { key: 'Enter' })
    fireEvent.keyDown(syncButton, { key: ' ' })
    expect(syncAligoAddressBookMock).not.toHaveBeenCalled()
  })

  it('UPDATE 권한 보유 사용자는 최초 화면에서 실행 안내와 활성 버튼을 본다', () => {
    renderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toBeTruthy()
  })

  it('HTTP 403이면 권한 원인을 표시하고 같은 요청을 다시 보내지 못하게 한다', async () => {
    syncAligoAddressBookMock.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('동기화 권한이 없습니다'))
    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText(/잠시 후 다시 시도해 주세요/)).toBeNull()
    expect(screen.queryByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toBeNull()
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(1)
  })

  it('403 결과 뒤 UPDATE가 회수되어도 서버 권한 오류보다 현재 권한 원인을 우선한다', async () => {
    syncAligoAddressBookMock.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    const view = renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('동기화 권한이 없습니다'))

    permissionState.canSync = false
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeTruthy()
    expect(screen.queryByText(/잠시 후 다시 시도해 주세요/)).toBeNull()
    expect(screen.queryByText(/화면을 새로고침해 주세요/)).toBeNull()
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'HTTP 500', error: Object.assign(new Error('Server error'), { response: { status: 500 } }) },
    { name: '네트워크 오류', error: new Error('Network error') },
  ])('$name이면 기존 재시도 가능한 오류 경로를 유지한다', async ({ error }) => {
    syncAligoAddressBookMock.mockRejectedValue(error)

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('잠시 후 다시 시도해 주세요'))
    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/동기화 권한이 없습니다/)).toBeNull()
  })

  it('응답 data가 null이면 결과를 확인할 수 있다고 가장하지 않고 재시도할 수 있다', async () => {
    syncAligoAddressBookMock.mockResolvedValue(null)

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('동기화 결과를 확인할 수 없습니다'))
    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toBeNull()
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
  })

  it('같은 mount의 idle 상태에서 UPDATE가 회수되면 권한 부재 원인을 즉시 표시한다', () => {
    const view = renderPage()

    permissionState.canSync = false
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeTruthy()
    expect(screen.queryByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toBeNull()
    expect(syncAligoAddressBookMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'HTTP 500',
      error: Object.assign(new Error('Server error'), { response: { status: 500 } }),
    },
    { name: '네트워크 오류', error: new Error('Network error') },
  ])('$name 뒤 UPDATE가 회수되면 재시도 대신 권한 원인을 표시하고 재부여 시 회복한다', async ({ error }) => {
    syncAligoAddressBookMock.mockRejectedValueOnce(error)

    const view = renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('잠시 후 다시 시도해 주세요'))
    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)

    permissionState.canSync = false
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeTruthy()
    expect(screen.queryByText(/잠시 후 다시 시도해 주세요/)).toBeNull()
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(1)

    permissionState.canSync = true
    syncAligoAddressBookMock.mockResolvedValueOnce({
      added: 1,
      updated: 0,
      skipped: 0,
      failed: [],
      deliveryStatus: 'NOT_DELIVERED',
    })
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/잠시 후 다시 시도해 주세요/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 알리고 전달 0건'))
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(2)
  })

  it('null 결과 뒤 UPDATE가 회수되면 null 재시도 안내를 숨기고 재부여 시 재시도할 수 있다', async () => {
    syncAligoAddressBookMock.mockResolvedValueOnce(null)

    const view = renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('동기화 결과를 확인할 수 없습니다'))

    permissionState.canSync = false
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeTruthy()
    expect(screen.queryByText(/동기화 결과를 확인할 수 없습니다/)).toBeNull()
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(1)

    permissionState.canSync = true
    syncAligoAddressBookMock.mockResolvedValueOnce({
      added: 0,
      updated: 0,
      skipped: 0,
      failed: [],
      deliveryStatus: 'NOT_DELIVERED',
    })
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/동기화 결과를 확인할 수 없습니다/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 알리고 전달 0건'))
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(2)
  })
})

describe('AligoAddressBookPage 외부 전달 상태 표시', () => {
  it('mock 미전달 결과에서는 신규·변경 양수를 성공 건수로 표시하지 않는다', async () => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 7,
      updated: 2,
      skipped: 0,
      failed: [],
      deliveryStatus: 'NOT_DELIVERED',
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 알리고 전달 0건'))
    expect(screen.getByText(/현재 외부 전달 없는 mock 모드입니다/)).toBeTruthy()
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 0')
    expect(screen.getByTestId('admin-aligo-result-updated').textContent).toContain('변경 0')
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(1)
  })

  it('실제 전달 결과에서는 신규·변경 건수를 표시한다', async () => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 3,
      updated: 1,
      skipped: 2,
      failed: [],
      deliveryStatus: 'DELIVERED',
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 전달된 결과'))
    expect(screen.queryByText(/현재 외부 전달 없는 mock 모드입니다/)).toBeNull()
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 3')
    expect(screen.getByTestId('admin-aligo-result-updated').textContent).toContain('변경 1')
  })

  it('chunk 혼합 결과에서는 일부 전달 상태를 사용자에게 표시한다', async () => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 2,
      updated: 0,
      skipped: 1,
      failed: ['chunk#2 HTTP 500'],
      deliveryStatus: 'PARTIALLY_DELIVERED',
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('일부 연락처만 실제'))
    expect(screen.queryByText(/현재 외부 전달 없는 mock 모드입니다/)).toBeNull()
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 2')
    expect(screen.getByTestId('admin-aligo-result-failed').textContent).toContain('실패 1')
  })

  it.each([
    {
      name: 'NOT_DELIVERED',
      deliveryStatus: 'NOT_DELIVERED' as const,
      failed: [] as string[],
      statusText: '실제 알리고 전달 0건',
      showsMockNotice: true,
    },
    {
      name: 'DELIVERED',
      deliveryStatus: 'DELIVERED' as const,
      failed: [] as string[],
      statusText: '실제 전달된 결과',
      showsMockNotice: false,
    },
    {
      name: 'PARTIALLY_DELIVERED',
      deliveryStatus: 'PARTIALLY_DELIVERED' as const,
      failed: ['chunk#2 HTTP 500'],
      statusText: '일부 연락처만 실제',
      showsMockNotice: false,
    },
  ])('건수 0인 $name 결과도 전달 문구와 모순되지 않는다', async ({
    deliveryStatus,
    failed,
    statusText,
    showsMockNotice,
  }) => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 0,
      updated: 0,
      skipped: 1,
      failed,
      deliveryStatus,
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain(statusText))
    if (showsMockNotice) {
      expect(screen.getByText(/현재 외부 전달 없는 mock 모드입니다/)).toBeTruthy()
    } else {
      expect(screen.queryByText(/현재 외부 전달 없는 mock 모드입니다/)).toBeNull()
    }
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 0')
    expect(screen.getByTestId('admin-aligo-result-updated').textContent).toContain('변경 0')
    expect(screen.getByTestId('admin-aligo-result-failed').textContent)
      .toContain(`실패 ${failed.length}`)
  })

  it.each([
    {
      name: 'NOT_DELIVERED',
      response: {
        added: 7,
        updated: 2,
        skipped: 1,
        failed: [] as string[],
        deliveryStatus: 'NOT_DELIVERED' as const,
      },
      statusText: '실제 알리고 전달 0건',
    },
    {
      name: 'DELIVERED',
      response: {
        added: 3,
        updated: 1,
        skipped: 0,
        failed: [] as string[],
        deliveryStatus: 'DELIVERED' as const,
      },
      statusText: '실제 전달된 결과',
    },
    {
      name: 'PARTIALLY_DELIVERED',
      response: {
        added: 2,
        updated: 1,
        skipped: 0,
        failed: ['chunk#2 HTTP 500'],
        deliveryStatus: 'PARTIALLY_DELIVERED' as const,
      },
      statusText: '일부 연락처만 실제',
    },
  ])('$name 200 결과 뒤 UPDATE가 회수되어도 결과·CSV 고지를 보존한다', async ({ response, statusText }) => {
    syncAligoAddressBookMock.mockResolvedValueOnce(response)

    const view = renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain(statusText))

    permissionState.canSync = false
    view.rerenderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeTruthy()
    expect(screen.queryByText(/잠시 후 다시 시도해 주세요/)).toBeNull()
    expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain(statusText)
    expect(screen.getByText(/CSV 다운로드도 알리고 전달 완료를 뜻하지 않습니다/)).toBeTruthy()
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(1)
  })

  it('403 잠금은 화면 새로고침으로 해소된 실제 UPDATE 권한과 다음 정상 POST를 허용한다', async () => {
    syncAligoAddressBookMock.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    )

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toContain('동기화 권한이 없습니다'))
    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(true)

    permissionState.canSync = true
    cleanup()
    syncAligoAddressBookMock.mockResolvedValueOnce({
      added: 1,
      updated: 1,
      skipped: 0,
      failed: [],
      deliveryStatus: 'DELIVERED',
    })
    renderPage()

    expect((screen.getByTestId('admin-aligo-sync-btn') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))
    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 전달된 결과'))
    expect(syncAligoAddressBookMock).toHaveBeenCalledTimes(2)
  })
})
