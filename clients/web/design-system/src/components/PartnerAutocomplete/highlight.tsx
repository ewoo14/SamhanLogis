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
