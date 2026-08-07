/**
 * 현재 로그인 사용자의 아로로지스 page-code 권한 조회 hook.
 *
 * TanStack Query 5분 캐시를 사용하고, 현재 query data 로 `canAccess()` 를 fail-closed 판정한다.
 * 조회 실패는 권한 없음과 구분할 수 있도록 상태와 재조회 함수를 함께 반환한다.
 */
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  canAccess as canAccessPermission,
  fetchMyPermissions,
  type MyPermission,
  type PageCode,
  type PermissionLookupAction,
} from '../api/permissions'

export interface UsePermissionsResult {
  canAccess: (pageCode: PageCode, action?: PermissionLookupAction) => boolean
  permissions: MyPermission[] | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

export function usePermissions(): UsePermissionsResult {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['permissions', 'my'],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  // TanStack Query 5는 기본적으로 visibilitychange만 구독하므로 Electron 창 포커스 복귀도
  // 권한 쿼리에만 적용한다. stale 상태에서만 재조회해 S6 이전의 freshness 계약을 유지한다.
  useEffect(() => {
    const refetchStalePermissions = () => {
      if (queryClient.isFetching({ queryKey: ['permissions', 'my'] }) > 0) return
      const permissionsQuery = queryClient.getQueryCache().find({ queryKey: ['permissions', 'my'] })
      if (permissionsQuery?.isStaleByTime(5 * 60 * 1000)) {
        void queryClient.refetchQueries({ queryKey: ['permissions', 'my'], type: 'active' })
      }
    }

    window.addEventListener('focus', refetchStalePermissions)
    return () => window.removeEventListener('focus', refetchStalePermissions)
  }, [queryClient])

  function canAccess(
    pageCode: PageCode,
    action: PermissionLookupAction = 'view',
  ): boolean {
    return canAccessPermission(query.data, pageCode, action)
  }

  return {
    canAccess,
    permissions: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: async () => { await query.refetch() },
  }
}
