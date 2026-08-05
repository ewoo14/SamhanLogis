/** 저장 경계를 통과할 수 있는 견적 규격 provenance 표현. */
export type EstimateSpecificationSource = 'CATALOG' | 'USER' | null

// BE 계약/DB 변경 없이 자동 규격만 표시하는 zero-width marker.
// 화면과 coedit의 표시 값에는 절대 포함하지 않는다.
const CATALOG_MARKER = '\u2060'

export function encodeEstimateSpecification(
  specification: string,
  source: EstimateSpecificationSource,
): string {
  if (source !== 'CATALOG' || !specification.trim()) return specification
  return `${CATALOG_MARKER}${specification}`
}

export function decodeEstimateSpecification(specification: string | null | undefined): {
  value: string
  source: EstimateSpecificationSource
} {
  const raw = specification ?? ''
  if (raw.startsWith(CATALOG_MARKER)) {
    return { value: raw.slice(CATALOG_MARKER.length), source: 'CATALOG' }
  }
  return { value: raw, source: raw.trim() ? 'USER' : null }
}
