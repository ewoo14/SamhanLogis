import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  fetchApprovalLineGroups,
  fetchApprovalLineRoles,
  fetchApprovalLineStructure,
  fetchDefaultApprovers,
  addApprovalLineApprover,
  addApprovalLineStep,
  DOC_TYPES,
  deleteApprovalLineStep,
  fetchActiveGroupwareDocTypes,
  fetchConfigurableDocTypes,
  removeApprovalLineApprover,
  renameApprovalLineRole,
  reorderApprovalLineRoles,
  searchApprovalLineUsers,
  updateApprovalLineRole,
} from './approvalLineConfigApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('approvalLineConfigApi contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.put).mockReset()
    vi.mocked(apiClient.delete).mockReset()
  })

  it('DOC_TYPES 에 입고전표와 주문 옵션을 포함한다', () => {
    expect(DOC_TYPES).toContainEqual({ value: 'SLIP_INBOUND', label: '입고전표' })
    expect(DOC_TYPES).toContainEqual({ value: 'PARTNER_ORDER', label: '주문' })
  })

  it('전표 3종과 활성 그룹웨어 템플릿을 설정 가능한 문서종류로 조합한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: [
          { code: 'EXPENSE_REPORT', name: '지출결의서', active: true, displayOrder: 1 },
          { code: 'LEAVE_REQUEST', name: '휴가신청서', active: true, displayOrder: 2 },
          { code: 'INACTIVE_TEMPLATE', name: '비활성 양식', active: false, displayOrder: 3 },
        ],
      },
    })

    await expect(fetchConfigurableDocTypes()).resolves.toEqual([
      { value: 'SLIP_OUTBOUND', label: '출고전표', kind: 'SLIP' },
      { value: 'SLIP_INBOUND', label: '입고전표', kind: 'SLIP' },
      { value: 'PARTNER_ORDER', label: '주문', kind: 'SLIP' },
      { value: 'GROUPWARE_EXPENSE_REPORT', label: '지출결의서', kind: 'GROUPWARE' },
      { value: 'GROUPWARE_LEAVE_REQUEST', label: '휴가신청서', kind: 'GROUPWARE' },
    ])

    expect(apiClient.get).toHaveBeenCalledWith('/groupware/approval-templates/active')
  })

  it('그룹웨어 템플릿 조회 실패 시 전표 3종만 반환하고 throw 하지 않는다', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('groupware unavailable'))

    await expect(fetchConfigurableDocTypes()).resolves.toEqual([
      { value: 'SLIP_OUTBOUND', label: '출고전표', kind: 'SLIP' },
      { value: 'SLIP_INBOUND', label: '입고전표', kind: 'SLIP' },
      { value: 'PARTNER_ORDER', label: '주문', kind: 'SLIP' },
    ])
  })

  // R2(#914) 발견3 RED — DocumentTemplateEditorPage는 SLIP 옵션을 쓰지 않고(kind==='GROUPWARE'만
  // 사용) fetchConfigurableDocTypes()의 삼킴 때문에 그룹웨어 조회 실패가 "빈 목록"(고를 것이 없는데
  // 고르라)으로 도착한다(P-4 위반). fetchConfigurableDocTypes()의 기존 계약(위 테스트, throw 안 함)은
  // 그대로 두고, 실패를 삼키지 않는 별도 함수로 분리한다.
  it('R3 발견3 RED: fetchActiveGroupwareDocTypes는 그룹웨어 조회 실패를 삼키지 않고 그대로 던진다', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('groupware unavailable'))

    await expect(fetchActiveGroupwareDocTypes()).rejects.toThrow('groupware unavailable')
  })

  it('R3 발견3: fetchActiveGroupwareDocTypes는 활성 그룹웨어 템플릿만 표시순으로 반환한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: [
          { code: 'EXPENSE_REPORT', name: '지출결의서', active: true, displayOrder: 1 },
          { code: 'LEAVE_REQUEST', name: '휴가신청서', active: true, displayOrder: 2 },
          { code: 'INACTIVE_TEMPLATE', name: '비활성 양식', active: false, displayOrder: 3 },
        ],
      },
    })

    await expect(fetchActiveGroupwareDocTypes()).resolves.toEqual([
      { value: 'GROUPWARE_EXPENSE_REPORT', label: '지출결의서', kind: 'GROUPWARE' },
      { value: 'GROUPWARE_LEAVE_REQUEST', label: '휴가신청서', kind: 'GROUPWARE' },
    ])
    expect(apiClient.get).toHaveBeenCalledWith('/groupware/approval-templates/active')
  })

  it('GET /approval-line-configs 에 documentType query 를 전송한다', async () => {
    const rows = [
      {
        id: 'r1',
        sequence: 1,
        label: '출고자',
        stepType: 'GROUP',
        approvers: [],
        required: true,
        enforced: true,
        seedManaged: true,
      },
    ]
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: rows } })

    await expect(fetchApprovalLineRoles('SLIP_OUTBOUND')).resolves.toBe(rows)

    expect(apiClient.get).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs?documentType=SLIP_OUTBOUND',
    )
  })

  it('GET /approval-line-configs/{documentType}/structure 로 비-admin 구조를 조회한다', async () => {
    const rows = [
      { sequence: 0, label: '작성자', stepType: 'CREATOR', actionKey: null },
      { sequence: 1, label: '출고자', stepType: 'GROUP', actionKey: 'OUTBOUND_DISPATCH' },
    ]
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: rows } })

    await expect(fetchApprovalLineStructure('SLIP_OUTBOUND')).resolves.toBe(rows)

    expect(apiClient.get).toHaveBeenCalledWith(
      '/auth/approval-line-configs/SLIP_OUTBOUND/structure',
    )
  })

  it('GET /approval-line-configs/{documentType}/default-approvers 로 기본 결재자를 조회한다', async () => {
    const rows = [
      { sequence: 2, label: '최종승인', userId: 'user-008', displayName: '김관리' },
      { sequence: 1, label: '검토', userId: 'user-002', displayName: '이회계' },
    ]
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: rows } })

    await expect(fetchDefaultApprovers('GROUPWARE_EXPENSE/REPORT')).resolves.toBe(rows)

    expect(apiClient.get).toHaveBeenCalledWith(
      '/auth/approval-line-configs/GROUPWARE_EXPENSE%2FREPORT/default-approvers',
    )
  })

  it('기본 결재자 조회 실패 시 빈 배열을 반환하고 throw 하지 않는다', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('auth unavailable'))

    await expect(fetchDefaultApprovers('GROUPWARE_EXPENSE_REPORT')).resolves.toEqual([])
  })

  it('PUT /approval-line-configs/{id} 에 필수 payload 만 전송한다', async () => {
    const row = {
      id: 'role/1',
      sequence: 1,
      label: '출고자',
      stepType: 'GROUP',
      approvers: [],
      required: false,
      enforced: true,
      seedManaged: true,
    }
    const payload = { required: false }
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: { data: row } })

    await expect(updateApprovalLineRole('role/1', payload)).resolves.toBe(row)

    expect(apiClient.put).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/role%2F1',
      payload,
    )
  })

  it('GET /approval-line-configs/users 에 q/limit query 를 전송한다', async () => {
    const users = [{ id: 'u1', displayName: '홍길동 (물류팀)' }]
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: users } })

    await expect(searchApprovalLineUsers('홍 길', 10)).resolves.toBe(users)

    expect(apiClient.get).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/users?q=%ED%99%8D%20%EA%B8%B8&limit=10',
    )
  })

  it('POST /approval-line-configs/{roleId}/approvers 에 type/refId body 를 전송한다', async () => {
    const row = {
      id: 'role/1',
      sequence: 1,
      label: '출고자',
      stepType: 'GROUP',
      approvers: [{ id: 'a1', type: 'GROUP', refId: 'g1', displayName: '창고원' }],
      required: true,
      enforced: true,
      seedManaged: true,
    }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: row } })

    await expect(addApprovalLineApprover('role/1', 'GROUP', 'g1')).resolves.toBe(row)

    expect(apiClient.post).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/role%2F1/approvers',
      { type: 'GROUP', refId: 'g1' },
    )
  })

  it('DELETE /approval-line-configs/{roleId}/approvers/{approverId} 로 결재자를 제거한다', async () => {
    const row = {
      id: 'role/1',
      sequence: 1,
      label: '출고자',
      stepType: 'GROUP',
      approvers: [],
      required: true,
      enforced: true,
      seedManaged: true,
    }
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { data: row } })

    await expect(removeApprovalLineApprover('role/1', 'approver/1')).resolves.toBe(row)

    expect(apiClient.delete).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/role%2F1/approvers/approver%2F1',
    )
  })

  it('GET /approval-line-configs/groups 로 picker 권한그룹 목록을 조회한다', async () => {
    const groups = [{ id: 'g1', name: '창고원' }]
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: groups } })

    await expect(fetchApprovalLineGroups()).resolves.toBe(groups)

    expect(apiClient.get).toHaveBeenCalledWith('/auth/admin/approval-line-configs/groups')
  })

  it('approval-line groups 조회 실패 시 permission-groups 로 그룹명 lookup 을 fallback 한다', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('approval-line groups unavailable'))
      .mockResolvedValueOnce({ data: { data: [{ id: 'g2', name: '회계팀' }] } })

    await expect(fetchApprovalLineGroups()).resolves.toEqual([{ id: 'g2', name: '회계팀' }])

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/auth/admin/approval-line-configs/groups')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/auth/admin/permission-groups')
  })

  it('PUT /approval-line-configs/{id}/label 에 라벨 payload 를 전송한다', async () => {
    const row = {
      id: 'r-out',
      sequence: 1,
      label: '출고담당',
      stepType: 'GROUP',
      approvers: [],
      required: true,
      enforced: true,
      seedManaged: true,
    }
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: { data: row } })

    await expect(renameApprovalLineRole('r-out', '출고담당')).resolves.toBe(row)

    expect(apiClient.put).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/r-out/label',
      { label: '출고담당' },
    )
  })

  it('PUT /approval-line-configs/reorder?documentType= 에 orderedIds body 를 전송한다', async () => {
    const rows = [
      { id: 'r0', sequence: 0, label: '작성자', stepType: 'CREATOR', approvers: [], required: true, enforced: false, seedManaged: true },
      { id: 'r2', sequence: 1, label: '검수자', stepType: 'GROUP', approvers: [], required: true, enforced: true, seedManaged: true },
      { id: 'r1', sequence: 2, label: '출고자', stepType: 'GROUP', approvers: [], required: true, enforced: true, seedManaged: true },
    ]
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: { data: rows } })

    const result = await reorderApprovalLineRoles('SLIP_OUTBOUND', ['r0', 'r2', 'r1'])
    expect(result).toBe(rows)

    expect(apiClient.put).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/reorder?documentType=SLIP_OUTBOUND',
      { orderedIds: ['r0', 'r2', 'r1'] },
    )
  })

  it('POST /approval-line-configs 에 documentType/label 로 단계를 추가한다', async () => {
    const row = {
      id: 'r-new',
      sequence: 3,
      label: '확인자',
      stepType: 'GROUP',
      approvers: [],
      required: true,
      enforced: false,
      seedManaged: false,
    }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: row } })

    await expect(addApprovalLineStep('SLIP_OUTBOUND', '확인자')).resolves.toBe(row)

    expect(apiClient.post).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs',
      { documentType: 'SLIP_OUTBOUND', label: '확인자' },
    )
  })

  it('DELETE /approval-line-configs/{id} 로 단계를 삭제한다', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { data: null } })

    await expect(deleteApprovalLineStep('role/1')).resolves.toBeUndefined()

    expect(apiClient.delete).toHaveBeenCalledWith(
      '/auth/admin/approval-line-configs/role%2F1',
    )
  })
})
