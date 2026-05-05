/**
 * 세션 상태 — 거래처 web app 전용 zustand store.
 *
 * <p>desktop `useSessionStore` 와 의도 동일하나 IPC 가 없으므로 sessionStorage 만 사용.
 *
 * <p>저장 항목:
 * - `auth` ({@link AuthSession}) — null 이면 미로그인 → AuthGuard 가 `/auth/login` 으로 리다이렉트
 * - `bootstrapped` — 첫 mount 직후 false → sessionStorage 읽기 직후 true
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md): partnerName / bizno 만 노출.
 */
import { create } from 'zustand'
import type { AuthSession } from '../types'
import { getStoredToken, setStoredToken } from '../api/client'
import { useDcConfigStore } from './dcConfigStore'

const SESSION_KEY = 'samhan.order.session'

interface SessionState {
  bootstrapped: boolean
  auth: AuthSession | null
  bootstrap: () => void
  setAuth: (auth: AuthSession) => void
  logout: () => void
}

function readPersistedAuth(): AuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    // token 도 sessionStorage 에 저장돼 있어야 axios 가 읽음 — 보강
    if (parsed.token && !getStoredToken()) {
      setStoredToken(parsed.token)
    }
    return parsed
  } catch {
    return null
  }
}

function writePersistedAuth(auth: AuthSession | null): void {
  try {
    if (auth) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth))
      setStoredToken(auth.token ?? null)
    } else {
      window.sessionStorage.removeItem(SESSION_KEY)
      setStoredToken(null)
    }
  } catch {
    /* ignore */
  }
}

export const useSessionStore = create<SessionState>((set) => ({
  bootstrapped: false,
  auth: null,
  bootstrap: () => {
    const auth = readPersistedAuth()
    set({ auth, bootstrapped: true })
    // 페이지 새로고침 후 DC config 자동 복원
    if (auth?.partnerCode) {
      void useDcConfigStore.getState().loadFor(auth.partnerCode).catch(() => {
        /* ignore */
      })
    }
  },
  setAuth: (auth) => {
    writePersistedAuth(auth)
    set({ auth })
  },
  logout: () => {
    writePersistedAuth(null)
    useDcConfigStore.getState().clear()
    set({ auth: null })
  },
}))
