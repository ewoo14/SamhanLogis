/**
 * Bundle EXPAND/KEEP 토글 — DOMAIN-EXTENSIONS §2 / partner-order Code.js `explodeSendSets_`
 * (5352) 와 `SEND_AS_SET_IDS` 화이트리스트 (KEEP 4 SKU) 의 UI 표현.
 *
 * <p>EXPAND (default) — 전송 직전 component 라인으로 펼침.
 * KEEP — Bundle 부모 SKU 그대로 유지 (4 SKU: 발통원형/발통평형/유선보드/천장펌프).
 */
import styles from './sales.module.css'

interface Props {
  mode: 'EXPAND' | 'KEEP'
  readOnly?: boolean
  onChange?: (mode: 'EXPAND' | 'KEEP') => void
}

export function BundleExpandToggle({ mode, readOnly = false, onChange }: Props) {
  if (readOnly) {
    return (
      <span className={styles['badge']} title={mode === 'EXPAND' ? '구성품 펼침' : '세트 유지'}>
        {mode === 'EXPAND' ? 'EXPAND' : 'KEEP'}
      </span>
    )
  }
  return (
    <div role="radiogroup" aria-label="Bundle 모드" style={{ display: 'inline-flex', gap: 4 }}>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'EXPAND'}
        onClick={() => onChange?.('EXPAND')}
        className={mode === 'EXPAND' ? styles['catBtnActive'] : styles['btnMini']}
      >
        EXPAND
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'KEEP'}
        onClick={() => onChange?.('KEEP')}
        className={mode === 'KEEP' ? styles['catBtnActive'] : styles['btnMini']}
      >
        KEEP
      </button>
    </div>
  )
}
