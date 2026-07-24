/**
 * usePermissions — 현재 로그인 사용자의 동적 RBAC 권한 매트릭스를 조회/캐시하는 hook.
 *
 * SP-D1 슬라이스. TanStack Query 로 30초 staleTime 캐시.
 * 로드 완료 후 permissionsApi.setPermissionsCache() 를 통해 동기 canAccess() 헬퍼에도 반영.
 *
 * 사용 패턴:
 * ```tsx
 * const { canAccess, isLoading } = usePermissions()
 * if (canAccess('ACCOUNTING')) { ... }
 * ```
 *
 * AppLayout, PermissionGuard 에서 중앙 사용. 컴포넌트당 재호출해도 캐시를 공유하므로
 * 네트워크 요청 중복 없음.
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchMyPermissions,
  normalizePermissionAction,
  setPermissionsCache,
  type MyPermission,
  type PageCode,
  type PermissionLookupAction,
} from '../api/permissionsApi'

export interface UsePermissionsResult {
  /** 권한 보유 여부 동기 확인. 로딩 중이면 false (보수적 deny). */
  canAccess: (pageCode: PageCode, action?: PermissionLookupAction) => boolean
  /** 현재 사용자 권한 목록. 로딩 중이면 undefined. */
  permissions: MyPermission[] | undefined
  /** 최초 로딩 중 여부. */
  isLoading: boolean
  /** 오류 발생 여부. */
  isError: boolean
}

/**
 * 현재 로그인 사용자 권한 목록 조회 + 30초 freshness.
 *
 * <p>MASTER 는 PERMISSION_MATRIX 포함 모든 페이지에 view+edit 이 허용됨.
 * BE 가 역할별 기본 매트릭스를 반환하므로 FE 추가 처리 불필요.
 */
export function usePermissions(): UsePermissionsResult {
  const query = useQuery({
    queryKey: ['permissions', 'my'],
    queryFn: fetchMyPermissions,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  // 캐시 갱신 — 동기 canAccess() 헬퍼를 위해 module-level 캐시에 반영.
  useEffect(() => {
    if (query.data) {
      setPermissionsCache(query.data)
    }
  }, [query.data])

  function canAccess(
    pageCode: PageCode,
    action: PermissionLookupAction = 'view',
  ): boolean {
    if (!query.data) return false // 로딩 중 — 보수적 deny (admin 메뉴 flash 방지)
    const entry = query.data.find((p) => p.pageCode === pageCode)
    if (!entry) return false
    return entry.actions.includes(normalizePermissionAction(action))
  }

  return {
    canAccess,
    permissions: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
