import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '@samhan/design-system'
import { isCapacitorPlatform } from '../../auth/authProvider'
import { AUTH_REASON, authenticateBiometric, isBiometricAvailable } from '../../biometric/biometricAuth'

const DEFAULT_LOCK_TIMEOUT_MS = 60_000
const LOCK_DESCRIPTION = '생체 인증(지문·얼굴 인식) 또는 기기 잠금으로 다시 인증해 주세요.'
const INERT_BACKGROUND_PROPS = { inert: '' } as Record<string, string>

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
  const bootstrappedRef = useRef(bootstrapped)
  const enabledRef = useRef(enabled)

  bootstrappedRef.current = bootstrapped
  enabledRef.current = enabled

  const canAuthenticate = useCallback(() => {
    return isCapacitorPlatform && bootstrappedRef.current && enabledRef.current
  }, [])

  const unlockWithBiometry = useCallback(async () => {
    if (!canAuthenticate() || authInFlightRef.current) return

    authInFlightRef.current = true
    setChecking(true)
    setFailed(false)

    try {
      const available = await isBiometricAvailable()
      if (!canAuthenticate()) return
      if (!available) {
        // 생체 미설정/미가용 시 JWT 유효 세션으로 통과한다.
        // 생체인증은 토큰 위 재인증 이중 레이어이며, 생체 부재가 기존 인증을 무효화하지 않는다.
        setLocked(false)
        return
      }

      setLocked(true)
      const authenticated = await authenticateBiometric(AUTH_REASON)
      if (!canAuthenticate()) return
      setLocked(!authenticated)
      setFailed(!authenticated)
    } finally {
      setChecking(false)
      authInFlightRef.current = false
    }
  }, [canAuthenticate])

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
          if (disposed || !canAuthenticate()) return
          backgroundedAtRef.current = Date.now()
        })
        const resumeHandle = await App.addListener('resume', () => {
          if (disposed || !canAuthenticate()) return
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
      <div aria-hidden="true" {...INERT_BACKGROUND_PROPS}>
        {children}
      </div>
      <Modal
        open
        onClose={() => {}}
        title="생체인증이 필요합니다"
        description={LOCK_DESCRIPTION}
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
            size="lg"
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
