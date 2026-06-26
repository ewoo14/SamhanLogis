import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

  return (
    <>
      <div aria-hidden={locked ? 'true' : undefined}>
        {children}
      </div>
      {locked ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="biometric-lock-title"
          data-testid="biometric-lock-gate"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#fff',
          }}
        >
          <section
            style={{
              width: 'min(100%, 360px)',
              display: 'grid',
              gap: 14,
              textAlign: 'center',
            }}
          >
            <h1 id="biometric-lock-title" style={{ margin: 0, fontSize: 22 }}>
              생체인증이 필요합니다
            </h1>
            <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.78)', lineHeight: 1.6 }}>
              백오피스 세션 보호를 위해 Face ID, 지문 또는 기기 잠금으로 다시 인증해 주세요.
            </p>
            {failed ? (
              <p role="alert" style={{ margin: 0, color: '#FCA5A5', fontSize: 13 }}>
                인증이 완료되지 않았습니다.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void unlockWithBiometry()}
              disabled={checking}
              data-testid="biometric-lock-retry"
              style={{
                minHeight: 44,
                border: 0,
                borderRadius: 6,
                background: '#2D77A8',
                color: '#fff',
                fontWeight: 700,
                cursor: checking ? 'default' : 'pointer',
                opacity: checking ? 0.7 : 1,
              }}
            >
              {checking ? '인증 확인 중' : '다시 인증'}
            </button>
          </section>
        </div>
      ) : null}
    </>
  )
}
