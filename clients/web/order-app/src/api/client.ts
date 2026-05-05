/**
 * 거래처 web app 의 모든 BE 호출에 사용되는 axios 인스턴스.
 *
 * <p>desktop 의 `apiClient` 와 동일한 envelope 패턴을 유지하되,
 * Electron IPC 가 없으므로 토큰은 sessionStorage 에 저장한다.
 *
 * <p>인터셉터:
 * - 요청: sessionStorage `samhan.order.token` → `Authorization: Bearer ...`
 * - 응답: 401 → 토큰 클리어 + `/auth/login` 강제 리다이렉트
 *
 * <p>baseURL: `VITE_API_BASE_URL` (없으면 api-gateway 기본 8080).
 */
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'

const BASE_URL =
  import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080'

const TOKEN_KEY = 'samhan.order.token'

export function getStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private 모드 등 — 무시 */
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken()
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  },
)

apiClient.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      setStoredToken(null)
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login'
      }
    }
    return Promise.reject(err)
  },
)

/** BE envelope (desktop 과 동일). */
export interface ApiEnvelope<T> {
  success: boolean
  code: string
  message: string
  data: T
  timestamp: string
}

/** Spring Data Page 응답. */
export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  first: boolean
  last: boolean
}
