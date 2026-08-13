/**
 * 모든 BE 호출에 사용되는 axios 인스턴스 + 공통 인터셉터.
 *
 * 인터셉터 동작:
 * 1) 요청 — 플랫폼별 authProvider 에서 인증 헤더를 가져와 병합한다.
 *    native(Electron/Capacitor)는 Bearer, 웹은 httpOnly 쿠키 전송을 위해 withCredentials 를 사용한다.
 *    파트너 자기범위 키인 `X-Partner-Code` 는 게이트웨이가 JWT claim 에서 권위 주입한다.
 * 2) 응답 — 보호 리소스 401 발생 시 토큰을 즉시 클리어하고 로그인으로 유도한다.
 *    단, 인증 프로브/인증 엔드포인트 401 은 호출자가 직접 처리한다.
 *
 * baseURL 은 `VITE_API_BASE_URL` (없으면 api-gateway 기본 8080) 을 사용한다.
 */
import axios, {
  type AxiosRequestConfig,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getMockResponse, isMockMode } from './mock'
import { getAuthProvider, isCapacitorPlatform, isElectronPlatform } from '../auth/authProvider'
import { useSessionStore } from '../stores/session'

interface MockHttpResponse {
  __mockStatus: number
  body: unknown
}

export type ApiRequestConfig = AxiosRequestConfig & {
  /** Public endpoint 요청 — 인증 헤더 조회/첨부를 건너뛴다. */
  skipAuth?: boolean
}

function isMockHttpResponse(value: unknown): value is MockHttpResponse {
  return typeof value === 'object'
    && value !== null
    && '__mockStatus' in value
    && 'body' in value
}

const BASE_URL =
  import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080'

const isNativePlatform = isElectronPlatform || isCapacitorPlatform

const AUTH_ENDPOINT_401_HANDLED_BY_CALLER = /\/auth\/(me|login|logout)\/?$/

function isAuthEndpoint401HandledByCaller(requestUrl: string): boolean {
  return AUTH_ENDPOINT_401_HANDLED_BY_CALLER.test(requestUrl)
    || requestUrl.includes('/auth/password-reset/')
}

/**
 * 앱 전역 단일 axios 인스턴스. 도메인별 API 모듈(auth/inventory/slip) 이
 * 이 인스턴스를 import 해 사용한다.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // dev-only mock 모드 — VITE_MOCK_MODE=1 시 백엔드 호출을 fixture 로 대체 (PR #18 자동 캡처용).
    if (isMockMode()) {
      const mock = getMockResponse(config)
      if (mock !== null) {
        const status = isMockHttpResponse(mock) ? mock.__mockStatus : 200
        config.adapter = async () => {
          const response = {
            data: isMockHttpResponse(mock) ? mock.body : mock,
            status,
            statusText: status >= 400 ? 'Mock Error' : 'OK',
            headers: {},
            config,
            request: {},
          }
          if (status >= 400) {
            throw new axios.AxiosError('Mock Error', undefined, config, {}, response)
          }
          return response
        }
        return config
      }
      throw new Error(
        `Mock handler not found: ${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`,
      )
    }
    if ((config as InternalAxiosRequestConfig & { skipAuth?: boolean }).skipAuth) {
      config.withCredentials = false
      return config
    }
    try {
      config.withCredentials = !isNativePlatform
      const headers = await getAuthProvider().getAuthHeaders()
      for (const [key, value] of Object.entries(headers)) {
        config.headers.set(key, value)
      }
    } catch (err) {
      // 인증 provider 실패는 다음 단계 axios 가 401/네트워크 오류로 핸들한다.
      console.error('[apiClient] 인증 헤더 조회 실패', err)
    }
    return config
  },
)

apiClient.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      const requestUrl = err.config?.url ?? ''
      // 인증 프로브/인증 엔드포인트 401 은 호출자가 처리한다(부팅 리로드 루프 방지).
      if (isAuthEndpoint401HandledByCaller(requestUrl)) {
        return Promise.reject(err)
      }

      try {
        // 401 은 native 세션 경계다. clearAuthState() 가 provider 세션과
        // QueryClient 및 모듈 전역 권한 캐시를 함께 폐기한다.
        await useSessionStore.getState().clearAuthState()
      } catch (clearErr) {
        console.error('[apiClient] 401 후 세션 클리어 실패', clearErr)
      }
      // native 는 HashRouter, 웹은 BrowserRouter 기준으로 로그인 경로를 분기한다.
      if (typeof window !== 'undefined') {
        if (isNativePlatform) {
          window.location.hash = '#/login'
        } else {
          window.location.replace('/login')
        }
      }
    }
    return Promise.reject(err)
  },
)

/**
 * BE 가 모든 응답을 감싸는 표준 envelope.
 * `services/.../shared/common/dto/ApiResponse.java` 와 동일.
 */
export interface ApiEnvelope<T> {
  success: boolean
  code: string
  message: string
  data: T
  timestamp: string
}

/**
 * Spring Data Page 응답 형태 — slip 목록 등에 사용.
 */
export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  first: boolean
  last: boolean
}
