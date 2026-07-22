import type { EditableElementType } from './useTemplateDraft'

export function ElementPalette({ onAdd }: { onAdd: (type: EditableElementType) => void }) {
  return (
    <section aria-label="요소 팔레트" style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>요소 팔레트</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
        밴드에 배치할 요소를 선택하세요.
      </p>
      <button type="button" onClick={() => onAdd('TEXT')}>TEXT 추가</button>
      <button type="button" onClick={() => onAdd('FIELD')}>FIELD 추가</button>
      <button type="button" onClick={() => onAdd('APPROVAL_GRID')}>APPROVAL_GRID 추가</button>
    </section>
  )
}
