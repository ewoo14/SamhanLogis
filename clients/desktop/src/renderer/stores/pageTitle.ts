/**
 * 페이지 화면명 store — sales-polish-2-slice (Slice A) 신규.
 *
 * Designer `components.md` § 2.5 + `wireframes.md` § 1.2 충실 반영.
 * 사용자 피드백 #2 ("상단 '업무 화면' 고정") 해결.
 *
 * 라우트별로 다른 화면명을 헤더에 표시하기 위한 zustand store.
 * 각 페이지 컴포넌트가 `usePageTitle('판매관리')` 훅으로 set, AppLayout 헤더가 read.
 *
 * race condition 처리: 빈 title 시 AppHeader 가 "업무 화면" fallback 표시.
 */
import { create } from 'zustand'

interface PageTitleState {
  /** 현재 화면명 (예: "출고전표 상세"). 빈 문자열 시 fallback. */
  title: string
  /** 화면명 우측 bracket meta (예: slipNo "2026/05/04-1"). */
  meta: string | undefined
  /** 화면명 + meta 한 번에 set. */
  setPageTitle: (next: { title: string; meta?: string }) => void
}

/**
 * 페이지 화면명 store.
 *
 * @example
 * ```tsx
 * // SlipDetailPage.tsx
 * usePageTitle('출고전표 상세', slip?.slipNo)
 *
 * // AppLayout.tsx
 * const { title, meta } = usePageTitleStore()
 * ```
 */
export const usePageTitleStore = create<PageTitleState>((set) => ({
  title: '',
  meta: undefined,
  setPageTitle: (next) => set({ title: next.title, meta: next.meta }),
}))
