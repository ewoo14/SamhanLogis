import { describe, expect, it, vi } from 'vitest'
import {
  addApproverOption,
  buildGroupwareApprovalDocumentType,
  buildGroupwareApprovalReferenceInputs,
  getApprovalLinePreviewStatus,
  loadDefaultApproverOptions,
  mapDefaultApproversToApproverOptions,
  removeApproverAt,
  shouldApplyDefaultApproverPrefill,
  shouldRequireManualApprover,
} from './GroupwareApprovalCreatePage'
import type { ApprovalLineDefaultApprover, ApprovalLineStructure } from '../api/approvalLineConfigApi'
import type { ApproverOption } from '../api/groupwareApprovalApprover'

describe('GroupwareApprovalCreatePage default approver prefill', () => {
  it('결재 생성 요청에 참조 목록을 포함할 수 있는 첨부 계약으로 변환한다', () => {
    expect(buildGroupwareApprovalReferenceInputs([
      {
        refDocType: 'SALES_COMMISSION_SETTLEMENT',
        refDocNo: '2099/12/27-1',
        refDocLabel: '영업수수료 정산서',
        refPartnerCode: null,
        refPartnerName: null,
        refPeriod: null,
      },
    ])).toEqual([{
      attachmentType: 'SLIP_REF',
      label: '영업수수료 정산서',
      displayOrder: 1,
      refDocType: 'SALES_COMMISSION_SETTLEMENT',
      refDocNo: '2099/12/27-1',
      refDocLabel: '영업수수료 정산서',
      refSlipNo: null,
      refSlipType: null,
    }])
  })

  it('기본 결재자를 sequence 순서의 ApproverOption 으로 매핑한다', () => {
    const defaults: ApprovalLineDefaultApprover[] = [
      { sequence: 2, label: '승인자', userId: 'user-008', displayName: '김관리' },
      { sequence: 1, label: '검토자', userId: 'user-002', displayName: '김회계' },
    ]

    expect(mapDefaultApproversToApproverOptions(defaults)).toEqual([
      { userId: 'user-002', name: '김회계', department: null },
      { userId: 'user-008', name: '김관리', department: null },
    ])
  })

  it('템플릿 code 로 GROUPWARE 문서종류를 조회하고 프리필한다', async () => {
    const fetcher = vi.fn<Parameters<typeof loadDefaultApproverOptions>[1]>()
      .mockResolvedValueOnce([
        { sequence: 1, label: '검토자', userId: 'user-002', displayName: '김회계' },
      ])

    await expect(loadDefaultApproverOptions('EXPENSE_REPORT', fetcher)).resolves.toEqual([
      { userId: 'user-002', name: '김회계', department: null },
    ])

    expect(fetcher).toHaveBeenCalledWith('GROUPWARE_EXPENSE_REPORT')
  })

  it('템플릿 code 는 GROUPWARE_ documentType 으로 변환한다', () => {
    expect(buildGroupwareApprovalDocumentType('EXPENSE_REPORT')).toBe('GROUPWARE_EXPENSE_REPORT')
    expect(buildGroupwareApprovalDocumentType('  LEAVE_REQUEST  ')).toBe('GROUPWARE_LEAVE_REQUEST')
    expect(buildGroupwareApprovalDocumentType('')).toBeNull()
  })

  it('config 결재선이 있으면 수동 결재자 없이 생성 가능하고 override 만 approverIds 로 보낸다', () => {
    expect(shouldRequireManualApprover('EXPENSE_REPORT', false, configuredRoles)).toBe(false)
    expect(shouldRequireManualApprover('EXPENSE_REPORT', false, creatorOnlyRoles)).toBe(true)
    expect(shouldRequireManualApprover('LEAVE_REQUEST', false, [])).toBe(true)
    expect(shouldRequireManualApprover('LEAVE_REQUEST', true, [])).toBe(true)
    expect(shouldRequireManualApprover('', false, [])).toBe(true)
  })

  it('config 결재선 미리보기 상태 문구를 계산한다', () => {
    expect(getApprovalLinePreviewStatus('', false, [])).toBe('결재 유형을 먼저 선택하세요.')
    expect(getApprovalLinePreviewStatus('EXPENSE_REPORT', true, [])).toBe('결재선을 불러오는 중입니다.')
    expect(getApprovalLinePreviewStatus('LEAVE_REQUEST', false, [])).toBe('설정된 결재선이 없습니다. 수동으로 결재자를 추가하세요.')
    expect(getApprovalLinePreviewStatus('EXPENSE_REPORT', false, creatorOnlyRoles)).toBe('작성자 단독 결재선입니다. 수동으로 결재자를 추가하세요.')
    expect(getApprovalLinePreviewStatus('EXPENSE_REPORT', false, configuredRoles)).toBe('중앙 결재라인 설정이 적용됩니다.')
  })

  it('템플릿 미선택 또는 조회 실패 시 빈 결재선으로 교체한다', async () => {
    const fetcher = vi.fn<Parameters<typeof loadDefaultApproverOptions>[1]>()
      .mockRejectedValueOnce(new Error('auth unavailable'))

    await expect(loadDefaultApproverOptions('', fetcher)).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()

    await expect(loadDefaultApproverOptions('LEAVE_REQUEST', fetcher)).resolves.toEqual([])
    expect(fetcher).toHaveBeenCalledWith('GROUPWARE_LEAVE_REQUEST')
  })

  it('프리필 후 생성자 add/remove override 는 기존 순서를 보존한다', () => {
    const prefilled: ApproverOption[] = [
      { userId: 'user-002', name: '김회계', department: null },
      { userId: 'user-008', name: '김관리', department: null },
    ]
    const extra = { userId: 'user-005', name: '박창고', department: '물류팀' }

    const added = addApproverOption(prefilled, extra)
    expect(added).toEqual([...prefilled, extra])
    expect(addApproverOption(added, extra)).toBe(added)
    expect(removeApproverAt(added, 1)).toEqual([
      { userId: 'user-002', name: '김회계', department: null },
      extra,
    ])
  })

  it('프리필 응답이 늦게 도착하면 사용자 override 를 덮어쓰지 않는다', () => {
    expect(shouldApplyDefaultApproverPrefill(3, 3, false)).toBe(true)
    expect(shouldApplyDefaultApproverPrefill(3, 4, false)).toBe(false)
    expect(shouldApplyDefaultApproverPrefill(3, 3, true)).toBe(false)
  })
})

// V75 구조 기준 — ApprovalLineStructure(비-admin /structure endpoint 형식)
const configuredRoles: ApprovalLineStructure[] = [
  { sequence: 0, label: '작성자', stepType: 'CREATOR', actionKey: null },
  { sequence: 1, label: '부서장', stepType: 'GROUP', actionKey: 'groupware.approvals' },
  { sequence: 2, label: '대표', stepType: 'USER', actionKey: null },
]

const creatorOnlyRoles: ApprovalLineStructure[] = [
  { sequence: 0, label: '작성자', stepType: 'CREATOR', actionKey: null },
]
