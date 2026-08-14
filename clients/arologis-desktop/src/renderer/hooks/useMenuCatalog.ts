import { useQuery } from '@tanstack/react-query'
import { fetchMenuCatalog, type MenuCatalogEntry } from '../api/menuCatalog'

export interface UseMenuCatalogResult {
  menus: MenuCatalogEntry[] | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

/** 아로로지스 앱의 서버 catalog를 fail-closed로 캐시한다. */
export function useMenuCatalog(): UseMenuCatalogResult {
  const query = useQuery({
    queryKey: ['menu-catalog', 'arologis'],
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
