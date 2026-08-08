import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { partnerOrderRestoreErrorMessage } from './PartnerOrderVersionHistoryPanel'

describe('partnerOrderRestoreErrorMessage', () => {
  it('409 업무 message만 사용자에게 보여준다', () => {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {},
      data: { message: '동시에 복원된 주문입니다.' },
    })

    expect(partnerOrderRestoreErrorMessage(error)).toBe('동시에 복원된 주문입니다.')
  })

  it('409 이외의 백엔드 원문은 노출하지 않는다', () => {
    const error = new AxiosError('Internal details', 'ERR_BAD_RESPONSE', undefined, undefined, {
      status: 500,
      statusText: 'Server Error',
      headers: {},
      config: {},
      data: { message: 'database.internal.stack' },
    })

    expect(partnerOrderRestoreErrorMessage(error)).toBe('주문 복원에 실패했습니다. 다시 시도해 주세요.')
  })

  it('403 권한 오류는 권한 문제와 요청 대상을 안내한다', () => {
    const error = new AxiosError('Forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      config: {},
      data: { message: '내부 권한 판정 상세' },
    })

    expect(partnerOrderRestoreErrorMessage(error)).toBe(
      '주문 복원 권한이 없습니다. MASTER, MANAGER 또는 SALES 권한이 있는 담당자에게 요청해 주세요.',
    )
    expect(partnerOrderRestoreErrorMessage(error)).not.toContain('내부 권한 판정 상세')
    expect(partnerOrderRestoreErrorMessage(error)).not.toContain('다시 시도')
  })

  it('404 자원 부재는 최신 상태 확인을 안내한다', () => {
    const error = new AxiosError('Not found', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: {},
      data: { message: '주문 내부 식별자 상세' },
    })

    expect(partnerOrderRestoreErrorMessage(error)).toBe(
      '복원할 주문 또는 버전을 찾을 수 없습니다. 최신 주문 정보를 확인해 주세요.',
    )
  })

  it.each([400, 422])('%s 입력 오류는 내부 원문 없이 일반 문구를 유지한다', (status) => {
    const error = new AxiosError('Request error', 'ERR_BAD_REQUEST', undefined, undefined, {
      status,
      statusText: 'Request Error',
      headers: {},
      config: {},
      data: { message: '내부 입력 검증 상세' },
    })

    expect(partnerOrderRestoreErrorMessage(error)).toBe('주문 복원에 실패했습니다. 다시 시도해 주세요.')
  })
})
