/**
 * 본인 비밀번호 변경 페이지 — Phase 10 P0-2 (manual 06-트러블슈팅/01-로그인-실패.md §1).
 *
 * route: {@code /password/change} (AuthGuard + AppLayout 하위 — 인증 필수).
 *
 * 입력 필드:
 * - 현재 비밀번호
 * - 새 비밀번호 (정책 준수)
 * - 새 비밀번호 확인
 *
 * 흐름:
 * 1) POST /auth/password/change 호출
 * 2) 200 OK → 세션 강제 로그아웃 + /login 리다이렉트 (재로그인 강제)
 * 3) 400/401 → 한국어 에러 배너 표시
 *
 * 안내 사항:
 * - 마지막 5개 비밀번호 재사용 금지 (BE Account.PASSWORD_HISTORY_SIZE)
 * - 변경 성공 시 모든 세션 무효화 (single session 정책)
 *
 * data-testid:
 * - password-change-current
 * - password-change-new
 * - password-change-submit
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FormField } from '@samhan/design-system'
import axios from 'axios'
import { changePassword, getPasswordPolicy } from '../api/passwordApi'
import { useSessionStore } from '../stores/session'
import { usePageTitleStore } from '../stores/pageTitle'

export function PasswordChangePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = useSessionStore((s) => s.logout)
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    setPageTitle({ title: '비밀번호 변경' })
    return () => {
      setPageTitle({ title: '' })
    }
  }, [setPageTitle])

  const policyQuery = useQuery({
    queryKey: ['password-policy'],
    queryFn: getPasswordPolicy,
    staleTime: 5 * 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: () => changePassword({ oldPassword, newPassword }),
    onSuccess: () => {
      setCompleted(true)
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    if (newPassword !== newPasswordRepeat) return
    if (newPassword === oldPassword) return
    mutation.mutate()
  }

  /** 변경 성공 후 로그아웃 + login 화면 강제 이동. */
  const handleProceedToLogin = async () => {
    await logout()
    queryClient.removeQueries({ queryKey: ['permissions', 'my'] })
    navigate('/login', { replace: true })
  }

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '비밀번호 변경에 실패했습니다.'
    }
    return '알 수 없는 오류로 비밀번호를 변경하지 못했습니다.'
  })()

  const passwordMismatch =
    newPassword.length > 0
    && newPasswordRepeat.length > 0
    && newPassword !== newPasswordRepeat
  const sameAsOld =
    oldPassword.length > 0
    && newPassword.length > 0
    && oldPassword === newPassword

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--color-neutral-300)',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  }

  if (completed) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <Card padding={5} shadow="md">
          <h3 style={{ marginTop: 0 }}>비밀번호가 변경되었습니다</h3>
          <p style={{ lineHeight: 1.6, color: 'var(--color-neutral-700, #374151)' }}>
            보안을 위해 모든 세션을 종료하고 로그인 화면으로 이동합니다.
            <br />
            새 비밀번호로 다시 로그인해 주세요.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={handleProceedToLogin}>
              로그인 화면으로 이동
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <Card padding={5} shadow="md">
        <h3 style={{ marginTop: 0 }}>비밀번호 변경</h3>
        <p
          style={{
            margin: '4px 0 16px',
            fontSize: 13,
            color: 'var(--color-neutral-600, #6B7280)',
            lineHeight: 1.6,
          }}
        >
          본인 비밀번호를 변경합니다. 변경 후 모든 세션이 종료되며 새 비밀번호로
          다시 로그인해야 합니다.
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <FormField
            label="현재 비밀번호"
            required
            render={({ id }) => (
              <input
                id={id}
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                data-testid="password-change-current"
                style={inputStyle}
              />
            )}
          />
          <FormField
            label="새 비밀번호"
            required
            render={({ id }) => (
              <input
                id={id}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                data-testid="password-change-new"
                style={inputStyle}
              />
            )}
          />
          <FormField
            label="새 비밀번호 확인"
            required
            render={({ id }) => (
              <input
                id={id}
                type="password"
                value={newPasswordRepeat}
                onChange={(e) => setNewPasswordRepeat(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
            )}
          />
          {policyQuery.data ? (
            <div
              style={{
                background: 'var(--color-neutral-50, #F9FAFB)',
                border: '1px solid var(--color-neutral-200, #E5E7EB)',
                borderRadius: 6,
                padding: 10,
                fontSize: 12,
                color: 'var(--color-neutral-700, #374151)',
                lineHeight: 1.6,
              }}
            >
              <strong>비밀번호 정책</strong>
              <br />
              {policyQuery.data.description}
              <br />
              마지막
              {' '}
              {policyQuery.data.historyReuseBlock}
              개 비밀번호는 재사용할 수 없습니다.
            </div>
          ) : null}
          {passwordMismatch ? (
            <div className="error-banner" role="alert">
              새 비밀번호와 확인 입력이 일치하지 않습니다.
            </div>
          ) : null}
          {sameAsOld ? (
            <div className="error-banner" role="alert">
              새 비밀번호는 현재 비밀번호와 달라야 합니다.
            </div>
          ) : null}
          {errorMessage ? (
            <div className="error-banner" role="alert">
              {errorMessage}
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(-1)}
              disabled={mutation.isPending}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              disabled={
                !oldPassword
                || !newPassword
                || !newPasswordRepeat
                || passwordMismatch
                || sameAsOld
              }
              data-testid="password-change-submit"
            >
              비밀번호 변경
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
