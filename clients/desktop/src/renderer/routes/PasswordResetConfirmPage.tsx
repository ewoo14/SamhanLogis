/**
 * 비밀번호 셀프 재설정 확인 화면 — P0-2 신규 라우트 {@code /auth/password-reset/confirm}.
 *
 * 흐름:
 * 1) 인증번호 6자리 + 새 비밀번호 × 2 입력
 * 2) "비밀번호 재설정" 버튼 → {@code POST /api/v1/auth/password/reset-confirm}
 * 3) 성공 → {@code /login} 리다이렉트 + 성공 토스트
 * 4) 실패 → 카드 안에 에러 배너 (인증번호 불일치/만료/정책 위반/비밀번호 불일치)
 *
 * 비밀번호 정책: 8~32자, 영문+숫자+특수문자 — 클라이언트 사이드 정규식 사전 검증.
 * 비밀번호 강도 indicator: 약/보통/강 3단계 (결정적 알고리즘, Math.random 미사용).
 *
 * 레이아웃: LoginPage 와 동일한 {@code login-shell} + {@code Card} 중앙 정렬.
 *
 * data-testid (PASSWORD-RESET-DESIGN.md §8 기준):
 * - {@code reset-confirm-token-input}
 * - {@code reset-token-expiry-hint}
 * - {@code reset-new-password-input}
 * - {@code password-strength-indicator}
 * - {@code password-policy-hint}
 * - {@code reset-confirm-password-input}
 * - {@code reset-confirm-submit-button}
 * - {@code reset-back-to-login-link}
 * - {@code password-reset-back-button}
 * - {@code password-toggle-newPassword}
 * - {@code password-toggle-confirmPassword}
 * - {@code password-reset-token-display} (DEV 전용)
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button, Card, FormField, Input } from '@samhan/design-system'
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
const POLICY_HINT = `비밀번호 정책: ${PW_MIN}~${PW_MAX}자, 영문 + 숫자 + 특수문자(!@#$%^&*) 조합`

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

/**
 * 강도 인디케이터 색상 토큰 — PASSWORD-RESET-DESIGN.md §2.2 spec 기준.
 * 미정의 토큰 fallback hex 없음.
 */
const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: 'var(--color-danger)',
  medium: 'var(--state-warning)',
  strong: 'var(--color-success)',
}

/** aria-valuenow 매핑 — role="progressbar" 스펙 (0~3 스케일). */
const STRENGTH_LEVEL: Record<PasswordStrength, number> = {
  weak: 1,
  medium: 2,
  strong: 3,
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

// ============================================================================
// 비밀번호 보기 토글 아이콘 (SVG 직접 임베드 — Heroicons 24px outline 호환)
// ============================================================================

/** 눈 아이콘 — 비밀번호 보기 상태. */
function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      width={20}
      height={20}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  )
}

/** 눈+사선 아이콘 — 비밀번호 숨기기 상태. */
function EyeSlashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      width={20}
      height={20}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  )
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

  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [completedMsg, setCompletedMsg] = useState('')

  const strength = newPassword.length > 0 ? measureStrength(newPassword) : null
  const strengthLevel = strength ? STRENGTH_LEVEL[strength] : 0

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
        throw new Error(res.message || '인증번호가 일치하지 않거나 만료되었습니다.')
      }
      return res
    },
    onSuccess: (res) => {
      setCompleted(true)
      setCompletedMsg(
        res.message || '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인하세요.',
      )
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending || completed) return
    if (passwordError || passwordMismatch) return
    if (!RE_TOKEN_6.test(token)) return
    mutation.mutate({ loginId: prefillLoginId, token, newPassword, confirmPassword })
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
          <div className="login-card-inner" style={{ gap: 16 }}>
            <h2
              style={{
                margin: 0,
                color: 'var(--color-brand-700)',
                fontSize: 'var(--font-size-xl)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              비밀번호 재설정 완료
            </h2>
            <div
              role="status"
              style={{
                background: 'var(--state-success-bg)',
                border: '1px solid var(--color-success)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3) var(--space-4)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--state-success)',
                lineHeight: 'var(--line-height-normal)',
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
            인증번호를 입력하세요
          </p>

          {/* 인증번호 입력 */}
          <FormField
            label="인증번호"
            required
            render={({ id }) => (
              <Input
                id={id}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                placeholder="123456"
                data-testid="reset-confirm-token-input"
                required
                error={tokenFormatError ?? undefined}
              />
            )}
          />

          {/* 인증번호 만료 안내 — 항상 표시 */}
          <p
            data-testid="reset-token-expiry-hint"
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              marginTop: 'var(--space-1)',
            }}
          >
            ⏱ 인증번호는 10분 후 만료됩니다.
          </p>

          {/* 새 비밀번호 입력 (보기 토글 포함) */}
          <FormField
            label="새 비밀번호"
            required
            render={({ id }) => (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Input
                  id={id}
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={POLICY_HINT}
                  data-testid="reset-new-password-input"
                  required
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={showNewPassword}
                  data-testid="password-toggle-newPassword"
                  onClick={() => setShowNewPassword((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-neutral-500)',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget
                    btn.style.color = 'var(--color-neutral-700)'
                    btn.style.background = 'var(--surface-hover)'
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget
                    btn.style.color = 'var(--color-neutral-500)'
                    btn.style.background = 'none'
                  }}
                >
                  {showNewPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
            )}
          />

          {/* 비밀번호 강도 indicator — PASSWORD-RESET-DESIGN.md §2.2, §5.4 */}
          {strength ? (
            <div
              data-testid="password-strength-indicator"
              style={{ marginTop: 'calc(var(--space-1) * -1)' }}
            >
              {/* 진행 바 — role="progressbar" + aria WCAG */}
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={strengthLevel}
                aria-label="비밀번호 강도"
                style={{
                  height: 4,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-neutral-200)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: STRENGTH_WIDTH[strength],
                    background: STRENGTH_COLOR[strength],
                    transition: 'width var(--duration-base) ease',
                  }}
                />
              </div>
              <p
                style={{
                  margin: 'var(--space-1) 0 0',
                  fontSize: 'var(--font-size-sm)',
                  color: STRENGTH_COLOR[strength],
                  lineHeight: 'var(--line-height-normal)',
                }}
              >
                {STRENGTH_LABEL[strength]}
              </p>
            </div>
          ) : null}

          {passwordError && newPassword.length > 0 ? (
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
                marginTop: 'calc(var(--space-2) * -1)',
              }}
            >
              {passwordError}
            </div>
          ) : null}

          {/* 비밀번호 정책 힌트 — PASSWORD-RESET-DESIGN.md §4.2 */}
          <p
            data-testid="password-policy-hint"
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-neutral-600)',
              lineHeight: 'var(--line-height-normal)',
              marginTop: 'var(--space-2)',
            }}
          >
            {POLICY_HINT}
          </p>

          {/* 새 비밀번호 확인 입력 (보기 토글 포함) */}
          <FormField
            label="새 비밀번호 확인"
            required
            render={({ id }) => (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Input
                  id={id}
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  data-testid="reset-confirm-password-input"
                  required
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={showConfirmPassword}
                  data-testid="password-toggle-confirmPassword"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-neutral-500)',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget
                    btn.style.color = 'var(--color-neutral-700)'
                    btn.style.background = 'var(--surface-hover)'
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget
                    btn.style.color = 'var(--color-neutral-500)'
                    btn.style.background = 'none'
                  }}
                >
                  {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
            )}
          />

          {passwordMismatch ? (
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
                marginTop: 'calc(var(--space-2) * -1)',
              }}
            >
              비밀번호가 일치하지 않습니다.
            </div>
          ) : null}

          {/* API 에러 배너 */}
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
            disabled={
              !RE_TOKEN_6.test(token) ||
              !newPassword ||
              !confirmPassword ||
              !!passwordError ||
              passwordMismatch
            }
            data-testid="reset-confirm-submit-button"
          >
            비밀번호 재설정
          </Button>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)' }}>
            <button
              type="button"
              onClick={() => navigate('/auth/password-reset/request')}
              data-testid="password-reset-back-button"
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
              인증번호 다시 받기
            </button>
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

          {/* DEV 전용 — 인증번호 화면 표시 (운영 환경 비노출) */}
          {import.meta.env.DEV ? (
            <p
              data-testid="password-reset-token-display"
              style={{
                margin: 0,
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              [DEV] 인증번호 확인: 이메일/SMS 확인 요망
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  )
}
