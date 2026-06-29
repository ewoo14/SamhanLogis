import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as Y from 'yjs'
import {
  createCoeditProvider,
  type CoeditProvider,
  type RemoteCursor,
} from '../../realtime/createCoeditProvider'

export interface CollaborativeTextFieldProps {
  slipId: string
  fieldName: string
  label: string
  rows?: number
  providerOverride?: CoeditProvider
}

function applyTextareaValue(text: Y.Text, nextValue: string) {
  const prevValue = text.toString()
  if (prevValue === nextValue) return

  let prefix = 0
  while (
    prefix < prevValue.length
    && prefix < nextValue.length
    && prevValue[prefix] === nextValue[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix + prefix < prevValue.length
    && suffix + prefix < nextValue.length
    && prevValue[prevValue.length - 1 - suffix] === nextValue[nextValue.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const deleteLength = prevValue.length - prefix - suffix
  const insertValue = nextValue.slice(prefix, nextValue.length - suffix)
  if (deleteLength > 0) text.delete(prefix, deleteLength)
  if (insertValue.length > 0) text.insert(prefix, insertValue)
}

function clampOffset(value: number, textLength: number): number {
  return Math.max(0, Math.min(value, textLength))
}

function remoteCursorStyle(cursor: RemoteCursor, textLength: number): CSSProperties {
  const min = clampOffset(Math.min(cursor.anchor, cursor.head), textLength)
  const max = clampOffset(Math.max(cursor.anchor, cursor.head), textLength)
  const percent = textLength === 0 ? 0 : (min / textLength) * 100
  const widthPercent = textLength === 0 ? 0 : Math.max(((max - min) / textLength) * 100, 0.8)
  return {
    position: 'absolute',
    left: `calc(${percent}% + 10px)`,
    top: 34,
    minWidth: 2,
    width: max > min ? `${widthPercent}%` : 2,
    maxWidth: 'calc(100% - 20px)',
    height: max > min ? 22 : 28,
    borderLeft: `2px solid ${cursor.color}`,
    background: max > min ? `${cursor.color}22` : 'transparent',
    pointerEvents: 'none',
  }
}

export function CollaborativeTextField({
  slipId,
  fieldName,
  label,
  rows = 4,
  providerOverride,
}: CollaborativeTextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [provider, setProvider] = useState<CoeditProvider | null>(providerOverride ?? null)
  const [value, setValue] = useState(() => providerOverride?.text.toString() ?? '')
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>(() => providerOverride?.getRemoteCursors() ?? [])
  const textareaId = useMemo(() => `coedit-${fieldName}`, [fieldName])

  useEffect(() => {
    if (providerOverride) {
      setProvider(providerOverride)
      setValue(providerOverride.text.toString())
      setRemoteCursors(providerOverride.getRemoteCursors())
      return undefined
    }
    let disposed = false
    let created: CoeditProvider | null = null
    void createCoeditProvider({ slipId, fieldName }).then((next) => {
      if (disposed) {
        next.destroy()
        return
      }
      created = next
      setProvider(next)
      setValue(next.text.toString())
      setRemoteCursors(next.getRemoteCursors())
    })
    return () => {
      disposed = true
      created?.destroy()
    }
  }, [fieldName, providerOverride, slipId])

  useEffect(() => {
    if (!provider) return undefined
    const unsubscribeText = provider.subscribeText(() => {
      const nextValue = provider.text.toString()
      setValue(nextValue)
      const textarea = textareaRef.current
      if (textarea) {
        const offset = clampOffset(textarea.selectionStart, nextValue.length)
        queueMicrotask(() => {
          textarea.setSelectionRange(offset, offset)
        })
      }
    })
    const unsubscribeAwareness = provider.subscribeAwareness(() => {
      setRemoteCursors(provider.getRemoteCursors())
    })
    return () => {
      unsubscribeText()
      unsubscribeAwareness()
    }
  }, [provider])

  const updateLocalCursor = () => {
    const textarea = textareaRef.current
    if (!textarea || !provider) return
    provider.setLocalCursor(textarea.selectionStart, textarea.selectionEnd)
  }

  return (
    <div data-testid="collaborative-text-field" style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={textareaId} style={{ fontSize: 13, fontWeight: 700 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          id={textareaId}
          value={value}
          rows={rows}
          onChange={(event) => {
            const nextValue = event.target.value
            setValue(nextValue)
            if (provider) applyTextareaValue(provider.text, nextValue)
            updateLocalCursor()
          }}
          onClick={updateLocalCursor}
          onKeyUp={updateLocalCursor}
          onSelect={updateLocalCursor}
          style={{
            width: '100%',
            minHeight: 96,
            resize: 'vertical',
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 4,
            padding: '8px 10px',
            font: 'inherit',
            lineHeight: 1.5,
          }}
        />
        {remoteCursors.map((cursor) => (
          <div
            key={cursor.clientId}
            data-testid={`coedit-remote-cursor-${cursor.clientId}`}
            style={remoteCursorStyle(cursor, value.length)}
          >
            <span
              style={{
                position: 'absolute',
                top: -22,
                left: -2,
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                borderRadius: 4,
                padding: '2px 6px',
                background: cursor.color,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {cursor.displayName}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
