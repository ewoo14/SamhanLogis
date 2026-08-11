import { safeActorName } from '@samhan/design-system'

/** 내부 사용자 식별자는 UUID/X-User-Id 포맷 여부와 무관하게 화면에 노출하지 않는다. */
export function maskCreatedBy(value: string | null | undefined): string {
  const displayName = safeActorName(value)
  if (displayName === '시스템' || !value) return '시스템'
  return '사용자'
}
