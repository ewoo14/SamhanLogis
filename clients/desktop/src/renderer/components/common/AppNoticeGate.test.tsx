// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppNoticeGate } from './AppNoticeGate'
import { getActiveAppNotices } from '../../api/appNotice'

vi.mock('../../api/appNotice', () => ({
  getActiveAppNotices: vi.fn(),
}))

const notice = {
  id: 'notice-1',
  title: '운영 공지',
  isActive: true,
  startAt: '2026-06-28T09:00:00',
  endAt: '2026-06-30T18:00:00',
  displayOrder: 1,
  images: [
    { imageUrl: 'https://cdn/a.png', displayOrder: 1, caption: '첫 이미지' },
    { imageUrl: 'https://cdn/b.png', displayOrder: 2, caption: '둘째 이미지' },
  ],
}

describe('AppNoticeGate', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(getActiveAppNotices).mockReset()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
    cleanup()
  })

  it('부팅 후 활성 공지를 한 번 조회하고 캐러셀을 이동한다', async () => {
    vi.mocked(getActiveAppNotices).mockResolvedValueOnce([notice])

    render(<AppNoticeGate bootstrapped authenticated />)

    expect(await screen.findByTestId('app-notice-modal')).toBeTruthy()
    expect(screen.getByText('첫 이미지')).toBeTruthy()

    fireEvent.click(screen.getByTestId('app-notice-next'))

    expect(screen.getByText('둘째 이미지')).toBeTruthy()
    expect(screen.getByTestId('app-notice-indicator').getAttribute('aria-label')).toBe('이미지 2 / 2')
    expect(screen.getByTestId('app-notice-indicator').textContent).not.toContain('2 / 2')
    expect(screen.getByTestId('app-notice-next').style.minHeight).toBe('48px')
    expect(screen.getByTestId('app-notice-next').style.minWidth).toBe('48px')
    expect(getActiveAppNotices).toHaveBeenCalledTimes(1)
  })

  it('이미지 로딩 전에는 로딩 상태를 표시하고 load 후 숨긴다', async () => {
    vi.mocked(getActiveAppNotices).mockResolvedValueOnce([notice])

    render(<AppNoticeGate bootstrapped authenticated />)

    expect(await screen.findByTestId('app-notice-image-loading')).toBeTruthy()
    fireEvent.load(screen.getByTestId('app-notice-image'))

    await waitFor(() => {
      expect(screen.queryByTestId('app-notice-image-loading')).toBeNull()
    })
  })

  it('공지별 다시 보지 않기는 localStorage에 저장되고 같은 공지를 숨긴다', async () => {
    vi.mocked(getActiveAppNotices).mockResolvedValueOnce([notice])

    render(<AppNoticeGate bootstrapped authenticated />)
    fireEvent.click(await screen.findByTestId('app-notice-dismiss-forever'))

    expect(window.localStorage.getItem('samhan.appNotice.dismissed.notice-1')).toBe('true')
    await waitFor(() => {
      expect(screen.queryByTestId('app-notice-modal')).toBeNull()
    })
  })

  it('조회 실패는 fail-open으로 앱 렌더를 막지 않는다', async () => {
    vi.mocked(getActiveAppNotices).mockRejectedValueOnce(new Error('network'))

    render(<AppNoticeGate bootstrapped authenticated />)

    await waitFor(() => {
      expect(getActiveAppNotices).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('app-notice-modal')).toBeNull()
    })
  })
})
