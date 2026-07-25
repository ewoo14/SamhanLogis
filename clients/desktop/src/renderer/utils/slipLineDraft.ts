/**
 * 전표 라인 입력 상태 판정 — #902 R2 8건 결함 리뷰(OPUS+SOL 적대검증)의 근본원인 정정.
 *
 * <p>근본원인: 종전에는 안내(제외 고지)·자동 증식 판정을 `touchedLineIds`(사용자가 어떤
 * 셀이든 한 번이라도 onChange 시킨 행 id 의 이력 Set)로 했다. 이력은 "행에 지금 무엇이
 * 들어있는가"와 무관해 두 가지로 어긋난다.
 * <ul>
 *   <li>값을 원복해도 이력은 지워지지 않아 안내가 영구히 남는다(D1) — 행을 삭제해야만 사라짐.</li>
 *   <li>화면상 아무 것도 바뀌지 않는 제스처(단가 셀 Backspace 1회 등, LineRow 가 빈 값도
 *       '0'으로 되돌려 표시하는 폴백과 충돌)도 "입력함"으로 오판해 안내·증식을 유발한다(D2).</li>
 * </ul>
 *
 * <p>아래 함수는 전부 "현재 라인 내용"만의 순수 함수다 — 이력을 남기지 않는다. 저장 판정
 * 공식(`productId && Number(quantity) > 0`)은 기획 동결 대상이라 이 파일이 바꾸지 않고,
 * {@link willLineBeSaved} 는 그 공식을 그대로 반영해 SlipFormPage 의 안내/집계 로직과
 * 단일 진실원을 이루기 위한 헬퍼일 뿐이다 — SlipFormPage 의 payload 필터/합계/저장 가능
 * 여부 계산부는 이 파일을 참조하지 않고 기존 식을 그대로 유지한다(무회귀 확증 구간 보존).
 *
 * <p>#902 R3 추가 정정(2차 적대검증 CODEX SOL 도달가능 결함 S1·S2·S3·S4): 위 "표시상 동일"
 * 판정 자체가 실제 화면 표시와 어긋나는 하위 결함 4건이 나왔다 — 공통 뿌리는 이 판정이
 * `Number()` 로 접는데 화면(LineRow.tsx)은 원문 문자열(S1: "01") 또는 Number() 변환 결과
 * 그대로(S3: "∞")를 보여준다는 것. 판정이 참조하는 "표시"를 화면과 일치시켜 고쳤다:
 * <ul>
 *   <li>S1(수량): 화면(`<input value={line.quantity}>`)은 원문 그대로를 보여준다 — numeric
 *       fold 없이 문자열을 직접 비교한다("01" ≠ "1").</li>
 *   <li>S2(모델명/규격): 화면엔 폭 없는 특수문자(zero-width space 등)가 빈칸과 구별되지
 *       않는다 — {@link visibleTrim} 이 그 문자들을 제거한 뒤 trim 한다.</li>
 *   <li>S3(단가): 극단적으로 긴 숫자는 Number() 가 Infinity 가 되어 화면(priceDisplay)엔
 *       "∞"로 보인다 — {@link priceDisplayValue} 가 LineRow.tsx 의 표시 폴백과 동일하게
 *       접어 non-finite 를 0 으로 뭉개지 않는다.</li>
 *   <li>S4(BUNDLE 세트 옵션): 비교 대상(ComparableLine)에 `setOptions` 가 아예 없어 옵션만
 *       바뀐 마지막 행이 자동증식되지 않았다 — {@link isSetOptionsEqual} 을 추가해 반영한다.</li>
 * </ul>
 */
import type { LineDraft } from '@samhan/design-system'

type ComparableLine = Pick<
  LineDraft,
  'productId' | 'modelName' | 'specification' | 'quantity' | 'unitPrice' | 'setOptions'
>

/**
 * 화면에 "아무 것도 안 보이는" 문자열인지 판정한다(#902 R3 S2) — 일반 공백(`trim()` 대상)뿐
 * 아니라 렌더 폭이 0 인 특수문자(zero-width space 등)도 제거한 뒤 trim 한다.
 *
 * <p>SlipFormPage 의 라인 자동 증식 안내(aria-live 재낭독, D6·H5)는 스크린리더 재낭독을
 * 위해 U+200B 를 안내 문구 자체에 의도적으로 섞어 쓴다 — 그건 화면에 보이지 않는 안내
 * 문자열의 접근성 트릭이라 이 함수와는 완전히 별개 표면이다. 여기서는 반대로, 사용자가
 * 모델명/규격 입력칸에 실수로(또는 붙여넣기로) 넣은 폭 없는 문자를 "빈칸"으로 접어, 화면은
 * 비어 보이는데 내용이 있다고 오판(유령 입력 → 안내·자동증식 오발동)하는 것을 막는다.
 */
const ZERO_WIDTH_CHARS_PATTERN = new RegExp(
  '[' + String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff) + ']',
  'g',
)

function visibleTrim(raw: string): string {
  // ZWSP(U+200B) · ZWNJ(U+200C) · ZWJ(U+200D) · WORD JOINER(U+2060) · BOM/ZWNBSP(U+FEFF).
  // 코드에 폭 없는 문자를 직접 심으면 에디터/리뷰에서 육안 확인이 불가능하므로 코드포인트를
  // 명시적으로 조립한다(가독성·감사가능성) — regex literal 에 리터럴 문자를 넣지 않는다.
  return raw.replace(ZERO_WIDTH_CHARS_PATTERN, '').trim()
}

/**
 * 단가 "표시" 문자열 — LineRow.tsx `priceDisplay`(및 SlipMobileLineCard 동등 로직)와 동일한
 * 규약으로 접는다: 빈 값은 '0', 그 외에는 `Number().toLocaleString()`(#902 R3 S3).
 *
 * <p>극단적으로 긴 숫자 문자열(자릿수 300+)은 Number() 변환 시 `Infinity` 가 되어 화면에는
 * "∞" 로 보인다(toLocaleString 규약). 종전 numericValueOf 는 non-finite 를 0 으로 접어
 * 화면은 "∞"인데 판정은 "0(pristine)과 동일"이라 어긋났다 — Number() 의 원시 결과를 그대로
 * 표시 문자열로 접어 화면과 판정을 일치시킨다.
 */
function priceDisplayValue(raw: string): string {
  return raw ? Number(raw).toLocaleString() : '0'
}

/**
 * 세트(BUNDLE) 옵션 두 스냅샷이 "표시상" 동일한지 판정한다(#902 R3 S4). 문자열 필드는 빈
 * 값/`null`/`undefined` 를, boolean 필드는 falsy 를 각각 동일하게 접어 실제 선택값 기준으로
 * 비교한다 — SINGLE 라인 등 미보유(둘 다 `undefined`)는 항상 동일하다.
 */
function isSetOptionsEqual(a: LineDraft['setOptions'], b: LineDraft['setOptions']): boolean {
  const left = a ?? {}
  const right = b ?? {}
  return (
    (left.remoteOption ?? '') === (right.remoteOption ?? '') &&
    Boolean(left.remoteExcluded) === Boolean(right.remoteExcluded) &&
    (left.panelOption ?? '') === (right.panelOption ?? '') &&
    (left.panelShape360 ?? '') === (right.panelShape360 ?? '') &&
    Boolean(left.materialIncluded) === Boolean(right.materialIncluded)
  )
}

/**
 * 새 빈 행(SlipFormPage.emptyLine())과 "표시상" 동일한지 판정한다 — 안내(H1)의 기준선.
 *
 * <p>순수하게 현재 내용만 본다 — 이 값이 지금 pristine 이면(내용이 emptyLine() 과 같으면)
 * 이력과 무관하게 안내는 뜨지 않는다. 값을 원복하면 다시 pristine 이 되어 안내가
 * 자동으로 사라진다(D1 — 행 삭제가 필요 없다).
 */
export function isLineContentPristine(line: ComparableLine): boolean {
  return (
    line.productId === null &&
    visibleTrim(line.modelName) === '' &&
    visibleTrim(line.specification) === '' &&
    // S1: 화면은 원문 그대로("01")를 보여준다 — numeric fold 없이 직접 비교한다.
    line.quantity === '1' &&
    // S3: 화면은 Number().toLocaleString() 폴백을 보여준다(non-finite→"∞" 포함).
    priceDisplayValue(line.unitPrice) === '0'
  )
}

/**
 * 두 라인 스냅샷이 "표시상" 동일한 내용인지 판정한다 — 자동 증식 트리거(H2)의 기준.
 *
 * <p>pristine 여부와 무관하다 — 이미 손댄 행이라도 이 편집으로 실제 값이 바뀌지 않았다면
 * true. 마지막 행의 자동 증식은 "이 행이 실제로 바뀌었는가"만 보고 트리거해야 한다(D2:
 * 화면이 그대로인 Backspace/쉼표 입력은 증식하지 않는다).
 */
export function isLineContentEqual(a: ComparableLine, b: ComparableLine): boolean {
  return (
    a.productId === b.productId &&
    visibleTrim(a.modelName) === visibleTrim(b.modelName) &&
    visibleTrim(a.specification) === visibleTrim(b.specification) &&
    a.quantity === b.quantity &&
    priceDisplayValue(a.unitPrice) === priceDisplayValue(b.unitPrice) &&
    isSetOptionsEqual(a.setOptions, b.setOptions)
  )
}

/**
 * 저장 판정과 항상 같은 결과를 내야 하는 헬퍼 — 안내/집계 표시 전용.
 *
 * ⚠️ SlipFormPage 의 payload 필터·합계·저장 가능 여부(`validLineCount`) 3곳은 기획
 * 동결 판정식(`productId && Number(quantity) > 0`)을 그대로 두며 이 함수를 참조하지
 * 않는다(무회귀 확증 구간 보존). 이 함수를 고치면 그 식도 같이 확인해야 한다.
 */
export function willLineBeSaved(line: Pick<LineDraft, 'productId' | 'quantity'>): boolean {
  return Boolean(line.productId) && Number(line.quantity) > 0
}

/** 저장 제외 사유 — 안내 문구 분기(H4)의 단일 진실원. */
export type LineIncompleteReason = 'NEEDS_PRODUCT' | 'NEEDS_POSITIVE_QUANTITY'

/**
 * 지금 이 행에 실제로 필요한 조치가 무엇인지 판정한다.
 *
 * <p>pristine(빈 행과 표시상 동일)이면 null — 아직 아무 것도 안 한 행에는 안내하지 않는다.
 * 그 외에는 저장 판정을 만족하면 null(완결), 아니면 진짜 원인(품목 미선택/수량 미충족)을
 * 반환한다. 품목이 없으면 수량 값과 무관하게 NEEDS_PRODUCT 다 — 품목 선택이 더 근본적인
 * 선행 조건이기 때문이다.
 */
export function lineIncompleteReason(line: ComparableLine): LineIncompleteReason | null {
  if (isLineContentPristine(line)) return null
  if (willLineBeSaved(line)) return null
  return line.productId ? 'NEEDS_POSITIVE_QUANTITY' : 'NEEDS_PRODUCT'
}
