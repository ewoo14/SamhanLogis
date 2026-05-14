/**
 * CancellationRequestDialog — DISPATCHED 배차 작업의 [취소 요청] 발송 dialog (Phase C FE-F2).
 *
 * <p>spec § 6.2 / plan FE F2.2.
 *
 * 흐름:
 *  1) DispatchTaskDetailModal 에서 [취소 요청] 클릭 → 본 dialog open.
 *  2) 사유 textarea 입력 (필수).
 *  3) [요청 발송] 클릭 → `POST /admin/dispatch-tasks/{taskId}/cancellation-request`.
 *  4) 성공 → task.status = CANCEL_REQUESTED 로 갱신 + 부모 modal 닫기.
 *  5) 실패 → 빨강 inline 에러 + retry.
 *
 * 수정 요청 dialog 와 동일 패턴 — 색상은 danger 계열, 한국어 라벨만 다름.
 */
import { useState } from 'react'
import { Modal } from '@samhan/design-system'
import { useRequestCancellationMutation } from '../hooks/useDispatchTask'

interface CancellationRequestDialogProps {
  taskId: string
  taskCode: string
  onClose: () => void
  onSubmitted?: () => void
}

const MAX_REASON_LENGTH = 500

export function CancellationRequestDialog({
  taskId,
  taskCode,
  onClose,
  onSubmitted,
}: CancellationRequestDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useRequestCancellationMutation(taskId)

  const trimmed = reason.trim()
  const valid =
    trimmed.length > 0 && trimmed.length <= MAX_REASON_LENGTH
  const submitting = mutation.isPending

  const handleSubmit = () => {
    if (!valid || submitting) return
    mutation.mutate(trimmed, {
      onSuccess: () => {
        onSubmitted?.()
      },
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="취소 요청"
      description={`${taskCode} — 아로로지스로 배차 취소 요청을 발송합니다. 수락 시 매핑된 슬립은 미배차로 복귀됩니다.`}
      size="md"
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="cancellation-request-dialog-cancel"
            style={{
              padding: '8px 16px',
              background: 'var(--color-neutral-100)',
              color: 'var(--color-neutral-800)',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            data-testid="cancellation-request-dialog-submit"
            aria-label={`배차 작업 ${taskCode} 취소 요청 발송`}
            style={{
              padding: '8px 16px',
              background: valid
                ? 'var(--color-danger-600, #DC2626)'
                : 'var(--color-neutral-200)',
              color: valid
                ? 'var(--color-neutral-0)'
                : 'var(--color-neutral-500)',
              border: 'none',
              borderRadius: 4,
              cursor: valid && !submitting ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {submitting ? '요청 발송 중…' : '✗ 요청 발송'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label
          htmlFor="cancellation-request-reason"
          style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}
        >
          취소 요청 사유 (필수, 최대 {MAX_REASON_LENGTH}자)
        </label>
        <textarea
          id="cancellation-request-reason"
          data-testid="cancellation-request-dialog-reason"
          aria-label="배차 취소 요청 사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 거래처 일정 변경으로 당일 배송 불가"
          rows={4}
          maxLength={MAX_REASON_LENGTH}
          disabled={submitting}
          style={{
            width: '100%',
            padding: 8,
            fontSize: 13,
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 4,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 80,
          }}
        />
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-neutral-500)',
            textAlign: 'right',
          }}
        >
          {trimmed.length} / {MAX_REASON_LENGTH}
        </div>
        {mutation.isError ? (
          <div
            role="alert"
            data-testid="cancellation-request-dialog-error"
            style={{
              padding: 8,
              fontSize: 12,
              color: 'var(--color-danger-700, #B91C1C)',
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
            }}
          >
            취소 요청 발송 실패. 잠시 후 다시 시도해주세요.
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
