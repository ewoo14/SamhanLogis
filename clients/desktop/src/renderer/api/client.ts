/**
 * 모든 BE 호출에 사용되는 axios 인스턴스 + 공통 인터셉터.
 *
 * 인터셉터 동작:
 * 1) 요청 — `window.samhanAuth.getToken()` 으로 메인 프로세스에서 JWT 를
 *    가져와 `Authorization: Bearer ...` 헤더에 주입한다.
 *    파트너 자기범위 키인 `X-Partner-Code` 는 게이트웨이가 JWT claim 에서 권위 주입한다.
 * 2) 응답 — 401 발생 시 토큰을 즉시 클리어하고 hash 라우팅으로
 *    `#/login` 에 강제 리다이렉트한다.
 *
 * baseURL 은 `VITE_API_BASE_URL` (없으면 api-gateway 기본 8080) 을 사용한다.
 */
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getMockResponse, isMockMode } from './mock'

interface MockHttpResponse {
  __mockStatus: number
  body: unknown
}

function isMockHttpResponse(value: unknown): value is MockHttpResponse {
  return typeof value === 'object'
    && value !== null
    && '__mockStatus' in value
    && 'body' in value
}

const BASE_URL =
  import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080'

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
    }
    try {
      const auth = await window.samhanAuth.getToken()
      if (auth?.token) {
        config.headers.set('Authorization', `Bearer ${auth.token}`)
      }
    } catch (err) {
      // IPC 실패는 치명적 — 다음 단계 axios 가 401/네트워크 오류로 핸들.
      console.error('[apiClient] 토큰 조회 IPC 실패', err)
    }
    return config
  },
)

apiClient.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      try {
        await window.samhanAuth.clearToken()
      } catch (clearErr) {
        console.error('[apiClient] 401 후 토큰 클리어 실패', clearErr)
      }
      // HashRouter 사용 — file:// 환경 호환.
      if (typeof window !== 'undefined') {
        window.location.hash = '#/login'
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
