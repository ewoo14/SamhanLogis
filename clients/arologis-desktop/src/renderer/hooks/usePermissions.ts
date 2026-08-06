/**
 * 현재 로그인 사용자의 아로로지스 page-code 권한 조회 hook.
 *
 * TanStack Query 5분 캐시를 사용하고, 현재 query data 로 `canAccess()` 를 fail-closed 판정한다.
 * 조회 실패는 권한 없음과 구분할 수 있도록 상태와 재조회 함수를 함께 반환한다.
 */
import { useQuery } from '@tanstack/react-query'
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
  const query = useQuery({
    queryKey: ['permissions', 'my'],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

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
