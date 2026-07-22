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
  /** HEADER 밴드에 배치된 FIELD/TEXT 요소 — 없으면 undefined(빈 공간 미예약, G3). */
  headerExtra?: ReactNode
  /** FOOTER 밴드에 배치된 FIELD/TEXT 요소 — 없으면 undefined(빈 공간 미예약, G3). */
  footerExtra?: ReactNode
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

/**
 * 밴드 소속 FIELD/TEXT 요소를 하나의 relative 컨테이너에 렌더한다.
 *
 * M-F: 과거에는 전 밴드의 FIELD/TEXT 를 하나로 합쳐 BODY 뒤에 고정 40mm 스트립으로 그렸다 — 요소의
 * geometry(x/y/w/h, 밴드 상대 %)가 실제로는 "합쳐진 전역 스트립" 기준으로 해석되어 spec §4.1 의
 * "밴드 상대 박스" 좌표계와 어긋났고, HEADER/FOOTER 요소도 전부 BODY 뒤에 그려졌다. 이제 밴드별로
 * 분리해 호출하므로 geometry 는 실제로 자신이 속한 밴드 기준으로 해석된다. 요소가 없으면 null 을
 * 반환해 빈 공간을 예약하지 않는다.
 */
function positionedElementLayer(
  elements: Array<FieldElement | TextElement>,
  model: ApprovalRenderModel,
  testId: string,
): ReactNode {
  if (elements.length === 0) return null
  return (
    <div
      className="document-template-v2-elements"
      data-testid={testId}
      style={{ position: 'relative', minHeight: '24mm' }}
    >
      {elements.map((element) => renderPositionedElement(element, model))}
    </div>
  )
}

function positionedElementsOf(elements: DocElement[]): Array<FieldElement | TextElement> {
  return elements.filter(
    (element): element is FieldElement | TextElement => element.type === 'FIELD' || element.type === 'TEXT',
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

  const headerPositioned = positionedElementsOf(headerElements)
  const bodyPositioned = positionedElementsOf(
    template.document.bands.filter((band) => band.kind === 'BODY').flatMap((band) => band.elements),
  )
  const footerPositioned = positionedElementsOf(
    template.document.bands.filter((band) => band.kind === 'FOOTER').flatMap((band) => band.elements),
  )

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
    // BODY FIELD/TEXT 는 legacy 섹션과 형제로 렌더한다 — `approval-doc-print-content` 래퍼를
    // LegacyApprovalDocBody 가 이미 정확히 한 번 출력하므로(그 컴포넌트 자체 계약) 여기서 다시
    // 감싸지 않는다(중복 wrapper 금지, LegacyApprovalDocBody.tsx 상단 주석 참고).
    body: (
      <>
        <LegacyApprovalDocBody orderedSections={bodySections} />
        {positionedElementLayer(bodyPositioned, model, 'document-template-v2-elements-body')}
      </>
    ),
    headerExtra: positionedElementLayer(headerPositioned, model, 'document-template-v2-elements-header'),
    footerExtra: positionedElementLayer(footerPositioned, model, 'document-template-v2-elements-footer'),
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
      headerExtra={compiled.headerExtra}
      footerExtra={compiled.footerExtra}
    >
      {compiled.body}
    </PrintLayout>
  )
}
