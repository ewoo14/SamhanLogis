import { Button } from '@samhan/design-system'

import { ELEMENT_TYPE_LABEL } from '../../print/templateSchema'
import type { EditableElementType } from './useTemplateDraft'

// H-F: 레거시 4종(META_ROWS/CONTENT_PARAGRAPHS/FIELD_TABLE/ATTACHMENT_TABLE)은 인스펙터에서 삭제할
// 수 있는데(TITLE/APPROVAL_GRID/CLOSING 제외) 팔레트가 FIELD/TEXT/APPROVAL_GRID 3종만 추가를 지원해
// 한 번 삭제하면 편집기 안에서 되돌릴 방법이 없었다 — 편집기에서 제거할 수 있는 것은 편집기에서 다시
// 추가할 수 있어야 한다.
const PALETTE_TYPES: EditableElementType[] = [
  'TEXT', 'FIELD', 'APPROVAL_GRID', 'META_ROWS', 'CONTENT_PARAGRAPHS', 'FIELD_TABLE', 'ATTACHMENT_TABLE',
]

export function ElementPalette({
  onAdd,
  canEdit,
}: {
  onAdd: (type: EditableElementType) => void
  /** H-E: 편집 권한이 없거나 편집 잠금 상태면 요소 추가 자체가 불가능해야 한다. */
  canEdit: boolean
}) {
  return (
    <section aria-label="요소 팔레트" style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>요소 팔레트</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
        밴드에 배치할 요소를 선택하세요.
      </p>
      {PALETTE_TYPES.map((type) => (
        <Button key={type} type="button" variant="secondary" size="sm" disabled={!canEdit} onClick={() => onAdd(type)}>
          {ELEMENT_TYPE_LABEL[type]} 추가
        </Button>
      ))}
    </section>
  )
}
