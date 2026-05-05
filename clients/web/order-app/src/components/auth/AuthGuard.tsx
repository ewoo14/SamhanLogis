/**
 * 인증 가드 — 미로그인 시 `/auth/login` 으로 강제 이동.
 *
 * <p>desktop `AuthGuard` 와 의도 동일. session bootstrap 완료 (sessionStorage 읽기) 전에는
 * 로딩 페이지 표시 (legacy `#pageLoading` 의 🕒 box).
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessionStore } from '../../stores/session'

interface Props {
  children: ReactNode
}

export function AuthGuard({ children }: Props) {
  const bootstrapped = useSessionStore((s) => s.bootstrapped)
  const auth = useSessionStore((s) => s.auth)

  if (!bootstrapped) {
    return (
      <div className="page-gate">
        <div className="biz-box">
          <div className="page-loading-emoji">🕒</div>
          <div className="page-loading-msg">데이터를 불러오는 중입니다.{'\n'}잠시만 기다려주세요.</div>
        </div>
      </div>
    )
  }

  if (!auth || auth.status !== 'OK') {
    return <Navigate to="/auth/login" replace />
  }

  return <>{children}</>
}
