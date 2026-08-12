/**
 * 싱글 세트 판넬 옵션의 공용 도메인.
 *
 * <p>EstimatePricingConfigPage와 API 정규화가 같은 서버 계약을
 * 사용하도록 한 곳에서 관리한다. 빈 문자열은 기본 판넬을 뜻한다.
 */
export const SINGLE_PANEL_OPTIONS = ['', '판넬제외', '블랙판넬', '승강판넬', '공청판넬']

/** 구성품/수량 동기화 target이 공유하는 특징 후보. */
export const COMPONENT_FEATURE_OPTIONS = {
  PANEL: ['기본', '블랙', '승강', '공청'],
  REMOTE: ['기본', '유선', '컬러'],
} as const

/** 형상은 빈 값도 유효한 선택지이며, 특징 종류와 무관하게 항상 활성이다. */
export const COMPONENT_SHAPE_OPTIONS = ['', '원형', '사각'] as const

export type ComponentOptionKind = keyof typeof COMPONENT_FEATURE_OPTIONS

export function componentOptionKindForProduct(productName: string, productCode = ''): ComponentOptionKind | null {
  const text = `${productName} ${productCode}`.toUpperCase()
  if (text.includes('판넬') || text.includes('PANEL')) return 'PANEL'
  if (text.includes('리모컨') || text.includes('REMOTE')) return 'REMOTE'
  return null
}

export type SinglePanelOption = (typeof SINGLE_PANEL_OPTIONS)[number]

export function isSinglePanelOption(value: string | null | undefined): value is SinglePanelOption {
  return typeof value === 'string' && SINGLE_PANEL_OPTIONS.includes(value)
}
