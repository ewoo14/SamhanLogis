import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Input } from '@samhan/design-system'

interface SlipCleanupSaveDialogProps {
  open: boolean
  isSaving: boolean
  testIdPrefix: string
  onClose: () => void
  onSave: (topic: string) => void
}

/** 전표정리 명시 저장 주제 입력 dialog. */
export function SlipCleanupSaveDialog({
  open,
  isSaving,
  testIdPrefix,
  onClose,
  onSave,
}: SlipCleanupSaveDialogProps) {
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
        aria-label="전표정리 결과 저장"
        style={dialogStyle}
      >
        <h3 style={titleStyle}>전표정리 결과 저장</h3>
        <Input
          label="저장주제"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 월말 마감 직전 점검"
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
  background: 'var(--overlay-backdrop)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
}

const dialogStyle: CSSProperties = {
  width: 'min(420px, 100%)',
  borderRadius: 8,
  border: '1px solid var(--color-neutral-200)',
  background: 'var(--surface-card)',
  boxShadow: 'var(--shadow-modal)',
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const titleStyle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 }
const actionStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
