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
  type DispatchTaskStatus,
  type DispatchVehicleGroupResponse,
  type DispatchVehicleGroupSlipResponse,
  type MatchedDriverResponse,
} from '../../../api/dispatchTask'
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

const DELETED_ROW_TEXT_STYLE: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--color-neutral-500)',
}

function deletedBadgeLabel(deletedByName: string | null | undefined): string {
  const trimmed = deletedByName?.trim()
  return trimmed ? `삭제: ${trimmed}` : '삭제됨'
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

  const groupDeleted = group.isDeleted === true
  const slipIdsSorted = group.slips.map((s) => s.slipId)
  const vehicleLabel = formatDispatchVehicleGroupLabel(group)
  const duplicateSlipIdSet = useMemo(() => new Set(duplicateSlipIds), [duplicateSlipIds])
  const statusTone = DISPATCH_TASK_STATUS_TONE[taskStatus]
  const groupDispatchStatus = group.dispatchStatus ?? 'PENDING'
  const groupStatusTone = DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_TONE[groupDispatchStatus]
  const groupDispatched = groupDispatchStatus === 'DISPATCHED'
  const canMutateGroup = canEdit && !groupDispatched && !groupDeleted
  const canRestoreGroup = groupDeleted && !!taskId && canAccess('dispatch.board', 'restore')
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
        opacity: groupDeleted ? 0.64 : 1,
        transition: 'border-color 120ms, background-color 120ms',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
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
          disabled={!canMutateGroup || group.slips.length === 0}
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
            color: groupDeleted ? 'var(--color-neutral-500)' : statusTone.color,
            textDecoration: groupDeleted ? 'line-through' : undefined,
          }}
        >
          {vehicleLabel} #{group.sequence}
        </span>
        <span
          style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}
          data-testid={`dispatch-board-vehicle-group-${group.sequence}-count`}
        >
          ({group.slips.length}건)
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
          <Badge variant="danger" data-testid={`dispatch-board-vehicle-group-${group.sequence}-deleted-badge`}>
            {deletedBadgeLabel(group.deletedByName)}
          </Badge>
        ) : null}
        {matchedDriver ? (
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
        ) : (
          <button
            type="button"
            disabled={!canMutateGroup || group.slips.length > 0 || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(group.id)}
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-delete`}
            aria-label={`${vehicleLabel} #${group.sequence} 그룹 삭제`}
            title={
              group.slips.length > 0
                ? '전표가 남아있으면 삭제할 수 없습니다'
                : '빈 그룹 삭제'
            }
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              cursor:
                canMutateGroup && group.slips.length === 0 ? 'pointer' : 'not-allowed',
              color:
                canMutateGroup && group.slips.length === 0
                  ? 'var(--color-danger-500)'
                  : 'var(--color-neutral-300)',
              fontSize: 16,
              padding: 4,
            }}
          >
            ×
          </button>
        )}
        {canRestoreGroup ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={restoreGroupMutation.isPending}
            onClick={() => restoreGroupMutation.mutate(group.id)}
            data-testid={`dispatch-board-vehicle-group-${group.sequence}-restore`}
            aria-label={`${vehicleLabel} #${group.sequence} 그룹 복원`}
          >
            복원
          </Button>
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
          <SortableContext items={slipIdsSorted} strategy={verticalListSortingStrategy}>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {group.slips.map((row) => (
                <SortableSlipRow
                  key={row.id}
                  groupId={group.id}
                  row={row}
                  canEdit={canMutateGroup}
                  canRestore={!!taskId && !groupDeleted && canAccess('dispatch.board', 'restore')}
                  restorePending={restoreSlipMutation.isPending}
                  isDuplicate={duplicateSlipIdSet.has(row.slipId)}
                  onOpenDetail={() => onOpenSlipDetail(row.slipId)}
                  onRemove={() =>
                    removeSlipMutation.mutate({
                      groupId: group.id,
                      slipId: row.slipId,
                    })
                  }
                  onRestore={() =>
                    restoreSlipMutation.mutate({
                      groupId: group.id,
                      slipId: row.slipId,
                    })
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
  } = useSortable({ id: row.slipId, data: dragData, disabled: !canMutateRow })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : rowDeleted ? 0.62 : 1,
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
        <span style={rowDeleted ? DELETED_ROW_TEXT_STYLE : undefined}>{row.slip.partnerName}</span>
      </button>
      {rowDeleted ? (
        <Badge variant="danger" data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-deleted-badge`}>
          {deletedBadgeLabel(row.deletedByName)}
        </Badge>
      ) : null}
      {rowDeleted && canRestore ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={restorePending}
          onClick={onRestore}
          data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-restore`}
          aria-label={`정차 ${row.sequence} ${row.slip.slipNo} 복원`}
        >
          복원
        </Button>
      ) : null}
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
    </li>
  )
}
