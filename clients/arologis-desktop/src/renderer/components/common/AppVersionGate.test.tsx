import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppVersionGate } from './AppVersionGate'

describe('아로로지스 데스크톱 버전 게이트', () => {
  beforeEach(() => {
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn(() => () => undefined),
    }
  })

  it('서버의 새 버전을 사용자 화면에 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        latestVersion: '2026/07/29-2',
        minSupportedVersion: '2026/07/29-1',
        forceLevel: 'MINOR',
        releaseNotes: '배차 안정화',
        releasedAt: '2026-07-29T00:00:00Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    expect((await screen.findByTestId('app-version-minor-banner')).textContent).toContain('2026/07/29-2')
    expect(screen.getByText('아로로지스 본문')).toBeTruthy()
  })

  it('버전 확인이 실패해도 본문을 계속 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    render(
      <AppVersionGate bootstrapped>
        <div>오프라인에서도 유지되는 화면</div>
      </AppVersionGate>,
    )

    await waitFor(() => expect(screen.getByText('오프라인에서도 유지되는 화면')).toBeTruthy())
    expect(screen.queryByTestId('app-version-blocking-modal')).toBeNull()
  })
})
