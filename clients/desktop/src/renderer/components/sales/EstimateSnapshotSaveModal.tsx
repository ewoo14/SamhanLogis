/**
 * 주문저장 (snapshot 저장) 모달 — v3 정정 #17 핵심 4 모달 중 하나.
 *
 * <p>legacy `#btnSaveSnapshot` (estimate index.html line 1297) → `handleSaveSnapshot`
 * (line 16460) → `EstimateSnapshot` 저장. 사용자에게 snapshot 제목 입력받아 임시 저장.
 *
 * <p>현 v3 단계에서는 backend 저장 endpoint stub — 'POST /api/v1/estimates/snapshots'
 * 호출은 후속 슬라이스 (M3) 에서 통합. 본 모달은 입력 검증 + UI 흐름만 완성.
 */
import { useState } from 'react'
import { usePricingStore } from '../../stores/usePricingStore'
import styles from './sales.module.css'

interface Props {
  open: boolean
  onClose: () => void
  /** 저장 성공 시 부모로 알림 (toast 표시 등). */
  onSaved?: (snapshotName: string) => void
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

export function EstimateSnapshotSaveModal({ open, onClose, onSaved }: Props) {
  const grandTotal = usePricingStore((s) => s.grandTotal)
  const lines = usePricingStore((s) => s.lines)
  const orderInfo = usePricingStore((s) => s.orderInfo)

  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const total = grandTotal()
  const lineCount = lines.length
  const partnerLabel = orderInfo.partnerName ?? '(거래처 미선택)'

  function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    // M3 estimate-service 미배포 — stub. localStorage 임시 저장으로 후속 [저장내역] 모달이
    // 본 결과를 즉시 표시할 수 있도록 한다.
    try {
      const key = 'samhan.estimate.snapshots'
      const raw = window.localStorage.getItem(key)
      const list: Array<{
        title: string
        savedAt: string
        totalAmount: number
        lineCount: number
        partnerName: string | null
      }> = raw ? (JSON.parse(raw) as never) : []
      list.unshift({
        title: title.trim(),
        savedAt: new Date().toISOString(),
        totalAmount: total,
        lineCount,
        partnerName: orderInfo.partnerName,
      })
      window.localStorage.setItem(key, JSON.stringify(list.slice(0, 50)))
    } catch {
      // localStorage 미가용 환경 — 무시.
    }
    window.setTimeout(() => {
      setSaving(false)
      const saved = title.trim()
      setTitle('')
      onSaved?.(saved)
      onClose()
    }, 250)
  }

  return (
    <div className={styles['modalBackdrop']} role="dialog" aria-modal="true">
      <div className={styles['modal']} style={{ maxWidth: 480 }}>
        <div className={styles['modalHead']}>
          <div className={styles['modalTitle']}>주문저장</div>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className={styles['modalBody']}>
          <div className={styles['formGrid']} style={{ gridTemplateColumns: '1fr' }}>
            <div className={styles['formField']}>
              <label htmlFor="snapshotTitle">저장 제목</label>
              <input
                id="snapshotTitle"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 5월 1주차 강남구 견적"
                autoFocus
              />
            </div>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: '#f9fafb',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <strong>거래처:</strong> {partnerLabel}
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>라인 수:</strong> {lineCount}건
              </div>
              <div>
                <strong>합계:</strong> {krw(total)}원
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              ※ M3 estimate-service 통합 전까지 본 저장은 브라우저 localStorage 에만
              보관됩니다. 후속 슬라이스에서 backend 영속 저장으로 전환됩니다.
            </p>
          </div>
        </div>
        <div className={styles['modalFoot']}>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={styles['btn']}
            onClick={handleSave}
            disabled={!title.trim() || saving || lineCount === 0}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
