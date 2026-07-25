// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AxiosError } from 'axios'
import { PartnerLookupErrorBanner } from './PartnerLookupErrorBanner'

function partnerLookupUnavailableError(message = '거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.'): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    data: { success: false, code: 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE', message },
    status: 502,
    statusText: 'Bad Gateway',
    headers: {},
    config: {} as never,
  })
}

function genericServerError(): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    data: { success: false, code: 'INTERNAL_ERROR', message: '서버 내부 오류가 발생했습니다.' },
    status: 500,
    statusText: 'Internal Server Error',
    headers: {},
    config: {} as never,
  })
}

afterEach(() => cleanup())

describe('PartnerLookupErrorBanner (#831 후속 — R-1/R-2 공용 배너)', () => {
  it('PARTNER_IDENTITY_LOOKUP_UNAVAILABLE 502 는 BE 원문 메시지를 그대로 노출한다 (G2)', () => {
    render(
      <PartnerLookupErrorBanner
        error={partnerLookupUnavailableError()}
        onRetry={() => {}}
        subject="수금계획"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('사용자 귀책/백엔드 연결 확인 문구를 쓰지 않는다 (G2 — 오인 방지)', () => {
    render(
      <PartnerLookupErrorBanner
        error={partnerLookupUnavailableError()}
        onRetry={() => {}}
        subject="수금계획"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).not.toContain('백엔드 연결을 확인')
    expect(alert.textContent).not.toContain('관리자에게 문의')
  })

  it('다시 시도 버튼 클릭 시 onRetry 를 호출한다 (G2 — 재시도 경로)', () => {
    const onRetry = vi.fn()
    render(
      <PartnerLookupErrorBanner
        error={partnerLookupUnavailableError()}
        onRetry={onRetry}
        subject="수금계획"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('일반 오류(파트너 조회 무관)는 subject 기반 일반 문구를 쓰고, 여전히 재시도를 제공한다', () => {
    const onRetry = vi.fn()
    render(
      <PartnerLookupErrorBanner
        error={genericServerError()}
        onRetry={onRetry}
        subject="받을어음"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('받을어음')
    expect(alert.textContent).not.toContain('백엔드 연결을 확인')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('data-partner-lookup-unavailable 로 두 상태를 구분한다 (회귀 가드용 표식)', () => {
    const { rerender } = render(
      <PartnerLookupErrorBanner error={partnerLookupUnavailableError()} onRetry={() => {}} subject="수금계획" />,
    )
    expect(screen.getByRole('alert').getAttribute('data-partner-lookup-unavailable')).toBe('true')

    rerender(
      <PartnerLookupErrorBanner error={genericServerError()} onRetry={() => {}} subject="수금계획" />,
    )
    expect(screen.getByRole('alert').getAttribute('data-partner-lookup-unavailable')).toBe('false')
  })
})
