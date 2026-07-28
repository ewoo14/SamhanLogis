import { Button } from '@samhan/design-system'
import type { ChangeEvent } from 'react'
import { useState } from 'react'

import {
  DETAIL_COLUMN_KEYS,
  DETAIL_COLUMN_LABEL,
  ELEMENT_TYPE_LABEL,
  BAND_KIND_LABEL,
  canDecodeImageSource,
  isAllowedImageSourceFormat,
  isAllowedImageSource,
  maxImageBytesForDocument,
  MAX_ALT_LENGTH,
  MAX_TEXT_LENGTH,
  type BindingRef,
  type BandKind,
  type DetailColumnKey,
  type DocElement,
  type DocumentPayload,
  type ElementStyle,
  type Geometry,
} from '../../print/templateSchema'
import type { ApprovalTemplateField } from '../../api/groupwareApprovalTemplate'

const FIXED_BINDINGS: Array<{ value: BindingRef; label: string }> = [
  { value: 'header.title', label: '문서 제목' },
  { value: 'header.docNo', label: '문서번호' },
  { value: 'header.issueDate', label: '발행일' },
  { value: 'closing.note', label: '맺음말' },
]
const FIELD_ROW_BINDING = /^body\.fieldRow\[([^\[\]]{1,100})\]$/

/** N-3/R2(#914): fieldOptions(현재 docType의 실서버 본문 필드) 조회 상태 — "화면은 모르는 것을 안다고
 * 말하지 않는다"를 지키려면 조회 중/실패/정말 없음(=조회를 마쳤는데 빈 배열)/**아직 조회를 시도하지도
 * 않음**(docType 미선택) 네 사실을 구분해야 한다. 'unselected'는 'ready'와 다르다 — 'ready'는 "물어봤고
 * 없었다", 'unselected'는 "아직 물어보지 않았다"이다. 기본값 'ready'는 이 prop을 아직 넘기지 않는 기존
 * 호출부와의 하위호환이다. */
export type FieldOptionsStatus = 'loading' | 'error' | 'ready' | 'unselected'

function numberValue(event: ChangeEvent<HTMLInputElement>, fallback: number): number {
  const value = Number(event.target.value)
  return Number.isFinite(value) ? value : fallback
}

const GEOMETRY_LABEL: Record<keyof Geometry, string> = {
  x: '가로 위치(x, %)',
  y: '세로 위치(y, %)',
  w: '가로 크기(w, %)',
  h: '세로 크기(h, %)',
}

export function ElementInspector({
  element,
  onUpdate,
  onRemove,
  document,
  fieldOptions = [],
  fieldOptionsStatus = 'ready',
  onRetryFieldOptions,
  bandKind,
  onMoveBand,
  canEdit,
}: {
  element: DocElement | null
  onUpdate: (patch: Partial<DocElement>) => void
  onRemove: () => void
  document?: DocumentPayload
  fieldOptions?: Pick<ApprovalTemplateField, 'fieldKey' | 'label'>[]
  /** N-3: fieldOptions 조회 상태. 'loading'/'error'에서는 fieldOptions가 아직 신뢰할 수 없으므로
   * "사용할 수 없는 본문 필드"로 단정하지 않는다. */
  fieldOptionsStatus?: FieldOptionsStatus
  /** N-3: 'error' 상태의 회복 수단. */
  onRetryFieldOptions?: () => void
  bandKind?: BandKind
  onMoveBand?: (bandKind: BandKind) => void
  /** H-E: 편집 잠금·권한 없음 상태에서는 속성 편집·삭제 자체가 불가능해야 한다(읽기 전용 표시는 허용). */
  canEdit: boolean
}) {
  const [imageError, setImageError] = useState<string | null>(null)
  if (!element) {
    return <section className="document-template-inspector" aria-label="속성 패널"><h3 style={{ margin: 0, fontSize: 15 }}>속성</h3><p>요소를 선택하세요.</p></section>
  }

  const hasPositionedStyle = element.type === 'FIELD' || element.type === 'TEXT' || element.type === 'DETAIL' || element.type === 'IMAGE'
  const geometry = hasPositionedStyle ? element.geometry : undefined
  const style = hasPositionedStyle ? element.style : undefined
  const updateGeometry = (key: keyof Geometry, value: number) => onUpdate({ geometry: { x: 0, y: 0, w: 100, h: 10, ...geometry, [key]: value } })
  const updateStyle = (patch: Partial<ElementStyle>) => onUpdate({ style: { ...style, ...patch } })
  const fieldRowMatch = element.type === 'FIELD' ? FIELD_ROW_BINDING.exec(element.binding) : null
  const fieldRowKey = fieldRowMatch?.[1]
  const fieldRowBindings = fieldOptions.map((field) => ({
    value: `body.fieldRow[${field.fieldKey}]` as BindingRef,
    label: `본문 필드 · ${field.label}`,
  }))
  const hasKnownFieldBinding = fieldRowKey !== undefined
    && fieldOptions.some((field) => field.fieldKey === fieldRowKey)
  const bindingSelectValue = element.type === 'FIELD' ? element.binding : undefined
  // N-3/R2: fieldOptions가 아직 조회 중이거나 조회에 실패했거나 — R2 — docType 자체를 아직 선택하지
  // 않아 조회를 시도조차 안 했으면 "이 key가 진짜 없다"를 아직 모른다 — 그 상태에서까지 "사용할 수
  // 없는"이라 단정하면 화면이 모르는 것을 안다고 말하는 셈이 된다(정상 필드를 사용자가 지우면 설정이
  // 손실된다 — P-2). ready에서 정말 없는 참조일 때만 기존처럼 단정한다.
  const unknownFieldBinding = bindingSelectValue !== undefined && fieldRowKey !== undefined && !hasKnownFieldBinding
    ? {
        value: bindingSelectValue,
        label: fieldOptionsStatus === 'loading'
          ? `본문 필드 · ${fieldRowKey}(확인 중)`
          : fieldOptionsStatus === 'error'
          ? `본문 필드 · ${fieldRowKey}(목록을 불러오지 못함)`
          : fieldOptionsStatus === 'unselected'
          ? `본문 필드 · ${fieldRowKey}(문서 유형 미선택)`
          : `사용할 수 없는 본문 필드 · ${fieldRowKey}`,
      }
    : null
  const imageMaxBytes = element.type === 'IMAGE' && document
    ? maxImageBytesForDocument(document, element.key)
    : 50 * 1024
  const imageMaxKilobytes = Math.floor(imageMaxBytes / 1024)

  return (
    <section className="document-template-inspector" aria-label="속성 패널" style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>속성</h3>
      <div className="document-template-inspector-selected">
        <span className="document-template-selected-caption">현재 선택</span>
        <strong>{ELEMENT_TYPE_LABEL[element.type]}</strong>
      </div>
      {element.type === 'TEXT' ? (
        <label>
          문구
          {/* R5(#914) P-5: maxLength로 초과분을 버리지 않고, 입력 중 현재 길이와 상한을 함께 알린다.
              저장 시 초과를 차단하는 파서 문구는 그대로 유지한다. */}
          <textarea
            aria-label="문구"
            value={element.text}
            disabled={!canEdit}
            onChange={(event) => onUpdate({ text: event.target.value })}
            rows={3}
            style={{ width: '100%' }}
          />
          <span role="status" aria-live="polite" style={{ display: 'block', fontSize: 12, color: element.text.length > MAX_TEXT_LENGTH ? 'var(--color-danger-700, #a12622)' : 'var(--color-neutral-500)' }}>
            {element.text.length} / {MAX_TEXT_LENGTH}
          </span>
        </label>
      ) : null}
      {element.type === 'FIELD' ? (
        <>
          <label>
            표시할 값
            <select
              aria-label="표시할 값"
              value={bindingSelectValue}
              disabled={!canEdit}
              onChange={(event) => {
                onUpdate({ binding: event.target.value as BindingRef })
              }}
            >
              {FIXED_BINDINGS.map((binding) => <option key={binding.value} value={binding.value}>{binding.label}</option>)}
              {fieldRowBindings.length > 0
                ? fieldRowBindings.map((binding) => <option key={binding.value} value={binding.value}>{binding.label}</option>)
                : (
                  <option value="" disabled>
                    {fieldOptionsStatus === 'loading'
                      ? '본문 필드 불러오는 중…'
                      : fieldOptionsStatus === 'error'
                      ? '본문 필드 목록을 불러오지 못했습니다'
                      : fieldOptionsStatus === 'unselected'
                      ? '본문 필드(문서 유형을 먼저 선택하세요)'
                      : '본문 필드(현재 양식 필드 없음)'}
                  </option>
                )}
              {unknownFieldBinding ? <option value={unknownFieldBinding.value}>{unknownFieldBinding.label}</option> : null}
            </select>
          </label>
          {fieldOptionsStatus === 'error' ? (
            <p role="alert" style={{ margin: 0, color: 'var(--color-danger-700, #a12622)', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              본문 필드 목록을 불러오지 못했습니다.
              <Button type="button" variant="ghost" size="sm" onClick={onRetryFieldOptions}>다시 시도</Button>
            </p>
          ) : fieldOptionsStatus === 'loading' ? (
            <p role="status" style={{ margin: 0, color: 'var(--color-neutral-500)', fontSize: 12 }}>
              본문 필드 목록을 확인하는 중입니다…
            </p>
          ) : fieldOptionsStatus === 'unselected' ? (
            // R2(#914) P-1/P-2: docType 미선택은 "모른다"이지 "없다"가 아니다 — loading/error와 같은
            // 중립적 상태 문구를 쓰고, 정말 없는 참조에만 쓰는 경고문(목록에서 선택하라는 이행 불가능한
            // 지시 포함)은 띄우지 않는다.
            <p role="status" style={{ margin: 0, color: 'var(--color-neutral-500)', fontSize: 12 }}>
              문서 유형을 선택하면 본문 필드 목록을 확인합니다.
            </p>
          ) : fieldRowMatch && !hasKnownFieldBinding ? (
            <p role="alert" style={{ margin: 0, color: 'var(--color-danger-700, #a12622)', fontSize: 12 }}>
              현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.
            </p>
          ) : null}
        </>
      ) : null}
      {element.type === 'DETAIL' ? (
        <fieldset className="document-template-inspector-fieldset" style={{ display: 'grid', gap: 6 }}>
          <legend>반복 열</legend>
          {DETAIL_COLUMN_KEYS.map((column) => {
            const checked = element.columns.includes(column)
            return (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canEdit || (checked && element.columns.length === 1)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...element.columns, column]
                      : element.columns.filter((value) => value !== column)
                    onUpdate({ columns: next as DetailColumnKey[] })
                  }}
                />{' '}
                {DETAIL_COLUMN_LABEL[column]}
              </label>
            )
          })}
        </fieldset>
      ) : null}
      {element.type === 'IMAGE' ? (
        <>
          <label>
            이미지 배치 밴드
            <select
              aria-label="이미지 배치 밴드"
              value={bandKind ?? 'HEADER'}
              disabled={!canEdit}
              onChange={(event) => onMoveBand?.(event.target.value as BandKind)}
            >
              {(Object.keys(BAND_KIND_LABEL) as BandKind[]).map((kind) => <option key={kind} value={kind}>{BAND_KIND_LABEL[kind]}</option>)}
            </select>
          </label>
          <label>
            대체 문구
            {/* R5(#914) P-5: maxLength로 초과분을 버리지 않고, 입력 중 현재 길이와 상한을 함께 알린다. */}
            <input aria-label="이미지 대체 문구" value={element.alt} disabled={!canEdit} onChange={(event) => onUpdate({ alt: event.target.value })} />
            <span role="status" aria-live="polite" style={{ display: 'block', fontSize: 12, color: element.alt.length > MAX_ALT_LENGTH ? 'var(--color-danger-700, #a12622)' : 'var(--color-neutral-500)' }}>
              {element.alt.length} / {MAX_ALT_LENGTH}
            </span>
          </label>
          <label>
            이미지 source
            <input aria-label="이미지 source" value={element.src} disabled={!canEdit} onChange={(event) => {
              setImageError(null)
              onUpdate({ src: event.target.value })
            }} />
          </label>
          <label>
            파일에서 선택
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!canEdit}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = async () => {
                  const src = String(reader.result ?? '')
                  const base64 = src.split(',')[1] ?? ''
                  const decodedBytes = Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.match(/=+$/)?.[0].length ?? 0))
                  if (!isAllowedImageSourceFormat(src)) {
                    setImageError('이미지 파일이 비어 있거나 지원되는 PNG/JPEG/WebP 형식이 아니어서 저장할 수 없습니다.')
                    return
                  }
                  if (decodedBytes > imageMaxBytes) {
                    setImageError(`현재 양식 기준 이미지 최대 ${imageMaxKilobytes}KB까지 저장할 수 있습니다.`)
                    return
                  }
                  if (!(await canDecodeImageSource(src))) {
                    setImageError('이 이미지는 현재 화면에서 표시할 수 없어 저장할 수 없습니다. 다른 이미지를 선택하세요.')
                    return
                  }
                  setImageError(null)
                  onUpdate({ src })
                }
                reader.onerror = () => setImageError('이미지 파일을 읽지 못했습니다.')
                reader.readAsDataURL(file)
              }}
            />
          </label>
          {imageError ? <p role="alert" style={{ margin: 0 }}>{imageError}</p> : null}
        </>
      ) : null}
      {hasPositionedStyle ? (
        <>
          <fieldset className="document-template-inspector-fieldset" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <legend>위치(%)</legend>
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <label key={key}>
                <span aria-hidden="true">{key}</span>
                <input
                  type="number"
                  aria-label={GEOMETRY_LABEL[key]}
                  min={0}
                  max={100}
                  disabled={!canEdit}
                  value={geometry?.[key] ?? ''}
                  onChange={(event) => updateGeometry(key, numberValue(event, geometry?.[key] ?? 0))}
                />
              </label>
            ))}
          </fieldset>
          {geometry !== undefined ? (
            // N-5: 좌표 값 하나만 고쳐도(예: w 칸에만 입력) 이 요소가 조용히 일반 배치(flow)에서
            // 좌표 배치(absolute)로 바뀐다 — 그 자체를 막지는 않되(A-4/A-5가 이미 확립한 "빈 칸에
            // 0을 입력하면 절대배치가 된다" 동작은 유지) 바뀌었다는 사실은 항상 눈에 보이게 한다.
            // N-4: 좌표를 만들 수 있으면 되돌릴 수도 있어야 한다 — 요소를 삭제하지 않고 이 버튼
            // 하나로 "좌표 없음"(geometry: undefined)으로 되돌린다. numberValue의 `Number('')===0`
            // 특성 때문에 네 칸을 전부 지워도 {x:0,y:0,w:0,h:0}(무효 geometry, 저장 차단)에 갇힐 뿐
            // undefined로는 못 돌아간다 — 이 버튼이 그 유일한 탈출구다.
            <div className="document-template-inspector-geometry-status" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--color-info-700, #1c5eab)' }}>
                이 요소는 지정한 좌표로 배치되어 있습니다(일반 배치가 아님).
              </p>
              <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => onUpdate({ geometry: undefined })}>
                좌표 해제
              </Button>
            </div>
          ) : null}
          <fieldset className="document-template-inspector-fieldset" style={{ display: 'grid', gap: 6 }}>
            <legend>스타일</legend>
            {element.type !== 'IMAGE' ? (
              <>
                <label>글꼴 크기<input type="number" min={1} max={200} disabled={!canEdit} value={style?.fontSize ?? ''} onChange={(event) => updateStyle({ fontSize: numberValue(event, style?.fontSize ?? 10) })} /></label>
                <label><input type="checkbox" disabled={!canEdit} checked={style?.bold ?? false} onChange={(event) => updateStyle({ bold: event.target.checked })} /> 굵게</label>
                <label>정렬<select disabled={!canEdit} value={style?.align ?? 'left'} onChange={(event) => updateStyle({ align: event.target.value as ElementStyle['align'] })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
              </>
            ) : null}
            <label><input type="checkbox" disabled={!canEdit} checked={style?.border ?? false} onChange={(event) => updateStyle({ border: event.target.checked })} /> 테두리</label>
          </fieldset>
        </>
      ) : null}
      {element.type !== 'TITLE' && element.type !== 'APPROVAL_GRID' && element.type !== 'CLOSING' ? (
        <Button type="button" variant="danger" size="sm" disabled={!canEdit} onClick={onRemove}>요소 삭제</Button>
      ) : null}
    </section>
  )
}
