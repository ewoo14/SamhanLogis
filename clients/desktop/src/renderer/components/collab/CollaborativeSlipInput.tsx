import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes } from 'react'
import { Input } from '@samhan/design-system'
import {
  EDIT_HIGHLIGHT_MS,
  type DocCoeditProvider,
  type RemoteFieldCursor,
  type RemoteFieldEdit,
} from '../../realtime/createCoeditProvider'

// header 키는 dot 을 포함할 수 있으므로(동적필드 field_a.b 등) 첫 dot 이후 전체를 키로; items 는 index.cell 2-세그먼트 유지.
function headerKey(fieldPath: string): string {
  const firstDot = fieldPath.indexOf('.')
  if (firstDot < 0 || fieldPath.slice(0, firstDot) !== 'header') return ''
  return fieldPath.slice(firstDot + 1)
}

function valueFromProvider(provider: DocCoeditProvider, fieldPath: string): string {
  const [scope, rowKey, cellName] = fieldPath.split('.')
  if (scope === 'header') return provider.getHeaderValue(headerKey(fieldPath))
  if (scope === 'items') {
    const key = rowKey ?? ''
    if (/^\d+$/.test(key)) return provider.getItemValue(Number(key), cellName ?? '')
    return provider.getItemValueById(key, cellName ?? '')
  }
  return ''
}

function setProviderValue(provider: DocCoeditProvider, fieldPath: string, value: string) {
  const [scope, rowKey, cellName] = fieldPath.split('.')
  if (scope === 'header') {
    provider.setHeaderValue(headerKey(fieldPath), value)
    return
  }
  if (scope === 'items') {
    const key = rowKey ?? ''
    if (/^\d+$/.test(key)) provider.setItemValue(Number(key), cellName ?? '', value)
    else provider.setItemValueById(key, cellName ?? '', value)
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
  /**
   * 문서 동기화(doc-sync) 유래 값 변경 콜백 — 지정 시 provider 문서 변경 반영에는
   * onValueChange 대신 이 콜백을 호출한다. 단가처럼 onValueChange 에 실입력 부수효과
   * (priceSource=USER 재분류 등)가 있는 필드에서, 자동채움 provider write 의 doc-sync 가
   * pending 분류를 USER 로 덮어 마커를 소멸시키는 것을 차단한다(R4-F6).
   * 미지정 시 기존대로 onValueChange 를 호출한다.
   */
  onDocSyncValueChange?: (value: string) => void
  /**
   * 원시 입력 필터 — 지정 시 DOM {@code onChange} 의 raw 값을 이 함수로 먼저 검증한다.
   * {@code null} 반환 시 그 keystroke 전체를 버린다(onValueChange 미호출 + Y.Doc 미기록) —
   * 단가/공급가액/부가세 등 숫자 전용 셀이 잘못된 문자열(`-3`/`2.7`/`1e3`)을 그대로 Y.Doc 에
   * 써 원격 피어·재열기에 전파하는 것을 막는다(전표 상세 발견 3, #937 R1). 미지정 시(기존
   * 호출부 전부) raw 값을 그대로 통과시켜 기존 동작과 100% 동일하다.
   */
  parseValue?: (raw: string) => string | null
  type?: string
  min?: number
  maxLength?: number
  inputSize?: 'sm' | 'md' | 'lg'
  label?: string
  required?: boolean
  /** 입력 힌트(plain input placeholder 회귀 복원) */
  placeholder?: string
  /** 모바일 숫자 키패드 힌트(수량/단가 회귀 복원) */
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  /** 검증 에러 메시지 — 있으면 Input 빨강 테두리(lookupError 회귀 복원) */
  error?: string
  /** 내부 input 스타일(수량/단가 우측정렬 tabular-nums 회귀 복원) */
  inputStyle?: CSSProperties
  readOnly?: boolean
  onBlur?: () => void
  /** coedit provider 로딩 중 — 로딩 중에만 입력 잠금(이중소스 방지). 로드 실패(provider=null) 시엔 false 라 평문 편집 허용. */
  coeditPending?: boolean
  'data-testid'?: string
  'aria-label': string
  'aria-describedby'?: string
}

export function CollaborativeSlipInput({
  provider,
  fieldPath,
  value,
  onValueChange,
  onDocSyncValueChange,
  parseValue,
  type,
  min,
  maxLength,
  inputSize = 'sm',
  label,
  required,
  placeholder,
  inputMode,
  error,
  inputStyle,
  readOnly,
  onBlur,
  coeditPending,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
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
  // BLOCKING-1 부수 발견(#824 R1): onValueChange/onDocSyncValueChange 는 호출부(SlipDetailPage 등)에서
  // 매 렌더 새 인라인 화살표로 넘어와 참조가 매번 바뀐다. 이 값들을 아래 sync-effect 의 의존성
  // 배열에 두면(구코드) "커밋되지 않은 값 정규화"(예: 숫자 필드 clear → 0)가 Y.Doc 원문(빈 문자열)과
  // 영원히 같아질 수 없는 필드에서 매 렌더마다 effect 가 재구독되며 syncFromDoc() 를 즉시 재호출 →
  // onValueChange 재호출 → setState → 재렌더 → effect 재구독 … 의 무한 루프(React
  // "Maximum update depth exceeded")로 이어져 클리어 자체가 커밋되지 않고 이전 값으로 보였다
  // (라이브 실증: 수량 셀 clear 시 "7" 로 복원). ref 로 "최신 콜백"만 참조해 재구독을
  // fieldPath/provider 변경 시로만 한정한다 — 동작은 동일(항상 최신 콜백 호출)하되 리렌더마다
  // 재구독하지 않는다.
  const onValueChangeRef = useRef(onValueChange)
  onValueChangeRef.current = onValueChange
  const onDocSyncValueChangeRef = useRef(onDocSyncValueChange)
  onDocSyncValueChangeRef.current = onDocSyncValueChange

  useEffect(() => {
    if (!provider) return undefined
    const syncFromDoc = () => {
      const [scope, rowKey] = fieldPath.split('.')
      // 안정키 행이 원격 삭제된 순간에는 빈값을 폼 index state에 반영하지 않는다.
      // 반영하면 아직 렌더에서 제거되지 않은 구 행의 onValueChange가 다음 행을
      // 덮어쓰고, 이어지는 provider write가 잔여 금액을 소실시킨다(D1').
      if (scope === 'items' && rowKey && !/^\d+$/.test(rowKey) && provider.getItemIndexById(rowKey) < 0) return
      const nextValue = valueFromProvider(provider, fieldPath)
      // doc-sync 유래 반영은 실입력(onChange)과 분리 — onDocSyncValueChange 지정 시 그쪽만(R4-F6).
      if (nextValue !== latestValueRef.current) {
        (onDocSyncValueChangeRef.current ?? onValueChangeRef.current)(nextValue)
      }
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
    // onValueChange/onDocSyncValueChange 는 ref 로 최신값을 읽으므로 의도적으로 deps 에서
    // 제외한다(위 주석 — 무한 루프 근본 수정). react-hooks/exhaustive-deps 미설정 프로젝트라
    // eslint-disable 주석은 불필요(추가 시 "unused directive" 경고).
  }, [fieldPath, provider])

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
            // 좁은 셀(수량 80px 등)에서 배지가 인접 셀로 넘치지 않게 셀 폭으로 캡(리뷰 Design).
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
          {editHighlight ? `${editHighlight.displayName} 수정` : badgeRemote.displayName}
        </span>
      ) : null}
      <Input
        ref={inputRef}
        inputSize={inputSize}
        type={type}
        min={min}
        maxLength={maxLength}
        label={label}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        error={error}
        style={inputStyle}
        readOnly={effectiveReadOnly}
        value={value}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        data-testid={dataTestId}
        onFocus={updateCursor}
        onClick={updateCursor}
        onKeyUp={updateCursor}
        onSelect={updateCursor}
        onBlur={() => {
          updateCursor()
          // read-only(잠금/coeditPending) 상태에선 lookup 등 onBlur 부작용 미발생(리뷰 LOW).
          if (!effectiveReadOnly) onBlur?.()
        }}
        onChange={(event) => {
          if (effectiveReadOnly) return
          const raw = event.target.value
          // parseValue 거부(null) 시 keystroke 전체를 버린다 — onValueChange 미호출 +
          // Y.Doc 미기록. controlled input 이라 다음 렌더에서 이전 value prop 으로 되돌아간다.
          const nextValue = parseValue ? parseValue(raw) : raw
          if (nextValue === null) return
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
