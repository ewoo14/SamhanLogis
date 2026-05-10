/**
 * 비밀번호 셀프 재설정 요청 화면 — P0-2 신규 라우트 {@code /auth/password-reset/request}.
 *
 * 흐름:
 * 1) loginId 입력
 * 2) "인증번호 받기" 버튼 → {@code POST /api/v1/auth/password/reset-request}
 * 3) 성공 → {@code /auth/password-reset/confirm} 리다이렉트 (state 로 loginId 전달)
 * 4) 실패 → 카드 안에 에러 배너 표시
 *
 * 레이아웃: LoginPage 와 동일한 {@code login-shell} + {@code Card} 중앙 정렬.
 *
 * data-testid (PASSWORD-RESET-DESIGN.md §8 기준):
 * - {@code reset-request-loginid-input}
 * - {@code reset-request-submit-button}
 * - {@code reset-back-to-login-link}
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FormField, Input } from '@samhan/design-system'
import axios from 'axios'
import {
  requestPasswordReset,
  type PasswordResetRequestDto,
} from '../api/passwordResetApi'

/**
 * 비밀번호 재설정 요청 페이지.
 *
 * AuthGuard 외부에 배치 — 비인증 상태(비밀번호 분실)에서 접근해야 하므로
 * {@code routes/index.tsx} 에서 최상위 레벨에 등록.
 */
export function PasswordResetRequestPage() {
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')

  const mutation = useMutation<
    { success: boolean; message: string },
    unknown,
    PasswordResetRequestDto
  >({
    mutationFn: (body) => requestPasswordReset(body),
    onSuccess: () => {
      // 확인 페이지로 이동 (loginId state 전달)
      navigate('/auth/password-reset/confirm', {
        state: { loginId },
      })
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate({ loginId })
  }

  /** 사용자 친화 한국어 에러 메시지 추출. */
  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      if (err.response?.status === 429) {
        return '잠시 후 다시 시도해주세요. 요청 횟수가 초과되었습니다.'
      }
      if (err.response?.status === 404) {
        return '등록되지 않은 사용자 ID입니다.'
      }
      return data?.message ?? '요청 처리 중 오류가 발생했습니다.'
    }
    return '알 수 없는 오류가 발생했습니다.'
  })()

  return (
    <div className="login-shell">
      <Card padding={6} shadow="lg">
        <form
          className="login-card-inner"
          onSubmit={handleSubmit}
        >
          <h2
            style={{
              margin: 0,
              color: 'var(--color-brand-700)',
              fontSize: 'var(--font-size-xl)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            비밀번호 재설정
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-muted)',
              lineHeight: 'var(--line-height-normal)',
            }}
          >
            사용자 ID로 인증번호를 전송합니다.
          </p>

          <FormField
            label="사용자 ID"
            required
            render={({ id }) => (
              <Input
                id={id}
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="사용자 ID를 입력하세요"
                data-testid="reset-request-loginid-input"
                required
              />
            )}
          />

          {/* 에러 배너 */}
          {errorMessage ? (
            <div
              role="alert"
              style={{
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--state-danger-bg)',
                border: '1px solid var(--color-danger)',
                color: 'var(--state-danger)',
                fontSize: 'var(--font-size-sm)',
                lineHeight: 'var(--line-height-normal)',
              }}
            >
              {errorMessage}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            disabled={!loginId}
            data-testid="reset-request-submit-button"
          >
            인증번호 받기
          </Button>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              data-testid="reset-back-to-login-link"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-brand-700)',
                fontSize: 'var(--font-size-sm)',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              로그인으로 돌아가기
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
