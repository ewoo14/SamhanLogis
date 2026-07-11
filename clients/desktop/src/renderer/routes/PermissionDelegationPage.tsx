import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Spinner } from '@samhan/design-system'
import {
  fetchPermissionGroups,
  getDelegations,
  updateDelegations,
  type PermissionGroupDelegations,
  type PermissionGroupSummary,
} from '../api/permissionGroupsApi'
import { usePageTitle } from '../hooks/usePageTitle'

type DelegationKey = keyof PermissionGroupDelegations

const DELEGATION_ITEMS: Array<{
  key: DelegationKey
  label: string
  pageCode: string
  description: string
  testId: string
}> = [
  {
    key: 'permissionAdmin',
    label: '권한설정 관리',
    pageCode: 'system.permission-admin',
    description: '계정별 권한설정과 권한 매트릭스 운영 권한입니다.',
    testId: 'permission-admin',
  },
  {
    key: 'hrRoleManagement',
    label: '인사 역할관리',
    pageCode: 'hr.role-management',
    description: '직원 역할 변경과 퇴사 처리 같은 고위험 인사 권한입니다.',
    testId: 'hr-role-management',
  },
  {
    key: 'permissionGroups',
    label: '권한그룹 관리',
    pageCode: 'admin.permission-groups',
    description: '권한그룹 생성, 변경, 배속 운영 권한입니다.',
    testId: 'permission-groups',
  },
]

const EMPTY_DELEGATIONS: PermissionGroupDelegations = {
  permissionAdmin: false,
  hrRoleManagement: false,
  permissionGroups: false,
}

function sameDelegations(
  left: PermissionGroupDelegations | null,
  right: PermissionGroupDelegations | null,
): boolean {
  if (!left || !right) return false
  return DELEGATION_ITEMS.every((item) => left[item.key] === right[item.key])
}

function groupOptionLabel(group: PermissionGroupSummary): string {
  return `${group.name}${group.isBuiltin ? ' / 잠금' : ''}`
}

export function PermissionDelegationPage() {
  usePageTitle('권한 위임')

  const queryClient = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [draft, setDraft] = useState<PermissionGroupDelegations | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['admin', 'permission-groups'],
    queryFn: fetchPermissionGroups,
  })

  const delegationsQuery = useQuery({
    queryKey: ['admin', 'permission-group-delegations', selectedGroupId],
    queryFn: () => getDelegations(selectedGroupId),
    enabled: selectedGroupId.length > 0,
  })

  const groups = groupsQuery.data ?? []
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const serverDelegations = delegationsQuery.data ?? null
  const currentDelegations = draft ?? serverDelegations ?? EMPTY_DELEGATIONS
  const isDirty = !sameDelegations(draft, serverDelegations)
  const delegatedCount = useMemo(
    () => DELEGATION_ITEMS.filter((item) => currentDelegations[item.key]).length,
    [currentDelegations],
  )

  useEffect(() => {
    const firstEditable = groups.find((group) => !group.isSystemMaster && !group.isBuiltin) ?? groups[0]
    if (!selectedGroupId && firstEditable) setSelectedGroupId(firstEditable.id)
  }, [groups, selectedGroupId])

  useEffect(() => {
    setDraft(delegationsQuery.data ?? null)
  }, [delegationsQuery.dataUpdatedAt, delegationsQuery.data])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const saveMutation = useMutation({
    mutationFn: (payload: PermissionGroupDelegations) => updateDelegations(selectedGroupId, payload),
    onSuccess: (result) => {
      setDraft(result)
      void queryClient.setQueryData(['admin', 'permission-group-delegations', selectedGroupId], result)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-group-matrix', selectedGroupId] })
      void queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })
      setToast({ type: 'success', message: '권한 위임을 저장했습니다.' })
    },
    onError: () => setToast({ type: 'error', message: '권한 위임 저장 중 오류가 발생했습니다.' }),
  })

  const changeGroup = (groupId: string) => {
    if (isDirty && !window.confirm('저장하지 않은 위임 변경이 있습니다. 그룹을 변경할까요?')) return
    setSelectedGroupId(groupId)
  }

  const setDelegation = (key: DelegationKey, checked: boolean) => {
    setDraft((prev) => ({
      ...(prev ?? serverDelegations ?? EMPTY_DELEGATIONS),
      [key]: checked,
    }))
  }

  if (groupsQuery.isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
  }

  if (groupsQuery.isError) {
    return <div style={{ padding: 48, color: 'var(--color-danger-600)' }}>권한그룹 목록을 불러오지 못했습니다.</div>
  }

  return (
    <div data-testid="perm-delegation-page" style={{ padding: '0 4px 28px', maxWidth: 1120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>권한 위임</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            MASTER가 권한그룹에 관리권위를 부여하거나 회수합니다.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge variant={delegatedCount > 0 ? 'brand' : 'neutral'}>{delegatedCount}개 위임</Badge>
          {selectedGroup?.isBuiltin ? <Badge variant="warning">잠금</Badge> : <Badge variant="brand">사용자정의</Badge>}
        </div>
      </div>

      <section style={panelStyle}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>위임 대상 권한그룹</span>
          <select
            data-testid="perm-delegation-group-select"
            aria-label="권한 위임 대상 권한그룹"
            value={selectedGroupId}
            onChange={(event) => changeGroup(event.target.value)}
            style={selectStyle}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {groupOptionLabel(group)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
          {selectedGroup?.description ?? '설명이 없는 권한그룹입니다.'}
        </div>
      </section>

      {delegationsQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : null}

      {!delegationsQuery.isLoading && selectedGroup ? (
        <section style={{ ...panelStyle, display: 'grid', gap: 10 }}>
          {DELEGATION_ITEMS.map((item) => {
            const checked = currentDelegations[item.key]
            return (
              <div key={item.key} style={delegationRowStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
                  <input
                    type="checkbox"
                    data-testid={`perm-delegation-toggle-${item.testId}`}
                    checked={checked}
                    disabled={selectedGroup.isBuiltin || saveMutation.isPending}
                    onChange={(event) => setDelegation(item.key, event.target.checked)}
                    aria-label={`${item.label} 위임`}
                  />
                  <span style={{ fontWeight: 700 }}>{item.label}</span>
                </label>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 2 }}>{item.pageCode}</div>
                  <div style={{ fontSize: 13 }}>{item.description}</div>
                </div>
                <span data-testid={`perm-delegation-status-${item.testId}`}>
                  <Badge variant={checked ? 'success' : 'neutral'}>{checked ? '위임됨' : '미위임'}</Badge>
                </span>
              </div>
            )
          })}

          {selectedGroup.isBuiltin ? (
            <div style={{ color: 'var(--color-warning-800, #8C5C13)', fontSize: 13 }}>
              시스템 권한그룹은 위임 설정을 변경할 수 없습니다.
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button
              variant="ghost"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => setDraft(serverDelegations)}
            >
              취소
            </Button>
            <Button
              variant="primary"
              data-testid="perm-delegation-save-btn"
              disabled={!isDirty || selectedGroup.isBuiltin || saveMutation.isPending}
              onClick={() => saveMutation.mutate(currentDelegations)}
            >
              {saveMutation.isPending ? '저장 중' : '저장'}
            </Button>
          </div>
        </section>
      ) : null}

      {toast ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 100,
            borderRadius: 8,
            padding: '10px 14px',
            background: toast.type === 'success' ? 'var(--color-success-600)' : 'var(--color-danger-600)',
            color: 'var(--color-neutral-0)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 8,
  padding: 14,
  background: 'var(--color-neutral-0)',
  marginBottom: 12,
}

const selectStyle: React.CSSProperties = {
  height: 36,
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  padding: '0 10px',
  background: 'var(--color-neutral-0)',
  color: 'var(--color-neutral-900)',
  fontSize: 14,
}

const delegationRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 8,
  padding: 12,
  background: 'var(--color-neutral-50)',
}
