/**
 * 비밀번호 셀프 재설정 요청 화면 — P0-2 신규 라우트 {@code /auth/password-reset}.
 *
 * 흐름:
 * 1) loginId + 등록 이메일 입력
 * 2) "인증번호 받기" 버튼 → {@code POST /api/v1/auth/password-reset/request}
 * 3) 성공 → 확인 안내 메시지 표시 후 {@code /auth/password-reset/confirm} 리다이렉트
 *    (state 로 loginId 전달 — ConfirmPage 자동 채움)
 * 4) 실패 → 카드 안에 에러 배너 표시
 *
 * 레이아웃: LoginPage 와 동일한 {@code login-shell} + {@code Card} 중앙 정렬.
 *
 * data-testid:
 * - {@code password-reset-request-form}
 * - {@code password-reset-login-id-input}
 * - {@code password-reset-email-input}
 * - {@code password-reset-submit-button}
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FormField } from '@samhan/design-system'
import axios from 'axios'
import {
  requestPasswordReset,
  type PasswordResetRequestDto,
} from '../api/passwordResetApi'

/** 비밀번호 정책 안내 (클라이언트 사이드 상수 — LoginPage / ConfirmPage 와 동일). */
const POLICY_HINT = '8~32자, 영문+숫자+특수문자 조합 필수'

/** 공통 input 인라인 스타일 — LoginPage 와 동일 톤 유지. */
const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

/**
 * 비밀번호 재설정 요청 페이지.
 *
 * AuthGuard 외부에 배치 — 비인증 상태(비밀번호 분실)에서 접근해야 하므로
 * {@code routes/index.tsx} 에서 최상위 레벨에 등록.
 */
export function PasswordResetRequestPage() {
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [email, setEmail] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const mutation = useMutation<
    { success: boolean; message: string },
    unknown,
    PasswordResetRequestDto
  >({
    mutationFn: (body) => requestPasswordReset(body),
    onSuccess: (res) => {
      setSuccessMsg(
        res.message || '등록된 이메일로 인증번호가 전송되었습니다. 10분 이내에 입력해주세요.',
      )
      // 1.5초 후 확인 페이지로 이동 (loginId state 전달)
      const sentLoginId = loginId
      setTimeout(() => {
        navigate('/auth/password-reset/confirm', {
          state: { loginId: sentLoginId },
        })
      }, 1500)
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending || successMsg) return
    mutation.mutate({ loginId, email })
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
          data-testid="password-reset-request-form"
        >
          <h2 style={{ margin: 0, color: 'var(--color-brand-700)' }}>
            비밀번호 재설정
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--color-neutral-600, #6B7280)',
              lineHeight: 1.6,
            }}
          >
            가입 시 등록한 이메일로 인증번호를 발송합니다.
            <br />
            {POLICY_HINT}
          </p>

          <FormField
            label="로그인 ID"
            required
            render={({ id }) => (
              <input
                id={id}
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="로그인 ID 를 입력하세요"
                data-testid="password-reset-login-id-input"
                style={inputStyle}
              />
            )}
          />

          <FormField
            label="등록 이메일"
            required
            render={({ id }) => (
              <input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="가입 시 등록한 이메일"
                data-testid="password-reset-email-input"
                style={inputStyle}
              />
            )}
          />

          {/* 보안 안내 — enumeration 방지 */}
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--color-neutral-500, #6B7280)',
              lineHeight: 1.5,
            }}
          >
            보안 정책상 ID/이메일 등록 여부는 확인해 드리지 않습니다.
            등록된 계정인 경우에만 인증번호가 발송됩니다.
          </p>

          {/* 성공 안내 배너 */}
          {successMsg ? (
            <div
              role="status"
              style={{
                background: 'var(--color-success-50, #F0FDF4)',
                border: '1px solid var(--color-success-300, #86EFAC)',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--color-success-700, #15803D)',
                lineHeight: 1.5,
              }}
            >
              {successMsg}
            </div>
          ) : null}

          {/* 에러 배너 */}
          {errorMessage ? (
            <div className="error-banner" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending || !!successMsg}
            disabled={!loginId || !email}
            data-testid="password-reset-submit-button"
          >
            인증번호 받기
          </Button>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-neutral-500, #6B7280)',
                fontSize: 13,
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
