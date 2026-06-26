/**
 * 플랫폼 무관 인증 추상화 (모바일 에픽 슬1 foundation).
 *
 * 데스크탑 Electron 렌더러를 **웹 브라우저로도** 구동하기 위해, 인증 경로를
 * 플랫폼별 구현으로 추상화한다.
 * - Electron: 기존 `window.samhanAuth` IPC + Bearer 헤더 (electron-store 암호화 저장).
 * - Capacitor: 네이티브 WebView + Bearer 헤더 (@capacitor/preferences 저장).
 * - Web: httpOnly 쿠키 (브라우저 자동 전송) + `GET /auth/me` bootstrap.
 *
 * 런타임에 `window.samhanAuth` 존재 여부로 플랫폼을 판정해 구현체를 1회 선택한다.
 * Electron 은 항상 preload 가 존재하므로 electronProvider 가 선택되어 **무회귀**가 보장된다.
 *
 * @see ./electronAuthProvider
 * @see ./capacitorAuthProvider
 * @see ./webAuthProvider
 */
import { Capacitor } from '@capacitor/core'
import type { LoginResponse } from '../api/auth'
import type { AuthGroupItem } from '../types/electron'
import { createCapacitorAuthProvider } from './capacitorAuthProvider'
import { createElectronAuthProvider } from './electronAuthProvider'
import { createWebAuthProvider } from './webAuthProvider'

/**
 * 토큰을 제외한 세션 식별정보.
 *
 * 협업 헤더(X-User-Id / X-User-Name), 권한 UI 분기(권한그룹), 결재 작성
 * requesterId 본문 등에 사용한다. 원시 JWT 는 포함하지 않는다 — 웹(httpOnly 쿠키)
 * 환경에서는 JS 가 토큰을 읽을 수 없기 때문이다.
 */
export interface SessionInfo {
  userId: string
  role: string
  fullName: string
  partnerCode?: string
  /** Phase C5-3 권한 그룹 목록 (id 는 내부 비교 전용, 화면 미노출). */
  groups?: AuthGroupItem[]
}

/**
 * 플랫폼별 인증 동작 계약.
 *
 * - {@link getSession} — 현재 세션 식별정보(없으면 null).
 * - {@link getAuthHeaders} — HTTP 요청에 붙일 인증 헤더. Electron=`Authorization: Bearer`,
 *   Capacitor=`Authorization: Bearer`, Web=`{}`(쿠키 자동 전송).
 * - {@link establishSession} — 로그인 성공 처리. Electron=IPC 저장, Web=식별정보 캐시(쿠키는 Set-Cookie 자동).
 * - {@link clearSession} — 로그아웃. Electron=IPC clear, Web=`POST /auth/logout`(쿠키 만료).
 * - {@link bootstrap} — 부팅 시 세션 복원. Electron=IPC 조회, Web=`GET /auth/me`(쿠키).
 */
export interface AuthProvider {
  getSession(): Promise<SessionInfo | null>
  getAuthHeaders(): Promise<Record<string, string>>
  establishSession(login: LoginResponse): Promise<void>
  clearSession(): Promise<void>
  bootstrap(): Promise<SessionInfo | null>
}

/**
 * Electron 플랫폼 여부 — preload 가 노출한 `window.samhanAuth.getToken` 존재로 판정.
 * 웹 브라우저에는 preload 가 없어 `false`.
 */
export const isElectronPlatform: boolean =
  typeof window !== 'undefined'
  && typeof window.samhanAuth?.getToken === 'function'

/**
 * Capacitor 네이티브 플랫폼 여부 — @capacitor/core 런타임 감지.
 * Electron 은 preload 가 우선하므로 provider 선택 시 Electron 다음 순서로 사용한다.
 */
export const isCapacitorPlatform: boolean =
  typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()

let cachedProvider: AuthProvider | null = null

/**
 * 플랫폼에 맞는 단일 {@link AuthProvider} 를 반환한다(최초 1회 생성·캐시).
 *
 * api/client 인터셉터·session store·collab 헤더 등 모든 인증 소비처는 본 함수를
 * 통해 provider 를 얻는다(`window.samhanAuth` 직접 호출 금지).
 */
export function getAuthProvider(): AuthProvider {
  if (cachedProvider) return cachedProvider
  cachedProvider = isElectronPlatform
    ? createElectronAuthProvider()
    : isCapacitorPlatform
      ? createCapacitorAuthProvider()
      : createWebAuthProvider()
  return cachedProvider
}
