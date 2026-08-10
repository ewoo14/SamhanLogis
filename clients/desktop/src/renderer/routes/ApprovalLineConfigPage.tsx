import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Card, DragHandle, Input, Modal, MultiSelectAutocomplete, Select, Spinner, TagChip } from '@samhan/design-system'
import {
  DOC_TYPES,
  STEP_TYPE_LABEL,
  addApprovalLineApprover,
  addApprovalLineStep,
  deleteApprovalLineStep,
  fetchApprovalLineGroups,
  fetchApprovalLineRoles,
  fetchConfigurableDocTypes,
  removeApprovalLineApprover,
  reorderApprovalLineRoles,
  renameApprovalLineRole,
  searchApprovalLineUsers,
  updateApprovalLineRole,
  type ApprovalLineApprover,
  type ApprovalLineGroupOption,
  type ApprovalLineRole,
  type ConfigurableDocType,
} from '../api/approvalLineConfigApi'
import { usePageTitle } from '../hooks/usePageTitle'

export type ApprovalLineApproverOption = {
  type: 'GROUP' | 'USER'
  refId: string
  displayName: string
}

const FALLBACK_CONFIGURABLE_DOC_TYPES: ConfigurableDocType[] = DOC_TYPES.map((type) => ({
  ...type,
  kind: 'SLIP',
}))


export function resolveApprovalLineDocTypeSelection(current: string, docTypes: ConfigurableDocType[]): string {
  if (docTypes.some((type) => type.value === current)) return current
  return docTypes[0]?.value ?? current
}

export function ApprovalLineDocTypeSelect({
  value,
  docTypes,
  loading,
  onChange,
}: {
  value: string
  docTypes: ConfigurableDocType[]
  loading: boolean
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="문서 종류"
      data-testid="approval-line-doc-type-select"
      disabled={loading && docTypes.length === 0}
    >
      <ApprovalLineDocTypeOptionGroups docTypes={docTypes} />
    </Select>
  )
}

export function ApprovalLineDocTypeOptionGroups({ docTypes }: { docTypes: ConfigurableDocType[] }) {
  const slipDocTypes = docTypes.filter((type) => type.kind === 'SLIP')
  const groupwareDocTypes = docTypes.filter((type) => type.kind === 'GROUPWARE')

  return (
    <>
      <optgroup label="전표">
        {slipDocTypes.map((type) => (
          <option key={type.value} value={type.value}>{type.label}</option>
        ))}
      </optgroup>
      {groupwareDocTypes.length > 0 ? (
        <optgroup label="그룹웨어">
          {groupwareDocTypes.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </optgroup>
      ) : null}
    </>
  )
}

/** 결재라인 설정 — 전표 종류별 역할에 결재자 칩/필수 지정, 드래그 순서변경, 라벨 인라인 편집. */
export function ApprovalLineConfigPage() {
  usePageTitle('결재라인 설정')

  const queryClient = useQueryClient()
  const [docType, setDocType] = useState(DOC_TYPES[0]!.value)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pendingRoleIds, setPendingRoleIds] = useState<Set<string>>(() => new Set())
  const [newStepLabel, setNewStepLabel] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ApprovalLineRole | null>(null)
  const rolesQueryKey = approvalLineRolesQueryKey(docType)

  const docTypesQuery = useQuery({
    queryKey: ['admin', 'approval-line-config', 'configurable-doc-types'],
    queryFn: fetchConfigurableDocTypes,
  })

  const rolesQuery = useQuery({
    queryKey: rolesQueryKey,
    queryFn: () => fetchApprovalLineRoles(docType),
  })

  const groupsQuery = useQuery({
    queryKey: ['admin', 'approval-line-config', 'groups'],
    queryFn: fetchApprovalLineGroups,
  })

  const searchApproverOptions = useCallback(async (q: string): Promise<ApprovalLineApproverOption[]> => {
    const keyword = q.trim()
    const groupOptions = groupsQuery.data ?? []
    const matchedGroups = groupOptions
      .filter((group) => !keyword || group.name.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))
      .map((group) => ({ type: 'GROUP' as const, refId: group.id, displayName: group.name }))
    const users = await searchApprovalLineUsers(keyword, 20)
    return [
      ...matchedGroups,
      ...users.map((user) => ({ type: 'USER' as const, refId: user.id, displayName: user.displayName })),
    ]
  }, [groupsQuery.data])

  // ── 필수 업데이트 뮤테이션 (A2-1c: 결재자 지정은 별도 add/remove endpoint) ──
  const updateMutation = useMutation({
    mutationFn: (value: { id: string; required: boolean }) =>
      updateApprovalLineRole(value.id, { required: value.required }),
    onMutate: async (value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.add(value.id)
        return next
      })
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => optimisticallyUpdateApprovalLineRoles(current, value),
      )
      return { prev }
    },
    onSuccess: () => {
      setToast({ type: 'success', message: '결재라인 설정을 저장했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '저장 중 오류가 발생했습니다.' })
    },
    onSettled: (_data, _error, value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.delete(value.id)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  const addApproverMutation = useMutation({
    mutationFn: (value: { roleId: string; option: ApprovalLineApproverOption }) =>
      addApprovalLineApprover(value.roleId, value.option.type, value.option.refId),
    onMutate: async (value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.add(value.roleId)
        return next
      })
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => optimisticallyAddApprovalLineApprover(current, value.roleId, value.option),
      )
      return { prev }
    },
    onSuccess: (role) => {
      queryClient.setQueryData<ApprovalLineRole[]>(rolesQueryKey, (current) =>
        current?.map((item) => item.id === role.id ? role : item))
      setToast({ type: 'success', message: '결재자를 추가했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '결재자 추가 중 오류가 발생했습니다.' })
    },
    onSettled: (_data, _error, value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.delete(value.roleId)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  const removeApproverMutation = useMutation({
    mutationFn: (value: { roleId: string; approverId: string }) =>
      removeApprovalLineApprover(value.roleId, value.approverId),
    onMutate: async (value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.add(value.roleId)
        return next
      })
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => optimisticallyRemoveApprovalLineApprover(current, value.roleId, value.approverId),
      )
      return { prev }
    },
    onSuccess: (role) => {
      queryClient.setQueryData<ApprovalLineRole[]>(rolesQueryKey, (current) =>
        current?.map((item) => item.id === role.id ? role : item))
      setToast({ type: 'success', message: '결재자를 제거했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '결재자 제거 중 오류가 발생했습니다.' })
    },
    onSettled: (_data, _error, value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.delete(value.roleId)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  const addStepMutation = useMutation({
    mutationFn: (value: { documentType: string; label: string }) =>
      addApprovalLineStep(value.documentType, value.label),
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => optimisticallyAddApprovalLineStep(current, value),
      )
      return { prev }
    },
    onSuccess: (role) => {
      queryClient.setQueryData<ApprovalLineRole[]>(rolesQueryKey, (current) => {
        if (!current) return [role]
        const withoutPending = current.filter((item) => !item.id.startsWith(`pending-step-${docType}-`))
        return [...withoutPending, role].sort((a, b) => a.sequence - b.sequence)
      })
      setNewStepLabel('')
      setToast({ type: 'success', message: '결재 단계를 추가했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '단계 추가 중 오류가 발생했습니다.' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  const deleteStepMutation = useMutation({
    mutationFn: (value: { id: string }) => deleteApprovalLineStep(value.id),
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => optimisticallyDeleteApprovalLineStep(current, value.id),
      )
      return { prev }
    },
    onSuccess: () => {
      setDeleteTarget(null)
      setToast({ type: 'success', message: '결재 단계를 삭제했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '단계 삭제 중 오류가 발생했습니다.' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  // ── 라벨 rename 뮤테이션 (Task 3) ──
  const renameMutation = useMutation({
    mutationFn: (value: { id: string; label: string }) =>
      renameApprovalLineRole(value.id, value.label),
    onMutate: async (value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.add(value.id)
        return next
      })
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => current?.map((role) =>
          role.id === value.id ? { ...role, label: value.label } : role,
        ),
      )
      return { prev }
    },
    onSuccess: () => {
      setToast({ type: 'success', message: '역할 라벨을 변경했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '라벨 변경 중 오류가 발생했습니다.' })
    },
    onSettled: (_data, _error, value) => {
      setPendingRoleIds((prev) => {
        const next = new Set(prev)
        next.delete(value.id)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  // ── 드래그 순서 변경 뮤테이션 (Task 4) ──
  const reorderMutation = useMutation({
    mutationFn: (value: { orderedIds: string[] }) =>
      reorderApprovalLineRoles(docType, value.orderedIds),
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: rolesQueryKey })
      const prev = queryClient.getQueryData<ApprovalLineRole[]>(rolesQueryKey)
      // 낙관적 재정렬: orderedIds 순서대로 sequence 재할당
      queryClient.setQueryData<ApprovalLineRole[]>(
        rolesQueryKey,
        (current) => {
          if (!current) return current
          return value.orderedIds
            .map((id, index) => {
              const role = current.find((r) => r.id === id)
              return role ? { ...role, sequence: index } : null
            })
            .filter((r): r is ApprovalLineRole => r !== null)
        },
      )
      return { prev }
    },
    onSuccess: () => {
      setToast({ type: 'success', message: '결재 역할 순서를 변경했습니다.' })
    },
    onError: (_error, _value, context) => {
      restoreApprovalLineRolesSnapshot(queryClient, rolesQueryKey, context?.prev)
      setToast({ type: 'error', message: '순서 변경 중 오류가 발생했습니다.' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
  })

  // ── 드래그 센서 ──
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const roles = rolesQuery.data ?? []
    const orderedIds = computeApprovalRoleReorder(roles, String(active.id), String(over.id))
    if (areApprovalRoleOrdersEqual(orderedIds, getOrderedApprovalRoleIds(roles))) return
    reorderMutation.mutate({ orderedIds })
  }, [rolesQuery.data, reorderMutation])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const docTypes = docTypesQuery.data ?? FALLBACK_CONFIGURABLE_DOC_TYPES

  useEffect(() => {
    setDocType((current) => resolveApprovalLineDocTypeSelection(current, docTypes))
  }, [docTypes])

  const roles = rolesQuery.data ?? []
  const trimmedNewStepLabel = newStepLabel.trim()
  const deleteConfirmation = deleteTarget ? getApprovalLineDeleteConfirmation(deleteTarget) : null

  return (
    <div data-testid="approval-line-config-page" style={{ maxWidth: 1120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>결재라인 설정</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)', fontSize: 13 }}>
            문서 종류별 결재 역할에 권한 그룹과 필수여부를 지정합니다.
          </p>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>문서 종류</span>
          <ApprovalLineDocTypeSelect
            value={docType}
            docTypes={docTypes}
            loading={docTypesQuery.isLoading}
            onChange={setDocType}
          />
        </label>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {rolesQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : null}

        {rolesQuery.isError ? (
          <div style={{ padding: 24, color: 'var(--color-danger-600)' }}>
            결재라인 설정 정보를 불러오지 못했습니다.
          </div>
        ) : null}

        {!rolesQuery.isLoading && !rolesQuery.isError ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 12, borderBottom: '1px solid var(--color-neutral-200)' }}>
              <Input
                type="text"
                value={newStepLabel}
                onChange={(event) => setNewStepLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && trimmedNewStepLabel && !addStepMutation.isPending) {
                    addStepMutation.mutate({ documentType: docType, label: trimmedNewStepLabel })
                  }
                }}
                placeholder="새 단계 라벨"
                aria-label="새 결재 단계 라벨"
                data-testid="approval-line-new-step-label"
                disabled={addStepMutation.isPending}
                inputSize="sm"
                fullWidth={false}
                style={{
                  width: 'min(220px, 100%)',
                }}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => addStepMutation.mutate({ documentType: docType, label: trimmedNewStepLabel })}
                disabled={!trimmedNewStepLabel || addStepMutation.isPending}
                loading={addStepMutation.isPending}
                data-testid="approval-line-add-step"
              >
                단계 추가
              </Button>
            </div>
            {groupsQuery.isError ? (
              <div style={{ padding: '10px 12px', color: 'var(--color-warning-800, #8C5C13)', fontSize: 13 }}>
                권한 그룹 목록을 불러오지 못했습니다. 역할 목록은 계속 표시됩니다.
              </div>
            ) : null}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={roles.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table data-testid="approval-line-role-table" style={tableStyle}>
                    <colgroup>
                      <col style={dragColumnStyle} />
                      <col style={sequenceColumnStyle} />
                      <col style={roleColumnStyle} />
                      <col style={groupColumnStyle} />
                      <col style={requiredColumnStyle} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={dragHeadCellStyle} aria-label="드래그 핸들" />
                        <th style={sequenceHeadCellStyle}>순서</th>
                        <th style={roleHeadCellStyle}>역할</th>
                        <th style={groupHeadCellStyle}>결재자</th>
                        <th style={requiredHeadCellStyle}>필수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roles.map((role) => (
                        <SortableApprovalRoleRow
                          key={role.id}
                          role={role}
                          saving={pendingRoleIds.has(role.id)}
                          searchApproverOptions={searchApproverOptions}
                          onRequiredChange={(required) =>
                            updateMutation.mutate({ id: role.id, required })}
                          onAddApprover={(option) =>
                            addApproverMutation.mutate({ roleId: role.id, option })}
                          onRemoveApprover={(approverId) => {
                            // 낙관 add 진행 중(pending-* id)인 칩 제거 시 비-UUID 로 DELETE → 400 회피.
                            // 서버 응답 도착(onSuccess)으로 실 id 치환된 뒤에만 삭제 허용.
                            if (!canDeleteApprover(approverId)) return
                            removeApproverMutation.mutate({ roleId: role.id, approverId })
                          }}
                          onRename={(label) =>
                            renameMutation.mutate({ id: role.id, label })}
                          onDeleteStep={() => setDeleteTarget(role)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </SortableContext>
            </DndContext>
          </>
        ) : null}
      </Card>

      {!rolesQuery.isLoading && !rolesQuery.isError ? (
        <ApprovalLinePreviewPanel roles={roles} />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="approval-line-toast"
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

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleteStepMutation.isPending) setDeleteTarget(null)
        }}
        title={deleteConfirmation?.title ?? '단계 삭제'}
        size="sm"
        closeOnEsc={!deleteStepMutation.isPending}
        closeOnBackdropClick={!deleteStepMutation.isPending}
        footer={(
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteStepMutation.isPending}
            >
              취소
            </Button>
            <Button
              variant="danger"
              loading={deleteStepMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteStepMutation.mutate({ id: deleteTarget.id })
              }}
              data-testid="approval-line-delete-confirm"
            >
              삭제
            </Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          {deleteConfirmation?.message}
        </p>
      </Modal>
    </div>
  )
}

export function ApprovalLinePreviewPanel({ roles }: { roles: ApprovalLineRole[] }) {
  const sortedRoles = [...roles].sort((a, b) => a.sequence - b.sequence)
  return (
    <section
      aria-label="결재란 미리보기"
      data-testid="approval-line-preview"
      style={{
        marginTop: 16,
        padding: 12,
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 6,
        background: 'var(--color-neutral-0)',
      }}
    >
      <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>결재란 미리보기</h4>
      <div
        className="dispatch-roles"
        style={{
          maxWidth: 720,
          minHeight: 72,
          gridTemplateColumns: `repeat(${sortedRoles.length}, minmax(72px, 1fr))`,
        }}
      >
        {sortedRoles.map((role) => (
          <div key={role.id} className="dispatch-role-cell">
            <div className="dispatch-role-label">{role.label}</div>
            <div className="dispatch-role-value">
              <span className="dispatch-role-stamp-space preview-signature-placeholder" />
              <span className="name">예시 서명</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Sortable 행 컴포넌트 (dnd-kit) ──
function SortableApprovalRoleRow({
  role,
  saving,
  searchApproverOptions,
  onRequiredChange,
  onAddApprover,
  onRemoveApprover,
  onRename,
  onDeleteStep,
}: {
  role: ApprovalLineRole
  saving: boolean
  searchApproverOptions: (q: string) => Promise<ApprovalLineApproverOption[]>
  onRequiredChange: (required: boolean) => void
  onAddApprover: (option: ApprovalLineApproverOption) => void
  onRemoveApprover: (approverId: string) => void
  onRename: (label: string) => void
  onDeleteStep: () => void
}) {
  const isCreator = role.stepType === 'CREATOR'

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: role.id, disabled: isCreator })

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 2 : 'auto',
  }

  return (
    <tr
      ref={setNodeRef}
      style={rowStyle}
      data-testid={`approval-role-${role.label}`}
    >
      <td style={dragBodyCellStyle}>
        {isCreator ? (
          // CREATOR 는 드래그 핸들 없음 — 잠금 아이콘으로 고정 표시
          <span
            aria-label="작성자는 순서 고정"
            title="작성자는 항상 첫 순서입니다"
            style={{ display: 'inline-block', width: 28, textAlign: 'center', color: 'var(--color-neutral-400)' }}
          >
            🔒
          </span>
        ) : (
          <DragHandle
            label={`${role.label} 드래그`}
            listeners={listeners as Record<string, unknown> | undefined}
            attributes={attributes as unknown as Record<string, unknown>}
            setActivatorNodeRef={setActivatorNodeRef}
            dragging={isDragging}
          />
        )}
      </td>
      <td style={sequenceBodyCellStyle}>{role.sequence + 1}</td>
      <td style={roleBodyCellStyle}>
        {isCreator ? (
          // CREATOR 라벨은 정적 텍스트 (편집 불가)
          <div style={{ display: 'grid', gap: 2 }}>
            <strong data-testid={`approval-role-label-static-${role.id}`}>{role.label}</strong>
            <span style={stepTypeTextStyle}>{STEP_TYPE_LABEL[role.stepType]}</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ApprovalRoleLabelInput
                role={role}
                saving={saving}
                onRename={onRename}
              />
              <button
                type="button"
                onClick={onDeleteStep}
                disabled={saving}
                aria-label={`${role.label} 단계 삭제`}
                title="단계 삭제"
                data-testid={`approval-role-delete-${role.id}`}
                style={deleteStepButtonStyle}
              >
                ×
              </button>
            </div>
            <span style={stepTypeTextStyle}>{STEP_TYPE_LABEL[role.stepType]}</span>
          </div>
        )}
      </td>
      <td style={groupBodyCellStyle}>
        {isCreator ? (
          <span data-testid="approval-line-creator-auto" style={{ color: 'var(--color-neutral-500)' }}>
            작성자 자동
          </span>
        ) : (
          <ApprovalRoleApproverChips
            role={role}
            saving={saving}
            searchApproverOptions={searchApproverOptions}
            onAddApprover={onAddApprover}
            onRemoveApprover={onRemoveApprover}
          />
        )}
      </td>
      <td style={requiredBodyCellStyle}>
        <Input
          type="checkbox"
          checked={role.required}
          disabled={isCreator || saving}
          onChange={(event) => {
            const nextRequired = event.target.checked
            notifyApprovalRoleRequiredChange(onRequiredChange, nextRequired)
          }}
          aria-label={`${role.label} 필수`}
          data-testid={`approval-role-required-${role.label}`}
          inputSize="sm"
          fullWidth={false}
          style={{ width: 16, height: 16, padding: 0 }}
        />
      </td>
    </tr>
  )
}

function ApprovalRoleApproverChips({
  role,
  saving,
  searchApproverOptions,
  onAddApprover,
  onRemoveApprover,
}: {
  role: ApprovalLineRole
  saving: boolean
  searchApproverOptions: (q: string) => Promise<ApprovalLineApproverOption[]>
  onAddApprover: (option: ApprovalLineApproverOption) => void
  onRemoveApprover: (approverId: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 280 }}>
      <MultiSelectAutocomplete<ApprovalLineApproverOption, ApprovalLineApprover>
        selected={role.approvers}
        onAdd={(option) => notifyApprovalRoleApproverSelected(role, option, onAddApprover)}
        onRemove={(approver) => onRemoveApprover(approver.id)}
        search={searchApproverOptions}
        getOptionKey={(option) => `${option.type}:${option.refId}`}
        getSelectedKey={(approver) => `${approver.type}:${approver.refId}`}
        getInputLabel={(option) => option.displayName}
        renderOption={(option) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={approverTypeBadgeStyle}>{option.type === 'GROUP' ? '그룹' : '사원'}</span>
            <span>{option.displayName}</span>
          </span>
        )}
        listboxLabel={`${role.label} 결재자 검색 결과`}
        ariaLabel={`${role.label} 결재자 검색`}
        inputTestId={`approval-role-approver-search-${role.label}`}
        placeholder="그룹 또는 사원 검색"
        minChars={1}
        resultSelectionMode="multiple"
        autoSelectSingleResult
        resultSelectionTitle={`${role.label} 결재자 검색 결과`}
        disabled={saving}
        renderChip={(approver, _index, onRemove) => (
          <TagChip
            label={approver.type === 'GROUP' ? '그룹' : '사원'}
            value={approver.displayName}
            removeLabel={approver.displayName}
            onRemove={onRemove}
            data-testid="approval-role-approver-chip"
          />
        )}
      />
      {role.approvers.length === 0 ? (
        <span style={{ color: 'var(--color-neutral-400)', fontSize: 12 }}>미지정</span>
      ) : null}
    </div>
  )
}

// ── 라벨 인라인 편집 컴포넌트 (Task 3) ──
function ApprovalRoleLabelInput({
  role,
  saving,
  onRename,
}: {
  role: ApprovalLineRole
  saving: boolean
  onRename: (label: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(role.label)
  const inputRef = useRef<HTMLInputElement>(null)

  // role.label 외부 변경(낙관/롤백) 시 동기화 (editing 중에는 덮지 않음)
  useEffect(() => {
    if (!editing) {
      setInputValue(role.label)
    }
  }, [role.label, editing])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select?.()
  }, [editing])

  function commitEdit() {
    setEditing(false)
    notifyApprovalRoleLabelChange(inputValue, role, onRename)
    setInputValue(inputValue.trim() || role.label)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onBlur={commitEdit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitEdit()
          } else if (event.key === 'Escape') {
            setEditing(false)
            setInputValue(role.label)
          }
        }}
        aria-label={`${role.label} 라벨 편집`}
        data-testid={`approval-role-label-input-${role.id}`}
        disabled={saving}
        inputSize="sm"
        fullWidth={false}
        style={{
          fontWeight: 700,
          minWidth: 80,
        }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setEditing(true)
        setInputValue(role.label)
      }}
      aria-label={`${role.label} 라벨 편집`}
      data-testid={`approval-role-label-btn-${role.id}`}
      disabled={saving}
      title="클릭하여 라벨 편집"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 4,
        fontSize: 13,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <strong>{role.label}</strong>
      <span aria-hidden="true" style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>✎</span>
    </button>
  )
}

// ── 기존 ApprovalRoleRow (단위테스트·SSR 호환용, CREATOR SSR 테스트 대상) ──
export function ApprovalRoleRow({
  role,
  saving,
  onRequiredChange,
  onAddApprover,
  onRemoveApprover,
}: {
  role: ApprovalLineRole
  groups: ApprovalLineGroupOption[]
  saving: boolean
  onRequiredChange: (required: boolean) => void
  onAddApprover?: (option: ApprovalLineApproverOption) => void
  onRemoveApprover?: (approverId: string) => void
}) {
  const isCreator = role.stepType === 'CREATOR'

  return (
    <tr data-testid={`approval-role-${role.label}`}>
      <td style={bodyCellStyle}>{role.sequence + 1}</td>
      <td style={bodyCellStyle}>
        <strong>{role.label}</strong>
        <span style={stepTypeTextStyle}> {STEP_TYPE_LABEL[role.stepType]}</span>
      </td>
      <td style={bodyCellStyle}>
        {isCreator ? (
          <span data-testid="approval-line-creator-auto" style={{ color: 'var(--color-neutral-500)' }}>
            작성자 자동
          </span>
        ) : (
          <div>
            {role.approvers.map((approver) => (
              <span key={approver.id} data-testid="approval-role-approver-chip">
                [{approver.type === 'GROUP' ? '그룹' : '사원'}] {approver.displayName}
                <button type="button" onClick={() => onRemoveApprover?.(approver.id)}>×</button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => onAddApprover?.({ type: 'GROUP', refId: 'g1', displayName: '창고원' })}
              disabled={saving}
            >
              결재자 추가
            </button>
          </div>
        )}
      </td>
      <td style={bodyCellStyle}>
        <Input
          type="checkbox"
          checked={role.required}
          disabled={isCreator || saving}
          onChange={(event) => {
            const nextRequired = event.target.checked
            notifyApprovalRoleRequiredChange(onRequiredChange, nextRequired)
          }}
          aria-label={`${role.label} 필수`}
          data-testid={`approval-role-required-${role.label}`}
          inputSize="sm"
          fullWidth={false}
          style={{ width: 16, height: 16, padding: 0 }}
        />
      </td>
    </tr>
  )
}

// ── 순수 핸들러 / 헬퍼 (단위테스트 대상) ──

type ApprovalRoleRequiredHandler = (required: boolean) => void
type ApprovalRoleUpdateValue = { id: string; required: boolean }
type ApprovalLineAddStepValue = { documentType: string; label: string }

export function approvalLineRolesQueryKey(documentType: string) {
  return ['admin', 'approval-line-config', documentType] as const
}

export function optimisticallyUpdateApprovalLineRoles(
  current: ApprovalLineRole[] | undefined,
  value: ApprovalRoleUpdateValue,
) {
  return current?.map((role) => role.id === value.id
    ? {
        ...role,
        required: value.required,
      }
    : role)
}

export function optimisticallyAddApprovalLineApprover(
  current: ApprovalLineRole[] | undefined,
  roleId: string,
  option: ApprovalLineApproverOption,
) {
  return current?.map((role) => {
    if (role.id !== roleId) return role
    if (role.stepType === 'CREATOR') return role
    if (role.approvers.some((approver) => approver.type === option.type && approver.refId === option.refId)) {
      return role
    }
    const optimisticApprover: ApprovalLineApprover = {
      id: `pending-${option.type}-${option.refId}`,
      type: option.type,
      refId: option.refId,
      displayName: option.displayName,
    }
    return { ...role, approvers: [...role.approvers, optimisticApprover] }
  })
}

export function optimisticallyRemoveApprovalLineApprover(
  current: ApprovalLineRole[] | undefined,
  roleId: string,
  approverId: string,
) {
  return current?.map((role) => role.id === roleId
    ? { ...role, approvers: role.approvers.filter((approver) => approver.id !== approverId) }
    : role)
}

/**
 * 결재자 칩 제거 가능 여부.
 *
 * <p>낙관적 add 로 붙인 임시 결재자는 서버가 아직 실 id 를 발급하지 않아 `pending-*` id 를
 * 갖는다. 이 상태에서 제거하면 비-UUID 를 DELETE 로 보내 400 이 발생하므로, 서버 응답으로
 * 실 id 가 치환된 뒤에만(= pending-* 가 아닐 때만) 삭제를 허용한다.
 *
 * @param approverId 결재자 칩 id
 * @returns pending-* 이면 false, 그 외 true
 */
export function canDeleteApprover(approverId: string): boolean {
  return !approverId.startsWith('pending-')
}

export function optimisticallyAddApprovalLineStep(
  current: ApprovalLineRole[] | undefined,
  value: ApprovalLineAddStepValue,
) {
  const roles = current ?? []
  const nextSequence = roles.reduce((max, role) => Math.max(max, role.sequence), -1) + 1
  const trimmedLabel = value.label.trim()
  if (!trimmedLabel) return current
  const optimisticRole: ApprovalLineRole = {
    id: `pending-step-${value.documentType}-${Date.now()}`,
    sequence: nextSequence,
    label: trimmedLabel,
    stepType: 'GROUP',
    approvers: [],
    required: true,
    enforced: false,
    seedManaged: false,
  }
  return [...roles, optimisticRole]
}

export function optimisticallyDeleteApprovalLineStep(
  current: ApprovalLineRole[] | undefined,
  id: string,
) {
  return current?.filter((role) => role.id !== id)
}

export function getApprovalLineDeleteConfirmation(role: ApprovalLineRole) {
  if (role.enforced || role.seedManaged) {
    return {
      title: '강제 결재 단계 삭제',
      message: `이 단계는 ${role.label} 결재 강제와 연결됩니다. 삭제하면 해당 동작이 더 이상 결재 강제되지 않습니다. 계속할까요?`,
    }
  }
  return {
    title: '단계 삭제',
    message: '이 단계를 삭제할까요?',
  }
}

export function restoreApprovalLineRolesSnapshot(
  queryClient: QueryClient,
  queryKey: QueryKey,
  prev: ApprovalLineRole[] | undefined,
) {
  if (prev) {
    queryClient.setQueryData(queryKey, prev)
  }
}

/** 결재자 검색 선택 계약. CREATOR 는 호출하지 않는다. */
export function notifyApprovalRoleApproverSelected(
  role: ApprovalLineRole,
  option: ApprovalLineApproverOption | null,
  onAddApprover: (option: ApprovalLineApproverOption) => void,
) {
  if (!option) return
  if (role.stepType === 'CREATOR') return
  if (role.approvers.some((approver) => approver.type === option.type && approver.refId === option.refId)) return
  onAddApprover(option)
}

/** 필수 여부 checkbox 자동저장 계약. */
export function notifyApprovalRoleRequiredChange(
  onSave: ApprovalRoleRequiredHandler,
  nextRequired: boolean,
) {
  onSave(nextRequired)
}

/**
 * 라벨 인라인 편집 계약 (Task 3).
 * - blank 입력 무시
 * - 동일 값 무시
 * - CREATOR 는 호출 안 함 (호출자가 보장하지만 방어적 체크)
 */
export function notifyApprovalRoleLabelChange(
  label: string,
  role: ApprovalLineRole,
  onRename: (label: string) => void,
) {
  if (role.stepType === 'CREATOR') return
  const trimmed = label.trim()
  if (!trimmed) return
  if (trimmed === role.label) return
  onRename(trimmed)
}

/**
 * 드래그 순서 변경 계약 (Task 4).
 * 작성자(CREATOR) 는 항상 index 0 고정. 비-CREATOR 만 재배치.
 * 작성자 행이 active/over 인 경우 현재 순서 그대로 반환.
 *
 * @param roles 현재 sequence 순으로 정렬된 역할 목록
 * @param activeId 드래그된 행 id
 * @param overId 드롭 대상 행 id
 * @returns orderedIds (id 배열, index 0 = CREATOR 강제)
 */
export function computeApprovalRoleReorder(
  roles: ApprovalLineRole[],
  activeId: string,
  overId: string,
): string[] {
  const sorted = [...roles].sort((a, b) => a.sequence - b.sequence)

  const activeRole = sorted.find((r) => r.id === activeId)
  const overRole = sorted.find((r) => r.id === overId)

  // 작성자가 active/over 인 경우 → 현재 순서 그대로
  if (!activeRole || !overRole) return sorted.map((r) => r.id)
  if (activeRole.stepType === 'CREATOR' || overRole.stepType === 'CREATOR') {
    return sorted.map((r) => r.id)
  }

  // 비-CREATOR 만 arrayMove
  const creator = sorted.find((r) => r.stepType === 'CREATOR')
  const nonCreators = sorted.filter((r) => r.stepType !== 'CREATOR')

  const activeIndex = nonCreators.findIndex((r) => r.id === activeId)
  const overIndex = nonCreators.findIndex((r) => r.id === overId)

  if (activeIndex < 0 || overIndex < 0) return sorted.map((r) => r.id)

  // arrayMove: 같은 배열 내 이동
  const reordered = [...nonCreators]
  reordered.splice(activeIndex, 1)
  reordered.splice(overIndex, 0, nonCreators[activeIndex]!)

  const result = creator ? [creator, ...reordered] : reordered
  return result.map((r) => r.id)
}

export function getOrderedApprovalRoleIds(roles: ApprovalLineRole[]): string[] {
  return [...roles].sort((a, b) => a.sequence - b.sequence).map((role) => role.id)
}

export function areApprovalRoleOrdersEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 760,
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
}

const dragColumnStyle: React.CSSProperties = { width: 48 }
const sequenceColumnStyle: React.CSSProperties = { width: 72 }
const roleColumnStyle: React.CSSProperties = { width: '24%' }
const groupColumnStyle: React.CSSProperties = { width: '42%' }
const requiredColumnStyle: React.CSSProperties = { width: 88 }

const headCellStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-neutral-200)',
  background: 'var(--color-neutral-50)',
  color: 'var(--color-neutral-600)',
  fontSize: 12,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const dragHeadCellStyle: React.CSSProperties = { ...headCellStyle, ...dragColumnStyle }
const sequenceHeadCellStyle: React.CSSProperties = { ...headCellStyle, ...sequenceColumnStyle }
const roleHeadCellStyle: React.CSSProperties = { ...headCellStyle, ...roleColumnStyle }
const groupHeadCellStyle: React.CSSProperties = { ...headCellStyle, ...groupColumnStyle }
const requiredHeadCellStyle: React.CSSProperties = { ...headCellStyle, ...requiredColumnStyle }

const bodyCellStyle: React.CSSProperties = {
  padding: '11px 12px',
  borderBottom: '1px solid var(--color-neutral-200)',
  fontSize: 13,
  verticalAlign: 'middle',
}

const dragBodyCellStyle: React.CSSProperties = { ...bodyCellStyle, ...dragColumnStyle }
const sequenceBodyCellStyle: React.CSSProperties = { ...bodyCellStyle, ...sequenceColumnStyle }
const roleBodyCellStyle: React.CSSProperties = { ...bodyCellStyle, ...roleColumnStyle }
const groupBodyCellStyle: React.CSSProperties = { ...bodyCellStyle, ...groupColumnStyle }
const requiredBodyCellStyle: React.CSSProperties = { ...bodyCellStyle, ...requiredColumnStyle }

const approverTypeBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minWidth: 34,
  justifyContent: 'center',
  padding: '1px 5px',
  borderRadius: 4,
  background: 'var(--color-neutral-100)',
  color: 'var(--color-neutral-600)',
  fontSize: 11,
  fontWeight: 700,
}

const stepTypeTextStyle: React.CSSProperties = {
  color: 'var(--color-neutral-500)',
  fontSize: 11,
  fontWeight: 700,
}

const deleteStepButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: '1px solid var(--color-danger-200)',
  borderRadius: 4,
  background: 'var(--color-neutral-0)',
  color: 'var(--color-danger-600)',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
}
