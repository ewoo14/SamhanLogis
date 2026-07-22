/**
 * 결재 문서 양식 compiler와 PrintLayout adapter.
 *
 * 1단계는 template/model slot을 compiled PrintLayout props로 만들고, 2단계는
 * 기존 PrintLayout shell에 compiled body를 children으로 전달한다.
 */
import type { CSSProperties, ReactNode } from 'react'
import { PrintLayout, type PaperSize, type PrintApprovalStep, type PrintDocHeader } from './PrintLayout'
import type { ApprovalRenderModel } from './approvalRenderModel'
import { krw } from './PrintLayout'
import {
  LegacyApprovalDocBody,
  LegacyApprovalDocSection as LegacyApprovalDocSectionView,
} from './LegacyApprovalDocBody'
import type { LegacyApprovalDocSection } from './LegacyApprovalDocBody'
import {
  paperToPrintLayout,
  type BindingRef,
  type DocumentTemplate,
  type DocElement,
  type FieldElement,
  type Geometry,
  type ElementStyle,
  type DetailColumnKey,
  type DetailElement,
  type ImageElement,
  type TextElement,
  DETAIL_COLUMN_LABEL,
  isAllowedImageSource,
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
  /** DETAIL 표가 있는 v2 문서에서 인쇄 본문을 자동 높이로 분할한다. */
  hasRepeatingDetail: boolean
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
    case 'DETAIL':
    case 'IMAGE':
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

/** 반복 표는 높이가 데이터 행 수에 따라 늘어나야 하므로 absolute positioning을 쓰지 않는다. */
function detailGeometryStyle(geometry: Geometry | undefined, style: ElementStyle | undefined): CSSProperties {
  return {
    ...(geometry === undefined ? {} : {
      width: `${geometry.w}%`,
      marginLeft: `${geometry.x}%`,
      marginTop: `${geometry.y}%`,
      minHeight: `${geometry.h}%`,
    }),
    ...(style?.fontSize === undefined ? {} : { fontSize: `${style.fontSize}pt` }),
    ...(style?.bold === undefined ? {} : { fontWeight: style.bold ? 700 : 400 }),
    ...(style?.align === undefined ? {} : { textAlign: style.align }),
    ...(style?.border === undefined ? {} : { border: style.border ? '1px solid #000' : 'none' }),
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

function valueForDetailColumn(
  item: ApprovalRenderModel['body']['lineItems'][number],
  column: DetailColumnKey,
): string {
  switch (column) {
    case 'quantity':
      return item.quantity.toLocaleString('ko-KR')
    case 'supplyAmount':
      return krw(item.supplyAmount) || '-'
    case 'vatAmount':
      return krw(item.vatAmount) || '-'
    case 'lineTotal':
      return krw(item.lineTotal) || '-'
    case 'productName':
      return item.productName || '-'
    case 'modelName':
      return item.modelName || '-'
    case 'specification':
      return item.specification || '-'
    case 'note':
      return item.note || '-'
  }
}

function renderDetailElement(element: DetailElement, model: ApprovalRenderModel) {
  const rows = model.body.lineItems
  return (
    <div
      key={element.key}
      className="document-template-detail"
      data-template-detail={element.key}
      style={detailGeometryStyle(element.geometry, element.style)}
    >
      <table>
        <thead>
          <tr>
            {element.columns.map((column) => <th key={column} scope="col">{DETAIL_COLUMN_LABEL[column]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr data-template-detail-row="empty">
              <td colSpan={element.columns.length}>
                {model.body.lineItemsAvailability === 'UNAVAILABLE'
                  ? '품목 원천이 연결되지 않은 결재문서입니다.'
                  : '데이터가 없습니다.'}
              </td>
            </tr>
          ) : rows.map((item, index) => (
            <tr key={`${element.key}-${index}`} data-template-detail-row={`${index + 1}`}>
              {element.columns.map((column) => <td key={column}>{valueForDetailColumn(item, column)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderImageElement(element: ImageElement) {
  if (!isAllowedImageSource(element.src)) return null
  return (
    <img
      key={element.key}
      className="document-template-image"
      data-template-image={element.key}
      src={element.src}
      alt={element.alt}
      style={{
        ...geometryStyle(element.geometry, element.style),
        display: 'block',
        objectFit: 'contain',
      }}
    />
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
  elements: Array<FieldElement | TextElement | ImageElement>,
  model: ApprovalRenderModel,
  testId: string,
  key?: string,
  fixedBodyLayer = false,
): ReactNode {
  if (elements.length === 0) return null
  return (
    <div
      key={key}
      className="document-template-v2-elements"
      data-testid={testId}
      style={fixedBodyLayer
        ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '24mm' }
        : { position: 'relative', minHeight: '24mm' }}
    >
      {elements.map((element) => element.type === 'IMAGE'
        ? renderImageElement(element)
        : renderPositionedElement(element, model))}
    </div>
  )
}

function positionedElementsOf(elements: DocElement[]): Array<FieldElement | TextElement | ImageElement> {
  return elements.filter(
    (element): element is FieldElement | TextElement | ImageElement => element.type === 'FIELD' || element.type === 'TEXT' || element.type === 'IMAGE',
  )
}

function isGeometryPositionedElement(element: DocElement): element is FieldElement | TextElement | ImageElement {
  return (element.type === 'FIELD' || element.type === 'TEXT' || element.type === 'IMAGE')
    && element.geometry !== undefined
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
  const bodyElements = template.document.bands
    .filter((band) => band.kind === 'BODY')
    .flatMap((band) => band.elements)
  const bodyDetails = bodyElements.filter((element): element is DetailElement => element.type === 'DETAIL')

  const headerPositioned = positionedElementsOf(headerElements)
  const footerPositioned = positionedElementsOf(
    template.document.bands.filter((band) => band.kind === 'FOOTER').flatMap((band) => band.elements),
  )
  const bodyPositioned = positionedElementsOf(bodyElements).filter((element) => element.geometry !== undefined)
  const firstBodyPositionedIndex = bodyElements.findIndex(isGeometryPositionedElement)

  const docHeader: PrintDocHeader = {
    title: model.header.title,
    ...(hasMetaRows ? {
      docNo: model.header.docNo,
      ...(model.header.issueDate ? { issueDate: model.header.issueDate } : {}),
    } : {}),
  }

  const bodyChildren = bodyElements.map((element, index) => {
    if (index === firstBodyPositionedIndex) {
      return positionedElementLayer(
        bodyPositioned,
        model,
        'document-template-v2-elements-body',
        'document-template-v2-elements-body',
        true,
      )
    }
    const section = sectionForElement(element, model)
    if (section) {
      return <LegacyApprovalDocSectionView key={element.key} section={section} />
    }
    if (element.type === 'DETAIL') {
      return (
        <div key={element.key} className="document-template-detail-layer" data-testid="document-template-detail-layer">
          {renderDetailElement(element, model)}
        </div>
      )
    }
    if (element.type === 'FIELD' || element.type === 'TEXT' || element.type === 'IMAGE') {
      return element.geometry !== undefined
        ? null
        : element.type === 'IMAGE'
        ? renderImageElement(element)
        : renderPositionedElement(element, model)
    }
    return null
  }).filter((child) => child !== null)

  return {
    paper: paperToPrintLayout(template.document.paper),
    docHeader,
    approvalSteps: hasApprovalGrid ? model.approvalSteps : [],
    closingNote: model.closing.note,
    // BODY flow는 band의 원래 element 순서를 유지한다. geometry 요소만 선언상 첫 위치에
    // 하나의 고정 24mm absolute layer로 모아, legacy/DETAIL의 가변 높이가 % 좌표 원점이 되지 않게 한다.
    body: <LegacyApprovalDocBody positionedLayer={bodyPositioned.length > 0}>{bodyChildren}</LegacyApprovalDocBody>,
    headerExtra: positionedElementLayer(headerPositioned, model, 'document-template-v2-elements-header'),
    footerExtra: positionedElementLayer(footerPositioned, model, 'document-template-v2-elements-footer'),
    hasRepeatingDetail: bodyDetails.length > 0,
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
      hasRepeatingDetail={compiled.hasRepeatingDetail}
    >
      {compiled.body}
    </PrintLayout>
  )
}
