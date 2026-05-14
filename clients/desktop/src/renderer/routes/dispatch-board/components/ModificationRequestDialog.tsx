/**
 * ModificationRequestDialog — DISPATCHED 배차 작업의 [수정 요청] 발송 dialog (Phase C FE-F2).
 *
 * <p>spec § 6.2 / plan FE F2.2.
 *
 * 흐름:
 *  1) DispatchTaskDetailModal 에서 [수정 요청] 클릭 → 본 dialog open.
 *  2) 사유 textarea 입력 (필수, BE @NotBlank @Size(max=500) 가드).
 *  3) [요청 발송] 클릭 → `POST /admin/dispatch-tasks/{taskId}/modification-request`.
 *  4) 성공 → task.status = MODIFICATION_REQUESTED 로 갱신 + 부모 modal 닫기.
 *  5) 실패 → 빨강 inline 에러 + retry.
 *
 * UUID 비공개:
 *  - taskId 는 prop / API path 만 사용. dialog 본문에는 taskCode 만 노출.
 *
 * accessibility:
 *  - dialog title 한국어 풀네임 + textarea aria-label.
 *  - 빈 사유 시 submit 비활성 (button disabled).
 */
import { useState } from 'react'
import { Modal } from '@samhan/design-system'
import { useRequestModificationMutation } from '../hooks/useDispatchTask'

interface ModificationRequestDialogProps {
  taskId: string
  taskCode: string
  onClose: () => void
  onSubmitted?: () => void
}

const MAX_REASON_LENGTH = 500

export function ModificationRequestDialog({
  taskId,
  taskCode,
  onClose,
  onSubmitted,
}: ModificationRequestDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useRequestModificationMutation(taskId)

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
      title="수정 요청"
      description={`${taskCode} — 아로로지스로 배차 수정 요청을 발송합니다.`}
      size="md"
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="modification-request-dialog-cancel"
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
            data-testid="modification-request-dialog-submit"
            aria-label={`배차 작업 ${taskCode} 수정 요청 발송`}
            style={{
              padding: '8px 16px',
              background: valid
                ? 'var(--color-purple-600, #7C3AED)'
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
            {submitting ? '요청 발송 중…' : '✏ 요청 발송'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label
          htmlFor="modification-request-reason"
          style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}
        >
          수정 요청 사유 (필수, 최대 {MAX_REASON_LENGTH}자)
        </label>
        <textarea
          id="modification-request-reason"
          data-testid="modification-request-dialog-reason"
          aria-label="배차 수정 요청 사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 슬립 SL-009 추가 필요 + 정차 순서 조정"
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
            data-testid="modification-request-dialog-error"
            style={{
              padding: 8,
              fontSize: 12,
              color: 'var(--color-danger-700, #B91C1C)',
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              borderRadius: 4,
            }}
          >
            수정 요청 발송 실패. 잠시 후 다시 시도해주세요.
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
