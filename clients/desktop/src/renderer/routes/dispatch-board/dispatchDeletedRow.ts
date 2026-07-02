/**
 * 배차 삭제행(취소선) 공용 표시/파생 유틸 — E2 기둥2.
 *
 * <p>상세 응답의 `vehicleGroups[].slips[]` 는 취소선 노출을 위해 soft-delete 행을 영구 포함한다.
 * 게이팅·카운트·정렬 등 "활성 행" 전제 소비처는 반드시 여기의 active* 파생값을 사용해야 한다
 * (`group.slips.length` 직접 사용 = 삭제행 포함 회귀).
 */
import type { CSSProperties } from 'react'
import type {
  DispatchVehicleGroupResponse,
  DispatchVehicleGroupSlipResponse,
} from '../../api/dispatchTask'

/**
 * 삭제행 텍스트 스타일 — 앱 공통 '취소' 표현(콜랩 패널·RedlineCell)과 동일하게
 * 취소선 + neutral-500 만 사용한다. 컨테이너 opacity 페이드는 쓰지 않는다
 * (활성 [복원] 버튼까지 비활성처럼 보이게 하고 텍스트 대비가 AA 미달로 떨어짐).
 */
export const DELETED_ROW_TEXT_STYLE: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--color-neutral-500)',
}

/** 삭제자 배지 라벨. 표시명이 없으면(과거 데이터·UUID 정제) "삭제됨"만 — 이름 추정/위조 금지. */
export function deletedBadgeLabel(deletedByName: string | null | undefined): string {
  const trimmed = deletedByName?.trim()
  return trimmed ? `삭제: ${trimmed}` : '삭제됨'
}

/** 삭제 시각 툴팁 텍스트 (KST 로캘 표기). 값이 없으면 undefined — title 미노출. */
export function deletedAtTooltip(deletedAt: string | null | undefined): string | undefined {
  if (!deletedAt) return undefined
  const parsed = new Date(deletedAt)
  if (Number.isNaN(parsed.getTime())) return undefined
  return `삭제 시각: ${parsed.toLocaleString('ko-KR')}`
}

/** 그룹의 활성(비삭제) 전표 매핑. */
export function activeSlipRows(
  group: Pick<DispatchVehicleGroupResponse, 'slips'>,
): DispatchVehicleGroupSlipResponse[] {
  return group.slips.filter((row) => row.isDeleted !== true)
}

/** 활성(비삭제) 차량 그룹. */
export function activeVehicleGroups(
  groups: DispatchVehicleGroupResponse[],
): DispatchVehicleGroupResponse[] {
  return groups.filter((group) => group.isDeleted !== true)
}
