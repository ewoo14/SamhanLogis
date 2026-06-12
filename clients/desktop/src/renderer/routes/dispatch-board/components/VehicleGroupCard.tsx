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
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  formatDispatchVehicleGroupLabel,
  type DispatchVehicleGroupResponse,
  type DispatchVehicleGroupSlipResponse,
  type MatchedDriverResponse,
} from '../../../api/dispatchTask'
import {
  useDeleteVehicleGroupMutation,
  useRemoveSlipFromGroupMutation,
} from '../hooks/useDispatchTask'
import type { DispatchGroupSlipDragData } from '../DispatchBoardPage'

interface VehicleGroupCardProps {
  taskId: string | null
  group: DispatchVehicleGroupResponse
  matchedDriver: MatchedDriverResponse | null
  canEdit: boolean
  onOpenSlipDetail: (slipId: string) => void
}

export function VehicleGroupCard({
  taskId,
  group,
  matchedDriver,
  canEdit,
  onOpenSlipDetail,
}: VehicleGroupCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group:${group.id}`,
    data: { type: 'group', groupId: group.id },
  })

  const deleteMutation = useDeleteVehicleGroupMutation(taskId)
  const removeSlipMutation = useRemoveSlipFromGroupMutation(taskId)

  const slipIdsSorted = group.slips.map((s) => s.slipId)
  const vehicleLabel = formatDispatchVehicleGroupLabel(group)

  return (
    <article
      ref={setNodeRef}
      data-testid={`dispatch-board-vehicle-group-${group.sequence}`}
      aria-label={`차량 그룹 ${vehicleLabel} #${group.sequence}`}
      style={{
        border: isOver
          ? '2px solid var(--color-action-brand, #1E40AF)'
          : '1px solid var(--color-neutral-200)',
        borderRadius: 8,
        background: isOver ? 'var(--color-action-brandSubtle, #DBEAFE)' : 'var(--color-neutral-0)',
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
          background: 'var(--color-neutral-50)',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {vehicleLabel} #{group.sequence}
        </span>
        <span
          style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}
          data-testid={`dispatch-board-vehicle-group-${group.sequence}-count`}
        >
          ({group.slips.length}건)
        </span>
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
            기사 {matchedDriver.driverName} ({matchedDriver.driverCode}){' '}
            {matchedDriver.driverPhoneNumber}
          </span>
        ) : (
          <button
            type="button"
            disabled={!canEdit || group.slips.length > 0 || deleteMutation.isPending}
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
                canEdit && group.slips.length === 0 ? 'pointer' : 'not-allowed',
              color:
                canEdit && group.slips.length === 0
                  ? 'var(--color-danger-500)'
                  : 'var(--color-neutral-300)',
              fontSize: 16,
              padding: 4,
            }}
          >
            ×
          </button>
        )}
      </header>

      <div style={{ padding: 8 }}>
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
                  canEdit={canEdit}
                  onOpenDetail={() => onOpenSlipDetail(row.slipId)}
                  onRemove={() =>
                    removeSlipMutation.mutate({
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
  onOpenDetail,
  onRemove,
}: {
  groupId: string
  row: DispatchVehicleGroupSlipResponse
  canEdit: boolean
  onOpenDetail: () => void
  onRemove: () => void
}) {
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
  } = useSortable({ id: row.slipId, data: dragData })

  const style: React.CSSProperties = {
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
        background: 'var(--color-neutral-0)',
      }}
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
        disabled={!canEdit}
        aria-label={`정차 ${row.sequence} ${row.slip.slipNo} ${row.slip.partnerName} 드래그`}
        title={canEdit ? '드래그로 순서 변경' : '편집 불가'}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: canEdit ? 'grab' : 'not-allowed',
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
        style={{
          flex: 1,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--color-neutral-800)',
        }}
      >
        <span style={{ fontWeight: 600, marginRight: 6 }}>{row.slip.slipNo}</span>
        <span>{row.slip.partnerName}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canEdit}
        aria-label={`정차 ${row.sequence} ${row.slip.slipNo} 그룹에서 제거`}
        data-testid={`dispatch-board-group-slip-${row.slip.slipNo}-remove`}
        style={{
          background: 'transparent',
          border: 'none',
          color: canEdit ? 'var(--color-danger-500)' : 'var(--color-neutral-300)',
          cursor: canEdit ? 'pointer' : 'not-allowed',
          fontSize: 14,
          padding: 4,
        }}
      >
        ×
      </button>
    </li>
  )
}
