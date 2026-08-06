/**
 * 배차 화면에서 선택한 행을 카카오톡 붙여넣기용 TSV로 직렬화한다.
 *
 * 레거시 규칙을 따라 행은 줄바꿈, 열은 탭으로 구분한다. 화면에 실제로
 * 제공되는 배차 대상 표현만 포함하며 전화번호·UUID는 복사 데이터에 넣지 않는다.
 */
export interface DispatchSmsClipboardRow {
  id: string
  partnerName: string
  slipNo: string
  message: string
  chatRoomName: string
}

/**
 * 화면·편집·선택 복사가 공유하는 전표별 업무 key.
 *
 * <p>partnerCode는 같은 거래처의 여러 전표에서 반복될 수 있으므로 key로 사용하지 않는다.
 * slipNo는 사용자 노출이 허용된 전표 식별 코드이며, 한 미리보기 안에서 전표별로 유일하다.
 */
export function getDispatchSmsRowKey(row: { partnerCode?: string | null; slipNo: string }): string {
  return row.slipNo
}

/**
 * 선택된 행만 거래처명, 전표번호, 코멘트, 단톡방 순서로 복사할 문자열을 만든다.
 *
 * @param rows 화면에 표시된 배차 대상 행
 * @param selectedIds 사용자가 선택한 행 식별자 집합
 * @return 선택 행이 없으면 빈 문자열, 있으면 TSV 문자열
 */
export function buildDispatchSmsClipboardText(
  rows: DispatchSmsClipboardRow[],
  selectedIds: ReadonlySet<string>,
): string {
  return rows
    .filter((row) => selectedIds.has(row.id))
    .map((row) => [row.partnerName, row.slipNo, row.message, row.chatRoomName].join('\t'))
    .join('\n')
}
