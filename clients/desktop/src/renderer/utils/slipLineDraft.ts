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
 */
import type { LineDraft } from '@samhan/design-system'

type ComparableLine = Pick<
  LineDraft,
  'productId' | 'modelName' | 'specification' | 'quantity' | 'unitPrice'
>

/**
 * 문자열을 수치로 접는다 — 빈 문자열/공백/파싱 불가는 0.
 *
 * <p>단가 셀은 빈 값도 '0'으로 되돌려 표시하므로(LineRow priceDisplay 폴백), '' 와 '0' 을
 * 다른 값으로 셈하면 사용자에게는 아무 변화도 없었던 제스처(D2: 0에서 Backspace)가
 * "입력함"으로 오판된다. 이 함수는 그 표시 규약을 그대로 반영한다.
 */
function numericValueOf(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : 0
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
    line.modelName.trim() === '' &&
    line.specification.trim() === '' &&
    numericValueOf(line.quantity) === 1 &&
    numericValueOf(line.unitPrice) === 0
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
    a.modelName.trim() === b.modelName.trim() &&
    a.specification.trim() === b.specification.trim() &&
    numericValueOf(a.quantity) === numericValueOf(b.quantity) &&
    numericValueOf(a.unitPrice) === numericValueOf(b.unitPrice)
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
