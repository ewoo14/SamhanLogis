/**
 * LoginPage — 아로로지스 admin 로그인 (loginId + password, D-AX-07).
 *
 * 흐름:
 * 1) 사용자가 loginId / password 입력 후 submit.
 * 2) `adminLogin(loginId, password)` 호출 → AuthLoginResponse.
 * 3) `fetchMe()` 로 userId / loginId / fullName 보조 정보 조회.
 * 4) `useAuthStore.setAuth(...)` 로 메인 프로세스 영속 + 렌더러 캐시 갱신.
 * 5) `/dispatches` 로 navigate.
 *
 * 에러:
 * - 401 → "아이디 또는 비밀번호가 올바르지 않습니다."
 * - 422 → 서버 메시지 표시 (validation)
 * - 그 외 → "로그인 중 오류가 발생했습니다."
 *
 * UUID 비공개 — `userId` (UUID) 는 메인 프로세스 토큰에만 저장하고 화면 표시 X.
 */
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { adminLogin, fetchMe } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-bg)',
}

const cardStyle: React.CSSProperties = {
  width: 360,
  padding: 32,
  background: 'var(--color-surface)',
  borderRadius: 8,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 'var(--font-size-base)',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 'var(--font-size-base)',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 'var(--font-size-base)',
}

const errorStyle: React.CSSProperties = {
  color: 'var(--color-danger)',
  fontSize: 'var(--font-size-base)',
  margin: 0,
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const tokens = await adminLogin(loginId.trim(), password)
      // /auth/me 호출 시 새 토큰을 즉시 사용하려면 store 에 임시로 넣는다.
      await setAuth({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        role: tokens.role,
        userId: '',
        loginId: loginId.trim(),
        fullName: '',
        expiresAt: tokens.expiresAt,
      })
      const me = await fetchMe()
      const profileLoginId = me.loginId ?? tokens.loginId ?? loginId.trim()
      const profileFullName = me.fullName ?? tokens.fullName ?? profileLoginId
      await setAuth({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        role: me.role,
        userId: me.userId,
        loginId: profileLoginId,
        fullName: profileFullName,
        expiresAt: tokens.expiresAt,
      })
      navigate('/dispatches', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 401) {
          setError('아이디 또는 비밀번호가 올바르지 않습니다.')
        } else if (status === 422) {
          const message =
            (err.response?.data as { message?: string })?.message
            ?? '입력값을 확인해 주세요.'
          setError(message)
        } else {
          setError('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
        }
      } else {
        setError('로그인 중 오류가 발생했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={containerStyle}>
      <form style={cardStyle} onSubmit={handleSubmit} aria-label="아로로지스 로그인">
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', textAlign: 'center' }}>
          아로로지스
        </h1>
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-muted)',
            textAlign: 'center',
            fontSize: 'var(--font-size-base)',
          }}
        >
          관리자 로그인
        </p>
        <label style={labelStyle}>
          <span>아이디</span>
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            required
            style={inputStyle}
            data-testid="login-id-input"
          />
        </label>
        <label style={labelStyle}>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
            data-testid="login-password-input"
          />
        </label>
        {error && (
          <p role="alert" data-testid="login-error" style={errorStyle}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            ...buttonStyle,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
          data-testid="login-submit"
        >
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
