import { Button } from '@samhan/design-system'

import { BAND_KIND_LABEL, ELEMENT_TYPE_LABEL, type Band } from '../../print/templateSchema'

export function BandCanvas({
  bands,
  selectedKey,
  onSelect,
  onMove,
  canEdit,
}: {
  bands: Band[]
  selectedKey: string | null
  onSelect: (key: string) => void
  /** M-J: 밴드 내 요소 순서 이동(위/아래) — spec §1.2 가 MVP 범위로 명시했으나 기존 구현엔 수단이 없었다. */
  onMove: (key: string, direction: 'up' | 'down') => void
  /** H-E: 편집 잠금·권한 없음 상태에서는 선택 외 조작(순서 이동)이 불가능해야 한다. */
  canEdit: boolean
}) {
  return (
    <section aria-label="밴드 캔버스" style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>밴드 캔버스</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          머리말 · 본문 · 맺음말 순서로 문서가 렌더됩니다.
        </p>
      </div>
      {bands.map((band) => (
        <div key={band.key} style={{ border: '1px solid var(--color-neutral-300)', borderRadius: 6, padding: 10 }}>
          <strong>{BAND_KIND_LABEL[band.kind]}</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {band.elements.map((element, index) => (
              <div
                key={element.key}
                style={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <button
                  type="button"
                  data-testid={`template-element-${element.key}`}
                  data-template-key={element.key}
                  aria-pressed={selectedKey === element.key}
                  onClick={() => onSelect(element.key)}
                  style={{
                    padding: '8px 10px',
                    border: selectedKey === element.key ? '2px solid var(--color-brand-600)' : '1px solid var(--color-neutral-300)',
                    borderRadius: 4,
                    background: selectedKey === element.key ? 'var(--color-brand-50)' : 'white',
                  }}
                >
                  {ELEMENT_TYPE_LABEL[element.type]}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || index === 0}
                  aria-label={`${ELEMENT_TYPE_LABEL[element.type]} 앞으로 이동`}
                  onClick={() => onMove(element.key, 'up')}
                >
                  ▲
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || index === band.elements.length - 1}
                  aria-label={`${ELEMENT_TYPE_LABEL[element.type]} 뒤로 이동`}
                  onClick={() => onMove(element.key, 'down')}
                >
                  ▼
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
