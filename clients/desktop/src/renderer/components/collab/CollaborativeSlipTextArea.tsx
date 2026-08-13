import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { safeActorName } from '@samhan/design-system'
import {
  EDIT_HIGHLIGHT_MS,
  type DocCoeditProvider,
  type RemoteFieldCursor,
  type RemoteFieldEdit,
} from '../../realtime/createCoeditProvider'

function headerKeyFromFieldPath(fieldPath: string): string {
  // header 키는 dot 을 포함할 수 있으므로(동적필드 field_a.b 등) 첫 dot 이후 전체를 키로 사용 — split[1] 절단 버그 방지.
  const firstDot = fieldPath.indexOf('.')
  if (firstDot < 0 || fieldPath.slice(0, firstDot) !== 'header') return ''
  return fieldPath.slice(firstDot + 1)
}

function remoteCursorsFor(provider: DocCoeditProvider | null, fieldPath: string): RemoteFieldCursor[] {
  return provider?.getRemoteCursors(fieldPath) ?? []
}

const EMPTY_EDITS: RemoteFieldEdit[] = []
function remoteEditsFor(provider: DocCoeditProvider | null, fieldPath: string): RemoteFieldEdit[] {
  const edits = provider?.getRemoteEdits(fieldPath) ?? EMPTY_EDITS
  return edits.length === 0 ? EMPTY_EDITS : edits
}

export interface CollaborativeSlipTextAreaProps {
  provider: DocCoeditProvider | null
  fieldPath: string
  value: string
  onValueChange: (value: string) => void
  rows?: number
  maxLength?: number
  placeholder?: string
  required?: boolean
  readOnly?: boolean
  coeditPending?: boolean
  textareaStyle?: CSSProperties
  onBlur?: () => void
  'data-testid'?: string
  'aria-label': string
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export function CollaborativeSlipTextArea({
  provider,
  fieldPath,
  value,
  onValueChange,
  rows = 4,
  maxLength,
  placeholder,
  required,
  readOnly,
  coeditPending,
  textareaStyle,
  onBlur,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: CollaborativeSlipTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const latestValueRef = useRef(value)
  const [remoteCursors, setRemoteCursors] = useState<RemoteFieldCursor[]>(() => remoteCursorsFor(provider, fieldPath))
  const [remoteEdits, setRemoteEdits] = useState<RemoteFieldEdit[]>(() => remoteEditsFor(provider, fieldPath))
  const primaryRemote = remoteCursors[0]
  const editHighlight = remoteEdits[0]
  const badgeRemote = editHighlight ?? primaryRemote
  const effectiveReadOnly = readOnly || !!coeditPending
  latestValueRef.current = value

  useEffect(() => {
    if (!provider) return undefined
    const syncFromDoc = () => {
      const nextValue = provider.getHeaderValue(headerKeyFromFieldPath(fieldPath))
      if (nextValue !== latestValueRef.current) onValueChange(nextValue)
    }
    const syncAwareness = () => {
      setRemoteCursors(remoteCursorsFor(provider, fieldPath))
      setRemoteEdits(remoteEditsFor(provider, fieldPath))
    }
    syncFromDoc()
    syncAwareness()
    const unsubscribeDoc = provider.subscribeDoc(syncFromDoc)
    const unsubscribeAwareness = provider.subscribeAwareness(syncAwareness)
    return () => {
      unsubscribeDoc()
      unsubscribeAwareness()
    }
  }, [fieldPath, onValueChange, provider])

  useEffect(() => {
    const first = remoteEdits[0]
    if (!provider || !first) return undefined
    const remaining = Math.max(0, first.ts + EDIT_HIGHLIGHT_MS - Date.now())
    const timer = setTimeout(() => {
      setRemoteEdits(remoteEditsFor(provider, fieldPath))
    }, remaining)
    return () => clearTimeout(timer)
  }, [fieldPath, provider, remoteEdits])

  const wrapperStyle = useMemo<CSSProperties>(() => {
    if (!primaryRemote) {
      return {
        position: 'relative',
        display: 'block',
        borderRadius: editHighlight ? 'var(--radius-md)' : undefined,
      }
    }
    return {
      position: 'relative',
      display: 'block',
      borderRadius: 'var(--radius-md)',
      boxShadow: `0 0 0 2px ${primaryRemote.color}`,
      background: `${primaryRemote.color}14`,
    }
  }, [editHighlight, primaryRemote])

  const updateCursor = () => {
    if (!provider) return
    const textarea = textareaRef.current
    const anchor = textarea?.selectionStart ?? 0
    const head = textarea?.selectionEnd ?? anchor
    provider.setLocalCursor(fieldPath, anchor, head)
  }

  return (
    <span
      data-testid={`slip-coedit-field-${fieldPath.replace(/\./g, '-')}`}
      style={wrapperStyle}
    >
      {editHighlight ? (
        <span
          key={editHighlight.ts}
          data-testid="slip-coedit-edit-pulse"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            borderRadius: 'var(--radius-md)',
            background: `${editHighlight.color}22`,
            animation: `slip-edit-pulse ${EDIT_HIGHLIGHT_MS}ms ease-out forwards`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {badgeRemote ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 2px)',
            left: 0,
            zIndex: 2,
            maxWidth: 'min(140px, 100%)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: '1px 6px',
            background: badgeRemote.color,
            color: '#fff',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-bold)',
            lineHeight: 1.4,
            pointerEvents: 'none',
          }}
        >
          {editHighlight
            ? `${safeActorName(editHighlight.displayName) ?? '변경자 미상'} 수정`
            : safeActorName(badgeRemote.displayName) ?? '변경자 미상'}
        </span>
      ) : null}
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        required={required}
        readOnly={effectiveReadOnly}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        data-testid={dataTestId}
        style={textareaStyle}
        onFocus={updateCursor}
        onClick={updateCursor}
        onKeyUp={updateCursor}
        onSelect={updateCursor}
        onBlur={() => {
          updateCursor()
          if (!effectiveReadOnly) onBlur?.()
        }}
        onChange={(event) => {
          if (effectiveReadOnly) return
          const nextValue = event.target.value
          onValueChange(nextValue)
          if (provider) {
            provider.setHeaderValue(headerKeyFromFieldPath(fieldPath), nextValue)
            provider.setLocalLastEdit(fieldPath)
          }
          updateCursor()
        }}
      />
    </span>
  )
}
