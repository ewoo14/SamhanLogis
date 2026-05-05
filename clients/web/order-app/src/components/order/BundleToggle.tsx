/**
 * Bundle EXPAND/KEEP 토글 (legacy DOMAIN-EXTENSIONS §2 Bundle 처리 UI 표시).
 *
 * <p>partner-order 의 SET 행 (싱글세트 등) 옆에 표시. 발송 직전 미리보기
 * 시점에서 EXPAND 라면 구성품 펼침 (`explodeSendSets_` BE 호출 트리거).
 *
 * <p>SEND_AS_SET_IDS 화이트리스트 4 SKU (발통원형/발통평형/유선보드/천장펌프) 는
 * BE 차원에서 KEEP 강제. UI 는 단순 토글만.
 */
import type { BundleMode } from '../../types'

interface Props {
  mode: BundleMode
  onToggle: () => void
  readOnly?: boolean
}

export function BundleToggle({ mode, onToggle, readOnly }: Props) {
  return (
    <span
      className="bundle-toggle"
      style={{ marginLeft: 8, verticalAlign: 'middle' }}
      role="group"
      aria-label="Bundle 처리 방식"
    >
      <button
        type="button"
        className={mode === 'EXPAND' ? 'is-active' : ''}
        onClick={() => !readOnly && mode !== 'EXPAND' && onToggle()}
        disabled={readOnly}
        title="EXPAND — 발송 직전 구성품으로 펼침"
      >
        EXPAND
      </button>
      <button
        type="button"
        className={mode === 'KEEP' ? 'is-active' : ''}
        onClick={() => !readOnly && mode !== 'KEEP' && onToggle()}
        disabled={readOnly}
        title="KEEP — SET 행 그대로 유지 (화이트리스트)"
      >
        KEEP
      </button>
    </span>
  )
}
