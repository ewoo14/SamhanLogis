/**
 * 로그인 화면 — 디자인 시스템 `Card` + `FormField` + `Input` + `Button` 사용.
 *
 * 흐름:
 * 1) 사용자가 loginId/password 입력
 * 2) `useMutation` 으로 `POST /auth/login` 호출
 * 3) 성공 시 플랫폼별 authProvider 에 세션 반영 +
 *    렌더러 세션 store 갱신 → `/` 로 navigate
 * 4) 실패 시 카드 안에 빨간 에러 배너 표시
 *
 * Phase 10 P0-2 추가:
 * - "비밀번호 찾기" link → {@link PasswordResetDialog} 호출
 * - 5회 실패 잠금 안내 배너 (BE {@code Account.MAX_FAILED_LOGIN_ATTEMPTS} = 5)
 * - 비밀번호 정책 helper text — 로그인 폼 하단에 노출 (GET /auth/password/policy)
 *
 * data-testid (DevOps spec):
 * - login-id-input / login-password-input / login-submit-button (우선순위 1)
 * - login-forgot-password-link / account-locked-banner / password-policy-hint (P0-2 신규)
 */
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  FormField,
} from '@samhan/design-system'
import axios from 'axios'
import { login, type LoginResponse } from '../api/auth'
import { useSessionStore } from '../stores/session'
import { getPasswordPolicy } from '../api/passwordApi'
import { clearSessionQueryCache } from '../queryClientRegistry'
// P0-2: "비밀번호를 잊으셨나요?" → /auth/password-reset 페이지 방식으로 navigate.
// PasswordResetDialog (modal) 는 PasswordResetDialog.tsx 에 보존 (독립 재사용 가능).

/**
 * BE 에러 메시지가 잠금 상태를 의미하는지 한국어 키워드 + 401 상태로 추정.
 * BE {@code AuthService} 가 잠금 시 {@code "계정이 잠겼습니다"} 류 메시지 + 401 반환.
 */
function isAccountLockedError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  const data = err.response?.data as { message?: string; code?: string } | undefined
  const message = data?.message ?? ''
  const code = data?.code ?? ''
  return (
    message.includes('잠금')
    || message.includes('잠겼')
    || message.includes('locked')
    || code === 'ACCOUNT_LOCKED'
  )
}

export function LoginPage() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const setAuth = useSessionStore((s) => s.setAuth)
  const navigate = useNavigate()

  // 정책 조회 — 로그인 폼 하단 helper text. 인증 불필요 endpoint.
  const policyQuery = useQuery({
    queryKey: ['password-policy'],
    queryFn: getPasswordPolicy,
    staleTime: 5 * 60 * 1000,
    // 백엔드 미부팅/네트워크 단절 시 로그인 자체를 막지 않도록 retry 1회만
    retry: 1,
  })

  const mutation = useMutation<LoginResponse, unknown, void>({
    mutationFn: () => login({ loginId, password }),
    onSuccess: async (res) => {
      // Electron/Capacitor 는 웹처럼 풀 리로드되지 않으므로 이전 계정의
      // 권한 및 사용자 귀속 Query Cache를 새 세션이 읽기 전에 폐기한다.
      clearSessionQueryCache()
      await setAuth(res)
      navigate('/', { replace: true })
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate()
  }

  /**
   * 사용자에게 노출할 에러 메시지 — axios 응답 message 우선, 그다음 일반 텍스트.
   */
  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '로그인에 실패했습니다. 자격 증명을 확인하세요.'
    }
    return '알 수 없는 오류로 로그인하지 못했습니다.'
  })()

  const accountLocked = mutation.isError && isAccountLockedError(mutation.error)

  return (
    <div className="login-shell">
      <Card padding={6} shadow="lg">
        <form className="login-card-inner" onSubmit={handleSubmit}>
          <h2 style={{ margin: 0, color: 'var(--color-brand-700)' }}>
            Samhan Public 로그인
          </h2>
          <FormField
            label="사용자 ID"
            required
            render={({ id }) => (
              <input
                id={id}
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoFocus
                autoComplete="username"
                data-testid="login-id-input"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--color-neutral-300)',
                  fontSize: 14,
                }}
              />
            )}
          />
          <FormField
            label="비밀번호"
            required
            render={({ id }) => (
              <input
                id={id}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                data-testid="login-password-input"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--color-neutral-300)',
                  fontSize: 14,
                }}
              />
            )}
          />
          {accountLocked ? (
            <div
              className="error-banner"
              role="alert"
              data-testid="account-locked-banner"
              style={{ lineHeight: 1.5 }}
            >
              <strong>계정이 잠겼습니다.</strong>
              <br />
              비밀번호를 5회 이상 잘못 입력하여 보안 정책에 따라 잠금 처리되었습니다.
              {' '}
              아래 [비밀번호를 잊으셨나요?] 링크로 재설정하거나 관리자(MASTER) 에게 잠금 해제를
              요청해 주세요.
            </div>
          ) : errorMessage ? (
            <div className="error-banner" role="alert">
              {errorMessage}
            </div>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            disabled={!loginId || !password}
            data-testid="login-submit-button"
          >
            로그인
          </Button>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 4,
            }}
          >
            {/* P0-2: 페이지 방식 재설정 (/auth/password-reset) 로 이동 */}
            <button
              type="button"
              onClick={() => navigate('/auth/password-reset')}
              data-testid="login-forgot-password-link"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-brand-700)',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              비밀번호를 잊으셨나요?
            </button>
          </div>
          {policyQuery.data ? (
            <p
              data-testid="password-policy-hint"
              style={{
                margin: 0,
                marginTop: 4,
                fontSize: 12,
                color: 'var(--color-neutral-600, #6B7280)',
                lineHeight: 1.5,
              }}
            >
              {policyQuery.data.description}
              {' · '}
              {policyQuery.data.maxFailedLoginAttempts}
              회 실패 시 계정이 잠깁니다.
            </p>
          ) : null}
        </form>
      </Card>

    </div>
  )
}
