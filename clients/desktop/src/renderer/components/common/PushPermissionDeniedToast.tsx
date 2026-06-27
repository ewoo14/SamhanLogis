import { useEffect, useRef, useState } from 'react'
import {
  PUSH_PERMISSION_DENIED_EVENT,
  PUSH_PERMISSION_DENIED_MESSAGE,
} from '../../push/pushEvents'

export function PushPermissionDeniedToast() {
  const [visible, setVisible] = useState(false)
  const shownOnce = useRef(false)

  useEffect(() => {
    const onDenied = () => {
      if (shownOnce.current) return
      shownOnce.current = true
      setVisible(true)
    }

    window.addEventListener(PUSH_PERMISSION_DENIED_EVENT, onDenied)
    return () => window.removeEventListener(PUSH_PERMISSION_DENIED_EVENT, onDenied)
  }, [])

  if (!visible) return null

  return (
    <div
      role="alert"
      data-testid="push-permission-denied-toast"
      className="push-permission-denied-toast"
    >
      <span>{PUSH_PERMISSION_DENIED_MESSAGE}</span>
      <button
        type="button"
        aria-label="푸시 권한 안내 닫기"
        onClick={() => setVisible(false)}
      >
        닫기
      </button>
    </div>
  )
}
