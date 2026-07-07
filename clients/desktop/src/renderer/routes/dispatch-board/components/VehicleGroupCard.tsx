/**
 * VehicleGroupCard — 단일 차량 그룹 카드 (drop target + sortable slip rows).
 *
 * <p>Phase A FE-4.
 *
 * 구성:
 * - 헤더: 차량 종류 라벨 + sequence + slip 건수 + [×] 그룹 삭제 (비어 있을 때만 enabled).
 * - 본문: 그룹 안 slip rows (`SortableContext` + sortable item).
 * - 빈 그룹은 점선 placeholder 노출 → drop 시 highlight (ring) 표시.
 *
 * DnD:
 * - 본 카드 전체가 `useDroppable` drop target (slip 할당 시 사용).
 * - 그룹 안 row 는 `useSortable` (그룹 안 순서 변경).
 *
 * matchedDriver 표시:
 * - DISPATCHED 시점 부모 (VehicleGroupColumn) 이 matchedDriver dict 로부터 본 카드에 전달.
 * - 헤더 우측 inline 노출: `홍길동 (D-001) 010-1234-5678`.
 */
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Badge, Button } from '@samhan/design-system'
import {
  DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_LABEL,
  DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_TONE,
  DISPATCH_TASK_STATUS_TONE,
  MATCHED_DRIVER_SOURCE_LABEL,
  formatDispatchVehicleGroupLabel,
  isEditableStatus,
  type DispatchTaskStatus,
  type DispatchVehicleGroupResponse,
  type DispatchVehicleGroupSlipResponse,
  type MatchedDriverResponse,
} from '../../../api/dispatchTask'
import {
  DELETED_ROW_TEXT_STYLE,
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from '../../../realtime/deletedRowDisplay'
import { activeSlipRows } from '../dispatchDeletedRow'
import { serverErrorMessage } from '../dispatchErrorMessage'
import {
  type SlipBoardResponse,
} from '../../../api/dispatchBoard'
import {
  type PageResponse,
} from '../../../api/client'
import {
  useAssignSlipToGroupMutation,
  useDeleteVehicleGroupMutation,
  useRemoveSlipFromGroupMutation,
  useRestoreSlipFromGroupMutation,
  useRestoreVehicleGroupMutation,
} from '../hooks/useDispatchTask'
import { DISPATCH_BOARD_QUERY_KEY } from '../hooks/useUnDispatchedSlipsQuery'
import type { DispatchGroupSlipDragData } from '../DispatchBoardPage'
import { usePermissions } from '../../../hooks/usePermissions'

interface VehicleGroupCardProps {
  taskId: string | null
  group: DispatchVehicleGroupResponse
  matchedDriver: MatchedDriverResponse | null
  canEdit: boolean
  taskStatus: DispatchTaskStatus
  duplicateSlipIds: string[]
  assignedSlips: DispatchVehicleGroupSlipResponse[]
  selected: boolean
  onSelectedChange: (checked: boolean) => void
  onOpenSlipDetail: (slipId: string) => void
}

export function VehicleGroupCard({
  taskId,
  group,
  matchedDriver,
  canEdit,
  taskStatus,
  duplicateSlipIds,
  assignedSlips,
  selected,
  onSelectedChange,
  onOpenSlipDetail,
}: VehicleGroupCardProps) {
  const deleteMutation = useDeleteVehicleGroupMutation(taskId)
  const assignMutation = useAssignSlipToGroupMutation(taskId)
  const removeSlipMutation = useRemoveSlipFromGroupMutation(taskId)
  const restoreGroupMutation = useRestoreVehicleGroupMutation(taskId)
  const restoreSlipMutation = useRestoreSlipFromGroupMutation(taskId)
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const slipNoInputRef = useRef<HTMLInputElement | null>(null)
  const [slipNoError, setSlipNoError] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const groupDeleted = group.isDeleted === true
  // 게이팅/카운트/정렬은 활성 행 기준 — 삭제행(취소선)은 영구 잔존하므로 length 직접 사용 금지.
  const activeRows = activeSlipRows(group)
  const sortableRowIds = activeRows.map((row) => row.id)
  const vehicleLabel = formatDispatchVehicleGroupLabel(group)
  const duplicateSlipIdSet = useMemo(() => new Set(duplicateSlipIds), [duplicateSlipIds])
  const statusTone = DISPATCH_TASK_STATUS_TONE[taskStatus]
  const groupDispatchStatus = group.dispatchStatus ?? 'PENDING'
  const groupStatusTone = DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_TONE[groupDispatchStatus]
  const groupDispatched = groupDispatchStatus === 'DISPATCHED'
  const canMutateGroup = canEdit && !groupDispatched && !groupDeleted
  // 복원은 BE requireDraftTask 와 동일하게 DRAFT 한정 — 비-DRAFT 에서 노출하면 항상 409.
  const canRestore =
    !!taskId &&
    canEdit &&
    isEditableStatus(taskStatus) &&
    canAccess('dispatch.board', 'restore')
  // 결함계열 일관 — 발송(DISPATCHED) 그룹은 복원 불가(BE restoreVehicleGroup 409 동형).
  const canRestoreGroup = groupDeleted && !groupDispatched && canRestore
  const { setNodeRef, isOver } = useDroppable({
    id: `group:${group.id}`,
    data: { type: 'group', groupId: group.id },
    disabled: !canMutateGroup,
  })
  const canHighlightDrop = canMutateGroup && isOver
  const matchedDriverLabel = matchedDriver
    ? matchedDriver.driverCode === 'MANUAL'
      ? MATCHED_DRIVER_SOURCE_LABEL[matchedDriver.driverSource]
      : matchedDriver.driverCode
    : null

  const handleAssignBySlipNo = () => {
    if (!taskId || !canMutateGroup || assignMutation.isPending) return
    const normalized = (slipNoInputRef.current?.value ?? '').trim()
    if (!normalized) {
      setSlipNoError('전표번호를 입력하세요.')
      return
    }
    const cachedPages = queryClient.getQueriesData<PageResponse<SlipBoardResponse>>({
      queryKey: DISPATCH_BOARD_QUERY_KEY,
    })
    const cachedSlips = cachedPages.flatMap(([, page]) => page?.content ?? [])
    const fromPool = cachedSlips
      .find((slip) => slip.slipNo === normalized)
    const fromCurrentTask = assignedSlips.find((row) => row.slip.slipNo === normalized)
    const targetSlipId = fromPool?.id ?? fromCurrentTask?.slipId
    if (!targetSlipId) {
      setSlipNoError('미배차 전표 풀에서 찾을 수 없습니다.')
      return
    }
    assignMutation.mutate(
      { groupId: group.id, slipId: targetSlipId },
      {
        onSuccess: () => {
          if (slipNoInputRef.current) slipNoInputRef.current.value = ''
          setSlipNoError(null)
        },
        onError: () => setSlipNoError('전표 추가에 실패했습니다. 상태를 확인하세요.'),
      },
    )
  }

  return (
    <article
      ref={setNodeRef}
      data-testid={`dispatch-board-vehicle-group-${group.sequence}`}
      aria-label={`차량 그룹 ${vehicleLabel} #${group.sequence}`}
      style={{
        border: canHighlightDrop
          ? '2px solid var(--color-action-brand, #1E40AF)'
          : `1px solid ${statusTone.borderColor}`,
        borderRadius: 8,
        background: canHighlightDrop ? 'var(--color-action-brandSubtle, #DBEAFE)' : statusTone.background,
        transition: 'border-color 120ms, background-color 120ms',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-neutral-100)',
          background: statusTone.background,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={!canMutateGroup || activeRows.length === 0}
          onChange={(event) => onSelectedChange(event.currentTarget.checked)}
          data-testid={`dispatch-board-vehicle-group-${group.sequence}-select`}
          aria-label={`${vehicleLabel} #${group.sequence} 선택 전송 대상`}
          style={{ width: 16, height: 16 }}
        />
        <span aria-hidden="true" style={{ fontSize: 16 }}>🚚</span>
        <span
          data-testid={`dispatch-board-vehicle-group-${group.sequence}-deleted-label`}
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: statusTone.color,
            ...(groupDeleted ? DELETED_ROW_TEXT_STYLE : null),
          }}
        >
          {vehicleLabel} #{group.sequence}
        </span>
        <span
          style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}
          data-testid={`dispatch-board-vehicle-group-${group.sequence}-count`}
        >
          ({activeRows.length}건)
        </span>
        <span
          data-testid={`dispatch-board-vehicle-group-${group.sequence}-dispatch-status`}
          style={{
            padding: '2px 6px',
            borderRadius: 10,
            border: `1px solid ${groupStatusTone.borderColor}`,
            background: groupStatusTone.background,
            color: groupStatusTone.color,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_LABEL[groupDispatchStatus]}
        </span>
        {groupDeleted ? (
          <Badge
            variant="neutral"
            title={deletedBadgeAriaLabel(group.deletedByName, group.deletedAt)}
            aria-label={deletedBadgeAriaLabel(group.deletedByName, group.deletedAt)}
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-deleted-badge`}
            style={{
              maxWidth: 160,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {deletedBadgeLabel(group.deletedByName)}
          </Badge>
        ) : null}
        {matchedDriver && !groupDeleted ? (
          <span
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-driver`}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--color-success-700, #047857)',
              fontWeight: 500,
            }}
          >
            기사 {matchedDriver.driverName} ({matchedDriverLabel}){' '}
            {matchedDriver.driverPhoneNumber?.trim() || '-'} · {matchedDriver.vehiclePlateNumber?.trim() || '-'}
          </span>
        ) : null}
        {/* 삭제 그룹에서는 죽은 어포던스인 × 를 렌더하지 않는다 — 유일 액션은 [복원]. */}
        {!matchedDriver && !groupDeleted ? (
          <button
            type="button"
            disabled={!canMutateGroup || activeRows.length > 0 || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(group.id)}
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-delete`}
            aria-label={`${vehicleLabel} #${group.sequence} 그룹 삭제`}
            title={
              activeRows.length > 0
                ? '전표가 남아있으면 삭제할 수 없습니다'
                : '빈 그룹 삭제'
            }
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              cursor:
                canMutateGroup && activeRows.length === 0 ? 'pointer' : 'not-allowed',
              color:
                canMutateGroup && activeRows.length === 0
                  ? 'var(--color-danger-500)'
                  : 'var(--color-neutral-300)',
              fontSize: 16,
              padding: 4,
            }}
          >
            ×
          </button>
        ) : null}
        {canRestoreGroup ? (
          <span style={{ marginLeft: 'auto' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={restoreGroupMutation.isPending}
              loading={restoreGroupMutation.isPending}
              onClick={() =>
                restoreGroupMutation.mutate(group.id, {
                  onSuccess: () => setRestoreError(null),
                  onError: (error) =>
                    setRestoreError(
                      serverErrorMessage(error) ?? '복원에 실패했습니다. 배차 상태를 확인하세요.',
                    ),
                })
              }
              data-testid={`dispatch-board-vehicle-group-${group.sequence}-restore`}
              aria-label={`${vehicleLabel} #${group.sequence} 그룹 복원`}
            >
              복원
            </Button>
          </span>
        ) : null}
      </header>

      <div style={{ padding: 8, background: 'var(--color-neutral-0)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 6,
            marginBottom: 8,
          }}
        >
          <input
            ref={slipNoInputRef}
            onInput={() => {
              if (slipNoError) setSlipNoError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAssignBySlipNo()
            }}
            disabled={!canMutateGroup || assignMutation.isPending}
            placeholder="전표번호"
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-slip-input`}
            aria-label={`${vehicleLabel} #${group.sequence} 전표번호 입력`}
            style={{
              minWidth: 0,
              padding: '7px 8px',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={handleAssignBySlipNo}
            disabled={!canMutateGroup || assignMutation.isPending}
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-slip-add`}
            style={{
              padding: '7px 10px',
              border: 'none',
              borderRadius: 4,
              background: canMutateGroup ? 'var(--color-action-brand, #1E40AF)' : 'var(--color-neutral-200)',
              color: canMutateGroup ? 'var(--color-neutral-0)' : 'var(--color-neutral-500)',
              cursor: canMutateGroup ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            추가
          </button>
        </div>
        {slipNoError ? (
          <div
            role="alert"
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-slip-error`}
            style={{
              marginBottom: 8,
              padding: 6,
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
              fontSize: 12,
            }}
          >
            {slipNoError}
          </div>
        ) : null}
        {restoreError ? (
          <div
            role="alert"
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-restore-error`}
            style={{
              marginBottom: 8,
              padding: 6,
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
              fontSize: 12,
            }}
          >
            {restoreError}
          </div>
        ) : null}
        {group.slips.length === 0 ? (
          <div
            style={{
              padding: 16,
              border: '2px dashed var(--color-neutral-200)',
              borderRadius: 4,
              fontSize: 12,
              color: 'var(--color-neutral-500)',
              textAlign: 'center',
            }}
          >
            여기로 출고전표를 드래그하세요
          </div>
        ) : (
          <SortableContext items={sortableRowIds} strategy={verticalListSortingStrategy}>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {group.slips.map((row) => (
                <SortableSlipRow
                  key={row.id}
                  groupId={group.id}
                  row={row}
                  canEdit={canMutateGroup}
                  canRestore={!groupDeleted && !groupDispatched && canRestore}
                  restorePending={restoreSlipMutation.isPending}
                  isDuplicate={row.isDeleted !== true && duplicateSlipIdSet.has(row.slipId)}
                  onOpenDetail={() => onOpenSlipDetail(row.slipId)}
                  onRemove={() =>
                    removeSlipMutation.mutate({
                      groupId: group.id,
                      slipId: row.slipId,
                    })
                  }
                  onRestore={() =>
                    restoreSlipMutation.mutate(
                      { groupId: group.id, slipId: row.slipId, mappingId: row.id },
                      {
                        onSuccess: () => setRestoreError(null),
                        onError: (error) =>
                          setRestoreError(
                            serverErrorMessage(error) ??
                              '복원에 실패했습니다. 전표/그룹 상태를 확인하세요.',
                          ),
                      },
                    )
                  }
                />
              ))}
            </ol>
          </SortableContext>
        )}
      </div>
    </article>
  )
}

/**
 * 그룹 안 sortable slip row.
 *
 * <p>handle (`☰`) 만 drag listener 적용 — row 본문 클릭은 detail modal, [×] 는 제거.
 */
function SortableSlipRow({
  groupId,
  row,
  canEdit,
  canRestore,
  restorePending,
  isDuplicate,
  onOpenDetail,
  onRemove,
  onRestore,
}: {
  groupId: string
  row: DispatchVehicleGroupSlipResponse
  canEdit: boolean
  canRestore: boolean
  restorePending: boolean
  isDuplicate: boolean
  onOpenDetail: () => void
  onRemove: () => void
  onRestore: () => void
}) {
  const rowDeleted = row.isDeleted === true
  const canMutateRow = canEdit && !rowDeleted
  const dragData: DispatchGroupSlipDragData = {
    type: 'group-slip',
    groupId,
    slipId: row.slipId,
    slipNumber: row.slip.slipNo,
  }
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  // sortable id 는 매핑 UUID(row.id) — slipId 를 쓰면 "제거 후 같은 전표 재추가" 시 취소선
  // 행과 활성 행의 id 가 충돌해 dnd-kit 정렬이 오동작한다. reorder 계약은 dragData.slipId 사용.
  } = useSortable({ id: row.id, data: dragData, disabled: !canMutateRow })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderBottom: '1px solid var(--color-neutral-100)',
        fontSize: 12,
        background: isDuplicate ? 'var(--color-danger-50, #FEF2F2)' : 'var(--color-neutral-0)',
        border: isDuplicate ? '1px solid var(--color-danger-300, #FCA5A5)' : undefined,
        borderRadius: isDuplicate ? 4 : undefined,
      }}
      data-duplicate={isDuplicate ? 'true' : 'false'}
      data-testid={`dispatch-board-group-slip-${row.slip.slipNo}`}
    >
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-neutral-500)',
          minWidth: 18,
          textAlign: 'right',
        }}
      >
        {row.sequence}.
      </span>
      <button
        type="button"
        {...listeners}
        {...attributes}
        disabled={!canMutateRow}
        aria-label={`정차 ${row.sequence} ${row.slip.slipNo} ${row.slip.partnerName} 드래그`}
        title={canMutateRow ? '드래그로 순서 변경' : '편집 불가'}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: canMutateRow ? 'grab' : 'not-allowed',
          padding: 0,
          color: 'var(--color-neutral-500)',
        }}
        data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-handle`}
      >
        ☰
      </button>
      <button
        type="button"
        onClick={onOpenDetail}
        disabled={rowDeleted}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: rowDeleted ? 'default' : 'pointer',
          fontSize: 12,
          color: 'var(--color-neutral-800)',
        }}
      >
        {isDuplicate ? (
          <span
            role="img"
            aria-label="중복 전표"
            title="중복 전표"
            data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-duplicate-warning`}
            style={{ marginRight: 6, color: 'var(--color-danger-700, #B91C1C)' }}
          >
            ⚠
          </span>
        ) : null}
        <span
          data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-deleted-label`}
          style={{
            fontWeight: 600,
            marginRight: 6,
            ...(rowDeleted ? DELETED_ROW_TEXT_STYLE : null),
          }}
        >
          {row.slip.slipNo}
        </span>
        <span
          style={{
            minWidth: 0,
            overflowWrap: 'anywhere',
            ...(rowDeleted ? DELETED_ROW_TEXT_STYLE : null),
          }}
        >
          {row.slip.partnerName}
        </span>
      </button>
      {rowDeleted ? (
        <Badge
          variant="neutral"
          title={deletedBadgeAriaLabel(row.deletedByName, row.deletedAt)}
          aria-label={deletedBadgeAriaLabel(row.deletedByName, row.deletedAt)}
          data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-deleted-badge`}
          style={{
            maxWidth: 160,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {deletedBadgeLabel(row.deletedByName)}
        </Badge>
      ) : null}
      {rowDeleted && canRestore ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={restorePending}
          loading={restorePending}
          onClick={onRestore}
          data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-restore`}
          aria-label={`정차 ${row.sequence} ${row.slip.slipNo} 복원`}
        >
          복원
        </Button>
      ) : null}
      {/* 삭제행에서는 죽은 어포던스인 × 를 렌더하지 않는다 — 유일 액션은 [복원]. */}
      {!rowDeleted ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={!canMutateRow}
          aria-label={`정차 ${row.sequence} ${row.slip.slipNo} 그룹에서 제거`}
          data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-remove`}
          style={{
            background: 'transparent',
            border: 'none',
            color: canMutateRow ? 'var(--color-danger-500)' : 'var(--color-neutral-300)',
            cursor: canMutateRow ? 'pointer' : 'not-allowed',
            fontSize: 14,
            padding: 4,
          }}
        >
          ×
        </button>
      ) : null}
    </li>
  )
}
