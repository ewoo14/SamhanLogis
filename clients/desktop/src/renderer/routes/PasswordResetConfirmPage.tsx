/**
 * 비밀번호 셀프 재설정 확인 화면 — P0-2 신규 라우트 {@code /auth/password-reset/confirm}.
 *
 * 흐름:
 * 1) loginId (이전 페이지 state 자동 채움 / 수정 가능) + 인증번호 6자리 + 새 비밀번호 × 2 입력
 * 2) "비밀번호 재설정" 버튼 → {@code POST /api/v1/auth/password-reset/confirm}
 * 3) 성공 → {@code /login} 리다이렉트 + 토스트 메시지
 * 4) 실패 → 카드 안에 에러 배너 (인증번호 불일치/만료/정책 위반/비밀번호 불일치)
 *
 * 비밀번호 정책: 8~32자, 영문+숫자+특수문자 — 클라이언트 사이드 정규식 사전 검증.
 * 비밀번호 강도 indicator: 약/보통/강 3단계 (정규식 기반, Math.random 미사용).
 *
 * 레이아웃: LoginPage 와 동일한 {@code login-shell} + {@code Card} 중앙 정렬.
 *
 * data-testid:
 * - {@code password-reset-confirm-form}
 * - {@code password-reset-confirm-login-id-input}
 * - {@code password-reset-token-input}
 * - {@code password-reset-new-password-input}
 * - {@code password-reset-confirm-password-input}
 * - {@code password-reset-confirm-submit-button}
 * - {@code password-strength-indicator}
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button, Card, FormField } from '@samhan/design-system'
import axios from 'axios'
import {
  confirmPasswordReset,
  type PasswordResetConfirmDto,
} from '../api/passwordResetApi'

// ============================================================================
// 비밀번호 정책 상수
// ============================================================================

/** 비밀번호 최소 길이. */
const PW_MIN = 8
/** 비밀번호 최대 길이. */
const PW_MAX = 32
/** 영문 포함 정규식. */
const RE_LETTER = /[A-Za-z]/
/** 숫자 포함 정규식. */
const RE_DIGIT = /[0-9]/
/** 특수문자 포함 정규식. */
const RE_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/
/** 인증번호 6자리 정규식. */
const RE_TOKEN_6 = /^\d{6}$/

/** 정책 안내 문구 (UI 표시용). */
const POLICY_HINT = `${PW_MIN}~${PW_MAX}자, 영문+숫자+특수문자 조합 필수`

// ============================================================================
// 비밀번호 강도 판별
// ============================================================================

type PasswordStrength = 'weak' | 'medium' | 'strong'

/**
 * 비밀번호 강도 판별 — 결정적 알고리즘 (Math.random 미사용).
 *
 * - weak  : 길이 미달 / 영문·숫자·특수문자 중 1개만 충족
 * - medium: 영문+숫자 또는 영문+특수문자 등 2개 충족 (길이 8 이상)
 * - strong: 영문+숫자+특수문자 모두 충족 + 길이 12 이상
 */
function measureStrength(pw: string): PasswordStrength {
  if (pw.length < PW_MIN) return 'weak'
  const hasLetter = RE_LETTER.test(pw)
  const hasDigit = RE_DIGIT.test(pw)
  const hasSpecial = RE_SPECIAL.test(pw)
  const criteriaCount = [hasLetter, hasDigit, hasSpecial].filter(Boolean).length
  if (criteriaCount === 3 && pw.length >= 12) return 'strong'
  if (criteriaCount >= 2) return 'medium'
  return 'weak'
}

const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  weak: '약함',
  medium: '보통',
  strong: '강함',
}

const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: 'var(--color-danger-500, #EF4444)',
  medium: 'var(--color-warning-500, #F59E0B)',
  strong: 'var(--color-success-600, #16A34A)',
}

const STRENGTH_WIDTH: Record<PasswordStrength, string> = {
  weak: '33%',
  medium: '66%',
  strong: '100%',
}

// ============================================================================
// 클라이언트 사이드 정책 검증
// ============================================================================

/**
 * 비밀번호 정책 위반 메시지 반환. 통과 시 {@code null}.
 */
function validatePassword(pw: string): string | null {
  if (pw.length < PW_MIN || pw.length > PW_MAX) {
    return `비밀번호는 ${PW_MIN}~${PW_MAX}자여야 합니다.`
  }
  if (!RE_LETTER.test(pw)) return '영문자를 1자 이상 포함해야 합니다.'
  if (!RE_DIGIT.test(pw)) return '숫자를 1자 이상 포함해야 합니다.'
  if (!RE_SPECIAL.test(pw)) return '특수문자를 1자 이상 포함해야 합니다.'
  return null
}

/** 공통 input 인라인 스타일 — LoginPage 와 동일 톤 유지. */
const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

// ============================================================================
// 컴포넌트
// ============================================================================

/**
 * 비밀번호 재설정 확인 페이지.
 *
 * AuthGuard 외부에 배치 — 비인증 상태(비밀번호 분실)에서 접근해야 하므로
 * {@code routes/index.tsx} 에서 최상위 레벨에 등록.
 *
 * {@code useLocation().state.loginId} 로 이전 페이지에서 loginId 를 수신한다.
 */
export function PasswordResetConfirmPage() {
  const navigate = useNavigate()
  const location = useLocation()

  /** 이전 페이지(RequestPage) 에서 전달된 loginId (없으면 빈 문자열). */
  const prefillLoginId =
    (location.state as { loginId?: string } | null)?.loginId ?? ''

  const [loginId, setLoginId] = useState(prefillLoginId)
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [completed, setCompleted] = useState(false)
  const [completedMsg, setCompletedMsg] = useState('')

  const strength = newPassword.length > 0 ? measureStrength(newPassword) : null

  const passwordError = newPassword.length > 0 ? validatePassword(newPassword) : null
  const passwordMismatch =
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword !== confirmPassword

  const mutation = useMutation<
    { success: boolean; message: string },
    unknown,
    PasswordResetConfirmDto
  >({
    mutationFn: async (body) => {
      const res = await confirmPasswordReset(body)
      // mock 모드에서는 status 200 + success:false 로 실패 응답 — 에러로 변환
      if (!res.success) {
        const err = new Error(res.message || '인증번호가 일치하지 않거나 만료되었습니다.')
        throw err
      }
      return res
    },
    onSuccess: (res) => {
      setCompleted(true)
      setCompletedMsg(
        res.message || '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.',
      )
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending || completed) return
    if (passwordError || passwordMismatch) return
    if (!RE_TOKEN_6.test(token)) return
    mutation.mutate({ loginId, token, newPassword, confirmPassword })
  }

  /** 사용자 친화 한국어 에러 메시지 추출. */
  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      if (err.response?.status === 401) {
        return data?.message ?? '인증번호가 일치하지 않거나 만료되었습니다. 다시 요청해주세요.'
      }
      if (err.response?.status === 400) {
        return data?.message ?? '비밀번호 정책을 위반했거나 입력값이 올바르지 않습니다.'
      }
      return data?.message ?? '요청 처리 중 오류가 발생했습니다.'
    }
    // 일반 Error (mock success:false → throw 변환 포함)
    if (err instanceof Error) return err.message
    return '알 수 없는 오류가 발생했습니다.'
  })()

  /** 인증번호 입력 형식 오류 — 6자리 숫자 아닌 경우. */
  const tokenFormatError =
    token.length > 0 && !RE_TOKEN_6.test(token)
      ? '인증번호는 숫자 6자리입니다.'
      : null

  // 완료 화면
  if (completed) {
    return (
      <div className="login-shell">
        <Card padding={6} shadow="lg">
          <div
            className="login-card-inner"
            style={{ gap: 16 }}
          >
            <h2 style={{ margin: 0, color: 'var(--color-brand-700)' }}>
              비밀번호 재설정 완료
            </h2>
            <div
              role="status"
              style={{
                background: 'var(--color-success-50, #F0FDF4)',
                border: '1px solid var(--color-success-300, #86EFAC)',
                borderRadius: 6,
                padding: '12px 14px',
                fontSize: 13,
                color: 'var(--color-success-700, #15803D)',
                lineHeight: 1.6,
              }}
            >
              {completedMsg}
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login', { replace: true })}
            >
              로그인 화면으로 이동
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="login-shell">
      <Card padding={6} shadow="lg">
        <form
          className="login-card-inner"
          onSubmit={handleSubmit}
          data-testid="password-reset-confirm-form"
        >
          <h2 style={{ margin: 0, color: 'var(--color-brand-700)' }}>
            인증번호 입력
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--color-neutral-600, #6B7280)',
              lineHeight: 1.6,
            }}
          >
            이메일로 발송된 인증번호(6자리)와 새 비밀번호를 입력해주세요.
            <br />
            인증번호는 <strong>10분</strong> 이내에 입력해야 합니다.
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
                autoComplete="username"
                data-testid="password-reset-confirm-login-id-input"
                style={inputStyle}
              />
            )}
          />

          <FormField
            label="인증번호 (6자리)"
            required
            render={({ id }) => (
              <input
                id={id}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                placeholder="123456"
                data-testid="password-reset-token-input"
                style={inputStyle}
              />
            )}
          />
          {tokenFormatError ? (
            <div className="error-banner" role="alert" style={{ marginTop: -8 }}>
              {tokenFormatError}
            </div>
          ) : null}

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
                placeholder={POLICY_HINT}
                data-testid="password-reset-new-password-input"
                style={inputStyle}
              />
            )}
          />

          {/* 비밀번호 강도 indicator */}
          {strength ? (
            <div
              data-testid="password-strength-indicator"
              style={{ marginTop: -8 }}
            >
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--color-neutral-200, #E5E7EB)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: STRENGTH_WIDTH[strength],
                    background: STRENGTH_COLOR[strength],
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 11,
                  color: STRENGTH_COLOR[strength],
                  lineHeight: 1.4,
                }}
              >
                강도: {STRENGTH_LABEL[strength]}
              </p>
            </div>
          ) : null}

          {passwordError && newPassword.length > 0 ? (
            <div className="error-banner" role="alert" style={{ marginTop: -8 }}>
              {passwordError}
            </div>
          ) : null}

          <FormField
            label="새 비밀번호 확인"
            required
            render={({ id }) => (
              <input
                id={id}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                data-testid="password-reset-confirm-password-input"
                style={inputStyle}
              />
            )}
          />
          {passwordMismatch ? (
            <div className="error-banner" role="alert" style={{ marginTop: -8 }}>
              새 비밀번호와 확인 입력이 일치하지 않습니다.
            </div>
          ) : null}

          {/* 정책 안내 박스 */}
          <div
            style={{
              background: 'var(--color-neutral-50, #F9FAFB)',
              border: '1px solid var(--color-neutral-200, #E5E7EB)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--color-neutral-600, #6B7280)',
              lineHeight: 1.6,
            }}
          >
            <strong>비밀번호 정책</strong>: {POLICY_HINT}
          </div>

          {/* API 에러 배너 */}
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
            loading={mutation.isPending}
            disabled={
              !loginId ||
              !RE_TOKEN_6.test(token) ||
              !newPassword ||
              !confirmPassword ||
              !!passwordError ||
              passwordMismatch
            }
            data-testid="password-reset-confirm-submit-button"
          >
            비밀번호 재설정
          </Button>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={() => navigate('/auth/password-reset')}
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
              인증번호 다시 받기
            </button>
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
