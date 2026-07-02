import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl } from './external-url'

describe('isAllowedExternalUrl', () => {
  describe('production(packaged=true)', () => {
    it('https URL 은 허용', () => {
      expect(isAllowedExternalUrl('https://estimate.samhan-air.com/', true)).toBe(true)
      expect(isAllowedExternalUrl('https://order.samhan-air.com/x?y=1', true)).toBe(true)
    })

    it('http://localhost 는 거부 (prod 는 https 강제)', () => {
      expect(isAllowedExternalUrl('http://localhost:5183', true)).toBe(false)
      expect(isAllowedExternalUrl('http://127.0.0.1:5180', true)).toBe(false)
    })

    it('그 외 http 도 거부', () => {
      expect(isAllowedExternalUrl('http://evil.example.com', true)).toBe(false)
    })
  })

  describe('dev(packaged=false)', () => {
    it('https URL 은 허용', () => {
      expect(isAllowedExternalUrl('https://estimate.samhan-air.com/', false)).toBe(true)
    })

    it('http://localhost / http://127.0.0.1 은 허용 (회귀 fix 핵심)', () => {
      expect(isAllowedExternalUrl('http://localhost:5183', false)).toBe(true)
      expect(isAllowedExternalUrl('http://localhost:5180', false)).toBe(true)
      expect(isAllowedExternalUrl('http://127.0.0.1:5183', false)).toBe(true)
    })

    it('localhost 가 아닌 http 는 거부 (dev 라도 임의 http 차단)', () => {
      expect(isAllowedExternalUrl('http://evil.example.com', false)).toBe(false)
    })

    it('localhost prefix 우회 차단 (hostname 완전일치)', () => {
      // `http://localhost.evil.com` 은 hostname 이 localhost 가 아니므로 거부해야 한다.
      expect(isAllowedExternalUrl('http://localhost.evil.com', false)).toBe(false)
      expect(isAllowedExternalUrl('http://127.0.0.1.evil.com', false)).toBe(false)
      // 인증정보(userinfo)로 loopback 을 위장한 경우도 hostname 은 evil.com → 거부.
      expect(isAllowedExternalUrl('http://localhost@evil.com', false)).toBe(false)
    })
  })

  describe('비정상 입력', () => {
    it('문자열이 아니면 거부', () => {
      // @ts-expect-error 런타임 방어 검증
      expect(isAllowedExternalUrl(null, false)).toBe(false)
      // @ts-expect-error 런타임 방어 검증
      expect(isAllowedExternalUrl(undefined, true)).toBe(false)
    })

    it('빈 문자열/스킴 없는 값 거부', () => {
      expect(isAllowedExternalUrl('', false)).toBe(false)
      expect(isAllowedExternalUrl('localhost:5183', false)).toBe(false)
      expect(isAllowedExternalUrl('file:///etc/passwd', true)).toBe(false)
    })
  })
})
