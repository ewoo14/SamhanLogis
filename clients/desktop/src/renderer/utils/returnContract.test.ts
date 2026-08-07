// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  getReturnTo,
  getScrollAnchor,
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

  it('목록 returnTo별 scroll anchor를 session store에서 저장·조회한다', () => {
    saveScrollAnchor(list, 812)
    expect(getScrollAnchor(list)).toBe(812)
  })
})
