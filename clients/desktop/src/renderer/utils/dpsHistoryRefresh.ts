import type { QueryClient } from '@tanstack/react-query'

/** DPS 저장 성공 뒤 저장내역 목록의 현재/예정 query를 함께 새로 읽는다. */
export function refreshDpsHistoryQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: ['dps-history-list', 'DPS_COMPARE'],
  })
}
