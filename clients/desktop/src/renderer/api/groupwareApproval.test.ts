import { describe, expect, it } from 'vitest'
import {
  resolveApprovalStepDisplayName,
  resolveApprovalStepTypeLabel,
  type ApprovalStepView,
} from './groupwareApproval'
import { STEP_TYPE_LABEL } from './approvalLineConfigApi'

describe('groupwareApproval step display contract', () => {
  it('StepType 영문 enum 을 한국어 라벨로만 노출한다', () => {
    expect(STEP_TYPE_LABEL).toMatchObject({
      USER: '직접지정',
      GROUP: '권한그룹',
    })
  })

  it('GROUP 단계는 approverGroupId 를 그룹명으로 해석하고 UUID 를 fallback 으로 노출하지 않는다', () => {
    const step: ApprovalStepView = {
      sequence: 1,
      stepType: 'GROUP',
      approverGroupId: '00000000-0000-0000-0000-000000000104',
      approverId: null,
      approverName: null,
      status: 'PENDING',
      decidedAt: null,
      reason: null,
    }

    expect(resolveApprovalStepDisplayName(step, new Map([[step.approverGroupId!, '회계원']]))).toBe('회계원')
    expect(resolveApprovalStepDisplayName(step, new Map())).toBe('권한그룹')
  })

  it('USER 단계는 지정 결재자 실명을 우선 표시한다', () => {
    const step: ApprovalStepView = {
      sequence: 2,
      stepType: 'USER',
      approverGroupId: null,
      approverId: 'user-002',
      approverName: '이정훈',
      status: 'PENDING',
      decidedAt: null,
      reason: null,
    }

    expect(resolveApprovalStepDisplayName(step, new Map())).toBe('이정훈')
  })

  it('요청자가 approver 인 첫 USER 단계만 작성자로 표시한다', () => {
    const step: ApprovalStepView = {
      sequence: 0,
      stepType: 'USER',
      approverGroupId: null,
      approverId: 'requester-001',
      approverName: '기안자',
      status: 'PENDING',
      decidedAt: null,
      reason: null,
    }

    expect(resolveApprovalStepTypeLabel(step, 'requester-001')).toBe('작성자')
    expect(resolveApprovalStepTypeLabel({ ...step, sequence: 1 }, 'requester-001')).toBe('직접지정')
    expect(resolveApprovalStepTypeLabel(step, 'other-user')).toBe('직접지정')
  })
})
