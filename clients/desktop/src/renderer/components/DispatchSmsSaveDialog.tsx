import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Input, Modal } from '@samhan/design-system'

interface DispatchSmsSaveDialogProps {
  open: boolean
  isSaving: boolean
  testIdPrefix: string
  onClose: () => void
  onSave: (topic: string) => void
}

/** 배차문자 미리보기 명시 저장 주제 입력 dialog. */
export function DispatchSmsSaveDialog({
  open,
  isSaving,
  testIdPrefix,
  onClose,
  onSave,
}: DispatchSmsSaveDialogProps) {
  const [topic, setTopic] = useState('')

  useEffect(() => {
    if (open) setTopic('')
  }, [open])

  if (!open) return null

  const trimmed = topic.trim()
  return (
    <Modal
      open={open}
      title="배차문자 미리보기 저장"
      onClose={onClose}
      closeOnEsc={!isSaving}
      closeOnBackdropClick={!isSaving}
      closeOnHeaderX={!isSaving}
      footer={(
        <div style={actionStyle}>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
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
      )}
    >
      <Input
        label="저장주제"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="예: 오전 배차문자 발송 전 점검"
        data-testid={`${testIdPrefix}-topic-input`}
        maxLength={200}
        autoFocus
        required
      />
    </Modal>
  )
}

const actionStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
