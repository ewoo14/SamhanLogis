/**
 * 견적서 작성 화면의 legacy 메뉴 toolbar — v3 정정 #17.
 *
 * <p>legacy estimate index.html (line 1280-1300) 의 상단 메뉴 button row 5종을
 * React toolbar 로 옮긴다.
 * <ul>
 *   <li>분기계산 — legacy `#btnOpenBranch` (line 1291). 본 v3 에서는 placeholder modal
 *       (M3 EstimateBranchCalcService 통합 시 실 매트릭스 화면으로 교체).</li>
 *   <li>견적/주문하기 — legacy `btnSendOrder` (line 8654). slip-service 출고전표 자동 생성
 *       trigger. 본 v3 에서는 stub (라인+거래처 검증 후 toast).</li>
 *   <li>과거 발송내역 — legacy `#btnHistory` (line 1294). `GET /api/v1/estimates?
 *       partnerId=...&type=history` 조회 후 모달 목록.</li>
 *   <li>주문저장 — legacy `#btnSaveSnapshot` (line 1297). EstimateSnapshot 저장 모달.</li>
 *   <li>저장내역 — legacy `#btnLoadSnapshot` (line 1298). 저장된 견적 목록 모달.</li>
 * </ul>
 *
 * <p>각 버튼은 제어 props 로 부모 모달 state 를 토글한다. 아이콘은 emoji 미사용
 * (DESIGN 가이드).
 */
import styles from './sales.module.css'

interface Props {
  /** 분기계산 모달 열기 */
  onOpenBranch: () => void
  /** 견적/주문하기 — slip 자동 생성 stub */
  onSendOrder: () => void
  /** 과거 발송내역 모달 */
  onOpenHistory: () => void
  /** 주문저장 (snapshot 저장) 모달 */
  onSaveSnapshot: () => void
  /** 저장내역 (snapshot list) 모달 */
  onOpenSnapshotList: () => void
  /** 견적/주문하기 활성 조건 (라인 1건 이상 + 거래처 선택). */
  canSendOrder: boolean
  /** 저장 활성 조건 (라인 1건 이상). */
  canSaveSnapshot: boolean
}

export function EstimateMenuToolbar({
  onOpenBranch,
  onSendOrder,
  onOpenHistory,
  onSaveSnapshot,
  onOpenSnapshotList,
  canSendOrder,
  canSaveSnapshot,
}: Props) {
  return (
    <div
      className={styles['menuToolbar']}
      role="toolbar"
      aria-label="견적서 메뉴"
    >
      {/* legacy `#btnOpenBranch` (line 1291) */}
      <button
        type="button"
        className={styles['menuToolbarBtn']}
        onClick={onOpenBranch}
        aria-label="임의 분기계산"
        data-menu="branch"
      >
        분기계산
      </button>
      {/* legacy `btnSendOrder` (line 8654) */}
      <button
        type="button"
        className={`${styles['menuToolbarBtn']} ${styles['menuToolbarBtnPrimary']}`}
        onClick={onSendOrder}
        disabled={!canSendOrder}
        aria-label="견적·주문하기 (출고전표 자동 생성)"
        data-menu="send-order"
      >
        견적·주문하기
      </button>
      {/* legacy `#btnHistory` (line 1294) */}
      <button
        type="button"
        className={`${styles['menuToolbarBtn']} ${styles['menuToolbarBtnHistory']}`}
        onClick={onOpenHistory}
        aria-label="과거 발송내역"
        data-menu="history"
      >
        과거 발송내역
      </button>
      {/* legacy `#btnSaveSnapshot` (line 1297) */}
      <button
        type="button"
        className={`${styles['menuToolbarBtn']} ${styles['menuToolbarBtnSave']}`}
        onClick={onSaveSnapshot}
        disabled={!canSaveSnapshot}
        aria-label="주문저장 (snapshot)"
        data-menu="save-snapshot"
      >
        주문저장
      </button>
      {/* legacy `#btnLoadSnapshot` (line 1298) */}
      <button
        type="button"
        className={`${styles['menuToolbarBtn']} ${styles['menuToolbarBtnSnapshotList']}`}
        onClick={onOpenSnapshotList}
        aria-label="저장내역"
        data-menu="snapshot-list"
      >
        저장내역
      </button>
    </div>
  )
}
