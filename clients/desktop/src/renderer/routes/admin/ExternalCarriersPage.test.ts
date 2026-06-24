import { describe, expect, it } from 'vitest'
import {
  EMPTY_EXTERNAL_CARRIER_FORM,
  canManageExternalCarrier,
  externalCarrierTestIdName,
  formToCreateRequest,
  formToUpdateRequest,
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

  it('신규 등록 요청은 빈 선택필드를 null 로 전송한다', () => {
    const req = formToCreateRequest({
      ...EMPTY_EXTERNAL_CARRIER_FORM,
      name: '한빛퀵',
      phone: '010-7000-0001',
    })
    expect(req.email).toBeNull()
    expect(req.defaultVehicleType).toBeNull()
    expect(req.memo).toBeNull()
  })

  it('수정 요청은 빈 선택필드를 빈 문자열로 전송한다 (P1 클리어 회귀 가드)', () => {
    // null 로 보내면 BE PATCH 가 미변경으로 처리해 클리어가 silent 하게 무시된다.
    // "" 로 보내야 BE 가 클리어(null)로 해석한다.
    const req = formToUpdateRequest({
      ...EMPTY_EXTERNAL_CARRIER_FORM,
      name: '한빛퀵',
      phone: '010-7000-0001',
      email: '',
      defaultVehicleType: '',
      memo: '',
    })
    expect(req.email).toBe('')
    expect(req.defaultVehicleType).toBe('')
    expect(req.memo).toBe('')
  })

  it('수정 요청은 값이 있는 선택필드는 trim 해 전송한다', () => {
    const req = formToUpdateRequest({
      ...EMPTY_EXTERNAL_CARRIER_FORM,
      name: '한빛퀵',
      phone: '010-7000-0001',
      email: '  a@b.com  ',
      defaultVehicleType: '  1톤  ',
    })
    expect(req.email).toBe('a@b.com')
    expect(req.defaultVehicleType).toBe('1톤')
  })
})
