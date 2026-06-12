/**
 * DispatchCompleteDialog — [✓ 배차 완료] 버튼 클릭 시 확인 dialog.
 *
 * <p>Phase A FE-5.3.
 *
 * 구성:
 * - 발송 요약 (taskCode + 그룹 수 + 슬립 총 건수).
 * - "아로로지스로 발송 후 매칭 결과 회신을 대기합니다" 안내 문구.
 * - [취소] / [발송하기] — 발송 후 spinner.
 *
 * 발송 성공:
 * - 부모 `VehicleGroupColumn` 이 invalidate 한 task query 가 자동 refetch → DISPATCHING 상태 배지로 갱신.
 * - dialog 는 발송 성공/실패 모두 자동 닫힘.
 */
import { Modal } from '@samhan/design-system'
import { useDispatchToArologisMutation } from '../hooks/useDispatchTask'

interface DispatchCompleteDialogProps {
  taskId: string
  taskCode: string | null
  totalGroups: number
  totalSlips: number
  groupIds?: string[]
  onClose: () => void
}

export function DispatchCompleteDialog({
  taskId,
  taskCode,
  totalGroups,
  totalSlips,
  groupIds,
  onClose,
}: DispatchCompleteDialogProps) {
  const mutation = useDispatchToArologisMutation(taskId)

  const handleSubmit = () => {
    mutation.mutate(groupIds, {
      onSettled: () => onClose(),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="배차 완료 — 아로로지스 발송"
      description="아래 배차 작업을 아로로지스로 발송합니다. 발송 후에는 차량/슬립 구성을 수정할 수 없습니다."
      size="md"
      closeOnBackdropClick={!mutation.isPending}
      closeOnEsc={!mutation.isPending}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            data-testid="dispatch-board-complete-cancel"
            style={{
              padding: '8px 16px',
              background: 'var(--color-neutral-100)',
              color: 'var(--color-neutral-800)',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="dispatch-board-complete-submit"
            style={{
              padding: '8px 16px',
              background: 'var(--color-success-600, #059669)',
              color: 'var(--color-neutral-0)',
              border: 'none',
              borderRadius: 4,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {mutation.isPending ? '발송하는 중…' : '✓ 발송하기'}
          </button>
        </div>
      }
    >
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: '6px 12px',
          fontSize: 13,
          margin: 0,
        }}
      >
        <dt style={{ color: 'var(--color-neutral-500)' }}>배차 작업번호</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{taskCode ?? '-'}</dd>
        <dt style={{ color: 'var(--color-neutral-500)' }}>차량 그룹 수</dt>
        <dd style={{ margin: 0 }}>{totalGroups} 대</dd>
        <dt style={{ color: 'var(--color-neutral-500)' }}>출고전표 수</dt>
        <dd style={{ margin: 0 }}>{totalSlips} 건</dd>
      </dl>
      {mutation.isError ? (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            fontSize: 12,
            color: 'var(--color-danger-700, #B91C1C)',
            background: 'var(--color-danger-50, #FEF2F2)',
            border: '1px solid var(--color-danger-200, #FECACA)',
            borderRadius: 4,
          }}
          role="alert"
        >
          발송 실패. 잠시 후 다시 시도해주세요.
        </div>
      ) : null}
    </Modal>
  )
}
