import { useQuery } from '@tanstack/react-query'
import { fetchMenuCatalog, type MenuCatalogEntry } from '../api/permissionsApi'

export interface UseMenuCatalogResult {
  menus: MenuCatalogEntry[] | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

/** 서버 catalog를 단일 캐시로 공유한다. 조회 실패 시 메뉴는 fail-closed다. */
export function useMenuCatalog(): UseMenuCatalogResult {
  const query = useQuery({
    queryKey: ['menu-catalog'],
    queryFn: fetchMenuCatalog,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  return {
    menus: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: async () => { await query.refetch() },
  }
}
