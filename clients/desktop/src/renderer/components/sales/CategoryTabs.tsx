/**
 * 견적서 카테고리 탭 — legacy estimate 의 [홈멀티][싱글세트][상업멀티][구형] 4 카테고리
 * + 추가 LEGACY/OTHER. legacy 의 `body.{cat}-active` className toggle 효과를 React 로
 * 옮긴다.
 *
 * <p>F1 (a) 100% 보존 가드 — DS 컴포넌트 import 금지, sales.module.css 의 token 만 사용.
 */
import type { EstimateCategory } from '../../api/sales'
import { ESTIMATE_CATEGORY_LABEL } from '../../api/sales'
import styles from './sales.module.css'

interface Props {
  value: EstimateCategory
  onChange: (cat: EstimateCategory) => void
  /** 카테고리별 라인 수 — badge 표시 source. */
  counts?: Record<EstimateCategory, number>
  /** 표시할 카테고리 화이트리스트 (없으면 4종 노출, OTHER 숨김). */
  visibleCategories?: EstimateCategory[]
}

const DEFAULT_VISIBLE: EstimateCategory[] = [
  'HOME_MULTI',
  'SINGLE_SET',
  'COMMERCIAL_MULTI',
  'LEGACY',
]

export function CategoryTabs({ value, onChange, counts, visibleCategories }: Props) {
  const cats = visibleCategories ?? DEFAULT_VISIBLE
  return (
    <div className={styles['topActions']} role="tablist" aria-label="카테고리 탭">
      {cats.map((cat) => {
        const isActive = value === cat
        const count = counts?.[cat] ?? 0
        return (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? styles['catBtnActive'] : styles['catBtn']}
            onClick={() => onChange(cat)}
          >
            {ESTIMATE_CATEGORY_LABEL[cat]}
            {count > 0 ? <span className={styles['badge']}>{count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
