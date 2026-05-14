/**
 * ProtectedRoute — 미인증 시 `/login` 강제 리다이렉트.
 *
 * 부팅 직후 (`bootstrapped=false`) 에는 splash 텍스트를 노출하여
 * 메인 프로세스의 토큰 IPC 조회가 끝나기 전 라우팅이 흔들리지 않도록 한다.
 */
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface Props {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: Props): JSX.Element {
  const bootstrapped = useAuthStore((s) => s.bootstrapped)
  const auth = useAuthStore((s) => s.auth)

  if (!bootstrapped) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        세션 확인 중…
      </div>
    )
  }

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
