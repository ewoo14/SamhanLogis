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
      // U-1/U-2(#909 SONNET5 라운드2 계열 sweep): main.tsx 전역 마운트라 어떤 라우트(인쇄 포함)와도
      // 동시 존재 가능 — position:fixed 라도 이 앱은 useFitOneA4 로 A4 를 꽉 채워 두므로 화면에
      // display 되는 순간 인쇄 페이지 수가 늘어난다(sweep 실측 1p→2p). no-print 로 존재 자체를 지운다.
      className="push-permission-denied-toast no-print"
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
