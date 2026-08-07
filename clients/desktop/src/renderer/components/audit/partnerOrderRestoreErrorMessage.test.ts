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
})
