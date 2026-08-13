/**
 * DS-1 frozen 회귀 오라클.
 *
 * 🚫 절대 편집 금지: 리팩터 전 `ApprovalDocView` 본문과 `PrintLayout approvalDoc`
 * 조합을 verbatim 복사한 test/golden 생성 전용 파일이다. fetch/router를 호출하지
 * 않으며 production model이나 `LegacyApprovalDocBody`를 공유하지 않는다.
 */
import { approvalAttachmentPrintLabel } from '../../api/approvalAttachmentPresentation'
import { PrintLayout, krw } from '../PrintLayout'
import {
  attachmentDetails,
  attachmentTitle,
  buildApprovalSteps,
  buildDocHeader,
  CLOSING_NOTE,
  contentParagraphs,
  fieldRows,
} from '../approvalDoc'
import type { FrozenApprovalDocInput } from '../approvalRenderModel'

/** frozen legacy 입력 번들 — 이 파일의 계약과 JSX는 DS-1 회귀 기준으로 고정한다. */
export function FrozenApprovalDocLegacy({
  approval,
  templateFields,
  attachments: rawAttachments,
  backTo,
}: FrozenApprovalDocInput) {
  const paragraphs = contentParagraphs(approval.content)
  const fields = fieldRows(approval.fieldValues, templateFields)
  const attachments = rawAttachments
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <PrintLayout
      paper="a4-portrait"
      backTo={backTo}
      approvalDoc
      docHeader={buildDocHeader(approval)}
      approvalSteps={buildApprovalSteps(approval)}
      closingNote={CLOSING_NOTE}
    >
      <div
        className="approval-doc-print-content"
        style={{ display: 'grid', gap: '5mm', color: '#000', fontSize: '10pt' }}
      >
        {paragraphs.length > 0 ? (
          <section aria-label="결재문서 내용" style={{ display: 'grid', gap: '2mm' }}>
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${index}-${paragraph.slice(0, 16)}`}
                style={{ margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}

        {fields.length > 0 ? (
          <section aria-label="결재문서 세부 필드">
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.key}>
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
                      {field.fieldType === 'NUMBER' ? krw(field.value) || field.value : field.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {attachments.length > 0 ? (
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
                {attachments.map((attachment, index) => {
                  const details = attachmentDetails(attachment)
                  return (
                    <tr key={`${attachment.displayOrder}-${index}`}>
                      <td style={{ padding: '2mm', border: '1px solid #000' }}>
                        {approvalAttachmentPrintLabel(attachment)}
                      </td>
                      <td style={{ padding: '2mm', border: '1px solid #000', overflowWrap: 'anywhere' }}>
                        {attachmentTitle(attachment)}
                      </td>
                      <td style={{ padding: '2mm', border: '1px solid #000', overflowWrap: 'anywhere' }}>
                        {details.join(' · ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </PrintLayout>
  )
}
