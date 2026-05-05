/**
 * 저장내역 (snapshot list) 모달 — v3 정정 #17 핵심 4 모달 중 하나.
 *
 * <p>legacy `#btnLoadSnapshot` (estimate index.html line 1298) → `goSnapshotPage()`
 * → `loadSnapshotHistory` (line 16423) 의 화면을 React 모달로 옮긴다.
 *
 * <p>현 v3 단계 — `EstimateSnapshotSaveModal` 가 localStorage 에 임시 저장한 snapshot
 * 목록을 표시. M3 통합 시 `GET /api/v1/estimates/snapshots` 로 교체.
 */
import { useEffect, useMemo, useState } from 'react'
import styles from './sales.module.css'

interface SnapshotRow {
  title: string
  savedAt: string
  totalAmount: number
  lineCount: number
  partnerName: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  /** 사용자가 snapshot 을 선택해 불러올 때 (M3 통합 후 store hydrate). */
  onPick?: (snapshot: SnapshotRow) => void
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

function loadSnapshots(): SnapshotRow[] {
  try {
    const raw = window.localStorage.getItem('samhan.estimate.snapshots')
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SnapshotRow[]
  } catch {
    return []
  }
}

export function EstimateSnapshotListModal({ open, onClose, onPick }: Props) {
  const [refreshTick, setRefreshTick] = useState(0)

  // 모달 열릴 때 마다 재조회.
  useEffect(() => {
    if (open) setRefreshTick((t) => t + 1)
  }, [open])

  const snapshots = useMemo(
    () => (open ? loadSnapshots() : []),
    [open, refreshTick],
  )

  if (!open) return null

  return (
    <div className={styles['modalBackdrop']} role="dialog" aria-modal="true">
      <div className={styles['modal']} style={{ maxWidth: 720 }}>
        <div className={styles['modalHead']}>
          <div className={styles['modalTitle']}>
            저장내역
            <span className={styles['badge']}>{snapshots.length}건</span>
          </div>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className={styles['modalBody']}>
          {snapshots.length === 0 ? (
            <div className={styles['emptyState']}>
              <h3>저장된 견적이 없습니다</h3>
              <p>상단 [주문저장] 버튼으로 첫 견적을 임시 저장하세요.</p>
              <p style={{ fontSize: 11, marginTop: 8 }}>
                M3 estimate-service 통합 후 backend 영속 저장으로 전환됩니다.
              </p>
            </div>
          ) : (
            <table className={styles['estTable']} style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>저장 제목</th>
                  <th>저장 일시</th>
                  <th>거래처</th>
                  <th>라인</th>
                  <th style={{ textAlign: 'right' }}>합계</th>
                  <th style={{ width: 80 }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s, idx) => (
                  <tr key={`${s.title}-${idx}`}>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{s.title}</td>
                    <td>{new Date(s.savedAt).toLocaleString('ko-KR')}</td>
                    <td>{s.partnerName ?? '-'}</td>
                    <td>{s.lineCount}건</td>
                    <td className="numeric">{krw(s.totalAmount)}원</td>
                    <td>
                      <button
                        type="button"
                        className={styles['btnMini']}
                        onClick={() => {
                          onPick?.(s)
                          onClose()
                        }}
                      >
                        불러오기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
