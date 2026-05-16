/**
 * `usePageTitle()` 훅 — sales-polish-2-slice (Slice A) 신규.
 *
 * Designer `components.md` § 2.5 인용.
 *
 * 페이지 컴포넌트가 본 훅을 호출하면 AppLayout 헤더의 `<h2>` 가 즉시 갱신된다.
 * mount 시 set, unmount 시 cleanup (다음 페이지가 즉시 새 title set → 깜빡임 최소화).
 *
 * @example
 * ```tsx
 * // SalesListPage
 * usePageTitle('판매관리')
 *
 * // SlipDetailPage — slipNo bracket 동적
 * usePageTitle('출고전표 상세', slip?.slipNo)
 * ```
 *
 * @param title 화면명 (예: "출고전표 상세"). 빈 문자열 시 헤더가 "업무 화면" fallback.
 * @param meta 화면명 우측 bracket meta (예: slipNo). 미지정 시 표시 안 함.
 */
import { useEffect } from 'react'
import { usePageTitleStore } from '../stores/pageTitle'

export function usePageTitle(title: string, meta?: string): void {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  useEffect(() => {
    setPageTitle({ title, meta })
    return () => {
      setPageTitle({ title: '', meta: undefined })
    }
  }, [title, meta, setPageTitle])
}
