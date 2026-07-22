import type { Band, DocElement } from '../../print/templateSchema'

const elementLabels: Record<DocElement['type'], string> = {
  TITLE: '제목',
  META_ROWS: '문서 정보',
  APPROVAL_GRID: '결재란',
  CONTENT_PARAGRAPHS: '본문',
  FIELD_TABLE: '필드 표',
  ATTACHMENT_TABLE: '첨부 표',
  CLOSING: '맺음말',
  FIELD: 'FIELD',
  TEXT: 'TEXT',
}

export function BandCanvas({
  bands,
  selectedKey,
  onSelect,
}: {
  bands: Band[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  return (
    <section aria-label="밴드 캔버스" style={{ display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>밴드 캔버스</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
          HEADER / BODY / FOOTER 순서로 문서가 렌더됩니다.
        </p>
      </div>
      {bands.map((band) => (
        <div key={band.key} style={{ border: '1px solid var(--color-neutral-300)', borderRadius: 6, padding: 10 }}>
          <strong>{band.kind}</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {band.elements.map((element) => (
              <button
                type="button"
                key={element.key}
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
                {elementLabels[element.type]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
