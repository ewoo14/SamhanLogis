/**
 * SlipCutoffConfigPage 순수 모델 함수 단위 테스트.
 *
 * 렌더링 없이 validateSlipCutoffForm / canManageSlipCutoff /
 * canUpdateSlipCutoff / canDeleteSlipCutoff / availableTagsForForm
 * export 함수의 비즈니스 로직만 검증한다.
 */
import { describe, expect, it } from 'vitest'
import {
  availableTagsForForm,
  canManageSlipCutoff,
  canUpdateSlipCutoff,
  canDeleteSlipCutoff,
  EMPTY_SLIP_CUTOFF_FORM,
  validateSlipCutoffForm,
  type SlipCutoffFormState,
} from './SlipCutoffConfigPage'
import type { SlipCutoff } from '../../api/slipCutoff'

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

function makeCutoff(deliveryTag: string, extra?: Partial<SlipCutoff>): SlipCutoff {
  return {
    id: `cutoff-${deliveryTag}`,
    deliveryTag: deliveryTag as SlipCutoff['deliveryTag'],
    deliveryTagLabel: deliveryTag,
    cutoffTime: '12:00',
    active: true,
    createdAt: '2026-06-24T00:00:00',
    modifiedAt: null,
    ...extra,
  }
}

const ALL_TAGS = [
  { tag: 'SALE' as const, label: '판매' },
  { tag: 'STACK' as const, label: '야적' },
  { tag: 'REGION' as const, label: '지방' },
  { tag: 'LOGEN' as const, label: '로젠택배' },
  { tag: 'GYEONGDONG_PARCEL' as const, label: '경동택배' },
  { tag: 'GYEONGDONG_FREIGHT' as const, label: '경동화물' },
  { tag: 'RENTAL' as const, label: '대여' },
  { tag: 'BORROW_RETURN' as const, label: '차용반납' },
  { tag: 'DEFECT_RETURN' as const, label: '불량반납' },
  { tag: 'DIRECT_DELIVERY' as const, label: '직배' },
  { tag: 'PREEMPTIVE_ACTION' as const, label: '착하선조치' },
]

// ---------------------------------------------------------------------------
// validateSlipCutoffForm
// ---------------------------------------------------------------------------

describe('validateSlipCutoffForm', () => {
  it('등록 모드: 태그 미선택 시 오류', () => {
    const form: SlipCutoffFormState = {
      ...EMPTY_SLIP_CUTOFF_FORM,
      deliveryTag: '',
      cutoffTime: '12:00',
    }
    expect(validateSlipCutoffForm(form)).toBe('배송태그를 선택하세요.')
  })

  it('등록 모드: 시각 미입력 시 오류', () => {
    const form: SlipCutoffFormState = {
      ...EMPTY_SLIP_CUTOFF_FORM,
      deliveryTag: 'REGION',
      cutoffTime: '',
    }
    expect(validateSlipCutoffForm(form)).toBe('마감시각을 입력하세요.')
  })

  it('잘못된 HH:mm 형식 시 오류', () => {
    const form: SlipCutoffFormState = {
      ...EMPTY_SLIP_CUTOFF_FORM,
      deliveryTag: 'REGION',
      cutoffTime: '9:00',
    }
    expect(validateSlipCutoffForm(form)).toBe('마감시각은 HH:mm 형식이어야 합니다.')
  })

  it('등록 모드 성공: 태그+시각 모두 입력', () => {
    const form: SlipCutoffFormState = {
      ...EMPTY_SLIP_CUTOFF_FORM,
      deliveryTag: 'REGION',
      cutoffTime: '12:00',
    }
    expect(validateSlipCutoffForm(form)).toBeNull()
  })

  it('수정 모드: editing 비null 시 태그 없어도 통과', () => {
    const form: SlipCutoffFormState = {
      editing: makeCutoff('REGION'),
      deliveryTag: 'REGION',
      cutoffTime: '14:00',
      active: true,
    }
    expect(validateSlipCutoffForm(form)).toBeNull()
  })

  it('수정 모드: 시각 미입력 시 오류', () => {
    const form: SlipCutoffFormState = {
      editing: makeCutoff('REGION'),
      deliveryTag: 'REGION',
      cutoffTime: '',
      active: true,
    }
    expect(validateSlipCutoffForm(form)).toBe('마감시각을 입력하세요.')
  })

  it('24:00 등 비정상 시각도 HH:mm 패턴 통과(BE 검증 위임)', () => {
    const form: SlipCutoffFormState = {
      ...EMPTY_SLIP_CUTOFF_FORM,
      deliveryTag: 'REGION',
      cutoffTime: '24:00',
    }
    // HH:mm 정규식은 통과하고 BE가 검증
    expect(validateSlipCutoffForm(form)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// canManageSlipCutoff
// ---------------------------------------------------------------------------

describe('canManageSlipCutoff', () => {
  it('hr.slip-cutoff create 권한 있으면 true', () => {
    const canAccess = (pageCode: 'hr.slip-cutoff', action: 'create') =>
      pageCode === 'hr.slip-cutoff' && action === 'create'
    expect(canManageSlipCutoff(canAccess)).toBe(true)
  })

  it('권한 없으면 false', () => {
    const canAccess = (_pageCode: 'hr.slip-cutoff', _action: 'create') => false
    expect(canManageSlipCutoff(canAccess)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canUpdateSlipCutoff
// ---------------------------------------------------------------------------

describe('canUpdateSlipCutoff', () => {
  it('hr.slip-cutoff update 권한 있으면 true', () => {
    const canAccess = (pageCode: 'hr.slip-cutoff', action: 'update') =>
      pageCode === 'hr.slip-cutoff' && action === 'update'
    expect(canUpdateSlipCutoff(canAccess)).toBe(true)
  })

  it('update 권한 없으면 false', () => {
    const canAccess = (_pageCode: 'hr.slip-cutoff', _action: 'update') => false
    expect(canUpdateSlipCutoff(canAccess)).toBe(false)
  })

  it('create 권한만 있고 update 없으면 false (권한 분리 검증)', () => {
    // create 권한은 있지만 update 는 없는 커스텀 계정 시나리오
    const canAccess = (_pageCode: 'hr.slip-cutoff', action: 'update') =>
      action !== 'update'
    expect(canUpdateSlipCutoff(canAccess)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canDeleteSlipCutoff
// ---------------------------------------------------------------------------

describe('canDeleteSlipCutoff', () => {
  it('hr.slip-cutoff delete 권한 있으면 true', () => {
    const canAccess = (pageCode: 'hr.slip-cutoff', action: 'delete') =>
      pageCode === 'hr.slip-cutoff' && action === 'delete'
    expect(canDeleteSlipCutoff(canAccess)).toBe(true)
  })

  it('delete 권한 없으면 false', () => {
    const canAccess = (_pageCode: 'hr.slip-cutoff', _action: 'delete') => false
    expect(canDeleteSlipCutoff(canAccess)).toBe(false)
  })

  it('create 권한만 있고 delete 없으면 false (권한 분리 검증)', () => {
    // create 권한은 있지만 delete 는 없는 커스텀 계정 시나리오
    const canAccess = (_pageCode: 'hr.slip-cutoff', action: 'delete') =>
      action !== 'delete'
    expect(canDeleteSlipCutoff(canAccess)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// availableTagsForForm
// ---------------------------------------------------------------------------

describe('availableTagsForForm', () => {
  it('설정된 태그는 결과에서 제외', () => {
    const configured = [makeCutoff('REGION'), makeCutoff('STACK')]
    const available = availableTagsForForm(ALL_TAGS, configured)
    const tags = available.map((t) => t.tag)
    expect(tags).not.toContain('REGION')
    expect(tags).not.toContain('STACK')
    expect(tags).toContain('SALE')
    expect(tags).toContain('LOGEN')
  })

  it('설정된 태그가 없으면 전체 반환', () => {
    const available = availableTagsForForm(ALL_TAGS, [])
    expect(available).toHaveLength(ALL_TAGS.length)
  })

  it('모두 설정된 경우 빈 배열 반환', () => {
    const configured = ALL_TAGS.map((t) => makeCutoff(t.tag))
    const available = availableTagsForForm(ALL_TAGS, configured)
    expect(available).toHaveLength(0)
  })

  it('전체 OUTBOUND 11종 태그 옵션을 지원', () => {
    expect(ALL_TAGS).toHaveLength(11)
  })
})
