/**
 * 결재 문서 양식 compiler와 PrintLayout adapter.
 *
 * 1단계는 template/model slot을 compiled PrintLayout props로 만들고, 2단계는
 * 기존 PrintLayout shell에 compiled body를 children으로 전달한다.
 */
import type { CSSProperties, ReactNode } from 'react'
import { PrintLayout, type PaperSize, type PrintApprovalStep, type PrintDocHeader } from './PrintLayout'
import type { ApprovalRenderModel } from './approvalRenderModel'
import { LegacyApprovalDocBody, type LegacyApprovalDocSection } from './LegacyApprovalDocBody'
import {
  paperToPrintLayout,
  type BindingRef,
  type DocumentTemplate,
  type DocElement,
  type FieldElement,
  type Geometry,
  type ElementStyle,
  type TextElement,
} from './templateSchema'

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
    case 'FIELD':
    case 'TEXT':
      return null
  }
}

function valueForBinding(binding: BindingRef, model: ApprovalRenderModel): string {
  switch (binding) {
    case 'header.title':
      return model.header.title
    case 'header.docNo':
      return model.header.docNo
    case 'header.issueDate':
      return model.header.issueDate ?? ''
    case 'closing.note':
      return model.closing.note
    default: {
      const fieldKey = binding.slice('body.fieldRow['.length, -1)
      return model.body.fieldRows.find((field) => field.label === fieldKey)?.value ?? ''
    }
  }
}

function geometryStyle(geometry: Geometry | undefined, style: ElementStyle | undefined): CSSProperties {
  return {
    ...(geometry === undefined ? {} : {
      position: 'absolute',
      left: `${geometry.x}%`,
      top: `${geometry.y}%`,
      width: `${geometry.w}%`,
      minHeight: `${geometry.h}%`,
    }),
    ...(style?.fontSize === undefined ? {} : { fontSize: `${style.fontSize}pt` }),
    ...(style?.bold === undefined ? {} : { fontWeight: style.bold ? 700 : 400 }),
    ...(style?.align === undefined ? {} : { textAlign: style.align }),
    ...(style?.border === undefined ? {} : { border: style.border ? '1px solid #000' : 'none' }),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  }
}

function renderPositionedElement(element: FieldElement | TextElement, model: ApprovalRenderModel) {
  const text = element.type === 'TEXT' ? element.text : valueForBinding(element.binding, model)
  return (
    <div
      key={element.key}
      data-template-element={element.key}
      style={geometryStyle(element.geometry, element.style)}
    >
      {text}
    </div>
  )
}

function DocumentTemplateBody({
  legacySections,
  positionedElements,
  model,
}: {
  legacySections: LegacyApprovalDocSection[]
  positionedElements: Array<FieldElement | TextElement>
  model: ApprovalRenderModel
}) {
  if (positionedElements.length === 0) {
    return <LegacyApprovalDocBody orderedSections={legacySections} />
  }
  return (
    <div className="approval-doc-print-content" style={{ display: 'grid', gap: '5mm', color: '#000', fontSize: '10pt' }}>
      <LegacyApprovalDocBody orderedSections={legacySections} />
      <div
        className="document-template-v2-elements"
        data-testid="document-template-v2-elements"
        style={{ position: 'relative', minHeight: '40mm' }}
      >
        {positionedElements.map((element) => renderPositionedElement(element, model))}
      </div>
    </div>
  )
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
  const positionedElements = template.document.bands
    .flatMap((band) => band.elements)
    .filter((element): element is FieldElement | TextElement => element.type === 'FIELD' || element.type === 'TEXT')

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
    body: positionedElements.length === 0
      ? <LegacyApprovalDocBody orderedSections={bodySections} />
      : <DocumentTemplateBody legacySections={bodySections} positionedElements={positionedElements} model={model} />,
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
