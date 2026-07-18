/** 하이라이트 렌더링에 사용하는 원문 문자열 조각. */
export interface HighlightPart {
  text: string
  matched: boolean
}

/**
 * 정규식이 아닌 literal substring으로 원문을 분할한다.
 * React 자식으로 전달되는 조각이므로 HTML 문자열을 생성하지 않는다.
 */
export function splitHighlightMatches(value: string, query: string): HighlightPart[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return [{ text: value, matched: false }]

  const normalizedValue = value.toLowerCase()
  // toLowerCase가 코드유닛 길이를 바꾸는 문자(예: U+0130 İ → i̇)는 normalizedValue
  // 인덱스가 원본 value 인덱스와 어긋나 강조 경계가 오정렬된다. 이 경우 강조를
  // 생략하고 원문을 그대로 반환한다(텍스트/보안 무영향, 시각 강조만 생략).
  if (normalizedValue.length !== value.length) {
    return [{ text: value, matched: false }]
  }

  const parts: HighlightPart[] = []
  let cursor = 0

  while (cursor < value.length) {
    const matchIndex = normalizedValue.indexOf(normalizedQuery, cursor)
    if (matchIndex < 0) break
    if (matchIndex > cursor) {
      parts.push({ text: value.slice(cursor, matchIndex), matched: false })
    }
    parts.push({
      text: value.slice(matchIndex, matchIndex + normalizedQuery.length),
      matched: true,
    })
    cursor = matchIndex + normalizedQuery.length
  }

  if (cursor === 0) return [{ text: value, matched: false }]
  if (cursor < value.length) parts.push({ text: value.slice(cursor), matched: false })
  return parts
}
