// UUID v1~v8 및 nil UUID까지 variant 제약 없이 마스킹한다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID 형태의 createdBy 는 화면에 그대로 노출하지 않는다. */
export function maskCreatedBy(value: string | null | undefined): string {
  if (!value) return 'system'
  return UUID_PATTERN.test(value) ? '사용자' : value
}
