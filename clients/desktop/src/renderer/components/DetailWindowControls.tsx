import { useEffect, useState } from 'react'

export function DetailWindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.samhanDetailWindow?.onMaximizedChange(setMaximized), [])

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
      <button type="button" onClick={() => void window.samhanDetailWindow?.toggleMaximize().then(setMaximized)}>
        {maximized ? '축소창' : '전체창'}
      </button>
      <button type="button" onClick={() => void window.samhanDetailWindow?.close()}>
        닫기
      </button>
    </div>
  )
}
