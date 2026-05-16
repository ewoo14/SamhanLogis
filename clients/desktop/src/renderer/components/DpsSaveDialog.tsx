import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Modal } from '@samhan/design-system'

interface DpsSaveDialogProps {
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (topic: string) => void
}

/** DPS 명시 저장 주제 입력 다이얼로그. */
export function DpsSaveDialog({ open, saving, onClose, onSave }: DpsSaveDialogProps) {
  const [topic, setTopic] = useState('')

  useEffect(() => {
    if (open) setTopic('')
  }, [open])

  if (!open) return null

  const canSave = topic.trim().length > 0 && !saving

  return (
    <Modal
      open={open}
      title="DPS 결과 저장"
      onClose={onClose}
      footer={(
        <div style={footerStyle}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave(topic.trim())}
            disabled={!canSave}
            loading={saving}
          >
            저장
          </Button>
        </div>
      )}
    >
      <label style={fieldStyle}>
        <span>저장주제</span>
        <input
          data-testid="dps-history-topic-input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={200}
          placeholder="예: 오전 마감 점검"
          style={inputStyle}
          autoFocus
        />
      </label>
    </Modal>
  )
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#374151',
}

const inputStyle: CSSProperties = {
  height: 36,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
}

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}
