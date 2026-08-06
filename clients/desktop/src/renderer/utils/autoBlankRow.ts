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

/**
 * 수정 hydrate와 협업 문서에도 입력용 trailing 빈행을 보장한다.
 * 빈행 여부는 화면 텍스트가 아니라 호출자가 주입한 확정 키로 판정한다.
 */
export function ensureTrailingBlankRow<T>(
  rows: readonly T[],
  emptyRow: () => T,
  isConfirmed: (row: T) => boolean,
): T[] {
  if (rows.length === 0) return [emptyRow()]
  const next = [...rows]
  if (isConfirmed(next[next.length - 1]!)) next.push(emptyRow())
  return next
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
  isConfirmed: (row: T) => boolean,
): T[] {
  const next = rows.filter((row) => getId(row) !== id)
  while (next.length < minimumRows) next.push(emptyRow())
  // 삭제 대상이 마지막 trailing 빈행이어도 다음 입력 경로를 끊지 않는다.
  // 최소행을 채운 뒤 판정해야 분개처럼 최소 2행인 화면도 빈행을 정확히 하나만
  // trailing으로 유지한다.
  return ensureTrailingBlankRow(next, emptyRow, isConfirmed)
}
