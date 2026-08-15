import axios, { type AxiosInstance } from 'axios'
import type { ApiEnvelope } from './client'
import { useAuthStore } from '../stores/authStore'

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

const gatewayBase = (import.meta.env.VITE_VERSION_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

/**
 * auth-service catalog 전용 gateway client.
 *
 * gateway 응답의 401은 아로로지스-service 세션의 401이 아니므로, 아로로지스
 * API client의 refresh/logout 인터셉터와 분리한다. catalog 실패는 호출자에서
 * fail-closed로 처리하고 현재 세션은 보존한다.
 */
export const menuCatalogClient: AxiosInstance = axios.create({
  baseURL: gatewayBase,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

menuCatalogClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().getAccessToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

/** auth-service 서버 정본을 gateway 경유로 조회한다. */
export async function fetchMenuCatalog(): Promise<MenuCatalogEntry[]> {
  const res = await menuCatalogClient.get<ApiEnvelope<MenuCatalogEntry[]>>('/auth/admin/menu-catalog')
  return (res.data.data ?? []).filter((entry) => entry.visible && entry.app === 'arologis')
}
