import { describe, expect, it } from 'vitest'
import { parseApprovalTemplateOptions, serializeApprovalTemplateOptions } from './groupwareApprovalTemplate'

describe('그룹웨어 결재양식 optionsJson 경계', () => {
  it('SELECT options 배열을 JSON 배열 문자열로 직렬화한다', () => {
    expect(serializeApprovalTemplateOptions({
      fieldKey: 'leaveType',
      label: '휴가종류',
      fieldType: 'SELECT',
      required: true,
      displayOrder: 1,
      options: [' 연차 ', '반차', ''],
    })).toBe('["연차","반차"]')
  })

  it('optionsJson을 options 배열로 파싱해 순서를 보존한다', () => {
    expect(parseApprovalTemplateOptions('["연차","반차(오전)","병가"]'))
      .toEqual(['연차', '반차(오전)', '병가'])
  })

  it('SELECT가 아닌 필드는 optionsJson을 보내지 않는다', () => {
    expect(serializeApprovalTemplateOptions({
      fieldKey: 'title',
      label: '제목',
      fieldType: 'TEXT',
      required: true,
      displayOrder: 1,
      options: ['무시'],
    })).toBeNull()
  })
})
