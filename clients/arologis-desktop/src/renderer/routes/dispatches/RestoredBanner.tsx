import type { CSSProperties } from 'react'
import { Button } from '@samhan/design-system'

interface RestoredBannerProps {
  message: string
  testIdPrefix: string
  onClose: () => void
}

/** 저장내역 복원 상태 안내 배너. */
export function RestoredBanner({ message, testIdPrefix, onClose }: RestoredBannerProps) {
  return (
    <div data-testid={`${testIdPrefix}-restored-banner`} role="status" style={bannerStyle}>
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onClose}>
        닫기
      </Button>
    </div>
  )
}

const bannerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  border: '1px solid #BFDBFE',
  borderRadius: 6,
  background: '#EFF6FF',
  color: '#1D4ED8',
  fontSize: 13,
  marginBottom: 12,
}
