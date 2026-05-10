import { forwardRef, type HTMLAttributes } from 'react'
import styles from './UrgencyBadge.module.css'

/**
 * 안전재고 긴급도 4단계 (P1-3 슬라이스).
 *
 * 재고 충족률(fillRate = currentQty / threshold × 100) 기준:
 * - CRITICAL : 0%       (currentQty = 0, 완전 소진)
 * - DANGER   : 1~49%   (임계 50% 미만)
 * - WARNING  : 50~79%  (임계 80% 미만)
 * - NOTICE   : 80~99%  (임계 미만이지만 여유 있음)
 */
export type UrgencyLevel = 'CRITICAL' | 'DANGER' | 'WARNING' | 'NOTICE'

/**
 * 긴급도 → 한국어 라벨 매핑.
 *
 * @internal
 */
const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  CRITICAL: '즉시 발주',
  DANGER:   '위험',
  WARNING:  '주의',
  NOTICE:   '관심',
}

export interface UrgencyBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 긴급도 단계. */
  level: UrgencyLevel
}

/**
 * UrgencyBadge — 안전재고 긴급도 4단계 시각 구분 Badge (P1-3).
 *
 * 색상 규약:
 * - CRITICAL : 짙은 빨강 (danger-700 계열)
 * - DANGER   : 빨강 (danger 계열)
 * - WARNING  : 주황/노랑 (warning 계열)
 * - NOTICE   : 파란색 (brand 계열)
 *
 * @example
 * ```tsx
 * <UrgencyBadge level="CRITICAL" />  // "즉시 발주"
 * <UrgencyBadge level="NOTICE" />    // "관심"
 * ```
 */
export const UrgencyBadge = forwardRef<HTMLSpanElement, UrgencyBadgeProps>(
  function UrgencyBadge({ level, className, ...rest }, ref) {
    const label = URGENCY_LABEL[level]
    const levelClass = styles[`level-${level.toLowerCase()}`]

    const classes = [styles['badge'], levelClass, className]
      .filter(Boolean)
      .join(' ')

    return (
      <span
        ref={ref}
        className={classes}
        data-urgency={level}
        {...rest}
      >
        {label}
      </span>
    )
  },
)

/**
 * 재고 충족률(fillRate)에 따라 UrgencyLevel 을 계산한다.
 *
 * @param currentQty 현재 가용 재고
 * @param threshold  안전재고 임계값 (0 이상; 0 이면 NOTICE 반환)
 * @returns UrgencyLevel
 */
export function calcUrgencyLevel(
  currentQty: number,
  threshold: number,
): UrgencyLevel {
  if (threshold <= 0) return 'NOTICE'
  const fillRate = (currentQty / threshold) * 100
  if (fillRate === 0) return 'CRITICAL'
  if (fillRate < 50)  return 'DANGER'
  if (fillRate < 80)  return 'WARNING'
  return 'NOTICE'
}

export default UrgencyBadge
