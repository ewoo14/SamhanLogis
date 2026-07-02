/**
 * 컬렉션(목록) 라이브 동기화 공통 훅 (E2 기둥1).
 *
 * <p>도메인 realtime client 를 구독해 변경 이벤트 수신 시 지정 queryKey 를 invalidate 한다.
 * mock 모드에서는 SSE 서버가 없으므로 구독하지 않고, 언마운트 시 AbortController 로 정리한다.
 */
import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { isMockMode } from '../api/mock'
import type { RealtimeClient } from './createRealtimeClient'

export function useCollectionRealtime(
  client: RealtimeClient,
  entityIdSentinel: string,
  queryKeys: QueryKey[],
): void {
  const queryClient = useQueryClient()
  const stableQueryKeys = JSON.stringify(queryKeys)

  useEffect(() => {
    if (isMockMode()) return
    const ctrl = client.subscribe(entityIdSentinel, () => {
      queryKeys.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey })
      })
    })
    return () => ctrl.abort()
  }, [client, entityIdSentinel, queryClient, stableQueryKeys])
}
