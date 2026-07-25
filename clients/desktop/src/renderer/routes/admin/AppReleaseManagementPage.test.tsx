// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppReleaseManagementPage } from './AppReleaseManagementPage'

vi.mock('../../../api/appVersion', () => ({
  listAppReleases: vi.fn(async () => []),
  createAppRelease: vi.fn(),
  updateAppRelease: vi.fn(),
  deleteAppRelease: vi.fn(),
  publishAppRelease: vi.fn(),
  unpublishAppRelease: vi.fn(),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppReleaseManagementPage />
    </QueryClientProvider>,
  )
}

describe('AppReleaseManagementPage 앱 선택', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('릴리스 등록 화면에서 8개 앱을 사람이 읽는 이름으로 명확히 선택한다', async () => {
    renderPage()

    fireEvent.click(await screen.findByTestId('app-release-create-open'))
    const select = await screen.findByTestId('app-release-client-type')
    const options = Array.from(select.querySelectorAll('option'))

    expect(options.map((option) => option.value)).toEqual([
      'DESKTOP',
      'SAMHAN_MOBILE',
      'SAMHAN_MOBILE_STAFF',
      'AROLOGIS_MOBILE',
      'SAMHAN_ORDER_WEB',
      'SAMHAN_ESTIMATE_WEB',
      'SAMHAN_MOBILE_PUBLIC_WEB',
      'AROLOGIS_DESKTOP',
    ])
    expect(options.map((option) => option.textContent)).toEqual([
      '삼한 데스크톱',
      '삼한 모바일',
      '삼한 직원 모바일',
      '아로로지스 모바일',
      '삼한 주문 웹 (버전 확인 미지원)',
      '삼한 종합견적 웹 (버전 확인 미지원)',
      '삼한 모바일 퍼블릭 웹 (버전 확인 미지원)',
      '아로로지스 데스크톱 (버전 확인 미지원)',
    ])
    expect(options.map((option) => option.textContent)).not.toContain('MOBILE')
    await waitFor(() => expect(screen.getByTestId('app-release-form')).toBeTruthy())
  })
})
