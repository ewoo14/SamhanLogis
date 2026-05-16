const ALLOWLIST = new Set(['system'])

/** 내부 사용자 식별자는 UUID/X-User-Id 포맷 여부와 무관하게 화면에 노출하지 않는다. */
export function maskCreatedBy(value: string | null | undefined): string {
  if (!value) return 'system'
  const normalized = value.trim()
  if (ALLOWLIST.has(normalized)) return normalized
  return '사용자'
}
