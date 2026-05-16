import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Input, Modal } from '@samhan/design-system'

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
      <Input
        label="저장주제"
        data-testid="dps-history-topic-input"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        maxLength={200}
        placeholder="예: 오전 마감 점검"
        autoFocus
      />
    </Modal>
  )
}

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}
