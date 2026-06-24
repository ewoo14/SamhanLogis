import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@samhan/design-system'
import {
  dispatchExternal,
  type ExternalDispatchChannel,
  type ExternalDispatchResponse,
} from '../../../api/externalDispatch'
import { listExternalCarriers, type ExternalCarrier } from '../../../api/externalCarrier'
import type { SlipBoardResponse } from '../../../api/dispatchBoard'
import { usePermissions } from '../../../hooks/usePermissions'
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

/** dispatch.board VIEW 권한이 있을 때만 배차의뢰서 인쇄 진입을 노출한다. */
export function canViewExternalDispatchPrint(
  canAccess: (pageCode: 'dispatch.board', action: 'view') => boolean,
): boolean {
  return canAccess('dispatch.board', 'view')
}

/** PRINT/BOTH 성공 응답에서 배차의뢰서 인쇄 라우트를 계산한다. */
export function externalDispatchPrintPath(
  res: Pick<ExternalDispatchResponse, 'id' | 'status' | 'channel'>,
): string | null {
  if (res.status !== 'SENT') return null
  if (res.channel !== 'PRINT' && res.channel !== 'BOTH') return null
  return `/dispatch/external-dispatch/${res.id}/print`
}

/**
 * 발송 응답(status)에 따른 화면 피드백을 결정한다.
 *
 * <p>BE 는 SMS 실패 시에도 HTTP 200 + status='FAILED' 로 응답한다(graceful, 재시도 가능).
 * 따라서 status 를 검사하지 않으면 미발송인데 '발송 완료'로 오인하는 거짓 양성이 된다(P1).
 * SENT 만 성공 메시지, FAILED 는 실패 메시지를 반환한다.
 */
export function resolveDispatchFeedback(
  res: Pick<ExternalDispatchResponse, 'status' | 'carrierName' | 'slipCount' | 'channel'>,
): { successMessage: string | null; errorMessage: string | null } {
  if (res.status === 'SENT') {
    if (res.channel === 'PRINT') {
      return {
        successMessage: `${res.carrierName} 인쇄 배차의뢰서 생성 완료 (${res.slipCount}건)`,
        errorMessage: null,
      }
    }
    if (res.channel === 'BOTH') {
      return {
        successMessage: `${res.carrierName} SMS 발송 및 인쇄 배차의뢰서 생성 완료 (${res.slipCount}건)`,
        errorMessage: null,
      }
    }
    return {
      successMessage: `${res.carrierName} SMS 발송 완료 (${res.slipCount}건)`,
      errorMessage: null,
    }
  }
  return {
    successMessage: null,
    errorMessage: 'SMS 발송에 실패했습니다. 전표는 미발송 상태로 남아 다시 시도할 수 있습니다.',
  }
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
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const [carrierId, setCarrierId] = useState<string>('')
  const [channel, setChannel] = useState<ExternalDispatchChannel>('SMS')
  const [clientError, setClientError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastResponse, setLastResponse] = useState<ExternalDispatchResponse | null>(null)

  const carriersQuery = useQuery({
    queryKey: ['admin', 'external-carriers', 'dispatch-modal'],
    queryFn: () => listExternalCarriers({ page: 0, size: 100 }),
  })

  const carriers = useMemo(
    () => (carriersQuery.data?.content ?? []).filter((carrier) => carrier.active),
    [carriersQuery.data?.content],
  )

  const mutation = useMutation({
    mutationFn: dispatchExternal,
    onSuccess: (res) => {
      // 발송 후 목록 갱신(성공 전표는 DISPATCHED 로 이탈).
      void queryClient.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
      // SENT 만 성공, FAILED(HTTP 200)는 실패 피드백 — 거짓 양성 방지(P1).
      const feedback = resolveDispatchFeedback(res)
      setSuccessMessage(feedback.successMessage)
      setClientError(feedback.errorMessage)
      setLastResponse(res)
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
    setLastResponse(null)
    mutation.mutate({
      carrierId,
      slipIds: selectedSlips.map((slip) => slip.id),
      channel,
    })
  }

  const isPending = mutation.isPending
  // 발송 성공(SENT) 후에는 동일 전표 재발송을 구조적으로 차단(화면 상태필터 무관 — 재클릭 시 BE 409 방지).
  const dispatchSucceeded = successMessage != null
  const isSubmitDisabled = isPending || selectedSlips.length === 0 || dispatchSucceeded
  const printPath = lastResponse ? externalDispatchPrintPath(lastResponse) : null
  const canOpenPrint = canViewExternalDispatchPrint(canAccess)
  const errorMessage = clientError ?? (mutation.isError
    ? extractServerMessage(mutation.error) ?? '타배송사 SMS 발송에 실패했습니다.'
    : null)

  return (
    <Modal
      open
      onClose={onClose}
      title="타배송사 발송"
      description="선택 전표를 외부기사/배송사에게 SMS 또는 인쇄 배차의뢰서로 발송합니다."
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
            disabled={isSubmitDisabled}
            data-testid="external-carrier-dispatch-submit"
            style={{
              padding: '8px 14px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--color-primary-600, #2563EB)',
              color: 'var(--color-neutral-0)',
              fontWeight: 600,
              cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? '발송 중…' : channel === 'SMS' ? 'SMS 발송' : channel === 'PRINT' ? '인쇄 의뢰서 생성' : 'SMS 발송 + 인쇄'}
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

        {carriersQuery.isError ? (
          <div
            role="alert"
            data-testid="external-carrier-dispatch-carriers-error"
            style={{
              padding: 8,
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
            }}
          >
            외부기사/배송사 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        ) : !carriersQuery.isLoading && carriers.length === 0 ? (
          <span
            data-testid="external-carrier-dispatch-carriers-empty"
            style={{ color: 'var(--color-neutral-500)' }}
          >
            등록된 활성 외부기사/배송사가 없습니다. 외부기사/배송사 관리에서 먼저 등록하세요.
          </span>
        ) : null}

        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>채널</span>
          <div
            role="radiogroup"
            aria-label="타배송사 발송 채널"
            data-testid="external-carrier-dispatch-channel"
            style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
          >
            {channelOptions.map((option) => (
              <label key={option.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <input
                  type="radio"
                  name="external-dispatch-channel"
                  value={option.value}
                  checked={channel === option.value}
                  onChange={() => setChannel(option.value)}
                  disabled={isPending || dispatchSucceeded}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
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
            {printPath && canOpenPrint ? (
              <button
                type="button"
                onClick={() => navigate(printPath)}
                data-testid="external-carrier-dispatch-print"
                style={{
                  display: 'block',
                  marginTop: 8,
                  padding: '7px 12px',
                  border: '1px solid var(--color-success-300, #86EFAC)',
                  borderRadius: 4,
                  background: 'var(--color-neutral-0)',
                  color: 'var(--color-success-800, #166534)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                배차의뢰서 인쇄
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

const channelOptions: Array<{ value: ExternalDispatchChannel; label: string }> = [
  { value: 'SMS', label: 'SMS' },
  { value: 'PRINT', label: '인쇄' },
  { value: 'BOTH', label: 'SMS + 인쇄' },
]
