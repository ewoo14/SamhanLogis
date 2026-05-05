/**
 * 과거 발송내역 모달 — v3 정정 #17 핵심 4 모달 중 하나.
 *
 * <p>legacy `#btnHistory` (estimate index.html line 1294) → `#pageHistory` (line 1847)
 * 의 화면을 React 모달로 옮긴다. 거래처 단위로 과거 견적/주문 발송 이력 조회.
 *
 * <p>현 v3 단계에서는 estimate-service M3 미배포 가정 — 실 fetch 는 stub (빈 목록 +
 * 안내 메시지). 후속 슬라이스에서 `GET /api/v1/estimates?partnerId=...&type=history`
 * 통합 시 useQuery 로 교체.
 */
import { useEffect, useState } from 'react'
import styles from './sales.module.css'

interface HistoryEntry {
  /** 발송 일시 (ISO 8601). */
  sentAt: string
  /** 견적 번호 (사용자 노출 식별자). */
  estimateNumber: string
  /** 합계 (원). */
  totalAmount: number
  /** 발송 채널 — SMS / EMAIL / KAKAO. */
  channel: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** 거래처 코드 (사업자등록번호). null 이면 모달은 안내만 표시. */
  partnerCode: string | null
  /** 거래처명 (모달 헤더 표시용). */
  partnerName: string | null
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

export function EstimateHistoryModal({ open, onClose, partnerCode, partnerName }: Props) {
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[]>([])

  useEffect(() => {
    if (!open || !partnerCode) {
      setEntries([])
      return
    }
    setLoading(true)
    // M3 estimate-service 미배포 — stub 응답. 후속 슬라이스에서 실 fetch 로 교체.
    const t = window.setTimeout(() => {
      setEntries([])
      setLoading(false)
    }, 350)
    return () => window.clearTimeout(t)
  }, [open, partnerCode])

  if (!open) return null

  return (
    <div className={styles['modalBackdrop']} role="dialog" aria-modal="true">
      <div className={styles['modal']} style={{ maxWidth: 720 }}>
        <div className={styles['modalHead']}>
          <div className={styles['modalTitle']}>
            과거 발송내역 {partnerName ? `· ${partnerName}` : ''}
          </div>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className={styles['modalBody']}>
          {!partnerCode ? (
            <div className={styles['emptyState']}>
              <h3>거래처를 먼저 선택하세요</h3>
              <p>거래처 검색 → 선택 후 다시 [과거 발송내역] 버튼을 누르세요.</p>
            </div>
          ) : loading ? (
            <div className={styles['emptyState']}>발송 이력을 불러오는 중…</div>
          ) : entries.length === 0 ? (
            <div className={styles['emptyState']}>
              <h3>발송 이력이 없습니다</h3>
              <p>거래처: {partnerName ?? partnerCode}</p>
              <p style={{ fontSize: 11, marginTop: 8 }}>
                M3 estimate-service 통합 후 실 데이터 표시 (현 단계 stub).
              </p>
            </div>
          ) : (
            <table className={styles['estTable']} style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>발송 일시</th>
                  <th>견적 번호</th>
                  <th style={{ textAlign: 'right' }}>합계</th>
                  <th>채널</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.estimateNumber}>
                    <td>{e.sentAt}</td>
                    <td>{e.estimateNumber}</td>
                    <td className="numeric">{krw(e.totalAmount)}원</td>
                    <td>{e.channel}</td>
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
