/**
 * 아로로지스 BE 호출 axios 인스턴스 + 공통 인터셉터.
 *
 * 인터셉터 동작:
 * 1) 요청 — `useAuthStore.getState().auth.accessToken` 또는 메인 프로세스 IPC 로
 *    JWT 를 가져와 `Authorization: Bearer ...` 헤더에 주입한다.
 *    (zustand 캐시 우선 — 동기 + 빠른 경로, 캐시 미스 시 IPC fallback).
 * 2) 응답 — 401 발생 시 refreshToken 으로 자동 rotation 시도. 실패 시 토큰 클리어 +
 *    hash 라우팅으로 `#/login` 강제 리다이렉트.
 *
 * baseURL 은 `VITE_AROLOGIS_API_BASE` (없으면 localhost:8097 fallback) 를 사용한다.
 *
 * arologis-service 는 api-gateway 를 우회하여 직접 노출되므로 (`api.arologis.samhan-air.com`
 * → arologis-service:8097), JWT 검증은 arologis-service 자체 JwtFilter 가 담당.
 */
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore } from '../stores/authStore'

const BASE_URL =
  import.meta.env.VITE_AROLOGIS_API_BASE ?? 'http://localhost:8097'

/**
 * 앱 전역 단일 axios 인스턴스. 도메인별 API 모듈 (auth / arologis / driver 등) 이
 * 이 인스턴스를 import 해 사용한다.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 1순위 — zustand 캐시 (동기, 매 요청 비용 0).
    let token = useAuthStore.getState().getAccessToken()
    // 2순위 — IPC 조회 (앱 부팅 직후 등 캐시 미스).
    if (!token) {
      try {
        const snapshot = await window.arologisAuth.getToken()
        token = snapshot?.accessToken ?? null
      } catch (err) {
        console.error('[arologis-api] 토큰 IPC 조회 실패', err)
      }
    }
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  },
)

/**
 * refresh 동시 호출 가드 — 여러 요청이 동시에 401 을 받아도 refresh 는 1번만 발사.
 */
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const auth = useAuthStore.getState().auth
    if (!auth?.refreshToken) return null
    try {
      const res = await axios.post<{
        accessToken: string
        refreshToken: string
        role: string
        expiresAt: string
        loginId?: string | null
        fullName?: string | null
        driverCode?: string | null
        phoneNumber?: string | null
      }>(`${BASE_URL}/auth/refresh`, { refreshToken: auth.refreshToken })
      const next = res.data
      await useAuthStore.getState().setAuth({
        ...auth,
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        role: next.role,
        loginId: next.loginId ?? next.driverCode ?? auth.loginId,
        fullName: next.fullName ?? auth.fullName,
        expiresAt: next.expiresAt,
      })
      return next.accessToken
    } catch (err) {
      console.error('[arologis-api] refresh 실패', err)
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (err: unknown) => {
    if (
      axios.isAxiosError(err)
      && err.response?.status === 401
      && err.config
    ) {
      const cfg = err.config as InternalAxiosRequestConfig & { __isRetry?: boolean }
      // refresh endpoint 자체에서 401 이 떨어진 경우는 재시도 금지.
      if (cfg.url?.includes('/auth/refresh') || cfg.url?.includes('/auth/admin/login')) {
        await useAuthStore.getState().logout()
        if (typeof window !== 'undefined') window.location.hash = '#/login'
        return Promise.reject(err)
      }
      if (cfg.__isRetry) {
        await useAuthStore.getState().logout()
        if (typeof window !== 'undefined') window.location.hash = '#/login'
        return Promise.reject(err)
      }
      const nextToken = await refreshAccessToken()
      if (!nextToken) {
        await useAuthStore.getState().logout()
        if (typeof window !== 'undefined') window.location.hash = '#/login'
        return Promise.reject(err)
      }
      cfg.__isRetry = true
      cfg.headers.set('Authorization', `Bearer ${nextToken}`)
      return apiClient(cfg)
    }
    return Promise.reject(err)
  },
)

/**
 * BE 가 응답을 감싸는 표준 envelope (있는 경우).
 *
 * 아로로지스 auth endpoint 는 envelope 없이 raw 객체로 응답한다 (spec §6.2).
 * 다른 endpoint 는 BE 가 envelope 적용 여부에 따라 분기.
 */
export interface ApiEnvelope<T> {
  success: boolean
  code: string
  message: string
  data: T
  timestamp: string
}
