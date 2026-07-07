/**
 * 배차 삭제행(취소선) 공용 표시/파생 유틸 — E2 기둥2.
 *
 * <p>상세 응답의 `vehicleGroups[].slips[]` 는 취소선 노출을 위해 soft-delete 행을 영구 포함한다.
 * 게이팅·카운트·정렬 등 "활성 행" 전제 소비처는 반드시 여기의 active* 파생값을 사용해야 한다
 * (`group.slips.length` 직접 사용 = 삭제행 포함 회귀).
 */
import type {
  DispatchVehicleGroupResponse,
  DispatchVehicleGroupSlipResponse,
} from '../../api/dispatchTask'
export {
  DELETED_ROW_TEXT_STYLE,
  deletedAtTooltip,
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from '../../realtime/deletedRowDisplay'

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
