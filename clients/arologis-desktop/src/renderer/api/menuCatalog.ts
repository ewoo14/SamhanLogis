import { apiClient, type ApiEnvelope } from './client'

export interface MenuCatalogEntry {
  app: 'samhan-public' | 'arologis'
  category: string
  label: string
  route: string
  pageCode: string
  action: 'VIEW'
  visible: boolean
  order: number
}

/** auth-service 서버 정본을 gateway 경유로 조회한다. */
export async function fetchMenuCatalog(): Promise<MenuCatalogEntry[]> {
  const gatewayBase = (import.meta.env.VITE_VERSION_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
  const res = await apiClient.get<ApiEnvelope<MenuCatalogEntry[]>>(
    `${gatewayBase}/auth/admin/menu-catalog`,
  )
  return (res.data.data ?? []).filter((entry) => entry.visible && entry.app === 'arologis')
}
