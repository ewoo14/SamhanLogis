/**
 * 미배차 슬립 react-query hook — Phase A FE-2.
 *
 * <p>`listUnDispatchedSlips` 의 react-query wrapper. 50/page 페이지네이션 + 상태 필터 +
 * 일자 범위 필터를 supports.
 *
 * `keepPreviousData` (placeholderData v5) 패턴 — 페이지 이동 시 깜빡임 없이
 * 새 데이터 도착할 때까지 직전 페이지 데이터를 노출.
 *
 * 5분 staleTime 은 글로벌 QueryClient 설정 (App.tsx) 이 적용된다.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  listUnDispatchedSlips,
  type ListUnDispatchedSlipsParams,
  type SlipBoardResponse,
} from '../../../api/dispatchBoard'
import type { PageResponse } from '../../../api/client'

/**
 * react-query keyPrefix — 배차 보드 관련 query 일괄 무효화 시 `['dispatchBoard']` 로 invalidate.
 */
export const DISPATCH_BOARD_QUERY_KEY = ['dispatchBoard'] as const

/**
 * 미배차 슬립 페이지 query.
 *
 * @param params 조회 파라미터 (from/to/statuses/page/size).
 * @return react-query result — `data` 는 `PageResponse<SlipBoardResponse>`.
 */
export function useUnDispatchedSlipsQuery(params: ListUnDispatchedSlipsParams) {
  return useQuery<PageResponse<SlipBoardResponse>>({
    queryKey: [...DISPATCH_BOARD_QUERY_KEY, 'undispatchedSlips', params],
    queryFn: () => listUnDispatchedSlips(params),
    placeholderData: keepPreviousData,
  })
}
