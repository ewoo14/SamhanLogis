/**
 * 주소 검색 dock — legacy `#addrDock` (line 1680/2042) 의 Daum Postcode embed 화면을
 * React 로 변환. 본 슬라이스에서는 Daum Postcode SDK 미통합 — 수동 입력 dialog 만 제공.
 *
 * <p>후속 슬라이스에서 `react-daum-postcode` (또는 직접 SDK script) 통합 예정.
 */
import { useState } from 'react'
import styles from './sales.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (address: string) => void
}

export function AddrSearchDock({ open, onClose, onPick }: Props) {
  const [value, setValue] = useState('')
  if (!open) return null
  return (
    <div className={styles['addrDockOverlay']} role="dialog" aria-modal="true">
      <div className={styles['addrDockBox']}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>주소 검색 (수동 입력)</h3>
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
          Daum Postcode SDK 통합은 후속 슬라이스에서 추가됩니다. 임시로 직접 입력하세요.
        </p>
        <input
          type="text"
          placeholder="예: 서울특별시 강남구 테헤란로 123"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={styles['btn']}
            disabled={!value.trim()}
            onClick={() => {
              onPick(value.trim())
              setValue('')
            }}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}
