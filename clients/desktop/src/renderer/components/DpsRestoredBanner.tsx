import type { CSSProperties } from 'react'
import { Button } from '@samhan/design-system'

interface DpsRestoredBannerProps {
  message: string
  onClose: () => void
}

/** DPS 자동/명시 복원 상태 배너. */
export function DpsRestoredBanner({ message, onClose }: DpsRestoredBannerProps) {
  return (
    <div data-testid="dps-history-restored-banner" style={bannerStyle} role="status">
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onClose}>
        닫기
      </Button>
    </div>
  )
}

const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  border: '1px solid #BFDBFE',
  borderRadius: 6,
  background: '#EFF6FF',
  color: '#1E40AF',
  fontSize: 13,
  marginBottom: 12,
}
