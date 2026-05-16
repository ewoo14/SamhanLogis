import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Input } from '@samhan/design-system'

interface SaveDialogProps {
  open: boolean
  isSaving: boolean
  testIdPrefix: string
  title: string
  onClose: () => void
  onSave: (topic: string) => void
}

/** 저장주제 입력 dialog. */
export function SaveDialog({
  open,
  isSaving,
  testIdPrefix,
  title,
  onClose,
  onSave,
}: SaveDialogProps) {
  const [topic, setTopic] = useState('')

  useEffect(() => {
    if (open) setTopic('')
  }, [open])

  if (!open) return null

  const trimmed = topic.trim()
  return (
    <div style={backdropStyle} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={dialogStyle}
      >
        <h3 style={titleStyle}>{title}</h3>
        <Input
          label="저장주제"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 오전 마감 점검"
          data-testid={`${testIdPrefix}-topic-input`}
          maxLength={200}
          required
        />
        <div style={actionStyle}>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave(trimmed)}
            disabled={!trimmed || isSaving}
            loading={isSaving}
          >
            저장
          </Button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(17, 24, 39, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
}

const dialogStyle: CSSProperties = {
  width: 'min(420px, 100%)',
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  background: '#FFFFFF',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.18)',
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const titleStyle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 }
const actionStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
