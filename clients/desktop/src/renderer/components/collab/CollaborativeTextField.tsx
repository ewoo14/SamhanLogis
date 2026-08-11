import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as Y from 'yjs'
import { safeActorName } from '@samhan/design-system'
import {
  EDIT_HIGHLIGHT_MS,
  createCoeditProvider,
  type CoeditProvider,
  type RemoteCursor,
  type RemoteFieldEdit,
} from '../../realtime/createCoeditProvider'

export interface CollaborativeTextFieldProps {
  documentId: string
  basePath: string
  fieldName: string
  label: string
  rows?: number
  readOnly?: boolean
  providerOverride?: CoeditProvider
}

// mirror-div 로 복제할 textarea 스타일(폰트/패딩/보더/wrapping) — caret 좌표를 멀티라인·줄바꿈 반영해 계산.
const MIRROR_STYLE_PROPS = [
  'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
]

interface CaretPoint {
  top: number
  left: number
  height: number
}

interface CursorOverlay extends RemoteCursor {
  caret: CaretPoint
  /** 같은 줄 선택일 때만 하이라이트 폭(멀티라인 선택은 caret 만 — S2). */
  selectionWidth: number | null
}

interface TextDiff {
  prefix: number
  deleteLength: number
  insertValue: string
}

interface CompositionDraft {
  startValue: string
  start: Y.RelativePosition
  end: Y.RelativePosition
}

interface RelativeSelection {
  anchor: Y.RelativePosition
  head: Y.RelativePosition
}

type ProviderStatus = 'loading' | 'ready' | 'failed'

/**
 * textarea 내 특정 offset 의 caret 화면 좌표를 mirror-div 기법으로 계산한다.
 * 전체 문자 비율(%) 단순 치환은 멀티라인에서 어긋나므로(리뷰 B-4), 실제 wrapping 을 복제해 측정한다.
 */
function caretCoordinates(textarea: HTMLTextAreaElement, offset: number): CaretPoint {
  const doc = textarea.ownerDocument
  const win = doc.defaultView ?? window
  const computed = win.getComputedStyle(textarea)
  const mirror = doc.createElement('div')
  const style = mirror.style
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.whiteSpace = 'pre-wrap'
  style.overflowWrap = 'break-word'
  style.top = '0'
  style.left = '-9999px'
  for (const prop of MIRROR_STYLE_PROPS) {
    const cssName = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    style.setProperty(cssName, computed.getPropertyValue(cssName))
  }
  mirror.textContent = textarea.value.slice(0, offset)
  const marker = doc.createElement('span')
  marker.textContent = textarea.value.slice(offset) || '​'
  mirror.appendChild(marker)
  doc.body.appendChild(mirror)
  const lineHeight = parseFloat(computed.lineHeight)
    || parseFloat(computed.fontSize) * 1.5
    || 18
  const point: CaretPoint = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: lineHeight,
  }
  doc.body.removeChild(mirror)
  return point
}

function diffTextValues(prevValue: string, nextValue: string): TextDiff | null {
  if (prevValue === nextValue) return null
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
  return { prefix, deleteLength, insertValue }
}

function applyTextDiff(text: Y.Text, index: number, deleteLength: number, insertValue: string) {
  if (deleteLength > 0) text.delete(index, deleteLength)
  if (insertValue.length > 0) text.insert(index, insertValue)
}

function applyTextareaValue(text: Y.Text, nextValue: string) {
  const diff = diffTextValues(text.toString(), nextValue)
  if (!diff) return
  applyTextDiff(text, diff.prefix, diff.deleteLength, diff.insertValue)
}

function absoluteIndexFromRelative(text: Y.Text, position: Y.RelativePosition, fallback: number): number {
  const doc = text.doc
  if (!doc) return fallback
  const absolute = Y.createAbsolutePositionFromRelativePosition(position, doc)
  if (!absolute || absolute.type !== text) return fallback
  return clampOffset(absolute.index, text.length)
}

function applyComposedTextareaValue(text: Y.Text, draft: CompositionDraft, nextValue: string) {
  const diff = diffTextValues(draft.startValue, nextValue)
  if (!diff) return
  const start = absoluteIndexFromRelative(text, draft.start, diff.prefix)
  const end = absoluteIndexFromRelative(text, draft.end, diff.prefix + diff.deleteLength)
  applyTextDiff(text, start, Math.max(end - start, 0), diff.insertValue)
}

function clampOffset(value: number, textLength: number): number {
  return Math.max(0, Math.min(value, textLength))
}

export function CollaborativeTextField({
  documentId,
  basePath,
  fieldName,
  label,
  rows = 4,
  readOnly = false,
  providerOverride,
}: CollaborativeTextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composingRef = useRef(false)
  const compositionDraftRef = useRef<CompositionDraft | null>(null)
  const pendingRemoteRef = useRef(false)
  const localSelectionRef = useRef<RelativeSelection | null>(null)
  const [provider, setProvider] = useState<CoeditProvider | null>(providerOverride ?? null)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(providerOverride ? 'ready' : 'loading')
  const [value, setValue] = useState(() => providerOverride?.text.toString() ?? '')
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>(() => providerOverride?.getRemoteCursors() ?? [])
  // awareness 네임스페이스를 'field.'로 분리 — 전체폼 coedit 모달의 header.{field}/items.N.{cell}
  // fieldPath 와 충돌해 presence 하이라이트가 블리드되는 것 방지(동일 basePath 채널 공유 시).
  const editFieldPath = useMemo(() => `field.${fieldName}`, [fieldName])
  const [remoteEdits, setRemoteEdits] = useState<RemoteFieldEdit[]>(() => (
    providerOverride?.getRemoteEdits(editFieldPath) ?? []
  ))
  const editHighlight = remoteEdits[0]
  const [overlays, setOverlays] = useState<CursorOverlay[]>([])
  const [scrollTick, setScrollTick] = useState(0)
  const textareaId = useMemo(() => `coedit-${fieldName}`, [fieldName])
  const statusId = useMemo(() => `${textareaId}-status`, [textareaId])
  const effectiveReadOnly = readOnly || providerStatus !== 'ready'

  useEffect(() => {
    if (providerOverride) {
      setProvider(providerOverride)
      setProviderStatus('ready')
      setValue(providerOverride.text.toString())
      setRemoteCursors(providerOverride.getRemoteCursors())
      setRemoteEdits(providerOverride.getRemoteEdits(editFieldPath))
      return undefined
    }
    let disposed = false
    let created: CoeditProvider | null = null
    setProvider(null)
    setProviderStatus('loading')
    setValue('')
    setRemoteCursors([])
    setRemoteEdits([])
    void createCoeditProvider({ documentId, basePath, fieldName })
      .then((next) => {
        if (disposed) {
          next.destroy()
          return
        }
        created = next
        setProvider(next)
        setProviderStatus('ready')
        setValue(next.text.toString())
        setRemoteCursors(next.getRemoteCursors())
        setRemoteEdits(next.getRemoteEdits(editFieldPath))
      })
      .catch((error) => {
        // coedit 초기화 실패(네트워크/4xx/5xx/응답 형식 오류) 시 입력을 잠근다.
        // provider 없이 쓰기 허용 시 저장되지 않는 로컬 메모처럼 보여 데이터 유실을 유발한다.
        if (!disposed) {
          setProvider(null)
          setProviderStatus('failed')
          setValue('')
          setRemoteCursors([])
          setRemoteEdits([])
          console.warn('[coedit] provider 초기화 실패 — 입력 잠금', error)
        }
      })
    return () => {
      disposed = true
      created?.destroy()
    }
  }, [basePath, documentId, editFieldPath, fieldName, providerOverride])

  useEffect(() => {
    if (!provider) return undefined
    const applyRemoteText = () => {
      const nextValue = provider.text.toString()
      // IME 조합 중엔 remote 반영을 보류 — value 교체가 조합을 강제 중단시키는 한글 입력 파손 방지(리뷰 FE B-1).
      if (composingRef.current) {
        pendingRemoteRef.current = true
        return
      }
      setValue(nextValue)
      const textarea = textareaRef.current
      if (textarea) {
        const selection = localSelectionRef.current
        const fallbackStart = clampOffset(textarea.selectionStart, nextValue.length)
        const fallbackEnd = clampOffset(textarea.selectionEnd, nextValue.length)
        const start = selection
          ? absoluteIndexFromRelative(provider.text, selection.anchor, fallbackStart)
          : fallbackStart
        const end = selection
          ? absoluteIndexFromRelative(provider.text, selection.head, fallbackEnd)
          : fallbackEnd
        queueMicrotask(() => {
          textarea.setSelectionRange(start, end)
          provider.setLocalCursor(start, end)
        })
      }
    }
    const unsubscribeText = provider.subscribeText(applyRemoteText)
    const unsubscribeAwareness = provider.subscribeAwareness(() => {
      setRemoteCursors(provider.getRemoteCursors())
      setRemoteEdits(provider.getRemoteEdits(editFieldPath))
    })
    return () => {
      unsubscribeText()
      unsubscribeAwareness()
    }
  }, [editFieldPath, provider])

  useEffect(() => {
    const first = remoteEdits[0]
    if (!provider || !first) return undefined
    // ts 기준 잔여시간 스케줄 — 무관 awareness 리셋에도 편집 ts+EDIT_HIGHLIGHT_MS 에 정확히 소멸(리뷰 FE/Design NB-1).
    const remaining = Math.max(0, first.ts + EDIT_HIGHLIGHT_MS - Date.now())
    const timer = setTimeout(() => {
      setRemoteEdits(provider.getRemoteEdits(editFieldPath))
    }, remaining)
    return () => clearTimeout(timer)
  }, [editFieldPath, provider, remoteEdits])

  // remote 커서/셀렉트 화면 좌표 계산(mirror-div) — 값/커서/스크롤 변경 시 재측정.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      setOverlays([])
      return
    }
    const next: CursorOverlay[] = remoteCursors.map((cursor) => {
      const head = clampOffset(cursor.head, value.length)
      const min = clampOffset(Math.min(cursor.anchor, cursor.head), value.length)
      const max = clampOffset(Math.max(cursor.anchor, cursor.head), value.length)
      const caret = caretCoordinates(textarea, head)
      let selectionWidth: number | null = null
      if (max > min) {
        const a = caretCoordinates(textarea, min)
        const b = caretCoordinates(textarea, max)
        // 같은 줄 선택만 단순 하이라이트(멀티라인 선택 정밀 렌더는 S2).
        if (Math.abs(a.top - b.top) < 1) {
          caret.top = a.top
          caret.left = a.left
          selectionWidth = Math.max(b.left - a.left, 2)
        }
      }
      return { ...cursor, caret, selectionWidth }
    })
    setOverlays(next)
  }, [value, remoteCursors, scrollTick])

  const rememberLocalSelection = () => {
    const textarea = textareaRef.current
    if (!textarea || !provider) return
    localSelectionRef.current = {
      anchor: Y.createRelativePositionFromTypeIndex(provider.text, textarea.selectionStart),
      head: Y.createRelativePositionFromTypeIndex(provider.text, textarea.selectionEnd),
    }
  }

  const updateLocalCursor = () => {
    const textarea = textareaRef.current
    if (!textarea || !provider) return
    rememberLocalSelection()
    provider.setLocalCursor(textarea.selectionStart, textarea.selectionEnd)
  }

  const labelStyle: CSSProperties = {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-neutral-800)',
  }

  return (
    <div data-testid="collaborative-text-field" style={{ display: 'grid', gap: 6 }}>
      <label
        htmlFor={textareaId}
        style={{
          ...labelStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span>{label}</span>
        {editHighlight ? (
          <span
            aria-hidden="true"
            style={{
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              borderRadius: 4,
              padding: '1px 6px',
              background: editHighlight.color,
              color: '#fff',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {safeActorName(editHighlight.displayName) ?? '변경자 미상'} 수정
          </span>
        ) : null}
      </label>
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          id={textareaId}
          aria-label={label}
          aria-describedby={statusId}
          value={value}
          rows={rows}
          readOnly={effectiveReadOnly}
          onChange={(event) => {
            if (effectiveReadOnly) return
            const nextValue = event.target.value
            setValue(nextValue)
            // 조합 중엔 Y.Text 반영 보류 — 중간 자모 delta 노이즈 방지. compositionEnd 에서 확정 반영.
            if (!composingRef.current && provider) applyTextareaValue(provider.text, nextValue)
            if (provider) provider.setLocalLastEdit(editFieldPath)
            updateLocalCursor()
          }}
          onClick={updateLocalCursor}
          onKeyUp={updateLocalCursor}
          onSelect={updateLocalCursor}
          onScroll={() => setScrollTick((tick) => tick + 1)}
          onCompositionStart={() => {
            composingRef.current = true
            if (provider) {
              const textarea = textareaRef.current
              const start = textarea?.selectionStart ?? 0
              const end = textarea?.selectionEnd ?? start
              compositionDraftRef.current = {
                startValue: value,
                start: Y.createRelativePositionFromTypeIndex(provider.text, start),
                end: Y.createRelativePositionFromTypeIndex(provider.text, end),
              }
            }
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false
            if (provider) {
              const draft = compositionDraftRef.current
              if (draft) {
                applyComposedTextareaValue(provider.text, draft, event.currentTarget.value)
              } else {
                applyTextareaValue(provider.text, event.currentTarget.value)
              }
              provider.setLocalLastEdit(editFieldPath)
            }
            compositionDraftRef.current = null
            if (pendingRemoteRef.current) {
              pendingRemoteRef.current = false
              const latest = provider?.text.toString() ?? event.currentTarget.value
              setValue(latest)
            }
            updateLocalCursor()
          }}
          style={{
            width: '100%',
            minHeight: 96,
            resize: 'vertical',
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 4,
            padding: overlays.length > 0 ? '24px 10px 8px' : '8px 10px',
            font: 'inherit',
            lineHeight: 1.5,
            background: effectiveReadOnly ? 'var(--color-neutral-50)' : undefined,
            boxShadow: editHighlight ? `0 0 0 2px ${editHighlight.color}` : undefined,
          }}
        />
        {editHighlight ? (
          <span
            key={editHighlight.ts}
            data-testid="memo-coedit-edit-pulse"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              borderRadius: 4,
              background: `${editHighlight.color}22`,
              animation: `slip-edit-pulse ${EDIT_HIGHLIGHT_MS}ms ease-out forwards`,
              pointerEvents: 'none',
            }}
          />
        ) : null}
        {overlays.map((overlay) => (
          <div
            key={overlay.clientId}
            data-testid={`coedit-remote-cursor-${overlay.clientId}`}
            aria-hidden="true"
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {overlay.selectionWidth != null ? (
              <div
                style={{
                  position: 'absolute',
                  top: overlay.caret.top,
                  left: overlay.caret.left,
                  width: overlay.selectionWidth,
                  height: overlay.caret.height,
                  // hex 팔레트이므로 8자리 hex alpha(33≈20%) 유효.
                  background: `${overlay.color}33`,
                }}
              />
            ) : null}
            <div
              style={{
                position: 'absolute',
                top: overlay.caret.top,
                left: overlay.caret.left,
                width: 2,
                height: overlay.caret.height,
                background: overlay.color,
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: Math.max(overlay.caret.top - 18, 0),
                left: overlay.caret.left,
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                borderRadius: 4,
                padding: '1px 6px',
                background: overlay.color,
                color: '#fff',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {safeActorName(overlay.displayName) ?? '변경자 미상'}
            </span>
          </div>
        ))}
      </div>
      {providerStatus === 'loading' ? (
        <p id={statusId} style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' }}>
          협업 메모 연결 중...
        </p>
      ) : null}
      {providerStatus === 'failed' ? (
        <p
          id={statusId}
          role="alert"
          style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-danger-600)' }}
        >
          협업 메모 연결에 실패했습니다. 새로고침 후 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  )
}
