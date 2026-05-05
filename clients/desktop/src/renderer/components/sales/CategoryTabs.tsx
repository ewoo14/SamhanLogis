/**
 * 견적서 카테고리 탭 — legacy estimate 의 [홈멀티][싱글세트][상업멀티][구형] 4 카테고리
 * + 추가 LEGACY/OTHER. legacy 의 `body.{cat}-active` className toggle 효과를 React 로
 * 옮긴다.
 *
 * <p>v2 정정 §정정 1 — 품목 0건 시 카테고리 탭 미표시. counts 가 모두 0 이면 컴포넌트
 * 자체를 null 렌더링하고, 일부만 0 이면 라인이 있는 카테고리만 탭 노출.
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
  /**
   * 표시할 카테고리 화이트리스트 (명시 시 화이트리스트만 노출).
   * 미지정 시 counts 가 0 보다 큰 카테고리만 자동 노출 (v2 §정정 1).
   */
  visibleCategories?: EstimateCategory[]
}

const ALL_CATS: EstimateCategory[] = [
  'HOME_MULTI',
  'SINGLE_SET',
  'COMMERCIAL_MULTI',
  'LEGACY',
  'OTHER',
]

export function CategoryTabs({ value, onChange, counts, visibleCategories }: Props) {
  // v2 §정정 1 — 라인 분포 기반 동적 렌더링.
  // visibleCategories 명시 시 그대로 사용 (legacy 화면 내부 강제 노출 케이스).
  // 미명시 시 counts 가 0 초과인 카테고리만 노출. counts 자체가 없으면 빈 배열.
  const cats =
    visibleCategories ??
    (counts ? ALL_CATS.filter((c) => (counts[c] ?? 0) > 0) : [])

  if (cats.length === 0) {
    // 라인 0건 — 탭 자체 미표시 (v2 §정정 1).
    return null
  }

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
