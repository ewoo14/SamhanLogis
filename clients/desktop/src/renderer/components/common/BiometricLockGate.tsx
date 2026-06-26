import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '@samhan/design-system'
import { isCapacitorPlatform } from '../../auth/authProvider'
import { authenticateBiometric, isBiometricAvailable } from '../../biometric/biometricAuth'

const DEFAULT_LOCK_TIMEOUT_MS = 60_000
const AUTH_REASON = '앱 보안을 위해 생체인증으로 다시 인증해 주세요.'

interface BiometricLockGateProps {
  children: ReactNode
  bootstrapped: boolean
  enabled: boolean
  lockTimeoutMs?: number
}

export function BiometricLockGate({
  children,
  bootstrapped,
  enabled,
  lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
}: BiometricLockGateProps) {
  const [locked, setLocked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState(false)
  const backgroundedAtRef = useRef<number | null>(null)
  const authInFlightRef = useRef(false)

  const unlockWithBiometry = useCallback(async () => {
    if (!isCapacitorPlatform || !bootstrapped || !enabled || authInFlightRef.current) return

    authInFlightRef.current = true
    setLocked(true)
    setChecking(true)
    setFailed(false)

    try {
      const available = await isBiometricAvailable()
      if (!available) {
        // 생체 미설정/미가용 시 JWT 유효 세션으로 통과한다.
        // 생체인증은 토큰 위 재인증 이중 레이어이며, 생체 부재가 기존 인증을 무효화하지 않는다.
        setLocked(false)
        return
      }

      const authenticated = await authenticateBiometric(AUTH_REASON)
      setLocked(!authenticated)
      setFailed(!authenticated)
    } finally {
      setChecking(false)
      authInFlightRef.current = false
    }
  }, [bootstrapped, enabled])

  useEffect(() => {
    if (!isCapacitorPlatform || !bootstrapped || !enabled) {
      setLocked(false)
      setChecking(false)
      setFailed(false)
      return
    }

    void unlockWithBiometry()
  }, [bootstrapped, enabled, unlockWithBiometry])

  useEffect(() => {
    if (!isCapacitorPlatform || !bootstrapped || !enabled) return

    let disposed = false
    const handles: Array<{ remove: () => Promise<void> }> = []

    async function attachListeners() {
      try {
        const { App } = await import('@capacitor/app')
        const pauseHandle = await App.addListener('pause', () => {
          backgroundedAtRef.current = Date.now()
        })
        const resumeHandle = await App.addListener('resume', () => {
          const backgroundedAt = backgroundedAtRef.current
          backgroundedAtRef.current = null
          if (backgroundedAt === null) return
          if (Date.now() - backgroundedAt >= lockTimeoutMs) {
            void unlockWithBiometry()
          }
        })

        if (disposed) {
          await Promise.allSettled([pauseHandle.remove(), resumeHandle.remove()])
          return
        }

        handles.push(pauseHandle, resumeHandle)
      } catch (error) {
        console.warn('[biometric] app lifecycle listener failed', error)
      }
    }

    void attachListeners()

    return () => {
      disposed = true
      void Promise.allSettled(handles.map((handle) => handle.remove()))
    }
  }, [bootstrapped, enabled, lockTimeoutMs, unlockWithBiometry])

  if (!isCapacitorPlatform || !bootstrapped || !enabled) {
    return <>{children}</>
  }

  if (!locked) {
    return <>{children}</>
  }

  return (
    <>
      <div aria-hidden="true">
        {children}
      </div>
      <Modal
        open
        onClose={() => {}}
        title={<span id="biometric-lock-title">생체인증이 필요합니다</span>}
        closeOnBackdropClick={false}
        closeOnEsc={false}
        closeOnHeaderX={false}
        hideCloseButton
        size="sm"
        footer={(
          <Button
            type="button"
            onClick={() => void unlockWithBiometry()}
            loading={checking}
            disabled={checking}
            data-testid="biometric-lock-retry"
            fullWidth
          >
            {checking ? '인증 확인 중' : '다시 인증'}
          </Button>
        )}
      >
        <div
          data-testid="biometric-lock-gate"
          style={{
            display: 'grid',
            gap: 'var(--space-3)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            백오피스 세션 보호를 위해 Face ID, 지문 또는 기기 잠금으로 다시 인증해 주세요.
          </p>
          {failed ? (
            <p role="alert" style={{ margin: 0, color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
              인증이 완료되지 않았습니다.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
