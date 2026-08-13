import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WebVersionGate } from './WebVersionGate'

describe('모바일 퍼블릭 웹 버전 안내', () => {
  it('모바일 퍼블릭 식별자로 조회하고 릴리스 안내를 실제 렌더링한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        latestVersion: '2026/07/26-929',
        minSupportedVersion: '2026/07/25-1',
        forceLevel: 'MINOR',
        releaseNotes: '서명 화면 개선',
        releasedAt: '2026-07-26T09:00:00+09:00',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    render(
      <WebVersionGate currentVersion="0.1.0-dev">
        <div>서명 화면</div>
      </WebVersionGate>,
    )

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2026/07/26-929'))
    expect(screen.getByText('서명 화면')).toBeTruthy()
    expect(screen.queryByTestId('web-version-policy-error')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8080/app/version?clientType=SAMHAN_MOBILE_PUBLIC_WEB&currentVersion=0.1.0-dev',
      expect.objectContaining({ method: 'GET' }),
    )
    fetchSpy.mockRestore()
  })

  it('네트워크 실패는 서명 화면을 막지 않되 정책 미수신을 사용자에게 표시한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))

    render(
      <WebVersionGate currentVersion="0.1.0-dev">
        <div>서명 화면</div>
      </WebVersionGate>,
    )

    const policyError = await screen.findByTestId('web-version-policy-error')
    expect(policyError.textContent).toContain('버전 정책을 확인하지 못했습니다')
    expect(screen.getByText('서명 화면')).toBeTruthy()
    fetchSpy.mockRestore()
  })

  it('작성 중이면 새로고침 전에 추가 확인을 열고 서명 화면을 유지한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        latestVersion: '2026/07/26-929',
        minSupportedVersion: '2026/07/25-1',
        forceLevel: 'MINOR',
        releaseNotes: '서명 화면 개선',
        releasedAt: '2026-07-26T09:00:00+09:00',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    render(
      <WebVersionGate currentVersion="0.1.0-dev" isDirty={() => true}>
        <div>작성 중 서명</div>
      </WebVersionGate>,
    )

    await waitFor(() => expect(screen.getByTestId('web-version-reload')).toBeTruthy())
    fireEvent.click(screen.getByTestId('web-version-reload'))
    expect(screen.getByTestId('web-version-unsaved-confirm')).toBeTruthy()
    expect(screen.getByText('작성 중 서명')).toBeTruthy()
    fetchSpy.mockRestore()
  })
})
