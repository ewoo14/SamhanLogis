// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getReturnTo,
  getScrollAnchor,
  restoreScrollAnchorWhenReady,
  saveScrollAnchor,
  type ReturnToLocation,
} from './returnContract'

const list: ReturnToLocation = {
  pathname: '/accounting/admin/cash-receipts',
  search: '?partnerName=%EC%82%BC%ED%95%9C%EA%B3%B5%EC%A1%B0&page=2',
}

afterEach(() => window.sessionStorage.clear())

describe('return contract', () => {
  it('returnTo는 path와 search만 보존하고 외부 URL은 fallback으로 거부한다', () => {
    expect(getReturnTo({ returnTo: list }, { pathname: '/fallback', search: '' })).toEqual(list)
    expect(getReturnTo({ returnTo: { pathname: 'https://evil.example', search: '' } }, { pathname: '/fallback', search: '' }))
      .toEqual({ pathname: '/fallback', search: '' })
    expect(getReturnTo(null, { pathname: '/fallback', search: '' })).toEqual({ pathname: '/fallback', search: '' })
  })

  it('RED-B D2: 목록 anchor는 1회 소비 후 사라진다', () => {
    saveScrollAnchor('entry-a', 812)
    expect(getScrollAnchor('entry-a')).toBe(812)
    expect(getScrollAnchor('entry-a')).toBeNull()
  })

  it('RED-B D1: 같은 URL이어도 history entry별 anchor를 분리한다', () => {
    saveScrollAnchor('entry-a', 520)
    saveScrollAnchor('entry-b', 1040)

    expect(getScrollAnchor('entry-a')).toBe(520)
    expect(getScrollAnchor('entry-b')).toBe(1040)
  })

  it('RED-B D3: anchor TTL 24시간과 상한 50을 지킨다', () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-07T00:00:00Z')
    vi.setSystemTime(now)
    saveScrollAnchor('expired', 100)
    vi.setSystemTime(new Date(now.getTime() + 25 * 60 * 60 * 1000))
    saveScrollAnchor('fresh', 200)
    expect(getScrollAnchor('expired')).toBeNull()
    expect(getScrollAnchor('fresh')).toBe(200)

    for (let i = 0; i < 51; i += 1) saveScrollAnchor(`entry-${i}`, i)
    expect(getScrollAnchor('entry-0')).toBeNull()
    expect(getScrollAnchor('entry-50')).toBe(50)
    vi.useRealTimers()
  })

  it('RED-LUNA-1: 목록 데이터가 준비된 뒤에도 진입 전 스크롤 640px을 그대로 복원한다', () => {
    vi.useFakeTimers()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    let ready = false
    saveScrollAnchor('list-entry', 640)

    restoreScrollAnchorWhenReady('list-entry', () => ready)
    expect(scrollTo).not.toHaveBeenCalled()

    ready = true
    vi.runOnlyPendingTimers()
    expect(scrollTo).not.toHaveBeenCalled()
    vi.runOnlyPendingTimers()
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' })
    scrollTo.mockRestore()
    vi.useRealTimers()
  })
})
