import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  assignAccountGroup,
  createPermissionGroup,
  deletePermissionGroup,
  fetchAccountGroups,
  fetchPermissionGroups,
  unassignAccountGroup,
  updatePermissionGroup,
  type AccountGroupSummary,
  type PermissionGroupSummary,
} from '../api/permissionGroupsApi'
import { fetchAccounts, type PermissionAccount } from '../api/permissionsApi'
import { usePageTitle } from '../hooks/usePageTitle'

type GroupFormMode = 'create' | 'edit'

interface GroupFormState {
  mode: GroupFormMode
  group: PermissionGroupSummary | null
  name: string
  description: string
}

function groupTestName(name: string): string {
  if (name === '마스터') return 'master'
  return name.replace(/\s+/g, '-')
}

export function PermissionGroupManagePage() {
  usePageTitle('권한그룹 관리')

  const queryClient = useQueryClient()
  const [form, setForm] = useState<GroupFormState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PermissionGroupSummary | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['admin', 'permission-groups'],
    queryFn: fetchPermissionGroups,
  })

  const accountsQuery = useQuery({
    queryKey: ['admin', 'permission-accounts'],
    queryFn: fetchAccounts,
  })

  const accountGroupsQuery = useQuery({
    queryKey: ['admin', 'permission-account-groups', selectedAccountId],
    queryFn: () => fetchAccountGroups(selectedAccountId),
    enabled: selectedAccountId.length > 0,
  })

  const accounts = accountsQuery.data ?? []
  const groups = groupsQuery.data ?? []
  const assignedGroups = accountGroupsQuery.data ?? []
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  const assignedIds = useMemo(() => new Set(assignedGroups.map((group) => group.groupId)), [assignedGroups])
  const assignableGroups = groups.filter((group) =>
    !assignedIds.has(group.id) && !group.isBuiltin && !group.isSystemMaster,
  )

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) setSelectedAccountId(accounts[0]!.id)
  }, [accounts, selectedAccountId])

  const invalidateGroups = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-groups'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-account-groups'] })
    void queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string | null }) => createPermissionGroup(payload),
    onSuccess: () => {
      setForm(null)
      invalidateGroups()
      setToast({ type: 'success', message: '권한그룹을 추가했습니다.' })
    },
    onError: () => setToast({ type: 'error', message: '권한그룹 추가 중 오류가 발생했습니다.' }),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { groupId: string; name: string; description?: string | null }) =>
      updatePermissionGroup(payload.groupId, payload),
    onSuccess: () => {
      setForm(null)
      invalidateGroups()
      setToast({ type: 'success', message: '권한그룹을 변경했습니다.' })
    },
    onError: () => setToast({ type: 'error', message: '권한그룹 변경 중 오류가 발생했습니다.' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (groupId: string) => deletePermissionGroup(groupId),
    onSuccess: () => {
      setDeleteTarget(null)
      invalidateGroups()
      setToast({ type: 'success', message: '권한그룹을 삭제했습니다.' })
    },
    onError: () => setToast({ type: 'error', message: '권한그룹 삭제 중 오류가 발생했습니다.' }),
  })

  const assignMutation = useMutation({
    mutationFn: (groupId: string) => assignAccountGroup(selectedAccountId, groupId),
    onSuccess: () => {
      invalidateGroups()
      setToast({ type: 'success', message: '계정 권한그룹을 배속했습니다.' })
    },
    onError: () => setToast({ type: 'error', message: '계정 권한그룹 배속 중 오류가 발생했습니다.' }),
  })

  const unassignMutation = useMutation({
    mutationFn: (groupId: string) => unassignAccountGroup(selectedAccountId, groupId),
    onSuccess: () => {
      invalidateGroups()
      setToast({ type: 'success', message: '계정 권한그룹 배속을 해제했습니다.' })
    },
    onError: () => setToast({ type: 'error', message: '계정 권한그룹 해제 중 오류가 발생했습니다.' }),
  })

  const columns: DataTableColumn<PermissionGroupSummary>[] = [
    {
      key: 'name',
      header: '그룹명',
      mobilePriority: 'primary',
      render: (group) => (
        <span>
          {group.name}
          {group.isBuiltin ? (
            <span data-testid={`perm-group-lock-${groupTestName(group.name)}`} style={{ marginLeft: 8 }}>
              <Badge variant="warning">잠금</Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'description',
      header: '설명',
      mobilePriority: 'secondary',
      render: (group) => group.description ?? '',
    },
    {
      key: 'assignedAccountCount',
      header: '배속 계정',
      width: '110px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (group) => group.assignedAccountCount.toLocaleString(),
    },
    {
      key: 'actions',
      header: '작업',
      width: '190px',
      mobilePriority: 'secondary',
      render: (group) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={group.isBuiltin}
            data-testid={`perm-group-edit-${groupTestName(group.name)}`}
            onClick={() => setForm({
              mode: 'edit',
              group,
              name: group.name,
              description: group.description ?? '',
            })}
          >
            개명
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={group.isBuiltin || group.assignedAccountCount > 0}
            data-testid={`perm-group-delete-${groupTestName(group.name)}`}
            onClick={() => setDeleteTarget(group)}
          >
            삭제
          </Button>
        </span>
      ),
    },
  ]

  const submitForm = () => {
    const name = form?.name.trim() ?? ''
    if (!form || !name) return
    const description = form.description.trim() || null
    if (form.mode === 'create') {
      createMutation.mutate({ name, description })
    } else if (form.group) {
      updateMutation.mutate({ groupId: form.group.id, name, description })
    }
  }

  return (
    <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: 16 }}>
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>권한그룹 관리</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)', fontSize: 13 }}>
              그룹명과 배속 계정 수를 기준으로 운영합니다.
            </p>
          </div>
          <Button
            variant="primary"
            data-testid="perm-group-add-btn"
            onClick={() => setForm({ mode: 'create', group: null, name: '', description: '' })}
          >
            그룹 추가
          </Button>
        </div>
        <div data-testid="perm-group-manage-table">
          <DataTable
            columns={columns}
            rows={groups}
            loading={groupsQuery.isLoading}
            rowKey={(group) => group.id}
            emptyMessage="등록된 권한그룹이 없습니다."
          />
        </div>
      </section>

      <section
        style={{
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 8,
          padding: 14,
          background: 'var(--color-neutral-0)',
          alignSelf: 'start',
        }}
      >
        <h3 style={{ margin: 0 }}>계정 그룹 배속</h3>
        <p style={{ margin: '4px 0 12px', color: 'var(--color-neutral-500)', fontSize: 13 }}>
          한 계정은 여러 권한그룹에 동시에 속할 수 있습니다.
        </p>
        <select
          data-testid="perm-group-account-select"
          aria-label="권한그룹을 배속할 계정"
          value={selectedAccountId}
          onChange={(event) => setSelectedAccountId(event.target.value)}
          style={{
            width: '100%',
            height: 34,
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 6,
            padding: '0 8px',
            marginBottom: 12,
          }}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account)}
            </option>
          ))}
        </select>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          {selectedAccount ? selectedAccount.displayName : '계정 선택'} 배속 그룹
        </div>
        <div data-testid="perm-group-account-assigned" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {assignedGroups.length === 0 ? (
            <span style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>배속된 그룹이 없습니다.</span>
          ) : assignedGroups.map((group) => (
            <AssignedGroupRow
              key={group.groupId}
              group={group}
              disabled={unassignMutation.isPending || group.groupSystemMaster}
              onUnassign={() => unassignMutation.mutate(group.groupId)}
            />
          ))}
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>추가 배속</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {assignableGroups.length === 0 ? (
            <span style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>추가 가능한 그룹이 없습니다.</span>
          ) : assignableGroups.map((group) => (
            <Button
              key={group.id}
              variant="secondary"
              size="sm"
              disabled={!selectedAccountId || assignMutation.isPending}
              data-testid={`perm-group-assign-${groupTestName(group.name)}`}
              onClick={() => assignMutation.mutate(group.id)}
            >
              {group.name}
            </Button>
          ))}
        </div>
      </section>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.mode === 'create' ? '권한그룹 추가' : '권한그룹 변경'}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>취소</Button>
            <Button
              variant="primary"
              data-testid="perm-group-form-submit"
              disabled={!form?.name.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={submitForm}
            >
              저장
            </Button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>그룹명</span>
            <input
              data-testid="perm-group-form-name"
              value={form?.name ?? ''}
              onChange={(event) => setForm((prev) => prev ? { ...prev, name: event.target.value } : prev)}
              maxLength={100}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>설명</span>
            <textarea
              data-testid="perm-group-form-description"
              value={form?.description ?? ''}
              onChange={(event) => setForm((prev) => prev ? { ...prev, description: event.target.value } : prev)}
              maxLength={255}
              rows={3}
              style={{ ...inputStyle, height: 'auto', paddingTop: 8 }}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="권한그룹 삭제"
        description={deleteTarget ? `${deleteTarget.name} 그룹을 삭제합니다.` : undefined}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button
              variant="danger"
              data-testid="perm-group-delete-confirm"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={() => deleteTarget ? deleteMutation.mutate(deleteTarget.id) : undefined}
            >
              삭제
            </Button>
          </>
        )}
      />

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

function AssignedGroupRow({
  group,
  disabled,
  onUnassign,
}: {
  group: AccountGroupSummary
  disabled: boolean
  onUnassign: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 6,
        padding: '7px 8px',
      }}
    >
      <span>
        {group.groupName}
        {group.groupBuiltin ? <span style={{ marginLeft: 6 }}><Badge variant="warning">잠금</Badge></span> : null}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        data-testid={`perm-group-unassign-${groupTestName(group.groupName)}`}
        onClick={onUnassign}
      >
        해제
      </Button>
    </div>
  )
}

function accountLabel(account: PermissionAccount): string {
  return `${account.displayName} / ${account.role}${account.enabled ? '' : ' / 비활성'}`
}

const inputStyle: React.CSSProperties = {
  height: 36,
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  padding: '0 10px',
  fontSize: 14,
}
