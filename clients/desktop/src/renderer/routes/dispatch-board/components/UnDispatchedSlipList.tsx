/**
 * UnDispatchedSlipList — 배차 보드 좌측 미배차 출고전표 list (드래그 source).
 *
 * <p>Phase A FE-3.
 *
 * 기능:
 * - 일자 from/to date picker (default Asia/Seoul today ±1일).
 * - dispatchStatus multi-select (default `['UNDISPATCHED']`).
 * - 50/page 페이지네이션 (Spring Page 응답).
 * - 각 슬립 row 가 `useDraggable({ id: slip.id, data: { slipId, slipNumber: slipNo, partnerName } })`.
 *   → DndContext 가 VehicleGroupColumn 에 위치 (Phase A 의 dispatch board page level 통합).
 *
 * accessibility:
 * - row `aria-label="출고전표 {slipNo} {partnerName} 드래그 가능"` (한국어).
 * - `tabIndex={0}` 키보드 포커스 + 스페이스 grab (PointerSensor + KeyboardSensor 기본 동작).
 *
 * UUID 비공개:
 * - row 노출 = `slipNo` + `partnerCode` + `partnerName` 만.
 * - slip UUID 는 `useDraggable` id 로만 사용 (DOM data-* 속성은 testid 외 X).
 */
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { safeActorName } from '@samhan/design-system'
import {
  SLIP_DISPATCH_STATUS_LABEL,
  SLIP_DISPATCH_STATUS_OPTIONS,
  offsetIsoSeoul,
  todayIsoSeoul,
  type SlipBoardResponse,
  type SlipDispatchStatus,
} from '../../../api/dispatchBoard'
import { usePermissions } from '../../../hooks/usePermissions'
import { useUnDispatchedSlipsQuery } from '../hooks/useUnDispatchedSlipsQuery'
import {
  ExternalCarrierDispatchModal,
  canCreateExternalDispatch,
} from './ExternalCarrierDispatchModal'

/**
 * draggable slip row 가 DndContext.onDragEnd 에 전달하는 payload type.
 *
 * <p>VehicleGroupColumn 의 onDragEnd handler 에서 `active.data.current` 로 접근하여
 * assignSlip mutation 의 slipId 인자로 활용.
 */
export interface DispatchSlipDragData {
  /** 드래그 source 종류 — 미배차 list 만 'slip' 사용. */
  type: 'slip'
  /** 슬립 UUID — API payload 에만 사용 (사용자 미노출). */
  slipId: string
  /** 사용자 노출 식별자 — DragOverlay / accessibility 라벨 노출. */
  slipNumber: string
  partnerName: string
}

interface UnDispatchedSlipListProps {
  /** 슬립 row click 시 상세 modal 진입 callback (slipId 전달). */
  onOpenSlipDetail: (slipId: string) => void
}

/**
 * 50/page default 페이지 크기. 사용자 명세 (2026-05-14).
 */
const PAGE_SIZE = 50
const DASH = '-'

/**
 * 검수 완료 시각을 운영자 화면에 분 단위로 표시한다.
 *
 * BE inspectorSignedAt = LocalDateTime(KST 벽시계, 타임존 없음)이므로,
 * Date 파싱 시 런타임 로컬 존으로 재해석되는 더블 변환을 피하고 ISO 구성요소를 그대로 포맷한다.
 */
export function formatInspectorSignedAtKst(value: string | null | undefined): string {
  if (!value) return DASH
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value)
  if (!m) return DASH
  const [, year, month, day, hour, minute] = m
  return `${year}. ${month}. ${day}. ${hour}:${minute}`
}

function nullableText(value: string | null | undefined): string {
  return value && value.trim() ? value : DASH
}

function nullableInspectorName(value: string | null | undefined): string {
  return safeActorName(value) ?? DASH
}

/**
 * 미배차 row 의 보조 정보 셀. 검수 완료 게이트 이후 운영자가 확인해야 하는 필드를 한 곳에 모은다.
 */
export function DispatchSlipSummaryCells({ slip }: { slip: SlipBoardResponse }) {
  const cells = [
    ['검수자', nullableInspectorName(slip.inspectorName)],
    ['검수일시', formatInspectorSignedAtKst(slip.inspectorSignedAt)],
    ['배송지', nullableText(slip.deliveryAddress)],
    ['수령자', nullableText(slip.recipientPhone)],
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '4px 10px',
        marginTop: 'var(--space-1)',
        color: 'var(--color-neutral-600)',
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {cells.map(([label, value]) => (
        <span key={label} style={{ minWidth: 0 }}>
          <span style={{ color: 'var(--color-neutral-500)' }}>{label}</span>
          <span style={{ marginLeft: 4, overflowWrap: 'anywhere' }}>{value}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * 좌측 미배차 출고전표 list.
 */
export function UnDispatchedSlipList({ onOpenSlipDetail }: UnDispatchedSlipListProps) {
  const today = todayIsoSeoul()
  const [from, setFrom] = useState<string>(offsetIsoSeoul(today, -1))
  const [to, setTo] = useState<string>(offsetIsoSeoul(today, 1))
  const [statuses, setStatuses] = useState<SlipDispatchStatus[]>(['UNDISPATCHED'])
  const [page, setPage] = useState(0)
  const [selectedSlipIds, setSelectedSlipIds] = useState<Set<string>>(() => new Set())
  const [externalDispatchOpen, setExternalDispatchOpen] = useState(false)
  const { canAccess } = usePermissions()
  const canCreateExternal = canCreateExternalDispatch(canAccess)

  const query = useUnDispatchedSlipsQuery({ from, to, statuses, page, size: PAGE_SIZE })
  const data = query.data
  const slips = data?.content ?? []
  const selectedSlips = useMemo(
    () => slips.filter((slip) => selectedSlipIds.has(slip.id)),
    [selectedSlipIds, slips],
  )
  const totalPages = data?.totalPages ?? 0
  const totalElements = data?.totalElements ?? 0

  const handleStatusToggle = (s: SlipDispatchStatus, checked: boolean) => {
    setPage(0)
    setStatuses((prev) => {
      if (checked) return Array.from(new Set([...prev, s]))
      return prev.filter((v) => v !== s)
    })
  }

  const handleSlipSelection = (slipId: string, checked: boolean) => {
    setSelectedSlipIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(slipId)
      } else {
        next.delete(slipId)
      }
      return next
    })
  }

  const handleCloseExternalDispatch = () => {
    setExternalDispatchOpen(false)
    setSelectedSlipIds(new Set())
  }

  return (
    <section
      data-testid="dispatch-board-undispatched-list"
      aria-label="미배차 출고전표 목록"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--color-neutral-0)',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: 12,
          borderBottom: '1px solid var(--color-neutral-200)',
          background: 'var(--color-neutral-50)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          미배차 출고전표
          <span
            style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            ({totalElements} 건)
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span>날짜</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPage(0)
                setFrom(e.target.value)
              }}
              data-testid="dispatch-board-filter-from"
              style={{ fontSize: 12 }}
            />
            <span>~</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPage(0)
                setTo(e.target.value)
              }}
              data-testid="dispatch-board-filter-to"
              style={{ fontSize: 12 }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ color: 'var(--color-neutral-500)' }}>상태</span>
          {SLIP_DISPATCH_STATUS_OPTIONS.map((s) => (
            <label
              key={s}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <input
                type="checkbox"
                checked={statuses.includes(s)}
                onChange={(e) => handleStatusToggle(s, e.target.checked)}
                data-testid={`dispatch-board-filter-status-${s}`}
              />
              {SLIP_DISPATCH_STATUS_LABEL[s]}
            </label>
          ))}
        </div>
        {canCreateExternal ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              선택 {selectedSlipIds.size}건
            </span>
            <button
              type="button"
              onClick={() => setExternalDispatchOpen(true)}
              disabled={selectedSlipIds.size === 0}
              data-testid="dispatch-board-external-dispatch-open"
              style={{
                padding: '6px 10px',
                border: '1px solid var(--color-primary-300, #93C5FD)',
                borderRadius: 4,
                background: selectedSlipIds.size === 0
                  ? 'var(--color-neutral-100)'
                  : 'var(--color-primary-600, #2563EB)',
                color: selectedSlipIds.size === 0
                  ? 'var(--color-neutral-500)'
                  : 'var(--color-neutral-0)',
                fontSize: 12,
                fontWeight: 600,
                cursor: selectedSlipIds.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              타배송사 발송
            </button>
          </div>
        ) : null}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'var(--color-neutral-0)',
        }}
      >
        {query.isLoading ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            불러오는 중…
          </div>
        ) : query.isError ? (
          <div
            style={{ padding: 16, fontSize: 13, color: 'var(--color-danger-500)' }}
            role="alert"
          >
            미배차 출고전표 조회 실패. 잠시 후 다시 시도해주세요.
          </div>
        ) : slips.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            조건에 해당하는 미배차 출고전표가 없습니다.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {slips.map((slip) => (
              <DraggableSlipRow
                key={slip.id}
                slip={slip}
                canSelect={canCreateExternal}
                selected={selectedSlipIds.has(slip.id)}
                onSelect={(checked) => handleSlipSelection(slip.id, checked)}
                onClick={() => onOpenSlipDetail(slip.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer
        style={{
          padding: 8,
          borderTop: '1px solid var(--color-neutral-200)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-neutral-50)',
          fontSize: 12,
        }}
      >
        <button
          type="button"
          disabled={page <= 0 || query.isFetching}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          data-testid="dispatch-board-prev-page"
          style={{
            padding: '4px 10px',
            background: 'var(--color-neutral-0)',
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 4,
            cursor: page <= 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ◀ 이전
        </button>
        <span>
          {totalPages === 0 ? 0 : page + 1} / {totalPages} (50/회)
        </span>
        <button
          type="button"
          disabled={page + 1 >= totalPages || query.isFetching}
          onClick={() => setPage((p) => p + 1)}
          data-testid="dispatch-board-next-page"
          style={{
            padding: '4px 10px',
            background: 'var(--color-neutral-0)',
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 4,
            cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          다음 ▶
        </button>
      </footer>
      {externalDispatchOpen ? (
        <ExternalCarrierDispatchModal
          selectedSlips={selectedSlips}
          onClose={handleCloseExternalDispatch}
        />
      ) : null}
    </section>
  )
}

/**
 * 단일 슬립 row — `useDraggable` source.
 *
 * <p>row 클릭 = 슬립 상세 modal. 드래그는 별도 grab handle (`☰`) 통해 시작 — `listeners` 적용 영역을
 * handle 만으로 한정하여 row click 과 drag 를 분리한다 (사용자 실수 방지).
 */
function DraggableSlipRow({
  slip,
  canSelect,
  selected,
  onSelect,
  onClick,
}: {
  slip: SlipBoardResponse
  canSelect: boolean
  selected: boolean
  onSelect: (checked: boolean) => void
  onClick: () => void
}) {
  const dragData: DispatchSlipDragData = {
    type: 'slip',
    slipId: slip.id,
    slipNumber: slip.slipNo,
    partnerName: slip.partnerName,
  }
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `slip:${slip.id}`,
    data: dragData,
  })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }
  const ariaLabel = `출고전표 ${slip.slipNo} ${slip.partnerName} 드래그 가능`

  return (
    <li
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-neutral-100)',
        fontSize: 13,
        background: 'var(--color-neutral-0)',
      }}
      data-testid={`dispatch-board-slip-row-${slip.slipNo}`}
    >
      {canSelect ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`전표 ${slip.slipNo} 선택`}
          data-testid={`dispatch-board-slip-select-${slip.slipNo}`}
          style={{ width: 16, height: 16, flex: '0 0 auto' }}
        />
      ) : null}
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={ariaLabel}
        title="드래그하여 차량 그룹에 추가"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'grab',
          padding: 0,
          color: 'var(--color-neutral-500)',
          fontSize: 16,
          lineHeight: 1,
        }}
        data-testid={`dispatch-board-slip-drag-${slip.slipNo}`}
      >
        ☰
      </button>
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--color-neutral-800)',
          minWidth: 0,
        }}
        data-testid={`dispatch-board-slip-open-${slip.slipNo}`}
      >
        <span style={{ display: 'block', minWidth: 0 }}>
          <span style={{ fontWeight: 600, marginRight: 8 }}>{slip.slipNo}</span>
          <span>{slip.partnerName}</span>
          <span
            style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-neutral-500)' }}
          >
            ({slip.partnerCode})
          </span>
        </span>
        <DispatchSlipSummaryCells slip={slip} />
      </button>
    </li>
  )
}
