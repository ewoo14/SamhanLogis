/**
 * 거래처 삭제행(취소선) 공용 표시/파생 유틸 — E2.
 */
import type { CSSProperties } from 'react'
import { safeActorName } from '@samhan/design-system'

/** 삭제행 텍스트 스타일 — 배차 취소선 표시와 동일 톤. */
export const PARTNER_DELETED_ROW_TEXT_STYLE: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--color-neutral-600)',
}

/** 삭제자 배지 라벨. 표시명이 없으면 이름을 추정하지 않는다. */
export function deletedBadgeLabel(deletedByName: string | null | undefined): string {
  const displayName = safeActorName(deletedByName)
  return displayName ? `삭제: ${displayName}` : '삭제됨'
}

/** 삭제 시각 툴팁 텍스트 (KST 로캘 표기). */
export function deletedAtTooltip(deletedAt: string | null | undefined): string | undefined {
  if (!deletedAt) return undefined
  const parsed = new Date(deletedAt)
  if (Number.isNaN(parsed.getTime())) return undefined
  return `삭제 시각: ${parsed.toLocaleString('ko-KR')}`
}

/** 삭제 배지 접근성 라벨. */
export function deletedBadgeAriaLabel(
  deletedByName: string | null | undefined,
  deletedAt: string | null | undefined,
): string {
  const label = deletedBadgeLabel(deletedByName)
  const tooltip = deletedAtTooltip(deletedAt)
  return tooltip ? `${label} · ${tooltip}` : label
}
