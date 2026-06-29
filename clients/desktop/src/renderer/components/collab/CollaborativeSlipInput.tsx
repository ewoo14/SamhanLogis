import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@samhan/design-system'
import type { DocCoeditProvider, RemoteFieldCursor } from '../../realtime/createCoeditProvider'

function valueFromProvider(provider: DocCoeditProvider, fieldPath: string): string {
  const [scope, rowIndex, cellName] = fieldPath.split('.')
  if (scope === 'header') return provider.getHeaderValue(rowIndex ?? '')
  if (scope === 'items') return provider.getItemValue(Number(rowIndex), cellName ?? '')
  return ''
}

function setProviderValue(provider: DocCoeditProvider, fieldPath: string, value: string) {
  const [scope, rowIndex, cellName] = fieldPath.split('.')
  if (scope === 'header') {
    provider.setHeaderValue(rowIndex ?? '', value)
    return
  }
  if (scope === 'items') {
    provider.setItemValue(Number(rowIndex), cellName ?? '', value)
  }
}

function remoteCursorsFor(provider: DocCoeditProvider | null, fieldPath: string): RemoteFieldCursor[] {
  return provider?.getRemoteCursors(fieldPath) ?? []
}

export interface CollaborativeSlipInputProps {
  provider: DocCoeditProvider | null
  fieldPath: string
  value: string
  onValueChange: (value: string) => void
  type?: string
  min?: number
  maxLength?: number
  inputSize?: 'sm' | 'md' | 'lg'
  readOnly?: boolean
  'aria-label': string
}

export function CollaborativeSlipInput({
  provider,
  fieldPath,
  value,
  onValueChange,
  type,
  min,
  maxLength,
  inputSize = 'sm',
  readOnly,
  'aria-label': ariaLabel,
}: CollaborativeSlipInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latestValueRef = useRef(value)
  const [remoteCursors, setRemoteCursors] = useState<RemoteFieldCursor[]>(() => remoteCursorsFor(provider, fieldPath))
  const primaryRemote = remoteCursors[0]
  latestValueRef.current = value

  useEffect(() => {
    if (!provider) return undefined
    const syncFromDoc = () => {
      const nextValue = valueFromProvider(provider, fieldPath)
      if (nextValue !== latestValueRef.current) onValueChange(nextValue)
    }
    const syncAwareness = () => setRemoteCursors(remoteCursorsFor(provider, fieldPath))
    syncFromDoc()
    syncAwareness()
    const unsubscribeDoc = provider.subscribeDoc(syncFromDoc)
    const unsubscribeAwareness = provider.subscribeAwareness(syncAwareness)
    return () => {
      unsubscribeDoc()
      unsubscribeAwareness()
    }
  }, [fieldPath, onValueChange, provider])

  const wrapperStyle = useMemo(() => {
    if (!primaryRemote) return undefined
    return {
      borderRadius: 5,
      boxShadow: `0 0 0 2px ${primaryRemote.color}`,
      background: `${primaryRemote.color}14`,
    }
  }, [primaryRemote])

  const updateCursor = () => {
    if (!provider) return
    const input = inputRef.current
    const anchor = input?.selectionStart ?? 0
    const head = input?.selectionEnd ?? anchor
    provider.setLocalCursor(fieldPath, anchor, head)
  }

  return (
    <span
      data-testid={`slip-coedit-field-${fieldPath.replace(/\./g, '-')}`}
      style={{ display: 'grid', gap: 2, padding: primaryRemote ? 2 : 0, ...wrapperStyle }}
    >
      {primaryRemote ? (
        <span
          style={{
            justifySelf: 'start',
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            borderRadius: 4,
            padding: '1px 6px',
            background: primaryRemote.color,
            color: '#fff',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          {primaryRemote.displayName}
        </span>
      ) : null}
      <Input
        ref={inputRef}
        inputSize={inputSize}
        type={type}
        min={min}
        maxLength={maxLength}
        readOnly={readOnly}
        value={value}
        aria-label={ariaLabel}
        onFocus={updateCursor}
        onClick={updateCursor}
        onKeyUp={updateCursor}
        onSelect={updateCursor}
        onChange={(event) => {
          const nextValue = event.target.value
          onValueChange(nextValue)
          if (!readOnly && provider) setProviderValue(provider, fieldPath, nextValue)
          updateCursor()
        }}
      />
    </span>
  )
}
