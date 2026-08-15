import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DetailWindowControls } from './DetailWindowControls'

export function DetailWindowRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams()
  // 상세 화면의 기존 입력 컴포넌트를 일괄 감시해 저장되지 않은 편집을 main에 알린다.
  // 저장 성공 시 각 상세 화면이 setDirty(false)를 호출할 수 있고, 기본값은 안전하게 false다.
  useEffect(() => {
    const markDirty = () => void window.samhanDetailWindow?.setDirty(true)
    document.addEventListener('input', markDirty, true)
    void window.samhanDetailWindow?.setDirty(false)
    return () => {
      document.removeEventListener('input', markDirty, true)
      void window.samhanDetailWindow?.setDirty(false)
    }
  }, [])

  if (params.get('detailWindow') !== '1') return <>{children}</>

  return (
    <div style={{ minHeight: '100vh', padding: 12 }} data-testid="detail-window-shell">
      <DetailWindowControls />
      {children}
    </div>
  )
}
