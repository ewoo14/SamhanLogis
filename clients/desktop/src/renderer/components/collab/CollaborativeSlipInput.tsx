import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Input } from '@samhan/design-system'
import {
  EDIT_HIGHLIGHT_MS,
  type DocCoeditProvider,
  type RemoteFieldCursor,
  type RemoteFieldEdit,
} from '../../realtime/createCoeditProvider'

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

const EMPTY_EDITS: RemoteFieldEdit[] = []
function remoteEditsFor(provider: DocCoeditProvider | null, fieldPath: string): RemoteFieldEdit[] {
  const edits = provider?.getRemoteEdits(fieldPath) ?? EMPTY_EDITS
  // 빈 결과는 안정 참조로 반환 — 무관 awareness tick 의 불필요 setState/리셋 방지(리뷰 FE NB-3).
  return edits.length === 0 ? EMPTY_EDITS : edits
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
  /** coedit provider 로딩 중 — 로딩 중에만 입력 잠금(이중소스 방지). 로드 실패(provider=null) 시엔 false 라 평문 편집 허용. */
  coeditPending?: boolean
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
  coeditPending,
  'aria-label': ariaLabel,
}: CollaborativeSlipInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latestValueRef = useRef(value)
  const [remoteCursors, setRemoteCursors] = useState<RemoteFieldCursor[]>(() => remoteCursorsFor(provider, fieldPath))
  const [remoteEdits, setRemoteEdits] = useState<RemoteFieldEdit[]>(() => remoteEditsFor(provider, fieldPath))
  const primaryRemote = remoteCursors[0]
  const editHighlight = remoteEdits[0]
  const badgeRemote = editHighlight ?? primaryRemote
  // 로딩 중(coeditPending)에만 잠금. provider=null 자체(로드 실패/비활성)는 평문 편집 허용 — onChange 가 modal state 갱신, Yjs 는 provider 있을 때만(영구잠금 회귀 방지, 리뷰 Opus 라운드2).
  const effectiveReadOnly = readOnly || !!coeditPending
  latestValueRef.current = value

  useEffect(() => {
    if (!provider) return undefined
    const syncFromDoc = () => {
      const nextValue = valueFromProvider(provider, fieldPath)
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
    // ts 기준 잔여시간으로 스케줄 — 무관 awareness 변경에 타이머가 리셋돼도 편집 ts+EDIT_HIGHLIGHT_MS 에 정확히 소멸(리뷰 FE/Design NB-1, 배지 잔존 차단).
    const remaining = Math.max(0, first.ts + EDIT_HIGHLIGHT_MS - Date.now())
    const timer = setTimeout(() => {
      setRemoteEdits(remoteEditsFor(provider, fieldPath))
    }, remaining)
    return () => clearTimeout(timer)
  }, [fieldPath, provider, remoteEdits])

  const wrapperStyle = useMemo<CSSProperties>(() => {
    // position: relative — 이름 배지를 absolute 오버레이(입력란 위)로 띄워 품목 테이블 셀 높이·행 정렬 불변(리뷰 Design B-2).
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
    const input = inputRef.current
    const anchor = input?.selectionStart ?? 0
    const head = input?.selectionEnd ?? anchor
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
            maxWidth: 140,
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
          {editHighlight ? `${editHighlight.displayName} 수정` : badgeRemote.displayName}
        </span>
      ) : null}
      <Input
        ref={inputRef}
        inputSize={inputSize}
        type={type}
        min={min}
        maxLength={maxLength}
        readOnly={effectiveReadOnly}
        value={value}
        aria-label={ariaLabel}
        onFocus={updateCursor}
        onClick={updateCursor}
        onKeyUp={updateCursor}
        onSelect={updateCursor}
        onChange={(event) => {
          if (effectiveReadOnly) return
          const nextValue = event.target.value
          onValueChange(nextValue)
          if (provider) {
            setProviderValue(provider, fieldPath, nextValue)
            provider.setLocalLastEdit(fieldPath)
          }
          updateCursor()
        }}
      />
    </span>
  )
}
