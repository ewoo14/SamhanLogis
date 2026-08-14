import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test, vi } from 'vitest'
import {
  ApprovalLineDocTypeOptionGroups,
  ApprovalRoleRow,
  ApprovalLinePreviewPanel,
  approvalLineRolesQueryKey,
  areApprovalRoleOrdersEqual,
  canDeleteApprover,
  computeApprovalRoleReorder,
  getOrderedApprovalRoleIds,
  notifyApprovalRoleApproverSelected,
  getApprovalLineDeleteConfirmation,
  notifyApprovalRoleLabelChange,
  notifyApprovalRoleRequiredChange,
  optimisticallyAddApprovalLineApprover,
  optimisticallyAddApprovalLineStep,
  optimisticallyDeleteApprovalLineStep,
  optimisticallyRemoveApprovalLineApprover,
  optimisticallyUpdateApprovalLineRoles,
  resolveApprovalLineDocTypeSelection,
  restoreApprovalLineRolesSnapshot,
} from '../ApprovalLineConfigPage'
import type { ApprovalLineRole, ConfigurableDocType } from '../../api/approvalLineConfigApi'

describe('ApprovalRoleRow', () => {
  test('CREATOR 역할은 전표 작성자 자동 텍스트와 비활성 필수 체크박스를 렌더한다', () => {
    const role: ApprovalLineRole = {
      id: 'r0',
      sequence: 0,
      label: '작성자',
      stepType: 'CREATOR',
      approvers: [],
      required: true,
      enforced: false,
      seedManaged: true,
    }

    const html = renderToStaticMarkup(
      createElement(ApprovalRoleRow, {
        role,
        groups: [],
        saving: false,
        onRequiredChange: () => undefined,
      }),
    )

    expect(html).toContain('작성자 자동')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('disabled=""')
  })

  test('결재자 선택은 APPROVER 역할에서만 onAddApprover 로 전달한다', () => {
    const onAdd = vi.fn()
    const option = { type: 'GROUP' as const, refId: 'g1', displayName: '창고원' }

    notifyApprovalRoleApproverSelected(roleDispatcher, option, onAdd)
    notifyApprovalRoleApproverSelected(roleCreator, option, onAdd)
    notifyApprovalRoleApproverSelected(roleDispatcher, null, onAdd)

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(option)
  })

  test('GROUP 자동저장은 필수 변경값만 onSave 로 전달한다', () => {
    const onSave = vi.fn()

    notifyApprovalRoleRequiredChange(onSave, false)
    notifyApprovalRoleRequiredChange(onSave, true)

    expect(onSave).toHaveBeenNthCalledWith(1, false)
    expect(onSave).toHaveBeenNthCalledWith(2, true)
  })

  test('자동저장 낙관적 업데이트 실패 시 이전 역할 스냅샷으로 롤백한다', () => {
    const queryClient = new QueryClient()
    const key = approvalLineRolesQueryKey('SLIP_OUTBOUND')
    const prev: ApprovalLineRole[] = [
      {
        id: 'r1',
        sequence: 1,
        label: '출고자',
        stepType: 'GROUP',
        approvers: [{ id: 'a0', type: 'GROUP', refId: 'g0', displayName: '기존그룹' }],
        required: true,
        enforced: true,
        seedManaged: true,
      },
    ]
    queryClient.setQueryData(key, prev)

    queryClient.setQueryData<ApprovalLineRole[]>(key, (current) =>
      optimisticallyUpdateApprovalLineRoles(current, {
        id: 'r1',
        required: false,
      }))

    expect(queryClient.getQueryData<ApprovalLineRole[]>(key)?.[0]).toMatchObject({
      required: false,
    })

    restoreApprovalLineRolesSnapshot(queryClient, key, prev)

    expect(queryClient.getQueryData<ApprovalLineRole[]>(key)?.[0]).toMatchObject({
      required: true,
    })
  })

  test('결재자 추가/제거 낙관 업데이트는 approvers 배열만 갱신한다', () => {
    const current: ApprovalLineRole[] = [{
      id: 'r1',
      sequence: 1,
      label: '출고자',
      stepType: 'GROUP',
      approvers: [],
      required: true,
      enforced: true,
      seedManaged: true,
    }]

    const added = optimisticallyAddApprovalLineApprover(current, 'r1', {
      type: 'USER',
      refId: 'u1',
      displayName: '홍길동',
    })
    expect(added?.[0]?.approvers).toHaveLength(1)
    expect(added?.[0]?.approvers[0]).toMatchObject({ type: 'USER', refId: 'u1', displayName: '홍길동' })

    const removed = optimisticallyRemoveApprovalLineApprover(added, 'r1', 'pending-USER-u1')
    expect(removed?.[0]?.approvers).toHaveLength(0)
  })

  test('단계 추가 낙관 업데이트는 임시 GROUP 표시·서명용 역할을 마지막 sequence 로 추가한다', () => {
    const added = optimisticallyAddApprovalLineStep([roleCreator, roleDispatcher], {
      documentType: 'SLIP_OUTBOUND',
      label: '확인자',
    })

    expect(added?.at(-1)).toMatchObject({
      label: '확인자',
      sequence: 2,
      stepType: 'GROUP',
      required: true,
      enforced: false,
      seedManaged: false,
    })
    expect(added?.at(-1)?.id).toContain('pending-step-SLIP_OUTBOUND')
  })

  test('단계 삭제 낙관 업데이트는 대상 역할을 목록에서 제거한다', () => {
    const deleted = optimisticallyDeleteApprovalLineStep([roleCreator, roleDispatcher, roleInspector], 'r1')

    expect(deleted?.map((role) => role.id)).toEqual(['r0', 'r2'])
  })

  test('enforced 또는 seedManaged 역할 삭제는 결재 강제 해제 경고 문구를 반환한다', () => {
    expect(getApprovalLineDeleteConfirmation(roleDispatcher).message)
      .toContain('삭제하면 해당 동작이 더 이상 결재 강제되지 않습니다')
    expect(getApprovalLineDeleteConfirmation({ ...roleDispatcher, enforced: false, seedManaged: false }).message)
      .toBe('이 단계를 삭제할까요?')
  })

  test('미리보기 패널은 편집 중 역할 라벨과 단계 수를 즉시 반영한다', () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalLinePreviewPanel, {
        roles: [roleCreator, { ...roleDispatcher, label: '출고담당' }, roleInspector, roleExtra],
      }),
    )

    expect(html).toContain('결재란 미리보기')
    expect(html).toContain('작성자')
    expect(html).toContain('출고담당')
    expect(html).toContain('검수자')
    expect(html).toContain('확인자')
    expect(html).toContain('preview-signature-placeholder')
  })
})

describe('ApprovalLineDocTypeSelect', () => {
  const docTypes: ConfigurableDocType[] = [
    { value: 'SLIP_OUTBOUND', label: '출고전표', kind: 'SLIP' },
    { value: 'SLIP_INBOUND', label: '입고전표', kind: 'SLIP' },
    { value: 'PARTNER_ORDER', label: '주문', kind: 'SLIP' },
    { value: 'GROUPWARE_EXPENSE_REPORT', label: '지출결의서', kind: 'GROUPWARE' },
    { value: 'GROUPWARE_LEAVE_REQUEST', label: '휴가신청서', kind: 'GROUPWARE' },
  ]

  test('전표와 그룹웨어 문서종류를 optgroup 으로 나누어 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalLineDocTypeOptionGroups, {
        docTypes,
      }),
    )

    expect(html).toContain('label="전표"')
    expect(html).toContain('label="그룹웨어"')
    expect(html).toContain('출고전표')
    expect(html).toContain('지출결의서')
    expect(html).toContain('GROUPWARE_EXPENSE_REPORT')
  })

  test('현재 선택값이 동적 목록에 없으면 첫 문서종류로 보정한다', () => {
    expect(resolveApprovalLineDocTypeSelection('UNKNOWN', docTypes)).toBe('SLIP_OUTBOUND')
    expect(resolveApprovalLineDocTypeSelection('GROUPWARE_LEAVE_REQUEST', docTypes)).toBe('GROUPWARE_LEAVE_REQUEST')
  })
})

// ── 샘플 역할 픽스처 ──
const roleCreator: ApprovalLineRole = {
  id: 'r0',
  sequence: 0,
  label: '작성자',
  stepType: 'CREATOR',
  approvers: [],
  required: true,
  enforced: false,
  seedManaged: true,
}

const roleDispatcher: ApprovalLineRole = {
  id: 'r1',
  sequence: 1,
  label: '출고자',
  stepType: 'GROUP',
  approvers: [],
  required: true,
  enforced: true,
  seedManaged: true,
}

const roleInspector: ApprovalLineRole = {
  id: 'r2',
  sequence: 2,
  label: '검수자',
  stepType: 'GROUP',
  approvers: [],
  required: true,
  enforced: true,
  seedManaged: true,
}

const roleExtra: ApprovalLineRole = {
  id: 'r3',
  sequence: 3,
  label: '확인자',
  stepType: 'GROUP',
  approvers: [],
  required: true,
  enforced: false,
  seedManaged: false,
}

describe('notifyApprovalRoleLabelChange (Task 3)', () => {
  test('정상 라벨 변경 시 onRename 을 호출한다', () => {
    const onRename = vi.fn()
    notifyApprovalRoleLabelChange('출고담당', roleDispatcher, onRename)
    expect(onRename).toHaveBeenCalledWith('출고담당')
  })

  test('blank 입력은 onRename 을 호출하지 않는다', () => {
    const onRename = vi.fn()
    notifyApprovalRoleLabelChange('', roleDispatcher, onRename)
    notifyApprovalRoleLabelChange('   ', roleDispatcher, onRename)
    expect(onRename).not.toHaveBeenCalled()
  })

  test('동일 값 입력은 onRename 을 호출하지 않는다', () => {
    const onRename = vi.fn()
    notifyApprovalRoleLabelChange('출고자', roleDispatcher, onRename)
    expect(onRename).not.toHaveBeenCalled()
  })

  test('CREATOR 역할은 onRename 을 호출하지 않는다', () => {
    const onRename = vi.fn()
    notifyApprovalRoleLabelChange('새이름', roleCreator, onRename)
    expect(onRename).not.toHaveBeenCalled()
  })

  test('앞뒤 공백을 trim 하여 호출한다', () => {
    const onRename = vi.fn()
    notifyApprovalRoleLabelChange('  출고담당  ', roleDispatcher, onRename)
    expect(onRename).toHaveBeenCalledWith('출고담당')
  })
})

describe('computeApprovalRoleReorder (Task 4)', () => {
  const roles = [roleCreator, roleDispatcher, roleInspector]

  test('비-CREATOR 드롭 시 작성자는 항상 index 0', () => {
    const result = computeApprovalRoleReorder(roles, 'r1', 'r2')
    expect(result[0]).toBe('r0') // CREATOR 고정
  })

  test('출고자(r1) → 검수자(r2) 위치로 드래그 시 순서 [r0, r2, r1]', () => {
    const result = computeApprovalRoleReorder(roles, 'r1', 'r2')
    expect(result).toEqual(['r0', 'r2', 'r1'])
  })

  test('검수자(r2) → 출고자(r1) 위치로 드래그 시 순서 [r0, r2, r1]', () => {
    // r2 를 r1 위치(앞)로 드래그 → r2, r1 순
    const result = computeApprovalRoleReorder(roles, 'r2', 'r1')
    expect(result).toEqual(['r0', 'r2', 'r1'])
  })

  test('CREATOR 가 active 이면 현재 순서 그대로 반환한다', () => {
    const result = computeApprovalRoleReorder(roles, 'r0', 'r1')
    expect(result).toEqual(['r0', 'r1', 'r2'])
  })

  test('CREATOR 가 over 이면 현재 순서 그대로 반환한다 (작성자 위로 드롭 불가)', () => {
    const result = computeApprovalRoleReorder(roles, 'r1', 'r0')
    expect(result).toEqual(['r0', 'r1', 'r2'])
  })

  test('작성자 위 드롭 결과가 현재 순서와 같으면 변경 없음으로 판정한다', () => {
    const result = computeApprovalRoleReorder(roles, 'r1', 'r0')
    expect(areApprovalRoleOrdersEqual(result, getOrderedApprovalRoleIds(roles))).toBe(true)
  })
})

describe('canDeleteApprover (M7 — pending-* 제거 차단 가드)', () => {
  test('pending-* id 는 삭제 불가(비-UUID DELETE 400 방지)', () => {
    expect(canDeleteApprover('pending-USER-u1')).toBe(false)
    expect(canDeleteApprover('pending-GROUP-g1')).toBe(false)
    expect(canDeleteApprover('pending-step-SLIP_OUTBOUND-1700000000000')).toBe(false)
  })

  test('서버 발급 실 id 는 삭제 허용', () => {
    expect(canDeleteApprover('a0')).toBe(true)
    expect(canDeleteApprover('11111111-2222-3333-4444-555555555555')).toBe(true)
  })

  test('빈 문자열은 pending 접두어가 아니므로 삭제 허용(가드는 pending-* 만 차단)', () => {
    expect(canDeleteApprover('')).toBe(true)
  })

  test('낙관 add→서버치환 수명주기: pending 제거 차단, 실 id 치환 후 optimistic 제거 성공', () => {
    const current: ApprovalLineRole[] = [{
      id: 'r1',
      sequence: 1,
      label: '출고자',
      stepType: 'GROUP',
      approvers: [],
      required: true,
      enforced: true,
      seedManaged: true,
    }]

    const added = optimisticallyAddApprovalLineApprover(current, 'r1', {
      type: 'USER',
      refId: 'u1',
      displayName: '홍길동',
    })
    const pendingId = added?.[0]?.approvers[0]?.id ?? ''
    expect(pendingId).toContain('pending-')
    // 낙관 add 진행 중(pending id)에는 제거를 차단해 400 을 피한다.
    expect(canDeleteApprover(pendingId)).toBe(false)

    // 서버 응답으로 실 id 가 치환되면 제거가 허용되고 optimistic 제거가 approvers 를 비운다.
    const realId = 'a-real-uuid-0001'
    const settled = added?.map((role) => ({
      ...role,
      approvers: role.approvers.map((approver) =>
        approver.id === pendingId ? { ...approver, id: realId } : approver),
    }))
    expect(canDeleteApprover(realId)).toBe(true)
    const removed = optimisticallyRemoveApprovalLineApprover(settled, 'r1', realId)
    expect(removed?.[0]?.approvers).toHaveLength(0)
  })
})
