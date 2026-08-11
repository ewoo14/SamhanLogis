import { safeActorName } from '@samhan/design-system'

/** UUID 형태의 createdBy 는 화면에 그대로 노출하지 않는다. */
export function maskCreatedBy(value: string | null | undefined): string {
  const displayName = safeActorName(value)
  if (displayName === '시스템' || !value) return '시스템'
  return '사용자'
}
