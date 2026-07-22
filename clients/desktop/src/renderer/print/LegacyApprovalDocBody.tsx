/**
 * 기존 결재 문서 본문 3섹션의 production projection.
 *
 * `PrintLayout`과 함께 출력 DOM을 유지하기 위한 컴포넌트이며, 바깥 div는
 * 정확히 한 번만 렌더한다. frozen 오라클은 이 파일을 공유하지 않는다.
 */
import { Fragment, type ReactNode } from 'react'
import type { ApprovalRenderAttachment, ApprovalRenderFieldRow } from './approvalRenderModel'

export type LegacyApprovalDocSection =
  | { type: 'CONTENT_PARAGRAPHS'; paragraphs: string[] }
  | { type: 'FIELD_TABLE'; fieldRows: ApprovalRenderFieldRow[] }
  | { type: 'ATTACHMENT_TABLE'; attachments: ApprovalRenderAttachment[] }

export interface LegacyApprovalDocBodyProps {
  orderedSections?: LegacyApprovalDocSection[]
  children?: ReactNode
  /** BODY positioned layer의 absolute 좌표 원점이 될 body flow 컨테이너를 활성화한다. */
  positionedLayer?: boolean
}

function renderSection(section: LegacyApprovalDocSection): React.ReactNode {
  switch (section.type) {
    case 'CONTENT_PARAGRAPHS':
      return section.paragraphs.length > 0 ? (
        <section aria-label="결재문서 내용" style={{ display: 'grid', gap: '2mm' }}>
          {section.paragraphs.map((paragraph, index) => (
            <p
              key={`${index}-${paragraph.slice(0, 16)}`}
              style={{ margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {paragraph}
            </p>
          ))}
        </section>
      ) : null
    case 'FIELD_TABLE':
      return section.fieldRows.length > 0 ? (
        <section aria-label="결재문서 세부 필드">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              {section.fieldRows.map((field, index) => (
                <tr key={`${index}-${field.label}`}>
                  <th
                    scope="row"
                    style={{
                      width: '32mm',
                      padding: '2mm',
                      border: '1px solid #000',
                      background: '#F4F5F7',
                      textAlign: 'left',
                      fontWeight: 700,
                    }}
                  >
                    {field.label}
                  </th>
                  <td
                    style={{
                      padding: '2mm',
                      border: '1px solid #000',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {field.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null
    case 'ATTACHMENT_TABLE':
      return section.attachments.length > 0 ? (
        <section aria-label="결재문서 첨부">
          <h2 style={{ margin: '0 0 2mm', fontSize: '11pt' }}>첨부</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '30mm', padding: '2mm', border: '1px solid #000', background: '#F4F5F7' }}>
                  유형
                </th>
                <th style={{ padding: '2mm', border: '1px solid #000', background: '#F4F5F7' }}>
                  문서
                </th>
                <th style={{ width: '58mm', padding: '2mm', border: '1px solid #000', background: '#F4F5F7' }}>
                  참조
                </th>
              </tr>
            </thead>
            <tbody>
              {section.attachments.map((attachment, index) => (
                <tr key={`${index}-${attachment.title}`}>
                  <td style={{ padding: '2mm', border: '1px solid #000' }}>
                    {attachment.typeLabel}
                  </td>
                  <td style={{ padding: '2mm', border: '1px solid #000', overflowWrap: 'anywhere' }}>
                    {attachment.title}
                  </td>
                  <td style={{ padding: '2mm', border: '1px solid #000', overflowWrap: 'anywhere' }}>
                    {attachment.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null
  }
}

/** legacy section 하나를 외부 body element 사이의 원래 위치에 렌더한다. */
export function LegacyApprovalDocSection({ section }: { section: LegacyApprovalDocSection }) {
  return renderSection(section)
}

/** 기존 본문 외곽 div를 정확히 한 번 출력한다. */
export function LegacyApprovalDocBody({ orderedSections = [], children, positionedLayer = false }: LegacyApprovalDocBodyProps) {
  return (
    <div
      className="approval-doc-print-content"
      style={{
        display: 'grid',
        gap: '5mm',
        color: '#000',
        fontSize: '10pt',
        ...(positionedLayer ? { position: 'relative' } : {}),
      }}
    >
      {children ?? orderedSections.map((section, index) => (
        <Fragment key={`${section.type}-${index}`}>
          {renderSection(section)}
        </Fragment>
      ))}
    </div>
  )
}
