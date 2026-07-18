/**
 * 결재 문서 양식 compiler와 PrintLayout adapter.
 *
 * 1단계는 template/model slot을 compiled PrintLayout props로 만들고, 2단계는
 * 기존 PrintLayout shell에 compiled body를 children으로 전달한다.
 */
import type { ReactNode } from 'react'
import { PrintLayout, type PaperSize, type PrintApprovalStep, type PrintDocHeader } from './PrintLayout'
import type { ApprovalRenderModel } from './approvalRenderModel'
import { LegacyApprovalDocBody, type LegacyApprovalDocSection } from './LegacyApprovalDocBody'
import { paperToPrintLayout, type DocumentTemplate, type DocElement } from './templateSchema'

export interface CompiledApprovalDocument {
  paper: PaperSize
  docHeader: PrintDocHeader
  approvalSteps: PrintApprovalStep[]
  closingNote: string
  body: ReactNode
}

export interface DocumentRendererProps {
  template: DocumentTemplate
  model: ApprovalRenderModel
  backTo?: string
}

function sectionForElement(
  element: DocElement,
  model: ApprovalRenderModel,
): LegacyApprovalDocSection | null {
  switch (element.type) {
    case 'CONTENT_PARAGRAPHS':
      return { type: element.type, paragraphs: model.body.paragraphs }
    case 'FIELD_TABLE':
      return { type: element.type, fieldRows: model.body.fieldRows }
    case 'ATTACHMENT_TABLE':
      return { type: element.type, attachments: model.body.attachments }
    case 'TITLE':
    case 'META_ROWS':
    case 'APPROVAL_GRID':
    case 'CLOSING':
      return null
  }
}

/** 템플릿 band/element 순서에 따라 PrintLayout props와 본문을 compile한다. */
export function compileApprovalDocument(
  template: DocumentTemplate,
  model: ApprovalRenderModel,
): CompiledApprovalDocument {
  const headerElements = template.document.bands
    .filter((band) => band.kind === 'HEADER')
    .flatMap((band) => band.elements)
  const hasMetaRows = headerElements.some((element) => element.type === 'META_ROWS')
  const hasApprovalGrid = headerElements.some((element) => element.type === 'APPROVAL_GRID')
  const bodySections = template.document.bands
    .filter((band) => band.kind === 'BODY')
    .flatMap((band) => band.elements)
    .map((element) => sectionForElement(element, model))
    .filter((section): section is LegacyApprovalDocSection => section !== null)

  const docHeader: PrintDocHeader = {
    title: model.header.title,
    ...(hasMetaRows ? {
      docNo: model.header.docNo,
      ...(model.header.issueDate ? { issueDate: model.header.issueDate } : {}),
    } : {}),
  }

  return {
    paper: paperToPrintLayout(template.document.paper),
    docHeader,
    approvalSteps: hasApprovalGrid ? model.approvalSteps : [],
    closingNote: model.closing.note,
    body: <LegacyApprovalDocBody orderedSections={bodySections} />,
  }
}

/** compiled document를 현 PrintLayout approvalDoc JSX에 연결한다. */
export function DocumentRenderer({ template, model, backTo }: DocumentRendererProps) {
  const compiled = compileApprovalDocument(template, model)
  return (
    <PrintLayout
      approvalDoc
      paper={compiled.paper}
      backTo={backTo}
      docHeader={compiled.docHeader}
      approvalSteps={compiled.approvalSteps}
      closingNote={compiled.closingNote}
    >
      {compiled.body}
    </PrintLayout>
  )
}
