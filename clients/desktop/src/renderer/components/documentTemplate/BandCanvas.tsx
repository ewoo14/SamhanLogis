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
    <section className="document-template-band-canvas" aria-label="밴드 캔버스" style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>밴드 캔버스</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          머리말 · 본문 · 맺음말 순서로 문서가 렌더됩니다.
        </p>
      </div>
      {bands.map((band) => (
        <div className="document-template-band" key={band.key}>
          <div className="document-template-band-header">
            <strong className="document-template-band-label">{BAND_KIND_LABEL[band.kind]}</strong>
            <span className="document-template-band-count">요소 {band.elements.length}개</span>
          </div>
          <div className="document-template-band-elements">
            {band.elements.map((element, index) => (
              <div className={`document-template-element-row${selectedKey === element.key ? ' document-template-element-row--selected' : ''}`} key={element.key}>
                <button
                  type="button"
                  className="document-template-element-button"
                  data-testid={`template-element-${element.key}`}
                  data-template-key={element.key}
                  aria-pressed={selectedKey === element.key}
                  aria-label={`${ELEMENT_TYPE_LABEL[element.type]} 요소 key: ${element.key}`}
                  onClick={() => onSelect(element.key)}
                >
                  {ELEMENT_TYPE_LABEL[element.type]}
                </button>
                <code className="document-template-element-key">요소 key: {element.key}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || index === 0}
                  aria-label={`${ELEMENT_TYPE_LABEL[element.type]} 요소 key: ${element.key} 앞으로 이동`}
                  onClick={() => onMove(element.key, 'up')}
                >
                  ▲
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || index === band.elements.length - 1}
                  aria-label={`${ELEMENT_TYPE_LABEL[element.type]} 요소 key: ${element.key} 뒤로 이동`}
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
