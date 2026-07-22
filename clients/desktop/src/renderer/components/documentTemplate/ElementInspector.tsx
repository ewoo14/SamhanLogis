import { Button } from '@samhan/design-system'
import type { ChangeEvent } from 'react'

import { ELEMENT_TYPE_LABEL, type BindingRef, type DocElement, type ElementStyle, type Geometry } from '../../print/templateSchema'

const FIXED_BINDINGS: Array<{ value: BindingRef; label: string }> = [
  { value: 'header.title', label: '문서 제목' },
  { value: 'header.docNo', label: '문서번호' },
  { value: 'header.issueDate', label: '발행일' },
  { value: 'closing.note', label: '맺음말' },
]
const FIELD_ROW_BINDING = /^body\.fieldRow\[([A-Za-z0-9_.-]{1,100})\]$/
/** LOW: FIELD binding 선택지에 본문 필드 경로가 없어 FIELD 가 기존 출력을 중복 표시하는 것만
 * 가능했다. 본문 필드 참조를 직접 입력할 수 있는 선택지를 추가한다. */
const FIELD_ROW_OPTION = 'FIELD_ROW'

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
  canEdit,
}: {
  element: DocElement | null
  onUpdate: (patch: Partial<DocElement>) => void
  onRemove: () => void
  /** H-E: 편집 잠금·권한 없음 상태에서는 속성 편집·삭제 자체가 불가능해야 한다(읽기 전용 표시는 허용). */
  canEdit: boolean
}) {
  if (!element) {
    return <section className="document-template-inspector" aria-label="속성 패널"><h3 style={{ margin: 0, fontSize: 15 }}>속성</h3><p>요소를 선택하세요.</p></section>
  }

  const geometry = element.type === 'FIELD' || element.type === 'TEXT' ? element.geometry : undefined
  const style = element.type === 'FIELD' || element.type === 'TEXT' ? element.style : undefined
  const updateGeometry = (key: keyof Geometry, value: number) => onUpdate({ geometry: { x: 0, y: 0, w: 100, h: 10, ...geometry, [key]: value } })
  const updateStyle = (patch: Partial<ElementStyle>) => onUpdate({ style: { ...style, ...patch } })
  const fieldRowMatch = element.type === 'FIELD' ? FIELD_ROW_BINDING.exec(element.binding) : null
  const bindingSelectValue = element.type === 'FIELD'
    ? (fieldRowMatch ? FIELD_ROW_OPTION : element.binding)
    : undefined

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
          <textarea
            aria-label="문구"
            value={element.text}
            disabled={!canEdit}
            onChange={(event) => onUpdate({ text: event.target.value })}
            rows={3}
            style={{ width: '100%' }}
          />
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
                const next = event.target.value
                if (next === FIELD_ROW_OPTION) {
                  onUpdate({ binding: 'body.fieldRow[field-key]' as BindingRef })
                  return
                }
                onUpdate({ binding: next as BindingRef })
              }}
            >
              {FIXED_BINDINGS.map((binding) => <option key={binding.value} value={binding.value}>{binding.label}</option>)}
              <option value={FIELD_ROW_OPTION}>본문 필드 참조(직접 입력)</option>
            </select>
          </label>
          {fieldRowMatch ? (
            <label>
              본문 필드 키
              <input
                aria-label="본문 필드 키"
                value={fieldRowMatch[1]}
                disabled={!canEdit}
                onChange={(event) => onUpdate({ binding: `body.fieldRow[${event.target.value}]` as BindingRef })}
              />
            </label>
          ) : null}
        </>
      ) : null}
      {element.type === 'FIELD' || element.type === 'TEXT' ? (
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
                  value={geometry?.[key] ?? (key === 'w' ? 100 : key === 'h' ? 10 : 0)}
                  onChange={(event) => updateGeometry(key, numberValue(event, geometry?.[key] ?? 0))}
                />
              </label>
            ))}
          </fieldset>
          <fieldset className="document-template-inspector-fieldset" style={{ display: 'grid', gap: 6 }}>
            <legend>스타일</legend>
            <label>글꼴 크기<input type="number" min={1} max={200} disabled={!canEdit} value={style?.fontSize ?? ''} onChange={(event) => updateStyle({ fontSize: numberValue(event, style?.fontSize ?? 10) })} /></label>
            <label><input type="checkbox" disabled={!canEdit} checked={style?.bold ?? false} onChange={(event) => updateStyle({ bold: event.target.checked })} /> 굵게</label>
            <label>정렬<select disabled={!canEdit} value={style?.align ?? 'left'} onChange={(event) => updateStyle({ align: event.target.value as ElementStyle['align'] })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
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
