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
 * 삭제행 텍스트 스타일 — 앱 공통 '취소' 표현(콜랩 패널·RedlineCell)과 동일한
 * 취소선 + 중립 회색. 컨테이너 opacity 페이드는 쓰지 않는다(활성 [복원] 버튼까지
 * 비활성처럼 보이게 함). 색은 neutral-600 — 삭제행이 실제 렌더되는 배경(그룹 삭제는
 * BE requireDraftTask 로 DRAFT 한정이라 항상 neutral-100 헤더 배경 4.23:1)에서
 * neutral-500 은 WCAG AA(일반 텍스트 4.5:1) 미달이라, 전 배경서 통과하는 neutral-600
 * (최악 배경서도 6.58:1)으로 상향한다.
 */
export const DELETED_ROW_TEXT_STYLE: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--color-neutral-600)',
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

/** 삭제 배지의 접근성 라벨 — hover title 에만 의존하지 않고 삭제 시각을 보조기술에 제공한다. */
export function deletedBadgeAriaLabel(
  deletedByName: string | null | undefined,
  deletedAt: string | null | undefined,
): string {
  const label = deletedBadgeLabel(deletedByName)
  const tooltip = deletedAtTooltip(deletedAt)
  return tooltip ? `${label} · ${tooltip}` : label
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
