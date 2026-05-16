// UUID v1~v8 및 nil UUID까지 variant 제약 없이 마스킹한다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWLIST = new Set(['system'])

/** 내부 사용자 식별자는 UUID/X-User-Id 포맷 여부와 무관하게 화면에 노출하지 않는다. */
export function maskCreatedBy(value: string | null | undefined): string {
  if (!value) return 'system'
  const normalized = value.trim()
  if (ALLOWLIST.has(normalized)) return normalized
  if (UUID_PATTERN.test(normalized)) return '사용자'
  return '사용자'
}
