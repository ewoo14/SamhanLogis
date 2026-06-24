import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@samhan/design-system'
import { dispatchExternalSms } from '../../../api/externalDispatch'
import { listExternalCarriers, type ExternalCarrier } from '../../../api/externalCarrier'
import type { SlipBoardResponse } from '../../../api/dispatchBoard'
import { DISPATCH_BOARD_QUERY_KEY } from '../hooks/useUnDispatchedSlipsQuery'

interface ExternalCarrierDispatchModalProps {
  selectedSlips: SlipBoardResponse[]
  onClose: () => void
}

/** 타배송사 SMS 발송 가능 여부를 검증한다. */
export function validateExternalDispatchSelection(
  selectedSlips: Pick<SlipBoardResponse, 'id'>[],
  carrierId: string | null,
): string | null {
  if (selectedSlips.length === 0) return '발송할 전표를 선택하세요.'
  if (!carrierId) return '외부기사/배송사를 선택하세요.'
  return null
}

/** dispatch.board CREATE 권한이 있을 때만 타배송사 발송 액션을 노출한다. */
export function canCreateExternalDispatch(
  canAccess: (pageCode: 'dispatch.board', action: 'create') => boolean,
): boolean {
  return canAccess('dispatch.board', 'create')
}

function extractServerMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const data = error.response?.data as { message?: unknown } | undefined
  return typeof data?.message === 'string' && data.message.trim() ? data.message : null
}

function carrierLabel(carrier: ExternalCarrier): string {
  return `${carrier.name} (${carrier.phone})`
}

/** 선택 전표를 외부기사/배송사에게 SMS 로 발송하는 모달. */
export function ExternalCarrierDispatchModal({
  selectedSlips,
  onClose,
}: ExternalCarrierDispatchModalProps) {
  const queryClient = useQueryClient()
  const [carrierId, setCarrierId] = useState<string>('')
  const [clientError, setClientError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const carriersQuery = useQuery({
    queryKey: ['admin', 'external-carriers', 'dispatch-modal'],
    queryFn: () => listExternalCarriers({ page: 0, size: 100 }),
  })

  const carriers = useMemo(
    () => (carriersQuery.data?.content ?? []).filter((carrier) => carrier.active),
    [carriersQuery.data?.content],
  )

  const mutation = useMutation({
    mutationFn: dispatchExternalSms,
    onSuccess: (res) => {
      setSuccessMessage(`${res.carrierName} SMS 발송 완료 (${res.slipCount}건)`)
      setClientError(null)
      void queryClient.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
    },
  })

  const handleSubmit = () => {
    const validation = validateExternalDispatchSelection(selectedSlips, carrierId || null)
    if (validation) {
      setClientError(validation)
      return
    }
    setClientError(null)
    setSuccessMessage(null)
    mutation.mutate({
      carrierId,
      slipIds: selectedSlips.map((slip) => slip.id),
      channel: 'SMS',
    })
  }

  const isPending = mutation.isPending
  const errorMessage = clientError ?? (mutation.isError
    ? extractServerMessage(mutation.error) ?? '타배송사 SMS 발송에 실패했습니다.'
    : null)

  return (
    <Modal
      open
      onClose={onClose}
      title="타배송사 발송"
      description="선택 전표를 외부기사/배송사에게 SMS로 발송합니다."
      size="md"
      closeOnBackdropClick={!isPending}
      closeOnEsc={!isPending}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            data-testid="external-carrier-dispatch-cancel"
            style={{
              padding: '8px 14px',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              background: 'var(--color-neutral-0)',
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || selectedSlips.length === 0}
            data-testid="external-carrier-dispatch-submit"
            style={{
              padding: '8px 14px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--color-primary-600, #2563EB)',
              color: 'var(--color-neutral-0)',
              fontWeight: 600,
              cursor: isPending || selectedSlips.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? '발송 중…' : 'SMS 발송'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14, fontSize: 13 }}>
        <section>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>선택 전표 {selectedSlips.length}건</div>
          <div
            style={{
              display: 'grid',
              gap: 6,
              maxHeight: 160,
              overflowY: 'auto',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 6,
              padding: 8,
            }}
          >
            {selectedSlips.map((slip) => (
              <div key={slip.id} data-testid={`external-carrier-dispatch-slip-${slip.slipNo}`}>
                <strong>{slip.slipNo}</strong>
                <span style={{ marginLeft: 8 }}>{slip.partnerName}</span>
                <span style={{ display: 'block', color: 'var(--color-neutral-500)' }}>
                  {slip.deliveryAddress || '-'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>외부기사/배송사</span>
          <select
            value={carrierId}
            onChange={(e) => setCarrierId(e.target.value)}
            disabled={isPending || carriersQuery.isLoading}
            data-testid="external-carrier-dispatch-carrier"
            style={{
              height: 34,
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              padding: '0 8px',
            }}
          >
            <option value="">선택</option>
            {carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>
                {carrierLabel(carrier)}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>채널</span>
          <span data-testid="external-carrier-dispatch-channel">SMS</span>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            data-testid="external-carrier-dispatch-error"
            style={{
              padding: 8,
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
            }}
          >
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div
            role="status"
            data-testid="external-carrier-dispatch-success"
            style={{
              padding: 8,
              border: '1px solid var(--color-success-200, #BBF7D0)',
              borderRadius: 4,
              background: 'var(--color-success-50, #F0FDF4)',
              color: 'var(--color-success-700, #047857)',
            }}
          >
            {successMessage}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
