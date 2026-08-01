/**
 * 여러 전표 행 입력 화면이 공유하는 자동 빈행 계약.
 *
 * <p>화면별 행 타입과 빈행 생성은 각 화면에 남기고, 마지막 행 판정·저장 필터·최소 행
 * 보장만 공통화해 판매전표의 동작을 기준으로 유지한다.
 */

export function appendBlankRowIfLastChanged<T>(
  rows: readonly T[],
  before: T,
  after: T,
  getId: (row: T) => string,
  emptyRow: () => T,
  isContentEqual: (a: T, b: T) => boolean,
): T[] {
  const next = rows.map((row) => (getId(row) === getId(after) ? after : row))
  if (rows.length === 0 || getId(rows[rows.length - 1]!) !== getId(after)) return next
  if (isContentEqual(before, after)) return next
  return [...next, emptyRow()]
}

export function filterMeaningfulRows<T>(rows: readonly T[], isMeaningful: (row: T) => boolean): T[] {
  return rows.filter(isMeaningful)
}

export function removeLinePreservingMinimum<T>(
  rows: readonly T[],
  id: string,
  getId: (row: T) => string,
  emptyRow: () => T,
  minimumRows: number,
): T[] {
  const next = rows.filter((row) => getId(row) !== id)
  while (next.length < minimumRows) next.push(emptyRow())
  return next
}
