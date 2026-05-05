/**
 * PWA 설치 프롬프트.
 *
 * <p>출처: 06-frontend-design.md §7.1 #9 — 첫 진입 후 5초 표시 / dismiss 시 7일 후 재시도.
 *
 * <p>동작:
 * 1. `beforeinstallprompt` 이벤트 capture (Chrome/Edge 등)
 * 2. localStorage `samhan.pwa.dismissedAt` 가 7일 이내면 미표시
 * 3. 5초 후 표시 / 사용자 액션 (설치/뒤로) 처리
 *
 * <p>Safari 등 미지원 환경에서는 자동 미표시.
 */
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'samhan.pwa.dismissedAt'
const DISMISS_DAYS = 7
const SHOW_DELAY_MS = 5000

export function PwaInstallPrompt() {
  const [deferredEvt, setDeferredEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault()
      const ev = e as BeforeInstallPromptEvent
      // 7일 이내 dismiss 했으면 무시
      try {
        const last = window.localStorage.getItem(DISMISS_KEY)
        if (last) {
          const lastMs = Number(last)
          if (Date.now() - lastMs < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
        }
      } catch {
        /* ignore */
      }
      setDeferredEvt(ev)
      window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    }
    window.addEventListener('beforeinstallprompt', onBefore as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', onBefore as EventListener)
  }, [])

  if (!visible || !deferredEvt) return null

  return (
    <div className="pwa-prompt" role="dialog" aria-label="홈 화면에 추가">
      <h3>홈 화면에 추가</h3>
      <p>주문서 앱을 홈 화면에 추가하면 더 빠르게 접속할 수 있어요.</p>
      <div className="pwa-actions">
        <button
          className="btn btn-ghost"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
            } catch {
              /* ignore */
            }
            setVisible(false)
            setDeferredEvt(null)
          }}
        >
          나중에
        </button>
        <button
          className="btn"
          onClick={async () => {
            await deferredEvt.prompt()
            await deferredEvt.userChoice
            setVisible(false)
            setDeferredEvt(null)
          }}
        >
          설치
        </button>
      </div>
    </div>
  )
}
