import type { ChangeEvent } from 'react'
import type { BindingRef, DocElement, ElementStyle, Geometry } from '../../print/templateSchema'

const bindings: Array<{ value: BindingRef; label: string }> = [
  { value: 'header.title', label: '문서 제목' },
  { value: 'header.docNo', label: '문서번호' },
  { value: 'header.issueDate', label: '발행일' },
  { value: 'closing.note', label: '맺음말' },
]

function numberValue(event: ChangeEvent<HTMLInputElement>, fallback: number): number {
  const value = Number(event.target.value)
  return Number.isFinite(value) ? value : fallback
}

export function ElementInspector({
  element,
  onUpdate,
  onRemove,
}: {
  element: DocElement | null
  onUpdate: (patch: Partial<DocElement>) => void
  onRemove: () => void
}) {
  if (!element) {
    return <section aria-label="속성 패널"><h3 style={{ margin: 0, fontSize: 15 }}>속성</h3><p>요소를 선택하세요.</p></section>
  }

  const geometry = element.type === 'FIELD' || element.type === 'TEXT' ? element.geometry : undefined
  const style = element.type === 'FIELD' || element.type === 'TEXT' ? element.style : undefined
  const updateGeometry = (key: keyof Geometry, value: number) => onUpdate({ geometry: { x: 0, y: 0, w: 100, h: 10, ...geometry, [key]: value } })
  const updateStyle = (patch: Partial<ElementStyle>) => onUpdate({ style: { ...style, ...patch } })

  return (
    <section aria-label="속성 패널" style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>속성</h3>
      <strong>{element.type}</strong>
      {element.type === 'TEXT' ? (
        <label>
          문구
          <textarea aria-label="문구" value={element.text} onChange={(event) => onUpdate({ text: event.target.value })} rows={3} style={{ width: '100%' }} />
        </label>
      ) : null}
      {element.type === 'FIELD' ? (
        <label>
          binding
          <select aria-label="binding" value={element.binding} onChange={(event) => onUpdate({ binding: event.target.value as BindingRef })}>
            {bindings.map((binding) => <option key={binding.value} value={binding.value}>{binding.label}</option>)}
          </select>
        </label>
      ) : null}
      {element.type === 'FIELD' || element.type === 'TEXT' ? (
        <>
          <fieldset style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <legend>위치(%)</legend>
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <label key={key}>{key}<input type="number" min={0} max={100} value={geometry?.[key] ?? (key === 'w' ? 100 : key === 'h' ? 10 : 0)} onChange={(event) => updateGeometry(key, numberValue(event, geometry?.[key] ?? 0))} /></label>
            ))}
          </fieldset>
          <fieldset style={{ display: 'grid', gap: 6 }}>
            <legend>스타일</legend>
            <label>글꼴 크기<input type="number" min={1} max={200} value={style?.fontSize ?? ''} onChange={(event) => updateStyle({ fontSize: numberValue(event, style?.fontSize ?? 10) })} /></label>
            <label><input type="checkbox" checked={style?.bold ?? false} onChange={(event) => updateStyle({ bold: event.target.checked })} /> 굵게</label>
            <label>정렬<select value={style?.align ?? 'left'} onChange={(event) => updateStyle({ align: event.target.value as ElementStyle['align'] })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
            <label><input type="checkbox" checked={style?.border ?? false} onChange={(event) => updateStyle({ border: event.target.checked })} /> 테두리</label>
          </fieldset>
        </>
      ) : null}
      {element.type !== 'TITLE' && element.type !== 'APPROVAL_GRID' && element.type !== 'CLOSING' ? <button type="button" onClick={onRemove}>요소 삭제</button> : null}
    </section>
  )
}
