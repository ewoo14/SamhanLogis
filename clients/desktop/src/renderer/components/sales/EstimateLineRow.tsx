/**
 * 견적/주문 라인 row — legacy `renderHome/renderSingle/renderComm/renderOld` 의 표 row 구조
 * 를 React 로 1:1 변환.
 *
 * <p>v2 정정 적용:
 * <ul>
 *   <li>§정정 2 — `useSortable` (@dnd-kit/sortable) 적용. drag handle 컬럼 추가.</li>
 *   <li>§정정 3 — 'Bundle' 컬럼 제거. Bundle EXPAND/KEEP 토글은 우측 아이콘 버튼 (모달 노출).</li>
 *   <li>§정정 4 — '모델 코드' → '모델명' (header 라벨).</li>
 *   <li>§정정 5 — '품명' → '품목명' (header 라벨).</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — `line.id` 는 React key + dnd id 로만 사용, 화면 미노출.
 *
 * <p>`onSpecClick` 옵션 — 라인 클릭 시 `<ProductSpecList>` 모달 노출 (DOMAIN-EXTENSIONS §4).
 */
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  /** Bundle 토글을 라인 우측 아이콘 버튼으로 노출 (v2 정정 §3 — Bundle 컬럼 제거 대안). */
  onBundleClick?: () => void
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
  onBundleClick,
}: Props) {
  const showBundleToggle = line.bundleMode !== null
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: line.id, disabled: readOnly })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={line.derived ? styles['derivedRow']! : ''}
      data-testid={`est-line-row-${line.modelCode}`}
    >
      <td style={{ width: 36, padding: 0 }}>
        {readOnly ? null : (
          <button
            type="button"
            className={styles['dragHandle']}
            aria-label="라인 순서 변경 핸들"
            title="끌어서 순서 변경"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
        )}
      </td>
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
      <td style={{ width: 140 }}>
        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {showBundleToggle ? (
            readOnly ? (
              <BundleExpandToggle
                mode={line.bundleMode!}
                readOnly
                onChange={(m) => onBundleModeChange?.(m)}
              />
            ) : (
              <button
                type="button"
                className={styles['btnGhost']}
                onClick={onBundleClick}
                aria-label={`${line.productName} Bundle 모드 전환 (${line.bundleMode})`}
                title={`Bundle 모드: ${line.bundleMode}`}
              >
                📦 {line.bundleMode}
              </button>
            )
          ) : null}
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
        </div>
      </td>
    </tr>
  )
}
