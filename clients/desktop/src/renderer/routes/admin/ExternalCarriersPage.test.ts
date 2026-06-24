import { describe, expect, it } from 'vitest'
import {
  EMPTY_EXTERNAL_CARRIER_FORM,
  canManageExternalCarrier,
  externalCarrierTestIdName,
  validateExternalCarrierForm,
  type ExternalCarrierFormState,
} from './ExternalCarriersPage'

describe('ExternalCarriersPage model', () => {
  it('목록 row test id 는 UUID 대신 이름을 기준으로 만든다', () => {
    expect(externalCarrierTestIdName('한빛 퀵')).toBe('한빛-퀵')
  })

  it('create 권한이 없으면 등록/관리 액션을 숨긴다', () => {
    expect(canManageExternalCarrier(() => false)).toBe(false)
    expect(canManageExternalCarrier(() => true)).toBe(true)
  })

  it('이름과 전화번호 필수값을 검증한다', () => {
    const empty: ExternalCarrierFormState = {
      ...EMPTY_EXTERNAL_CARRIER_FORM,
      name: '',
      phone: '',
    }
    expect(validateExternalCarrierForm(empty)).toBe('이름/배송사명은 필수입니다.')

    const missingPhone: ExternalCarrierFormState = {
      ...EMPTY_EXTERNAL_CARRIER_FORM,
      name: '한빛퀵',
      phone: ' ',
    }
    expect(validateExternalCarrierForm(missingPhone)).toBe('전화번호는 필수입니다.')

    const valid: ExternalCarrierFormState = {
      ...EMPTY_EXTERNAL_CARRIER_FORM,
      name: '한빛퀵',
      phone: '010-7000-0001',
    }
    expect(validateExternalCarrierForm(valid)).toBeNull()
  })
})
