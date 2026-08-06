/**
 * 싱글 세트 판넬 옵션의 공용 도메인.
 *
 * <p>EstimatePricingConfigPage, BundleOptionRow, API 정규화가 같은 서버 계약을
 * 사용하도록 한 곳에서 관리한다. 빈 문자열은 기본 판넬을 뜻한다.
 */
export const SINGLE_PANEL_OPTIONS = ['', '판넬제외', '블랙판넬', '승강판넬', '공청판넬']

export type SinglePanelOption = (typeof SINGLE_PANEL_OPTIONS)[number]

export function isSinglePanelOption(value: string | null | undefined): value is SinglePanelOption {
  return typeof value === 'string' && SINGLE_PANEL_OPTIONS.includes(value)
}
