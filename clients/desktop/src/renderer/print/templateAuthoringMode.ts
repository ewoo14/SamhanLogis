/** 문서 양식 저작 방식의 공통 계약. */
export const TEMPLATE_AUTHORING_MODES = ['WORD', 'EXCEL'] as const

export type TemplateAuthoringMode = (typeof TEMPLATE_AUTHORING_MODES)[number]

/** 다음 슬라이스에서 선택 UI에 사용할 사용자 표시 라벨. */
export const TEMPLATE_AUTHORING_MODE_LABEL: Record<TemplateAuthoringMode, string> = {
  WORD: '워드 방식',
  EXCEL: '엑셀 방식',
}

/** mode가 없던 기존 양식은 현재 renderer와 같은 WORD 방식으로 읽는다. */
export const DEFAULT_TEMPLATE_AUTHORING_MODE: TemplateAuthoringMode = 'WORD'

/** 저장된 값이 없거나 계약 밖이면 안전한 legacy 기본값으로 수렴한다. */
export function normalizeTemplateAuthoringMode(value: unknown): TemplateAuthoringMode {
  return value === 'WORD' || value === 'EXCEL' ? value : DEFAULT_TEMPLATE_AUTHORING_MODE
}
