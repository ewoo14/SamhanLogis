/**
 * 견적/주문 라인 row — legacy `renderHome/renderSingle/renderComm/renderOld` 의 표 row 구조
 * 를 React 로 1:1 변환.
 *
 * <p>legacy 의 8~10 col grid 중 본 슬라이스에서는 7 col (체크/품명/모델/출고가/수량/납품가/소계)
 * 단순화 — Excel 키보드 매트릭스 (`initKeyboardFix` line 16936) 는 보류 (사용자 후속 결정).
 *
 * <p>UUID 비공개 가드 — `line.id` 는 React key 로만, 화면 미노출.
 *
 * <p>`onSpecClick` 옵션 — 라인 클릭 시 `<ProductSpecList>` 모달 노출 (DOMAIN-EXTENSIONS §4).
 */
import type { PricingLine } from '../../stores/usePricingStore'
import { BundleExpandToggle } from './BundleExpandToggle'
import styles from './sales.module.css'

interface Props {
  line: PricingLine
  readOnly?: boolean
  onQtyChange?: (qty: number) => void
  onRemove?: () => void
  onBundleModeChange?: (mode: 'EXPAND' | 'KEEP') => void
  onSpecClick?: () => void
}

/** 1000 단위 콤마 — KRW. */
const krw = (n: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(n)

export function EstimateLineRow({
  line,
  readOnly = false,
  onQtyChange,
  onRemove,
  onBundleModeChange,
  onSpecClick,
}: Props) {
  const showBundleToggle = line.bundleMode !== null

  return (
    <tr className={line.derived ? styles['derivedRow']! : ''}>
      <td>
        <button
          type="button"
          className={styles['btnGhost']}
          onClick={onSpecClick}
          aria-label={`${line.productName} 스펙 보기`}
          title="스펙 보기"
        >
          {line.productName}
          {line.hasVariableDiscount ? (
            <span className={styles['badge']} style={{ marginLeft: 4 }}>
              변동DC
            </span>
          ) : null}
        </button>
      </td>
      <td>{line.modelCode}</td>
      <td className="numeric">{krw(line.releasePrice)}</td>
      <td>
        {readOnly ? (
          line.quantity
        ) : (
          <input
            type="number"
            min={0}
            max={9999}
            value={line.quantity}
            className={styles['qtyInput']}
            onChange={(e) => onQtyChange?.(Number(e.target.value) || 0)}
            aria-label={`${line.productName} 수량`}
          />
        )}
      </td>
      <td className="numeric">{krw(line.deliveryPrice)}</td>
      <td className="numeric">{krw(line.subtotal)}</td>
      <td>
        {showBundleToggle ? (
          <BundleExpandToggle
            mode={line.bundleMode!}
            readOnly={readOnly}
            onChange={(m) => onBundleModeChange?.(m)}
          />
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        )}
      </td>
      <td>
        {readOnly ? null : (
          <button
            type="button"
            className={styles['btnGhost']}
            onClick={onRemove}
            aria-label="라인 제거"
          >
            제거
          </button>
        )}
      </td>
    </tr>
  )
}
