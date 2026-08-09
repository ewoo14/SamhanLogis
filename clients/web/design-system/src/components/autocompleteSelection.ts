/**
 * 자동완성 라벨에서 사용자가 입력한 검색 접두가 끝나는 위치를 찾는다.
 * 대소문자와 공백 차이는 검색이 허용하는 차이이므로 selection 경계에서도 무시한다.
 */
export function getAutocompleteSelectionStart(label: string, draft: string): number {
  const query = draft.trim().replace(/\s/g, '').toLocaleLowerCase()
  if (!query) return 0

  const normalizedLabel: string[] = []
  const originalEndIndexes: number[] = []
  for (let labelIndex = 0; labelIndex < label.length; labelIndex += 1) {
    const character = label[labelIndex]!.replace(/\s/g, '').toLocaleLowerCase()
    if (!character) continue
    normalizedLabel.push(character)
    originalEndIndexes.push(labelIndex + 1)
  }

  const matchStart = normalizedLabel.join('').indexOf(query)
  if (matchStart < 0) return 0
  return originalEndIndexes[matchStart + query.length - 1] ?? 0
}
