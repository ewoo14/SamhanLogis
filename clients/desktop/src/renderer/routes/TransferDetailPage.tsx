/**
 * 이동전표 상세 + 라이프사이클 transition — `/transfers/:id`.
 *
 * BE `StockTransfer` 라이프사이클 (Q8=A 결정):
 *   REQUESTED/PENDING_APPROVAL → APPROVED → SHIPPED → IN_TRANSIT → RECEIVED → CONFIRMED
 *   (분기: REJECTED, CANCELED)
 *
 * 6 transition button:
 * - REQUESTED/PENDING_APPROVAL → approve / reject / cancel
 * - APPROVED → ship / cancel
 * - SHIPPED → receive
 * - IN_TRANSIT → receive
 * - RECEIVED → confirm
 *
 * UUID 비공개: id 는 path param 으로만 사용. 화면 표시 영역에는 노출 X.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import axios from 'axios'
import {
  getTransfer,
  transitionTransfer,
  TRANSFER_REASON_LABEL,
  TRANSFER_STATUS_LABEL,
  type TransferDetail,
  type TransferLineDetail,
  type TransferStatus,
  type TransferTransitionAction,
} from '../api/inventory'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

function actionsForStatus(status: TransferStatus): TransferTransitionAction[] {
  switch (status) {
    case 'REQUESTED':
    case 'PENDING_APPROVAL':
      return ['approve', 'reject', 'cancel']
    case 'APPROVED':
      return ['ship', 'cancel']
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return ['receive']
    case 'RECEIVED':
      return ['confirm']
    default:
      return []
  }
}

const ACTION_LABEL: Record<TransferTransitionAction, string> = {
  approve: '승인',
  reject: '반려',
  ship: '출고',
  receive: '입고',
  confirm: '확정',
  cancel: '취소',
}

const STATUS_VARIANT: Record<
  TransferStatus,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  REQUESTED: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'brand',
  SHIPPED: 'brand',
  IN_TRANSIT: 'brand',
  RECEIVED: 'success',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  CANCELED: 'neutral',
}

/**
 * 이동전표 transition action → BE @RequirePermission page-code 매핑.
 *
 * C5-2c: canTransitionTransfer() 헬퍼를 canAccess() 로 이관.
 * 근거: services/inventory-service/.../StockTransferController.java @RequirePermission + V35 seed.
 *
 *   approve / reject / confirm / cancel → inventory.adjust   / update (MASTER/MANAGER/INVENTORY)
 *   ship    / receive                   → inventory.transfer / update (MASTER/MANAGER/WAREHOUSE/INVENTORY)
 */
function transferActionPageCode(
  action: TransferTransitionAction,
): 'inventory.adjust' | 'inventory.transfer' {
  switch (action) {
    case 'approve':
    case 'reject':
    case 'confirm':
    case 'cancel':
      return 'inventory.adjust'
    case 'ship':
    case 'receive':
      return 'inventory.transfer'
  }
}

export function TransferDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const queryClient = useQueryClient()

  const [rejectReason, setRejectReason] = useState('')

  const detailQuery = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => getTransfer(id),
    enabled: !!id,
  })

  // Slice A: AppHeader 동적 화면명 — transferNo bracket meta
  usePageTitle('재고이동 상세', detailQuery.data?.transferNo)

  const transitionMutation = useMutation({
    mutationFn: (vars: { action: TransferTransitionAction; reason?: string }) =>
      transitionTransfer(
        id,
        vars.action,
        vars.reason ? { reason: vars.reason } : undefined,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transfer', id] })
      void queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setRejectReason('')
    },
  })

  if (!id) return null

  if (detailQuery.isLoading) return <p>불러오는 중...</p>

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        이동전표를 불러오지 못했습니다.
      </div>
    )
  }

  const transfer: TransferDetail = detailQuery.data
  const possibleActions = actionsForStatus(transfer.status)

  const lineColumns: DataTableColumn<TransferLineDetail>[] = [
    {
      key: 'requestedQuantity',
      header: '요청 수량',
      width: '100px',
      align: 'right',
      render: (l) => l.requestedQuantity.toLocaleString(),
    },
    {
      key: 'shippedQuantity',
      header: '출고 수량',
      width: '100px',
      align: 'right',
      render: (l) => l.shippedQuantity.toLocaleString(),
    },
    {
      key: 'receivedQuantity',
      header: '입고 수량',
      width: '100px',
      align: 'right',
      render: (l) => l.receivedQuantity.toLocaleString(),
    },
  ]

  const errorMessage = (() => {
    if (!transitionMutation.isError) return null
    const err = transitionMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '전이에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const handleTransition = (action: TransferTransitionAction) => {
    if (action === 'reject') {
      const reason = rejectReason.trim()
      if (!reason) {
        alert('반려 사유를 입력하세요.')
        return
      }
      transitionMutation.mutate({ action, reason })
    } else {
      transitionMutation.mutate({ action })
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>이동전표 상세</h3>
          <span style={{ fontFamily: 'var(--font-family-mono)' }}>{transfer.transferNo}</span>
          <Badge variant={STATUS_VARIANT[transfer.status]}>
            {TRANSFER_STATUS_LABEL[transfer.status]}
          </Badge>
        </div>
        <Button variant="ghost" onClick={() => navigate('/transfers')}>
          목록으로
        </Button>
      </div>

      <Card padding={4} shadow="sm">
        <div className="detail-grid">
          <div>
            <span className="detail-label">출발 창고</span>
            <span className="detail-value">{transfer.sourceWarehouseCode}</span>
          </div>
          <div>
            <span className="detail-label">도착 창고</span>
            <span className="detail-value">{transfer.destinationWarehouseCode}</span>
          </div>
          <div>
            <span className="detail-label">사유</span>
            <span className="detail-value">{TRANSFER_REASON_LABEL[transfer.reason]}</span>
          </div>
          <div>
            <span className="detail-label">사유 상세</span>
            <span className="detail-value">{transfer.reasonDetail ?? '-'}</span>
          </div>
        </div>
      </Card>

      <h4 style={{ marginTop: 24 }}>이동 라인</h4>
      <DataTable
        columns={lineColumns}
        rows={transfer.lines}
        rowKey={(l) => l.id}
        emptyMessage="라인이 없습니다."
      />

      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <h4 style={{ marginTop: 0 }}>라이프사이클</h4>
        {possibleActions.length === 0 ? (
          <p style={{ color: 'var(--color-neutral-500)', margin: 0 }}>
            현재 상태에서 가능한 전이가 없습니다.
          </p>
        ) : (
          <>
            {possibleActions.includes('reject') ? (
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="반려 사유 (반려 시 필수)"
                  maxLength={500}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-neutral-300)',
                    fontSize: 14,
                    width: '100%',
                  }}
                />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {possibleActions.map((action) => {
                const allowed = canAccess(transferActionPageCode(action), 'update')
                const variant
                  = action === 'reject' || action === 'cancel'
                    ? 'ghost'
                    : action === 'confirm'
                      ? 'primary'
                      : 'secondary'
                return (
                  <Button
                    key={action}
                    variant={variant}
                    size="sm"
                    disabled={!allowed || transitionMutation.isPending}
                    onClick={() => handleTransition(action)}
                  >
                    {ACTION_LABEL[action]}
                    {!allowed ? ' (권한 부족)' : ''}
                  </Button>
                )
              })}
            </div>
          </>
        )}
        {errorMessage ? (
          <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
            {errorMessage}
          </div>
        ) : null}
      </Card>
    </>
  )
}
