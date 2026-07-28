/**
 * 결재 문서 양식 compiler와 PrintLayout adapter.
 *
 * 1단계는 template/model slot을 compiled PrintLayout props로 만들고, 2단계는
 * 기존 PrintLayout shell에 compiled body를 children으로 전달한다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
      // N-1: "값이 비어 있음"과 "참조가 잘못됨"은 렌더 모델 안에서는 구분할 수 없다(둘 다 fieldRows에
      // 없음으로 관측된다 — approvalDoc.ts의 fieldRows()가 빈 값 행을 filter로 제거하기 때문에,
      // required=false로 비어 있는 실제 필드도 "없음"과 동일하게 보인다). 이 구분은 편집기
      // ElementInspector의 hasKnownFieldBinding 경고(실제 fieldOptions 기준)가 이미 담당하므로,
      // 완성된 결재문서 지면에는 어느 쪽이든 디버그 문자열을 싣지 않고 조용히 빈 칸으로 렌더한다.
      const fieldKey = binding.slice('body.fieldRow['.length, -1)
      return model.body.fieldRows.find((field) => field.key === fieldKey)?.value ?? ''
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

/**
 * 반복 표는 높이가 데이터 행 수에 따라 늘어나야 하므로 absolute positioning을 쓰지 않는다(margin 기반
 * 오프셋 + 정상 flow — 그래서 R1(H6′)과 달리 ruler/spacer 분리 없이도 이미 "내용에 맞춰 자라고 뒤
 * flow 가 밀린다"가 항상 성립한다: DOM 위치가 그대로 정상 flow이므로 부모(및 조상)의 auto-height 가
 * 실제 렌더 높이를 그대로 반영한다).
 *
 * H7(R2) fix: `margin-top`의 %는 CSS 스펙상 containing block의 항상 "폭" 기준으로 해석된다(세로
 * 오프셋인데도) — 그대로 두면 좌표 요소(FIELD/TEXT/IMAGE, position:absolute `top:Y%`)와 다른 축을
 * 가리켜 같은 입력값이 요소 타입에 따라 다른 배율로 어긋난다. 밴드 세로 기준(24mm, `positionedElementLayer`
 * 의 ruler 와 동일 상수)을 미리 곱해 고정 mm 로 계산해 넘기면 두 요소 타입이 같은 축·같은 기준 상자를
 * 가리키게 된다.
 *
 * H9(R6) fix: `min-height: h%`는 부모(`.document-template-detail-layer`)의 높이가 auto(내용에 따라
 * 결정)라 CSS 스펙상 "이 요소가 absolutely positioned 가 아니면" percentage 가 0 으로 계산돼 지금까지
 * 완전히 무효했다(실측: h 값과 무관하게 항상 표의 natural height 그대로). 같은 24mm 기준으로 고정 mm
 * 값을 미리 계산하면 percentage 해석 자체가 필요 없어져 항상 적용된다 — H6′ 방향대로 h 는 "최소 높이"
 * 로 의미를 갖는다(내용이 더 크면 정상 flow 로 그만큼 더 자란다. 잘라내지 않는다).
 */
function detailGeometryStyle(geometry: Geometry | undefined, style: ElementStyle | undefined): CSSProperties {
  // H9(R7) fix: fontSize/align 을 일반 속성으로만 실으면 `.document-template-detail table`/`th`/`td`
  // 의 CSS 직접 선택자(font-size:9pt·text-align:left)가 상속보다 항상 이겨 무효화된다(실측 확인 —
  // computed font-size 는 style.fontSize 값과 무관하게 항상 12px 였다). CSS 변수로도 함께 실어
  // stylesheet 가 `var(--detail-*, 기본값)` 으로 참조하게 하면(global.css) 같은 우선순위 다툼이 아니라
  // "그 규칙 자체가 이 값을 쓰게" 되어 항상 반영된다.
  const cssVariables: Record<string, string> = {}
  if (style?.fontSize !== undefined) cssVariables['--detail-font-size'] = `${style.fontSize}pt`
  if (style?.align !== undefined) cssVariables['--detail-text-align'] = style.align

  return {
    ...(geometry === undefined ? {} : {
      width: `${geometry.w}%`,
      marginLeft: `${geometry.x}%`,
      marginTop: `${(geometry.y / 100) * POSITIONED_BAND_HEIGHT_MM_NUMBER}mm`,
      minHeight: `${(geometry.h / 100) * POSITIONED_BAND_HEIGHT_MM_NUMBER}mm`,
    }),
    ...cssVariables,
    ...(style?.fontSize === undefined ? {} : { fontSize: `${style.fontSize}pt` }),
    ...(style?.bold === undefined ? {} : { fontWeight: style.bold ? 700 : 400 }),
    ...(style?.align === undefined ? {} : { textAlign: style.align }),
    ...(style?.border === undefined ? {} : { border: style.border ? '1px solid #000' : 'none' }),
  } as CSSProperties
}

/**
 * N-7(Q-1) fix: `measurement=true`일 때는 `data-template-print-element`를 쓴다(IMAGE의
 * `data-template-print-image`와 같은 패턴). PositionedElementBand는 화면용 ruler와 인쇄 측정용
 * printRuler를 항상 동시에 렌더하는데, 이 둘이 같은 `data-template-element` 속성을 공유하면 실 DOM에
 * 그 key를 가진 노드가 항상 2개 존재해 `[data-template-element]` 쿼리(#869 회귀 가드가 전제하는
 * toHaveCount(1)류 단언, getByText strict mode)가 깨진다 — CI는 `-real-qa` 를 testIgnore 하므로
 * 정적으로는 안 보이지만 라이브QA가 그 하네스로 돌면 그대로 재현된다.
 */
function renderPositionedElement(element: FieldElement | TextElement, model: ApprovalRenderModel, measurement = false) {
  const text = element.type === 'TEXT' ? element.text : valueForBinding(element.binding, model)
  return (
    <div
      key={element.key}
      {...(measurement ? { 'data-template-print-element': element.key } : { 'data-template-element': element.key })}
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

/**
 * 결함3(#968 R1, 경미) fix — 라이브 재검증(968-r1fix 하네스)에서 1차 시도(position:relative+z-index만)의
 * 잔여 문제를 실측으로 발견했다: 이 경고는 `<span>`(block)이라 `position`을 무엇으로 주든 명시적
 * width가 없으면 밴드 폭 전체로 퍼진다 — z-index로 "가려짐"은 해소되지만, 이번엔 경고 자신이 같은
 * 줄의 다른 좌표 요소(예: TEXT `ANCHORTEXT좌표기준`)와 같은 자리에서 서로 다른 글자가 뒤섞여
 * 겹쳐 그려졌다(스크린샷 실측: 두 텍스트가 한 줄에 포개짐). 근본 원인은 스태킹이 아니라 **경고가
 * 이미지의 geometry 박스를 전혀 쓰지 않는다는 것**이었다.
 *
 * fix: 경고에도 실패한 IMAGE와 동일한 `geometryStyle(geometry, …)`을 적용해 좌표 요소일 때는 그
 * 이미지가 있었을 자리(x/y/w/h)에만 그려지게 한다 — 밴드 전체가 아니라 이미지 자신의 자리만
 * 차지하므로 다른 형제의 자리를 침범하지 않는다(형제 침범 0, 재실측 확인). flow 배치(geometry
 * 없음) 이미지는 `geometryStyle(undefined, …)`이 빈 객체를 반환해 기존 정상 flow 동작을 그대로
 * 유지한다(회귀 없음). `position: relative` + z-index는 이미지 자신의 자리 안에서도 형제(같은
 * Fragment의 `<img>`)보다 위에 그려지도록 유지한다 — 좌표 요소는 geometryStyle이 이미
 * `position: absolute`로 바꾸므로 이 케이스에선 absolute 형제(사진)보다 DOM 순서상 뒤에 오는 것만
 * 으로도 충분히 위에 그려지지만, flow 케이스(static 형제 없음)에서도 일관되게 명시적으로 둔다.
 */
function imageDecodeErrorNotice(elementKey: string, geometry?: Geometry) {
  return (
    <span
      className="no-print"
      role="alert"
      data-testid={`document-template-image-error-${elementKey}`}
      style={{
        ...geometryStyle(geometry, undefined),
        display: 'block',
        position: geometry === undefined ? 'relative' : 'absolute',
        zIndex: 1,
        color: 'var(--color-danger-700, #a12622)',
        fontSize: 12,
      }}
    >
      이 이미지는 현재 화면에서 표시할 수 없습니다. 인쇄 전에 이미지를 교체하고 저장하세요.
    </span>
  )
}

/**
 * C3(#968 R1 결함1 fix): `onError`만으로는 좌표 배치(FIELD/TEXT/IMAGE 밴드) IMAGE의 첫 진입에서
 * 경고가 한 번도 뜨지 않았다(라이브 실측 5/5) — React가 `<img>`를 DOM에 삽입하기 전에 `src`를
 * 세팅해 data URL 디코드 실패가 그 시점에 이미 일어나고, 마운트 경로의 synthetic `onError`가 그
 * 이벤트를 못 받는다(브라우저 native error는 실제로 발생하지만 React가 놓친다 — DOM은 이미
 * `complete:true, naturalWidth:0`). `PositionedElementBand`(layout effect + ResizeObserver + 화면/
 * 인쇄 2벌 렌더) 아래라 이 순서가 항상 불리했다.
 *
 * 마운트 이후 `imgRef`로 `HTMLImageElement#decode()`를 직접 호출하면 이 레이스와 무관하게 항상
 * 정확한 답을 얻는다 — decode()는 이벤트 버블링에 기대지 않고 "이 리소스가 지금 디코드 가능한가"를
 * 그 자리에서 판정하므로, 실패가 effect 실행 이전에 이미 일어났어도(마운트 전 실패) 올바르게
 * reject된다. C1(`canDecodeImageSource`)이 저장 전 판정에 쓰는 것과 동일한 원리다 — 렌더 경로와
 * 저장 경로가 "디코드 가능성"을 같은 방식으로 묻는다. `onError`는 마운트 이후 src가 바뀌는 경로
 * (예: 인스펙터에서 직접 URL 재입력)의 즉시 반응용으로 그대로 둔다 — 두 메커니즘 모두 같은
 * `setDecodeFailed(true)`로 수렴하므로 충돌하지 않는다.
 */
function RenderedImageElement({ element, measurement = false }: { element: ImageElement; measurement?: boolean }) {
  const [decodeFailed, setDecodeFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useIsomorphicLayoutEffect(() => {
    setDecodeFailed(false)
    if (measurement) return undefined
    const img = imgRef.current
    if (!img || typeof img.decode !== 'function') return undefined
    let cancelled = false
    img.decode().then(
      () => { if (!cancelled) setDecodeFailed(false) },
      () => { if (!cancelled) setDecodeFailed(true) },
    )
    return () => { cancelled = true }
  }, [element.src, measurement])

  if (!isAllowedImageSource(element.src)) {
    return measurement ? null : imageDecodeErrorNotice(element.key, element.geometry)
  }

  return (
    <>
      <img
        ref={imgRef}
        className="document-template-image"
        {...(measurement
          ? { 'data-template-print-image': element.key }
          : { 'data-template-image': element.key })}
        src={element.src}
        alt={element.alt}
        onError={() => setDecodeFailed(true)}
        style={{
          // IMAGE는 replaced element라 글꼴/굵기/정렬이 그려지지 않는다.
          // 인스펙터도 해당 컨트롤을 숨기고, 출력에는 실제 반영 가능한 테두리만 전달한다.
          ...geometryStyle(element.geometry, element.style?.border === undefined ? undefined : { border: element.style.border }),
          display: 'block',
          objectFit: 'contain',
        }}
      />
      {decodeFailed && !measurement ? imageDecodeErrorNotice(element.key, element.geometry) : null}
    </>
  )
}

function renderImageElement(element: ImageElement, measurement = false) {
  return <RenderedImageElement key={element.key} element={element} measurement={measurement} />
}

/** % geometry 좌표계의 기준(ruler) 높이(mm). H1 — 절대 변경 금지: 바뀌면 저장된 모든 geometry 값의
 * 의미가 바뀐다. DETAIL(H7 R2/R6)도 같은 상수로 y/h 를 고정 mm 로 미리 계산해 좌표 요소와 같은
 * 축·기준 상자를 가리키게 한다(`detailGeometryStyle`). */
const POSITIONED_BAND_HEIGHT_MM_NUMBER = 24
const POSITIONED_BAND_RULER_HEIGHT = `${POSITIONED_BAND_HEIGHT_MM_NUMBER}mm`
/** ruler 실측이 실제 초과인지 sub-pixel 잡음인지 가르는 문턱값(px). */
const OVERFLOW_NOISE_FLOOR_PX = 0.5
/** 실제 초과가 있을 때 rounding 으로 인한 `elRect.bottom > layerRect.bottom` false-RED 를 막는 여유(px). */
const OVERFLOW_SAFETY_MARGIN_PX = 1
/** N-7(Q-1): 화면(실제) 사본과 인쇄 측정 사본 양쪽 모두를 실측 대상으로 잡는 선택자. 화면/인쇄
 * ruler 각각에서 실제 그 subtree 에 존재하는 속성만 매칭되므로(printRuler 에는 print-* 속성만,
 * ruler 에는 비-print 속성만 존재) 하나로 공유해도 서로 침범하지 않는다 — 상수 하나로 관리해
 * FIELD/TEXT(`data-template-print-element`)와 IMAGE(`data-template-print-image`)가 항상 함께 갱신된다. */
const POSITIONED_NODE_SELECTOR = '[data-template-element], [data-template-image], [data-template-print-image], [data-template-print-element]'

/**
 * SSR(`renderToStaticMarkup`)은 `useLayoutEffect` 사용 시 "does nothing on the server" 경고를 낸다.
 * DocumentRenderer 는 vitest 단위 테스트(environment:'node', DOM 없음)에서 대량으로 SSR 렌더되므로,
 * window 가 없는 동안은 useEffect 로 대체한다 — 두 환경 모두 어차피 effect 자체는 실행되지 않으므로
 * (SSR 은 commit 단계가 없다) 동작 차이는 없고 경고만 사라진다. window 존재 여부는 프로세스 수명 내내
 * 불변이라 렌더마다 같은 훅이 선택되어 rules-of-hooks 를 어기지 않는다.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface PositionedElementBandProps {
  elements: Array<FieldElement | TextElement | ImageElement>
  model: ApprovalRenderModel
  testId: string
}

/**
 * FIELD/TEXT/IMAGE 좌표 요소 밴드 — H6′(가변 밴드) + H2(원점 불변)를 동시에 만족시키는 핵심.
 *
 * 개발책임자 결정(2026-07-23): 내용이 밴드를 넘치면 "잘라내지도 덮지도 않고, 밴드가 내용에 맞게
 * 자라며 뒤 flow 가 밀린다". 그런데 밴드를 그냥 내용에 맞춰 늘리면 % 좌표의 기준(밴드 높이)이 내용에
 * 따라 변해 원점이 흔들린다(라운드 2 회귀) — "좌표를 재는 자"와 "자리를 차지하는 상자"를 분리해야
 * 두 요구가 동시에 성립한다.
 *
 * - ruler(내부, 항상 고정 24mm): position:absolute 자식들의 containing block. 내용과 무관하게
 *   불변이므로 저장된 % 좌표는 항상 같은 기준점을 가리킨다(H2). 자식이 넘쳐도 ruler 자신의
 *   layout box 는 절대 자라지 않는다(fixed height — position:absolute 자식은 애초에 어느 조상의
 *   auto height 에도 기여하지 않는다).
 * - overflow spacer(ruler의 형제, ruler의 자식이 아님): 실측한 자식들의 최대 bottom 이 ruler 높이를
 *   넘는 만큼만 별도로 flow 공간을 예약한다. ruler 의 자식이 아니므로 이 spacer 가 커져도 ruler 의
 *   containing block 높이는 전혀 바뀌지 않는다 — 순환 의존이 생기지 않는다.
 * - 바깥(testid) div: ruler + spacer 를 담는 flow 컨테이너. 실제 렌더 높이 = 24mm(+초과분) 이며,
 *   이 값이 BODY grid/HEADER·FOOTER flex 의 자연스러운 auto-size 로 뒤 형제(legacy 섹션·구분선·
 *   맺음말)를 밀어낸다 — 새 CSS 규칙을 만들 필요 없이 기존 flow 배치가 그대로 해결한다.
 *
 * 요소 수와 무관하게 밴드당 하나의 ruler/spacer만 존재한다(H4) — 여러 요소 중 가장 많이 넘친
 * 요소 기준으로 한 번만 예약한다.
 */
function PositionedElementBand({ elements, model, testId }: PositionedElementBandProps) {
  const rulerRef = useRef<HTMLDivElement | null>(null)
  const printRulerRef = useRef<HTMLDivElement | null>(null)
  const [screenOverflowPx, setScreenOverflowPx] = useState(0)
  const [printOverflowPx, setPrintOverflowPx] = useState(0)
  // 좌표/스타일/실 렌더 문자열(TEXT 원문, FIELD 바인딩 결과, IMAGE src)이 바뀔 때만 재측정하면
  // 충분하다 — 매 렌더 재측정은 낭비이고, 반대로 이 신호들을 빠뜨리면 내용이 바뀌어도 재측정을
  // 건너뛰어 밴드가 낡은 높이로 남는다.
  const contentSignature = JSON.stringify(elements.map((element) => ({
    key: element.key,
    geometry: element.geometry,
    style: element.style,
    content: element.type === 'TEXT'
      ? element.text
      : element.type === 'IMAGE'
      ? element.src
      : valueForBinding(element.binding, model),
  })))

  const recomputeOverflow = (ruler: HTMLDivElement, setOverflow: (value: number | ((previous: number) => number)) => void) => {
    const rulerRect = ruler.getBoundingClientRect()
    let maxBottom = 0
    ruler.querySelectorAll(POSITIONED_NODE_SELECTOR).forEach((node) => {
      const bottom = node.getBoundingClientRect().bottom - rulerRect.top
      if (bottom > maxBottom) maxBottom = bottom
    })
    const rawOverflow = maxBottom - rulerRect.height
    const nextOverflow = rawOverflow > OVERFLOW_NOISE_FLOOR_PX ? rawOverflow + OVERFLOW_SAFETY_MARGIN_PX : 0
    setOverflow((previous) => Math.abs(previous - nextOverflow) < OVERFLOW_NOISE_FLOOR_PX ? previous : nextOverflow)
  }

  useIsomorphicLayoutEffect(() => {
    const ruler = rulerRef.current
    const printRuler = printRulerRef.current
    if (!ruler || !printRuler) return undefined
    const recompute = () => {
      recomputeOverflow(ruler, setScreenOverflowPx)
      recomputeOverflow(printRuler, setPrintOverflowPx)
    }
    recompute()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(recompute)
    observer.observe(ruler)
    observer.observe(printRuler)
    ruler.querySelectorAll(POSITIONED_NODE_SELECTOR).forEach((node) => observer.observe(node))
    printRuler.querySelectorAll(POSITIONED_NODE_SELECTOR).forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [contentSignature])

  const renderElements = (measurement = false) => elements.map((element) => element.type === 'IMAGE'
    ? renderImageElement(element, measurement)
    : renderPositionedElement(element, model, measurement))

  return (
    <div
      className="document-template-v2-elements"
      data-testid={testId}
      style={{ position: 'relative', minHeight: POSITIONED_BAND_RULER_HEIGHT }}
    >
      <div
        ref={rulerRef}
        className="document-template-v2-elements-ruler"
        style={{ position: 'relative', height: POSITIONED_BAND_RULER_HEIGHT }}
      >
        {renderElements()}
      </div>
      {screenOverflowPx > 0 ? (
        <div
          aria-hidden="true"
          data-testid={`${testId}-overflow-spacer`}
          className="document-template-v2-elements-screen-overflow-spacer"
          style={{ height: `${screenOverflowPx}px` }}
        />
      ) : null}
      {printOverflowPx > 0 ? (
        <div
          aria-hidden="true"
          data-testid={`${testId}-print-overflow-spacer`}
          className="document-template-v2-elements-print-overflow-spacer"
          style={{ height: `${printOverflowPx}px` }}
        />
      ) : null}
      <div
        ref={printRulerRef}
        aria-hidden="true"
        className="document-template-v2-elements-print-measure"
        style={{ position: 'absolute', left: 0, top: 0, width: 'calc(210mm - 24mm - 2px)', height: POSITIONED_BAND_RULER_HEIGHT }}
      >
        <div style={{ position: 'relative', height: POSITIONED_BAND_RULER_HEIGHT }}>
          {renderElements(true)}
        </div>
      </div>
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
  elements: Array<FieldElement | TextElement | ImageElement>,
  model: ApprovalRenderModel,
  testId: string,
  key?: string,
): ReactNode {
  if (elements.length === 0) return null
  return <PositionedElementBand key={key} elements={elements} model={model} testId={testId} />
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
    // 하나의 고정 24mm flow layer로 모아, legacy/DETAIL의 가변 높이가 % 좌표 원점이 되지 않게 한다.
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
