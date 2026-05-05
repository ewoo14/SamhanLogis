/**
 * 분기계산 모달 — v3 정정 #17 (placeholder).
 *
 * <p>legacy `#pageBranch` (estimate index.html line 1909) 의 분기계산 매트릭스 화면을
 * 모달로 옮긴다. 본 v3 단계에서는 G13 (b) 결정대로 placeholder + M3 통합 대기.
 *
 * <p>실 매트릭스 (외기 column + 실내기 capsule drag-and-drop + 분기관 자동 lookup) 는
 * M3 EstimateBranchCalcService 통합 시 본 모달의 body 로 마운트.
 */
import styles from './sales.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

export function EstimateBranchCalcModal({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className={styles['modalBackdrop']} role="dialog" aria-modal="true">
      <div className={styles['modal']} style={{ maxWidth: 800 }}>
        <div className={styles['modalHead']}>
          <div className={styles['modalTitle']}>임의 분기계산</div>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className={styles['modalBody']}>
          <div className={styles['branchPlaceholder']}>
            <h4>분기계산 (실외기 → 실내기 매트릭스)</h4>
            <p>legacy `#pageBranch` (line 1909) 의 DnD 매트릭스 화면이 표시되는 영역입니다.</p>
            <p>외기 column + 실내기 capsule drag-and-drop + 분기관 자동 lookup.</p>
            <span className={styles['pendingTag']}>
              M3 단계 EstimateBranchCalcService 통합 예정
            </span>
          </div>
        </div>
        <div className={styles['modalFoot']}>
          <button type="button" className={styles['btn']} onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
