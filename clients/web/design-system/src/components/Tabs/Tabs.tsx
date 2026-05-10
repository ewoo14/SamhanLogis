/**
 * 범용 Tabs 컴포넌트 — tablist + tabpanel ARIA 패턴.
 *
 * <p>P0-6 거래처 4탭 등록/조회 UI 에서 첫 사용. 향후 모든 탭 UI 에 공통 사용 예정.
 *
 * <ul>
 *   <li>keyboard: ArrowLeft / ArrowRight 탭 이동, Home / End 처음/끝 이동</li>
 *   <li>라벨은 반드시 한국어 string 또는 ReactNode</li>
 *   <li>disabled 탭 — 표시되지만 키보드/마우스 이동 불가</li>
 * </ul>
 *
 * @example
 * ```tsx
 * const PARTNER_TABS = ['기본정보', '단가/할인', '배송지', '담당자'] as const
 * <Tabs tabs={PARTNER_TABS} activeIndex={tab} onTabChange={setTab}>
 *   <div>기본정보 패널</div>
 *   <div>단가/할인 패널</div>
 *   <div>배송지 패널</div>
 *   <div>담당자 패널</div>
 * </Tabs>
 * ```
 */
import {
  useCallback,
  useId,
  useRef,
  Children,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import styles from './Tabs.module.css'

export interface TabItem {
  /** 탭 라벨 (한국어). */
  label: ReactNode
  /** 탭 비활성화 여부. */
  disabled?: boolean
  /** QA / 테스트용 data-testid. */
  testId?: string
}

export interface TabsProps {
  /**
   * 탭 라벨 배열. string[] 또는 TabItem[] 모두 허용.
   * string 은 자동으로 { label: string } 로 변환.
   */
  tabs: readonly (string | TabItem)[]
  /** 현재 활성 탭 인덱스 (0-based). */
  activeIndex: number
  /** 탭 변경 콜백. */
  onTabChange: (index: number) => void
  /** tabpanel 영역에 렌더할 자식들. 탭 순서와 1:1 매칭. */
  children?: ReactNode
  /** 추가 className (tablist 래퍼에 적용). */
  className?: string
  /** aria-label (tablist). 기본 "탭". */
  ariaLabel?: string
}

function toTabItem(t: string | TabItem): TabItem {
  return typeof t === 'string' ? { label: t } : t
}

/**
 * 범용 Tabs 컴포넌트.
 *
 * @param props tabs / activeIndex / onTabChange / children
 */
export function Tabs({
  tabs,
  activeIndex,
  onTabChange,
  children,
  className,
  ariaLabel = '탭',
}: TabsProps) {
  const uid = useId()
  const tablistRef = useRef<HTMLDivElement | null>(null)

  const normalizedTabs = tabs.map(toTabItem)
  const childArray = Children.toArray(children)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const enabled = normalizedTabs
        .map((t, i) => ({ ...t, i }))
        .filter((t) => !t.disabled)

      const currentEnabledIdx = enabled.findIndex((t) => t.i === activeIndex)

      let next: number | undefined

      if (e.key === 'ArrowRight') {
        next = enabled[(currentEnabledIdx + 1) % enabled.length]?.i
      } else if (e.key === 'ArrowLeft') {
        next =
          enabled[(currentEnabledIdx - 1 + enabled.length) % enabled.length]
            ?.i
      } else if (e.key === 'Home') {
        next = enabled[0]?.i
      } else if (e.key === 'End') {
        next = enabled[enabled.length - 1]?.i
      }

      if (next !== undefined) {
        e.preventDefault()
        onTabChange(next)
        // 포커스 이동
        const btn = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="tab"]',
        )[next]
        btn?.focus()
      }
    },
    [normalizedTabs, activeIndex, onTabChange],
  )

  return (
    <div className={[styles['root'], className].filter(Boolean).join(' ')}>
      {/* tablist */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={ariaLabel}
        className={styles['tablist']}
        onKeyDown={handleKeyDown}
      >
        {normalizedTabs.map((tab, i) => {
          const isActive = i === activeIndex
          const isDisabled = tab.disabled ?? false
          return (
            <button
              key={i}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-selected={isActive}
              aria-controls={`${uid}-panel-${i}`}
              aria-disabled={isDisabled || undefined}
              tabIndex={isActive ? 0 : -1}
              disabled={isDisabled}
              data-testid={tab.testId}
              className={[
                styles['tab'],
                isActive ? styles['tabActive'] : null,
                isDisabled ? styles['tabDisabled'] : null,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (!isDisabled) onTabChange(i)
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* tabpanels */}
      {normalizedTabs.map((_, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${uid}-panel-${i}`}
          aria-labelledby={`${uid}-tab-${i}`}
          hidden={i !== activeIndex}
          className={styles['panel']}
        >
          {childArray[i]}
        </div>
      ))}
    </div>
  )
}

export default Tabs
